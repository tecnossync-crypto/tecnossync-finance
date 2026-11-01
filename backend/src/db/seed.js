// Datos de demostración. Requiere la API corriendo:  npm run seed
// Crea "Tecnossync Demo" (informal) y "Demo Formal SRL" con 6 meses de movimientos.
// Usuario demo: demo@cuadre.test / demo12345
const API = process.env.API_URL || 'http://localhost:4100/api';
const EMAIL = 'demo@cuadre.test';
const PASSWORD = 'demo12345';
let token;

async function call(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + url, {
    method,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url}: ${data?.error || res.status}`);
  return data;
}

const day = (monthsAgo, d) => {
  const now = new Date();
  const x = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(d, 28), 12);
  return (x > now && monthsAgo === 0 ? now : x).toISOString().slice(0, 10);
};

async function fill(formal) {
  const banks = await call('GET', '/banks');
  const bank = banks.find((b) => b.kind === 'bank'); const cash = banks.find((b) => b.kind === 'cash');
  await call('POST', '/banks/movements', { type: 'deposit', bank_account_id: bank.id, account_id: (await call('GET', '/accounting/accounts')).find((a) => a.system_key === 'capital').id, amount: 150000, date: day(6, 2), description: 'Aporte inicial del dueño' });
  const accounts = await call('GET', '/accounting/accounts');
  const acc = (name) => accounts.find((a) => a.name === name).id;

  const customers = [];
  for (const [name, tax] of [['Ferretería Ochoa', '101012345'], ['Clínica Abreu', '101987654'], ['Colegio Loyola', '401004567'], ['Restaurante El Conuco', '130223344']]) {
    customers.push(await call('POST', '/contacts', { kind: 'customer', name, id_type: 'rnc', tax_id: tax, email: `info@${name.split(' ')[1].toLowerCase()}.do` }));
  }
  const sup = {};
  for (const [name, tax] of [['Edesur Dominicana', '101821256'], ['Claro Dominicana', '101001577'], ['Inmobiliaria Naco', '130556677'], ['Google Workspace', '']]) {
    sup[name] = await call('POST', '/contacts', { kind: 'supplier', name, id_type: tax ? 'rnc' : 'none', tax_id: tax || null });
  }
  const services = [];
  for (const [name, price] of [['Desarrollo de sitio web', 45000], ['Mantenimiento mensual', 8500], ['Hosting y dominio (anual)', 6500], ['Chatbot de WhatsApp', 25000], ['Soporte técnico (hora)', 1500]]) {
    services.push(await call('POST', '/products', { kind: 'service', name, price }));
  }
  if (formal) {
    for (const t of ['B01', 'B02', 'B04', 'B14', 'B15']) await call('POST', '/company/ncf', { ncf_type: t, next_no: 1, end_no: 500, expires_at: `${new Date().getFullYear() + 1}-12-31` });
  }

  for (let m = 5; m >= 0; m--) {
    for (let k = 0; k < 3 + (5 - m) % 3; k++) {
      const c = customers[(m + k) % customers.length];
      const items = [services[(m + k) % services.length], services[1]].map((p, i) => ({ product_id: p.id, description: p.name, qty: i ? 1 : 1 + (k % 2), price: p.price, kind: 'service' }));
      const date = day(m, 3 + k * 7);
      const inv = await call('POST', '/invoices', { contact_id: c.id, date, due_date: plus30(date), issue: true, ncf_type: formal ? 'B01' : null, payment_terms: 'Crédito 30 días', items });
      if (m > 0 || k === 0) {
        const owed = inv.total - inv.itbis_retained - inv.isr_retained;
        await call('POST', `/invoices/${inv.id}/payments`, { amount: k === 2 && m < 3 ? Math.round(owed / 2) : owed, date: day(m, 10 + k * 7), bank_account_id: bank.id, method: 'transfer' });
      }
    }
    const expenses = [
      ['Alquiler oficina', 'Alquiler', 'Inmobiliaria Naco', 18000, '03'],
      ['Factura de luz', 'Energía eléctrica', 'Edesur Dominicana', 3200 + m * 140, '02'],
      ['Internet fibra 300 Mbps', 'Teléfono e internet', 'Claro Dominicana', 2900, '02'],
      ['Google Workspace', 'Software y suscripciones', 'Google Workspace', 1850, '02'],
      ['Combustible', 'Combustible y transporte', null, 2500 + (m % 3) * 600, '02'],
    ];
    for (const [i, [desc, account, supplier, amount, type]] of expenses.entries()) {
      const fd = new FormData();
      const hasNcf = formal && supplier && supplier !== 'Google Workspace';
      fd.append('data', JSON.stringify({
        description: `${desc}`, account_id: acc(account), contact_id: supplier ? sup[supplier].id : null, date: day(m, 5 + i * 4),
        services_amount: amount, itbis: account === 'Alquiler' || !hasNcf ? 0 : Math.round(amount * 0.18 * 100) / 100,
        ncf: hasNcf ? `B01${String(1000 + m * 10 + i).padStart(8, '0')}` : null, expense_type: type,
        paid_now: !(m === 0 && i === 0), bank_account_id: i === 4 ? cash.id : bank.id, method: i === 4 ? 'cash' : 'transfer',
        due_date: day(m, 28),
      }));
      await call('POST', '/expenses', fd);
    }
  }
  const budget = await call('POST', '/budgets', { name: `Presupuesto ${new Date().getFullYear()}`, year: new Date().getFullYear() });
  const lines = [];
  for (let month = 1; month <= 12; month++) {
    lines.push({ account_id: acc('Ingresos por servicios'), month, amount: 95000 });
    lines.push({ account_id: acc('Alquiler'), month, amount: 18000 });
    lines.push({ account_id: acc('Energía eléctrica'), month, amount: 3500 });
    lines.push({ account_id: acc('Teléfono e internet'), month, amount: 2900 });
    lines.push({ account_id: acc('Software y suscripciones'), month, amount: 1500 });
    lines.push({ account_id: acc('Combustible y transporte'), month, amount: 2800 });
  }
  await call('PUT', `/budgets/${budget.id}/lines`, { lines });
}

const plus30 = (iso) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + 30); return x.toISOString().slice(0, 10); };

(async () => {
  try {
    ({ token } = await call('POST', '/auth/register', { name: 'Ariel Henríquez', email: EMAIL, password: PASSWORD, company: { name: 'Tecnossync Demo', is_formal: false, phone: '809-555-0101', email: 'hola@tecnossync.test', address: 'Santo Domingo, R.D.' } }));
  } catch {
    ({ token } = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD }));
    console.log('El usuario demo ya existe; no se vuelve a sembrar.');
    return;
  }
  await fill(false);
  ({ token } = await call('POST', '/auth/companies', { name: 'Demo Formal SRL', trade_name: 'Demo Formal', is_formal: true, rnc: '131-12345-6', address: 'Av. Winston Churchill, Santo Domingo', phone: '809-555-0199' }));
  await fill(true);
  console.log(`✓ Datos demo listos. Entra con ${EMAIL} / ${PASSWORD}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
