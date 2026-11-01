import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, date, today } from '../lib/format';
import { Field, Input, Loading, Money, PageHeader, Tabs, useData, cx, Badge } from '../components/ui';
import PdfButton from '../components/PdfButton';

const TABS = [['pl', 'Estado de resultados'], ['bs', 'Balance general'], ['tb', 'Balanza de comprobación'], ['ar', 'Cuentas por cobrar'], ['ap', 'Cuentas por pagar']];

export default function Reports() {
  const { company } = useAuth();
  const [tab, setTab] = useState('pl');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  return (
    <>
      <PageHeader eyebrow="Contabilidad · Reportes" title="Estados financieros"
        actions={<>
          <PdfButton className="btn-outline" name={`${TABS.find(([k]) => k === tab)[1]} ${company.name} ${to}`} />
        </>} />
      <div className="no-print flex flex-wrap items-end justify-between gap-3 mb-5">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        {['pl', 'tb', 'bs'].includes(tab) && (
          <div className="flex gap-3">
            {tab !== 'bs' && <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>}
            <Field label={tab === 'bs' ? 'Al' : 'Hasta'}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
          </div>
        )}
      </div>
      <div className="print-sheet card p-6 sm:p-9">
        <div className="text-center mb-7">
          <div className="font-display text-[20px] font-semibold">{company.name}</div>
          {company.rnc && <div className="text-[12px] text-text-muted">RNC {company.rnc}</div>}
          <div className="eyebrow mt-2">{TABS.find(([k]) => k === tab)[1]}</div>
          <div className="text-[12.5px] text-text-muted mt-1">
            {tab === 'bs' ? `Al ${date(to)}` : ['pl', 'tb'].includes(tab) ? `Del ${date(from)} al ${date(to)}` : `Al ${date(today())}`} · Valores en RD$
          </div>
        </div>
        {tab === 'pl' && <IncomeStatement from={from} to={to} />}
        {tab === 'bs' && <BalanceSheet to={to} />}
        {tab === 'tb' && <TrialBalance from={from} to={to} />}
        {tab === 'ar' && <Aging kind="receivable" />}
        {tab === 'ap' && <Aging kind="payable" />}
      </div>
    </>
  );
}

function StatementRows({ rows }) {
  return rows.map((r) => {
    const depth = r.code.split('.').length - 1;
    return (
      <div key={r.id} className={cx('flex justify-between py-1.5 border-b border-line/60 text-[13.5px]', !r.is_postable && 'font-semibold')} style={{ paddingLeft: depth * 18 }}>
        <span><span className="num text-[11.5px] text-text-faint mr-2">{r.code}</span>{r.name}</span>
        <span className="num">{money(r.balance, 'DOP', { symbol: false })}</span>
      </div>
    );
  });
}

function Total({ label, value, big, tone }) {
  return (
    <div className={cx('flex justify-between items-baseline py-2.5 mt-1 border-t-2 border-text font-semibold', big && 'text-[17px]')}>
      <span>{label}</span><span className={cx('num', tone === 'auto' && value < 0 && 'text-danger', tone === 'auto' && value >= 0 && 'text-brand')}>{money(value)}</span>
    </div>
  );
}

function IncomeStatement({ from, to }) {
  const { data } = useData(() => api.get(`/reports/income-statement?from=${from}&to=${to}`), [from, to]);
  if (!data) return <Loading />;
  const part = (t) => data.rows.filter((r) => r.type === t && r.code.split('.').length > 1);
  return (
    <div className="max-w-2xl mx-auto">
      <h4 className="eyebrow mb-2">Ingresos</h4><StatementRows rows={part('income')} />
      <Total label="Total ingresos" value={data.totals.income} />
      {data.totals.cost !== 0 && <><h4 className="eyebrow mb-2 mt-6">Costos</h4><StatementRows rows={part('cost')} /><Total label="Utilidad bruta" value={data.totals.gross} /></>}
      <h4 className="eyebrow mb-2 mt-6">Gastos operativos</h4><StatementRows rows={part('expense')} />
      <Total label="Total gastos" value={data.totals.expense} />
      <div className="mt-6 rounded-xl bg-ink text-white px-5 py-4 flex justify-between items-baseline">
        <span className="font-semibold">{data.totals.net >= 0 ? 'Utilidad neta' : 'Pérdida neta'}</span>
        <span className={cx('num text-[22px] font-semibold', data.totals.net >= 0 ? 'text-lime' : 'text-[#FF8F86]')}>{money(data.totals.net)}</span>
      </div>
    </div>
  );
}

