import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { SupportContactCard } from '../../components/admin/SupportContactCard';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { SUPPORT_STATUS_LABELS, SUPPORT_STATUS_TONES, SUPPORT_TOPIC_LABELS, entries } from '../../lib/labels';
import { adminListSupportRequests, adminRespondSupport } from '../../services/content';
import type { SupportRequest, SupportStatus } from '../../types';

function RequestCard({ request, onDone }: { request: SupportRequest; onDone: () => void }) {
  const { notify } = useToast();
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<SupportStatus>(request.status === 'open' ? 'answered' : request.status);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await adminRespondSupport(request.id, response, status);
      notify('success', 'Demande mise à jour.');
      setResponse('');
      onDone();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{request.subject}</p>
          <p className="text-xs text-slate-500">
            {SUPPORT_TOPIC_LABELS[request.topic]} · {request.customer?.full_name ?? request.customer?.email ?? 'Client'} · {formatDate(request.created_at, true)}
          </p>
        </div>
        <Badge tone={SUPPORT_STATUS_TONES[request.status]}>{SUPPORT_STATUS_LABELS[request.status]}</Badge>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{request.message}</p>
      {request.admin_response && (
        <div className="mt-3 rounded-lg border-l-4 border-accent-500 bg-accent-50 p-3 text-sm">
          <p className="text-xs font-semibold text-accent-800">Réponse envoyée · {formatDate(request.responded_at, true)}</p>
          <p className="mt-1 whitespace-pre-line">{request.admin_response}</p>
        </div>
      )}
      {request.status !== 'closed' && (
        <div className="mt-4 space-y-2">
          <label htmlFor={`resp-${request.id}`} className="sr-only">Réponse</label>
          <textarea id={`resp-${request.id}`} rows={3} className="input" placeholder="Rédiger une réponse au client…" value={response} onChange={(e) => setResponse(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as SupportStatus)} aria-label="Statut">
              {entries(SUPPORT_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn-primary" onClick={submit} disabled={busy || (!response.trim() && status === request.status)}>
              {busy && <Spinner className="h-4 w-4" />} Enregistrer
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AdminSupportPage() {
  const [status, setStatus] = useState<SupportStatus | 'all'>('open');
  const { data, loading, error, reload } = useAsync(() => adminListSupportRequests(status), [status]);
  return (
    <>
      <PageMeta title="Service client — Administration" noindex />
      <PageHeader title="Service client" description="Contact WhatsApp affiché aux membres, puis leurs demandes écrites." />
      <SupportContactCard />
      <select className="input mb-4 w-auto" value={status} onChange={(e) => setStatus(e.target.value as SupportStatus | 'all')} aria-label="Filtrer">
        <option value="all">Toutes</option>
        {entries(SUPPORT_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<LifeBuoy className="h-10 w-10" />} title="Aucune demande" />
      ) : (
        <ul className="space-y-4">{data.map((r) => <RequestCard key={r.id} request={r} onDone={reload} />)}</ul>
      )}
    </>
  );
}
