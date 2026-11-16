import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Car, CreditCard, LifeBuoy, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useAsync } from '../../hooks/useAsync';
import { CURRENCY, formatPrice } from '../../lib/format';
import { ORDER_STATUS_LABELS, PUBLICATION_STATUS_LABELS, entries } from '../../lib/labels';
import { getDashboardStats } from '../../services/admin';

export default function AdminDashboardPage() {
  const { data, loading, error, reload } = useAsync(getDashboardStats, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'Statistiques indisponibles.'} onRetry={reload} />;

  const totalOrders = Object.values(data.orders_by_status).reduce((a, b) => a + (b ?? 0), 0);
  const maxOrders = Math.max(1, ...Object.values(data.orders_by_status).map((v) => v ?? 0));
  const totalVehicles = Object.values(data.vehicles_by_status).reduce((a, b) => a + (b ?? 0), 0);

  const money = (v: number | undefined) => formatPrice(Number(v ?? 0), CURRENCY);
  // Trésorerie estimée : argent entré (dépôts validés) moins argent sorti (retraits payés, montant net versé)
  const treasury = Number(data.deposits_received_total ?? 0) - Number(data.withdrawals_paid_total ?? 0);
  const shortfall = Number(data.members_balance_total ?? 0) - treasury;
  const totals = [
    { label: 'Total déjà reçu', value: money(data.deposits_received_total), sub: 'Dépôts validés' },
    { label: 'Total gagné par les utilisateurs', value: money(data.users_earned_total), sub: 'Revenus, commissions, récompenses et bonus' },
    { label: 'Retraits payés', value: money(data.withdrawals_paid_total) },
    { label: 'Commissions versées', value: money(data.commissions_paid_total) },
    { label: 'Produits vendus', value: String(data.products_sold ?? 0), sub: 'Un par achat' },
    { label: 'Membres ayant acheté', value: String(data.buyers_total ?? 0), sub: 'Chaque membre compté une seule fois' },
    { label: 'Comptes certifiés', value: String(data.certified_members ?? 0), sub: 'Au moins un produit Prestige' },
    { label: 'Produits actifs', value: String(data.products_active ?? 0) },
  ];

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

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-accent-700 to-night-900 p-5 text-white shadow-md">
          <p className="text-sm text-white/80">Solde total des membres</p>
          <p className="mt-1 break-words text-3xl font-extrabold">{money(data.members_balance_total)}</p>
          <p className="mt-1 text-xs text-white/70">Ce que la plateforme doit encore aux membres (retirable par eux)</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-night-700 to-night-950 p-5 text-white shadow-md">
          <p className="text-sm text-white/80">Trésorerie estimée</p>
          <p className="mt-1 break-words text-3xl font-extrabold">{money(treasury)}</p>
          <p className="mt-1 text-xs text-white/70">Dépôts validés − retraits payés : argent qui devrait être sur le compte Drivest</p>
        </div>
      </div>

      {shortfall > 0 ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Attention :</strong> le solde des membres dépasse la trésorerie estimée de <strong>{money(shortfall)}</strong>.
            Si tous les membres retiraient leur solde, le compte Drivest ne suffirait pas.
          </p>
        </div>
      ) : (
        <p className="mb-4 text-xs text-slate-500">
          Marge : la trésorerie estimée couvre le solde des membres avec <strong>{money(-shortfall)}</strong> d&apos;avance.
          Estimation : ne tient pas compte des frais de l&apos;opérateur ni des sorties d&apos;argent faites hors de la plateforme.
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-3">
        {totals.map(({ label, value, sub }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 break-words text-xl font-bold text-slate-900">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
          </div>
        ))}
      </div>

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
