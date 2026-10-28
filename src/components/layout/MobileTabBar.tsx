import { Link, useLocation } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Car, Home, User } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/compte/depot', label: 'Dépôt', icon: ArrowDownToLine },
  { to: '/produits', label: 'Produits', icon: Car },
  { to: '/compte/retrait', label: 'Retrait', icon: ArrowUpFromLine },
  { to: '/compte', label: 'Compte', icon: User },
];

// « Compte » couvre tout l'espace membre, sauf Dépôt et Retrait qui ont leur propre onglet
function isActive(to: string, path: string): boolean {
  if (to === '/') return path === '/';
  if (to === '/compte') return path.startsWith('/compte') && !path.startsWith('/compte/depot') && !path.startsWith('/compte/retrait');
  return path.startsWith(to);
}

/** Barre d'onglets fixe en bas de l'écran, sur mobile uniquement. */
export function MobileTabBar() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = isActive(to, pathname);
          return (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-transform active:scale-90 min-[360px]:text-xs ${active ? 'text-accent-600' : 'text-slate-400'}`}
              >
                <Icon className="h-6 w-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
