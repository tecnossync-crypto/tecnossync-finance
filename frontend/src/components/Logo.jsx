import { useId } from 'react';

// Marca: el cuadro degradado de Tecnossync con una cuenta T (debe | haber) en blanco.
export function Mark({ size = 28 }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E0359A" /><stop offset="1" stopColor="#8B2FC9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <rect x="7.5" y="9" width="17" height="3" rx="1.5" fill="#fff" />
      <rect x="14.5" y="9" width="3" height="14" rx="1.5" fill="#fff" />
      <rect x="8.5" y="15.5" width="4" height="2" rx="1" fill="#fff" fillOpacity=".55" />
      <rect x="19.5" y="15.5" width="4" height="2" rx="1" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}

export function Logo({ dark = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark />
      <span className="leading-none">
        <span className={`font-display text-[19px] font-extrabold tracking-[-0.02em] ${dark ? 'text-white' : 'text-ink'}`}>
          Tecnos<span className={`bg-clip-text text-transparent ${dark ? 'bg-grad2' : 'bg-grad'}`}>sync</span>
        </span>
        <span className={`block font-mono text-[9.5px] uppercase tracking-[0.32em] mt-1 ${dark ? 'text-white/50' : 'text-text-faint'}`}>Ledger</span>
      </span>
    </span>
  );
}
