import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { OrderStatusBadge } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { VehicleImagePlaceholder } from '../../components/vehicles/VehicleImagePlaceholder';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatPrice } from '../../lib/format';
import { listMyOrders } from '../../services/orders';
import { vehicleImageUrl } from '../../services/vehicles';

/** Produits achetés par le client. */
export default function MyProductsPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => listMyOrders(user!.id), [user!.id]);

  return (
    <>
      <PageMeta title="Mes produits" noindex />
      <PageHeader title="Mes produits" description="Les produits que vous avez achetés." />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="Vous n'avez encore aucun produit"
          action={<Link to="/produits" className="btn-primary">Voir les produits</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {data.map((o) => {
            const item = o.items?.[0];
            const cover = item?.vehicle?.images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0];
            const name = item?.vehicle ? `${item.vehicle.brand} ${item.vehicle.model}` : item?.vehicle_label ?? o.order_number;
            return (
              <li key={o.id}>
                <Link to={`/compte/commandes/${o.id}`} className="flex gap-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 hover:bg-slate-50">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {cover ? <img src={vehicleImageUrl(cover, 200)} alt={name} className="h-full w-full object-cover" /> : <VehicleImagePlaceholder label="" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-bold text-slate-900">{name}</p>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 text-lg font-extrabold text-red-500">{formatPrice(Number(o.total_amount), o.currency)}</p>
                    <p className="text-xs text-slate-500">
                      {item?.vehicle?.duration_days ? `Durée : ${item.vehicle.duration_days} jours · ` : ''}Acheté le {formatDate(o.created_at)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
