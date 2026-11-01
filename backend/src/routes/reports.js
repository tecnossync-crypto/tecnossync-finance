// Estados financieros, antigüedad de saldos, dashboard y formatos DGII (606, 607, 608, resumen IT-1)
const router = require('express').Router();
const { query } = require('../db');
const { AppError, round } = require('../lib/accounting');

const NATURE = `CASE WHEN a.type IN ('asset','cost','expense') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END`;
const range = (q) => ({ from: q.from || '1900-01-01', to: q.to || '2999-12-31' });

async function balances(cid, from, to) {
  const { rows } = await query(
    `SELECT a.id, a.code, a.name, a.type, a.parent_id, a.is_postable,
            COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit,
            COALESCE(SUM(${NATURE}),0) AS balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id=a.id AND jl.company_id=a.company_id
       LEFT JOIN journal_entries je ON je.id=jl.entry_id
      WHERE a.company_id=$1 AND (jl.id IS NULL OR (je.status='posted' AND je.date BETWEEN $2 AND $3))
      GROUP BY a.id ORDER BY a.code`, [cid, from, to]
  );
  return rows;
}

// Suma subcuentas hacia sus padres (por prefijo de código) y devuelve solo cuentas con movimiento
function rollup(rows) {
  const out = rows.map((r) => ({ ...r }));
  for (const r of out) {
    if (r.is_postable) continue;
    const kids = rows.filter((k) => k.is_postable && k.code.startsWith(r.code + '.'));
    r.balance = round(kids.reduce((s, k) => s + k.balance, 0));
    r.debit = round(kids.reduce((s, k) => s + k.debit, 0));
    r.credit = round(kids.reduce((s, k) => s + k.credit, 0));
  }
  return out.filter((r) => r.debit || r.credit || r.balance);
}

router.get('/trial-balance', async (req, res) => {
  const { from, to } = range(req.query);
  const rows = (await balances(req.cid, from, to)).filter((r) => r.is_postable && (r.debit || r.credit));
  const sd = round(rows.reduce((s, r) => s + r.debit, 0));
  const sc = round(rows.reduce((s, r) => s + r.credit, 0));
  res.json({ rows, totals: { debit: sd, credit: sc, balanced: sd === sc } });
});

router.get('/income-statement', async (req, res) => {
  const { from, to } = range(req.query);
  const rows = rollup((await balances(req.cid, from, to)).filter((r) => ['income', 'cost', 'expense'].includes(r.type)));
  const sum = (t) => round(rows.filter((r) => r.type === t && r.is_postable).reduce((s, r) => s + r.balance, 0));
  const income = sum('income'); const cost = sum('cost'); const expense = sum('expense');
  res.json({ rows, totals: { income, cost, gross: round(income - cost), expense, net: round(income - cost - expense) } });
});

router.get('/balance-sheet', async (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const all = await balances(req.cid, '1900-01-01', to);
  const rows = rollup(all.filter((r) => ['asset', 'liability', 'equity'].includes(r.type)));
  const sum = (t) => round(all.filter((r) => r.type === t && r.is_postable).reduce((s, r) => s + r.balance, 0));
  const result = round(sum('income') - sum('cost') - sum('expense'));
  const assets = sum('asset'); const liabilities = sum('liability'); const equity = round(sum('equity') + result);
  res.json({ rows, to, totals: { assets, liabilities, equity, result, balanced: round(assets) === round(liabilities + equity) } });
});

// Antigüedad de saldos (CxC o CxP)
router.get('/aging/:kind', async (req, res) => {
  const isAR = req.params.kind === 'receivable';
  const sql = isAR
    ? `SELECT i.id, i.number AS doc, i.ncf, i.date, i.due_date, c.name AS contact, (i.total - i.itbis_retained - i.isr_retained - i.paid) AS balance
         FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id
        WHERE i.company_id=$1 AND i.doc_type='invoice' AND i.status IN ('issued','partial')`
    : `SELECT e.id, e.description AS doc, e.ncf, e.date, e.due_date, c.name AS contact, (e.total - e.itbis_retained - e.isr_retained - e.paid) AS balance
         FROM expenses e LEFT JOIN contacts c ON c.id=e.contact_id
        WHERE e.company_id=$1 AND e.status IN ('pending','partial')`;
  const { rows } = await query(`${sql} ORDER BY date`, [req.cid]);
  const now = new Date();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  const items = rows.map((r) => {
    const due = new Date(r.due_date || r.date);
    const days = Math.floor((now - due) / 86400000);
    const bucket = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90p';
    buckets[bucket] = round(buckets[bucket] + r.balance);
    return { ...r, days_overdue: Math.max(0, days), bucket };
  });
  res.json({ items, buckets, total: round(items.reduce((s, r) => s + r.balance, 0)) });
});

