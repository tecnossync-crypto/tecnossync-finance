import { useEffect, useState } from 'react';
import { Plus, Search, Users, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Select, Tabs, Textarea, useData, useToast, Badge } from '../components/ui';

const KIND = { customer: 'Cliente', supplier: 'Proveedor', both: 'Cliente y proveedor' };

export function ContactModal({ open, onClose, onSaved, contact, defaultKind = 'customer' }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) { setError(null); setForm(contact || { kind: defaultKind, id_type: 'rnc', name: '', tax_id: '', email: '', phone: '', address: '' }); }
  }, [open, contact, defaultKind]);
  const save = async () => {
    try {
      const c = contact ? await api.put(`/contacts/${contact.id}`, form) : await api.post('/contacts', form);
      onSaved(c);
    } catch (e) { setError(e); }
  };
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  return (
    <Modal open={open} onClose={onClose} title={contact ? 'Editar contacto' : 'Nuevo contacto'}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo" className="col-span-2">
          <Tabs tabs={Object.entries(KIND)} value={form.kind} onChange={(kind) => set({ kind })} />
        </Field>
        <Field label="Nombre o razón social" className="col-span-2"><Input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="Identificación">
          <Select value={form.id_type || 'none'} onChange={(e) => set({ id_type: e.target.value })}>
            <option value="rnc">RNC</option><option value="cedula">Cédula</option><option value="passport">Pasaporte</option><option value="none">Sin identificación</option>
          </Select>
        </Field>
        <Field label="Número"><Input className="num" value={form.tax_id || ''} disabled={form.id_type === 'none'} onChange={(e) => set({ tax_id: e.target.value })} placeholder={form.id_type === 'cedula' ? '000-0000000-0' : '1-01-00000-0'} /></Field>
        <Field label="Teléfono"><Input value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Correo"><Input type="email" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Dirección" className="col-span-2"><Input value={form.address || ''} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Notas" className="col-span-2"><Textarea rows={2} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </div>
    </Modal>
  );
}

export default function Contacts() {
  const { can } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, loading, reload } = useData(() => api.get(`/contacts?kind=${kind}&q=${encodeURIComponent(q)}`), [kind, q]);
  return (
    <>
      <PageHeader eyebrow="Ventas · Directorio" title="Clientes y proveedores"
        subtitle="Con su RNC o cédula registrado, los reportes 606 y 607 salen completos."
        actions={can('operator') && <button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nuevo contacto</button>} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={[['', 'Todos'], ['customer', 'Clientes'], ['supplier', 'Proveedores']]} value={kind} onChange={setKind} />
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input placeholder="Buscar por nombre o RNC" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Loading /> : !data.length ? <Empty icon={Users} title="Sin contactos" text="Agrega tus clientes y proveedores." /> : (
          <div className="overflow-x-auto">
            <table className="ledger min-w-[720px]">
              <thead><tr><th>Nombre</th><th>RNC / Cédula</th><th>Contacto</th><th className="r">Te deben</th><th className="r">Les debes</th><th /></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td><div className="font-semibold">{c.name}</div><Badge className="mt-1">{KIND[c.kind]}</Badge></td>
                    <td className="num text-[12.5px]">{c.tax_id || <span className="text-text-faint">—</span>}</td>
                    <td className="text-[12.5px] text-text-muted">{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="r">{c.receivable > 0 ? <Money value={c.receivable} className="font-semibold" /> : <span className="text-text-faint">—</span>}</td>
                    <td className="r">{c.payable > 0 ? <Money value={c.payable} className="font-semibold text-danger" /> : <span className="text-text-faint">—</span>}</td>
                    <td className="r w-12">{can('operator') && <button className="btn-ghost btn-sm" onClick={() => setEditing(c)}><Pencil size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ContactModal open={!!editing} contact={editing?.id ? editing : null} defaultKind={kind || 'customer'} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast('Contacto guardado'); reload(); }} />
    </>
  );
}
