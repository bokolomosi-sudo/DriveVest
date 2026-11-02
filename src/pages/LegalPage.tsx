import { Link } from 'react-router-dom';
import { PageMeta } from '../components/PageMeta';
import { useSettings } from '../context/SettingsContext';
import { LEGAL_DOCS, LegalDocBody, type LegalDocKey } from './info/legalDocs';

export default function LegalPage({ doc = 'mentions' }: { doc?: LegalDocKey }) {
  const { settings } = useSettings();
  const meta = LEGAL_DOCS.find((d) => d.key === doc)!;
  return (
    <div className="container-page max-w-3xl py-6 sm:py-10">
      <PageMeta title={meta.title} description={meta.description} />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{meta.title}</h1>

      <div className="card mt-6 space-y-6 p-5 text-sm leading-relaxed text-slate-700 sm:p-6">
        <LegalDocBody docKey={doc} />
        {/* Texte libre saisi dans Administration > Paramètres */}
        {doc === 'mentions' && settings?.legal_notice && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Informations complémentaires</h2>
            <p className="whitespace-pre-line">{settings.legal_notice}</p>
          </section>
        )}
      </div>

      <nav aria-label="Autres documents" className="mt-6 flex flex-wrap gap-2 text-sm">
        {LEGAL_DOCS.filter((d) => d.key !== doc).map((d) => (
          <Link key={d.key} to={d.path} className="rounded-full bg-white px-3 py-1.5 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
            {d.title}
          </Link>
        ))}
        <Link to="/faq" className="rounded-full bg-white px-3 py-1.5 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">FAQ et contact</Link>
      </nav>
    </div>
  );
}