function BalanceSheet({ to }) {
  const { data } = useData(() => api.get(`/reports/balance-sheet?to=${to}`), [to]);
  if (!data) return <Loading />;
  const part = (t) => data.rows.filter((r) => r.type === t && r.code.split('.').length > 1);
  return (
    <div className="grid lg:grid-cols-2 gap-10">
      <div>
        <h4 className="eyebrow mb-2">Activos</h4><StatementRows rows={part('asset')} />
        <Total label="Total activos" value={data.totals.assets} big />
      </div>
      <div>
        <h4 className="eyebrow mb-2">Pasivos</h4><StatementRows rows={part('liability')} />
        <Total label="Total pasivos" value={data.totals.liabilities} />
        <h4 className="eyebrow mb-2 mt-6">Patrimonio</h4><StatementRows rows={part('equity')} />
        <div className="flex justify-between py-1.5 border-b border-line/60 text-[13.5px]" style={{ paddingLeft: 18 }}><span>Resultado del período</span><span className="num">{money(data.totals.result, 'DOP', { symbol: false })}</span></div>
        <Total label="Total patrimonio" value={data.totals.equity} />
        <Total label="Pasivo + patrimonio" value={data.totals.liabilities + data.totals.equity} big />
        <div className={cx('mt-3 flex items-center gap-2 text-[13px] font-semibold', data.totals.balanced ? 'text-brand' : 'text-danger')}>
          {data.totals.balanced ? <><Check size={16} /> El balance cuadra</> : <><AlertTriangle size={15} /> El balance no cuadra — revisa los asientos</>}
        </div>
      </div>
    </div>
  );
}

function TrialBalance({ from, to }) {
  const { data } = useData(() => api.get(`/reports/trial-balance?from=${from}&to=${to}`), [from, to]);
  if (!data) return <Loading />;
  return (
    <div className="overflow-x-auto">
      <table className="ledger min-w-[640px]">
        <thead><tr><th>Código</th><th>Cuenta</th><th className="r">Débitos</th><th className="r">Créditos</th><th className="r">Saldo deudor</th><th className="r">Saldo acreedor</th></tr></thead>
        <tbody>
          {data.rows.map((r) => {
            const net = r.debit - r.credit;
            return (
              <tr key={r.id}>
                <td className="num text-[12.5px]">{r.code}</td><td>{r.name}</td>
                <td className="r num">{money(r.debit, 'DOP', { symbol: false })}</td><td className="r num">{money(r.credit, 'DOP', { symbol: false })}</td>
                <td className="r num">{net > 0 ? money(net, 'DOP', { symbol: false }) : ''}</td><td className="r num">{net < 0 ? money(-net, 'DOP', { symbol: false }) : ''}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr>
          <td colSpan={2}><span className="flex items-center gap-2">Totales {data.totals.balanced ? <Badge tone="ok"><Check size={12} /> Cuadra</Badge> : <Badge tone="danger">No cuadra</Badge>}</span></td>
          <td className="r num">{money(data.totals.debit, 'DOP', { symbol: false })}</td><td className="r num">{money(data.totals.credit, 'DOP', { symbol: false })}</td><td /><td />
        </tr></tfoot>
      </table>
    </div>
  );
}

const BUCKETS = [['current', 'Por vencer'], ['d30', '1–30 días'], ['d60', '31–60'], ['d90', '61–90'], ['d90p', '+90 días']];

function Aging({ kind }) {
  const { data } = useData(() => api.get(`/reports/aging/${kind}`), [kind]);
  if (!data) return <Loading />;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {BUCKETS.map(([k, l]) => (
          <div key={k} className={cx('rounded-xl border p-3.5', k === 'd90p' && data.buckets[k] > 0 ? 'border-danger/40 bg-danger-50' : 'border-line')}>
            <div className="eyebrow">{l}</div><div className="num font-semibold text-[16px] mt-1.5">{money(data.buckets[k])}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead><tr><th>{kind === 'receivable' ? 'Cliente' : 'Proveedor'}</th><th>Documento</th><th>Fecha</th><th>Vence</th><th className="r">Días vencido</th><th className="r">Saldo</th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.contact || '—'}</td><td className="num text-[12.5px]">{r.ncf || r.doc}</td>
                <td className="num text-[12.5px] text-text-muted">{date(r.date)}</td><td className="num text-[12.5px] text-text-muted">{date(r.due_date)}</td>
                <td className={cx('r num', r.days_overdue > 0 && 'text-danger font-semibold')}>{r.days_overdue || '—'}</td>
                <td className="r"><Money value={r.balance} className="font-semibold" />{r.currency === 'USD' && <div className="num text-[11px] text-text-faint">{money(r.balance_fx, 'USD')}</div>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>Total</td><td className="r"><Money value={data.total} /></td></tr></tfoot>
        </table>
      </div>
    </>
  );
}
