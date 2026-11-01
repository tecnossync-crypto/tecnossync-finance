import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { api, fetchBlob } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateShort, money, today } from '../lib/format';
import { ErrorBox, Input, Loading, Tabs, useData, cx } from '../components/ui';

const KIND = { invoice: 'Factura', credit_note: 'Nota de crédito', payment: 'Pago recibido', expense: 'Compra / gasto' };
const AGING = [['current', 'Al día'], ['d30', '1–30 días'], ['d60', '31–60 días'], ['d90', '61–90 días'], ['d90p', '+90 días']];

// Estado de cuenta imprimible de un cliente (por cobrar) o proveedor (por pagar)
export default function Statement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { company } = useAuth();
  const [logo, setLogo] = useState(null);
  const from = params.get('desde') || `${today().slice(0, 4)}-01-01`;
  const to = params.get('hasta') || today();
  const side = params.get('lado') || '';
  const currency = params.get('moneda') || '';
  const { data, loading, error } = useData(() => api.get(`/contacts/${id}/statement?from=${from}&to=${to}${side ? `&side=${side}` : ''}${currency ? `&currency=${currency}` : ''}`), [id, from, to, side, currency]);
  const setParam = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  useEffect(() => {
    if (!company.has_logo) return;
    let url;
    fetchBlob('/company/logo').then((b) => { url = URL.createObjectURL(b); setLogo(url); }).catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [company.has_logo]);

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = `Estado de cuenta ${data.contact.name} ${data.to}`;
    return () => { document.title = prev; };
  }, [data]);

  if (error) return <div className="max-w-md"><ErrorBox error={error} /></div>;
  if (loading || !data) return <Loading />;
  const c = data.contact;
  const supplier = data.side === 'supplier';
  const cur = data.currency || 'DOP';
  const accent = company.accent_color || '#8B2FC9';
  const docLink = (l) => (l.kind === 'expense' || (supplier && l.kind === 'payment') ? `/gastos?ver=${l.doc_id}` : `/facturas/${l.doc_id}`);

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-3"><ArrowLeft size={15} /> Volver</button>
        <div className="flex flex-wrap items-center gap-2">
          {data.currencies?.length > 1 && <Tabs tabs={data.currencies.map((x) => [x, x === 'USD' ? 'US$' : 'RD$'])} value={cur} onChange={(v) => setParam('moneda', v)} />}
          {c.kind === 'both' && <Tabs tabs={[['customer', 'Por cobrar'], ['supplier', 'Por pagar']]} value={data.side} onChange={(v) => setParam('lado', v)} />}
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => setParam('desde', e.target.value)} />
          <span className="text-text-faint">→</span>
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => setParam('hasta', e.target.value)} />
          <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Imprimir / PDF</button>
        </div>
      </div>

      <article className="print-sheet card bg-white p-4 sm:p-10 max-w-[900px] w-full mx-auto text-[13px] text-[#111]">
        <header className="flex flex-col sm:flex-row justify-between gap-6 pb-6" style={{ borderBottom: `3px solid ${accent}` }}>
          <div className="flex gap-4">
            {logo && <img src={logo} alt="" className="h-16 w-16 object-contain" />}
            <div>
              <div className="font-display text-[22px] font-semibold leading-tight">{company.trade_name || company.name}</div>
              <div className="text-[12px] text-[#555] mt-1 leading-relaxed">
                {company.is_formal && company.rnc && <div>RNC: <b className="num">{company.rnc}</b></div>}
                {company.address && <div>{company.address}</div>}
                {[company.phone, company.email].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-display text-[19px] font-semibold uppercase tracking-wide" style={{ color: accent }}>Estado de cuenta</div>
            <div className="text-[12px] text-[#555] mt-1">{supplier ? 'Cuentas por pagar' : 'Cuentas por cobrar'}{cur === 'USD' ? ' · en dólares (US$)' : ''}</div>
            <div className="num text-[12.5px] mt-2">{dateShort(data.from)} — {dateShort(data.to)}</div>
          </div>
        </header>

        <section className="grid sm:grid-cols-[1.3fr_1fr] gap-6 py-6">
          <div>
            <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-[#777] mb-1.5">{supplier ? 'Proveedor' : 'Cliente'}</div>
            <div className="font-semibold text-[15px]">{c.name}</div>
            <div className="text-[12.5px] text-[#555] leading-relaxed">
              {c.tax_id && <div>{c.id_type === 'cedula' ? 'Cédula' : 'RNC'}: <span className="num">{c.tax_id}</span></div>}
              {c.address && <div>{c.address}</div>}
              {[c.phone, c.email].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="rounded-lg p-4 text-[12.5px] space-y-1.5" style={{ background: '#F6F4FA' }}>
            <Row label="Balance anterior" value={data.opening} c={cur} />
            <Row label={supplier ? 'Compras del período' : 'Facturado en el período'} value={data.charges} c={cur} />
            <Row label={supplier ? 'Pagos del período' : 'Pagos y créditos'} value={-data.credits} c={cur} />
            <div className="flex justify-between items-baseline pt-2 mt-1" style={{ borderTop: '1.5px solid #111' }}>
              <span className="font-semibold">{supplier ? 'Saldo a pagar' : 'Saldo pendiente'}</span>
              <span className="num text-[18px] font-semibold">{money(data.closing, cur)}</span>
            </div>
          </div>
        </section>

        <div className="doc-scroll"><table className="w-full min-w-[540px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] font-mono uppercase tracking-[0.12em] text-[#666]" style={{ borderBottom: '1.5px solid #111' }}>
              <th className="py-2 pr-2">Fecha</th><th className="py-2 px-2">Documento</th><th className="py-2 px-2">Detalle</th>
              <th className="py-2 px-2 text-right">Cargos</th><th className="py-2 px-2 text-right">Abonos</th><th className="py-2 pl-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#e6e6e6] text-[#555]">
              <td className="py-2 pr-2 num">{dateShort(data.from)}</td><td className="py-2 px-2" colSpan={4}>Balance anterior</td>
              <td className="py-2 pl-2 text-right num">{money(data.opening, cur, { symbol: false })}</td>
            </tr>
            {data.lines.map((l, i) => (
              <tr key={i} className="border-b border-[#e6e6e6] align-top">
                <td className="py-2 pr-2 num whitespace-nowrap">{dateShort(l.date)}</td>
                <td className="py-2 px-2">
                  <div>{KIND[l.kind]}</div>
                  {l.ref && <Link to={docLink(l)} className="num text-[11.5px] text-[#666] hover:underline">{l.ref}</Link>}
                </td>
                <td className="py-2 px-2 text-[#555]">{l.detail ? PAY_LABEL(l.detail) : l.due_date ? `Vence ${dateShort(l.due_date)}` : ''}</td>
                <td className="py-2 px-2 text-right num">{l.charge ? money(l.charge, cur, { symbol: false }) : ''}</td>
                <td className="py-2 px-2 text-right num">{l.credit ? money(l.credit, cur, { symbol: false }) : ''}</td>
                <td className="py-2 pl-2 text-right num font-semibold">{money(l.balance, cur, { symbol: false })}</td>
              </tr>
            ))}
            {data.lines.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#777]">Sin movimientos en el período.</td></tr>}
          </tbody>
        </table></div>

        {data.open.length > 0 && (
          <section className="mt-8">
            <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-[#777] mb-2">Documentos pendientes al día de hoy</div>
            <div className="doc-scroll"><table className="w-full min-w-[540px] text-[12.5px]">
              <thead><tr className="text-left text-[10.5px] font-mono uppercase tracking-[0.12em] text-[#666] border-b border-[#bbb]">
                <th className="py-1.5 pr-2">Documento</th><th className="py-1.5 px-2">Fecha</th><th className="py-1.5 px-2">Vence</th>
                <th className="py-1.5 px-2 text-right">Días vencido</th><th className="py-1.5 pl-2 text-right">Pendiente</th>
              </tr></thead>
              <tbody>
                {data.open.map((o) => (
                  <tr key={o.id} className="border-b border-[#eee]">
                    <td className="py-1.5 pr-2"><span className="num">{o.ref || '—'}</span>{o.detail && <span className="text-[#777]"> · {o.detail}</span>}</td>
                    <td className="py-1.5 px-2 num">{dateShort(o.date)}</td>
                    <td className="py-1.5 px-2 num">{dateShort(o.due_date)}</td>
                    <td className={cx('py-1.5 px-2 text-right num', o.days_overdue > 0 && 'text-[#C8423B] font-semibold')}>{o.days_overdue || '—'}</td>
                    <td className="py-1.5 pl-2 text-right num font-semibold">{money(o.balance, cur, { symbol: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="grid grid-cols-3 sm:grid-cols-5 mt-4 rounded-lg overflow-hidden border border-[#ddd] text-center">
              {AGING.map(([k, l]) => (
                <div key={k} className="py-2.5 px-1 border-r last:border-r-0 border-[#ddd]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#777]">{l}</div>
                  <div className={cx('num text-[13px] font-semibold mt-0.5', k !== 'current' && data.aging[k] > 0 && 'text-[#C8423B]')}>{money(data.aging[k], cur, { symbol: false })}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!supplier && company.payment_instructions && (
          <section className="mt-8 rounded-lg p-4 text-[12.5px]" style={{ background: '#F6F4FA' }}>
            <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-[#777] mb-1.5">Datos para pago</div>
            <div className="whitespace-pre-line">{company.payment_instructions}</div>
          </section>
        )}
        <p className="mt-8 text-center text-[11px] text-[#777]">
          {supplier ? 'Estado de cuenta según nuestros registros.' : 'Si ya realizó su pago, por favor ignore este estado o envíenos el comprobante. ¡Gracias!'}
        </p>
      </article>
    </>
  );
}

const PAY = { cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', card: 'Tarjeta', credit: 'Crédito', other: 'Otro' };
const PAY_LABEL = (d) => d.split(' · ').map((x, i) => (i === 0 && PAY[x]) || x).join(' · ');

const Row = ({ label, value, c }) => (
  <div className="flex justify-between"><span className="text-[#555]">{label}</span><span className="num">{money(value, c)}</span></div>
);
