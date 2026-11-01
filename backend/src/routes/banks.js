// Bancos, caja y movimientos (depósitos, retiros, transferencias)
const router = require('express').Router();
const { query, tx } = require('../db');
const { allow } = require('../middleware/auth');
const { round, AppError, postEntry, accountByKey } = require('../lib/accounting');

const BALANCE = `COALESCE((SELECT SUM(jl.debit - jl.credit) FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
   WHERE jl.account_id=b.account_id AND jl.company_id=b.company_id AND je.status='posted'),0)`;
// Cuentas en US$: su saldo real en dólares (el contable sigue en pesos)
const BALANCE_FX = `COALESCE((SELECT SUM(jl.fx_amount) FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
   WHERE jl.account_id=b.account_id AND jl.company_id=b.company_id AND je.status='posted' AND jl.fx_currency=b.currency),0)`;
const round4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;
const isFx = (b) => b.currency && b.currency !== 'DOP';

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, a.code AS account_code, ${BALANCE} AS balance, ${BALANCE_FX} AS balance_fx FROM bank_accounts b JOIN accounts a ON a.id=b.account_id
      WHERE b.company_id=$1 AND b.active ORDER BY b.kind, b.name`, [req.cid]
  );
  res.json(rows);
});

// Cada banco/caja nuevo crea su propia subcuenta contable
router.post('/', allow('accountant'), async (req, res) => {
  const { name, kind = 'bank', bank_name, number, opening_balance = 0, opening_date } = req.body;
  const currency = req.body.currency === 'USD' ? 'USD' : 'DOP';
  const rate = currency === 'DOP' ? 1 : round4(req.body.exchange_rate || req.company.usd_rate);
  if (currency !== 'DOP' && Number(opening_balance) && !(rate > 0)) throw new AppError(400, 'Indica la tasa del dólar para el saldo inicial');
  if (!name) throw new AppError(400, 'Nombre requerido');
  const bank = await tx(async (client) => {
    const parentKey = kind === 'card' ? 'credit_card' : kind === 'cash' ? 'cash' : 'bank';
    const { rows: [parent] } = await client.query('SELECT * FROM accounts WHERE company_id=$1 AND system_key=$2', [req.cid, parentKey]);
    const { rows: [{ n }] } = await client.query(
      `SELECT COUNT(*)::int + 1 AS n FROM accounts WHERE company_id=$1 AND code LIKE $2`, [req.cid, `${parent.code}.%`]
    );
    const { rows: [acc] } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type, parent_id, is_postable) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
      [req.cid, `${parent.code}.${String(n).padStart(2, '0')}`, name, parent.type, parent.parent_id]
    );
    const { rows: [b] } = await client.query(
      `INSERT INTO bank_accounts (company_id, name, kind, bank_name, number, currency, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.cid, name, kind, bank_name || null, number || null, currency, acc.id]
    );
    const ob = round(opening_balance);
    if (ob) {
      const equity = await accountByKey(client, req.cid, 'opening_balance');
      const isLiab = kind === 'card';
      const dop = round(ob * rate);
      const fx = currency !== 'DOP' ? { fx_currency: currency } : {};
      await postEntry(client, req.cid, {
        date: opening_date || new Date().toISOString().slice(0, 10), userId: req.user.id, source_type: 'bank', source_id: b.id,
        description: `Saldo inicial ${name}${currency !== 'DOP' ? ` (US$ ${ob.toFixed(2)} × ${rate})` : ''}`,
        lines: isLiab
          ? [{ account_id: equity, debit: dop }, { account_id: acc.id, credit: dop, ...(fx.fx_currency && { ...fx, fx_amount: -ob }) }]
          : [{ account_id: acc.id, debit: dop, ...(fx.fx_currency && { ...fx, fx_amount: ob }) }, { account_id: equity, credit: dop }],
      });
    }
    return b;
  });
  res.json(bank);
});

