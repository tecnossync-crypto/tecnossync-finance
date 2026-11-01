import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, BookOpen, ChevronRight, ArrowLeft, Search, Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, date, today, round2, monthStart } from '../lib/format';
import { ACCOUNT_TYPES } from '../lib/constants';
import { Badge, Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Select, Tabs, useData, useToast, cx } from '../components/ui';

const natural = (a) => (['asset', 'cost', 'expense'].includes(a.type) ? a.debit - a.credit : a.credit - a.debit);

// ---------------- Catálogo ----------------
export function Accounts() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, reload } = useData(() => api.get('/accounting/accounts'), []);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const withTotals = data.map((a) => {
      if (a.is_postable) return { ...a, bal: natural(a) };
      const kids = data.filter((k) => k.is_postable && k.code.startsWith(a.code + '.'));
      return { ...a, bal: kids.reduce((s, k) => s + natural(k), 0) };
    });
    return withTotals.filter((a) => (!type || a.type === type) && (!q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase())));
  }, [data, type, q]);

  return (
    <>
      <PageHeader eyebrow="Contabilidad" title="Catálogo de cuentas" subtitle="Plan de cuentas adaptado a República Dominicana. Puedes agregar subcuentas a tu medida."
        actions={can('accountant') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Nueva cuenta</button>} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={[['', 'Todas'], ...Object.entries(ACCOUNT_TYPES)]} value={type} onChange={setType} />
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input placeholder="Código o nombre" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="ledger min-w-[640px]">
              <thead><tr><th className="w-32">Código</th><th>Cuenta</th><th>Tipo</th><th className="r">Saldo</th><th className="w-10" /></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const depth = a.code.split('.').length - 1;
                  return (
                    <tr key={a.id} className={cx('row-link', !a.is_postable && 'bg-paper/50')} onClick={() => navigate(`/contabilidad/mayor/${a.id}`)}>
                      <td className={cx('num text-[12.5px]', !a.is_postable && 'font-semibold')}>{a.code}</td>
                      <td style={{ paddingLeft: 16 + depth * 16 }} className={cx(!a.is_postable && 'font-semibold')}>
                        {a.name} {a.system_key && <span className="ml-1 text-[10px] font-mono text-text-faint">· sistema</span>}
                      </td>
                      <td><Badge>{ACCOUNT_TYPES[a.type]}</Badge></td>
                      <td className="r">{a.bal ? <Money value={a.bal} className={cx(!a.is_postable && 'font-semibold')} signed /> : <span className="text-text-faint">—</span>}</td>
                      <td><ChevronRight size={14} className="text-text-faint" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <NewAccount open={creating} accounts={data || []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Cuenta creada'); reload(); }} />
    </>
  );
}

function NewAccount({ open, onClose, onSaved, accounts }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => { if (open) { setForm({ parent_id: '', code: '', name: '', type: 'expense', is_postable: true }); setError(null); } }, [open]);
  const parents = accounts.filter((a) => !a.is_postable || a.code.split('.').length <= 3);
  const pickParent = (id) => {
    const p = accounts.find((a) => String(a.id) === id);
    if (!p) return setForm({ ...form, parent_id: '' });
    const siblings = accounts.filter((a) => a.code.startsWith(p.code + '.') && a.code.split('.').length === p.code.split('.').length + 1);
    const next = String(siblings.length + 1).padStart(2, '0');
    setForm({ ...form, parent_id: p.id, type: p.type, code: `${p.code}.${next}` });
  };
  return (
    <Modal open={open} onClose={onClose} title="Nueva cuenta contable"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => api.post('/accounting/accounts', form).then(onSaved).catch(setError)}>Crear</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cuenta padre" className="col-span-2">
          <Select value={form.parent_id} onChange={(e) => pickParent(e.target.value)}>
            <option value="">Ninguna (cuenta de primer nivel)</option>
            {parents.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </Select>
        </Field>
        <Field label="Código"><Input className="num" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(ACCOUNT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Nombre" className="col-span-2"><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.is_postable} onChange={(e) => setForm({ ...form, is_postable: e.target.checked })} /> Recibe movimientos (desmarca si es solo de agrupación)</label>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </div>
    </Modal>
  );
}

// ---------------- Diario general ----------------
const SRC = { invoice: ['Factura', 'info'], payment: ['Cobro/Pago', 'ok'], expense: ['Gasto', 'warn'], manual: ['Manual', 'lime'], bank: ['Banco', 'neutral'], void: ['Reverso', 'danger'] };

export function Journal() {
  const { can } = useAuth();
  const toast = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [src, setSrc] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, loading, reload } = useData(() => api.get(`/accounting/entries?from=${from}&to=${to}&source_type=${src}`), [from, to, src]);
  const voidEntry = async (id) => {
    try { await api.post(`/accounting/entries/${id}/void`); toast('Asiento reversado'); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <PageHeader eyebrow="Contabilidad" title="Diario general" subtitle="Cada factura, gasto, cobro y pago genera su asiento automáticamente. Aquí también puedes registrar asientos manuales."
        actions={can('accountant') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Asiento manual</button>} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
        <Field label="Origen">
          <Select value={src} onChange={(e) => setSrc(e.target.value)} className="w-44">
            <option value="">Todos</option>{Object.entries(SRC).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      {loading ? <Loading /> : !data.length ? <div className="card"><Empty icon={BookOpen} title="Sin asientos en este período" /></div> : (
        <div className="space-y-3">
          {data.map((e) => (
            <article key={e.id} className={cx('card overflow-hidden', e.status === 'void' && 'opacity-60')}>
              <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-line bg-paper/40">
                <span className="num font-semibold">#{e.number}</span>
                <span className="num text-[12.5px] text-text-muted">{date(e.date)}</span>
                <Badge tone={SRC[e.source_type]?.[1]}>{SRC[e.source_type]?.[0]}</Badge>
                {e.status === 'void' && <Badge tone="danger">Anulado</Badge>}
                <span className="flex-1 min-w-[200px] truncate">{e.description}</span>
                {e.source_type === 'manual' && e.status === 'posted' && can('accountant') && (
                  <button className="btn-ghost btn-sm" onClick={() => voidEntry(e.id)}>Reversar</button>
                )}
              </header>
              <table className="w-full text-[13px]">
                <tbody>
                  {e.lines.map((l, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      <td className={cx('py-2 num text-[12px] text-text-faint w-28', l.credit > 0 ? 'pl-12' : 'pl-5')}>{l.code}</td>
                      <td className={cx('py-2', l.credit > 0 && 'pl-6')}>{l.name}{l.memo && <span className="text-text-faint"> — {l.memo}</span>}</td>
                      <td className="py-2 pr-4 text-right num w-36">{l.debit > 0 ? money(l.debit, 'DOP', { symbol: false }) : ''}</td>
                      <td className="py-2 pr-5 text-right num w-36">{l.credit > 0 ? money(l.credit, 'DOP', { symbol: false }) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
      <EntryModal open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Asiento registrado'); reload(); }} />
    </>
  );
}

function EntryModal({ open, onClose, onSaved }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const blank = () => ({ k: Math.random(), account_id: '', debit: '', credit: '', memo: '' });
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ date: today(), description: '', lines: [blank(), blank()] });
    api.get('/accounting/accounts').then((a) => setAccounts(a.filter((x) => x.is_postable && x.active)));
  }, [open]);
  const lines = form.lines || [];
  const d = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const c = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  const setLine = (k, p) => setForm({ ...form, lines: lines.map((l) => (l.k === k ? { ...l, ...p } : l)) });
  const balanced = d > 0 && d === c;
  return (
    <Modal open={open} onClose={onClose} title="Asiento manual" wide
      footer={<>
        <div className={cx('mr-auto self-center flex items-center gap-2 text-[13px] font-semibold', balanced ? 'text-brand' : 'text-warn')}>
          {balanced ? <><Check size={16} /> Cuadrado</> : <><AlertTriangle size={15} /> Diferencia {money(Math.abs(d - c))}</>}
        </div>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={!balanced} onClick={() => api.post('/accounting/entries', form).then(onSaved).catch(setError)}>Registrar</button>
      </>}>
      <div className="grid sm:grid-cols-[160px_1fr] gap-4 mb-4">
        <Field label="Fecha"><Input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Concepto"><Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej. Registro de depreciación de octubre" /></Field>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead><tr className="eyebrow text-left"><th className="pb-2">Cuenta</th><th className="pb-2 w-32 text-right">Debe</th><th className="pb-2 w-32 text-right">Haber</th><th className="w-8" /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.k}>
                <td className="py-1 pr-2">
                  <Select value={l.account_id} onChange={(e) => setLine(l.k, { account_id: e.target.value })}>
                    <option value="">Elegir cuenta…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </Select>
                </td>
                <td className="py-1 px-1"><Input type="number" step="0.01" className="num text-right" value={l.debit} onChange={(e) => setLine(l.k, { debit: e.target.value, credit: '' })} /></td>
                <td className="py-1 px-1"><Input type="number" step="0.01" className="num text-right" value={l.credit} onChange={(e) => setLine(l.k, { credit: e.target.value, debit: '' })} /></td>
                <td><button className="text-text-faint hover:text-danger p-1" onClick={() => lines.length > 2 && setForm({ ...form, lines: lines.filter((x) => x.k !== l.k) })}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold"><td className="pt-3"><button className="btn-ghost btn-sm" onClick={() => setForm({ ...form, lines: [...lines, blank()] })}><Plus size={14} /> Línea</button></td>
            <td className="pt-3 text-right num">{money(d, 'DOP', { symbol: false })}</td><td className="pt-3 text-right num">{money(c, 'DOP', { symbol: false })}</td><td /></tr></tfoot>
        </table>
      </div>
      <div className="mt-3"><ErrorBox error={error} /></div>
    </Modal>
  );
}

// ---------------- Libro mayor ----------------
export function Ledger() {
  const { id } = useParams();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const { data, loading } = useData(() => api.get(`/accounting/ledger/${id}?from=${from}&to=${to}`), [id, from, to]);
  if (loading || !data) return <Loading />;
  const sign = ['asset', 'cost', 'expense'].includes(data.account.type) ? 1 : -1;
  let running = data.opening * sign;
  return (
    <>
      <Link to="/contabilidad/catalogo" className="btn-ghost btn-sm -ml-3 mb-3"><ArrowLeft size={15} /> Catálogo</Link>
      <PageHeader eyebrow={`Libro mayor · ${ACCOUNT_TYPES[data.account.type]}`} title={<><span className="num text-text-faint mr-3 text-[24px]">{data.account.code}</span>{data.account.name}</>} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ledger min-w-[720px]">
            <thead><tr><th>Fecha</th><th>Asiento</th><th>Concepto</th><th className="r">Debe</th><th className="r">Haber</th><th className="r">Saldo</th></tr></thead>
            <tbody>
              <tr className="bg-paper/50"><td colSpan={5} className="font-semibold">Saldo inicial</td><td className="r"><Money value={running} className="font-semibold" /></td></tr>
              {data.lines.map((l, i) => {
                running += (l.debit - l.credit) * sign;
                return (
                  <tr key={i}>
                    <td className="num text-[12.5px] text-text-muted whitespace-nowrap">{date(l.date)}</td>
                    <td className="num text-[12.5px]">#{l.number}</td>
                    <td>{l.description}{l.code !== data.account.code && <div className="text-[11.5px] text-text-faint">{l.code} · {l.account_name}</div>}</td>
                    <td className="r num">{l.debit > 0 ? money(l.debit, 'DOP', { symbol: false }) : ''}</td>
                    <td className="r num">{l.credit > 0 ? money(l.credit, 'DOP', { symbol: false }) : ''}</td>
                    <td className="r"><Money value={running} signed /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>Saldo final</td><td className="r"><Money value={running} signed /></td></tr></tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
