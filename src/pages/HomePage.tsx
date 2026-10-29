import { Link } from 'react-router-dom';
import { ArrowRight, Car } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { VehicleCard } from '../components/vehicles/VehicleCard';
import { useAsync } from '../hooks/useAsync';
import { listPublishedVehicles } from '../services/vehicles';

export default function HomePage() {
  // Accueil : les deux derniers produits publiés, les autres sont sur la page Produits
  const products = useAsync(() => listPublishedVehicles({ sort: 'recent', pageSize: 2 }), []);

  return (
    <>
      <PageMeta title="Drivest" />

      <section className="relative overflow-hidden bg-night-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(20,184,151,0.18),transparent_55%)]" />
        <div className="container-page relative grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-2">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Trouvez votre prochain véhicule, <span className="text-accent-400">en toute transparence.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-night-200 sm:text-lg">
              Choisissez un véhicule et achetez-le directement avec le solde de votre portefeuille.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
            {/* Photo Unsplash (licence gratuite, usage commercial autorisé) */}
            <img
              src="https://images.unsplash.com/photo-1549632891-a0bea6d0355b?w=1400&q=80&auto=format&fit=crop"
              alt="Range Rover sur une route forestière"
              className="aspect-[16/9] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-950/60 via-transparent to-transparent" />
          </div>
        </div>
      </section>

      <section className="container-page py-8" aria-labelledby="products-title">
        <h2 id="products-title" className="mb-5 text-center text-2xl font-extrabold tracking-tight">Nouveaux produits</h2>
        {products.loading ? (
          <LoadingState />
        ) : products.error ? (
          <ErrorState message={products.error} onRetry={products.reload} />
        ) : products.data && products.data.items.length > 0 ? (
          <>
            <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
              {products.data.items.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
            </div>
            {products.data.total > products.data.items.length && (
              <p className="mt-6 text-center text-sm text-slate-500">Pour découvrir d'autres produits, visitez la page Produits.</p>
            )}
            <div className="mt-3 flex justify-center">
              <Link to="/produits" className="btn-primary h-12 rounded-2xl px-6 text-base shadow-md">
                Voir tous les produits <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <EmptyState icon={<Car className="h-10 w-10" />} title="Aucun véhicule disponible pour le moment" />
        )}
      </section>
    </>
  );
}
