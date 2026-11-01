import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Plus, Receipt, FileText, Wallet, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, compact, monthLabel, date, MONTHS_LONG } from '../lib/format';
import { Card, Loading, Money, PageHeader, useData, cx, Badge } from '../components/ui';

const SOURCE = { invoice: 'Factura', payment: 'Cobro/Pago', expense: 'Gasto', manual: 'Manual', bank: 'Banco', void: 'Reverso' };

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-ink text-white px-3.5 py-2.5 shadow-pop text-[12.5px]">
      <div className="eyebrow !text-white/50 mb-1.5">{monthLabel(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.stroke }} />
          <span className="text-white/70 w-16">{p.dataKey === 'income' ? 'Ingresos' : 'Gastos'}</span>
          <span className="num">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useData(() => api.get('/reports/dashboard'), [company?.id]);
  if (loading || !data) return <Loading />;

  // completar 12 meses
  const months = [];
  const d = new Date(); d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
    const s = data.series.find((r) => r.month === key);
    months.push({ month: key, income: s ? Number(s.income) : 0, expense: s ? Number(s.expense) : 0 });
  }
  const margin = data.month.income ? Math.round((data.month.net / data.month.income) * 100) : 0;
  const catMax = Math.max(...data.categories.map((c) => c.amount), 1);
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader
        eyebrow={`${MONTHS_LONG[new Date().getMonth()]} ${new Date().getFullYear()} · ${company.trade_name || company.name}`}
        title={`${hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${user.name.split(' ')[0]}`}
        actions={<>
          <Link to="/gastos?nuevo=1" className="btn-outline"><Receipt size={16} /> Registrar gasto</Link>
          <Link to="/facturas/nueva" className="btn-primary"><Plus size={16} /> Nueva factura</Link>
        </>}
      />

      {/* Resultado del mes: bloque protagonista */}
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4">
        <section className="relative overflow-hidden rounded-2xl bg-ink text-white p-6 sm:p-7">
          <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-lime/10 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="eyebrow !text-white/45">Resultado del mes</div>
              <div className={cx('num text-[38px] sm:text-[46px] font-semibold leading-none mt-4', data.month.net < 0 ? 'text-[#FF8F86]' : 'text-lime')}>
                {money(data.month.net)}
              </div>
              <div className="mt-3 text-white/55 text-[13px]">Margen {margin}% · ingresos menos costos y gastos contabilizados</div>
            </div>
          </div>
          <div className="relative grid grid-cols-2 gap-4 mt-8 pt-5 border-t border-ink-line">
            <div>
              <div className="flex items-center gap-1.5 text-white/50 text-[12.5px]"><ArrowUpRight size={14} className="text-lime" /> Ingresos</div>
              <div className="num text-[20px] font-semibold mt-1">{money(data.month.income)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-white/50 text-[12.5px]"><ArrowDownRight size={14} className="text-[#FF8F86]" /> Gastos</div>
              <div className="num text-[20px] font-semibold mt-1">{money(data.month.expense)}</div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <MiniStat label="Disponible" value={data.cash} to="/bancos" foot={`${data.banks.length} cuentas`} icon={Wallet} />
          <MiniStat label="Por cobrar" value={data.ar.open} to="/facturas?estado=open"
            foot={data.ar.overdue_count ? <span className="text-danger">{money(data.ar.overdue)} vencido</span> : 'Al día'} icon={FileText} />
          <MiniStat label="Por pagar" value={data.ap.open} to="/gastos?estado=open"
            foot={data.ap.overdue ? <span className="text-danger">{money(data.ap.overdue)} vencido</span> : 'Al día'} icon={Receipt} />
          {company.charges_itbis
            ? <MiniStat label="ITBIS estimado" value={data.tax.net} to={company.is_formal ? '/impuestos' : '/reportes'} foot="Cobrado − pagado este mes" />
            : <MiniStat label="Gastos del mes" value={data.month.expense} to="/gastos" foot="Sin ITBIS (informal)" />}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <Card eyebrow="Últimos 12 meses" title="Ingresos vs gastos" actions={
          <div className="flex gap-4 text-[12px] text-text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" /> Ingresos</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#E07A5F]" /> Gastos</span>
          </div>}>
          <div className="h-[260px] -ml-2">
            <ResponsiveContainer>
              <AreaChart data={months} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B2FC9" stopOpacity={0.22} /><stop offset="100%" stopColor="#8B2FC9" stopOpacity={0} /></linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E07A5F" stopOpacity={0.15} /><stop offset="100%" stopColor="#E07A5F" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E6E2EE" strokeDasharray="3 4" />
                <XAxis dataKey="month" tickFormatter={monthLabel} interval="preserveStartEnd" minTickGap={18} tick={{ fontSize: 11, fill: '#948DA6', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#948DA6', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: '#D3CDE0' }} />
                <Area type="monotone" dataKey="income" stroke="#8B2FC9" strokeWidth={2.2} fill="url(#gi)" />
                <Area type="monotone" dataKey="expense" stroke="#E07A5F" strokeWidth={2} fill="url(#ge)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card eyebrow="Este mes" title="¿En qué se va el dinero?">
          {data.categories.length === 0 ? <p className="text-text-muted text-[13px] py-6">Aún no hay gastos este mes.</p> : (
            <ul className="space-y-3.5 mt-1">
              {data.categories.map((c) => (
                <li key={c.name}>
                  <div className="flex justify-between text-[13px] mb-1.5"><span className="truncate pr-3">{c.name}</span><Money value={c.amount} className="text-text-muted" /></div>
                  <div className="h-1.5 rounded-full bg-paper overflow-hidden"><div className="h-full rounded-full bg-ink" style={{ width: `${(c.amount / catMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card eyebrow="Cobranza" title="Facturas vencidas" pad={false}>
          {data.overdue.length === 0 ? <p className="text-text-muted text-[13px] px-5 pb-6">Nada vencido. 👌</p> : (
            <table className="ledger"><tbody>
              {data.overdue.map((i) => (
                <tr key={i.id} className="row-link" onClick={() => navigate(`/facturas/${i.id}`)}>
                  <td><div className="font-semibold">{i.contact || 'Sin cliente'}</div><div className="num text-[12px] text-text-faint">{i.ncf || i.number}</div></td>
                  <td><Badge tone="danger"><AlertCircle size={12} /> {date(i.due_date)}</Badge></td>
                  <td className="r"><Money value={i.balance} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </Card>
        <Card eyebrow="Diario" title="Actividad reciente" pad={false} actions={<Link to="/contabilidad/asientos" className="btn-ghost btn-sm">Ver diario</Link>}>
          {data.recent.length === 0 ? <p className="text-text-muted text-[13px] px-5 pb-6">Todavía no hay movimientos.</p> : (
            <table className="ledger"><tbody>
              {data.recent.map((e) => (
                <tr key={e.id}>
                  <td className="w-16 num text-text-faint text-[12px]">#{e.number}</td>
                  <td><div className="truncate max-w-[260px]">{e.description}</div><div className="text-[12px] text-text-faint">{SOURCE[e.source_type]} · {date(e.date)}</div></td>
                  <td className="r"><Money value={e.amount} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}

function MiniStat({ label, value, foot, to, icon: Icon }) {
  return (
    <Link to={to} className="card p-4 sm:p-5 flex flex-col hover:border-line-strong transition group">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {Icon ? <Icon size={15} className="text-text-faint group-hover:text-brand transition" /> : <ArrowUpRight size={15} className="text-text-faint group-hover:text-brand transition" />}
      </div>
      <div className="num text-[18px] sm:text-[22px] font-semibold mt-auto pt-4 leading-none">{money(value)}</div>
      <div className="text-[12px] text-text-muted mt-2">{foot}</div>
    </Link>
  );
}
