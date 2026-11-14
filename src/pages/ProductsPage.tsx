import { Car } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { VehicleCard } from '../components/vehicles/VehicleCard';
import { useAsync } from '../hooks/useAsync';
import { listPublishedVehicles } from '../services/vehicles';

/** Tous les produits publiés par l'administration (standard et Prestige), affichés directement. */
export default function ProductsPage() {
  const { data, loading, error, reload } = useAsync(
    () => listPublishedVehicles({ sort: 'price_asc', pageSize: 200 }),
    [],
  );

  return (
    <div className="container-page py-6 lg:py-10">
      <PageMeta title="Produits" />
      <h1 className="mb-6 text-center text-2xl font-extrabold tracking-tight sm:text-3xl">Produits</h1>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.items.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      ) : (
        <EmptyState icon={<Car className="h-10 w-10" />} title="Aucun produit disponible pour le moment" />
      )}
    </div>
  );
}
