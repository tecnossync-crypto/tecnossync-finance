// Marca: dos barras = "todo cuadra". La superior en lima, la inferior en blanco/tinta.
export function Mark({ size = 28, dark = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill={dark ? '#C6F16A' : '#0B1512'} />
      <rect x="7" y="10" width="18" height="4" rx="1.5" fill={dark ? '#0B1512' : '#C6F16A'} />
      <rect x="7" y="18" width="18" height="4" rx="1.5" fill={dark ? '#0B1512' : '#FFFFFF'} />
    </svg>
  );
}

export function Logo({ dark = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark dark={dark} />
      <span className={`font-display text-[21px] font-semibold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>cuadre</span>
    </span>
  );
}