router.get('/dashboard', async (req, res) => {
  const cid = req.cid;
  const monthStart = new Date(); monthStart.setDate(1);
  const ms = monthStart.toISOString().slice(0, 10);
  const { rows: series } = await query(
    `SELECT to_char(date_trunc('month', je.date),'YYYY-MM') AS month,
            SUM(CASE WHEN a.type='income' THEN jl.credit - jl.debit ELSE 0 END) AS income,
            SUM(CASE WHEN a.type IN ('cost','expense') THEN jl.debit - jl.credit ELSE 0 END) AS expense
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id JOIN accounts a ON a.id=jl.account_id
      WHERE jl.company_id=$1 AND je.status='posted' AND je.date >= date_trunc('month', CURRENT_DATE) - interval '11 months'
      GROUP BY 1 ORDER BY 1`, [cid]
  );
  const { rows: [ar] } = await query(
    `SELECT COALESCE(SUM(total - itbis_retained - isr_retained - paid),0) AS open,
            COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total - itbis_retained - isr_retained - paid END),0) AS overdue,
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS overdue_count
       FROM invoices WHERE company_id=$1 AND doc_type='invoice' AND status IN ('issued','partial')`, [cid]
  );
  const { rows: [ap] } = await query(
    `SELECT COALESCE(SUM(total - itbis_retained - isr_retained - paid),0) AS open,
            COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total - itbis_retained - isr_retained - paid END),0) AS overdue
       FROM expenses WHERE company_id=$1 AND status IN ('pending','partial')`, [cid]
  );
  const { rows: banks } = await query(
    `SELECT b.id, b.name, b.kind, COALESCE((SELECT SUM(jl.debit - jl.credit) FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
        WHERE jl.account_id=b.account_id AND jl.company_id=b.company_id AND je.status='posted'),0) AS balance
       FROM bank_accounts b WHERE b.company_id=$1 AND b.active ORDER BY b.kind, b.name`, [cid]
  );
  const { rows: [tax] } = await query(
    `SELECT COALESCE(SUM(CASE WHEN a.system_key='itbis_payable' THEN jl.credit - jl.debit END),0) AS itbis_collected,
            COALESCE(SUM(CASE WHEN a.system_key='itbis_credit' THEN jl.debit - jl.credit END),0) AS itbis_paid
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id JOIN accounts a ON a.id=jl.account_id
      WHERE jl.company_id=$1 AND je.status='posted' AND je.date >= $2`, [cid, ms]
  );
  const { rows: categories } = await query(
    `SELECT a.name, SUM(jl.debit - jl.credit) AS amount
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id JOIN accounts a ON a.id=jl.account_id
      WHERE jl.company_id=$1 AND je.status='posted' AND je.date >= $2 AND a.type IN ('cost','expense')
      GROUP BY a.name HAVING SUM(jl.debit - jl.credit) > 0 ORDER BY 2 DESC LIMIT 6`, [cid, ms]
  );
  const { rows: overdue } = await query(
    `SELECT i.id, i.number, i.ncf, i.due_date, c.name AS contact, (i.total - i.itbis_retained - i.isr_retained - i.paid) AS balance
       FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id
      WHERE i.company_id=$1 AND i.doc_type='invoice' AND i.status IN ('issued','partial') AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date LIMIT 6`, [cid]
  );
  const { rows: recent } = await query(
    `SELECT je.id, je.number, je.date, je.description, je.source_type,
            (SELECT SUM(debit) FROM journal_lines WHERE entry_id=je.id) AS amount
       FROM journal_entries je WHERE je.company_id=$1 AND je.status='posted' ORDER BY je.created_at DESC LIMIT 8`, [cid]
  );
  const cur = series.find((s) => s.month === ms.slice(0, 7)) || { income: 0, expense: 0 };
  res.json({
    month: { income: round(cur.income), expense: round(cur.expense), net: round(cur.income - cur.expense) },
    series, ar, ap, banks, cash: round(banks.filter((b) => b.kind !== 'card').reduce((s, b) => s + b.balance, 0)),
    tax: { ...tax, net: round(tax.itbis_collected - tax.itbis_paid) }, categories, overdue, recent,
  });
});

