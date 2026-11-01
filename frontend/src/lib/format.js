export const money = (n, currency = 'DOP', opts = {}) => {
  const v = Number(n || 0);
  const s = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
  const sym = currency === 'USD' ? 'US$' : 'RD$';
  return `${v < 0 ? '−' : ''}${opts.symbol === false ? '' : sym + ' '}${s}`; // espacio que no se corta: "RD$" nunca queda solo en una línea
};

export const compact = (n) => {
  const v = Math.abs(Number(n || 0));
  const sign = Number(n) < 0 ? '−' : '';
  if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(1)}k`;
  return `${sign}${v.toFixed(0)}`;
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const date = (d) => {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
};
export const dateShort = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
export const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`; };

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const monthStart = () => today().slice(0, 8) + '01';
export const currentPeriod = () => today().slice(0, 7).replace('-', '');

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Número a letras (español), para "son: ..." en facturas
const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce',
  'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function hundreds(n) {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100); const r = n % 100;
  const rest = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '');
  return [C[c], rest].filter(Boolean).join(' ');
}

function words(n) {
  if (n === 0) return 'cero';
  const parts = [];
  const millions = Math.floor(n / 1e6); const thousands = Math.floor((n % 1e6) / 1000); const rest = n % 1000;
  if (millions) parts.push(millions === 1 ? 'un millón' : `${words(millions).replace(/uno$/, 'un')} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${hundreds(thousands).replace(/uno$/, 'un')} mil`);
  if (rest) parts.push(hundreds(rest));
  return parts.join(' ');
}

export function amountInWords(n, currency = 'DOP') {
  const v = Math.abs(Number(n || 0));
  const int = Math.floor(v); const cents = Math.round((v - int) * 100);
  const name = currency === 'USD' ? 'dólares' : 'pesos dominicanos';
  const w = words(int);
  return `${w.charAt(0).toUpperCase() + w.slice(1)} ${name} con ${String(cents).padStart(2, '0')}/100`;
}

// Bruto y neto de una factura. Bruto = lo facturado; neto = lo que realmente te queda después de
// retenciones y del descuento al cobrar (comisión/retención): real en lo cobrado, estimado (% del
// cliente) en lo pendiente.
export function invoiceAmounts(i) {
  const live = !['void', 'draft'].includes(i.status);
  const receivable = live ? round2(i.total - i.itbis_retained - i.isr_retained) : 0;
  const balance = ['issued', 'partial'].includes(i.status) ? round2(receivable - i.paid) : 0;
  const pct = Number(i.fee_pct ?? i.contact_fee_pct ?? 0);
  const fees = live ? Number(i.fees ?? (i.payments || []).reduce((s, p) => s + Number(p.fee || 0), 0)) : 0;
  const received = live ? Number(i.received ?? (i.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0)) : 0;
  const expectedFee = round2(balance * pct / 100);
  const discount = round2(fees + expectedFee);
  return {
    gross: live ? Number(i.total) : 0, retained: live ? round2(i.itbis_retained + i.isr_retained) : 0, receivable, balance,
    fees, expectedFee, discount, net: round2(receivable - discount), received, netPending: round2(balance - expectedFee), pct,
  };
}
