// Contactos (clientes/proveedores) y productos/servicios
const router = require('express').Router();
const { query } = require('../db');
const { allow } = require('../middleware/auth');

router.get('/contacts', async (req, res) => {
  const { kind, q } = req.query;
  const vals = [req.cid]; let where = 'company_id=$1';
  if (kind === 'customer') where += ` AND kind IN ('customer','both')`;
  if (kind === 'supplier') where += ` AND kind IN ('supplier','both')`;
  if (q) { vals.push(`%${q}%`); where += ` AND (name ILIKE $${vals.length} OR tax_id ILIKE $${vals.length})`; }
  const { rows } = await query(
    `SELECT c.*,
       (SELECT COALESCE(SUM((total - itbis_retained - isr_retained - paid) * exchange_rate),0) FROM invoices i WHERE i.contact_id=c.id AND i.company_id=c.company_id AND i.doc_type='invoice' AND i.status IN ('issued','partial')) AS receivable,
       (SELECT COALESCE(SUM(total - itbis_retained - isr_retained - paid),0) FROM expenses e WHERE e.contact_id=c.id AND e.company_id=c.company_id AND e.status IN ('pending','partial')) AS payable
     FROM contacts c WHERE ${where} ORDER BY name LIMIT 500`, vals
  );
  res.json(rows);
});

const CONTACT = ['kind', 'name', 'id_type', 'tax_id', 'email', 'phone', 'address', 'notes', 'payment_fee_pct', 'payment_fee_type'];

router.post('/contacts', allow('operator'), async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Nombre requerido' });
  const v = CONTACT.map((f) => req.body[f] ?? null);
  v[0] = v[0] || 'customer'; v[2] = v[2] || 'none';
  v[8] = Number(v[8]) || 0; // payment_fee_pct es NOT NULL
  const { rows: [c] } = await query(
    `INSERT INTO contacts (company_id, ${CONTACT.join(',')}) VALUES ($1,${CONTACT.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
    [req.cid, ...v]
  );
  res.json(c);
});

router.put('/contacts/:id', allow('operator'), async (req, res) => {
  const v = CONTACT.map((f) => req.body[f] ?? null);
  const { rows: [c] } = await query(
    `UPDATE contacts SET ${CONTACT.map((f, i) => `${f}=COALESCE($${i + 3},${f})`).join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
    [req.params.id, req.cid, ...v]
  );
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  res.json(c);
});

router.delete('/contacts/:id', allow('accountant'), async (req, res) => {
  try {
    await query('DELETE FROM contacts WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Tiene documentos asociados; no se puede eliminar' });
  }
});

router.get('/products', async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, a.name AS account_name FROM products p LEFT JOIN accounts a ON a.id=p.income_account_id
      WHERE p.company_id=$1 AND p.active ORDER BY p.name`, [req.cid]
  );
  res.json(rows);
});

router.post('/products', allow('operator'), async (req, res) => {
  const { kind = 'service', name, sku, price = 0, itbis_rate, income_account_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const rate = itbis_rate ?? (req.company.charges_itbis ? req.company.itbis_rate : 0);
  const { rows: [p] } = await query(
    `INSERT INTO products (company_id, kind, name, sku, price, itbis_rate, income_account_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.cid, kind, name, sku || null, price, rate, income_account_id || null]
  );
  res.json(p);
});

router.put('/products/:id', allow('operator'), async (req, res) => {
  const { kind, name, sku, price, itbis_rate, income_account_id } = req.body;
  const { rows: [p] } = await query(
    `UPDATE products SET kind=COALESCE($3,kind), name=COALESCE($4,name), sku=$5, price=COALESCE($6,price),
       itbis_rate=COALESCE($7,itbis_rate), income_account_id=$8 WHERE id=$1 AND company_id=$2 RETURNING *`,
    [req.params.id, req.cid, kind, name, sku || null, price, itbis_rate, income_account_id || null]
  );
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  res.json(p);
});

router.delete('/products/:id', allow('operator'), async (req, res) => {
  await query('UPDATE products SET active=false WHERE id=$1 AND company_id=$2', [req.params.id, req.cid]);
  res.json({ ok: true });
});

module.exports = router;
