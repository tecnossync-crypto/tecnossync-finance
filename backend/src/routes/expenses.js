const router = require('express').Router();
const fs = require('fs');
const { query, tx } = require('../db');
const { allow } = require('../middleware/auth');
const { upload, resolveFile, relPath } = require('../lib/upload');
const { round, AppError, postExpense, postPayment, reverseSource } = require('../lib/accounting');

const today = () => new Date().toISOString().slice(0, 10);

function computeExpense(b) {
  const goods = round(b.goods_amount || 0);
  const services = round(b.services_amount || 0);
  const itbis = round(b.itbis || 0);
  const tip = round(b.tip || 0);
  const other = round(b.other_taxes || 0);
  const total = round(goods + services + itbis + tip + other);
  if (total <= 0) throw new AppError(400, 'El monto del gasto debe ser mayor que cero');
  return {
    goods_amount: goods, services_amount: services, itbis, tip, other_taxes: other, total,
    itbis_retained: round(b.itbis_retained || 0), isr_retained: round(b.isr_retained || 0),
  };
}

const SELECT = `SELECT e.*, c.name AS contact_name, c.tax_id AS contact_tax_id, a.code AS account_code, a.name AS account_name
  FROM expenses e LEFT JOIN contacts c ON c.id=e.contact_id JOIN accounts a ON a.id=e.account_id`;

router.get('/', async (req, res) => {
  const { status, from, to, q, account_id } = req.query;
  const vals = [req.cid]; let where = 'e.company_id=$1';
  if (status === 'open') where += ` AND e.status IN ('pending','partial')`;
  else if (status) { vals.push(status); where += ` AND e.status=$${vals.length}`; }
  if (from) { vals.push(from); where += ` AND e.date >= $${vals.length}`; }
  if (to) { vals.push(to); where += ` AND e.date <= $${vals.length}`; }
  if (account_id) { vals.push(account_id); where += ` AND e.account_id = $${vals.length}`; }
  if (q) { vals.push(`%${q}%`); where += ` AND (e.description ILIKE $${vals.length} OR e.ncf ILIKE $${vals.length} OR c.name ILIKE $${vals.length})`; }
  const { rows } = await query(`${SELECT} WHERE ${where} ORDER BY e.date DESC, e.id DESC LIMIT 500`, vals);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows: [e] } = await query(`${SELECT} WHERE e.id=$1 AND e.company_id=$2`, [req.params.id, req.cid]);
  if (!e) throw new AppError(404, 'Gasto no encontrado');
  const { rows: payments } = await query(
    `SELECT p.*, b.name AS bank_name FROM payments p JOIN bank_accounts b ON b.id=p.bank_account_id WHERE p.expense_id=$1 AND p.company_id=$2 ORDER BY p.date`,
    [e.id, req.cid]
  );
  res.json({ ...e, payments });
});

router.get('/:id/receipt', async (req, res) => {
  const { rows: [e] } = await query('SELECT receipt_path, receipt_name FROM expenses WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  const file = e && resolveFile(req.cid, e.receipt_path);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Sin comprobante' });
  res.sendFile(file);
});

