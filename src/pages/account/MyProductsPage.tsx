import { Link } from 'react-router-dom';
import { Package, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { OrderStatusBadge } from '../../components/orders/OrderParts';
import { PageMeta } from '../../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { VehicleImagePlaceholder } from '../../components/vehicles/VehicleImagePlaceholder';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { listMyOrders } from '../../services/orders';
import { listMyProductRevenues, todayInKinshasa } from '../../services/revenue';
import { vehicleImageUrl } from '../../services/vehicles';

/** Produits achetés par le client. */
export default function MyProductsPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => listMyOrders(user!.id), [user!.id]);
  const revenues = useAsync(listMyProductRevenues, []);
  const today = todayInKinshasa();
  const revenueOf = (orderId: string) => (revenues.data ?? []).filter((r) => r.order_id === orderId);
  const todayTotal = (revenues.data ?? []).filter((r) => r.revenue_date === today).reduce((s, r) => s + r.amount, 0);
  const allTotal = (revenues.data ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageMeta title="Mes produits" noindex />
      <PageHeader title="Mes produits" description="Les produits que vous avez achetés et les revenus qu'ils vous ont rapportés." />
      {(revenues.data?.length ?? 0) > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs text-slate-500">Revenu du jour</p>
            <p className="text-xl font-bold text-green-700">+{formatPrice(todayTotal, CURRENCY)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs text-slate-500">Revenus reçus au total</p>
            <p className="text-xl font-bold text-slate-900">{formatPrice(allTotal, CURRENCY)}</p>
          </div>
        </div>
      )}
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
                    {item?.vehicle?.duration_days && (
                      <p className="text-xs font-medium text-slate-700">
                        Expire le {formatDate(new Date(new Date(o.created_at).getTime() + item.vehicle.duration_days * 86400000).toISOString())}
                      </p>
                    )}
                    {revenueOf(o.id).length > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-green-700">
                        <TrendingUp className="h-3.5 w-3.5" /> Revenus reçus : {formatPrice(revenueOf(o.id).reduce((t, r) => t + r.amount, 0), CURRENCY)}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {(revenues.data?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Historique des revenus</h2>
          <p className="mb-3 text-xs text-slate-500">Revenus quotidiens versés automatiquement à votre portefeuille chaque jour pendant toute la durée de vos produits.</p>
          <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            {revenues.data!.map((r, i) => (
              <li key={`${r.order_id}-${r.revenue_date}-${i}`} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{r.vehicle_label}</p>
                  <p className="text-xs text-slate-500">Revenu du {formatDate(r.revenue_date)}</p>
                </div>
                <p className="shrink-0 font-bold text-green-700">+{formatPrice(r.amount, CURRENCY)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
