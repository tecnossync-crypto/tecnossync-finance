// Catálogo de cuentas base para República Dominicana.
// [código, nombre, tipo, postable, system_key]
const CHART = [
  ['1', 'Activos', 'asset', false],
  ['1.1', 'Activos corrientes', 'asset', false],
  ['1.1.01', 'Caja general', 'asset', true, 'cash'],
  ['1.1.02', 'Caja chica', 'asset', true, 'petty_cash'],
  ['1.1.03', 'Bancos', 'asset', true, 'bank'],
  ['1.1.04', 'Cuentas por cobrar clientes', 'asset', true, 'ar'],
  ['1.1.05', 'ITBIS pagado (adelantado)', 'asset', true, 'itbis_credit'],
  ['1.1.06', 'ITBIS retenido por clientes', 'asset', true, 'itbis_withheld_by_customers'],
  ['1.1.07', 'ISR retenido por clientes (anticipo)', 'asset', true, 'isr_withheld_by_customers'],
  ['1.1.08', 'Anticipos de ISR', 'asset', true, 'isr_advance'],
  ['1.1.09', 'Inventario de mercancías', 'asset', true, 'inventory'],
  ['1.1.10', 'Cuentas por cobrar empleados y socios', 'asset', true],
  ['1.2', 'Activos no corrientes', 'asset', false],
  ['1.2.01', 'Mobiliario y equipos de oficina', 'asset', true],
  ['1.2.02', 'Equipos de cómputo', 'asset', true],
  ['1.2.03', 'Vehículos', 'asset', true],
  ['1.2.04', 'Edificaciones y mejoras', 'asset', true],
  ['1.2.09', 'Depreciación acumulada', 'asset', true, 'accum_depreciation'],
  ['1.3', 'Otros activos', 'asset', false],
  ['1.3.01', 'Depósitos y fianzas', 'asset', true],

  ['2', 'Pasivos', 'liability', false],
  ['2.1', 'Pasivos corrientes', 'liability', false],
  ['2.1.01', 'Cuentas por pagar proveedores', 'liability', true, 'ap'],
  ['2.1.02', 'ITBIS por pagar (cobrado)', 'liability', true, 'itbis_payable'],
  ['2.1.03', 'ITBIS retenido a terceros por pagar', 'liability', true, 'itbis_withheld_payable'],
  ['2.1.04', 'ISR retenido a terceros por pagar', 'liability', true, 'isr_withheld_payable'],
  ['2.1.05', 'TSS / AFP / SFS por pagar', 'liability', true],
  ['2.1.06', 'Sueldos por pagar', 'liability', true],
  ['2.1.07', 'Tarjetas de crédito por pagar', 'liability', true, 'credit_card'],
  ['2.1.08', 'Anticipos de clientes', 'liability', true],
  ['2.2', 'Pasivos no corrientes', 'liability', false],
  ['2.2.01', 'Préstamos bancarios', 'liability', true],

  ['3', 'Patrimonio', 'equity', false],
  ['3.1.01', 'Capital social / aportes del dueño', 'equity', true, 'capital'],
  ['3.1.02', 'Retiros del dueño', 'equity', true, 'drawings'],
  ['3.1.03', 'Resultados acumulados', 'equity', true, 'retained_earnings'],
  ['3.1.04', 'Saldos de apertura', 'equity', true, 'opening_balance'],

  ['4', 'Ingresos', 'income', false],
  ['4.1.01', 'Ventas de bienes', 'income', true, 'sales_goods'],
  ['4.1.02', 'Ingresos por servicios', 'income', true, 'sales_services'],
  ['4.1.03', 'Descuentos y devoluciones en ventas', 'income', true, 'sales_returns'],
  ['4.2.01', 'Otros ingresos', 'income', true, 'other_income'],
  ['4.2.02', 'Ingresos financieros', 'income', true],

  ['5', 'Costos', 'cost', false],
  ['5.1.01', 'Costo de ventas', 'cost', true, 'cogs'],
  ['5.1.02', 'Compras de mercancía', 'cost', true],

  ['6', 'Gastos', 'expense', false],
  ['6.1', 'Gastos de personal', 'expense', false],
  ['6.1.01', 'Sueldos y salarios', 'expense', true],
  ['6.1.02', 'Aportes TSS patronales', 'expense', true],
  ['6.1.03', 'Bonificaciones y regalía', 'expense', true],
  ['6.2', 'Gastos generales y administrativos', 'expense', false],
  ['6.2.01', 'Alquiler', 'expense', true],
  ['6.2.02', 'Energía eléctrica', 'expense', true],
  ['6.2.03', 'Agua', 'expense', true],
  ['6.2.04', 'Teléfono e internet', 'expense', true],
  ['6.2.05', 'Software y suscripciones', 'expense', true],
  ['6.2.06', 'Materiales y útiles de oficina', 'expense', true],
  ['6.2.07', 'Honorarios profesionales', 'expense', true],
  ['6.2.08', 'Mantenimiento y reparaciones', 'expense', true],
  ['6.2.09', 'Combustible y transporte', 'expense', true],
  ['6.2.10', 'Publicidad y mercadeo', 'expense', true],
  ['6.2.11', 'Viáticos y representación', 'expense', true],
  ['6.2.12', 'Seguros', 'expense', true],
  ['6.2.13', 'Impuestos y tasas', 'expense', true],
  ['6.2.14', 'Depreciación', 'expense', true, 'depreciation'],
  ['6.2.15', 'ITBIS llevado al gasto', 'expense', true, 'itbis_expense'],
  ['6.2.99', 'Otros gastos', 'expense', true, 'other_expense'],
  ['6.3', 'Gastos financieros', 'expense', false],
  ['6.3.01', 'Comisiones y cargos bancarios', 'expense', true, 'bank_fees'],
  ['6.3.02', 'Intereses pagados', 'expense', true],
];

async function seedChart(client, companyId) {
  const ids = {};
  for (const [code, name, type, postable, key] of CHART) {
    const parentCode = code.includes('.') ? code.split('.').slice(0, -1).join('.') : null;
    // padre: el código más largo existente que sea prefijo
    let parentId = null;
    if (parentCode) {
      let c = parentCode;
      while (c && !ids[c]) c = c.includes('.') ? c.split('.').slice(0, -1).join('.') : null;
      parentId = c ? ids[c] : null;
    }
    const { rows } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type, parent_id, is_postable, system_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [companyId, code, name, type, parentId, postable, key || null]
    );
    ids[code] = rows[0].id;
  }
  return ids;
}

module.exports = { CHART, seedChart };
