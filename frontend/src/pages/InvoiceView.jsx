import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Wallet, Ban, Pencil, Copy, Trash2, Check, X, FileMinus, Repeat, ScrollText } from 'lucide-react';
import { api, fetchBlob } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, date, dateShort, today, amountInWords } from '../lib/format';
import { INVOICE_STATUS, QUOTE_STATUS, NCF_TITLE, PAY_METHODS } from '../lib/constants';
import { Field, Input, Loading, Modal, Select, StatusBadge, useData, useToast, ErrorBox, Tabs, Money, cx } from '../components/ui';

export default function InvoiceView({ quote }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { company, can } = useAuth();
  const { data: inv, loading, reload, error } = useData(() => api.get(`/invoices/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [format, setFormat] = useState('letter');
  const [logo, setLogo] = useState(null);
  const base = quote ? '/cotizaciones' : '/facturas';

  useEffect(() => {
    if (!company.has_logo) return;
    let url;
    fetchBlob('/company/logo').then((b) => { url = URL.createObjectURL(b); setLogo(url); }).catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [company.has_logo]);

  useEffect(() => {
    if (!inv) return;
    const prev = document.title;
    document.title = [docTitle(inv, company, quote), inv.ncf || inv.number, inv.contact_name].filter(Boolean).join(' ');
    return () => { document.title = prev; };
  }, [inv, company, quote]);

  if (error) return <div className="max-w-md"><ErrorBox error={error} /></div>;
  if (loading || !inv) return <Loading />;
  const receivable = inv.total - inv.itbis_retained - inv.isr_retained;
  const balance = receivable - inv.paid;

  const act = async (fn, msg) => {
    try { await fn(); toast(msg); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
        <button onClick={() => navigate(base)} className="btn-ghost btn-sm -ml-3"><ArrowLeft size={15} /> {quote ? 'Cotizaciones' : 'Facturas'}</button>
        <div className="flex flex-wrap gap-2">
          <Tabs tabs={[['letter', 'Carta'], ['ticket', 'Ticket 80mm']]} value={format} onChange={setFormat} />
          {inv.status === 'draft' && can('operator') && <>
            <button className="btn-ghost" onClick={() => act(() => api.del(`/invoices/${id}`).then(() => navigate(base)), 'Borrador eliminado')}><Trash2 size={15} /></button>
            <Link to={`${base}/${id}/editar`} className="btn-outline"><Pencil size={15} /> Editar</Link>
            <button className="btn-brand" onClick={() => act(() => api.post(`/invoices/${id}/issue`), quote ? 'Cotización enviada' : 'Factura emitida')}>
              <Check size={15} /> {quote ? 'Marcar enviada' : 'Emitir'}
            </button>
          </>}
          {quote && inv.status === 'issued' && can('operator') && <>
            <button className="btn-outline" onClick={() => act(() => api.post(`/invoices/${id}/status`, { status: 'rejected' }), 'Marcada como rechazada')}><X size={15} /> Rechazada</button>
            <button className="btn-brand" onClick={async () => { try { const f = await api.post(`/invoices/${id}/convert`, {}); toast('Factura creada como borrador'); navigate(`/facturas/${f.id}`); } catch (e) { toast(e.message, 'error'); } }}>
              <Copy size={15} /> Convertir en factura
            </button>
          </>}
          {!quote && ['issued', 'partial'].includes(inv.status) && inv.doc_type === 'invoice' && can('operator') && (
            <button className="btn-brand" onClick={() => setPaying(true)}><Wallet size={15} /> Registrar cobro</button>
          )}
          {!quote && inv.doc_type === 'invoice' && ['issued', 'partial', 'paid'].includes(inv.status) && company.is_formal && can('accountant') && (
            <Link to={`/facturas/${id}/nota-credito`} className="btn-outline"><FileMinus size={15} /> Nota de crédito</Link>
          )}
          {!quote && inv.doc_type === 'invoice' && inv.contact_id && can('operator') && (
            inv.recurring_id
              ? <Link to={`/recurrentes/${inv.recurring_id}`} className="btn-outline"><Repeat size={15} /> Ver cobro recurrente</Link>
              : <Link to={`/recurrentes/nuevo?desde=${id}`} className="btn-outline"><Repeat size={15} /> Hacer recurrente</Link>
          )}
          {!quote && inv.contact_id && <Link to={`/clientes/${inv.contact_id}/estado`} className="btn-ghost" title="Estado de cuenta del cliente"><ScrollText size={15} /></Link>}
          {!quote && !['void', 'draft'].includes(inv.status) && can('accountant') && (
            <button className="btn-danger" onClick={() => setVoiding(true)}><Ban size={15} /> Anular</button>
          )}
          <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Imprimir / PDF</button>
        </div>
      </div>

      <div className={cx('grid gap-6 items-start', format === 'letter' ? 'xl:grid-cols-[1fr_300px]' : 'lg:grid-cols-[auto_1fr]')}>
        {format === 'letter' ? <LetterSheet inv={inv} company={company} logo={logo} quote={quote} /> : <TicketSheet inv={inv} company={company} quote={quote} />}

        <aside className="no-print space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Estado</span><StatusBadge map={quote ? QUOTE_STATUS : INVOICE_STATUS} status={inv.status} /></div>
            {!quote && inv.doc_type === 'invoice' && <>
              <div className="mt-4 space-y-1.5 text-[13.5px]">
                <div className="flex justify-between"><span className="text-text-muted">A cobrar</span><Money value={receivable} /></div>
                <div className="flex justify-between"><span className="text-text-muted">Cobrado</span><Money value={inv.paid} /></div>
              </div>
              <div className="flex justify-between items-end mt-3 pt-3 border-t border-line">
                <span className="font-semibold">Pendiente</span>
                <Money value={inv.status === 'void' ? 0 : balance} className="text-[20px] font-semibold" />
              </div>
            </>}
          </div>
          {inv.payments?.length > 0 && (
            <div className="card p-5">
              <div className="eyebrow mb-3">Cobros</div>
              <ul className="space-y-3">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 text-[13px]">
                    <div><div className="font-semibold">{money(p.amount)}</div><div className="text-text-muted text-[12px]">{date(p.date)} · {p.bank_name}{p.reference ? ` · ${p.reference}` : ''}</div></div>
                    {can('accountant') && <button className="text-text-faint hover:text-danger" title="Eliminar cobro" onClick={() => act(() => api.del(`/invoices/${id}/payments/${p.id}`), 'Cobro eliminado')}><Trash2 size={14} /></button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inv.ref_number && <div className="card p-5 text-[13px]"><span className="eyebrow block mb-1">Afecta a</span><span className="num">{inv.ref_ncf || inv.ref_number}</span></div>}
        </aside>
      </div>

      <PaymentModal open={paying} onClose={() => setPaying(false)} balance={balance}
        onSave={async (body) => { await api.post(`/invoices/${id}/payments`, body); setPaying(false); toast('Cobro registrado'); reload(); }} title="Registrar cobro" />
      <VoidModal open={voiding} onClose={() => setVoiding(false)} ncf={inv.ncf}
        onConfirm={async (reason) => { await api.post(`/invoices/${id}/void`, { reason }); setVoiding(false); toast('Factura anulada'); reload(); }} />
    </>
  );
}

function docTitle(inv, company, quote) {
  if (quote) return 'Cotización';
  if (inv.doc_type === 'credit_note') return 'Nota de crédito';
  if (company.is_formal && inv.ncf_type) return NCF_TITLE[inv.ncf_type] || 'Factura';
  return 'Factura';
}

// Plantilla carta: pensada para imprimir o "Guardar como PDF" en una hoja carta limpia.
function LetterSheet({ inv, company, logo, quote }) {
  const accent = company.accent_color || '#8B2FC9';
  const tint = `${accent}12`;
  const showItbis = company.charges_itbis;
  const isInvoice = !quote && inv.doc_type === 'invoice';
  const net = inv.total - inv.itbis_retained - inv.isr_retained;
  const balance = net - inv.paid;
  const stamp = inv.status === 'void' ? ['ANULADA', '#C8423B'] : isInvoice && inv.status === 'paid' ? ['PAGADA', '#14855F'] : null;
  const m = (v) => money(v, inv.currency, { symbol: false });
  const label = 'text-[9.5px] font-semibold uppercase tracking-[0.16em]';

  return (
    <article className="print-sheet invoice-sheet card bg-white w-full max-w-[860px] sm:min-h-[1100px] mx-auto text-[12.5px] leading-[1.5] text-[#1c1a24] tabular-nums flex flex-col overflow-hidden">
      <div className="h-[6px] shrink-0" style={{ background: accent }} />
      <div className="relative flex-1 flex flex-col px-8 sm:px-12 pt-9 pb-8">
        {stamp && (
          <div className="absolute right-10 top-[150px] rotate-[-12deg] rounded-md border-[3px] px-4 py-1 font-display text-[26px] font-extrabold tracking-[0.2em] opacity-80 pointer-events-none"
            style={{ color: stamp[1], borderColor: stamp[1] }}>{stamp[0]}</div>
        )}
        {inv.status === 'draft' && <div className="mb-5 rounded-md border border-dashed border-line-strong text-text-muted text-center text-[12px] py-1 no-print">Borrador — aún no tiene validez</div>}

        {/* Encabezado: emisor y documento */}
        <header className="flex flex-col sm:flex-row justify-between gap-8">
          <div className="flex gap-4 min-w-0">
            {logo && <img src={logo} alt="" className="h-[68px] w-[68px] object-contain shrink-0" />}
            <div className="min-w-0">
              <div className="font-display text-[21px] font-bold leading-tight">{company.trade_name || company.name}</div>
              {company.trade_name && company.trade_name !== company.name && <div className="text-[11.5px] text-[#6b6778]">{company.name}</div>}
              <div className="mt-1.5 text-[11.5px] text-[#55515f] leading-[1.6]">
                {company.is_formal && company.rnc && <div>RNC <span className="font-semibold text-[#1c1a24]">{company.rnc}</span></div>}
                {company.address && <div>{company.address}</div>}
                <div>{[company.phone, company.email, company.website].filter(Boolean).join('  ·  ')}</div>
              </div>
            </div>
          </div>
          <div className="sm:text-right shrink-0">
            <div className="font-display text-[24px] font-extrabold uppercase tracking-[0.04em] leading-none" style={{ color: accent }}>{docTitle(inv, company, quote)}</div>
            <div className="mt-3 inline-block text-left rounded-lg border border-[#e4e1ea] overflow-hidden">
              {inv.ncf ? <>
                <div className="px-3.5 py-2" style={{ background: tint }}>
                  <div className={label} style={{ color: accent }}>NCF</div>
                  <div className="text-[16px] font-bold tracking-wide">{inv.ncf}</div>
                </div>
                {inv.ncf_expires_at && <div className="px-3.5 py-1.5 text-[11px] text-[#55515f] border-t border-[#e4e1ea]">Válido hasta {dateShort(inv.ncf_expires_at)}</div>}
              </> : (
                <div className="px-3.5 py-2" style={{ background: tint }}>
                  <div className={label} style={{ color: accent }}>No.</div>
                  <div className="text-[16px] font-bold tracking-wide">{inv.number}</div>
                </div>
              )}
            </div>
            {inv.ref_ncf && <div className="text-[11px] text-[#55515f] mt-2">Modifica NCF <span className="font-semibold">{inv.ref_ncf}</span></div>}
          </div>
        </header>

        {/* Cliente y datos del documento */}
        <section className="mt-9 grid sm:grid-cols-[1.3fr_1fr] gap-5">
          <div className="rounded-lg border border-[#e4e1ea] p-4">
            <div className={label + ' text-[#8a8597] mb-1.5'}>{quote ? 'Preparada para' : 'Facturar a'}</div>
            <div className="font-semibold text-[14.5px]">{inv.contact_name || 'Consumidor final'}</div>
            <div className="text-[11.5px] text-[#55515f] leading-[1.6] mt-0.5">
              {inv.contact_tax_id && <div>{inv.contact_id_type === 'cedula' ? 'Cédula' : 'RNC'} {inv.contact_tax_id}</div>}
              {inv.contact_address && <div>{inv.contact_address}</div>}
              {[inv.contact_phone, inv.contact_email].filter(Boolean).join('  ·  ')}
            </div>
          </div>
          <dl className="rounded-lg border border-[#e4e1ea] p-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] content-start">
            <dt className="text-[#8a8597]">Fecha</dt><dd className="text-right font-medium">{dateShort(inv.date)}</dd>
            {inv.due_date && <><dt className="text-[#8a8597]">{quote ? 'Válida hasta' : 'Vencimiento'}</dt><dd className="text-right font-medium">{dateShort(inv.due_date)}</dd></>}
            {inv.payment_terms && <><dt className="text-[#8a8597]">Condición</dt><dd className="text-right font-medium">{inv.payment_terms}</dd></>}
            {inv.period && <><dt className="text-[#8a8597]">Período</dt><dd className="text-right font-medium capitalize">{inv.period}</dd></>}
            {inv.ncf && <><dt className="text-[#8a8597]">Referencia</dt><dd className="text-right font-medium">{inv.number}</dd></>}
          </dl>
        </section>

        {/* Detalle */}
        <table className="w-full mt-7 text-[12px] border-collapse">
          <thead>
            <tr style={{ background: accent, color: '#fff' }} className={label}>
              <th className="py-2.5 pl-3 pr-2 text-left w-8">#</th>
              <th className="py-2.5 px-2 text-left">Descripción</th>
              <th className="py-2.5 px-2 text-right w-14">Cant.</th>
              <th className="py-2.5 px-2 text-right w-24">Precio</th>
              {inv.discount > 0 && <th className="py-2.5 px-2 text-right w-20">Desc.</th>}
              {showItbis && <th className="py-2.5 px-2 text-right w-20">ITBIS</th>}
              <th className="py-2.5 pl-2 pr-3 text-right w-28">Importe</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it.id} className="align-top border-b border-[#ecebf0] break-inside-avoid" style={i % 2 ? { background: '#faf9fc' } : undefined}>
                <td className="py-2.5 pl-3 pr-2 text-[#8a8597]">{i + 1}</td>
                <td className="py-2.5 px-2">{it.description}</td>
                <td className="py-2.5 px-2 text-right">{Number(it.qty)}</td>
                <td className="py-2.5 px-2 text-right">{m(it.price)}</td>
                {inv.discount > 0 && <td className="py-2.5 px-2 text-right">{it.discount ? m(it.discount) : '—'}</td>}
                {showItbis && <td className="py-2.5 px-2 text-right">{it.itbis ? m(it.itbis) : 'Exento'}</td>}
                <td className="py-2.5 pl-2 pr-3 text-right font-semibold">{m(it.qty * it.price - it.discount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales y notas */}
        <section className="mt-6 grid sm:grid-cols-[1fr_270px] gap-8 break-inside-avoid">
          <div className="space-y-4 text-[11.5px] text-[#3d3a46]">
            <div><span className="text-[#8a8597]">Son: </span><span className="italic">{amountInWords(inv.total, inv.currency)}</span></div>
            {inv.notes && <div>
              <div className={label + ' text-[#8a8597] mb-1'}>Notas</div>
              <div className="whitespace-pre-line">{inv.notes}</div>
            </div>}
            {!quote && company.payment_instructions && (
              <div className="rounded-lg p-3.5" style={{ background: tint }}>
                <div className={label + ' mb-1'} style={{ color: accent }}>Datos para pago</div>
                <div className="whitespace-pre-line text-[#1c1a24]">{company.payment_instructions}</div>
              </div>
            )}
          </div>
          <div className="text-[12.5px]">
            <Line label="Subtotal" value={inv.subtotal} c={inv.currency} />
            {inv.discount > 0 && <Line label="Descuento" value={-inv.discount} c={inv.currency} />}
            {showItbis && <Line label="ITBIS" value={inv.itbis} c={inv.currency} />}
            <div className="flex justify-between items-center mt-2 rounded-md px-3 py-2.5 text-white" style={{ background: accent }}>
              <span className="font-semibold uppercase tracking-wider text-[11px]">Total</span>
              <span className="text-[17px] font-bold">{money(inv.total, inv.currency)}</span>
            </div>
            {inv.itbis_retained > 0 && <Line label="ITBIS retenido" value={-inv.itbis_retained} c={inv.currency} />}
            {inv.isr_retained > 0 && <Line label="ISR retenido" value={-inv.isr_retained} c={inv.currency} />}
            {(inv.itbis_retained > 0 || inv.isr_retained > 0) && <Line label="Neto a pagar" value={net} c={inv.currency} bold />}
            {isInvoice && inv.paid > 0 && inv.status !== 'void' && <>
              <Line label="Pagado" value={-inv.paid} c={inv.currency} />
              <div className="flex justify-between items-baseline mt-1 pt-2 border-t-2 border-[#1c1a24]">
                <span className="font-semibold">Balance pendiente</span>
                <span className="font-bold">{money(Math.max(0, balance), inv.currency)}</span>
              </div>
            </>}
          </div>
        </section>

        {/* Pie: firmas y nota de la empresa, siempre al final de la hoja */}
        <footer className="mt-auto pt-14 break-inside-avoid">
          {!quote && (
            <div className="grid grid-cols-2 gap-16 text-[11px] text-[#6b6778]">
              <div className="pt-1.5 border-t border-[#b9b5c3] text-center">Despachado por</div>
              <div className="pt-1.5 border-t border-[#b9b5c3] text-center">Recibido conforme</div>
            </div>
          )}
          {quote && <p className="text-[11px] text-[#6b6778]">Precios en {inv.currency === 'USD' ? 'dólares' : 'pesos dominicanos'}{company.charges_itbis ? ', ITBIS incluido en el total' : ''}. Cotización sujeta a aprobación.</p>}
          {company.invoice_footer && <p className="mt-6 text-center text-[11px] text-[#6b6778] whitespace-pre-line">{company.invoice_footer}</p>}
          <div className="mt-6 pt-3 border-t border-[#ecebf0] flex justify-between text-[10px] text-[#a19cad]">
            <span>{company.trade_name || company.name}{company.is_formal && company.rnc ? ` · RNC ${company.rnc}` : ''}</span>
            <span>{inv.ncf || inv.number}</span>
          </div>
        </footer>
      </div>
    </article>
  );
}

function TicketSheet({ inv, company, quote }) {
  return (
    <article className="print-sheet print-ticket card bg-white p-5 w-[302px] font-mono text-[11.5px] text-black leading-snug">
      <style>{'@media print { @page { size: 80mm auto; margin: 3mm; } }'}</style>
      <div className="text-center">
        <div className="font-bold text-[13px]">{company.trade_name || company.name}</div>
        {company.is_formal && company.rnc && <div>RNC {company.rnc}</div>}
        {company.address && <div>{company.address}</div>}
        {company.phone && <div>Tel. {company.phone}</div>}
      </div>
      <div className="border-t border-dashed border-black my-2" />
      <div className="text-center font-bold uppercase">{docTitle(inv, company, quote)}</div>
      {inv.ncf ? <div>NCF: {inv.ncf}</div> : <div>No.: {inv.number}</div>}
      {inv.ncf_expires_at && <div>Válido hasta: {dateShort(inv.ncf_expires_at)}</div>}
      <div>Fecha: {dateShort(inv.date)}</div>
      {inv.contact_name && <div>Cliente: {inv.contact_name}</div>}
      {inv.contact_tax_id && <div>RNC/Céd.: {inv.contact_tax_id}</div>}
      <div className="border-t border-dashed border-black my-2" />
      {inv.items.map((it) => (
        <div key={it.id} className="mb-1">
          <div>{it.description}</div>
          <div className="flex justify-between"><span>{Number(it.qty)} x {money(it.price, 'DOP', { symbol: false })}</span><span>{money(it.qty * it.price - it.discount, 'DOP', { symbol: false })}</span></div>
        </div>
      ))}
      <div className="border-t border-dashed border-black my-2" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(inv.subtotal - inv.discount, 'DOP', { symbol: false })}</span></div>
      {company.charges_itbis && <div className="flex justify-between"><span>ITBIS</span><span>{money(inv.itbis, 'DOP', { symbol: false })}</span></div>}
      <div className="flex justify-between font-bold text-[13px] mt-1"><span>TOTAL</span><span>{money(inv.total)}</span></div>
      {inv.doc_type === 'invoice' && inv.paid > 0 && inv.status !== 'void' && <>
        <div className="flex justify-between"><span>Pagado</span><span>{money(inv.paid, 'DOP', { symbol: false })}</span></div>
        <div className="flex justify-between font-bold"><span>Pendiente</span><span>{money(inv.total - inv.itbis_retained - inv.isr_retained - inv.paid, 'DOP', { symbol: false })}</span></div>
      </>}
      <div className="border-t border-dashed border-black my-2" />
      <div className="text-center">{company.invoice_footer || '¡Gracias por su compra!'}</div>
    </article>
  );
}

const Line = ({ label, value, c, bold }) => (
  <div className={cx('flex justify-between py-1', bold && 'font-semibold')}><span className="text-[#55515f]">{label}</span><span>{money(value, c)}</span></div>
);

export function PaymentModal({ open, onClose, onSave, balance, title }) {
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    api.get('/banks').then((b) => { setBanks(b); setForm({ amount: balance.toFixed(2), date: today(), method: 'transfer', bank_account_id: b.find((x) => x.kind === 'bank')?.id || b[0]?.id, reference: '' }); });
  }, [open, balance]);
  const save = async () => { try { await onSave(form); } catch (e) { setError(e); } };
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monto" className="col-span-2" hint={`Pendiente: ${money(balance)}`}><Input type="number" step="0.01" className="num text-right text-[16px]" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Fecha"><Input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Método"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Cuenta" className="col-span-2"><Select value={form.bank_account_id || ''} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Referencia" className="col-span-2"><Input value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="No. de transferencia, cheque…" /></Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </div>
    </Modal>
  );
}

function VoidModal({ open, onClose, onConfirm, ncf }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  return (
    <Modal open={open} onClose={onClose} title="Anular factura"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn bg-danger text-white hover:opacity-90" onClick={() => onConfirm(reason).catch(setError)}>Anular</button></>}>
      <p className="text-text-muted text-[13.5px] mb-4">Se revertirá el asiento contable. {ncf && <>El NCF <b className="num text-text">{ncf}</b> quedará reportado en el formato 608.</>}</p>
      <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Error en datos del cliente" /></Field>
      <div className="mt-3"><ErrorBox error={error} /></div>
    </Modal>
  );
}
