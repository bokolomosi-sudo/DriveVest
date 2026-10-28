import { Megaphone } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/format';
import { listPublishedAnnouncements } from '../services/content';

export default function AnnouncementsPage() {
  const { data, loading, error, reload } = useAsync(listPublishedAnnouncements, []);
  return (
    <div className="container-page max-w-3xl py-10">
      <PageMeta title="Actualités" description="Les annonces et informations publiées par l'équipe Drivest." />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Actualités</h1>
      <p className="mt-1 text-sm text-slate-500">Annonces et informations publiées par l'équipe Drivest.</p>
      <div className="mt-8 space-y-4">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data && data.length > 0 ? (
          data.map((a) => (
            <article key={a.id} className="card p-5 sm:p-6">
              <p className="text-xs font-medium text-slate-500">{formatDate(a.published_at)}</p>
              <h2 className="mt-1 text-lg font-semibold">{a.title}</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{a.body}</p>
            </article>
          ))
        ) : (
          <EmptyState icon={<Megaphone className="h-10 w-10" />} title="Aucune annonce publiée" />
        )}
      </div>
    </div>
  );
}
