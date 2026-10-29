import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Play, RefreshCw, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { productYield } from '../../lib/productYield';
import { adminListDailyCredits, creditDueProductRevenues } from '../../services/revenue';
import { adminListVehicles } from '../../services/vehicles';

export default function AdminRevenuePage() {
  const { notify } = useToast();
  const vehicles = useAsync(() => adminListVehicles('all'), []);
  const credits = useAsync(adminListDailyCredits, []);
  const [running, setRunning] = useState(false);

  const revenueProducts = (vehicles.data ?? []).filter(
    (v) => Number(v.daily_revenue_percent) > 0 && Number(v.price) > 0,
  );

  const totalDistributed = (credits.data ?? []).reduce((sum, c) => sum + c.amount, 0);

  const runCreditsNow = async () => {
    if (running) return;
    setRunning(true);
    try {
      const credited = await creditDueProductRevenues();
      if (credited > 0) {
        notify('success', `${credited} versement(s) quotidien(s) effectué(s) avec succès.`);
      } else {
        notify('info', 'Aucun versement n’était en attente à cette heure.');
      }
      await credits.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageMeta title="Revenus automatiques — Administration" noindex />
      <PageHeader
        title="Revenus des produits"
        description="Distribution automatique des revenus quotidiens aux acheteurs selon les paramètres configurés."
        actions={
          <div className="flex gap-2">
            <button
              onClick={runCreditsNow}
              disabled={running}
              className="btn-primary flex items-center gap-1.5"
            >
              {running ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              Lancer les versements dus
            </button>
            <Link to="/admin/vehicules" className="btn-secondary flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4" /> Gérer les produits
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2 text-slate-500">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium">Total distribué</span>
          </div>
          <p className="mt-2 text-2xl font-black text-green-700">{formatPrice(totalDistributed, CURRENCY)}</p>
          <p className="mt-0.5 text-xs text-slate-400">Depuis l&apos;activation des versements automatiques</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2 text-slate-500">
            <Coins className="h-4 w-4 text-night-600" />
            <span className="text-xs font-medium">Versements enregistrés</span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{credits.data?.length ?? 0}</p>
          <p className="mt-0.5 text-xs text-slate-400">Transactions journalières créditées</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2 text-slate-500">
            <SlidersHorizontal className="h-4 w-4 text-night-600" />
            <span className="text-xs font-medium">Produits à revenu actif</span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{revenueProducts.length}</p>
          <p className="mt-0.5 text-xs text-slate-400">Avec pourcentage quotidien défini</p>
        </div>
      </div>

      <Alert tone="info">
        <strong>Fonctionnement automatisé :</strong> Les versements quotidiens se font automatiquement
        24h après chaque achat de produit, chaque jour à la même heure, jusqu&apos;à expiration de la durée
        du produit. Vous n&apos;avez plus besoin de saisir manuellement les recettes chaque jour. Vous pouvez
        simplement configurer le prix, la durée et le pourcentage directement dans la fiche de chaque produit.
      </Alert>

      {/* Tableau des produits configurés et simulations */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Rendements configurés sur les produits</h2>
          <Link to="/admin/vehicules/nouveau" className="text-xs font-semibold text-night-800 hover:underline">
            + Ajouter un produit
          </Link>
        </div>

        {vehicles.loading ? (
          <LoadingState />
        ) : vehicles.error ? (
          <ErrorState message={vehicles.error} onRetry={vehicles.reload} />
        ) : revenueProducts.length === 0 ? (
          <EmptyState
            title="Aucun produit avec revenu quotidien"
            description="Configurez le pourcentage de revenu et la durée sur un véhicule pour activer les versements automatiques."
            action={<Link to="/admin/vehicules" className="btn-primary">Voir les véhicules</Link>}
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Prix d&apos;achat</th>
                  <th>Durée</th>
                  <th>% / jour</th>
                  <th>Revenu / jour</th>
                  <th>Cumul brut</th>
                  <th>Après 5 %</th>
                  <th>Gain net</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revenueProducts.map((v) => {
                  const y = productYield(v.price, v.duration_days, v.daily_revenue_percent, 5);
                  return (
                    <tr key={v.id}>
                      <td className="font-semibold text-slate-900">
                        {v.brand} {v.model}
                      </td>
                      <td className="whitespace-nowrap font-medium">{formatPrice(v.price, v.currency)}</td>
                      <td className="whitespace-nowrap">{v.duration_days ?? 0} jours</td>
                      <td className="whitespace-nowrap font-bold text-green-700">{v.daily_revenue_percent} %</td>
                      <td className="whitespace-nowrap font-bold text-green-700">
                        {y ? formatPrice(y.daily, v.currency) : '—'}
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{y ? formatPrice(y.gross, v.currency) : '—'}</td>
                      <td className="whitespace-nowrap text-slate-600">{y ? formatPrice(y.afterFees, v.currency) : '—'}</td>
                      <td className="whitespace-nowrap font-bold text-green-700">
                        {y ? `+${formatPrice(y.net, v.currency)}` : '—'}
                      </td>
                      <td className="text-right">
                        <Link to={`/admin/vehicules/${v.id}`} className="btn-secondary btn-sm">
                          Modifier
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historique des versements automatiques */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Historique des versements automatiques</h2>
          <button
            onClick={() => credits.reload()}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualiser
          </button>
        </div>

        {credits.loading ? (
          <LoadingState />
        ) : credits.error ? (
          <ErrorState message={credits.error} onRetry={credits.reload} />
        ) : !credits.data?.length ? (
          <EmptyState
            title="Aucun versement automatique encore effectué"
            description="Les versements apparaîtront ici dès que les 24h suivant le premier achat d'un produit seront atteintes."
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date & Heure</th>
                  <th>Produit</th>
                  <th>Bénéficiaire</th>
                  <th>Période</th>
                  <th className="text-right">Montant crédité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {credits.data.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-xs text-slate-600">{formatDate(c.due_at)}</td>
                    <td className="font-semibold text-slate-900">
                      {c.vehicle ? `${c.vehicle.brand} ${c.vehicle.model}` : 'Produit'}
                    </td>
                    <td className="text-xs text-slate-600">
                      {c.profile?.full_name || c.profile?.phone || c.user_id.slice(0, 8)}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        Jour {c.period_index}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right font-bold text-green-700">
                      +{formatPrice(c.amount, CURRENCY)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
