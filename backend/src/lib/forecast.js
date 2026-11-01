// Proyección de ingresos y gastos.
// Modelo: ingreso futuro = cobros recurrentes ya pactados (seguros) + ingreso no recurrente estimado
// con una regresión lineal sobre los últimos meses completos. El rango (80 %) sale del intervalo de
// predicción de esa regresión, así que se abre a medida que el mes está más lejos.
const { query } = require('../db');
const { round } = require('./accounting');
const { addMonths, TODAY_RD } = require('./recurring');

const Z80 = 1.2816;
const ym = (iso) => iso.slice(0, 7);
const shiftYm = (m, k) => addMonths(`${m}-01`, k, 1).slice(0, 7);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const stdev = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; };

// Mínimos cuadrados sobre x = 0..n-1. Con menos de 3 puntos usa el promedio (sin tendencia).
function linreg(ys) {
  const n = ys.length;
  const xbar = (n - 1) / 2, ybar = mean(ys);
  if (n < 3) return { n, slope: 0, intercept: ybar, r2: 0, s: stdev(ys), xbar, sxx: 0, method: 'promedio' };
  let sxx = 0, sxy = 0, sst = 0;
  ys.forEach((y, x) => { sxx += (x - xbar) ** 2; sxy += (x - xbar) * (y - ybar); sst += (y - ybar) ** 2; });
  const slope = sxy / sxx, intercept = ybar - slope * xbar;
  const sse = ys.reduce((s, y, x) => s + (y - (intercept + slope * x)) ** 2, 0);
  return { n, slope, intercept, r2: sst ? 1 - sse / sst : 0, s: Math.sqrt(sse / (n - 2)), xbar, sxx, method: 'tendencia lineal' };
}

function predict(m, x) {
  const y = Math.max(0, m.intercept + m.slope * x);
  const se = m.sxx ? m.s * Math.sqrt(1 + 1 / m.n + (x - m.xbar) ** 2 / m.sxx) : m.s;
  return { y, se };
}

// Ocurrencias de cada cobro recurrente activo por mes, netas de ITBIS (lo que entra como ingreso)
const templateAmount = (r, usdRate) => r.items.reduce((s, i) => s + Number(i.qty) * Number(i.price) - Number(i.discount || 0), 0)
  * (r.currency === 'USD' ? Number(usdRate || 0) : 1);

function recurringByMonth(templates, fromYm, toYm, usdRate) {
  const out = {};
  for (const r of templates) {
    const amount = templateAmount(r, usdRate);
    let d = r.next_date;
    for (let guard = 0; guard < 60 && ym(d) <= toYm; guard++) {
      if (r.end_date && d > r.end_date) break;
      if (ym(d) >= fromYm) out[ym(d)] = (out[ym(d)] || 0) + amount;
      d = addMonths(d, r.every_months, r.day_of_month);
    }
  }
  return out;
}

