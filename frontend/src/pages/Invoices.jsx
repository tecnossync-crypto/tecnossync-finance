import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, FileText, FileSignature } from 'lucide-react';
import { api } from '../lib/api';
import { date } from '../lib/format';
import { INVOICE_STATUS, QUOTE_STATUS } from '../lib/constants';
import { useAuth } from '../lib/auth';
import { Empty, Input, Loading, Money, PageHeader, StatusBadge, Tabs, useData, cx } from '../components/ui';

export default function Invoices({ quote }) {
  const { company, can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('estado') || '';
  const [q, setQ] = useState('');
  const docType = quote ? 'quote' : 'invoice';
  const { data, loading } = useData(
    () => api.get(`/invoices?doc_type=${docType}&status=${status}&q=${encodeURIComponent(q)}`), [docType, status, q, company.id]
  );
  const base = quote ? '/cotizaciones' : '/facturas';
  const tabs = quote
    ? [['', 'Todas'], ['draft', 'Borradores'], ['issued', 'Enviadas'], ['accepted', 'Aceptadas'], ['rejected', 'Rechazadas']]
    : [['', 'Todas'], ['open', 'Por cobrar'], ['overdue', 'Vencidas'], ['paid', 'Cobradas'], ['draft', 'Borradores'], ['void', 'Anuladas']];
  const totals = (data || []).filter((i) => i.status !== 'void' && i.status !== 'draft').reduce(
    (s, i) => ({ total: s.total + i.total, open: s.open + (['issued', 'partial'].includes(i.status) ? i.total - i.itbis_retained - i.isr_retained - i.paid : 0) }), { total: 0, open: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow={quote ? 'Ventas · Cotizaciones' : 'Ventas · Facturación'}
        title={quote ? 'Cotizaciones' : 'Facturas'}
        subtitle={quote ? 'Propuestas para tus clientes. Conviértelas en factura con un clic cuando las acepten.'
          : company.is_formal ? 'Facturas con NCF/e-CF, ITBIS y retenciones. Cada factura emitida se contabiliza sola.' : 'Facturas con tu numeración interna. Cada factura emitida se contabiliza sola.'}
        actions={can('operator') && <Link to={`${base}/nueva`} className="btn-primary"><Plus size={16} /> {quote ? 'Nueva cotización' : 'Nueva factura'}</Link>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={tabs} value={status} onChange={(v) => setParams(v ? { estado: v } : {})} />
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input placeholder="Buscar número, NCF o cliente" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Loading /> : !data.length ? (
          <Empty icon={quote ? FileSignature : FileText} title={quote ? 'Sin cotizaciones' : 'Sin facturas todavía'}
            text={quote ? 'Crea tu primera cotización.' : 'Emite tu primera factura y la verás aquí.'}
            action={can('operator') && <Link to={`${base}/nueva`} className="btn-primary"><Plus size={16} /> Crear</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger min-w-[760px]">
              <thead><tr>
                <th>Documento</th><th>Cliente</th><th>Fecha</th>{!quote && <th>Vence</th>}<th>Estado</th><th className="r">Total</th>{!quote && <th className="r">Pendiente</th>}
              </tr></thead>
              <tbody>
                {data.map((i) => {
                  const pending = i.total - i.itbis_retained - i.isr_retained - i.paid;
                  const overdue = ['issued', 'partial'].includes(i.status) && i.due_date && i.due_date < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={i.id} className="row-link" onClick={() => navigate(`${base}/${i.id}`)}>
                      <td>
                        <div className="num font-semibold">{i.ncf || i.number}</div>
                        {i.ncf && <div className="num text-[11.5px] text-text-faint">{i.number}</div>}
                      </td>
                      <td className="max-w-[240px] truncate">{i.contact_name || <span className="text-text-faint">Consumidor final</span>}</td>
                      <td className="num text-text-muted text-[12.5px]">{date(i.date)}</td>
                      {!quote && <td className={cx('num text-[12.5px]', overdue ? 'text-danger font-semibold' : 'text-text-muted')}>{date(i.due_date)}</td>}
                      <td><StatusBadge map={quote ? QUOTE_STATUS : INVOICE_STATUS} status={i.status} /></td>
                      <td className="r"><Money value={i.total} /></td>
                      {!quote && <td className="r">{['issued', 'partial'].includes(i.status) ? <Money value={pending} className="font-semibold" /> : <span className="text-text-faint">—</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
              {!quote && (
                <tfoot><tr>
                  <td colSpan={5}>Totales ({data.length})</td>
                  <td className="r"><Money value={totals.total} /></td>
                  <td className="r"><Money value={totals.open} /></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </>
  );
}
