const { Pool, types } = require('pg');

// NUMERIC -> number (montos con 2 decimales caben sin pérdida en double)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// DATE -> 'YYYY-MM-DD' (evita corrimientos de zona horaria)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cuadre:cuadre@localhost:5434/cuadre',
});

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
