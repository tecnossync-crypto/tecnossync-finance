import { Link, useNavigate } from 'react-router-dom';
import { Plus, Repeat, Pause, Play, Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateShort, money } from '../lib/format';
import { FREQUENCIES } from '../lib/constants';
import { Badge, Empty, Loading, PageHeader, Stat, useData, useToast, cx } from '../components/ui';

const FREQ = Object.fromEntries(FREQUENCIES);

// Total por cobro de una plantilla (misma regla que el servidor)
function cycleTotal(r, company) {
  return r.items.reduce((s, i) => {
    const net = Number(i.qty) * Number(i.price) - Number(i.discount || 0);
    return s + net + (company.charges_itbis ? net * Number(i.itbis_rate || 0) / 100 : 0);
  }, 0);
}

export default function Recurring() {
  const { company, can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, reload } = useData(() => api.get('/recurring'), [company.id]);
  if (loading || !data) return <Loading />;
  const { items, today } = data;
  const active = items.filter((r) => r.active);
  // en pesos: los cobros en US$ se convierten con la última tasa registrada
  const toDop = (r) => cycleTotal(r, company) * (r.currency === 'USD' ? Number(company.usd_rate || 0) : 1);
  const monthly = active.reduce((s, r) => s + toDop(r) / r.every_months, 0);
  const due = active.filter((r) => r.next_date <= today).length;

  const act = async (fn, msg) => { try { const r = await fn(); toast(msg(r)); reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <>
      <PageHeader eyebrow="Ventas · Cobros recurrentes" title="Cobros recurrentes"
        subtitle="Igualas, mantenimientos, hosting, soporte… Defines el cobro una vez y la factura se genera sola en cada período."
        actions={can('operator') && <>
          {due > 0 && <button className="btn-outline" onClick={() => act(() => api.post('/recurring/run'), (r) => `${r.created} factura(s) generada(s)`)}><RefreshCw size={15} /> Generar pendientes ({due})</button>}
          <Link to="/recurrentes/nuevo" className="btn-primary"><Plus size={16} /> Nuevo cobro</Link>
        </>} />

      {items.length === 0 ? (
        <div className="card"><Empty icon={Repeat} title="Aún no tienes cobros recurrentes"
          text="Crea uno para cada cliente al que le cobras lo mismo cada mes. También puedes abrir una factura y tocar «Hacer recurrente»."
          action={can('operator') && <Link to="/recurrentes/nuevo" className="btn-primary"><Plus size={16} /> Nuevo cobro</Link>} /></div>
      ) : <>
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <Stat label="Ingreso recurrente mensual" value={monthly} foot={`${active.length} cobro(s) activo(s)`} tone="brand" />
          <Stat label="Al año" value={monthly * 12} foot="Si todos se cobran" />
          <div className="card p-5">
            <span className="eyebrow">Cómo funciona</span>
            <p className="text-[12.5px] text-text-muted mt-2 leading-relaxed">El sistema revisa cada hora. Al llegar la fecha crea la factura{company.is_formal ? ' con su NCF' : ''}, la contabiliza y agenda la siguiente.</p>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="ledger min-w-[760px]">
            <thead><tr><th>Cobro</th><th>Frecuencia</th><th>Próximo</th><th>Última factura</th><th className="r">Por cobro</th><th className="w-40" /></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className={cx('row-link', !r.active && 'opacity-55')} onClick={() => navigate(`/recurrentes/${r.id}`)}>
                  <td>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-[12px] text-text-faint">{r.contact_name}{!r.auto_issue && ' · queda en borrador'}</div>
                    {r.last_error && <div className="mt-1 flex items-center gap-1 text-[12px] text-warn"><AlertTriangle size={12} /> {r.last_error}</div>}
                  </td>
                  <td>{FREQ[r.every_months]}</td>
                  <td>
                    {r.active ? <>
                      <div className="num">{dateShort(r.next_date)}</div>
                      {r.next_date <= today ? <Badge tone="warn">Pendiente</Badge> : r.end_date ? <div className="text-[11.5px] text-text-faint">hasta {dateShort(r.end_date)}</div> : null}
                    </> : <Badge>Pausado</Badge>}
                  </td>
                  <td>{r.last_invoice ? <Link onClick={(e) => e.stopPropagation()} to={`/facturas/${r.last_invoice.id}`} className="num text-brand hover:underline">{r.last_invoice.ncf || r.last_invoice.number}</Link> : <span className="text-text-faint">—</span>}
                    <div className="text-[11.5px] text-text-faint">{r.invoice_count} generada(s)</div></td>
                  <td className="r num font-semibold">{money(cycleTotal(r, company), r.currency)}</td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    {can('operator') && <div className="flex justify-end gap-1">
                      {r.active && <button className="btn-ghost btn-sm" title="Generar la próxima factura ahora"
                        onClick={() => act(() => api.post(`/recurring/${r.id}/generate`), (x) => `Factura ${x.number} generada`)}><Zap size={14} /> Facturar ya</button>}
                      <button className="btn-ghost btn-sm" title={r.active ? 'Pausar' : 'Reanudar'}
                        onClick={() => act(() => api.post(`/recurring/${r.id}/active`, { active: !r.active }), () => (r.active ? 'Cobro pausado' : 'Cobro reanudado'))}>
                        {r.active ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </>
  );
}
