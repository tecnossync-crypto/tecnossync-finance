// Motor contable: todo documento genera su asiento en partida doble.
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function accountByKey(client, companyId, key) {
  const { rows } = await client.query(
    'SELECT id FROM accounts WHERE company_id=$1 AND system_key=$2', [companyId, key]
  );
  if (!rows[0]) throw new AppError(500, `Falta la cuenta del sistema "${key}" en el catálogo`);
  return rows[0].id;
}

async function assertAccounts(client, companyId, ids) {
  const unique = [...new Set(ids)];
  const { rows } = await client.query(
    'SELECT id FROM accounts WHERE company_id=$1 AND id = ANY($2) AND is_postable',
    [companyId, unique]
  );
  if (rows.length !== unique.length) throw new AppError(400, 'Cuenta contable inválida o no imputable');
}

/**
 * Crea un asiento. lines: [{ account_id, debit, credit, memo }]
 * Verifica que débitos = créditos.
 */
async function postEntry(client, companyId, { date, description, source_type = 'manual', source_id = null, lines, userId, status = 'posted' }) {
  const clean = lines
    .map((l) => ({ ...l, debit: round(l.debit || 0), credit: round(l.credit || 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  if (clean.length < 2) throw new AppError(400, 'El asiento necesita al menos dos líneas');
  const d = round(clean.reduce((s, l) => s + l.debit, 0));
  const c = round(clean.reduce((s, l) => s + l.credit, 0));
  if (d !== c) throw new AppError(400, `El asiento no cuadra: débitos ${d.toFixed(2)} ≠ créditos ${c.toFixed(2)}`);
  await assertAccounts(client, companyId, clean.map((l) => l.account_id));

  const { rows: [co] } = await client.query(
    'UPDATE companies SET next_entry_no = next_entry_no + 1 WHERE id=$1 RETURNING next_entry_no - 1 AS n', [companyId]
  );
  const { rows: [entry] } = await client.query(
    `INSERT INTO journal_entries (company_id, number, date, description, source_type, source_id, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId, co.n, date, description, source_type, source_id, userId || null, status]
  );
  for (const l of clean) {
    await client.query(
      'INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, memo) VALUES ($1,$2,$3,$4,$5,$6)',
      [companyId, entry.id, l.account_id, l.debit, l.credit, l.memo || null]
    );
  }
  return entry;
}

/** Anula un asiento: el original y su reverso quedan en estado 'void' (visibles para auditoría, fuera de saldos). */
async function voidEntry(client, companyId, e, date, userId) {
  const { rows: lines } = await client.query(
    'SELECT account_id, debit, credit, memo FROM journal_lines WHERE entry_id=$1 AND company_id=$2', [e.id, companyId]
  );
  await postEntry(client, companyId, {
    date, userId, source_type: 'void', source_id: e.id,
    description: `Reverso asiento #${e.number}: ${e.description}`, status: 'void',
    lines: lines.map((l) => ({ account_id: l.account_id, debit: l.credit, credit: l.debit, memo: l.memo })),
  });
  await client.query(`UPDATE journal_entries SET status='void' WHERE id=$1 AND company_id=$2`, [e.id, companyId]);
}

/** Anula todos los asientos que generó un documento. */
async function reverseSource(client, companyId, sourceType, sourceId, date, userId) {
  const { rows: entries } = await client.query(
    `SELECT * FROM journal_entries WHERE company_id=$1 AND source_type=$2 AND source_id=$3 AND status='posted'`,
    [companyId, sourceType, sourceId]
  );
  for (const e of entries) await voidEntry(client, companyId, e, date, userId);
}

/** Asiento de una factura emitida. */
async function postInvoice(client, company, inv, items, userId) {
  const cid = company.id;
  const k = (key) => accountByKey(client, cid, key);
  const lines = [];
  const receivable = round(inv.total - inv.itbis_retained - inv.isr_retained);
  lines.push({ account_id: await k('ar'), debit: receivable, memo: `Factura ${inv.number}` });
  if (inv.itbis_retained) lines.push({ account_id: await k('itbis_withheld_by_customers'), debit: inv.itbis_retained });
  if (inv.isr_retained) lines.push({ account_id: await k('isr_withheld_by_customers'), debit: inv.isr_retained });

  // ingresos agrupados por cuenta (producto o por tipo)
  const byAccount = new Map();
  const goodsAcc = await k('sales_goods');
  const servAcc = await k('sales_services');
  for (const it of items) {
    const acc = it.income_account_id || (it.kind === 'good' ? goodsAcc : servAcc);
    const net = round(it.qty * it.price - (it.discount || 0));
    byAccount.set(acc, round((byAccount.get(acc) || 0) + net));
  }
  for (const [account_id, amount] of byAccount) lines.push({ account_id, credit: amount });
  if (inv.itbis) lines.push({ account_id: await k('itbis_payable'), credit: inv.itbis });

  const sign = inv.doc_type === 'credit_note' ? -1 : 1;
  const final = sign === 1 ? lines : lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
  return postEntry(client, cid, {
    date: inv.date, userId, source_type: 'invoice', source_id: inv.id,
    description: `${inv.doc_type === 'credit_note' ? 'Nota de crédito' : 'Factura'} ${inv.ncf || inv.number}`,
    lines: final,
  });
}

/** Asiento de un gasto/compra. Si la empresa no es agente de ITBIS, el ITBIS va al gasto. */
async function postExpense(client, company, exp, userId) {
  const cid = company.id;
  const k = (key) => accountByKey(client, cid, key);
  const base = round(exp.goods_amount + exp.services_amount);
  const lines = [{ account_id: exp.account_id, debit: base, memo: exp.description }];
  if (exp.itbis) {
    lines.push({ account_id: company.charges_itbis ? await k('itbis_credit') : await k('itbis_expense'), debit: exp.itbis });
  }
  if (exp.tip || exp.other_taxes) lines.push({ account_id: exp.account_id, debit: round(exp.tip + exp.other_taxes) });
  const payable = round(exp.total - exp.itbis_retained - exp.isr_retained);
  lines.push({ account_id: await k('ap'), credit: payable });
  if (exp.itbis_retained) lines.push({ account_id: await k('itbis_withheld_payable'), credit: exp.itbis_retained });
  if (exp.isr_retained) lines.push({ account_id: await k('isr_withheld_payable'), credit: exp.isr_retained });
  return postEntry(client, cid, {
    date: exp.date, userId, source_type: 'expense', source_id: exp.id,
    description: `Gasto: ${exp.description}${exp.ncf ? ` (${exp.ncf})` : ''}`, lines,
  });
}

/** Asiento de cobro (in) o pago (out). */
async function postPayment(client, company, pay, label, userId) {
  const cid = company.id;
  const { rows: [bank] } = await client.query(
    'SELECT account_id FROM bank_accounts WHERE id=$1 AND company_id=$2', [pay.bank_account_id, cid]
  );
  if (!bank) throw new AppError(400, 'Cuenta de banco/caja inválida');
  const counter = await accountByKey(client, cid, pay.direction === 'in' ? 'ar' : 'ap');
  const fee = round(pay.fee || 0);
  let lines;
  if (pay.direction === 'in') {
    // Cobro con descuento: al banco entra lo recibido, el descuento va a gasto (comisión) o a
    // impuesto adelantado (retención), y la cuenta por cobrar baja por el total.
    const feeAcc = fee > 0 && await accountByKey(client, cid, pay.fee_type === 'withholding' ? 'isr_withheld_by_customers' : 'bank_fees');
    lines = [{ account_id: bank.account_id, debit: pay.amount }, fee > 0 && { account_id: feeAcc, debit: fee },
      { account_id: counter, credit: round(Number(pay.amount) + fee) }].filter((l) => l && (l.debit || l.credit));
  } else {
    lines = [{ account_id: counter, debit: pay.amount }, { account_id: bank.account_id, credit: pay.amount }];
  }
  return postEntry(client, cid, {
    date: pay.date, userId, source_type: 'payment', source_id: pay.id,
    description: `${pay.direction === 'in' ? 'Cobro' : 'Pago'} ${label}`, lines,
  });
}

module.exports = { round, AppError, accountByKey, postEntry, voidEntry, reverseSource, postInvoice, postExpense, postPayment };
