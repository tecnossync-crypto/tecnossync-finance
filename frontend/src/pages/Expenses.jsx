import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Receipt, UploadCloud, Paperclip, FileImage, UserPlus, Ban, Wallet } from 'lucide-react';
import { api, fetchBlob } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, date, today, round2 } from '../lib/format';
import { EXPENSE_STATUS, EXPENSE_TYPES, ISR_TYPES, PAY_METHODS } from '../lib/constants';
import { Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Select, StatusBadge, Tabs, Toggle, useData, useToast, cx } from '../components/ui';
import { ContactModal } from './Contacts';
import { PaymentModal } from './InvoiceView';

function Dropzone({ file, onFile }) {
  const ref = useRef();
  const [over, setOver] = useState(false);
  return (
    <div onClick={() => ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}
      className={cx('cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition', over ? 'border-brand bg-brand-50' : 'border-line-strong hover:border-brand/60 bg-paper/50')}>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <div className="flex items-center justify-center gap-2 text-[13px] font-semibold"><Paperclip size={15} className="text-brand" /> {file.name}</div>
      ) : (
        <>
          <UploadCloud size={22} className="mx-auto text-text-faint" />
          <div className="text-[13px] font-semibold mt-1.5">Sube la foto o PDF del comprobante</div>
          <div className="text-[12px] text-text-muted">Arrastra aquí o toca para elegir · máx. 10 MB</div>
        </>
      )}
    </div>
  );
}

