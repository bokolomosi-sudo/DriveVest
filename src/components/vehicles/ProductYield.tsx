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
    0,
    vehicleDailyAmount(vehicle),
  );
  if (!yieldInfo) return null;
  const currency = vehicle.currency;

  return (
    <div className={compact ? 'space-y-1 text-xs text-slate-600' : 'mt-3 space-y-1 rounded-xl bg-green-50 p-3 text-sm text-green-900'}>
      <p className={compact ? 'font-semibold text-slate-800' : 'font-semibold'}>
        Revenu indicatif : {formatPrice(yieldInfo.daily, currency)}/jour
      </p>
      <p className={compact ? 'font-semibold text-green-700' : 'font-semibold'}>
        Revenus cumulés : {formatPrice(yieldInfo.gross, currency)}
      </p>
      {!compact && (
        <p className="mt-2 text-xs text-green-800">
          Versé automatiquement chaque jour à l&apos;heure de votre achat, pendant {yieldInfo.duration} jours. Ensuite, plus rien n&apos;est versé.
        </p>
      )}
    </div>
  );
}
