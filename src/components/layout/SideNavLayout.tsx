import { Suspense, type ComponentType, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '../ui/Feedback';
import { PageErrorBoundary } from '../PageErrorBoundary';

export interface SideNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

/** Mise en page à navigation latérale (espace client et administration). */
export function SideNavLayout({ title, items, hideNavOnMobile = false }: { title: string; items: SideNavItem[]; hideNavOnMobile?: boolean }) {
  const { pathname } = useLocation();
  return (
    <div className="container-page py-6 lg:py-10">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <aside className={`mb-6 lg:mb-0 ${hideNavOnMobile ? 'hidden md:block' : ''}`}>
          <p className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-slate-500 lg:block">{title}</p>
          <nav aria-label={title} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-night-900 text-white' : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          {/* Une nouvelle page = un nouvel essai (key) */}
          <PageErrorBoundary key={pathname}>
            <Suspense fallback={<LoadingState />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </section>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
