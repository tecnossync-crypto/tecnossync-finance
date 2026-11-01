import { useEffect, useState } from 'react';
import { Plus, Landmark, Wallet, CreditCard, ArrowLeftRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, date, today } from '../lib/format';
import { Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Select, Tabs, useData, useToast, cx } from '../components/ui';
import { RateField, useUsdRate } from '../components/Currency';

const ICON = { bank: Landmark, cash: Wallet, card: CreditCard };
const SRC = { invoice: 'Factura', payment: 'Cobro / pago', expense: 'Gasto', manual: 'Asiento manual', bank: 'Movimiento', void: 'Reverso' };

function NewBank({ open, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const usdRate = useUsdRate();
  useEffect(() => { if (open) { setForm({ kind: 'bank', currency: 'DOP', name: '', bank_name: '', number: '', opening_balance: '', opening_date: today(), exchange_rate: '' }); setError(null); } }, [open]);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  return (
    <Modal open={open} onClose={onClose} title="Nueva cuenta"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => api.post('/banks', form).then(onSaved).catch(setError)}>Crear</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><Tabs tabs={[['bank', 'Banco'], ['cash', 'Caja'], ['card', 'Tarjeta de crédito']]} value={form.kind} onChange={(kind) => set({ kind })} /></div>
        <Field label="Nombre" className="col-span-2"><Input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder={form.kind === 'bank' ? 'Ej. Popular corriente' : form.kind === 'cash' ? 'Ej. Caja chica' : 'Ej. Visa BHD'} /></Field>
        {form.kind !== 'cash' && <>
          <Field label="Banco"><Input value={form.bank_name || ''} onChange={(e) => set({ bank_name: e.target.value })} /></Field>
          <Field label="No. de cuenta"><Input className="num" value={form.number || ''} onChange={(e) => set({ number: e.target.value })} /></Field>
        </>}
        {form.kind !== 'card' && <Field label="Moneda de la cuenta" className="col-span-2"><Tabs tabs={[['DOP', 'Pesos (RD$)'], ['USD', 'Dólares (US$)']]} value={form.currency} onChange={(currency) => set({ currency, exchange_rate: currency === 'USD' ? (form.exchange_rate || usdRate || '') : '' })} /></Field>}
        <Field label={`${form.kind === 'card' ? 'Deuda actual' : 'Saldo inicial'}${form.currency === 'USD' ? ' (US$)' : ''}`}><Input type="number" step="0.01" className="num text-right" value={form.opening_balance} onChange={(e) => set({ opening_balance: e.target.value })} /></Field>
        <Field label="A la fecha"><Input type="date" value={form.opening_date || ''} onChange={(e) => set({ opening_date: e.target.value })} /></Field>
        {form.currency === 'USD' && Number(form.opening_balance) > 0 && <RateField value={form.exchange_rate} onChange={(v) => set({ exchange_rate: v })} className="col-span-2" hint="Para registrar el saldo inicial en la contabilidad (que va en pesos)" />}
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </div>
    </Modal>
  );
}