async function forecast(cid, horizon = 6) {
  const { rows: [{ today }] } = await query(`SELECT ${TODAY_RD} AS today`);
  const cur = ym(today);
  const histFrom = shiftYm(cur, -24);

  const { rows: hist } = await query(
    `SELECT to_char(je.date,'YYYY-MM') AS m,
            SUM(CASE WHEN a.type='income' THEN jl.credit - jl.debit ELSE 0 END) AS income,
            SUM(CASE WHEN a.type IN ('cost','expense') THEN jl.debit - jl.credit ELSE 0 END) AS expense
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id JOIN accounts a ON a.id=jl.account_id
      WHERE jl.company_id=$1 AND je.status='posted' AND je.date >= $2::date
      GROUP BY 1`, [cid, `${histFrom}-01`]);
  const { rows: recHist } = await query(
    `SELECT to_char(date,'YYYY-MM') AS m, SUM((subtotal - discount) * exchange_rate) AS amount
       FROM invoices WHERE company_id=$1 AND recurring_id IS NOT NULL AND doc_type='invoice' AND status NOT IN ('draft','void') AND date >= $2::date
      GROUP BY 1`, [cid, `${histFrom}-01`]);
  const byM = Object.fromEntries(hist.map((h) => [h.m, h]));
  const recM = Object.fromEntries(recHist.map((r) => [r.m, Number(r.amount)]));

  // Meses completos desde el primero con ventas (máximo 12) — el mes en curso no entra en el modelo.
  // Los meses previos a la primera venta (p. ej. solo el aporte de capital) sesgarían la tendencia.
  const first = hist.filter((h) => h.m < cur && Number(h.income) > 0).map((h) => h.m).sort()[0];
  const months = [];
  if (first) for (let m = first < shiftYm(cur, -12) ? shiftYm(cur, -12) : first; m < cur; m = shiftYm(m, 1)) months.push(m);
  const history = months.map((m) => {
    const income = round(Number(byM[m]?.income || 0)), expense = round(Number(byM[m]?.expense || 0));
    const recurring = round(Math.min(income, recM[m] || 0));
    return { month: m, income, expense, recurring, net: round(income - expense) };
  });

  const mInc = linreg(history.map((h) => h.income - h.recurring));
  const mExp = linreg(history.map((h) => h.expense));

  const { rows: templates } = await query(`SELECT * FROM recurring_invoices WHERE company_id=$1 AND active`, [cid]);
  const lastYm = shiftYm(cur, horizon);
  const { rows: [{ usd_rate: usdRate }] } = await query('SELECT usd_rate FROM companies WHERE id=$1', [cid]);
  const committed = recurringByMonth(templates, cur, lastYm, usdRate);

  const { rows: [{ cash }] } = await query(
    `SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS cash
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
      WHERE jl.company_id=$1 AND je.status='posted'
        AND jl.account_id IN (SELECT account_id FROM bank_accounts WHERE company_id=$1 AND kind <> 'card')`, [cid]);

  // Mes en curso: lo real hasta hoy + lo recurrente que falta por facturar este mes
  const curReal = { income: round(Number(byM[cur]?.income || 0)), expense: round(Number(byM[cur]?.expense || 0)) };
  const curPendingRec = round(templates.reduce((s, r) => s + (r.next_date.startsWith(cur) && r.next_date > today ? templateAmount(r, usdRate) : 0), 0));

  let runningCash = Number(cash);
  const projection = [];
  for (let k = 1; k <= horizon; k++) {
    const month = shiftYm(cur, k);
    const x = history.length - 1 + k + 1; // el mes en curso ocupa x = n
    const inc = predict(mInc, x), exp = predict(mExp, x);
    const recurring = round(committed[month] || 0);
    const income = round(inc.y + recurring);
    const expense = round(exp.y);
    runningCash += income - expense;
    projection.push({
      month, recurring, nonrecurring: round(inc.y), income,
      low: round(Math.max(recurring, income - Z80 * inc.se)), high: round(income + Z80 * inc.se),
      expense, net: round(income - expense), cash: round(runningCash),
    });
  }

  // Estadística descriptiva de los meses completos
  const incomes = history.map((h) => h.income);
  const avg = mean(incomes), sd = stdev(incomes);
  const growth = history.slice(1).map((h, i) => (history[i].income ? h.income / history[i].income - 1 : null)).filter((g) => g !== null);
  const best = history.reduce((b, h) => (!b || h.income > b.income ? h : b), null);
  const worst = history.reduce((b, h) => (!b || h.income < b.income ? h : b), null);
  const last3 = history.slice(-3);
  const mrr = templates.reduce((s, r) => s + templateAmount(r, usdRate) / r.every_months, 0);

  const { rows: top } = await query(
    `SELECT c.name, SUM((i.subtotal - i.discount) * i.exchange_rate) AS amount
       FROM invoices i JOIN contacts c ON c.id=i.contact_id
      WHERE i.company_id=$1 AND i.doc_type='invoice' AND i.status NOT IN ('draft','void') AND i.date >= $2::date
      GROUP BY c.name ORDER BY amount DESC`, [cid, `${shiftYm(cur, -12)}-01`]);
  const topTotal = top.reduce((s, t) => s + Number(t.amount), 0);

  const n = history.length;
  const confidence = n < 4 ? 'baja' : n < 9 || mInc.r2 < 0.3 ? 'media' : 'alta';

  return {
    today, horizon, cash_now: round(Number(cash)),
    current: { month: cur, ...curReal, pending_recurring: curPendingRec, estimate: round(Math.max(curReal.income, 0) + curPendingRec) },
    history, projection,
    totals: {
      income: round(projection.reduce((s, p) => s + p.income, 0)),
      low: round(projection.reduce((s, p) => s + p.low, 0)),
      high: round(projection.reduce((s, p) => s + p.high, 0)),
      recurring: round(projection.reduce((s, p) => s + p.recurring, 0)),
      expense: round(projection.reduce((s, p) => s + p.expense, 0)),
      net: round(projection.reduce((s, p) => s + p.net, 0)),
    },
    stats: {
      months: n, avg_income: round(avg), sd_income: round(sd), cv: avg ? round((sd / avg) * 100) : 0,
      avg_expense: round(mean(history.map((h) => h.expense))),
      avg_margin: avg ? round((mean(history.map((h) => h.net)) / avg) * 100) : 0,
      trend_per_month: round(mInc.slope), trend_pct: avg ? round((mInc.slope / avg) * 100) : 0, r2: round(mInc.r2 * 100),
      avg_growth: growth.length ? round(mean(growth) * 100) : 0,
      best, worst, mrr: round(mrr), arr: round(mrr * 12),
      recurring_share: mean(last3.map((h) => h.income)) ? round((mean(last3.map((h) => h.recurring)) / mean(last3.map((h) => h.income))) * 100) : 0,
      top_clients: top.slice(0, 5).map((t) => ({ name: t.name, amount: round(Number(t.amount)), share: topTotal ? round((t.amount / topTotal) * 100) : 0 })),
      top3_share: topTotal ? round((top.slice(0, 3).reduce((s, t) => s + Number(t.amount), 0) / topTotal) * 100) : 0,
      method: mInc.method, confidence,
    },
  };
}

module.exports = { forecast, linreg, predict };
