// Estado de cuenta de un cliente (cuentas por cobrar) o proveedor (cuentas por pagar)
const router = require('express').Router();
const { query } = require('../db');
const { round, AppError } = require('../lib/accounting');

// Cargos y abonos del contacto. Cliente: facturas (+), notas de crédito y cobros (−).
// Proveedor: gastos/compras (+) y pagos (−). Los montos son netos de retenciones.
const MOVES = {
  customer: `
    SELECT i.date, 'invoice' AS kind, i.id AS doc_id, COALESCE(i.ncf, i.number) AS ref, i.due_date, i.period AS detail,
           (i.total - i.itbis_retained - i.isr_retained) AS charge, 0 AS credit
      FROM invoices i WHERE i.company_id=$1 AND i.contact_id=$2 AND i.doc_type='invoice' AND i.status NOT IN ('draft','void') AND i.currency=$4
    UNION ALL
    SELECT i.date, 'credit_note', i.id, COALESCE(i.ncf, i.number), NULL, NULL, 0, (i.total - i.itbis_retained - i.isr_retained)
      FROM invoices i WHERE i.company_id=$1 AND i.contact_id=$2 AND i.doc_type='credit_note' AND i.status NOT IN ('draft','void') AND i.currency=$4
    UNION ALL
    SELECT p.date, 'payment', i.id, COALESCE(i.ncf, i.number), NULL,
           concat_ws(' · ', p.method, p.reference, CASE WHEN p.fee > 0 THEN
             (CASE p.fee_type WHEN 'withholding' THEN 'retención ' ELSE 'comisión ' END) || to_char(p.fee, 'FM999,999,990.00') END),
           0, p.amount + p.fee
      FROM payments p JOIN invoices i ON i.id=p.invoice_id
     WHERE p.company_id=$1 AND p.direction='in' AND i.contact_id=$2 AND i.currency=$4`,
  supplier: `
    SELECT e.date, 'expense' AS kind, e.id AS doc_id, COALESCE(e.ncf, '') AS ref, e.due_date, e.description AS detail,
           (e.total - e.itbis_retained - e.isr_retained) AS charge, 0 AS credit
      FROM expenses e WHERE e.company_id=$1 AND e.contact_id=$2 AND e.status <> 'void' AND $4::text = 'DOP'
    UNION ALL
    SELECT p.date, 'payment', e.id, COALESCE(e.ncf, ''), NULL, concat_ws(' · ', p.method, p.reference), 0, p.amount
      FROM payments p JOIN expenses e ON e.id=p.expense_id
     WHERE p.company_id=$1 AND p.direction='out' AND e.contact_id=$2 AND e.status <> 'void' AND $4::text = 'DOP'`,
};

const OPEN = {
  customer: `SELECT id, COALESCE(ncf, number) AS ref, date, due_date, period AS detail, (total - itbis_retained - isr_retained) AS amount,
                    (total - itbis_retained - isr_retained - paid) AS balance
               FROM invoices WHERE company_id=$1 AND contact_id=$2 AND doc_type='invoice' AND status IN ('issued','partial') AND currency=$3 ORDER BY date`,
  supplier: `SELECT id, COALESCE(ncf, '') AS ref, date, due_date, description AS detail, (total - itbis_retained - isr_retained) AS amount,
                    (total - itbis_retained - isr_retained - paid) AS balance
               FROM expenses WHERE company_id=$1 AND contact_id=$2 AND status IN ('pending','partial') AND $3::text = 'DOP' ORDER BY date`,
};

const ORDER = { invoice: 0, expense: 0, credit_note: 1, payment: 2 };

router.get('/:id/statement', async (req, res) => {
  const { rows: [contact] } = await query('SELECT * FROM contacts WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  if (!contact) throw new AppError(404, 'Contacto no encontrado');
  const side = req.query.side === 'supplier' || (!req.query.side && contact.kind === 'supplier') ? 'supplier' : 'customer';
  const year = new Date().getFullYear();
  const from = req.query.from || `${year}-01-01`;
  const to = req.query.to || new Date().toISOString().slice(0, 10);

  // monedas en que tiene facturas; por defecto pesos si tiene, si no la que tenga
  const { rows: curs } = await query(
    `SELECT DISTINCT currency FROM invoices WHERE company_id=$1 AND contact_id=$2 AND doc_type IN ('invoice','credit_note') AND status <> 'draft' ORDER BY currency`, [req.cid, contact.id]);
  const currencies = curs.map((c) => c.currency);
  const currency = ['DOP', 'USD'].includes(req.query.currency) ? req.query.currency : side === 'supplier' || !currencies.length || currencies.includes('DOP') ? 'DOP' : currencies[0];
  const { rows } = await query(`SELECT * FROM (${MOVES[side]}) m WHERE m.date <= $3 ORDER BY m.date`, [req.cid, contact.id, to, currency]);
  rows.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]);

  let opening = 0, balance = 0, charges = 0, credits = 0;
  const lines = [];
  for (const r of rows) {
    if (r.date < from) { opening = round(opening + r.charge - r.credit); balance = opening; continue; }
    balance = round(balance + r.charge - r.credit);
    charges = round(charges + r.charge); credits = round(credits + r.credit);
    lines.push({ ...r, balance });
  }

  // Antigüedad de lo que está pendiente hoy
  const { rows: open } = await query(OPEN[side], [req.cid, contact.id, currency]);
  const now = Date.now();
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const o of open) {
    const days = Math.floor((now - new Date(`${o.due_date || o.date}T12:00:00`)) / 86400000);
    o.days_overdue = Math.max(0, days);
    const b = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90p';
    aging[b] = round(aging[b] + o.balance);
  }

  res.json({
    side, contact, from, to, currency, currencies: side === 'supplier' ? ['DOP'] : currencies, opening, charges, credits, closing: balance,
    lines, open, aging, open_total: round(open.reduce((s, o) => s + o.balance, 0)),
  });
});

module.exports = router;
