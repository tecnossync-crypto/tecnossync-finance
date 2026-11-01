import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, UserPlus, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, today, addDays, round2 } from '../lib/format';
import { NCF_TYPES, NCF_CREDIT_NOTE, INCOME_TYPES } from '../lib/constants';
import { Card, Field, Input, Select, Textarea, Loading, ErrorBox, useToast, cx } from '../components/ui';
import { ContactModal } from './Contacts';

const blankLine = () => ({ key: Math.random(), product_id: '', description: '', qty: 1, price: '', discount: '', itbis_rate: null, kind: 'service' });

export default function InvoiceEditor({ quote }) {
  const { id } = useParams();
  const { pathname } = useLocation();
  const creditNote = pathname.endsWith('/nota-credito');
  const navigate = useNavigate();
  const toast = useToast();
  const { company } = useAuth();
  const base = quote ? '/cotizaciones' : '/facturas';
  const [contacts, setContacts] = useState([]);
  const [products, setProducts] = useState([]);
  const [newContact, setNewContact] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!id);
  const [terms, setTerms] = useState(30);
  const [form, setForm] = useState({
    contact_id: '', date: today(), due_date: addDays(today(), 30), ncf_type: company.is_formal ? 'B02' : '',
    income_type: '01', itbis_retention_pct: 0, isr_retention_pct: 0, notes: '', payment_terms: '', items: [blankLine()],
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const defaultRate = company.charges_itbis ? Number(company.itbis_rate) : 0;

  useEffect(() => {
    api.get('/contacts?kind=customer').then(setContacts);
    api.get('/products').then(setProducts);
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get(`/invoices/${id}`).then((inv) => {
      const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
      setForm({
        contact_id: inv.contact_id || '', date: creditNote ? today() : inv.date, due_date: inv.due_date || '',
        ncf_type: creditNote ? 'B04' : inv.ncf_type || '', income_type: inv.income_type, notes: creditNote ? `Nota de crédito que afecta ${inv.ncf || inv.number}` : inv.notes || '',
        payment_terms: inv.payment_terms || '',
        itbis_retention_pct: pct(inv.itbis_retained, inv.itbis), isr_retention_pct: pct(inv.isr_retained, inv.subtotal - inv.discount),
        items: inv.items.map((it) => ({ ...it, key: it.id })),
      });
      setReady(true);
    });
  }, [id, creditNote]);

  const ncfOptions = creditNote ? NCF_CREDIT_NOTE : NCF_TYPES;
  const contact = contacts.find((c) => String(c.id) === String(form.contact_id));
  const ncfMeta = NCF_TYPES.find((n) => n.code === form.ncf_type);

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, itbis = 0;
    for (const l of form.items) {
      const gross = Number(l.qty || 0) * Number(l.price || 0);
      const d = Number(l.discount || 0);
      const rate = company.charges_itbis ? Number(l.itbis_rate ?? defaultRate) : 0;
      subtotal += gross; discount += d; itbis += round2((gross - d) * rate / 100);
    }
    const total = round2(subtotal - discount + itbis);
    const itbisRet = round2(itbis * form.itbis_retention_pct / 100);
    const isrRet = round2((subtotal - discount) * form.isr_retention_pct / 100);
    return { subtotal, discount, itbis, total, itbisRet, isrRet, receivable: round2(total - itbisRet - isrRet) };
  }, [form, company.charges_itbis, defaultRate]);

  const setLine = (key, patch) => set({ items: form.items.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const pickProduct = (key, pid) => {
    const p = products.find((x) => String(x.id) === pid);
    setLine(key, p ? { product_id: p.id, description: p.name, price: p.price, itbis_rate: Number(p.itbis_rate), kind: p.kind } : { product_id: '' });
  };

  const save = async (issue) => {
    setBusy(true); setError(null);
    try {
      const body = { ...form, issue, doc_type: quote ? 'quote' : creditNote ? 'credit_note' : 'invoice', ref_invoice_id: creditNote ? Number(id) : undefined,
        items: form.items.map((l) => ({ ...l, itbis_rate: l.itbis_rate ?? defaultRate })) };
      const inv = id && !creditNote ? await api.put(`/invoices/${id}`, body) : await api.post('/invoices', body);
      toast(issue ? (quote ? 'Cotización lista' : 'Factura emitida y contabilizada') : 'Borrador guardado');
      navigate(`${base}/${inv.id}`, { replace: true });
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  if (!ready) return <Loading />;
  const title = quote ? (id ? 'Editar cotización' : 'Nueva cotización') : creditNote ? 'Nota de crédito' : id ? 'Editar factura' : 'Nueva factura';

  return (
    <>
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm -ml-3 mb-3"><ArrowLeft size={15} /> Volver</button>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="eyebrow mb-2">{company.is_formal ? 'Comprobante fiscal' : 'Documento interno'}</div>
          <h1 className="text-[30px] font-semibold leading-none">{title}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" disabled={busy} onClick={() => save(false)}>Guardar borrador</button>
          <button className="btn-primary" disabled={busy} onClick={() => save(true)}><Send size={15} /> {quote ? 'Guardar y enviar' : 'Emitir'}</button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          <Card>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
              <Field label="Cliente" className="sm:col-span-2">
                <div className="flex gap-2">
                  <Select value={form.contact_id} onChange={(e) => set({ contact_id: e.target.value })}>
                    <option value="">Consumidor final</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.tax_id ? ` · ${c.tax_id}` : ''}</option>)}
                  </Select>
                  <button type="button" onClick={() => setNewContact(true)} className="btn-outline px-3" title="Nuevo cliente"><UserPlus size={16} /></button>
                </div>
              </Field>
              <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value, due_date: addDays(e.target.value, terms) })} /></Field>
              {quote ? (
                <Field label="Válida hasta"><Input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} /></Field>
              ) : (
                <Field label="Condición">
                  <Select value={terms} onChange={(e) => { const t = Number(e.target.value); setTerms(t); set({ due_date: addDays(form.date, t), payment_terms: t ? `Crédito ${t} días` : 'Contado' }); }}>
                    <option value={0}>Contado</option><option value={15}>Crédito 15 días</option><option value={30}>Crédito 30 días</option>
                    <option value={45}>Crédito 45 días</option><option value={60}>Crédito 60 días</option>
                  </Select>
                </Field>
              )}
              {company.is_formal && !quote && (
                <>
                  <Field label="Tipo de comprobante" className="sm:col-span-2">
                    <Select value={form.ncf_type} onChange={(e) => set({ ncf_type: e.target.value })}>
                      {ncfOptions.map((n) => <option key={n.code} value={n.code}>{n.code} — {n.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Tipo de ingreso (607)" className="sm:col-span-2">
                    <Select value={form.income_type} onChange={(e) => set({ income_type: e.target.value })}>
                      {INCOME_TYPES.map(([c, l]) => <option key={c} value={c}>{c} — {l}</option>)}
                    </Select>
                  </Field>
                </>
              )}
            </div>
            {ncfMeta?.needsRnc && !contact?.tax_id && (
              <div className="mt-4 rounded-lg bg-warn-50 text-warn px-3 py-2 text-[13px] font-medium">
                {form.ncf_type} requiere un cliente con RNC o cédula registrado.
              </div>
            )}
          </Card>

          <Card pad={false}>
            <div className="overflow-x-auto">
              <table className="ledger min-w-[720px]">
                <thead><tr>
                  <th className="w-[40%]">Descripción</th><th className="r w-20">Cant.</th><th className="r w-32">Precio</th><th className="r w-28">Desc.</th>
                  {company.charges_itbis && <th className="r w-24">ITBIS</th>}<th className="r w-32">Importe</th><th className="w-10" />
                </tr></thead>
                <tbody>
                  {form.items.map((l) => {
                    const net = Number(l.qty || 0) * Number(l.price || 0) - Number(l.discount || 0);
                    return (
                      <tr key={l.key} className="align-top">
                        <td className="!py-2">
                          {products.length > 0 && (
                            <select value={l.product_id || ''} onChange={(e) => pickProduct(l.key, e.target.value)} className="w-full mb-1.5 text-[12px] text-text-muted bg-transparent outline-none">
                              <option value="">— Elegir del catálogo —</option>
                              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                          <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Producto o servicio" />
                        </td>
                        <td className="!py-2 align-bottom"><Input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="num text-right" /></td>
                        <td className="!py-2 align-bottom"><Input type="number" min="0" step="0.01" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} className="num text-right" placeholder="0.00" /></td>
                        <td className="!py-2 align-bottom"><Input type="number" min="0" step="0.01" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} className="num text-right" placeholder="0.00" /></td>
                        {company.charges_itbis && (
                          <td className="!py-2 align-bottom">
                            <select value={l.itbis_rate ?? defaultRate} onChange={(e) => setLine(l.key, { itbis_rate: Number(e.target.value) })} className="input num text-right px-2">
                              <option value={18}>18%</option><option value={16}>16%</option><option value={0}>Exento</option>
                            </select>
                          </td>
                        )}
                        <td className="!py-2 align-bottom r"><div className="h-10 flex items-center justify-end num font-semibold">{money(net, 'DOP', { symbol: false })}</div></td>
                        <td className="!py-2 align-bottom">
                          <button onClick={() => set({ items: form.items.length > 1 ? form.items.filter((x) => x.key !== l.key) : [blankLine()] })} className="h-10 w-8 grid place-items-center text-text-faint hover:text-danger"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-line">
              <button className="btn-ghost btn-sm" onClick={() => set({ items: [...form.items, blankLine()] })}><Plus size={15} /> Agregar línea</button>
            </div>
          </Card>

          <Card>
            <div className="pt-5"><Field label="Notas / condiciones (se imprimen en el documento)"><Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ej. Cuenta para transferencias: Banco Popular 000-000000-0" /></Field></div>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-6 space-y-4">
          <div className="rounded-2xl bg-ink text-white p-5">
            <div className="eyebrow !text-white/45 mb-4">Resumen</div>
            <Row label="Subtotal" value={totals.subtotal} />
            {totals.discount > 0 && <Row label="Descuentos" value={-totals.discount} />}
            {company.charges_itbis && <Row label="ITBIS" value={totals.itbis} />}
            <div className="flex items-end justify-between pt-4 mt-3 border-t border-ink-line">
              <span className="text-white/60 text-[13px]">Total</span>
              <span className="num text-[28px] font-semibold text-lime leading-none">{money(totals.total)}</span>
            </div>
            {(totals.itbisRet > 0 || totals.isrRet > 0) && (
              <div className="mt-4 pt-3 border-t border-ink-line space-y-1.5">
                {totals.itbisRet > 0 && <Row label="ITBIS retenido por cliente" value={-totals.itbisRet} />}
                {totals.isrRet > 0 && <Row label="ISR retenido por cliente" value={-totals.isrRet} />}
                <Row label="Neto a cobrar" value={totals.receivable} strong />
              </div>
            )}
          </div>
          {company.is_formal && !quote && (
            <Card title="Retenciones del cliente" eyebrow="Si te retienen">
              <div className="grid grid-cols-2 gap-3">
                <Field label="ITBIS">
                  <Select value={form.itbis_retention_pct} onChange={(e) => set({ itbis_retention_pct: Number(e.target.value) })}>
                    <option value={0}>No</option><option value={30}>30%</option><option value={75}>75%</option><option value={100}>100%</option>
                  </Select>
                </Field>
                <Field label="ISR">
                  <Select value={form.isr_retention_pct} onChange={(e) => set({ isr_retention_pct: Number(e.target.value) })}>
                    <option value={0}>No</option><option value={2}>2%</option><option value={5}>5%</option><option value={10}>10%</option><option value={27}>27%</option>
                  </Select>
                </Field>
              </div>
              <p className="text-[12px] text-text-muted mt-3">Común cuando facturas servicios a personas jurídicas o al Estado.</p>
            </Card>
          )}
          <ErrorBox error={error} />
        </aside>
      </div>

      <ContactModal open={newContact} onClose={() => setNewContact(false)} defaultKind="customer"
        onSaved={(c) => { setContacts((x) => [...x, c]); set({ contact_id: c.id }); setNewContact(false); }} />
    </>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={cx('flex justify-between py-1 text-[13.5px]', strong ? 'font-semibold text-white' : 'text-white/75')}>
      <span>{label}</span><span className="num">{money(value)}</span>
    </div>
  );
}
