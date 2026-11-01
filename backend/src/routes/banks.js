// Bancos, caja y movimientos (depósitos, retiros, transferencias)
const router = require('express').Router();
const { query, tx } = require('../db');
const { allow } = require('../middleware/auth');
const { round, AppError, postEntry, accountByKey } = require('../lib/accounting');

const BALANCE = `COALESCE((SELECT SUM(jl.debit - jl.credit) FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
   WHERE jl.account_id=b.account_id AND jl.company_id=b.company_id AND je.status='posted'),0)`;

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, a.code AS account_code, ${BALANCE} AS balance FROM bank_accounts b JOIN accounts a ON a.id=b.account_id
      WHERE b.company_id=$1 AND b.active ORDER BY b.kind, b.name`, [req.cid]
  );
  res.json(rows);
});

// Cada banco/caja nuevo crea su propia subcuenta contable
router.post('/', allow('accountant'), async (req, res) => {
  const { name, kind = 'bank', bank_name, number, currency = 'DOP', opening_balance = 0, opening_date } = req.body;
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
      await postEntry(client, req.cid, {
        date: opening_date || new Date().toISOString().slice(0, 10), userId: req.user.id, source_type: 'bank', source_id: b.id,
        description: `Saldo inicial ${name}`,
        lines: isLiab
          ? [{ account_id: equity, debit: ob }, { account_id: acc.id, credit: ob }]
          : [{ account_id: acc.id, debit: ob }, { account_id: equity, credit: ob }],
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
    `SELECT je.id AS entry_id, je.number, je.date, je.description, je.source_type, jl.debit, jl.credit,
            SUM(jl.debit - jl.credit) OVER (ORDER BY je.date, je.id, jl.id) AS running
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
    let lines;
    if (type === 'transfer') {
      const to = await getBank(to_bank_account_id);
      if (to.id === from.id) throw new AppError(400, 'Elige cuentas distintas');
      lines = [{ account_id: to.account_id, debit: amt }, { account_id: from.account_id, credit: amt }];
    } else if (type === 'deposit') {
      lines = [{ account_id: from.account_id, debit: amt }, { account_id, credit: amt }];
    } else if (type === 'withdrawal') {
      lines = [{ account_id, debit: amt }, { account_id: from.account_id, credit: amt }];
    } else throw new AppError(400, 'Tipo inválido');
    return postEntry(client, req.cid, {
      date: date || new Date().toISOString().slice(0, 10), userId: req.user.id, source_type: 'bank', source_id: from.id,
      description: description || (type === 'transfer' ? 'Transferencia entre cuentas' : type === 'deposit' ? 'Depósito' : 'Retiro'), lines,
    });
  });
  res.json(entry);
});

module.exports = router;
