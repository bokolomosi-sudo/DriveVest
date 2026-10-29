import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Spinner } from '../ui/Feedback';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { formatDate, formatPrice } from '../../lib/format';
import { vehicleImageUrl } from '../../services/vehicles';
import { buyVehicleWithWallet } from '../../services/wallet';
import type { Vehicle } from '../../types';
import { VehicleImagePlaceholder } from './VehicleImagePlaceholder';

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

/** Date de fin si le produit est acheté aujourd'hui. */
function expirationDate(durationDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + durationDays);
  return formatDate(d.toISOString());
}

/** Carte produit : nom, durée, date d'expiration, photo, prix, détails et achat immédiat. */
export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { notify } = useToast();
  const cover = vehicle.images?.[0];
  const title = `${vehicle.brand} ${vehicle.model}`.trim();
  const available = vehicle.availability === 'available' && vehicle.price !== null;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Une même clé tant que l'achat n'a pas abouti : un double appui ne paie qu'une fois
  const key = useRef(crypto.randomUUID());

  const buy = async () => {
    if (busy || !available) return;
    setBusy(true);
    setResult(null);
    try {
      await buyVehicleWithWallet(vehicle.id, key.current);
      key.current = crypto.randomUUID();
      setResult({ ok: true, message: 'Achat réussi ! Retrouvez ce produit dans « Mes produits ».' });
      notify('success', `${title} acheté avec succès.`);
    } catch (err) {
      key.current = crypto.randomUUID();
      const message = toErrorMessage(err);
      setResult({
        ok: false,
        message: /insuffisant/i.test(message) ? 'Votre solde est insuffisant pour acheter ce produit.' : message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl bg-gradient-to-br from-night-800 to-night-950 p-1.5 shadow-lg">
      <p className="py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-accent-300">Produit</p>
      <div className="rounded-[1.25rem] bg-white p-3 min-[360px]:p-4">
        <h3 className="break-words text-lg font-extrabold tracking-tight text-slate-900 min-[360px]:text-xl">{title}</h3>
        <div className="mt-3 flex gap-3">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            {vehicle.duration_days && <InfoPill label="Durée" value={`${vehicle.duration_days} jours`} />}
            {vehicle.duration_days && <InfoPill label="Expire le" value={expirationDate(vehicle.duration_days)} />}
            {Number(vehicle.daily_revenue_cap) > 0 && <InfoPill label="Revenu / jour" value={`jusqu'à ${formatPrice(Number(vehicle.daily_revenue_cap), vehicle.currency)}`} />}
          </div>
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 shadow-inner min-[360px]:h-28 min-[360px]:w-28 sm:h-32 sm:w-32">
            {cover ? (
              <img src={vehicleImageUrl(cover, 400)} alt={cover.alt ?? title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <VehicleImagePlaceholder label="" />
            )}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Prix</p>
            <p className="break-words text-lg font-extrabold text-red-500 min-[360px]:text-xl sm:text-2xl">{formatPrice(vehicle.price, vehicle.currency)}</p>
          </div>
        </div>

        {Number(vehicle.daily_revenue_cap) > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-slate-500">Revenu selon les recettes réelles du produit, plafonné par jour. Non garanti.</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to={`/vehicules/${vehicle.id}`} className="btn-secondary rounded-xl py-3">
            Plus de détails
          </Link>
          <button type="button" onClick={buy} disabled={busy || !available} className="btn-primary rounded-xl py-3 text-base shadow-md">
            {busy && <Spinner className="h-4 w-4" />} {available ? 'Acheter' : 'Indisponible'}
          </button>
        </div>

        {result && (
          <p
            role={result.ok ? 'status' : 'alert'}
            className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
          >
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              {result.message}
              {result.ok && <> <Link to="/compte/produits" className="font-semibold underline">Voir</Link></>}
              {!result.ok && /solde est insuffisant/.test(result.message) && (
                <> <Link to="/compte/depot" className="font-semibold underline">Faire un dépôt</Link></>
              )}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}
