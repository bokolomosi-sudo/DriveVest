import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-accent-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_-20px_rgba(11,26,54,0.25)] backdrop-blur sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
            <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#0b1a36" />
              <path d="M9 8h6.5a8 8 0 0 1 0 16H9z" fill="none" stroke="#14b897" strokeWidth="3" strokeLinejoin="round" />
              <path d="M13 16h4" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <p className="mt-3 text-xl font-extrabold tracking-tight text-night-900">
            Drive<span className="text-accent-500">st</span>
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Accès membre sécurisé</p>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        <nav aria-label="Aide et informations légales" className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <Link to="/guide" className="hover:text-slate-700">Guide</Link>
          <Link to="/faq" className="hover:text-slate-700">FAQ</Link>
          <Link to="/conditions-utilisation" className="hover:text-slate-700">Conditions</Link>
          <Link to="/confidentialite" className="hover:text-slate-700">Confidentialité</Link>
        </nav>
      </div>
    </div>
  );
}

/** N'autorise que les redirections internes (évite les redirections ouvertes). */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
