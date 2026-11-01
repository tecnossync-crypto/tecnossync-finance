// Catálogo de cuentas, asientos y libro mayor
const router = require('express').Router();
const { query, tx } = require('../db');
const { allow } = require('../middleware/auth');
const { AppError, postEntry, voidEntry } = require('../lib/accounting');

router.get('/accounts', async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, COALESCE(s.debit,0) AS debit, COALESCE(s.credit,0) AS credit
       FROM accounts a
       LEFT JOIN (SELECT jl.account_id, SUM(jl.debit) AS debit, SUM(jl.credit) AS credit
                    FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
                   WHERE jl.company_id=$1 AND je.status='posted' GROUP BY jl.account_id) s ON s.account_id=a.id
      WHERE a.company_id=$1 ORDER BY a.code`, [req.cid]
  );
  res.json(rows);
});

router.post('/accounts', allow('accountant'), async (req, res) => {
  const { code, name, type, parent_id, is_postable = true } = req.body;
  if (!code || !name || !type) throw new AppError(400, 'Código, nombre y tipo son requeridos');
  if (parent_id) {
    const { rows } = await query('SELECT 1 FROM accounts WHERE id=$1 AND company_id=$2', [parent_id, req.cid]);
    if (!rows[0]) throw new AppError(400, 'Cuenta padre inválida');
  }
  try {
    const { rows: [a] } = await query(
      `INSERT INTO accounts (company_id, code, name, type, parent_id, is_postable) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.cid, code.trim(), name.trim(), type, parent_id || null, is_postable]
    );
    res.json(a);
  } catch (e) {
    if (e.code === '23505') throw new AppError(409, 'Ya existe una cuenta con ese código');
    throw e;
  }
});

router.put('/accounts/:id', allow('accountant'), async (req, res) => {
  const { name, active } = req.body;
  const { rows: [a] } = await query(
    'UPDATE accounts SET name=COALESCE($3,name), active=COALESCE($4,active) WHERE id=$1 AND company_id=$2 RETURNING *',
    [req.params.id, req.cid, name, active]
  );
  res.json(a);
});

router.get('/entries', async (req, res) => {
  const { from, to, q, source_type } = req.query;
  const vals = [req.cid]; let where = 'je.company_id=$1';
  if (from) { vals.push(from); where += ` AND je.date >= $${vals.length}`; }
  if (to) { vals.push(to); where += ` AND je.date <= $${vals.length}`; }
  if (source_type) { vals.push(source_type); where += ` AND je.source_type = $${vals.length}`; }
  if (q) { vals.push(`%${q}%`); where += ` AND je.description ILIKE $${vals.length}`; }
  const { rows } = await query(
    `SELECT je.*, u.name AS created_by_name,
            (SELECT SUM(debit) FROM journal_lines WHERE entry_id=je.id) AS amount,
            (SELECT json_agg(json_build_object('code',a.code,'name',a.name,'debit',jl.debit,'credit',jl.credit,'memo',jl.memo) ORDER BY jl.id)
               FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE jl.entry_id=je.id) AS lines
       FROM journal_entries je LEFT JOIN users u ON u.id=je.created_by
      WHERE ${where} ORDER BY je.date DESC, je.number DESC LIMIT 300`, vals
  );
  res.json(rows);
});

router.post('/entries', allow('accountant'), async (req, res) => {
  const { date, description, lines } = req.body;
  if (!description) throw new AppError(400, 'Agrega una descripción');
  const entry = await tx((client) => postEntry(client, req.cid, {
    date, description, lines: (lines || []).map((l) => ({ account_id: Number(l.account_id), debit: l.debit, credit: l.credit, memo: l.memo })),
    userId: req.user.id,
  }));
  res.json(entry);
});

router.post('/entries/:id/void', allow('accountant'), async (req, res) => {
  await tx(async (client) => {
    const { rows: [e] } = await client.query('SELECT * FROM journal_entries WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
    if (!e || e.status !== 'posted') throw new AppError(400, 'Asiento no válido');
    if (e.source_type !== 'manual') throw new AppError(400, 'Este asiento lo generó un documento; anula el documento');
    await voidEntry(client, req.cid, e, new Date().toISOString().slice(0, 10), req.user.id);
  });
  res.json({ ok: true });
});

// Libro mayor de una cuenta (incluye subcuentas por prefijo de código)
router.get('/ledger/:accountId', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const { rows: [acc] } = await query('SELECT * FROM accounts WHERE id=$1 AND company_id=$2', [req.params.accountId, req.cid]);
  if (!acc) throw new AppError(404, 'Cuenta no encontrada');
  const scope = `a.company_id=$1 AND (a.id=$2 OR a.code LIKE $3)`;
  const params = [req.cid, acc.id, `${acc.code}.%`];
  const { rows: [{ opening }] } = await query(
    `SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS opening FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
       JOIN accounts a ON a.id=jl.account_id WHERE ${scope} AND je.status='posted' AND je.date < $4`, [...params, from]
  );
  const { rows } = await query(
    `SELECT je.id AS entry_id, je.number, je.date, je.description, a.code, a.name AS account_name, jl.debit, jl.credit, jl.memo
       FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id JOIN accounts a ON a.id=jl.account_id
      WHERE ${scope} AND je.status='posted' AND je.date BETWEEN $4 AND $5 ORDER BY je.date, je.number, jl.id`, [...params, from, to]
  );
  res.json({ account: acc, opening, lines: rows });
});

module.exports = router;
