import { formatPrice } from '../../lib/format';
import { productYield, vehicleDailyAmount } from '../../lib/productYield';
import type { Vehicle } from '../../types';

export function ProductYieldBlock({
  vehicle,
  compact = false,
}: {
  vehicle: Pick<Vehicle, 'price' | 'currency' | 'duration_days' | 'daily_revenue_percent' | 'daily_revenue_cap'>;
  compact?: boolean;
}) {
  const yieldInfo = productYield(
    vehicle.price,
    vehicle.duration_days,
    vehicle.daily_revenue_percent,
    0, // Gain = revenus cumulés − prix, sans les frais de retrait (non affichés au client)
    vehicleDailyAmount(vehicle),
  );
  if (!yieldInfo) return null;
  const currency = vehicle.currency;

  return (
    <div className={compact ? 'text-sm text-slate-600' : 'mt-3 space-y-1 rounded-xl bg-green-50 p-3 text-sm text-green-900'}>
      {/* Sur la carte, le revenu par jour est déjà affiché dans les infos du produit */}
      {!compact && <p>Revenu / jour : {formatPrice(yieldInfo.daily, currency)}</p>}
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span>Gain total</span>
        <strong className="text-lg font-extrabold text-green-700">{formatPrice(yieldInfo.net, currency)}</strong>
      </p>
      {!compact && (
        <p className="mt-2 text-xs text-green-800">
          Versé automatiquement chaque jour à l&apos;heure de votre achat, pendant {yieldInfo.duration} jours. Ensuite, plus rien n&apos;est versé.
        </p>
      )}
    </div>
  );
}