function ExpenseModal({ open, onClose, onSaved }) {
  const { company } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [file, setFile] = useState(null);
  const [newSupplier, setNewSupplier] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (!open) return;
    setFile(null); setError(null);
    setForm({ date: today(), description: '', contact_id: '', account_id: '', ncf: '', expense_type: '02', services_amount: '', goods_amount: '', itbis: '', itbis_retained: '', isr_type: '', isr_retained: '', tip: '', paid_now: true, method: 'cash', bank_account_id: '' });
    api.get('/contacts?kind=supplier').then(setSuppliers);
    api.get('/accounting/accounts').then((a) => setAccounts(a.filter((x) => x.is_postable && ['expense', 'cost'].includes(x.type))));
    api.get('/banks').then((b) => { setBanks(b); set({ bank_account_id: b[0]?.id }); });
  }, [open]);

  const base = Number(form.goods_amount || 0) + Number(form.services_amount || 0);
  const total = round2(base + Number(form.itbis || 0) + Number(form.tip || 0));
  const toPay = round2(total - Number(form.itbis_retained || 0) - Number(form.isr_retained || 0));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify(form));
      if (file) fd.append('file', file);
      await api.post('/expenses', fd);
      onSaved();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Registrar gasto" wide
      footer={<>
        <div className="mr-auto self-center text-[13px] text-text-muted">Total <b className="num text-text text-[15px] ml-1">{money(total)}</b></div>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={busy} onClick={save}>Guardar gasto</button>
      </>}>
      <div className="space-y-5">
        <Dropzone file={file} onFile={setFile} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Descripción" className="sm:col-span-2"><Input value={form.description || ''} onChange={(e) => set({ description: e.target.value })} placeholder="Ej. Factura de luz de octubre" /></Field>
          <Field label="Proveedor">
            <div className="flex gap-2">
              <Select value={form.contact_id} onChange={(e) => set({ contact_id: e.target.value })}>
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <button type="button" className="btn-outline px-3" onClick={() => setNewSupplier(true)}><UserPlus size={16} /></button>
            </div>
          </Field>
          <Field label="Categoría (cuenta de gasto)">
            <Select value={form.account_id} onChange={(e) => set({ account_id: e.target.value })}>
              <option value="">Elegir…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={form.date || ''} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="NCF del proveedor" hint={company.is_formal ? 'Necesario para el 606 y el crédito de ITBIS' : 'Opcional'}>
            <Input className="num uppercase" value={form.ncf || ''} onChange={(e) => set({ ncf: e.target.value })} placeholder="B0100000000" />
          </Field>
          {company.is_formal && (
            <Field label="Tipo de gasto (606)" className="sm:col-span-2">
              <Select value={form.expense_type} onChange={(e) => set({ expense_type: e.target.value })}>
                {EXPENSE_TYPES.map(([c, l]) => <option key={c} value={c}>{c} — {l}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="eyebrow mb-3">Montos</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Servicios"><Input type="number" step="0.01" className="num text-right" value={form.services_amount} onChange={(e) => set({ services_amount: e.target.value })} /></Field>
            <Field label="Bienes"><Input type="number" step="0.01" className="num text-right" value={form.goods_amount} onChange={(e) => set({ goods_amount: e.target.value })} /></Field>
            <Field label={<span className="flex justify-between">ITBIS <button type="button" className="text-brand text-[11.5px]" onClick={() => set({ itbis: round2(base * 0.18) })}>18%</button></span>}>
              <Input type="number" step="0.01" className="num text-right" value={form.itbis} onChange={(e) => set({ itbis: e.target.value })} />
            </Field>
            <Field label="Propina legal"><Input type="number" step="0.01" className="num text-right" value={form.tip} onChange={(e) => set({ tip: e.target.value })} /></Field>
          </div>
          {company.is_formal && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <Field label="ITBIS retenido">
                <Select value={form._itbis_ret_pct || 0} onChange={(e) => set({ _itbis_ret_pct: e.target.value, itbis_retained: round2(Number(form.itbis || 0) * Number(e.target.value) / 100) })}>
                  <option value={0}>No</option><option value={30}>30%</option><option value={100}>100%</option>
                </Select>
              </Field>
              <Field label="Tipo ret. ISR">
                <Select value={form.isr_type} onChange={(e) => set({ isr_type: e.target.value })}><option value="">No</option>{ISR_TYPES.map(([c, l]) => <option key={c} value={c}>{c} {l}</option>)}</Select>
              </Field>
              <Field label="% ISR">
                <Select disabled={!form.isr_type} value={form._isr_pct || 0} onChange={(e) => set({ _isr_pct: e.target.value, isr_retained: round2(base * Number(e.target.value) / 100) })}>
                  <option value={0}>0%</option><option value={2}>2%</option><option value={10}>10%</option><option value={27}>27%</option>
                </Select>
              </Field>
              <Field label="ISR retenido"><Input type="number" step="0.01" className="num text-right" value={form.isr_retained} onChange={(e) => set({ isr_retained: e.target.value })} disabled={!form.isr_type} /></Field>
            </div>
          )}
          {!company.charges_itbis && Number(form.itbis) > 0 && <p className="text-[12px] text-text-muted mt-3">Como tu empresa no declara ITBIS, este impuesto se registra como parte del gasto.</p>}
        </div>

        <div className="rounded-xl bg-paper/70 border border-line p-4 space-y-3">
          <Toggle checked={form.paid_now} onChange={(v) => set({ paid_now: v })} label="Ya está pagado" hint={form.paid_now ? `Sale ${money(toPay)} de la cuenta elegida` : 'Queda en cuentas por pagar'} />
          {form.paid_now ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde"><Select value={form.bank_account_id || ''} onChange={(e) => set({ bank_account_id: e.target.value })}>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
              <Field label="Método"><Select value={form.method} onChange={(e) => set({ method: e.target.value })}>{PAY_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
          ) : (
            <Field label="Vence"><Input type="date" value={form.due_date || ''} onChange={(e) => set({ due_date: e.target.value })} /></Field>
          )}
        </div>
        <ErrorBox error={error} />
      </div>
      <ContactModal open={newSupplier} defaultKind="supplier" onClose={() => setNewSupplier(false)}
        onSaved={(c) => { setSuppliers((x) => [...x, c]); set({ contact_id: c.id }); setNewSupplier(false); }} />
    </Modal>
  );
}

function ExpenseDetail({ id, onClose, onChanged }) {
  const { can, company } = useAuth();
  const toast = useToast();
  const { data: e, reload } = useData(() => (id ? api.get(`/expenses/${id}`) : Promise.resolve(null)), [id]);
  const [preview, setPreview] = useState(null);
  const [paying, setPaying] = useState(false);
  useEffect(() => {
    setPreview(null);
    if (!e?.receipt_path) return;
    let url;
    fetchBlob(`/expenses/${e.id}/receipt`).then((b) => { url = URL.createObjectURL(b); setPreview({ url, pdf: b.type === 'application/pdf' }); }).catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [e?.id, e?.receipt_path]);
  const attach = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    try { await api.post(`/expenses/${id}/receipt`, fd); toast('Comprobante adjuntado'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  if (!id) return null;
  const owed = e ? e.total - e.itbis_retained - e.isr_retained : 0;
  return (
    <Modal open={!!id} onClose={onClose} title="Detalle del gasto" wide
      footer={e && <>
        {can('accountant') && e.status !== 'void' && <button className="btn-danger mr-auto" onClick={async () => { await api.post(`/expenses/${id}/void`); toast('Gasto anulado'); reload(); onChanged(); }}><Ban size={15} /> Anular</button>}
        {['pending', 'partial'].includes(e.status) && can('operator') && <button className="btn-brand" onClick={() => setPaying(true)}><Wallet size={15} /> Registrar pago</button>}
        <button className="btn-outline" onClick={onClose}>Cerrar</button>
      </>}>
      {!e ? <Loading /> : (
        <div className="grid md:grid-cols-[1fr_1fr] gap-6">
          <div>
            <div className="flex items-center gap-2"><StatusBadge map={EXPENSE_STATUS} status={e.status} /><span className="text-text-muted text-[12.5px]">{date(e.date)}</span></div>
            <h3 className="text-[20px] font-semibold mt-2">{e.description}</h3>
            <div className="text-text-muted text-[13px]">{e.contact_name || 'Sin proveedor'} {e.contact_tax_id && <span className="num">· {e.contact_tax_id}</span>}</div>
            <dl className="mt-5 text-[13px] divide-y divide-line">
              {[['Categoría', `${e.account_code} · ${e.account_name}`], e.ncf && ['NCF', <span className="num">{e.ncf}</span>],
                company.is_formal && ['Tipo 606', EXPENSE_TYPES.find(([c]) => c === e.expense_type)?.[1]],
                ['Servicios', money(e.services_amount)], ['Bienes', money(e.goods_amount)], ['ITBIS', money(e.itbis)],
                e.tip > 0 && ['Propina', money(e.tip)], e.itbis_retained > 0 && ['ITBIS retenido', money(-e.itbis_retained)],
                e.isr_retained > 0 && ['ISR retenido', money(-e.isr_retained)], ['Total a pagar', <b>{money(owed)}</b>], ['Pagado', money(e.paid)],
              ].filter(Boolean).map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-text-muted">{k}</dt><dd className="num text-right">{v}</dd></div>)}
            </dl>
          </div>
          <div>
            {preview ? (
              preview.pdf ? <iframe title="comprobante" src={preview.url} className="w-full h-[420px] rounded-xl border border-line" />
                : <a href={preview.url} target="_blank" rel="noreferrer"><img src={preview.url} alt="Comprobante" className="w-full max-h-[420px] object-contain rounded-xl border border-line bg-paper" /></a>
            ) : (
              <div className="h-full min-h-[200px] rounded-xl border border-dashed border-line-strong grid place-items-center text-center p-6">
                <div>
                  <FileImage size={22} className="mx-auto text-text-faint" />
                  <p className="text-text-muted text-[13px] mt-2">Sin comprobante adjunto</p>
                  {can('operator') && <label className="btn-outline btn-sm mt-3 cursor-pointer">Adjuntar<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(ev) => ev.target.files[0] && attach(ev.target.files[0])} /></label>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {e && <PaymentModal open={paying} onClose={() => setPaying(false)} balance={owed - e.paid} title="Registrar pago"
        onSave={async (body) => { await api.post(`/expenses/${id}/payments`, body); setPaying(false); toast('Pago registrado'); reload(); onChanged(); }} />}
    </Modal>
  );
}

export default function Expenses() {
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('estado') || '';
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(params.get('nuevo') === '1');
  const [detail, setDetail] = useState(null);
  const { data, loading, reload } = useData(() => api.get(`/expenses?status=${status}&q=${encodeURIComponent(q)}`), [status, q]);
  const total = (data || []).filter((e) => e.status !== 'void').reduce((s, e) => s + e.total, 0);

  return (
    <>
      <PageHeader eyebrow="Gastos · Compras" title="Gastos y compras"
        subtitle="Sube el comprobante, elige la categoría y listo: queda contabilizado y listo para el 606."
        actions={can('operator') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Registrar gasto</button>} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={[['', 'Todos'], ['open', 'Por pagar'], ['paid', 'Pagados'], ['void', 'Anulados']]} value={status} onChange={(v) => setParams(v ? { estado: v } : {})} />
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input placeholder="Buscar descripción, NCF o proveedor" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Loading /> : !data.length ? (
          <Empty icon={Receipt} title="Sin gastos registrados" text="Registra tu primer gasto con su comprobante."
            action={can('operator') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Registrar gasto</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger min-w-[760px]">
              <thead><tr><th>Gasto</th><th>Categoría</th><th>Fecha</th><th>NCF</th><th>Estado</th><th className="r">ITBIS</th><th className="r">Total</th></tr></thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className="row-link" onClick={() => setDetail(e.id)}>
                    <td>
                      <div className="font-semibold flex items-center gap-1.5">{e.description}{e.receipt_path && <Paperclip size={13} className="text-text-faint" />}</div>
                      <div className="text-[12px] text-text-faint">{e.contact_name || 'Sin proveedor'}</div>
                    </td>
                    <td className="text-[12.5px] text-text-muted max-w-[180px] truncate">{e.account_name}</td>
                    <td className="num text-[12.5px] text-text-muted">{date(e.date)}</td>
                    <td className="num text-[12px]">{e.ncf || <span className="text-text-faint">—</span>}</td>
                    <td><StatusBadge map={EXPENSE_STATUS} status={e.status} /></td>
                    <td className="r"><Money value={e.itbis} className="text-text-muted" /></td>
                    <td className="r"><Money value={e.total} className="font-semibold" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6}>Total ({data.length})</td><td className="r"><Money value={total} /></td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
      <ExpenseModal open={creating} onClose={() => { setCreating(false); setParams({}); }} onSaved={() => { setCreating(false); setParams({}); toast('Gasto registrado y contabilizado'); reload(); }} />
      <ExpenseDetail id={detail} onClose={() => setDetail(null)} onChanged={reload} />
    </>
  );
}
