import { PageMeta } from '../components/PageMeta';
import { Alert, LoadingState } from '../components/ui/Feedback';
import { useSettings } from '../context/SettingsContext';

export default function LegalPage() {
  const { settings, loading } = useSettings();
  return (
    <div className="container-page max-w-3xl py-10">
      <PageMeta title="Mentions légales" />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mentions légales</h1>
      <div className="mt-6">
        {loading ? (
          <LoadingState />
        ) : settings?.legal_notice ? (
          <div className="card whitespace-pre-line p-6 text-sm leading-relaxed text-slate-700">{settings.legal_notice}</div>
        ) : (
          <Alert tone="warning" title="Informations en cours de publication">
            Les informations légales (identité de l'éditeur, statut juridique, coordonnées officielles, hébergeur)
            n'ont pas encore été renseignées par l'administration.
          </Alert>
        )}
      </div>
    </div>
  );
}
