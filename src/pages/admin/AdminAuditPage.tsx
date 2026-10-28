import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../lib/format';
import { adminListAuditLogs } from '../../services/admin';

const ENTITY_TYPES: Record<string, string> = {
  all: 'Toutes les entités',
  vehicles: 'Véhicules',
  vehicle_categories: 'Catégories',
  vehicle_images: 'Photos',
  orders: 'Commandes',
  payments: 'Paiements',
  refunds: 'Remboursements',
  profiles: 'Utilisateurs',
  user_roles: 'Rôles',
  support_requests: 'Service client',
  announcements: 'Annonces',
  platform_settings: 'Paramètres',
};

export default function AdminAuditPage() {
  const [entity, setEntity] = useState('all');
  const { data, loading, error, reload } = useAsync(() => adminListAuditLogs(entity), [entity]);
  return (
    <>
      <PageMeta title="Journal d'audit — Administration" noindex />
      <PageHeader title="Journal d'audit" description="200 dernières opérations sensibles. Ce journal n'est pas modifiable depuis l'application." />
      <select className="input mb-4 w-auto" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filtrer">
        {Object.entries(ENTITY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<ScrollText className="h-10 w-10" />} title="Aucune entrée" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Date</th><th>Action</th><th>Entité</th><th>Auteur</th><th>Détails</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap text-xs">{formatDate(log.created_at, true)}</td>
                  <td className="font-mono text-xs">{log.action}</td>
                  <td className="text-xs">{ENTITY_TYPES[log.entity_type] ?? log.entity_type}<br /><span className="font-mono text-slate-400">{log.entity_id?.slice(0, 8)}</span></td>
                  <td className="font-mono text-xs">{log.actor_id ? log.actor_id.slice(0, 8) : 'système'}</td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-night-700">Afficher</summary>
                      <pre className="mt-2 max-h-64 max-w-md overflow-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify(log.details, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
