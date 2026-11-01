import { useEffect, useState } from 'react';
import { Plus, Package, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Empty, ErrorBox, Field, Input, Loading, Modal, Money, PageHeader, Select, Tabs, useData, useToast } from '../components/ui';

function ProductModal({ open, product, onClose, onSaved, accounts }) {
  const { company } = useAuth();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) { setError(null); setForm(product || { kind: 'service', name: '', sku: '', price: '', itbis_rate: company.charges_itbis ? Number(company.itbis_rate) : 0, income_account_id: '' }); }
  }, [open, product, company]);
  const save = async () => {
    try { product ? await api.put(`/products/${product.id}`, form) : await api.post('/products', form); onSaved(); }
    catch (e) { setError(e); }
  };
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar producto' : 'Nuevo producto o servicio'}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><Tabs tabs={[['service', 'Servicio'], ['good', 'Bien / producto']]} value={form.kind} onChange={(kind) => set({ kind })} /></div>
        <Field label="Nombre" className="col-span-2"><Input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="Precio"><Input type="number" step="0.01" className="num text-right" value={form.price ?? ''} onChange={(e) => set({ price: e.target.value })} /></Field>
        <Field label="Código / SKU"><Input value={form.sku || ''} onChange={(e) => set({ sku: e.target.value })} /></Field>
        {company.charges_itbis && (
          <Field label="ITBIS"><Select value={form.itbis_rate} onChange={(e) => set({ itbis_rate: Number(e.target.value) })}><option value={18}>18%</option><option value={16}>16%</option><option value={0}>Exento</option></Select></Field>
        )}
        <Field label="Cuenta de ingreso" className={company.charges_itbis ? '' : 'col-span-2'} hint="Opcional. Por defecto: ventas o servicios.">
          <Select value={form.income_account_id || ''} onChange={(e) => set({ income_account_id: e.target.value })}>
            <option value="">Automática</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </Select>
        </Field>
        <div className="col-span-2"><ErrorBox error={error} /></div>
      </div>
    </Modal>
  );
}

export default function Products() {
  const { can, company } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const { data, loading, reload } = useData(() => api.get('/products'), []);
  const { data: accounts } = useData(() => api.get('/accounting/accounts').then((a) => a.filter((x) => x.type === 'income' && x.is_postable)), []);
  return (
    <>
      <PageHeader eyebrow="Ventas · Catálogo" title="Productos y servicios" subtitle="Precios y tasas de ITBIS listos para facturar en segundos."
        actions={can('operator') && <button className="btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nuevo</button>} />
      <div className="card overflow-hidden">
        {loading ? <Loading /> : !data.length ? <Empty icon={Package} title="Catálogo vacío" text="Agrega lo que vendes para facturar más rápido." /> : (
          <div className="overflow-x-auto">
            <table className="ledger min-w-[640px]">
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Cuenta</th>{company.charges_itbis && <th className="r">ITBIS</th>}<th className="r">Precio</th><th /></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td><div className="font-semibold">{p.name}</div>{p.sku && <div className="num text-[11.5px] text-text-faint">{p.sku}</div>}</td>
                    <td><Badge>{p.kind === 'good' ? 'Bien' : 'Servicio'}</Badge></td>
                    <td className="text-text-muted text-[12.5px]">{p.account_name || 'Automática'}</td>
                    {company.charges_itbis && <td className="r num">{Number(p.itbis_rate) ? `${Number(p.itbis_rate)}%` : 'Exento'}</td>}
                    <td className="r"><Money value={p.price} className="font-semibold" /></td>
                    <td className="r w-24 whitespace-nowrap">
                      {can('operator') && <>
                        <button className="btn-ghost btn-sm" onClick={() => setEditing(p)}><Pencil size={14} /></button>
                        <button className="btn-ghost btn-sm hover:text-danger" onClick={async () => { await api.del(`/products/${p.id}`); toast('Producto eliminado'); reload(); }}><Trash2 size={14} /></button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ProductModal open={!!editing} product={editing?.id ? editing : null} accounts={accounts || []} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast('Guardado'); reload(); }} />
    </>
  );
}
