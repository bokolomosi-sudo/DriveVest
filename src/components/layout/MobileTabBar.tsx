import { NavLink } from 'react-router-dom';
import { Car, Home, MessageSquare, User } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/produits', label: 'Produits', icon: Car, end: false },
  { to: '/messages', label: 'Messages', icon: MessageSquare, end: false },
  { to: '/compte', label: 'Moi', icon: User, end: false },
];

/** Barre d'onglets fixe en bas de l'écran, sur mobile uniquement. */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${isActive ? 'text-accent-600' : 'text-slate-400'}`
              }
            >
              <Icon className="h-6 w-6" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
