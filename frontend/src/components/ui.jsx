import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { money } from '../lib/format';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[28px] sm:text-[32px] leading-[1.05] font-semibold">{title}</h1>
        {subtitle && <p className="text-text-muted mt-2 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="block text-[12.5px] font-semibold text-text mb-1.5">{label}</span>}
      {children}
      {hint && <span className="block text-[12px] text-text-faint mt-1">{hint}</span>}
    </label>
  );
}

export const Input = (p) => <input {...p} className={cx('input', p.className)} />;
export const Select = ({ children, ...p }) => <select {...p} className={cx('input', p.className)}>{children}</select>;
export const Textarea = (p) => <textarea rows={3} {...p} className={cx('input', p.className)} />;

export function MoneyInput({ value, onChange, ...p }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-[12px] num">RD$</span>
      <input type="number" step="0.01" min="0" inputMode="decimal" {...p} value={value ?? ''}
        onChange={(e) => onChange(e.target.value)} className={cx('input num pl-11 text-right', p.className)} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left group">
      <span className={cx('mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-line-strong')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold">{label}</span>
        {hint && <span className="block text-[12.5px] text-text-muted">{hint}</span>}
      </span>
    </button>
  );
}

const TONES = {
  neutral: 'bg-black/[0.05] text-text-muted',
  ok: 'bg-brand-50 text-brand-700',
  warn: 'bg-warn-50 text-warn',
  danger: 'bg-danger-50 text-danger',
  info: 'bg-info-50 text-info',
  lime: 'bg-lime-soft text-ink',
};
export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11.5px] font-semibold whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}
export const StatusBadge = ({ map, status }) => { const [l, t] = map[status] || [status, 'neutral']; return <Badge tone={t}>{l}</Badge>; };

export const Money = ({ value, currency, className, signed }) => (
  <span className={cx('num', signed && Number(value) < 0 && 'text-danger', className)}>{money(value, currency)}</span>
);

export function Card({ title, eyebrow, actions, children, className, pad = true }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h3 className="text-[16px] font-semibold">{title}</h3>}
          </div>
          {actions}
        </header>
      )}
      <div className={pad ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative w-full bg-surface rounded-t-2xl sm:rounded-2xl shadow-pop max-h-[92vh] flex flex-col', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-[19px] font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-6 py-4 border-t border-line bg-paper/50 rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      {Icon && (
        <div className="h-12 w-12 rounded-xl bg-paper border border-line grid place-items-center mb-4">
          <Icon size={20} className="text-text-muted" />
        </div>
      )}
      <div className="font-display text-[17px] font-semibold">{title}</div>
      {text && <p className="text-text-muted mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const Spinner = ({ className }) => <Loader2 size={18} className={cx('animate-spin text-text-faint', className)} />;
export const Loading = () => <div className="py-20 grid place-items-center"><Spinner /></div>;

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-black/[0.045] gap-1 overflow-x-auto max-w-full">
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={cx('h-8 px-3.5 rounded-lg text-[13px] font-semibold transition whitespace-nowrap',
            value === k ? 'bg-surface text-text shadow-card' : 'text-text-muted hover:text-text')}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ---- Toasts ----
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 left-5 sm:left-auto z-[60] flex flex-col gap-2 items-end no-print">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-xl bg-ink text-white shadow-pop text-[13.5px] max-w-sm">
            {t.tone === 'error' ? <AlertTriangle size={16} className="text-[#FF8F86] shrink-0" /> : <Check size={16} className="text-lime shrink-0" />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// Hook de carga de datos con recarga manual
export function useData(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn().then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="rounded-lg bg-danger-50 text-danger px-3 py-2 text-[13px] font-medium">{error.message || String(error)}</div>;
}

export function Stat({ label, value, currency, foot, tone, icon: Icon }) {
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon size={15} className="text-text-faint" />}
      </div>
      <div className={cx('num text-[24px] sm:text-[26px] font-semibold mt-3 leading-none', tone === 'danger' && 'text-danger', tone === 'brand' && 'text-brand')}>
        {money(value, currency)}
      </div>
      {foot && <div className="text-[12.5px] text-text-muted mt-2.5">{foot}</div>}
    </div>
  );
}