function Movement({ open, onClose, onSaved, banks, defaultBank }) {
  const [form, setForm] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const usdRate = useUsdRate();
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ type: 'deposit', bank_account_id: defaultBank || banks[0]?.id, to_bank_account_id: '', account_id: '', amount: '', date: today(), description: '', exchange_rate: usdRate || '' });
    api.get('/accounting/accounts').then((a) => setAccounts(a.filter((x) => x.is_postable)));
  }, [open, banks, defaultBank]);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const bankAccIds = new Set(banks.map((b) => b.account_id));
  const from = banks.find((b) => String(b.id) === String(form.bank_account_id));
  const to = banks.find((b) => String(b.id) === String(form.to_bank_account_id));
  const needsRate = from?.currency === 'USD' || (form.type === 'transfer' && to?.currency === 'USD');
  const label = (b) => `${b.name}${b.currency !== 'DOP' ? ` (${b.currency})` : ''}`;
  return (
    <Modal open={open} onClose={onClose} title="Nuevo movimiento"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={() => api.post('/banks/movements', form).then(onSaved).catch(setError)}>Registrar</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><Tabs tabs={[['deposit', 'Entrada'], ['withdrawal', 'Salida'], ['transfer', 'Transferencia']]} value={form.type} onChange={(type) => set({ type })} /></div>
        <Field label={form.type === 'transfer' ? 'Desde' : 'Cuenta'}><Select value={form.bank_account_id || ''} onChange={(e) => set({ bank_account_id: e.target.value })}>{banks.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}</Select></Field>
        {form.type === 'transfer' ? (
          <Field label="Hacia"><Select value={form.to_bank_account_id || ''} onChange={(e) => set({ to_bank_account_id: e.target.value })}><option value="">Elegir…</option>{banks.filter((b) => String(b.id) !== String(form.bank_account_id)).map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}</Select></Field>
        ) : (
          <Field label={form.type === 'deposit' ? 'Origen (contrapartida)' : 'Destino (contrapartida)'}>
            <Select value={form.account_id || ''} onChange={(e) => set({ account_id: e.target.value })}>
              <option value="">Elegir cuenta…</option>
              {accounts.filter((a) => !bankAccIds.has(a.id)).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={`Monto${from?.currency === 'USD' ? ' (US$)' : ' (RD$)'}`}><Input type="number" step="0.01" className="num text-right" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
        <Field label="Fecha"><Input type="date" value={form.date || ''} onChange={(e) => set({ date: e.target.value })} /></Field>
        {needsRate && <>
          <RateField value={form.exchange_rate} onChange={(v) => set({ exchange_rate: v })} />
          <div className="self-end pb-2 text-[12.5px] text-text-muted">
            {Number(form.amount) > 0 && Number(form.exchange_rate) > 0 && (from?.currency === 'USD'
              ? <>= {money(form.amount * form.exchange_rate)}</>
              : <>= {money(form.amount / form.exchange_rate, 'USD')}</>)}
          </div>
        </>}
        <Field label="Descripción" className="col-span-2"><Input value={form.description || ''} onChange={(e) => set({ description: e.target.value })} placeholder="Ej. Aporte de capital, comisión bancaria, préstamo…" /></Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </div>
    </Modal>
  );
}

export default function Banks() {
  const { can, company } = useAuth();
  const toast = useToast();
  const { data: banks, loading, reload } = useData(() => api.get('/banks'), [company.id]);
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);
  const current = sel || banks?.[0]?.id;
  const { data: mov, reload: reloadMov } = useData(() => (current ? api.get(`/banks/${current}/movements`) : Promise.resolve(null)), [current]);
  if (loading) return <Loading />;
  const total = banks.filter((b) => b.kind !== 'card').reduce((s, b) => s + b.balance, 0);

  return (
    <>
      <PageHeader eyebrow="Tesorería" title="Bancos y caja" subtitle="Saldos en tiempo real, calculados desde la contabilidad."
        actions={<>
          {can('operator') && <button className="btn-outline" onClick={() => setMoving(true)}><ArrowLeftRight size={16} /> Movimiento</button>}
          {can('accountant') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Nueva cuenta</button>}
        </>} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl bg-ink text-white p-5">
          <div className="eyebrow !text-white/45">Disponible total</div>
          <div className="num text-[26px] font-semibold text-lime mt-3 leading-none">{money(total)}</div>
          <div className="text-white/50 text-[12px] mt-2">{banks.length} cuentas{banks.some((b) => b.currency === 'USD') ? ' · dólares a tasa contable' : ''}</div>
        </div>
        {banks.map((b) => {
          const Icon = ICON[b.kind];
          return (
            <button key={b.id} onClick={() => setSel(b.id)}
              className={cx('card p-5 text-left transition', current === b.id ? 'ring-2 ring-ink border-ink' : 'hover:border-line-strong')}>
              <div className="flex items-center justify-between"><span className="eyebrow truncate">{b.bank_name || (b.kind === 'cash' ? 'Efectivo' : b.kind === 'card' ? 'Tarjeta' : 'Banco')}</span><Icon size={15} className="text-text-faint" /></div>
              <div className="font-semibold mt-2 truncate">{b.name}</div>
              {b.currency === 'USD' ? <>
                <div className={cx('num text-[19px] font-semibold mt-1', b.balance_fx < 0 && 'text-danger')}>{money(b.balance_fx, 'USD')}</div>
                <div className="num text-[11.5px] text-text-faint">en libros {money(b.balance)}</div>
              </> : <div className={cx('num text-[19px] font-semibold mt-1', b.balance < 0 && 'text-danger')}>{money(b.kind === 'card' ? -b.balance : b.balance)}</div>}
              {b.number && <div className="num text-[11.5px] text-text-faint mt-1">···· {b.number.slice(-4)}</div>}
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <header className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div><div className="eyebrow">Movimientos</div><h3 className="font-semibold text-[16px]">{mov?.bank?.name}</h3></div>
        </header>
        {!mov ? <Loading /> : !mov.movements.length ? <Empty icon={Landmark} title="Sin movimientos" text="Los cobros, pagos y transferencias aparecerán aquí." /> : (() => { const fx = mov.bank.currency !== 'DOP'; const cur = mov.bank.currency; return (
          <div className="overflow-x-auto">
            <table className="ledger min-w-[680px]">
              <thead><tr><th>Fecha</th><th>Descripción</th><th className="r">Entrada</th><th className="r">Salida</th><th className="r">Saldo</th></tr></thead>
              <tbody>
                {mov.movements.map((m, i) => (
                  <tr key={i}>
                    <td className="num text-[12.5px] text-text-muted whitespace-nowrap">{date(m.date)}</td>
                    <td><div>{m.description}</div><div className="text-[11.5px] text-text-faint">{SRC[m.source_type]} · asiento #{m.number}</div></td>
                    <td className="r">{m.debit > 0 && <span className="num text-brand font-semibold inline-flex items-center gap-1"><ArrowDownLeft size={13} />{money(fx ? m.fx_amount : m.debit, cur, { symbol: false })}</span>}</td>
                    <td className="r">{m.credit > 0 && <span className="num inline-flex items-center gap-1"><ArrowUpRight size={13} className="text-danger" />{money(fx ? -m.fx_amount : m.credit, cur, { symbol: false })}</span>}</td>
                    <td className="r"><Money value={fx ? m.running_fx : m.running} currency={cur} className="font-semibold" signed /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ); })()}
      </div>
      <NewBank open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Cuenta creada'); reload(); }} />
      <Movement open={moving} banks={banks} defaultBank={current} onClose={() => setMoving(false)} onSaved={() => { setMoving(false); toast('Movimiento registrado'); reload(); reloadMov(); }} />
    </>
  );
}
