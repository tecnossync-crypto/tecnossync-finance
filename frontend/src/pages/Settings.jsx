import { useEffect, useState } from 'react';
import { Trash2, Upload, Plus, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date } from '../lib/format';
import { NCF_ALL, ROLES } from '../lib/constants';
import { Badge, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, Toggle, useData, useToast } from '../components/ui';

export default function Settings() {
  const { company } = useAuth();
  const [tab, setTab] = useState('company');
  return (
    <>
      <PageHeader eyebrow="Empresa" title="Ajustes" subtitle={company.name} />
      <div className="mb-5"><Tabs tabs={[['company', 'Empresa'], ['invoice', 'Facturación'], ...(company.is_formal ? [['ncf', 'Comprobantes NCF']] : []), ['users', 'Usuarios']]} value={tab} onChange={setTab} /></div>
      {tab === 'company' && <CompanyForm />}
      {tab === 'invoice' && <InvoiceSettings />}
      {tab === 'ncf' && <NcfSettings />}
      {tab === 'users' && <UsersSettings />}
    </>
  );
}

function useCompanyForm(fields) {
  const { company, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => [f, company[f] ?? ''])));
  const [error, setError] = useState(null);
  const save = async () => {
    setError(null);
    try { await api.put('/company', form); await refresh(); toast('Cambios guardados'); } catch (e) { setError(e); }
  };
  return { form, set: (p) => setForm((f) => ({ ...f, ...p })), save, error, company };
}

