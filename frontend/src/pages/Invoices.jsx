import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, FileText, FileSignature, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { date, dateShort, money, invoiceAmounts } from '../lib/format';
import { INVOICE_STATUS, QUOTE_STATUS } from '../lib/constants';
import { useAuth } from '../lib/auth';
import { Empty, Input, Loading, Money, PageHeader, StatusBadge, Tabs, useData, useToast, cx } from '../components/ui';
import { PaymentModal } from './InvoiceView';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Invoices({ quote }) {
  const { company, can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('estado') || '';
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState(null);
  const docType = quote ? 'quote' : 'invoice';
  const { data, loading, reload } = useData(
    () => api.get(`/invoices?doc_type=${docType}&status=${status}&q=${encodeURIComponent(q)}`), [docType, status, q, company.id]
  );
  const base = quote ? '/cotizaciones' : '/facturas';
  const tabs = quote
    ? [['', 'Todas'], ['draft', 'Borradores'], ['issued', 'Enviadas'], ['accepted', 'Aceptadas'], ['rejected', 'Rechazadas']]
    : [['', 'Todas'], ['open', 'Por cobrar'], ['overdue', 'Vencidas'], ['paid', 'Cobradas'], ['draft', 'Borradores'], ['void', 'Anuladas']];

  const rows = (data || []).map((i) => ({ ...i, a: invoiceAmounts(i), overdue: ['issued', 'partial'].includes(i.status) && i.due_date && i.due_date < todayIso() }));
  const sum = (k) => rows.reduce((s, r) => s + r.a[k], 0);
  const canPay = (i) => !quote && ['issued', 'partial'].includes(i.status) && can('operator');

  return (
    <>
      <PageHeader
        eyebrow={quote ? 'Ventas · Cotizaciones' : 'Ventas · Facturación'}
        title={quote ? 'Cotizaciones' : 'Facturas'}
        subtitle={quote ? 'Propuestas para tus clientes. Conviértelas en factura con un clic cuando las acepten.'
          : 'Bruto es lo facturado; neto es lo que te queda después de comisiones y retenciones. Cobra desde aquí mismo.'}
        actions={can('operator') && <Link to={`${base}/nueva`} className="btn-primary"><Plus size={16} /> {quote ? 'Nueva cotización' : 'Nueva factura'}</Link>}
      />

      {!quote && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
          <Kpi label="Facturado (bruto)" value={sum('gross')} foot={`${rows.filter((r) => r.a.gross).length} factura(s)`} />
          <Kpi label="Comisiones y retenciones" value={sum('discount') + sum('retained')} foot="Lo que no te llega" tone="muted" />
          <Kpi label="Neto para ti" value={sum('net')} foot={`Recibido: ${money(sum('received'))}`} tone="brand" />
          <Kpi label="Por cobrar (neto)" value={sum('netPending')} foot={`Bruto pendiente ${money(sum('balance'))}`} tone={rows.some((r) => r.overdue) ? 'warn' : null} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={tabs} value={status} onChange={(v) => setParams(v ? { estado: v } : {})} />
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input placeholder="Buscar número, NCF o cliente" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Loading /> : !rows.length ? (
          <Empty icon={quote ? FileSignature : FileText} title={quote ? 'Sin cotizaciones' : 'Sin facturas todavía'}
            text={quote ? 'Crea tu primera cotización.' : 'Emite tu primera factura y la verás aquí.'}
            action={can('operator') && <Link to={`${base}/nueva`} className="btn-primary"><Plus size={16} /> Crear</Link>} />
        ) : <>
          {/* Teléfono: tarjetas */}
          <ul className="sm:hidden divide-y divide-line">
            {rows.map((i) => (
              <li key={i.id} className="p-4 active:bg-paper" onClick={() => navigate(`${base}/${i.id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{i.contact_name || 'Consumidor final'}</div>
                    <div className="num text-[12px] text-text-faint">{i.ncf || i.number} · {date(i.date)}</div>
                  </div>
                  <StatusBadge map={quote ? QUOTE_STATUS : INVOICE_STATUS} status={i.status} />
                </div>
                {quote ? <div className="num text-[16px] font-semibold mt-2">{money(i.total)}</div> : (
                  <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
                    <Fig l="Bruto" v={i.a.gross || i.total} />
                    <Fig l={i.a.discount ? `Desc. ${i.a.pct ? `${i.a.pct}%` : ''}` : 'Descuento'} v={-(i.a.discount + i.a.retained)} muted />
                    <Fig l="Neto" v={i.a.net} strong />
                  </div>
                )}
                {canPay(i) && (
                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-line">
                    <div className={cx('text-[12.5px]', i.overdue ? 'text-danger font-semibold' : 'text-text-muted')}>
                      Pendiente <span className="num">{money(i.a.balance)}</span>{i.overdue ? ' · vencida' : ''}
                    </div>
                    <button className="btn-brand btn-sm" onClick={(e) => { e.stopPropagation(); setPaying(i); }}><Wallet size={14} /> Cobrar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Pantallas grandes: tabla */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="ledger min-w-[700px]">
              <thead><tr>
                <th>Documento</th><th>Cliente</th><th>Estado</th>
                {quote ? <th className="r">Total</th> : <><th className="r">Bruto</th><th className="r">Descuento</th><th className="r">Neto</th><th className="r">Pendiente</th></>}
              </tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="row-link" onClick={() => navigate(`${base}/${i.id}`)}>
                    <td className="whitespace-nowrap">
                      <div className="num font-semibold">{i.ncf || i.number}</div>
                      <div className="num text-[11.5px] text-text-faint">{dateShort(i.date)}</div>
                    </td>
                    <td className="max-w-[230px]">
                      <div className="truncate">{i.contact_name || <span className="text-text-faint">Consumidor final</span>}</div>
                      {!quote && i.due_date && i.a.balance > 0 && <div className={cx('text-[11.5px]', i.overdue ? 'text-danger font-semibold' : 'text-text-faint')}>{i.overdue ? 'Venció' : 'Vence'} {dateShort(i.due_date)}</div>}
                    </td>
                    <td><StatusBadge map={quote ? QUOTE_STATUS : INVOICE_STATUS} status={i.status} /></td>
                    {quote ? <td className="r"><Money value={i.total} /></td> : <>
                      <td className="r"><Money value={i.total} className={cx(!i.a.gross && 'text-text-faint line-through')} /></td>
                      <td className="r text-text-muted">
                        {i.a.discount + i.a.retained ? <>
                          <Money value={-(i.a.discount + i.a.retained)} />
                          {i.a.pct > 0 && <div className="text-[11px] text-text-faint">{i.a.pct}%{i.a.expectedFee ? ' (est.)' : ''}</div>}
                        </> : <span className="text-text-faint">—</span>}
                      </td>
                      <td className="r"><Money value={i.a.net} className="font-semibold" /></td>
                      <td className="r whitespace-nowrap">
                        {i.a.balance ? <>
                          <Money value={i.a.balance} className={cx('font-semibold', i.overdue && 'text-danger')} />
                          {canPay(i) && <div><button className="btn-outline btn-sm mt-1.5" onClick={(e) => { e.stopPropagation(); setPaying(i); }}><Wallet size={13} /> Cobrar</button></div>}
                        </> : <span className="text-text-faint">—</span>}
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
              {!quote && (
                <tfoot><tr>
                  <td colSpan={3}>Totales ({rows.length})</td>
                  <td className="r"><Money value={sum('gross')} /></td>
                  <td className="r"><Money value={-(sum('discount') + sum('retained'))} /></td>
                  <td className="r"><Money value={sum('net')} /></td>
                  <td className="r"><Money value={sum('balance')} /></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </>}
      </div>

      {paying && (
        <PaymentModal open onClose={() => setPaying(null)} balance={paying.a.balance} allowFee title={`Cobrar ${paying.ncf || paying.number}`}
          feeDefaults={{ pct: paying.fee_pct, type: paying.fee_type }}
          onSave={async (body) => { await api.post(`/invoices/${paying.id}/payments`, body); setPaying(null); toast('Cobro registrado'); reload(); }} />
      )}
    </>
  );
}

function Kpi({ label, value, foot, tone }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="eyebrow">{label}</div>
      <div className={cx('num text-[16px] sm:text-[22px] font-semibold mt-2.5 leading-none', tone === 'brand' && 'text-brand', tone === 'warn' && 'text-warn', tone === 'muted' && 'text-text-muted')}>{money(value)}</div>
      <div className="text-[11.5px] sm:text-[12px] text-text-muted mt-2 leading-snug">{foot}</div>
    </div>
  );
}

const Fig = ({ l, v, strong, muted }) => (
  <div className="min-w-0">
    <div className="text-text-faint text-[11px]">{l}</div>
    <div className={cx('num truncate', strong && 'font-semibold text-[13.5px]', muted && 'text-text-muted')}>{v ? money(v, 'DOP', { symbol: false }) : '—'}</div>
  </div>
);
