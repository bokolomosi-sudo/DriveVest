import { Link, useNavigate } from 'react-router-dom';
import { formatPrice } from '../../lib/format';
import { vehicleImageUrl } from '../../services/vehicles';
import type { Vehicle } from '../../types';
import { VehicleImagePlaceholder } from './VehicleImagePlaceholder';

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

/** Carte produit : bandeau de catégorie, nom, informations clés, photo, prix et bouton d'achat. */
export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const navigate = useNavigate();
  const cover = vehicle.images?.[0];
  const title = `${vehicle.brand} ${vehicle.model}`.trim();
  const available = vehicle.availability === 'available' && vehicle.price !== null;

  return (
    <article className="overflow-hidden rounded-3xl bg-gradient-to-br from-night-800 to-night-950 p-1.5 shadow-lg">
      <p className="py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-accent-300">
        Produit
      </p>
      <div className="rounded-[1.25rem] bg-white p-3 min-[360px]:p-4">
        <Link to={`/vehicules/${vehicle.id}`} className="block">
          <h3 className="break-words text-lg font-extrabold tracking-tight text-slate-900 min-[360px]:text-xl">{title}</h3>
          <div className="mt-3 flex gap-3">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              {vehicle.duration_days && <InfoPill label="Durée" value={`${vehicle.duration_days} jours`} />}
            </div>
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-inner min-[360px]:h-28 min-[360px]:w-28 sm:h-32 sm:w-32">
              {cover ? (
                <img src={vehicleImageUrl(cover, 400)} alt={cover.alt ?? title} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <VehicleImagePlaceholder label="" />
              )}
            </div>
          </div>
        </Link>
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Prix</p>
            <p className="break-words text-lg font-extrabold text-red-500 min-[360px]:text-xl sm:text-2xl">{formatPrice(vehicle.price, vehicle.currency)}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/vehicules/${vehicle.id}${available ? '?acheter=1' : ''}`)}
            className="btn-primary shrink-0 rounded-xl px-4 py-3 text-base shadow-md min-[360px]:px-6"
          >
            {available ? 'Acheter' : 'Voir'}
          </button>
        </div>
      </div>
    </article>
  );
}