function CompanyForm() {
  const { form, set, save, error, company } = useCompanyForm(['name', 'trade_name', 'is_formal', 'rnc', 'charges_itbis', 'itbis_rate', 'address', 'phone', 'email', 'website']);
  const { refresh } = useAuth();
  const toast = useToast();
  const uploadLogo = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    try { await api.post('/company/logo', fd); await refresh(); toast('Logo actualizado'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <Card title="Datos de la empresa">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Razón social / nombre"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Nombre comercial"><Input value={form.trade_name || ''} onChange={(e) => set({ trade_name: e.target.value })} /></Field>
          <Field label="Dirección" className="sm:col-span-2"><Input value={form.address || ''} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Teléfono"><Input value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Correo"><Input value={form.email || ''} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Sitio web" className="sm:col-span-2"><Input value={form.website || ''} onChange={(e) => set({ website: e.target.value })} /></Field>
        </div>
        <div className="mt-5"><ErrorBox error={error} /></div>
        <div className="mt-5 flex justify-end"><button className="btn-primary" onClick={save}>Guardar cambios</button></div>
      </Card>
      <div className="space-y-4">
        <Card title="Régimen fiscal" eyebrow="Formal o informal">
          <div className="space-y-4">
            <Toggle checked={!!form.is_formal} onChange={(v) => set({ is_formal: v, charges_itbis: v ? true : form.charges_itbis })} label="Empresa formal"
              hint="Activa NCF/e-CF, retenciones y formatos 606/607/608." />
            {form.is_formal && <Field label="RNC"><Input className="num" value={form.rnc || ''} onChange={(e) => set({ rnc: e.target.value })} /></Field>}
            <Toggle checked={!!form.charges_itbis} onChange={(v) => set({ charges_itbis: v })} label="Cobro ITBIS en mis ventas"
              hint="Si está apagado, el ITBIS de tus compras se registra como gasto." />
            {form.charges_itbis && <Field label="Tasa general"><Select value={form.itbis_rate} onChange={(e) => set({ itbis_rate: e.target.value })}><option value={18}>18%</option><option value={16}>16%</option></Select></Field>}
            <button className="btn-outline w-full" onClick={save}>Aplicar</button>
          </div>
        </Card>
        <Card title="Logo" eyebrow="Para facturas">
          <label className="btn-outline w-full cursor-pointer"><Upload size={15} /> {company.has_logo ? 'Cambiar logo' : 'Subir logo'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} />
          </label>
        </Card>
      </div>
    </div>
  );
}

function InvoiceSettings() {
  const { form, set, save, error } = useCompanyForm(['invoice_prefix', 'next_invoice_no', 'quote_prefix', 'next_quote_no', 'invoice_footer', 'accent_color', 'payment_instructions', 'usd_rate']);
  return (
    <Card title="Numeración y apariencia" className="max-w-3xl">
      <div className="grid sm:grid-cols-4 gap-4">
        <Field label="Prefijo facturas"><Input value={form.invoice_prefix} onChange={(e) => set({ invoice_prefix: e.target.value })} /></Field>
        <Field label="Próximo número"><Input type="number" className="num" value={form.next_invoice_no} onChange={(e) => set({ next_invoice_no: e.target.value })} /></Field>
        <Field label="Prefijo cotizaciones"><Input value={form.quote_prefix} onChange={(e) => set({ quote_prefix: e.target.value })} /></Field>
        <Field label="Próximo número"><Input type="number" className="num" value={form.next_quote_no} onChange={(e) => set({ next_quote_no: e.target.value })} /></Field>
        <Field label="Color de acento" className="sm:col-span-1">
          <div className="flex gap-2 items-center"><input type="color" value={form.accent_color} onChange={(e) => set({ accent_color: e.target.value })} className="h-10 w-12 rounded-lg border border-line" /><Input className="num" value={form.accent_color} onChange={(e) => set({ accent_color: e.target.value })} /></div>
        </Field>
        <Field label="Pie de factura" className="sm:col-span-3" hint="Ej. políticas de devolución, agradecimiento.">
          <Textarea value={form.invoice_footer || ''} onChange={(e) => set({ invoice_footer: e.target.value })} />
        </Field>
        <Field label="Tasa del dólar" hint="RD$ por US$. Se propone en facturas y cobros en dólares; se actualiza sola con la última que uses.">
          <Input type="number" step="0.0001" className="num" value={form.usd_rate || ''} onChange={(e) => set({ usd_rate: e.target.value })} placeholder="60.00" />
        </Field>
        <Field label="Datos para pago" className="sm:col-span-3" hint="Se imprimen en facturas y estados de cuenta. Ej. Banco Popular · Cta. corriente 000-000000-0 · a nombre de Tecnossync">
          <Textarea value={form.payment_instructions || ''} onChange={(e) => set({ payment_instructions: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4"><ErrorBox error={error} /></div>
      <p className="text-[12px] text-text-muted mt-3">Las empresas informales usan esta numeración como número de factura. Las formales la usan como referencia interna además del NCF.</p>
      <div className="mt-5 flex justify-end"><button className="btn-primary" onClick={save}>Guardar</button></div>
    </Card>
  );
}

function NcfSettings() {
  const toast = useToast();
  const { data, reload } = useData(() => api.get('/company/ncf'), []);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const save = async () => {
    try { await api.post('/company/ncf', form); setForm(null); toast('Secuencia guardada'); reload(); } catch (e) { setError(e); }
  };
  return (
    <div className="card overflow-hidden max-w-4xl">
      <header className="flex items-center justify-between px-5 py-4">
        <div><h3 className="font-semibold text-[16px]">Secuencias autorizadas por la DGII</h3><p className="text-text-muted text-[13px]">Registra el rango que te autorizó la DGII para cada tipo de comprobante.</p></div>
        <button className="btn-primary" onClick={() => { setError(null); setForm({ ncf_type: 'B01', next_no: 1, end_no: 100, expires_at: `${new Date().getFullYear() + 1}-12-31` }); }}><Plus size={15} /> Agregar</button>
      </header>
      <table className="ledger">
        <thead><tr><th>Tipo</th><th className="r">Próximo</th><th className="r">Hasta</th><th className="r">Disponibles</th><th>Vence</th><th /></tr></thead>
        <tbody>
          {(data || []).map((s) => {
            const left = s.end_no - s.next_no + 1;
            return (
              <tr key={s.id}>
                <td><span className="num font-semibold">{s.ncf_type}</span> <span className="text-text-muted">{NCF_ALL.find((n) => n.code === s.ncf_type)?.label}</span></td>
                <td className="r num">{s.next_no}</td><td className="r num">{s.end_no}</td>
                <td className="r">{left <= 0 ? <Badge tone="danger">Agotada</Badge> : left < 20 ? <Badge tone="warn">{left}</Badge> : <span className="num">{left}</span>}</td>
                <td className="num text-[12.5px]">{date(s.expires_at)}</td>
                <td className="r whitespace-nowrap">
                  <button className="btn-ghost btn-sm" onClick={() => { setError(null); setForm({ ...s }); }}>Editar</button>
                  <button className="btn-ghost btn-sm hover:text-danger" onClick={async () => { await api.del(`/company/ncf/${s.id}`); reload(); }}><Trash2 size={14} /></button>
                </td>
              </tr>
            );
          })}
          {!data?.length && <tr><td colSpan={6} className="text-center text-text-muted py-10">Sin secuencias. Agrega al menos B01 y B02 para facturar.</td></tr>}
        </tbody>
      </table>
      <Modal open={!!form} onClose={() => setForm(null)} title="Secuencia NCF"
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
        {form && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipo" className="col-span-2"><Select value={form.ncf_type} onChange={(e) => setForm({ ...form, ncf_type: e.target.value })}>{NCF_ALL.map((n) => <option key={n.code} value={n.code}>{n.code} — {n.label}</option>)}</Select></Field>
            <Field label="Próximo número"><Input type="number" className="num" value={form.next_no} onChange={(e) => setForm({ ...form, next_no: e.target.value })} /></Field>
            <Field label="Último autorizado"><Input type="number" className="num" value={form.end_no} onChange={(e) => setForm({ ...form, end_no: e.target.value })} /></Field>
            <Field label="Fecha de vencimiento" className="col-span-2"><Input type="date" value={form.expires_at || ''} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></Field>
            <div className="col-span-2"><ErrorBox error={error} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function UsersSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, reload } = useData(() => api.get('/company/users'), []);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => setError(null), [form]);
  return (
    <div className="card overflow-hidden max-w-4xl">
      <header className="flex items-center justify-between px-5 py-4">
        <div><h3 className="font-semibold text-[16px]">Equipo</h3><p className="text-text-muted text-[13px]">Da acceso a tu contador, socios o empleados con el rol adecuado.</p></div>
        <button className="btn-primary" onClick={() => setForm({ email: '', name: '', password: '', role: 'accountant' })}><UserPlus size={15} /> Agregar</button>
      </header>
      <table className="ledger">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Desde</th><th /></tr></thead>
        <tbody>
          {(data || []).map((u) => (
            <tr key={u.id}>
              <td><div className="font-semibold">{u.name}</div><div className="text-[12px] text-text-muted">{u.email}</div></td>
              <td><Badge tone={u.role === 'owner' ? 'lime' : 'neutral'}>{ROLES[u.role]}</Badge></td>
              <td className="num text-[12.5px] text-text-muted">{date(u.created_at?.slice(0, 10))}</td>
              <td className="r">{u.role !== 'owner' && u.id !== user.id && <button className="btn-ghost btn-sm hover:text-danger" onClick={async () => { await api.del(`/company/users/${u.id}`); toast('Acceso retirado'); reload(); }}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-4 border-t border-line text-[12.5px] text-text-muted grid sm:grid-cols-2 gap-x-6 gap-y-1">
        <span><b className="text-text">Administrador:</b> todo, incluido ajustes y usuarios.</span>
        <span><b className="text-text">Contador:</b> contabilidad, anulaciones y reportes.</span>
        <span><b className="text-text">Operador:</b> facturas, gastos, cobros y pagos.</span>
        <span><b className="text-text">Solo lectura:</b> ver reportes y documentos.</span>
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title="Agregar usuario"
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          <button className="btn-primary" onClick={() => api.post('/company/users', form).then(() => { setForm(null); toast('Usuario agregado'); reload(); }).catch(setError)}>Agregar</button></>}>
        {form && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Correo" className="col-span-2" hint="Si ya tiene cuenta en Tecnossync Ledger, solo se le da acceso."><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Contraseña temporal"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="Rol" className="col-span-2"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['admin', 'accountant', 'operator', 'viewer'].map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</Select></Field>
            <div className="col-span-2"><ErrorBox error={error} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
