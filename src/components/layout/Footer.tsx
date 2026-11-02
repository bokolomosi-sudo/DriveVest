import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

const GROUPS = [
  {
    title: 'Guide',
    links: [
      { to: '/guide', label: "Guide d'utilisation" },
      { to: '/guide/faire-un-depot', label: 'Faire un dépôt' },
      { to: '/guide/faire-un-retrait', label: 'Faire un retrait' },
      { to: '/guide/parrainage', label: 'Parrainage' },
    ],
  },
  {
    title: 'Drivest',
    links: [
      { to: '/guide/a-propos', label: 'À propos' },
      { to: '/faq', label: 'FAQ et contact' },
      { to: '/service-client', label: 'Service client' },
    ],
  },
  {
    title: 'Informations légales',
    links: [
      { to: '/conditions-utilisation', label: "Conditions d'utilisation" },
      { to: '/confidentialite', label: 'Confidentialité' },
      { to: '/cookies', label: 'Cookies et stockage' },
      { to: '/mentions-legales', label: 'Mentions légales' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10 bg-night-950 text-night-100">
      <div className="container-page grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <Logo light />
          <p className="mt-3 text-sm text-night-200">© {new Date().getFullYear()} Drivest</p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="text-sm font-semibold text-white">{g.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {g.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-white">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