router.put('/:id', allow('accountant'), async (req, res) => {
  const { name, bank_name, number } = req.body;
  const { rows: [b] } = await query(
    `UPDATE bank_accounts SET name=COALESCE($3,name), bank_name=$4, number=$5 WHERE id=$1 AND company_id=$2 RETURNING *`,
    [req.params.id, req.cid, name, bank_name || null, number || null]
  );
  if (b) await query('UPDATE accounts SET name=$3 WHERE id=$1 AND company_id=$2', [b.account_id, req.cid, b.name]);
  res.json(b);
});

// Movimientos de una cuenta con saldo corrido
router.get('/:id/movements', async (req, res) => {
  const { rows: [b] } = await query('SELECT * FROM bank_accounts WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  if (!b) throw new AppError(404, 'No encontrada');
  const { rows } = await query(
    `SELECT je.id AS entry_id, je.number, je.date, je.description, je.source_type, jl.debit, jl.credit, jl.fx_amount,
            SUM(jl.debit - jl.credit) OVER (ORDER BY je.date, je.id, jl.id) AS running,
            SUM(COALESCE(jl.fx_amount,0)) OVER (ORDER BY je.date, je.id, jl.id) AS running_fx
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
      WHERE jl.account_id=$1 AND jl.company_id=$2 AND je.status='posted'
      ORDER BY je.date DESC, je.id DESC, jl.id DESC LIMIT 1000`, [b.account_id, req.cid]
  );
  res.json({ bank: b, movements: rows });
});

// Movimiento manual: depósito/retiro contra una cuenta contable, o transferencia entre bancos
router.post('/movements', allow('operator'), async (req, res) => {
  const { type, bank_account_id, to_bank_account_id, account_id, amount, date, description } = req.body;
  const amt = round(amount);
  if (amt <= 0) throw new AppError(400, 'Monto inválido');
  const entry = await tx(async (client) => {
    const getBank = async (id) => {
      const { rows: [b] } = await client.query('SELECT * FROM bank_accounts WHERE id=$1 AND company_id=$2', [id, req.cid]);
      if (!b) throw new AppError(400, 'Cuenta de banco/caja inválida');
      return b;
    };
    const from = await getBank(bank_account_id);
    const to = type === 'transfer' ? await getBank(to_bank_account_id) : null;
    const needsRate = isFx(from) || (to && isFx(to));
    const rate = needsRate ? round4(req.body.exchange_rate || req.company.usd_rate) : 1;
    if (needsRate && !(rate > 0)) throw new AppError(400, 'Indica la tasa del dólar');
    if (needsRate) await client.query('UPDATE companies SET usd_rate=$2 WHERE id=$1', [req.cid, rate]);
    const dop = isFx(from) ? round(amt * rate) : amt;               // valor en pesos del movimiento
    const fxFor = (b, sign) => (isFx(b) ? { fx_currency: b.currency, fx_amount: sign * (isFx(from) ? amt : round(amt / rate)) } : {});
    let lines;
    if (type === 'transfer') {
      if (to.id === from.id) throw new AppError(400, 'Elige cuentas distintas');
      lines = [{ account_id: to.account_id, debit: dop, ...fxFor(to, 1) }, { account_id: from.account_id, credit: dop, ...fxFor(from, -1) }];
    } else if (type === 'deposit') {
      lines = [{ account_id: from.account_id, debit: dop, ...fxFor(from, 1) }, { account_id, credit: dop }];
    } else if (type === 'withdrawal') {
      lines = [{ account_id, debit: dop }, { account_id: from.account_id, credit: dop, ...fxFor(from, -1) }];
    } else throw new AppError(400, 'Tipo inválido');
    return postEntry(client, req.cid, {
      date: date || new Date().toISOString().slice(0, 10), userId: req.user.id, source_type: 'bank', source_id: from.id,
      description: description || (type === 'transfer' ? 'Transferencia entre cuentas' : type === 'deposit' ? 'Depósito' : 'Retiro'), lines,
    });
  });
  res.json(entry);
});

module.exports = router;