// multipart: campo "data" (JSON) + "file" opcional
router.post('/', allow('operator'), upload.single('file'), async (req, res) => {
  const b = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
  const t = computeExpense(b);
  if (!b.description) throw new AppError(400, 'Describe el gasto');
  const exp = await tx(async (client) => {
    const { rows: [acc] } = await client.query(
      `SELECT id FROM accounts WHERE id=$1 AND company_id=$2 AND is_postable AND type IN ('expense','cost','asset')`, [b.account_id, req.cid]
    );
    if (!acc) throw new AppError(400, 'Selecciona una categoría (cuenta de gasto) válida');
    if (b.contact_id) {
      const { rows } = await client.query('SELECT 1 FROM contacts WHERE id=$1 AND company_id=$2', [b.contact_id, req.cid]);
      if (!rows[0]) throw new AppError(400, 'Proveedor inválido');
    }
    const { rows: [e] } = await client.query(
      `INSERT INTO expenses (company_id, contact_id, date, due_date, ncf, expense_type, account_id, description, goods_amount, services_amount,
         itbis, itbis_retained, isr_type, isr_retained, tip, other_taxes, total, receipt_path, receipt_name, budget_tag, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [req.cid, b.contact_id || null, b.date || today(), b.due_date || null, b.ncf ? String(b.ncf).toUpperCase().trim() : null,
        b.expense_type || '02', b.account_id, b.description, t.goods_amount, t.services_amount, t.itbis, t.itbis_retained,
        b.isr_type || null, t.isr_retained, t.tip, t.other_taxes, t.total,
        req.file ? relPath(req.cid, req.file) : null, req.file?.originalname || null, b.budget_tag || null, req.user.id]
    );
    await postExpense(client, req.company, e, req.user.id);
    // pagado al contado en el momento
    if (b.paid_now && b.bank_account_id) {
      const amount = round(e.total - e.itbis_retained - e.isr_retained);
      const { rows: [pay] } = await client.query(
        `INSERT INTO payments (company_id, direction, expense_id, bank_account_id, date, amount, method)
         VALUES ($1,'out',$2,$3,$4,$5,$6) RETURNING *`, [req.cid, e.id, b.bank_account_id, e.date, amount, b.method || 'cash']
      );
      await postPayment(client, req.company, pay, e.description, req.user.id);
      await client.query(`UPDATE expenses SET paid=$3, status='paid' WHERE id=$1 AND company_id=$2`, [e.id, req.cid, amount]);
    }
    return e;
  });
  res.json(exp);
});

router.post('/:id/receipt', allow('operator'), upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'Archivo no válido (PDF o imagen, máx. 10 MB)');
  const { rowCount } = await query('UPDATE expenses SET receipt_path=$3, receipt_name=$4 WHERE id=$1 AND company_id=$2',
    [req.params.id, req.cid, relPath(req.cid, req.file), req.file.originalname]);
  if (!rowCount) throw new AppError(404, 'Gasto no encontrado');
  res.json({ ok: true });
});

router.post('/:id/payments', allow('operator'), async (req, res) => {
  const { amount, bank_account_id, date = today(), method = 'transfer', reference } = req.body;
  await tx(async (client) => {
    const { rows: [e] } = await client.query('SELECT * FROM expenses WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, req.cid]);
    if (!e || !['pending', 'partial'].includes(e.status)) throw new AppError(400, 'El gasto no admite pagos');
    const owed = round(e.total - e.itbis_retained - e.isr_retained);
    const balance = round(owed - e.paid);
    const amt = round(amount);
    if (amt <= 0 || amt > balance + 0.001) throw new AppError(400, `Monto inválido. Saldo pendiente: ${balance.toFixed(2)}`);
    const { rows: [pay] } = await client.query(
      `INSERT INTO payments (company_id, direction, expense_id, bank_account_id, date, amount, method, reference)
       VALUES ($1,'out',$2,$3,$4,$5,$6,$7) RETURNING *`, [req.cid, e.id, bank_account_id, date, amt, method, reference || null]
    );
    await postPayment(client, req.company, pay, e.description, req.user.id);
    const paid = round(Number(e.paid) + amt);
    await client.query('UPDATE expenses SET paid=$3, status=$4 WHERE id=$1 AND company_id=$2',
      [e.id, req.cid, paid, paid >= owed - 0.001 ? 'paid' : 'partial']);
  });
  res.json({ ok: true });
});

router.post('/:id/void', allow('accountant'), async (req, res) => {
  await tx(async (client) => {
    const { rows: [e] } = await client.query('SELECT * FROM expenses WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
    if (!e || e.status === 'void') throw new AppError(400, 'No se puede anular');
    const { rows: pays } = await client.query('SELECT id FROM payments WHERE expense_id=$1 AND company_id=$2', [e.id, req.cid]);
    for (const p of pays) await reverseSource(client, req.cid, 'payment', p.id, today(), req.user.id);
    await client.query('DELETE FROM payments WHERE expense_id=$1 AND company_id=$2', [e.id, req.cid]);
    await reverseSource(client, req.cid, 'expense', e.id, today(), req.user.id);
    await client.query(`UPDATE expenses SET status='void', paid=0 WHERE id=$1 AND company_id=$2`, [e.id, req.cid]);
  });
  res.json({ ok: true });
});

module.exports = router;
