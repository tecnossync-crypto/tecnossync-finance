// Catálogos fiscales DGII
export const NCF_TYPES = [
  { code: 'B01', label: 'Crédito fiscal', needsRnc: true },
  { code: 'B02', label: 'Consumidor final' },
  { code: 'B14', label: 'Régimen especial', needsRnc: true },
  { code: 'B15', label: 'Gubernamental', needsRnc: true },
  { code: 'B16', label: 'Exportaciones' },
  { code: 'E31', label: 'e-CF Crédito fiscal', needsRnc: true },
  { code: 'E32', label: 'e-CF Consumo' },
  { code: 'E44', label: 'e-CF Regímenes especiales', needsRnc: true },
  { code: 'E45', label: 'e-CF Gubernamental', needsRnc: true },
];
export const NCF_CREDIT_NOTE = [{ code: 'B04', label: 'Nota de crédito' }, { code: 'E34', label: 'e-CF Nota de crédito' }];
export const NCF_ALL = [...NCF_TYPES, ...NCF_CREDIT_NOTE, { code: 'B03', label: 'Nota de débito' }, { code: 'B11', label: 'Comprobante de compras' }, { code: 'B13', label: 'Gastos menores' }];

export const NCF_TITLE = {
  B01: 'Factura de Crédito Fiscal', B02: 'Factura de Consumo', B14: 'Factura Régimen Especial', B15: 'Factura Gubernamental',
  B16: 'Factura de Exportación', B04: 'Nota de Crédito', E31: 'Factura de Crédito Fiscal Electrónica', E32: 'Factura de Consumo Electrónica',
  E34: 'Nota de Crédito Electrónica', E44: 'Factura Electrónica Régimen Especial', E45: 'Factura Electrónica Gubernamental',
};

// 606: tipo de bienes y servicios comprados
export const EXPENSE_TYPES = [
  ['01', 'Gastos de personal'], ['02', 'Gastos por trabajos, suministros y servicios'], ['03', 'Arrendamientos'],
  ['04', 'Gastos de activos fijos'], ['05', 'Gastos de representación'], ['06', 'Otras deducciones admitidas'],
  ['07', 'Gastos financieros'], ['08', 'Gastos extraordinarios'], ['09', 'Compras y gastos que forman parte del costo de venta'],
  ['10', 'Adquisiciones de activos'], ['11', 'Gastos de seguros'],
];

// 606: tipo de retención ISR
export const ISR_TYPES = [
  ['01', 'Alquileres'], ['02', 'Honorarios por servicios independientes'], ['03', 'Otras rentas'], ['04', 'Otras rentas (rentas presuntas)'],
  ['05', 'Intereses pagados a personas jurídicas residentes'], ['06', 'Intereses pagados a personas físicas residentes'],
  ['07', 'Retención por proveedores del Estado'], ['08', 'Juegos telefónicos de premios'],
];

// 607: tipo de ingreso
export const INCOME_TYPES = [
  ['01', 'Ingresos por operaciones (no financieros)'], ['02', 'Ingresos financieros'], ['03', 'Ingresos extraordinarios'],
  ['04', 'Ingresos por arrendamientos'], ['05', 'Ingresos por venta de activo depreciable'], ['06', 'Otros ingresos'],
];

export const PAY_METHODS = [
  ['transfer', 'Transferencia'], ['cash', 'Efectivo'], ['check', 'Cheque'], ['card', 'Tarjeta'], ['other', 'Otro'],
];

export const ROLES = {
  owner: 'Dueño', admin: 'Administrador', accountant: 'Contador', operator: 'Operador', viewer: 'Solo lectura',
};
export const LEVEL = { viewer: 0, operator: 1, accountant: 2, admin: 3, owner: 4 };

export const ACCOUNT_TYPES = {
  asset: 'Activo', liability: 'Pasivo', equity: 'Patrimonio', income: 'Ingreso', cost: 'Costo', expense: 'Gasto',
};

export const INVOICE_STATUS = {
  draft: ['Borrador', 'neutral'], issued: ['Pendiente', 'warn'], partial: ['Abono parcial', 'info'], paid: ['Cobrada', 'ok'],
  void: ['Anulada', 'danger'], accepted: ['Aceptada', 'ok'], rejected: ['Rechazada', 'danger'],
};
export const QUOTE_STATUS = { ...INVOICE_STATUS, issued: ['Enviada', 'info'] };
export const EXPENSE_STATUS = { pending: ['Por pagar', 'warn'], partial: ['Abono parcial', 'info'], paid: ['Pagado', 'ok'], void: ['Anulado', 'danger'] };
