const router = require('express').Router();
const { query, tx } = require('../db');
const { allow } = require('../middleware/auth');
const { AppError, round } = require('../lib/accounting');

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, COALESCE((SELECT SUM(amount) FROM budget_lines WHERE budget_id=b.id),0) AS total
       FROM budgets b WHERE b.company_id=$1 ORDER BY b.year DESC, b.name`, [req.cid]
  );
  res.json(rows);
});

router.post('/', allow('accountant'), async (req, res) => {
  const { name, year, notes } = req.body;
  if (!name || !year) throw new AppError(400, 'Nombre y año requeridos');
  const { rows: [b] } = await query('INSERT INTO budgets (company_id, name, year, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.cid, name, year, notes || null]);
  res.json(b);
});

router.delete('/:id', allow('accountant'), async (req, res) => {
  await query('DELETE FROM budgets WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  res.json({ ok: true });
});

// Presupuesto vs real por cuenta y mes. Real = movimiento neto del período según la naturaleza de la cuenta.
router.get('/:id', async (req, res) => {
  const { rows: [b] } = await query('SELECT * FROM budgets WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  if (!b) throw new AppError(404, 'Presupuesto no encontrado');
  const { rows: lines } = await query(
    `SELECT bl.account_id, bl.month, bl.amount FROM budget_lines bl WHERE bl.budget_id=$1 AND bl.company_id=$2`, [b.id, req.cid]
  );
  const { rows: actual } = await query(
    `SELECT jl.account_id, EXTRACT(MONTH FROM je.date)::int AS month,
            SUM(CASE WHEN a.type IN ('income','liability','equity') THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END) AS amount
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id JOIN accounts a ON a.id=jl.account_id
      WHERE jl.company_id=$1 AND je.status='posted' AND EXTRACT(YEAR FROM je.date)=$2 AND a.type IN ('income','cost','expense')
      GROUP BY jl.account_id, month`, [req.cid, b.year]
  );
  const { rows: accounts } = await query(
    `SELECT id, code, name, type FROM accounts WHERE company_id=$1 AND is_postable AND type IN ('income','cost','expense') ORDER BY code`, [req.cid]
  );
  res.json({ budget: b, lines, actual, accounts });
});

// Guarda la grilla completa: [{account_id, month, amount}]
router.put('/:id/lines', allow('accountant'), async (req, res) => {
  const { rows: [b] } = await query('SELECT id FROM budgets WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  if (!b) throw new AppError(404, 'Presupuesto no encontrado');
  const lines = (req.body.lines || []).filter((l) => l.month >= 1 && l.month <= 12);
  const accIds = [...new Set(lines.map((l) => Number(l.account_id)))];
  if (accIds.length) {
    const { rows } = await query('SELECT id FROM accounts WHERE company_id=$1 AND id = ANY($2)', [req.cid, accIds]);
    if (rows.length !== accIds.length) throw new AppError(400, 'Cuenta inválida');
  }
  await tx(async (client) => {
    await client.query('DELETE FROM budget_lines WHERE budget_id=$1 AND company_id=$2', [b.id, req.cid]);
    for (const l of lines) {
      if (!Number(l.amount)) continue;
      await client.query('INSERT INTO budget_lines (company_id, budget_id, account_id, month, amount) VALUES ($1,$2,$3,$4,$5)',
        [req.cid, b.id, l.account_id, l.month, round(l.amount)]);
    }
  });
  res.json({ ok: true });
});

module.exports = router;
