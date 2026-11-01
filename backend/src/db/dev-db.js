// PostgreSQL embebido para desarrollo local sin Docker: npm run dev:db
const path = require('path');
const fs = require('fs');
const EmbeddedPostgres = require('embedded-postgres').default;

const dir = path.join(__dirname, '..', '..', '.pgdata');
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'cuadre', password: 'cuadre', port: 5434, persistent: true });

(async () => {
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('cuadre');
  console.log('✓ PostgreSQL de desarrollo en localhost:5434');
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch((e) => { console.error(e); process.exit(1); });
