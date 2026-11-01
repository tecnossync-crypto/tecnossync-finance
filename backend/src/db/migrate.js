require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (require.main === module) {
  migrate()
    .then(() => { console.log('✓ Esquema aplicado'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { migrate };
