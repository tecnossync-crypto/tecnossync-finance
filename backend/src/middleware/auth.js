const jwt = require('jsonwebtoken');
const { query } = require('../db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar';

const sign = (userId, companyId) => jwt.sign({ uid: userId, cid: companyId }, SECRET, { expiresIn: '7d' });

// Carga usuario + empresa activa + rol. La empresa SIEMPRE sale de la membresía, nunca del cliente.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  let payload;
  try { payload = jwt.verify(token, SECRET); } catch { return res.status(401).json({ error: 'Sesión expirada' }); }

  const { rows } = await query(
    `SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email, m.role, c.*
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.company_id = $2
       JOIN companies c ON c.id = m.company_id
      WHERE u.id = $1`,
    [payload.uid, payload.cid]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Sin acceso a esta empresa' });
  const { user_id, user_name, user_email, role, ...company } = rows[0];
  req.user = { id: user_id, name: user_name, email: user_email };
  req.role = role;
  req.company = company;
  req.cid = company.id;
  next();
}

const LEVEL = { viewer: 0, operator: 1, accountant: 2, admin: 3, owner: 4 };

// Mínimo rol requerido: viewer < operator < accountant < admin < owner
const allow = (min) => (req, res, next) =>
  LEVEL[req.role] >= LEVEL[min] ? next() : res.status(403).json({ error: 'Tu rol no permite esta acción' });

module.exports = { sign, requireAuth, allow, LEVEL };