// ---------- Formatos DGII ----------
const ymd = (d) => (d ? String(d).replace(/-/g, '') : '');
const amt = (n) => (Number(n) ? Number(n).toFixed(2) : '');
const idType = (c) => (c?.id_type === 'rnc' ? '1' : c?.id_type === 'cedula' ? '2' : c?.id_type === 'passport' ? '3' : '');
const cleanId = (s) => (s || '').replace(/\D/g, '');

function period(q) {
  const p = String(q.period || '');
  if (!/^\d{6}$/.test(p)) throw new AppError(400, 'Período inválido, usa AAAAMM');
  const from = `${p.slice(0, 4)}-${p.slice(4)}-01`;
  const d = new Date(Number(p.slice(0, 4)), Number(p.slice(4)), 0);
  return { p, from, to: `${p.slice(0, 4)}-${p.slice(4)}-${String(d.getDate()).padStart(2, '0')}` };
}

function requireFormal(req) {
  if (!req.company.is_formal || !req.company.rnc) throw new AppError(400, 'Los formatos DGII requieren una empresa formal con RNC (Ajustes → Empresa)');
}

const PAY_606 = { cash: '01', transfer: '02', check: '02', card: '03', credit: '04', other: '07' };

router.get('/dgii/606', async (req, res) => {
  requireFormal(req);
  const { p, from, to } = period(req.query);
  const { rows } = await query(
    `SELECT e.*, c.tax_id, c.id_type,
            (SELECT MAX(date) FROM payments WHERE expense_id=e.id) AS pay_date,
            (SELECT array_agg(DISTINCT method) FROM payments WHERE expense_id=e.id) AS methods
       FROM expenses e LEFT JOIN contacts c ON c.id=e.contact_id
      WHERE e.company_id=$1 AND e.status <> 'void' AND e.ncf IS NOT NULL AND e.date BETWEEN $2 AND $3 ORDER BY e.date`, [req.cid, from, to]
  );
  const charges = req.company.charges_itbis;
  const records = rows.map((e) => {
    const methods = (e.methods || []).filter(Boolean);
    const forma = e.status === 'pending' ? '04' : methods.length > 1 ? '07' : PAY_606[methods[0]] || '01';
    return [cleanId(e.tax_id), idType(e), e.expense_type, e.ncf, '', ymd(e.date), ymd(e.pay_date),
      amt(e.services_amount), amt(e.goods_amount), amt(e.goods_amount + e.services_amount), amt(e.itbis), amt(e.itbis_retained),
      '', charges ? '' : amt(e.itbis), charges ? amt(e.itbis) : '', '', e.isr_type || '', amt(e.isr_retained), '', '',
      amt(e.other_taxes), amt(e.tip), forma];
  });
  sendTxt(req, res, `606|${cleanId(req.company.rnc)}|${p}|${records.length}`, records, `DGII_F_606_${cleanId(req.company.rnc)}_${p}.txt`,
    rows.map((e) => ({ id: e.id, ncf: e.ncf, date: e.date, supplier_tax_id: e.tax_id, description: e.description, base: round(e.goods_amount + e.services_amount), itbis: e.itbis, itbis_retained: e.itbis_retained, isr_retained: e.isr_retained, total: e.total, warning: !e.tax_id ? 'Proveedor sin RNC/Cédula' : null })));
});

