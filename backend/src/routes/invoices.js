const router = require('express').Router();
const { query, tx } = require('../db');
const { allow } = require('../middleware/auth');
const { round, AppError, postInvoice, postPayment, reverseSource } = require('../lib/accounting');

const today = () => new Date().toISOString().slice(0, 10);

// Calcula líneas y totales en el servidor (nunca confiar en los totales del cliente)
function computeTotals(company, items, opts) {
  const lines = (items || []).filter((i) => i.description && Number(i.qty) > 0).map((i) => {
    const qty = Number(i.qty); const price = round(i.price || 0); const discount = round(i.discount || 0);
    const rate = company.charges_itbis ? Number(i.itbis_rate ?? company.itbis_rate) : 0;
    const net = round(qty * price - discount);
    const itbis = round(net * rate / 100);
    return { product_id: i.product_id || null, description: i.description, qty, price, discount, itbis_rate: rate, itbis, total: round(net + itbis), kind: i.kind === 'good' ? 'good' : 'service' };
  });
  if (!lines.length) throw new AppError(400, 'Agrega al menos una línea');
  const subtotal = round(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const discount = round(lines.reduce((s, l) => s + l.discount, 0));
  const itbis = round(lines.reduce((s, l) => s + l.itbis, 0));
  const total = round(subtotal - discount + itbis);
  const itbisRet = round(itbis * Number(opts.itbis_retention_pct || 0) / 100);
  const isrRet = round((subtotal - discount) * Number(opts.isr_retention_pct || 0) / 100);
  return { lines, subtotal, discount, itbis, total, itbis_retained: itbisRet, isr_retained: isrRet };
}

async function loadInvoice(client, cid, id) {
  const { rows: [inv] } = await client.query(
    `SELECT i.*, c.name AS contact_name, c.tax_id AS contact_tax_id, c.id_type AS contact_id_type, c.address AS contact_address,
            c.email AS contact_email, c.phone AS contact_phone, c.payment_fee_pct AS contact_fee_pct, c.payment_fee_type AS contact_fee_type,
            r.number AS ref_number, r.ncf AS ref_ncf
       FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id LEFT JOIN invoices r ON r.id=i.ref_invoice_id
      WHERE i.id=$1 AND i.company_id=$2`, [id, cid]
  );
  if (!inv) throw new AppError(404, 'Documento no encontrado');
  const { rows: items } = await client.query('SELECT * FROM invoice_items WHERE invoice_id=$1 AND company_id=$2 ORDER BY id', [id, cid]);
  const { rows: payments } = await client.query(
    `SELECT p.*, b.name AS bank_name FROM payments p JOIN bank_accounts b ON b.id=p.bank_account_id
      WHERE p.invoice_id=$1 AND p.company_id=$2 ORDER BY p.date`, [id, cid]
  );
  return { ...inv, items, payments };
}

async function nextNumber(client, cid, docType) {
  const col = docType === 'quote' ? 'quote' : 'invoice';
  const { rows: [r] } = await client.query(
    `UPDATE companies SET next_${col}_no = next_${col}_no + 1 WHERE id=$1 RETURNING ${col}_prefix AS prefix, next_${col}_no - 1 AS n`, [cid]
  );
  return `${r.prefix}-${String(r.n).padStart(5, '0')}`;
}

// Toma el siguiente NCF de la secuencia, validando rango y vencimiento
async function takeNcf(client, cid, type, date) {
  const { rows: [s] } = await client.query(
    'SELECT * FROM ncf_sequences WHERE company_id=$1 AND ncf_type=$2 AND active FOR UPDATE', [cid, type]
  );
  if (!s) throw new AppError(400, `No hay secuencia activa para ${type}. Configúrala en Ajustes → Comprobantes`);
  if (Number(s.next_no) > Number(s.end_no)) throw new AppError(400, `La secuencia ${type} se agotó. Solicita nuevos NCF a la DGII`);
  if (s.expires_at && s.expires_at < date) throw new AppError(400, `La secuencia ${type} venció el ${s.expires_at}`);
  await client.query('UPDATE ncf_sequences SET next_no = next_no + 1 WHERE id=$1', [s.id]);
  const digits = type.startsWith('E') ? 10 : 8;
  return { ncf: `${type}${String(s.next_no).padStart(digits, '0')}`, expires_at: s.expires_at };
}

async function issue(client, req, inv) {
  const company = req.company;
  let ncf = null, ncfExp = null;
  if (company.is_formal && inv.ncf_type && inv.doc_type !== 'quote') {
    ({ ncf, expires_at: ncfExp } = await takeNcf(client, req.cid, inv.ncf_type, inv.date));
  }
  await client.query(
    `UPDATE invoices SET status='issued', ncf=$3, ncf_expires_at=$4 WHERE id=$1 AND company_id=$2`, [inv.id, req.cid, ncf, ncfExp]
  );
  if (inv.doc_type !== 'quote') {
    const { rows: items } = await client.query(
      `SELECT ii.*, p.income_account_id FROM invoice_items ii LEFT JOIN products p ON p.id=ii.product_id
        WHERE ii.invoice_id=$1 AND ii.company_id=$2`, [inv.id, req.cid]
    );
    await postInvoice(client, company, { ...inv, ncf }, items, req.user.id);
    if (inv.doc_type === 'credit_note' && inv.ref_invoice_id) {
      // la nota de crédito reduce el saldo de la factura original
      await client.query(
        `UPDATE invoices SET paid = LEAST(total, paid + $3),
           status = CASE WHEN paid + $3 >= total THEN 'paid' ELSE 'partial' END
         WHERE id=$1 AND company_id=$2`, [inv.ref_invoice_id, req.cid, round(inv.total - inv.itbis_retained - inv.isr_retained)]
      );
      await client.query(`UPDATE invoices SET status='paid', paid=total WHERE id=$1 AND company_id=$2`, [inv.id, req.cid]);
    }
  }
}

router.get('/', async (req, res) => {
  const { doc_type = 'invoice', status, q, from, to, contact_id } = req.query;
  const vals = [req.cid, doc_type]; let where = 'i.company_id=$1 AND i.doc_type=$2';
  if (status === 'open') where += ` AND i.status IN ('issued','partial')`;
  else if (status === 'overdue') where += ` AND i.status IN ('issued','partial') AND i.due_date < CURRENT_DATE`;
  else if (status) { vals.push(status); where += ` AND i.status=$${vals.length}`; }
  if (from) { vals.push(from); where += ` AND i.date >= $${vals.length}`; }
  if (to) { vals.push(to); where += ` AND i.date <= $${vals.length}`; }
  if (contact_id) { vals.push(contact_id); where += ` AND i.contact_id = $${vals.length}`; }
  if (q) { vals.push(`%${q}%`); where += ` AND (i.number ILIKE $${vals.length} OR i.ncf ILIKE $${vals.length} OR c.name ILIKE $${vals.length})`; }
  const { rows } = await query(
    `SELECT i.id, i.number, i.ncf, i.ncf_type, i.date, i.due_date, i.total, i.paid, i.status, i.itbis, i.doc_type,
            i.itbis_retained, i.isr_retained, c.name AS contact_name
       FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id WHERE ${where} ORDER BY i.date DESC, i.id DESC LIMIT 500`, vals
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  res.json(await loadInvoice({ query }, req.cid, req.params.id));
});

// Crea el documento (borrador). ctx = { cid, company, user } — el req, o el de un cobro recurrente.
async function createInvoice(client, ctx, b, extra = {}) {
  const docType = ['quote', 'credit_note'].includes(b.doc_type) ? b.doc_type : 'invoice';
  const t = computeTotals(ctx.company, b.items, b);
  if (b.contact_id) {
    const { rows } = await client.query('SELECT 1 FROM contacts WHERE id=$1 AND company_id=$2', [b.contact_id, ctx.cid]);
    if (!rows[0]) throw new AppError(400, 'Cliente inválido');
  }
  if (ctx.company.is_formal && docType !== 'quote' && ['B01', 'B14', 'B15', 'E31', 'E44', 'E45'].includes(b.ncf_type) && !b.contact_id) {
    throw new AppError(400, 'Este tipo de comprobante requiere un cliente con RNC');
  }
  const number = await nextNumber(client, ctx.cid, docType === 'quote' ? 'quote' : 'invoice');
  const { rows: [inv] } = await client.query(
    `INSERT INTO invoices (company_id, doc_type, number, ncf_type, contact_id, date, due_date, currency, income_type, payment_terms,
        subtotal, discount, itbis, itbis_retained, isr_retained, total, notes, created_by, ref_invoice_id, recurring_id, period)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
    [ctx.cid, docType, number, ctx.company.is_formal ? (b.ncf_type || null) : null, b.contact_id || null, b.date || today(),
      b.due_date || null, b.currency || ctx.company.currency, b.income_type || '01', b.payment_terms || null,
      t.subtotal, t.discount, t.itbis, t.itbis_retained, t.isr_retained, t.total, b.notes || null, ctx.user.id, b.ref_invoice_id || null,
      extra.recurring_id || null, extra.period || null]
  );
  for (const l of t.lines) {
    await client.query(
      `INSERT INTO invoice_items (company_id, invoice_id, product_id, description, qty, price, discount, itbis_rate, itbis, total, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ctx.cid, inv.id, l.product_id, l.description, l.qty, l.price, l.discount, l.itbis_rate, l.itbis, l.total, l.kind]
    );
  }
  return inv;
}

router.post('/', allow('operator'), async (req, res) => {
  const id = await tx(async (client) => {
    const inv = await createInvoice(client, req, req.body);
    if (req.body.issue) await issue(client, req, inv);
    return inv.id;
  });
  res.json(await loadInvoice({ query }, req.cid, id));
});

// Editar solo borradores
router.put('/:id', allow('operator'), async (req, res) => {
  const b = req.body;
  const id = await tx(async (client) => {
    const cur = await loadInvoice(client, req.cid, req.params.id);
    if (cur.status !== 'draft') throw new AppError(400, 'Solo se pueden editar borradores');
    const t = computeTotals(req.company, b.items, b);
    await client.query(
      `UPDATE invoices SET ncf_type=$3, contact_id=$4, date=$5, due_date=$6, income_type=$7, payment_terms=$8, subtotal=$9, discount=$10,
          itbis=$11, itbis_retained=$12, isr_retained=$13, total=$14, notes=$15 WHERE id=$1 AND company_id=$2`,
      [cur.id, req.cid, req.company.is_formal ? (b.ncf_type || null) : null, b.contact_id || null, b.date || cur.date, b.due_date || null,
        b.income_type || '01', b.payment_terms || null, t.subtotal, t.discount, t.itbis, t.itbis_retained, t.isr_retained, t.total, b.notes || null]
    );
    await client.query('DELETE FROM invoice_items WHERE invoice_id=$1 AND company_id=$2', [cur.id, req.cid]);
    for (const l of t.lines) {
      await client.query(
        `INSERT INTO invoice_items (company_id, invoice_id, product_id, description, qty, price, discount, itbis_rate, itbis, total, kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [req.cid, cur.id, l.product_id, l.description, l.qty, l.price, l.discount, l.itbis_rate, l.itbis, l.total, l.kind]
      );
    }
    if (b.issue) await issue(client, req, { ...cur, ...b, ...t, id: cur.id, doc_type: cur.doc_type, date: b.date || cur.date });
    return cur.id;
  });
  res.json(await loadInvoice({ query }, req.cid, id));
});

router.post('/:id/issue', allow('operator'), async (req, res) => {
  await tx(async (client) => {
    const inv = await loadInvoice(client, req.cid, req.params.id);
    if (inv.status !== 'draft') throw new AppError(400, 'El documento ya fue emitido');
    await issue(client, req, inv);
  });
  res.json(await loadInvoice({ query }, req.cid, req.params.id));
});

router.post('/:id/status', allow('operator'), async (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected', 'issued'].includes(status)) throw new AppError(400, 'Estado inválido');
  await query(`UPDATE invoices SET status=$3 WHERE id=$1 AND company_id=$2 AND doc_type='quote'`, [req.params.id, req.cid, status]);
  res.json(await loadInvoice({ query }, req.cid, req.params.id));
});

// Cotización -> factura (borrador)
router.post('/:id/convert', allow('operator'), async (req, res) => {
  const id = await tx(async (client) => {
    const q = await loadInvoice(client, req.cid, req.params.id);
    if (q.doc_type !== 'quote') throw new AppError(400, 'Solo cotizaciones');
    const number = await nextNumber(client, req.cid, 'invoice');
    const { rows: [inv] } = await client.query(
      `INSERT INTO invoices (company_id, doc_type, number, ncf_type, contact_id, date, currency, income_type, payment_terms,
          subtotal, discount, itbis, itbis_retained, isr_retained, total, notes, created_by)
       SELECT company_id, 'invoice', $3, $4, contact_id, CURRENT_DATE, currency, income_type, payment_terms,
          subtotal, discount, itbis, itbis_retained, isr_retained, total, notes, $5 FROM invoices WHERE id=$1 AND company_id=$2 RETURNING id`,
      [q.id, req.cid, number, req.company.is_formal ? (req.body.ncf_type || 'B02') : null, req.user.id]
    );
    await client.query(
      `INSERT INTO invoice_items (company_id, invoice_id, product_id, description, qty, price, discount, itbis_rate, itbis, total, kind)
       SELECT company_id, $3, product_id, description, qty, price, discount, itbis_rate, itbis, total, kind FROM invoice_items WHERE invoice_id=$1 AND company_id=$2`,
      [q.id, req.cid, inv.id]
    );
    await client.query(`UPDATE invoices SET status='accepted' WHERE id=$1 AND company_id=$2`, [q.id, req.cid]);
    return inv.id;
  });
  res.json(await loadInvoice({ query }, req.cid, id));
});

router.post('/:id/payments', allow('operator'), async (req, res) => {
  const { amount, bank_account_id, date = today(), method = 'transfer', reference } = req.body;
  const fee = round(req.body.fee || 0);
  const feeType = fee > 0 ? (req.body.fee_type === 'withholding' ? 'withholding' : 'commission') : null;
  await tx(async (client) => {
    const inv = await loadInvoice(client, req.cid, req.params.id);
    if (!['issued', 'partial'].includes(inv.status) || inv.doc_type !== 'invoice') throw new AppError(400, 'La factura no admite cobros');
    const balance = round(inv.total - inv.itbis_retained - inv.isr_retained - inv.paid);
    const amt = round(amount || 0);
    const applied = round(amt + fee);
    if (amt < 0 || fee < 0 || applied <= 0 || applied > balance + 0.001) throw new AppError(400, `Monto inválido. Saldo pendiente: ${balance.toFixed(2)}`);
    const { rows: [pay] } = await client.query(
      `INSERT INTO payments (company_id, direction, invoice_id, bank_account_id, date, amount, method, reference, fee, fee_type)
       VALUES ($1,'in',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [req.cid, inv.id, bank_account_id, date, amt, method, reference || null, fee, feeType]
    );
    await postPayment(client, req.company, pay, `factura ${inv.ncf || inv.number}`, req.user.id);
    const paid = round(Number(inv.paid) + applied);
    await client.query(`UPDATE invoices SET paid=$3, status=$4 WHERE id=$1 AND company_id=$2`,
      [inv.id, req.cid, paid, paid >= balance + Number(inv.paid) - 0.001 ? 'paid' : 'partial']);
  });
  res.json(await loadInvoice({ query }, req.cid, req.params.id));
});

router.delete('/:id/payments/:pid', allow('accountant'), async (req, res) => {
  await tx(async (client) => {
    const { rows: [p] } = await client.query('SELECT * FROM payments WHERE id=$1 AND company_id=$2 AND invoice_id=$3', [req.params.pid, req.cid, req.params.id]);
    if (!p) throw new AppError(404, 'Cobro no encontrado');
    await reverseSource(client, req.cid, 'payment', p.id, today(), req.user.id);
    await client.query('DELETE FROM payments WHERE id=$1', [p.id]);
    await client.query(
      `UPDATE invoices SET paid = paid - $3, status = CASE WHEN paid - $3 <= 0 THEN 'issued' ELSE 'partial' END WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.cid, round(Number(p.amount) + Number(p.fee))]
    );
  });
  res.json(await loadInvoice({ query }, req.cid, req.params.id));
});

// Anular: revierte asientos. Los NCF anulados se reportan en el 608.
router.post('/:id/void', allow('accountant'), async (req, res) => {
  await tx(async (client) => {
    const inv = await loadInvoice(client, req.cid, req.params.id);
    if (inv.status === 'void') throw new AppError(400, 'Ya está anulada');
    if (inv.payments.length) throw new AppError(400, 'Elimina primero los cobros registrados');
    await reverseSource(client, req.cid, 'invoice', inv.id, today(), req.user.id);
    await client.query(`UPDATE invoices SET status='void', notes = concat_ws(E'\n', notes, $3::text) WHERE id=$1 AND company_id=$2`,
      [inv.id, req.cid, req.body.reason ? `Anulada: ${req.body.reason}` : null]);
  });
  res.json(await loadInvoice({ query }, req.cid, req.params.id));
});

router.delete('/:id', allow('operator'), async (req, res) => {
  const { rowCount } = await query(`DELETE FROM invoices WHERE id=$1 AND company_id=$2 AND status='draft'`, [req.params.id, req.cid]);
  if (!rowCount) throw new AppError(400, 'Solo se pueden borrar borradores');
  res.json({ ok: true });
});

module.exports = router;
module.exports.createInvoice = createInvoice;
module.exports.issue = issue;
module.exports.computeTotals = computeTotals;
