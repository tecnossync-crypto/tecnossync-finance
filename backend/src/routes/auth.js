const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, tx } = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { createCompany } = require('../lib/company');

router.post('/register', async (req, res) => {
  const { name, email, password, company } = req.body || {};
  if (!name || !email || !password || !company?.name) return res.status(400).json({ error: 'Completa todos los campos' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  const exists = await query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email]);
  if (exists.rows[0]) return res.status(409).json({ error: 'Ese correo ya está registrado' });

  const result = await tx(async (client) => {
    const { rows: [user] } = await client.query(
      'INSERT INTO users (email, password_hash, name) VALUES (lower($1),$2,$3) RETURNING id, name, email',
      [email, await bcrypt.hash(password, 10), name]
    );
    const co = await createCompany(client, user.id, company);
    return { user, co };
  });
  res.json({ token: sign(result.user.id, result.co.id) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const { rows: [user] } = await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email || '']);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const { rows: [m] } = await query(
    'SELECT company_id FROM memberships WHERE user_id=$1 ORDER BY created_at LIMIT 1', [user.id]
  );
  if (!m) return res.status(403).json({ error: 'Tu usuario no pertenece a ninguna empresa' });
  res.json({ token: sign(user.id, m.company_id) });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows: companies } = await query(
    `SELECT c.id, c.name, c.trade_name, c.is_formal, m.role
       FROM memberships m JOIN companies c ON c.id = m.company_id
      WHERE m.user_id=$1 ORDER BY c.name`, [req.user.id]
  );
  const { logo_path, ...company } = req.company;
  res.json({ user: req.user, role: req.role, company: { ...company, has_logo: !!logo_path }, companies });
});

// Cambiar de empresa activa (solo si es miembro)
router.post('/switch', requireAuth, async (req, res) => {
  const { rows: [m] } = await query(
    'SELECT company_id FROM memberships WHERE user_id=$1 AND company_id=$2', [req.user.id, Number(req.body.company_id)]
  );
  if (!m) return res.status(403).json({ error: 'No perteneces a esa empresa' });
  res.json({ token: sign(req.user.id, m.company_id) });
});

// Crear otra empresa con el mismo usuario
router.post('/companies', requireAuth, async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'Nombre requerido' });
  const co = await tx((client) => createCompany(client, req.user.id, req.body));
  res.json({ token: sign(req.user.id, co.id) });
});

module.exports = router;
