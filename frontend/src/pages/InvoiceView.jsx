import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Wallet, Ban, Pencil, Copy, Trash2, Check, X, FileMinus } from 'lucide-react';
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
  const { data: inv, loading, reload } = useData(() => api.get(`/invoices/${id}`), [id]);
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

function LetterSheet({ inv, company, logo, quote }) {
  const accent = company.accent_color || '#8B2FC9';
  const showItbis = company.charges_itbis;
  return (
    <article className="print-sheet card bg-white p-6 sm:p-10 max-w-[860px] w-full mx-auto text-[13px] text-[#111]">
      {inv.status === 'void' && <div className="mb-6 rounded-md border-2 border-danger text-danger text-center font-display font-semibold tracking-widest py-1">ANULADA</div>}
      {inv.status === 'draft' && <div className="mb-6 rounded-md border border-dashed border-line-strong text-text-muted text-center text-[12px] py-1 no-print">Borrador — aún no tiene validez</div>}
      <header className="flex flex-col sm:flex-row justify-between gap-6 pb-6" style={{ borderBottom: `3px solid ${accent}` }}>
        <div className="flex gap-4">
          {logo && <img src={logo} alt="" className="h-16 w-16 object-contain" />}
          <div>
            <div className="font-display text-[22px] font-semibold leading-tight">{company.trade_name || company.name}</div>
            {company.trade_name && <div className="text-[12px] text-[#555]">{company.name}</div>}
            <div className="text-[12px] text-[#555] mt-1 leading-relaxed">
              {company.is_formal && company.rnc && <div>RNC: <b className="num">{company.rnc}</b></div>}
              {company.address && <div>{company.address}</div>}
              {[company.phone, company.email].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="font-display text-[19px] font-semibold uppercase tracking-wide" style={{ color: accent }}>{docTitle(inv, company, quote)}</div>
          {inv.ncf ? (
            <>
              <div className="mt-2 text-[12px] text-[#555]">NCF</div>
              <div className="num text-[17px] font-semibold">{inv.ncf}</div>
              {inv.ncf_expires_at && <div className="text-[11.5px] text-[#555]">Válido hasta: {dateShort(inv.ncf_expires_at)}</div>}
            </>
          ) : <div className="num text-[17px] font-semibold mt-2">{inv.number}</div>}
          {inv.ref_ncf && <div className="text-[11.5px] text-[#555] mt-1">Modifica NCF: <span className="num">{inv.ref_ncf}</span></div>}
        </div>
      </header>

      <section className="grid sm:grid-cols-[1.4fr_1fr] gap-6 py-6">
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-[#777] mb-1.5">{quote ? 'Preparada para' : 'Facturar a'}</div>
          <div className="font-semibold text-[15px]">{inv.contact_name || 'Consumidor final'}</div>
          <div className="text-[12.5px] text-[#555] leading-relaxed">
            {inv.contact_tax_id && <div>{inv.contact_id_type === 'cedula' ? 'Cédula' : 'RNC'}: <span className="num">{inv.contact_tax_id}</span></div>}
            {inv.contact_address && <div>{inv.contact_address}</div>}
            {[inv.contact_phone, inv.contact_email].filter(Boolean).join(' · ')}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] content-start">
          <dt className="text-[#777]">Fecha</dt><dd className="num text-right">{dateShort(inv.date)}</dd>
          {inv.due_date && <><dt className="text-[#777]">{quote ? 'Válida hasta' : 'Vence'}</dt><dd className="num text-right">{dateShort(inv.due_date)}</dd></>}
          {inv.payment_terms && <><dt className="text-[#777]">Condición</dt><dd className="text-right">{inv.payment_terms}</dd></>}
          {inv.ncf && <><dt className="text-[#777]">Referencia</dt><dd className="num text-right">{inv.number}</dd></>}
        </dl>
      </section>

      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] font-mono uppercase tracking-[0.12em] text-[#666]" style={{ borderBottom: '1.5px solid #111' }}>
            <th className="py-2 pr-2">Descripción</th><th className="py-2 px-2 text-right">Cant.</th><th className="py-2 px-2 text-right">Precio</th>
            <th className="py-2 px-2 text-right">Desc.</th>{showItbis && <th className="py-2 px-2 text-right">ITBIS</th>}<th className="py-2 pl-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it) => (
            <tr key={it.id} className="border-b border-[#e6e6e6] align-top">
              <td className="py-2.5 pr-2">{it.description}</td>
              <td className="py-2.5 px-2 text-right num">{Number(it.qty)}</td>
              <td className="py-2.5 px-2 text-right num">{money(it.price, inv.currency, { symbol: false })}</td>
              <td className="py-2.5 px-2 text-right num">{it.discount ? money(it.discount, inv.currency, { symbol: false }) : '—'}</td>
              {showItbis && <td className="py-2.5 px-2 text-right num">{it.itbis ? money(it.itbis, inv.currency, { symbol: false }) : 'E'}</td>}
              <td className="py-2.5 pl-2 text-right num font-semibold">{money(it.qty * it.price - it.discount, inv.currency, { symbol: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="grid sm:grid-cols-[1fr_280px] gap-8 mt-6">
        <div className="text-[12px] text-[#444] space-y-3">
          <div><span className="text-[#777]">Son: </span><i>{amountInWords(inv.total, inv.currency)}</i></div>
          {inv.notes && <div className="whitespace-pre-line rounded-md bg-[#f6f7f3] p-3">{inv.notes}</div>}
        </div>
        <div className="text-[13px]">
          <Line label="Subtotal" value={inv.subtotal} c={inv.currency} />
          {inv.discount > 0 && <Line label="Descuento" value={-inv.discount} c={inv.currency} />}
          {showItbis && <Line label="ITBIS" value={inv.itbis} c={inv.currency} />}
          <div className="flex justify-between items-baseline mt-2 pt-2.5" style={{ borderTop: '1.5px solid #111' }}>
            <span className="font-semibold">Total</span><span className="num text-[19px] font-semibold">{money(inv.total, inv.currency)}</span>
          </div>
          {inv.itbis_retained > 0 && <Line label="ITBIS retenido" value={-inv.itbis_retained} c={inv.currency} />}
          {inv.isr_retained > 0 && <Line label="ISR retenido" value={-inv.isr_retained} c={inv.currency} />}
          {(inv.itbis_retained > 0 || inv.isr_retained > 0) && <Line label="Neto a pagar" value={inv.total - inv.itbis_retained - inv.isr_retained} c={inv.currency} bold />}
        </div>
      </section>

      <footer className="mt-14 grid sm:grid-cols-2 gap-10 text-[11.5px] text-[#666]">
        <div className="pt-2 border-t border-[#999] text-center">Despachado por</div>
        <div className="pt-2 border-t border-[#999] text-center">Recibido conforme</div>
      </footer>
      {company.invoice_footer && <p className="mt-8 text-center text-[11px] text-[#777] whitespace-pre-line">{company.invoice_footer}</p>}
    </article>
  );
}

function TicketSheet({ inv, company, quote }) {
  return (
    <article className="print-sheet print-ticket card bg-white p-5 w-[302px] font-mono text-[11.5px] text-black leading-snug">
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
      <div className="border-t border-dashed border-black my-2" />
      <div className="text-center">{company.invoice_footer || '¡Gracias por su compra!'}</div>
    </article>
  );
}

const Line = ({ label, value, c, bold }) => (
  <div className={cx('flex justify-between py-1', bold && 'font-semibold')}><span className="text-[#555]">{label}</span><span className="num">{money(value, c)}</span></div>
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
