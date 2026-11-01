require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');
const { migrate } = require('./db/migrate');

const app = express();
// Confía en los proxies de la red privada (Caddy propio y, en servidor compartido, el Caddy
// de la otra app): así req.ip es el cliente real y el límite de intentos de login es por usuario.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));
// Freno a fuerza bruta solo en login/registro y contando solo intentos fallidos: /auth/me se llama en
// cada carga de página y no debe bloquear a quien navega o recarga mucho (p. ej. desde el teléfono).
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true, message: { error: 'Demasiados intentos. Espera unos minutos.' } });
app.use(['/api/auth/login', '/api/auth/register'], authLimit);
app.use('/api/auth', require('./routes/auth'));

const api = express.Router();
api.use(requireAuth);
api.use('/company', require('./routes/company'));
api.use('/', require('./routes/catalog'));
api.use('/contacts', require('./routes/statements'));
api.use('/recurring', require('./routes/recurring'));
api.use('/invoices', require('./routes/invoices'));
api.use('/expenses', require('./routes/expenses'));
api.use('/banks', require('./routes/banks'));
api.use('/accounting', require('./routes/accounting'));
api.use('/budgets', require('./routes/budgets'));
api.use('/reports', require('./routes/reports'));
app.use('/api', api);

app.use((err, req, res, next) => {
  const status = err.status || (err.code === '22P02' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

const PORT = process.env.PORT || 4100;
migrate()
  .then(() => app.listen(PORT, () => {
    console.log(`Tecnossync Ledger API en :${PORT}`);
    if (process.env.RECURRING !== 'off') require('./lib/recurring').startScheduler();
  }))
  .catch((e) => { console.error('No se pudo migrar la base de datos', e); process.exit(1); });
