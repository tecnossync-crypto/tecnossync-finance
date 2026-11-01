import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Field, Input, Select } from './ui';

export const CURRENCIES = [['DOP', 'RD$ pesos'], ['USD', 'US$ dólares']];

// Última tasa del dólar registrada (la del contexto puede estar vieja si se usó una nueva en otra pantalla)
export function useUsdRate() {
  const [rate, setRate] = useState(null);
  useEffect(() => { api.get('/auth/me').then((m) => setRate(m.company.usd_rate ? Number(m.company.usd_rate) : null)).catch(() => {}); }, []);
  return rate;
}

export function CurrencySelect({ value, onChange, disabled, className }) {
  return (
    <Field label="Moneda" className={className}>
      <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {CURRENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
    </Field>
  );
}

export function RateField({ value, onChange, label = 'Tasa del dólar', hint = 'Pesos por cada US$ (tasa del día)', className, disabled }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-[13px]">RD$</span>
        <Input type="number" step="0.0001" min="0" className="num text-right pl-11" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="60.00" />
      </div>
    </Field>
  );
}
