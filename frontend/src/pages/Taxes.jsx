import { useState } from 'react';
import { Download, AlertTriangle, Info } from 'lucide-react';
import { api, download } from '../lib/api';
import { money, date, currentPeriod, MONTHS_LONG } from '../lib/format';
import { Card, Field, Input, Loading, Money, PageHeader, Tabs, useData, useToast, Badge } from '../components/ui';

const fmtPeriod = (p) => `${MONTHS_LONG[Number(p.slice(4)) - 1]} ${p.slice(0, 4)}`;

export default function Taxes() {
  const [tab, setTab] = useState('itbis');
  const [period, setPeriod] = useState(currentPeriod());
  return (
    <>
      <PageHeader eyebrow="Impuestos · DGII" title="Impuestos y formatos de envío"
        subtitle="Genera los TXT del 606, 607 y 608 y el resumen para tu declaración de ITBIS (IT-1)." />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <Tabs tabs={[['itbis', 'Resumen ITBIS (IT-1)'], ['606', '606 · Compras'], ['607', '607 · Ventas'], ['608', '608 · Anulados']]} value={tab} onChange={setTab} />
        <Field label="Período">
          <Input type="month" value={`${period.slice(0, 4)}-${period.slice(4)}`} onChange={(e) => e.target.value && setPeriod(e.target.value.replace('-', ''))} className="w-44" />
        </Field>
      </div>
      {tab === 'itbis' ? <ItbisSummary period={period} /> : <Format code={tab} period={period} />}
      <p className="mt-6 flex items-start gap-2 text-[12px] text-text-muted max-w-3xl">
        <Info size={14} className="shrink-0 mt-0.5" />
        Los archivos siguen la estructura de los formatos de envío de la DGII. Antes de enviarlos, valídalos con la herramienta oficial de pre-validación de la DGII y revisa con tu contador los casos especiales (proporcionalidad, ITBIS llevado al costo, percepciones).
      </p>
    </>
  );
}

function ItbisSummary({ period }) {
  const { data, error } = useData(() => api.get(`/reports/itbis?period=${period}`), [period]);
  if (error) return <div className="card p-6 text-danger">{error.message}</div>;
  if (!data) return <Loading />;
  const L = ({ label, value, strong, neg }) => (
    <div className={`flex justify-between py-2 border-b border-line/70 text-[13.5px] ${strong ? 'font-semibold' : ''}`}><span>{label}</span><Money value={neg ? -value : value} /></div>
  );
  return (
    <div className="grid lg:grid-cols-[1fr_1fr_320px] gap-4 items-start">
      <Card eyebrow="Ventas del período" title="ITBIS cobrado">
        <L label="Ventas gravadas y exentas (neto)" value={data.sales.base} />
        <L label="De las cuales exentas" value={data.sales.exempt} />
        <L label="ITBIS facturado" value={data.sales.itbis} strong />
        <L label="ITBIS retenido por clientes" value={data.sales.itbis_withheld} />
      </Card>
      <Card eyebrow="Compras del período" title="ITBIS pagado">
        <L label="Compras con NCF (base)" value={data.purchases.base} />
        <L label="ITBIS facturado en compras" value={data.purchases.itbis} />
        <L label="ITBIS retenido a proveedores" value={data.purchases.itbis_retained_to_others} neg />
        <L label="ITBIS adelantado deducible" value={data.creditable} strong />
      </Card>
      <div className="rounded-2xl bg-ink text-white p-6">
        <div className="eyebrow !text-white/45">{fmtPeriod(period)}</div>
        <div className="mt-4 text-white/60 text-[13px]">{data.to_pay > 0 ? 'ITBIS a pagar' : 'Saldo a favor'}</div>
        <div className={`num text-[34px] font-semibold leading-none mt-1 ${data.to_pay > 0 ? 'text-lime' : 'text-white'}`}>{money(data.to_pay || data.balance_in_favor)}</div>
        <div className="mt-6 pt-4 border-t border-ink-line space-y-2 text-[13px]">
          <div className="eyebrow !text-white/45 mb-1">Retenciones a pagar (IR-17 / IT-1)</div>
          <div className="flex justify-between text-white/75"><span>ITBIS retenido a terceros</span><span className="num">{money(data.withholdings_to_remit.itbis)}</span></div>
          <div className="flex justify-between text-white/75"><span>ISR retenido a terceros</span><span className="num">{money(data.withholdings_to_remit.isr)}</span></div>
        </div>
      </div>
    </div>
  );
}

function Format({ code, period }) {
  const toast = useToast();
  const { data, error, loading } = useData(() => api.get(`/reports/dgii/${code}?period=${period}`), [code, period]);
  if (error) return <div className="card p-6 text-danger flex items-center gap-2"><AlertTriangle size={16} /> {error.message}</div>;
  if (loading || !data) return <Loading />;
  const warnings = data.rows.filter((r) => r.warning).length;
  return (
    <div className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
        <div>
          <div className="num text-[12px] text-text-muted">{data.header}</div>
          <div className="font-semibold mt-0.5">{data.count} registros · {fmtPeriod(period)}</div>
        </div>
        <div className="flex items-center gap-3">
          {warnings > 0 && <Badge tone="warn"><AlertTriangle size={12} /> {warnings} por revisar</Badge>}
          <button className="btn-primary" disabled={!data.count && code !== '608'}
            onClick={() => download(`/reports/dgii/${code}?period=${period}&format=txt`, data.filename).then(() => toast('Archivo descargado')).catch((e) => toast(e.message, 'error'))}>
            <Download size={15} /> Descargar TXT
          </button>
        </div>
      </header>
      {!data.rows.length ? <p className="text-text-muted text-center py-12">No hay registros en este período. {code !== '608' && 'Se puede enviar el formato "sin movimiento".'}</p> : (
        <div className="overflow-x-auto">
          <table className="ledger min-w-[760px]">
            <thead><tr>
              <th>NCF</th><th>Fecha</th>{code !== '608' && <><th>{code === '606' ? 'RNC proveedor' : 'RNC cliente'}</th><th className="r">Monto</th><th className="r">ITBIS</th><th className="r">Ret. ITBIS</th><th className="r">Ret. ISR</th></>}
              {code === '608' && <th className="r">Total</th>}
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="num font-semibold">{r.ncf}{r.warning && <div className="text-[11.5px] text-warn font-sans font-medium">{r.warning}</div>}</td>
                  <td className="num text-[12.5px]">{date(r.date)}</td>
                  {code !== '608' ? <>
                    <td className="num text-[12.5px]">{r.supplier_tax_id || r.customer_tax_id || '—'}</td>
                    <td className="r"><Money value={r.base} /></td><td className="r"><Money value={r.itbis} /></td>
                    <td className="r"><Money value={r.itbis_retained} /></td><td className="r"><Money value={r.isr_retained} /></td>
                  </> : <td className="r"><Money value={r.total} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
