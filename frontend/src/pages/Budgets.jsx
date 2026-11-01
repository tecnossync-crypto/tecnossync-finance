import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, PieChart, ArrowLeft, Save, Copy } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, compact } from '../lib/format';
import { Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Tabs, useData, useToast, cx } from '../components/ui';

const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function Budgets() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useData(() => api.get('/budgets'), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear() });
  const [error, setError] = useState(null);
  return (
    <>
      <PageHeader eyebrow="Gastos · Planificación" title="Presupuestos" subtitle="Define cuánto esperas vender y gastar cada mes, y compáralo contra lo real."
        actions={can('accountant') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Nuevo presupuesto</button>} />
      {loading ? <Loading /> : !data.length ? (
        <div className="card"><Empty icon={PieChart} title="Sin presupuestos" text="Crea el presupuesto del año para controlar tus gastos." /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((b) => (
            <Link key={b.id} to={`/presupuestos/${b.id}`} className="card p-5 hover:border-line-strong transition">
              <div className="eyebrow">{b.year}</div>
              <div className="font-display text-[19px] font-semibold mt-1">{b.name}</div>
              <div className="num text-text-muted mt-3">{money(b.total)} planificado</div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo presupuesto"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
          <button className="btn-primary" onClick={() => api.post('/budgets', form).then(() => { setCreating(false); toast('Presupuesto creado'); reload(); }).catch(setError)}>Crear</button></>}>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={`Presupuesto ${form.year}`} /></Field>
          <Field label="Año"><Input type="number" className="num" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-3"><ErrorBox error={error} /></div>
      </Modal>
    </>
  );
}

export function BudgetEditor() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useData(() => api.get(`/budgets/${id}`), [id]);
  const [grid, setGrid] = useState({});
  const [view, setView] = useState('compare');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    const g = {};
    for (const l of data.lines) g[`${l.account_id}:${l.month}`] = l.amount;
    setGrid(g); setDirty(false);
  }, [data]);

  const actual = useMemo(() => {
    const a = {};
    for (const r of data?.actual || []) a[`${r.account_id}:${r.month}`] = r.amount;
    return a;
  }, [data]);

  if (loading || !data) return <Loading />;
  const val = (k) => Number(grid[k] || 0);
  const setCell = (k, v) => { setGrid({ ...grid, [k]: v }); setDirty(true); };
  const fillRow = (accId) => { const v = grid[`${accId}:1`] || 0; const g = { ...grid }; for (let m = 1; m <= 12; m++) g[`${accId}:${m}`] = v; setGrid(g); setDirty(true); };
  const save = async () => {
    const lines = Object.entries(grid).map(([k, amount]) => { const [account_id, month] = k.split(':').map(Number); return { account_id, month, amount: Number(amount || 0) }; });
    try { await api.put(`/budgets/${id}/lines`, { lines }); toast('Presupuesto guardado'); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const groups = [['income', 'Ingresos'], ['cost', 'Costos'], ['expense', 'Gastos']];
  const rowTotal = (src, accId) => { let s = 0; for (let m = 1; m <= 12; m++) s += Number(src[`${accId}:${m}`] || 0); return s; };
  const curMonth = data.budget.year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;

  return (
    <>
      <Link to="/presupuestos" className="btn-ghost btn-sm -ml-3 mb-3"><ArrowLeft size={15} /> Presupuestos</Link>
      <PageHeader eyebrow={`Presupuesto ${data.budget.year}`} title={data.budget.name}
        actions={<>
          <Tabs tabs={[['compare', 'Presupuesto vs real'], ['edit', 'Editar montos']]} value={view} onChange={setView} />
          {view === 'edit' && can('accountant') && <button className="btn-primary" disabled={!dirty} onClick={save}><Save size={15} /> Guardar</button>}
        </>} />

      {view === 'compare' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ledger min-w-[760px]">
              <thead><tr><th>Cuenta</th><th className="r">Presupuesto acumulado</th><th className="r">Real acumulado</th><th className="r">Diferencia</th><th className="w-[200px]">Ejecución</th></tr></thead>
              <tbody>
                {groups.map(([type, label]) => {
                  const accs = data.accounts.filter((a) => a.type === type && (rowTotal(grid, a.id) || rowTotal(actual, a.id)));
                  if (!accs.length) return null;
                  return [
                    <tr key={type}><td colSpan={5} className="eyebrow bg-paper/50 !py-2">{label}</td></tr>,
                    ...accs.map((a) => {
                      let b = 0, r = 0;
                      for (let m = 1; m <= curMonth; m++) { b += val(`${a.id}:${m}`); r += Number(actual[`${a.id}:${m}`] || 0); }
                      const pct = b ? Math.round((r / b) * 100) : r ? 100 : 0;
                      const over = type === 'income' ? r < b : r > b;
                      return (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          <td className="r"><Money value={b} /></td><td className="r"><Money value={r} className="font-semibold" /></td>
                          <td className={cx('r num', over ? 'text-danger' : 'text-brand')}>{money(r - b)}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-paper overflow-hidden">
                                <div className={cx('h-full rounded-full', over ? 'bg-danger' : type === 'income' ? 'bg-brand' : 'bg-ink')} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="num text-[12px] w-10 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
            {!Object.keys(grid).length && <Empty icon={PieChart} title="Presupuesto vacío" text="Ve a «Editar montos» para cargar los valores por mes." />}
          </div>
          <p className="px-5 py-3 text-[12px] text-text-muted border-t border-line">Acumulado de enero a {M[curMonth - 1].toLowerCase()}. Rojo = gasto por encima de lo presupuestado o ingreso por debajo.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-[12.5px] min-w-[1200px] w-full">
              <thead><tr className="eyebrow">
                <th className="text-left px-4 py-2.5 sticky left-0 bg-surface z-10 w-64">Cuenta</th>
                {M.map((m) => <th key={m} className="px-1 py-2.5 text-right">{m}</th>)}<th className="px-4 py-2.5 text-right">Total</th>
              </tr></thead>
              <tbody>
                {groups.map(([type, label]) => [
                  <tr key={type}><td colSpan={14} className="eyebrow px-4 py-2 bg-paper/60 sticky left-0">{label}</td></tr>,
                  ...data.accounts.filter((a) => a.type === type).map((a) => (
                    <tr key={a.id} className="border-b border-line/60 group">
                      <td className="px-4 py-1 sticky left-0 bg-surface z-10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{a.name}</span>
                          <button title="Copiar enero a todo el año" onClick={() => fillRow(a.id)} className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-brand"><Copy size={13} /></button>
                        </div>
                      </td>
                      {M.map((_, i) => (
                        <td key={i} className="px-0.5 py-1">
                          <input type="number" value={grid[`${a.id}:${i + 1}`] ?? ''} onChange={(e) => setCell(`${a.id}:${i + 1}`, e.target.value)} disabled={!can('accountant')}
                            className="w-full h-8 rounded-md border border-transparent hover:border-line focus:border-brand outline-none text-right num px-1.5 bg-transparent" />
                        </td>
                      ))}
                      <td className="px-4 text-right num font-semibold">{compact(rowTotal(grid, a.id))}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
