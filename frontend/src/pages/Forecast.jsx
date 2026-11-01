import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp, TrendingDown, Repeat, Users, Info, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, compact, monthLabel, MONTHS_LONG } from '../lib/format';
import { Card, Field, Input, Loading, PageHeader, Tabs, useData, cx, Badge } from '../components/ui';

const SCENARIOS = [['base', 'Base'], ['low', 'Pesimista'], ['high', 'Optimista']];
const monthLong = (m) => { const [y, mm] = m.split('-'); return `${MONTHS_LONG[Number(mm) - 1]} ${y}`; };

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-ink text-white px-3.5 py-2.5 shadow-pop text-[12.5px] min-w-[190px]">
      <div className="eyebrow !text-white/50 mb-1.5">{monthLong(label)}{p.kind === 'current' ? ' · en curso' : p.kind === 'proj' ? ' · proyectado' : ''}</div>
      {p.real != null && <Row c="#A855F7" l="Ingreso real" v={p.real} />}
      {p.proj != null && p.kind !== 'hist' && <Row c="#E0359A" l="Proyectado" v={p.proj} />}
      {p.band && p.kind === 'proj' && <div className="text-white/50 text-[11.5px] pl-4">rango {money(p.band[0])} – {money(p.band[1])}</div>}
      {p.expense != null && <Row c="#94A3B8" l="Gastos" v={p.expense} />}
    </div>
  );
}
const Row = ({ c, l, v }) => (
  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: c }} /><span className="text-white/70 flex-1">{l}</span><span className="num">{money(v)}</span></div>
);

