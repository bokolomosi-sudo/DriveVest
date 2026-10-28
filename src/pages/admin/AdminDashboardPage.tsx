import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Car, CreditCard, LifeBuoy, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { formatPrice } from '../../lib/format';
import { ORDER_STATUS_LABELS, PUBLICATION_STATUS_LABELS, entries } from '../../lib/labels';
import { getDashboardStats } from '../../services/admin';

export default function AdminDashboardPage() {
  const { data, loading, error, reload } = useAsync(getDashboardStats, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'Statistiques indisponibles.'} onRetry={reload} />;

  const totalOrders = Object.values(data.orders_by_status).reduce((a, b) => a + (b ?? 0), 0);
  const maxOrders = Math.max(1, ...Object.values(data.orders_by_status).map((v) => v ?? 0));
  const totalVehicles = Object.values(data.vehicles_by_status).reduce((a, b) => a + (b ?? 0), 0);

  const tiles = [
    { label: 'Utilisateurs', value: data.users_total, sub: `${data.users_blocked} bloqué(s)`, icon: Users, to: '/admin/utilisateurs' },
    { label: 'Véhicules', value: totalVehicles, sub: `${data.vehicles_by_status.published ?? 0} publié(s)`, icon: Car, to: '/admin/vehicules' },
    { label: 'Paiements à vérifier', value: data.payments_pending, icon: CreditCard, to: '/admin/finances', alert: data.payments_pending > 0 },
    { label: 'Demandes support ouvertes', value: data.support_open, icon: LifeBuoy, to: '/admin/support', alert: data.support_open > 0 },
    { label: 'Dépôts à vérifier', value: data.deposits_pending ?? 0, icon: ArrowDownToLine, to: '/admin/portefeuilles', alert: (data.deposits_pending ?? 0) > 0 },
    { label: 'Retraits à traiter', value: data.withdrawals_pending ?? 0, icon: ArrowUpFromLine, to: '/admin/portefeuilles?onglet=retraits', alert: (data.withdrawals_pending ?? 0) > 0 },
  ];

  return (
    <>
      <PageMeta title="Administration" noindex />
      <PageHeader title="Tableau de bord" description="Statistiques calculées en temps réel à partir de la base de données." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, sub, icon: Icon, to, alert }) => (
          <Link key={label} to={to} className="card p-4 transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <Icon className="h-5 w-5 text-night-600" />
              {alert && <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Action requise" />}
            </div>
            <p className="mt-3 text-2xl font-bold">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
            {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Commandes par statut</h2>
          <p className="text-xs text-slate-500">{totalOrders} commande(s) au total</p>
          {totalOrders === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Aucune commande enregistrée.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {entries(ORDER_STATUS_LABELS)
                .filter(([k]) => (data.orders_by_status[k] ?? 0) > 0)
                .map(([k, label]) => {
                  const value = data.orders_by_status[k] ?? 0;
                  return (
                    <li key={k}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-600">{label}</span>
                        <span className="font-semibold">{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-night-600" style={{ width: `${(value / maxOrders) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold">Paiements vérifiés (cumul)</h2>
            {Object.keys(data.confirmed_payments_by_currency).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Aucun paiement vérifié.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {Object.entries(data.confirmed_payments_by_currency).map(([currency, total]) => (
                  <li key={currency} className="text-xl font-bold text-night-900">{formatPrice(Number(total), currency)}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Annonces véhicules</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {entries(PUBLICATION_STATUS_LABELS).map(([k, label]) => (
                <li key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-semibold">{data.vehicles_by_status[k] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