router.get('/dgii/607', async (req, res) => {
  requireFormal(req);
  const { p, from, to } = period(req.query);
  const { rows } = await query(
    `SELECT i.*, c.tax_id, c.id_type, r.ncf AS ref_ncf,
            (SELECT json_object_agg(method, s) FROM (SELECT method, SUM(amount) s FROM payments WHERE invoice_id=i.id GROUP BY method) x) AS pays
       FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id LEFT JOIN invoices r ON r.id=i.ref_invoice_id
      WHERE i.company_id=$1 AND i.doc_type IN ('invoice','credit_note') AND i.status NOT IN ('draft','void') AND i.ncf IS NOT NULL
        AND i.date BETWEEN $2 AND $3 ORDER BY i.date`, [req.cid, from, to]
  );
  const records = rows.map((i) => {
    // las notas de crédito no llevan forma de pago; las retenciones no son venta a crédito
    const pays = i.doc_type === 'credit_note' ? {} : i.pays || {};
    const credit = i.doc_type === 'credit_note' ? 0
      : round(i.total - i.itbis_retained - i.isr_retained - Object.values(pays).reduce((s, v) => s + Number(v), 0));
    return [cleanId(i.tax_id), idType(i), i.ncf, i.ref_ncf || '', i.income_type, ymd(i.date),
      i.itbis_retained || i.isr_retained ? ymd(i.date) : '', amt(round(i.subtotal - i.discount)), amt(i.itbis), amt(i.itbis_retained), '',
      amt(i.isr_retained), '', '', '', '', amt(pays.cash), amt(round((Number(pays.transfer) || 0) + (Number(pays.check) || 0))),
      amt(pays.card), amt(credit > 0 ? credit : 0), '', '', amt(pays.other)];
  });
  sendTxt(req, res, `607|${cleanId(req.company.rnc)}|${p}|${records.length}`, records, `DGII_F_607_${cleanId(req.company.rnc)}_${p}.txt`,
    rows.map((i) => ({ id: i.id, ncf: i.ncf, date: i.date, customer_tax_id: i.tax_id, base: round(i.subtotal - i.discount), itbis: i.itbis, itbis_retained: i.itbis_retained, isr_retained: i.isr_retained, total: i.total, warning: ['B01', 'E31'].includes(i.ncf_type) && !i.tax_id ? 'Crédito fiscal sin RNC del cliente' : null })));
});

router.get('/dgii/608', async (req, res) => {
  requireFormal(req);
  const { p, from, to } = period(req.query);
  const { rows } = await query(
    `SELECT id, ncf, date, total FROM invoices WHERE company_id=$1 AND status='void' AND ncf IS NOT NULL AND date BETWEEN $2 AND $3 ORDER BY date`,
    [req.cid, from, to]
  );
  const records = rows.map((i) => [i.ncf, ymd(i.date), req.query.reason || '04']);
  sendTxt(req, res, `608|${cleanId(req.company.rnc)}|${p}|${records.length}`, records, `DGII_F_608_${cleanId(req.company.rnc)}_${p}.txt`, rows);
});

// Resumen para la declaración de ITBIS (IT-1)
router.get('/itbis', async (req, res) => {
  const { from, to } = period(req.query);
  const { rows: [sales] } = await query(
    `SELECT COALESCE(SUM(CASE WHEN doc_type='credit_note' THEN -(subtotal-discount) ELSE subtotal-discount END),0) AS base,
            COALESCE(SUM(CASE WHEN doc_type='credit_note' THEN -itbis ELSE itbis END),0) AS itbis,
            COALESCE(SUM(itbis_retained),0) AS itbis_withheld,
            COALESCE(SUM(CASE WHEN itbis = 0 THEN subtotal-discount ELSE 0 END),0) AS exempt
       FROM invoices WHERE company_id=$1 AND doc_type IN ('invoice','credit_note') AND status NOT IN ('draft','void') AND date BETWEEN $2 AND $3`,
    [req.cid, from, to]
  );
  const { rows: [purch] } = await query(
    `SELECT COALESCE(SUM(goods_amount + services_amount),0) AS base, COALESCE(SUM(itbis),0) AS itbis,
            COALESCE(SUM(itbis_retained),0) AS itbis_retained_to_others, COALESCE(SUM(isr_retained),0) AS isr_retained_to_others
       FROM expenses WHERE company_id=$1 AND status <> 'void' AND ncf IS NOT NULL AND date BETWEEN $2 AND $3`, [req.cid, from, to]
  );
  const creditable = req.company.charges_itbis ? round(purch.itbis - purch.itbis_retained_to_others) : 0;
  const payable = round(sales.itbis - creditable - sales.itbis_withheld);
  res.json({
    sales, purchases: purch, creditable,
    result: payable, to_pay: payable > 0 ? payable : 0, balance_in_favor: payable < 0 ? -payable : 0,
    withholdings_to_remit: { itbis: purch.itbis_retained_to_others, isr: purch.isr_retained_to_others },
  });
});

function sendTxt(req, res, header, records, filename, preview) {
  if (req.query.format === 'txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send([header, ...records.map((r) => r.join('|'))].join('\r\n'));
  }
  res.json({ header, count: records.length, rows: preview, filename });
}

module.exports = router;
