import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, FileText, FileSignature, Receipt, Users, Package, Landmark, PieChart, BookOpen, Library,
  BarChart3, Building2, Settings, LogOut, ChevronsUpDown, Menu, X, Plus, Check, Scale, Repeat, TrendingUp,
} from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { ROLES } from '../lib/constants';
import { cx, Modal, Field, Input, Toggle, useToast } from './ui';

const NAV = [
  { section: 'General', items: [['/', 'Resumen', LayoutGrid]] },
  { section: 'Ventas', items: [['/facturas', 'Facturas', FileText], ['/cotizaciones', 'Cotizaciones', FileSignature], ['/recurrentes', 'Cobros recurrentes', Repeat], ['/clientes', 'Clientes y proveedores', Users], ['/productos', 'Productos y servicios', Package]] },
  { section: 'Gastos', items: [['/gastos', 'Gastos y compras', Receipt], ['/presupuestos', 'Presupuestos', PieChart]] },
  { section: 'Tesorería', items: [['/bancos', 'Bancos y caja', Landmark]] },
  { section: 'Contabilidad', items: [['/contabilidad/asientos', 'Diario general', BookOpen], ['/contabilidad/catalogo', 'Catálogo de cuentas', Library], ['/reportes', 'Estados financieros', BarChart3], ['/proyeccion', 'Proyección', TrendingUp], ['/impuestos', 'Impuestos DGII', Scale, 'formal']] },
];

function CompanySwitcher({ onDone }) {
  const { company, companies, applyToken, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', is_formal: false, rnc: '' });
  const toast = useToast();
  const navigate = useNavigate();

  const switchTo = async (id) => {
    const { token } = await api.post('/auth/switch', { company_id: id });
    await applyToken(token); setOpen(false); onDone?.(); navigate('/');
  };
  const create = async () => {
    try {
      const { token } = await api.post('/auth/companies', form);
      await applyToken(token); setCreating(false); setOpen(false); navigate('/');
      toast('Empresa creada');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-ink-2 hover:bg-ink-3 border border-ink-line transition text-left">
        <span className="h-9 w-9 rounded-lg bg-ink-3 grid place-items-center font-display font-semibold text-lime text-[15px] shrink-0">
          {company?.name?.[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-white truncate">{company?.trade_name || company?.name}</span>
          <span className="block text-[11.5px] text-white/50 truncate">{company?.is_formal ? `RNC ${company.rnc || '—'}` : 'Informal · sin NCF'} · {ROLES[role]}</span>
        </span>
        <ChevronsUpDown size={15} className="text-white/40" />
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-2 rounded-xl bg-ink-2 border border-ink-line shadow-pop p-1.5">
          {companies?.map((c) => (
            <button key={c.id} onClick={() => switchTo(c.id)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-ink-3 text-left">
              <span className="flex-1 min-w-0 text-[13px] text-white/90 truncate">{c.trade_name || c.name}</span>
              {c.id === company.id && <Check size={14} className="text-lime" />}
            </button>
          ))}
          <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-ink-3 text-[13px] text-lime">
            <Plus size={14} /> Nueva empresa
          </button>
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva empresa"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancelar</button><button className="btn-primary" onClick={create}>Crear empresa</button></>}>
        <div className="space-y-4">
          <Field label="Nombre o razón social"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Toggle checked={form.is_formal} onChange={(v) => setForm({ ...form, is_formal: v })} label="Empresa formal" hint="Tiene RNC y emite comprobantes fiscales (NCF / e-CF)." />
          {form.is_formal && <Field label="RNC"><Input value={form.rnc} onChange={(e) => setForm({ ...form, rnc: e.target.value })} /></Field>}
        </div>
      </Modal>
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const { company, user, logout, can } = useAuth();
  return (
    <div className="h-full flex flex-col bg-ink text-white">
      <div className="px-5 pt-5 pb-4"><Logo /></div>
      <div className="px-3 pb-3"><CompanySwitcher onDone={onNavigate} /></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.section} className="mt-4">
            <div className="px-3 mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{g.section}</div>
            {g.items.filter(([, , , f]) => f !== 'formal' || company?.is_formal).map(([to, label, Icon]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate}
                className={({ isActive }) => cx('flex items-center gap-3 h-9 px-3 rounded-lg text-[13.5px] transition',
                  isActive ? 'tick bg-white/[0.07] text-white font-semibold' : 'text-white/65 hover:text-white hover:bg-white/[0.04]')}>
                <Icon size={16} strokeWidth={1.9} /> {label}
              </NavLink>
            ))}
          </div>
        ))}
        {can('admin') && (
          <div className="mt-4">
            <div className="px-3 mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Empresa</div>
            <NavLink to="/ajustes" onClick={onNavigate} className={({ isActive }) => cx('flex items-center gap-3 h-9 px-3 rounded-lg text-[13.5px] transition',
              isActive ? 'tick bg-white/[0.07] text-white font-semibold' : 'text-white/65 hover:text-white hover:bg-white/[0.04]')}>
              <Settings size={16} strokeWidth={1.9} /> Ajustes
            </NavLink>
          </div>
        )}
      </nav>
      <div className="border-t border-ink-line p-3 flex items-center gap-3">
        <span className="h-8 w-8 rounded-full bg-lime text-ink grid place-items-center text-[12px] font-bold">{user?.name?.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold truncate">{user?.name}</div>
          <div className="text-[11.5px] text-white/45 truncate">{user?.email}</div>
        </div>
        <button onClick={logout} title="Cerrar sesión" className="h-8 w-8 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10"><LogOut size={15} /></button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [mobile, setMobile] = useState(false);
  const { company } = useAuth();
  return (
    <div className="min-h-screen lg:pl-[264px]">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[264px] no-print"><Sidebar /></aside>
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-ink no-print">
        <Logo />
        <button onClick={() => setMobile(true)} className="h-9 w-9 grid place-items-center rounded-lg text-white"><Menu size={20} /></button>
      </div>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden no-print">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw]">
            <button onClick={() => setMobile(false)} className="absolute right-3 top-5 z-10 text-white/70"><X size={18} /></button>
            <Sidebar onNavigate={() => setMobile(false)} />
          </div>
        </div>
      )}
      <main className="px-4 sm:px-8 py-7 sm:py-9 max-w-[1320px] mx-auto">
        {!company?.is_formal && <InformalHint />}
        <Outlet />
      </main>
    </div>
  );
}

function InformalHint() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('cuadre.hint.informal') === '1'; } catch { return false; } });
  if (hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem('cuadre.hint.informal', '1'); } catch { /* */ } };
  return (
    <div className="no-print mb-6 flex items-start gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-4 py-3 text-[13px]">
      <Building2 size={16} className="text-brand mt-0.5 shrink-0" />
      <p className="flex-1 text-text-muted">
        <b className="text-text">Modo informal.</b> Tus facturas usan numeración interna, sin NCF ni reportes DGII. Cuando formalices tu negocio, actívalo en Ajustes y todo tu historial se conserva.
      </p>
      <button onClick={close} className="text-text-faint hover:text-text"><X size={15} /></button>
    </div>
  );
}
