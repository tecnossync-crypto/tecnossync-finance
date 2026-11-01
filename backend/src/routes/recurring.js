// Plantillas de cobro recurrente (mensual, trimestral…). La generación vive en lib/recurring.js
const router = require('express').Router();
const { query } = require('../db');
const { allow } = require('../middleware/auth');
const { AppError } = require('../lib/accounting');
const { computeTotals } = require('./invoices');
const { runDue, addMonths, TODAY_RD } = require('../lib/recurring');

const FIELDS = ['contact_id', 'name', 'every_months', 'day_of_month', 'next_date', 'end_date', 'due_days', 'auto_issue', 'period_label',
  'ncf_type', 'income_type', 'payment_terms', 'itbis_retention_pct', 'isr_retention_pct', 'notes', 'items', 'active', 'currency'];

const LIST = `SELECT r.*, c.name AS contact_name,
    (SELECT json_build_object('id', i.id, 'number', i.number, 'ncf', i.ncf, 'date', i.date, 'status', i.status)
       FROM invoices i WHERE i.recurring_id=r.id AND i.company_id=r.company_id ORDER BY i.date DESC, i.id DESC LIMIT 1) AS last_invoice,
    (SELECT COUNT(*)::int FROM invoices i WHERE i.recurring_id=r.id AND i.company_id=r.company_id) AS invoice_count
  FROM recurring_invoices r JOIN contacts c ON c.id=r.contact_id`;

// Valida y normaliza; devuelve también el total estimado por cobro
async function clean(req, b) {
  if (!b.name?.trim()) throw new AppError(400, 'Ponle un nombre al cobro');
  const { rows } = await query('SELECT 1 FROM contacts WHERE id=$1 AND company_id=$2', [b.contact_id, req.cid]);
  if (!rows[0]) throw new AppError(400, 'Elige un cliente');
  if (![1, 2, 3, 6, 12].includes(Number(b.every_months))) throw new AppError(400, 'Frecuencia inválida');
  if (!b.next_date) throw new AppError(400, 'Indica la fecha del próximo cobro');
  const t = computeTotals(req.company, b.items, b); // lanza error si no hay líneas
  const items = t.lines.map(({ product_id, description, qty, price, discount, itbis_rate, kind }) => ({ product_id, description, qty, price, discount, itbis_rate, kind }));
  const day = Number(b.day_of_month) || Number(b.next_date.slice(8, 10));
  return {
    ...b, items: JSON.stringify(items), every_months: Number(b.every_months), day_of_month: Math.min(31, Math.max(1, day)),
    due_days: Math.max(0, Number(b.due_days ?? 15)), auto_issue: b.auto_issue !== false, period_label: b.period_label !== false,
    ncf_type: req.company.is_formal ? (b.ncf_type || null) : null, end_date: b.end_date || null, active: b.active !== false,
    income_type: b.income_type || '01', currency: b.currency === 'USD' ? 'USD' : 'DOP',
    itbis_retention_pct: Number(b.itbis_retention_pct || 0), isr_retention_pct: Number(b.isr_retention_pct || 0),
  };
}

router.get('/', async (req, res) => {
  const { rows } = await query(`${LIST} WHERE r.company_id=$1 ORDER BY r.active DESC, r.next_date`, [req.cid]);
  const { rows: [{ today }] } = await query(`SELECT ${TODAY_RD} AS today`);
  res.json({ today, items: rows });
});

router.get('/:id', async (req, res) => {
  const { rows: [r] } = await query(`${LIST} WHERE r.id=$1 AND r.company_id=$2`, [req.params.id, req.cid]);
  if (!r) throw new AppError(404, 'Cobro recurrente no encontrado');
  const { rows: invoices } = await query(
    `SELECT id, number, ncf, date, due_date, total, paid, itbis_retained, isr_retained, status, period
       FROM invoices WHERE recurring_id=$1 AND company_id=$2 ORDER BY date DESC, id DESC LIMIT 60`, [r.id, req.cid]);
  res.json({ ...r, invoices });
});

router.post('/', allow('operator'), async (req, res) => {
  const b = await clean(req, req.body);
  const { rows: [r] } = await query(
    `INSERT INTO recurring_invoices (company_id, created_by, ${FIELDS.join(',')})
     VALUES ($1,$2,${FIELDS.map((_, i) => `$${i + 3}`).join(',')}) RETURNING id`,
    [req.cid, req.user.id, ...FIELDS.map((f) => b[f] ?? null)]
  );
  res.json({ id: r.id });
});

router.put('/:id', allow('operator'), async (req, res) => {
  const b = await clean(req, req.body);
  const { rowCount } = await query(
    `UPDATE recurring_invoices SET ${FIELDS.map((f, i) => `${f}=$${i + 3}`).join(',')}, last_error=NULL WHERE id=$1 AND company_id=$2`,
    [req.params.id, req.cid, ...FIELDS.map((f) => b[f] ?? null)]
  );
  if (!rowCount) throw new AppError(404, 'Cobro recurrente no encontrado');
  res.json({ id: Number(req.params.id) });
});

router.post('/:id/active', allow('operator'), async (req, res) => {
  const { rows: [r] } = await query(`SELECT *, ${TODAY_RD} AS today FROM recurring_invoices WHERE id=$1 AND company_id=$2`, [req.params.id, req.cid]);
  if (!r) throw new AppError(404, 'Cobro recurrente no encontrado');
  // Al reanudar no se facturan los períodos que estuvo pausado: salta al próximo a partir de hoy
  let next = r.next_date;
  if (req.body.active) while (next < r.today) next = addMonths(next, r.every_months, r.day_of_month);
  await query('UPDATE recurring_invoices SET active=$3, next_date=$4, last_error=NULL WHERE id=$1 AND company_id=$2',
    [r.id, req.cid, !!req.body.active, next]);
  res.json({ ok: true, next_date: next });
});

// Genera ya la próxima factura (sin esperar la fecha) y adelanta el calendario
router.post('/:id/generate', allow('operator'), async (req, res) => {
  const { rows } = await query('SELECT 1 FROM recurring_invoices WHERE id=$1 AND company_id=$2 AND active', [req.params.id, req.cid]);
  if (!rows[0]) throw new AppError(400, 'El cobro no existe o está pausado');
  const created = await runDue({ companyId: req.cid, id: req.params.id, force: true });
  if (!created.length) throw new AppError(400, 'No se pudo generar la factura');
  res.json({ invoice_id: created[0].id, number: created[0].number });
});

// Genera todo lo vencido de esta empresa (lo mismo que hace el proceso automático cada hora)
router.post('/run', allow('operator'), async (req, res) => {
  const created = await runDue({ companyId: req.cid });
  res.json({ created: created.length });
});

router.delete('/:id', allow('accountant'), async (req, res) => {
  // Las facturas ya generadas se conservan (recurring_id queda en NULL)
  const { rowCount } = await query('DELETE FROM recurring_invoices WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  if (!rowCount) throw new AppError(404, 'Cobro recurrente no encontrado');
  res.json({ ok: true });
});

router.get('/preview/dates', async (req, res) => {
  const { next_date, every_months = 1, day_of_month } = req.query;
  if (!next_date) return res.json([]);
  const day = Number(day_of_month) || Number(next_date.slice(8, 10));
  const out = [next_date];
  for (let i = 1; i < 4; i++) out.push(addMonths(out[i - 1], Number(every_months), day));
  res.json(out);
});

module.exports = router;
