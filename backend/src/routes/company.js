const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { allow } = require('../middleware/auth');
const { upload, resolveFile, relPath } = require('../lib/upload');

const FIELDS = ['name', 'trade_name', 'is_formal', 'rnc', 'charges_itbis', 'itbis_rate', 'address', 'phone', 'email',
  'website', 'currency', 'invoice_prefix', 'next_invoice_no', 'quote_prefix', 'next_quote_no', 'invoice_footer', 'accent_color', 'payment_instructions'];

router.put('/', allow('admin'), async (req, res) => {
  const sets = []; const vals = [];
  for (const f of FIELDS) if (f in req.body) { vals.push(req.body[f] === '' ? null : req.body[f]); sets.push(`${f}=$${vals.length}`); }
  if (!sets.length) return res.json({ ok: true });
  vals.push(req.cid);
  const { rows: [co] } = await query(`UPDATE companies SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  res.json(co);
});

router.post('/logo', allow('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no válido' });
  await query('UPDATE companies SET logo_path=$1 WHERE id=$2', [relPath(req.cid, req.file), req.cid]);
  res.json({ ok: true });
});

router.get('/logo', async (req, res) => {
  const file = resolveFile(req.cid, req.company.logo_path);
  if (!file) return res.status(404).end();
  res.sendFile(file);
});

// --- Secuencias NCF ---
router.get('/ncf', async (req, res) => {
  const { rows } = await query('SELECT * FROM ncf_sequences WHERE company_id=$1 ORDER BY ncf_type', [req.cid]);
  res.json(rows);
});

router.post('/ncf', allow('admin'), async (req, res) => {
  const { ncf_type, next_no, end_no, expires_at, active = true } = req.body;
  if (!/^[BE]\d{2}$/.test(ncf_type || '')) return res.status(400).json({ error: 'Tipo de NCF inválido (ej. B01, B02, E31)' });
  const { rows: [s] } = await query(
    `INSERT INTO ncf_sequences (company_id, ncf_type, next_no, end_no, expires_at, active) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id, ncf_type) DO UPDATE SET next_no=EXCLUDED.next_no, end_no=EXCLUDED.end_no, expires_at=EXCLUDED.expires_at, active=EXCLUDED.active
     RETURNING *`,
    [req.cid, ncf_type, next_no || 1, end_no, expires_at || null, active]
  );
  res.json(s);
});

router.delete('/ncf/:id', allow('admin'), async (req, res) => {
  await query('DELETE FROM ncf_sequences WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  res.json({ ok: true });
});

// --- Usuarios de la empresa ---
router.get('/users', allow('admin'), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, m.role, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.company_id=$1 ORDER BY m.created_at`, [req.cid]
  );
  res.json(rows);
});

// Agrega un usuario existente (por correo) o lo crea con una contraseña temporal.
router.post('/users', allow('admin'), async (req, res) => {
  const { email, name, password, role } = req.body;
  if (!['admin', 'accountant', 'operator', 'viewer'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  let { rows: [user] } = await query('SELECT id FROM users WHERE lower(email)=lower($1)', [email || '']);
  if (!user) {
    if (!name || !password || password.length < 8) return res.status(400).json({ error: 'Usuario nuevo: nombre y contraseña (mín. 8) requeridos' });
    ({ rows: [user] } = await query(
      'INSERT INTO users (email, password_hash, name) VALUES (lower($1),$2,$3) RETURNING id', [email, await bcrypt.hash(password, 10), name]
    ));
  }
  await query(
    `INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO UPDATE SET role=EXCLUDED.role`,
    [user.id, req.cid, role]
  );
  res.json({ ok: true });
});

router.delete('/users/:id', allow('admin'), async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes quitarte a ti mismo' });
  await query(`DELETE FROM memberships WHERE user_id=$1 AND company_id=$2 AND role <> 'owner'`, [req.params.id, req.cid]);
  res.json({ ok: true });
});

module.exports = router;
