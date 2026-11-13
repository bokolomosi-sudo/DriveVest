import { useSearchParams } from 'react-router-dom';
import { Car, Gem, LayoutGrid } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { VehicleCard } from '../components/vehicles/VehicleCard';
import { useAsync } from '../hooks/useAsync';
import { COLLECTION_LABELS } from '../lib/labels';
import { listPublishedVehicles } from '../services/vehicles';
import type { ProductCollection } from '../types';

const TABS: { key: ProductCollection; icon: typeof Car }[] = [
  { key: 'standard', icon: LayoutGrid },
  { key: 'prestige', icon: Gem },
];

/** Produits publiés par l'administration, répartis en deux espaces : Produits et Prestige. */
export default function ProductsPage() {
  const [params, setParams] = useSearchParams();
  // ?espace=prestige garde l'onglet dans le lien (partage, retour arrière)
  const collection: ProductCollection = params.get('espace') === 'prestige' ? 'prestige' : 'standard';
  const { data, loading, error, reload } = useAsync(
    () => listPublishedVehicles({ sort: 'price_asc', pageSize: 200, collection }),
    [collection],
  );

  const select = (key: ProductCollection) => {
    const next = new URLSearchParams(params);
    if (key === 'standard') next.delete('espace');
    else next.set('espace', key);
    setParams(next, { replace: true });
  };

  const isPrestige = collection === 'prestige';

  return (
    <div className="container-page py-6 lg:py-10">
      <PageMeta title={isPrestige ? 'Produits Prestige' : 'Produits'} />
      <h1 className="mb-4 text-center text-2xl font-extrabold tracking-tight sm:text-3xl">Produits</h1>

      <div role="tablist" aria-label="Espaces produits" className="mx-auto mb-6 grid max-w-md grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
        {TABS.map(({ key, icon: Icon }) => {
          const active = key === collection;
          const prestige = key === 'prestige';
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(key)}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                active
                  ? prestige
                    ? 'bg-gradient-to-r from-amber-400 to-amber-600 text-white shadow'
                    : 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {COLLECTION_LABELS[key]}
            </button>
          );
        })}
      </div>

      {isPrestige && (
        <p className="mx-auto mb-6 max-w-xl text-center text-sm text-slate-500">
          Nos produits précieux : une sélection haut de gamme proposée par Drivest.
        </p>
      )}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.items.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      ) : (
        <EmptyState
          icon={isPrestige ? <Gem className="h-10 w-10" /> : <Car className="h-10 w-10" />}
          title={isPrestige ? 'Aucun produit Prestige pour le moment' : 'Aucun produit disponible pour le moment'}
        />
      )}
    </div>
  );
}
