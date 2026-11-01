import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Store } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Logo';
import { Field, Input, ErrorBox, cx } from '../components/ui';

// Panel de marca: una cuenta T que "cuadra"
function BrandPanel() {
  const rows = [['Ventas de servicios', '', '84,500.00'], ['Cuentas por cobrar', '99,710.00', ''], ['ITBIS por pagar', '', '15,210.00']];
  return (
    <div className="hidden lg:flex relative flex-col justify-between bg-ink text-white p-12 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 36px)' }} />
      <Logo className="relative" />
      <div className="relative">
        <h1 className="font-display text-[64px] leading-[0.95] font-semibold tracking-tight">
          Que todo<br /><span className="text-lime">cuadre.</span>
        </h1>
        <p className="mt-6 text-white/60 text-[16px] max-w-md">
          Facturación, gastos, presupuestos y contabilidad completa para negocios dominicanos — formales o informales.
        </p>
        <div className="mt-10 max-w-md rounded-2xl border border-ink-line bg-ink-2/80 backdrop-blur p-5">
          <div className="flex justify-between eyebrow !text-white/40 pb-2 border-b border-ink-line">
            <span>Asiento #0142</span><span>Debe · Haber</span>
          </div>
          {rows.map(([n, d, c]) => (
            <div key={n} className="grid grid-cols-[1fr_96px_96px] gap-2 py-2 border-b border-ink-line/60 text-[13px]">
              <span className="text-white/80">{n}</span>
              <span className="num text-right text-white/90">{d}</span>
              <span className="num text-right text-white/90">{c}</span>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_96px_96px] gap-2 pt-3 text-[13px] font-semibold">
            <span className="flex items-center gap-2"><span className="h-5 px-1.5 rounded bg-lime text-ink text-[11px] font-bold grid place-items-center">=</span> Cuadrado</span>
            <span className="num text-right text-lime">99,710.00</span>
            <span className="num text-right text-lime">99,710.00</span>
          </div>
        </div>
      </div>
      <div className="relative eyebrow !text-white/30">ITBIS · NCF · e-CF · 606 · 607 · 608 · IT-1</div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <div className="flex flex-col justify-center px-5 sm:px-12 py-10">
        <div className="lg:hidden mb-10"><Logo dark={false} /></div>
        <div className="w-full max-w-[420px] mx-auto lg:mx-0 lg:ml-[8%]">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const { token } = await api.post('/auth/login', form); await applyToken(token); navigate('/'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <div className="eyebrow mb-3">Iniciar sesión</div>
      <h2 className="text-[34px] font-semibold leading-tight">Bienvenido de vuelta</h2>
      <p className="text-text-muted mt-2">Entra para ver cómo van tus números hoy.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Correo"><Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Contraseña"><Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        <ErrorBox error={error} />
        <button className="btn-primary w-full h-11" disabled={busy}>Entrar <ArrowRight size={16} /></button>
      </form>
      <p className="mt-8 text-text-muted">¿Primera vez? <Link to="/registro" className="font-semibold text-brand hover:underline">Crea tu empresa gratis</Link></p>
    </Shell>
  );
}

export function Register() {
  const { applyToken } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', company: { name: '', is_formal: false, rnc: '', charges_itbis: false } });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const setCo = (patch) => setForm((f) => ({ ...f, company: { ...f.company, ...patch } }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const { token } = await api.post('/auth/register', form); await applyToken(token); navigate('/'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  const Kind = ({ formal, icon: Icon, title, text }) => (
    <button type="button" onClick={() => setCo({ is_formal: formal, charges_itbis: formal })}
      className={cx('text-left rounded-xl border p-3.5 transition', form.company.is_formal === formal ? 'border-ink bg-surface ring-4 ring-ink/5' : 'border-line hover:border-line-strong')}>
      <Icon size={17} className={form.company.is_formal === formal ? 'text-brand' : 'text-text-faint'} />
      <div className="font-semibold mt-2 text-[13.5px]">{title}</div>
      <div className="text-[12px] text-text-muted leading-snug mt-0.5">{text}</div>
    </button>
  );
  return (
    <Shell>
      <div className="eyebrow mb-3">Crear cuenta</div>
      <h2 className="text-[34px] font-semibold leading-tight">Empieza a cuadrar</h2>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kind formal={false} icon={Store} title="Informal" text="Sin RNC. Facturas con numeración propia." />
          <Kind formal icon={Building2} title="Formal" text="Con RNC, NCF/e-CF, ITBIS y reportes DGII." />
        </div>
        <Field label="Nombre del negocio"><Input value={form.company.name} onChange={(e) => setCo({ name: e.target.value })} required placeholder="Ej. Tecnossync" /></Field>
        {form.company.is_formal && <Field label="RNC"><Input value={form.company.rnc} onChange={(e) => setCo({ rnc: e.target.value })} placeholder="1-01-00000-0" /></Field>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tu nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Correo"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        </div>
        <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></Field>
        <ErrorBox error={error} />
        <button className="btn-primary w-full h-11" disabled={busy}>Crear empresa <ArrowRight size={16} /></button>
      </form>
      <p className="mt-6 text-text-muted">¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-brand hover:underline">Inicia sesión</Link></p>
    </Shell>
  );
}