export default function Forecast() {
  const { company } = useAuth();
  const [months, setMonths] = useState(6);
  const [scenario, setScenario] = useState('base');
  const [growth, setGrowth] = useState(0);
  const [newIncome, setNewIncome] = useState('');
  const [newExpense, setNewExpense] = useState('');
  const { data, loading } = useData(() => api.get(`/reports/forecast?months=${months}`), [months, company.id]);

  // Escenario + simulación "¿y si…?" sobre la proyección del servidor
  const proj = useMemo(() => {
    if (!data) return [];
    let cash = data.cash_now;
    return data.projection.map((p, i) => {
      const k = i + 1;
      const base = scenario === 'low' ? p.low : scenario === 'high' ? p.high : p.income;
      const variable = Math.max(0, base - p.recurring) * (1 + growth / 100) ** k;
      const income = variable + p.recurring + Number(newIncome || 0);
      const expense = p.expense + Number(newExpense || 0);
      cash += income - expense;
      const shift = income - p.income;
      return { ...p, income, expense, net: income - expense, cash, low: p.low + shift, high: p.high + shift };
    });
  }, [data, scenario, growth, newIncome, newExpense]);

  if (loading || !data) return <Loading />;
  const s = data.stats;
  const simulated = growth !== 0 || Number(newIncome) || Number(newExpense);
  const total = proj.reduce((a, p) => a + p.income, 0);
  const totalNet = proj.reduce((a, p) => a + p.net, 0);
  const endCash = proj.at(-1)?.cash ?? data.cash_now;
  const lastHist = data.history.at(-1);

  const chart = [
    ...data.history.map((h) => ({ month: h.month, kind: 'hist', real: h.income, expense: h.expense })),
    { month: data.current.month, kind: 'current', real: data.current.income, proj: data.current.estimate, expense: data.current.expense, band: [data.current.estimate, data.current.estimate] },
    ...proj.map((p) => ({ month: p.month, kind: 'proj', proj: p.income, band: [p.low, p.high], expense: p.expense })),
  ];
  if (lastHist) chart[data.history.length - 1].proj = lastHist.income; // une la línea proyectada con el último mes real

  const noData = data.history.length === 0;

  return (
    <>
      <PageHeader eyebrow="Contabilidad · Análisis" title="Proyección de ingresos"
        subtitle="Estimación de los próximos meses a partir de tu historial y de los cobros recurrentes ya pactados. Ajusta los supuestos para ver qué pasaría si…"
        actions={<Tabs tabs={[[3, '3 meses'], [6, '6 meses'], [12, '12 meses']]} value={months} onChange={setMonths} />} />

      {noData && (
        <div className="card p-5 mb-4 flex gap-3 text-[13.5px]"><Info size={18} className="text-brand shrink-0 mt-0.5" />
          <div>Aún no hay meses completos con movimientos. La proyección mostrará solo los cobros recurrentes hasta que tengas historial; con 3 meses o más se calcula la tendencia.</div></div>
      )}

      {/* Resultado principal */}
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 [&>*]:min-w-0">
        <section className="relative overflow-hidden rounded-2xl bg-ink text-white p-6 sm:p-7">
          <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-pink/15 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="eyebrow !text-white/45">Ingresos proyectados · próximos {months} meses</div>
            <div className="flex gap-1.5">
              {SCENARIOS.map(([k, l]) => (
                <button key={k} onClick={() => setScenario(k)} className={cx('h-7 px-2.5 rounded-md text-[12px] font-semibold transition', scenario === k ? 'bg-white text-ink' : 'bg-white/10 text-white/70 hover:bg-white/15')}>{l}</button>
              ))}
            </div>
          </div>
          <div className="relative num text-[36px] sm:text-[44px] font-semibold leading-none mt-4 bg-grad2 bg-clip-text text-transparent">{money(total)}</div>
          <div className="relative mt-3 text-white/55 text-[13px]">
            Rango probable (80 %): {money(data.totals.low)} – {money(data.totals.high)}
            {simulated ? <Badge tone="lime" className="ml-2">con tu simulación</Badge> : null}
          </div>
          <div className="relative grid grid-cols-3 gap-4 mt-7 pt-5 border-t border-ink-line">
            <Mini l="Ya asegurado (recurrente)" v={data.totals.recurring} />
            <Mini l="Resultado estimado" v={totalNet} tone={totalNet < 0 ? 'neg' : null} />
            <Mini l="Caja al final" v={endCash} tone={endCash < 0 ? 'neg' : null} />
          </div>
        </section>

        <Card eyebrow="¿Y si…?" title="Simula un escenario">
          <div className="space-y-4">
            <Field label={`Crecimiento extra de ventas: ${growth > 0 ? '+' : ''}${growth}% mensual`} hint="Sobre lo no recurrente. Negativo = las ventas bajan.">
              <input type="range" min={-20} max={20} step={1} value={growth} onChange={(e) => setGrowth(Number(e.target.value))} className="w-full accent-[#8B2FC9]" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nuevo ingreso mensual" hint="Ej. un cliente nuevo"><Input type="number" min="0" className="num" placeholder="0.00" value={newIncome} onChange={(e) => setNewIncome(e.target.value)} /></Field>
              <Field label="Nuevo gasto mensual" hint="Ej. contratar a alguien"><Input type="number" min="0" className="num" placeholder="0.00" value={newExpense} onChange={(e) => setNewExpense(e.target.value)} /></Field>
            </div>
            {simulated ? <button className="btn-ghost btn-sm -ml-2" onClick={() => { setGrowth(0); setNewIncome(''); setNewExpense(''); }}>Quitar simulación</button> : null}
          </div>
        </Card>
      </div>

      {/* Gráfico */}
      <Card className="mt-4" eyebrow="Historial y proyección" title="Ingresos por mes" actions={
        <div className="hidden sm:flex gap-4 text-[12px] text-text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" /> Real</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-pink" /> Proyectado</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-pink/20" /> Rango 80 %</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#94A3B8]" /> Gastos</span>
        </div>}>
        <div className="h-[300px] -ml-2">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#E6E2EE" strokeDasharray="3 4" />
              <XAxis dataKey="month" tickFormatter={monthLabel} interval="preserveStartEnd" minTickGap={14} tick={{ fontSize: 11, fill: '#948DA6', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#948DA6', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip content={<ChartTip />} cursor={{ fill: '#F5EDFC' }} />
              <Area dataKey="band" stroke="none" fill="#E0359A" fillOpacity={0.12} isAnimationActive={false} connectNulls />
              <Bar dataKey="real" fill="#8B2FC9" radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Line dataKey="proj" stroke="#E0359A" strokeWidth={2.2} strokeDasharray="6 4" dot={{ r: 2.5, fill: '#E0359A' }} isAnimationActive={false} connectNulls />
              <Line dataKey="expense" stroke="#94A3B8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Indicadores estadísticos */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        <StatCard icon={Wallet} label="Ingreso promedio mensual" value={money(s.avg_income)}
          foot={s.months ? `Desviación ±${money(s.sd_income)} · variación ${s.cv}% en ${s.months} mes(es)` : 'Sin meses completos'} />
        <StatCard icon={s.trend_per_month >= 0 ? TrendingUp : TrendingDown} label="Tendencia"
          value={`${s.trend_per_month >= 0 ? '+' : ''}${money(s.trend_per_month)}/mes`} tone={s.trend_per_month < 0 ? 'neg' : 'pos'}
          foot={`${s.trend_pct >= 0 ? '+' : ''}${s.trend_pct}% del promedio · ajuste R² ${s.r2}%`} />
        <StatCard icon={Repeat} label="Ingreso recurrente (MRR)" value={money(s.mrr)}
          foot={`${money(s.arr)} al año · ${s.recurring_share}% de tus ingresos recientes`} />
        <StatCard icon={Info} label="Confianza del modelo" value={<span className="capitalize">{s.confidence}</span>}
          foot={s.months < 4 ? 'Pocos meses de historial: tómalo como referencia.' : s.confidence === 'media' ? 'Los ingresos varían bastante de un mes a otro.' : 'Historial suficiente y tendencia consistente.'} />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4 [&>*]:min-w-0">
        <Card eyebrow="Mes a mes" title="Detalle de la proyección" pad={false}>
          <div className="overflow-x-auto">
            <table className="ledger min-w-[640px]">
              <thead><tr><th>Mes</th><th className="r">Recurrente</th><th className="r">Otros (est.)</th><th className="r">Ingresos</th><th className="r">Gastos</th><th className="r">Resultado</th><th className="r">Caja</th></tr></thead>
              <tbody>
                {proj.map((p) => (
                  <tr key={p.month}>
                    <td className="capitalize">{monthLong(p.month)}</td>
                    <td className="r num">{money(p.recurring, 'DOP', { symbol: false })}</td>
                    <td className="r num text-text-muted">{money(p.income - p.recurring, 'DOP', { symbol: false })}</td>
                    <td className="r num font-semibold">{money(p.income, 'DOP', { symbol: false })}
                      <div className="text-[11px] text-text-faint font-normal">{compact(p.low)} – {compact(p.high)}</div></td>
                    <td className="r num">{money(p.expense, 'DOP', { symbol: false })}</td>
                    <td className={cx('r num', p.net < 0 && 'text-danger')}>{money(p.net, 'DOP', { symbol: false })}</td>
                    <td className={cx('r num', p.cash < 0 && 'text-danger')}>{money(p.cash, 'DOP', { symbol: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card eyebrow="Últimos 12 meses" title="Concentración de clientes" actions={<Users size={16} className="text-text-faint" />}>
            {s.top_clients.length === 0 ? <p className="text-text-muted text-[13px]">Sin facturas aún.</p> : <>
              <ul className="space-y-3">
                {s.top_clients.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-[13px] mb-1"><span className="truncate pr-3">{c.name}</span><span className="num text-text-muted">{c.share}%</span></div>
                    <div className="h-1.5 rounded-full bg-paper overflow-hidden"><div className="h-full rounded-full bg-grad" style={{ width: `${c.share}%` }} /></div>
                  </li>
                ))}
              </ul>
              <p className={cx('text-[12.5px] mt-4', s.top3_share >= 60 ? 'text-warn font-medium' : 'text-text-muted')}>
                Tus 3 principales clientes son el {s.top3_share}% de tus ventas.{s.top3_share >= 60 ? ' Alta dependencia: perder uno afectaría bastante.' : ''}
              </p>
            </>}
          </Card>
          <Card eyebrow="Historial" title="Datos clave">
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[13px]">
              <dt className="text-text-muted">Mejor mes</dt><dd className="num text-right">{s.best ? `${monthLabel(s.best.month)} · ${compact(s.best.income)}` : '—'}</dd>
              <dt className="text-text-muted">Mes más bajo</dt><dd className="num text-right">{s.worst ? `${monthLabel(s.worst.month)} · ${compact(s.worst.income)}` : '—'}</dd>
              <dt className="text-text-muted">Crecimiento promedio</dt><dd className="num text-right">{s.avg_growth >= 0 ? '+' : ''}{s.avg_growth}% mensual</dd>
              <dt className="text-text-muted">Gasto promedio</dt><dd className="num text-right">{money(s.avg_expense)}</dd>
              <dt className="text-text-muted">Margen promedio</dt><dd className="num text-right">{s.avg_margin}%</dd>
              <dt className="text-text-muted">Caja hoy</dt><dd className="num text-right">{money(data.cash_now)}</dd>
            </dl>
          </Card>
        </div>
      </div>

      <p className="text-[12px] text-text-muted mt-5 max-w-3xl leading-relaxed">
        <b>Cómo se calcula:</b> los cobros recurrentes activos se suman tal cual están programados. El resto de los ingresos se estima con una
        {s.method === 'promedio' ? ' media de los meses disponibles' : ' regresión lineal (tendencia) de los últimos meses completos'}; el rango muestra
        dónde caería el ingreso con 80 % de probabilidad y se abre mientras más lejos está el mes. Los gastos siguen su propia tendencia.
        Montos sin ITBIS. Es una estimación, no una garantía.
      </p>
    </>
  );
}

const Mini = ({ l, v, tone }) => (
  <div><div className="text-white/50 text-[12px] leading-tight">{l}</div><div className={cx('num text-[17px] sm:text-[19px] font-semibold mt-1.5', tone === 'neg' && 'text-[#FF8F86]')}>{money(v)}</div></div>
);

function StatCard({ icon: Icon, label, value, foot, tone }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between"><span className="eyebrow">{label}</span><Icon size={15} className={cx(tone === 'neg' ? 'text-danger' : tone === 'pos' ? 'text-brand' : 'text-text-faint')} /></div>
      <div className={cx('num text-[21px] font-semibold mt-3 leading-none', tone === 'neg' && 'text-danger')}>{value}</div>
      <div className="text-[12px] text-text-muted mt-2 leading-snug">{foot}</div>
    </div>
  );
}
