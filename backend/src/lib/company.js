const { seedChart } = require('./chart');

// Crea empresa, membresía de dueño, catálogo de cuentas y caja/banco por defecto.
async function createCompany(client, userId, data) {
  const isFormal = !!data.is_formal;
  const { rows: [co] } = await client.query(
    `INSERT INTO companies (name, trade_name, is_formal, rnc, charges_itbis, phone, email, address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [data.name, data.trade_name || null, isFormal, data.rnc || null,
      data.charges_itbis ?? isFormal, data.phone || null, data.email || null, data.address || null]
  );
  await client.query(`INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,'owner')`, [userId, co.id]);
  const ids = await seedChart(client, co.id);
  await client.query(
    `INSERT INTO bank_accounts (company_id, name, kind, account_id) VALUES ($1,'Caja general','cash',$2), ($1,'Cuenta bancaria principal','bank',$3)`,
    [co.id, ids['1.1.01'], ids['1.1.03']]
  );
  return co;
}

module.exports = { createCompany };
