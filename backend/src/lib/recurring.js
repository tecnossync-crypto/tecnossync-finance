// Cobros recurrentes: genera las facturas de las plantillas vencidas.
// Corre al iniciar la API y cada hora; también a mano desde la pantalla de recurrentes.
const { pool, tx } = require('../db');

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TODAY_RD = `(now() AT TIME ZONE 'America/Santo_Domingo')::date`;
const MAX_CATCH_UP = 12; // si estuvo apagado mucho tiempo, no genera más de un año de golpe

const pad = (n) => String(n).padStart(2, '0');

// Suma meses respetando el día elegido (31 → último día de meses cortos)
function addMonths(iso, months, day) {
  const [y, m] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(day, last))}`;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "noviembre 2026" o "noviembre 2026 – enero 2027" para cobros de varios meses
function periodLabel(iso, every) {
  const [y, m] = iso.split('-').map(Number);
  const start = `${MONTHS[m - 1]} ${y}`;
  if (every === 1) return start;
  const end = addMonths(iso, every - 1, 1).split('-').map(Number);
  return `${start} – ${MONTHS[end[1] - 1]} ${end[0]}`;
}

// Genera una ocurrencia de la plantilla `r` (fila bloqueada) dentro de `client`.
// Con `early` (facturar ya) la factura sale con fecha de hoy aunque el período sea el próximo.
async function generateOne(client, r, early = false) {
  const { createInvoice, issue } = require('../routes/invoices');
  const { rows: [company] } = await client.query(`SELECT *, ${TODAY_RD} AS today FROM companies WHERE id=$1`, [r.company_id]);
  const ctx = { cid: r.company_id, company, user: { id: r.created_by } };
  const date = early && r.next_date > company.today ? company.today : r.next_date;
  const period = periodLabel(r.next_date, r.every_months);
  const items = r.items.map((i) => ({ ...i, description: r.period_label ? `${i.description} — ${period}` : i.description }));
  const inv = await createInvoice(client, ctx, {
    contact_id: r.contact_id, date, due_date: addDays(date, r.due_days), ncf_type: r.ncf_type, income_type: r.income_type,
    currency: r.currency, exchange_rate: company.usd_rate, // en US$ usa la última tasa registrada
    payment_terms: r.payment_terms, itbis_retention_pct: r.itbis_retention_pct, isr_retention_pct: r.isr_retention_pct,
    notes: r.notes, items,
  }, { recurring_id: r.id, period });

  let error = null;
  if (r.auto_issue) {
    // Si no se puede emitir (p. ej. NCF agotado) la factura queda en borrador y se avisa en la plantilla
    await client.query('SAVEPOINT emitir');
    try { await issue(client, ctx, inv); await client.query('RELEASE SAVEPOINT emitir'); }
    catch (e) { await client.query('ROLLBACK TO SAVEPOINT emitir'); error = `Quedó en borrador ${inv.number}: ${e.message}`; }
  }
  const next = addMonths(r.next_date, r.every_months, r.day_of_month);
  const ended = r.end_date && next > r.end_date;
  await client.query(
    `UPDATE recurring_invoices SET next_date=$2, active=$3, last_run_at=now(), last_error=$4 WHERE id=$1`,
    [r.id, next, !ended, error]
  );
  return inv;
}

// Procesa las plantillas vencidas. Con companyId solo las de esa empresa; con id, solo esa plantilla.
async function runDue({ companyId, id, force = false } = {}) {
  const created = [];
  const vals = []; let where = 'active';
  if (companyId) { vals.push(companyId); where += ` AND company_id=$${vals.length}`; }
  if (id) { vals.push(id); where += ` AND id=$${vals.length}`; }
  if (!force) where += ` AND next_date <= ${TODAY_RD}`;
  const { rows } = await pool.query(`SELECT id FROM recurring_invoices WHERE ${where}`, vals);
  for (const { id: rid } of rows) {
    for (let i = 0; i < (force ? 1 : MAX_CATCH_UP); i++) {
      try {
        const inv = await tx(async (client) => {
          const { rows: [r] } = await client.query(
            `SELECT * FROM recurring_invoices WHERE id=$1 AND active ${force ? '' : `AND next_date <= ${TODAY_RD}`} FOR UPDATE SKIP LOCKED`, [rid]
          );
          return r ? generateOne(client, r, force) : null;
        });
        if (!inv) break;
        created.push(inv);
      } catch (e) {
        await pool.query('UPDATE recurring_invoices SET last_run_at=now(), last_error=$2 WHERE id=$1', [rid, e.message]);
        console.error(`Cobro recurrente ${rid}:`, e.message);
        break;
      }
    }
  }
  return created;
}

function startScheduler() {
  const run = () => runDue().then((c) => c.length && console.log(`Cobros recurrentes: ${c.length} factura(s) generada(s)`))
    .catch((e) => console.error('Cobros recurrentes:', e.message));
  run();
  return setInterval(run, 60 * 60 * 1000);
}

module.exports = { runDue, startScheduler, addMonths, periodLabel, TODAY_RD };
