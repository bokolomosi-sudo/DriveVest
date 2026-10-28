import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LayoutDashboard, LogOut, Menu, Shield, User, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { countUnreadNotifications } from '../../services/account';
import { Logo } from '../Logo';

const BASE_LINKS = [
  { to: '/produits', label: 'Produits' },
  { to: '/actualites', label: 'Actualités' },
  { to: '/service-client', label: 'Service client' },
];

export function Navbar() {
  const { user, isAdmin, signOut } = useAuth();
  const LINKS = BASE_LINKS;
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    countUnreadNotifications(user.id).then(setUnread).catch(() => setUnread(0));
  }, [user, location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-white/10 text-white' : 'text-night-100 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-night-950/95 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between gap-4" aria-label="Navigation principale">
        <Link to="/" aria-label="Accueil Drivest">
          <Logo light />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              {isAdmin && (
                <Link to="/admin" className="btn-ghost btn-sm text-night-100 hover:bg-white/10 hover:text-white">
                  <Shield className="h-4 w-4" /> Administration
                </Link>
              )}
              <Link
                to="/compte/notifications"
                className="relative rounded-lg p-2 text-night-100 hover:bg-white/10 hover:text-white"
                aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-night-950">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <Link to="/compte" className="btn-primary btn-sm">
                <User className="h-4 w-4" /> Mon espace
              </Link>
              <button onClick={handleSignOut} className="rounded-lg p-2 text-night-100 hover:bg-white/10 hover:text-white" aria-label="Se déconnecter">
                <LogOut className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <Link to="/connexion" className="btn-ghost btn-sm text-night-100 hover:bg-white/10 hover:text-white">
                Connexion
              </Link>
              <Link to="/inscription" className="btn-primary btn-sm">
                Créer un compte
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-white hover:bg-white/10 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-white/10 bg-night-950 md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-white/10" />
            {user ? (
              <>
                <NavLink to="/compte" end className={linkClass}>
                  <span className="inline-flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" /> Mon espace
                  </span>
                </NavLink>
                <NavLink to="/compte/notifications" className={linkClass}>
                  <span className="inline-flex items-center gap-2">
                    <Bell className="h-4 w-4" /> Notifications {unread > 0 && `(${unread})`}
                  </span>
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin" className={linkClass}>
                    <span className="inline-flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Administration
                    </span>
                  </NavLink>
                )}
                <button onClick={handleSignOut} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-night-100 hover:bg-white/5">
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="h-4 w-4" /> Se déconnecter
                  </span>
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link to="/connexion" className="btn border border-white/20 text-white hover:bg-white/10">
                  Connexion
                </Link>
                <Link to="/inscription" className="btn-primary">
                  Créer un compte
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
