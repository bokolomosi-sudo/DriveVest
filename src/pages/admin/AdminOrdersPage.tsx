import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingBag } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { OrderStatusBadge } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatPrice } from '../../lib/format';
import { ORDER_STATUS_LABELS, entries } from '../../lib/labels';
import { adminListOrders } from '../../services/orders';
import type { OrderStatus } from '../../types';

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useAsync(() => adminListOrders(status, query), [status, query]);

  return (
    <>
      <PageMeta title="Commandes — Administration" noindex />
      <PageHeader title="Commandes" description="Suivi et traitement des demandes d'achat." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Numéro de commande" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
        </form>
        <select className="input sm:w-64" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | 'all')} aria-label="Filtrer par statut">
          <option value="all">Tous les statuts</option>
          {entries(ORDER_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="h-10 w-10" />} title="Aucune commande" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Commande</th><th>Client</th><th>Véhicule</th><th>Montant</th><th>Date</th><th>Statut</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td><Link to={`/admin/commandes/${o.id}`} className="font-semibold text-night-700 hover:underline">{o.order_number}</Link></td>
                  <td>
                    <p className="font-medium">{o.customer?.full_name ?? '—'}</p>
                    <p className="text-xs text-slate-500">{o.customer?.email}</p>
                  </td>
                  <td>{o.items?.[0]?.vehicle_label ?? '—'}</td>
                  <td className="whitespace-nowrap">{formatPrice(Number(o.total_amount), o.currency)}</td>
                  <td className="whitespace-nowrap text-xs">{formatDate(o.created_at, true)}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
