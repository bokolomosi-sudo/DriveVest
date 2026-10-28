export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? '#11244a' : '#0b1a36'} />
        <path d="M9 8h6.5a8 8 0 0 1 0 16H9z" fill="none" stroke="#14b897" strokeWidth="3" strokeLinejoin="round" />
        <path d="M13 16h4" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-night-900'}`}>
        Drive<span className="text-accent-500">st</span>
      </span>
    </span>
  );
}
