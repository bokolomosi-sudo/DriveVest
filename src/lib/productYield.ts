/** Revenu quotidien = pourcentage du prix, arrondi au centime. */
export function dailyRevenueAmount(price: number | null | undefined, percent: number | null | undefined): number {
  if (!(Number(price) > 0) || !(Number(percent) > 0)) return 0;
  return Math.round((Number(price) * Number(percent)) / 100 * 100) / 100;
}

export function vehicleDailyAmount(v: {
  price?: number | null;
  daily_revenue_percent?: number | null;
  daily_revenue_cap?: number | null;
}): number {
  const fromPercent = dailyRevenueAmount(v.price, v.daily_revenue_percent);
  if (fromPercent > 0) return fromPercent;
  return Number(v.daily_revenue_cap) > 0 ? Number(v.daily_revenue_cap) : 0;
}

export interface ProductYield {
  daily: number;
  duration: number;
  gross: number;
  afterFees: number;
  net: number;
  feePercent: number;
}

/** Projection affichée sur la fiche : cumul, frais de retrait, gain net. */
export function productYield(
  price: number | null | undefined,
  durationDays: number | null | undefined,
  percent: number | null | undefined,
  feePercent = 5,
  dailyOverride?: number | null,
): ProductYield | null {
  const duration = Number(durationDays) || 0;
  const daily = dailyOverride && dailyOverride > 0 ? dailyOverride : dailyRevenueAmount(price, percent);
  if (!(daily > 0) || duration < 1 || !(Number(price) > 0)) return null;
  const gross = Math.round(daily * duration * 100) / 100;
  const fee = Math.min(100, Math.max(0, Number(feePercent) || 0));
  const afterFees = Math.round(gross * (100 - fee) / 100 * 100) / 100;
  const net = Math.round((afterFees - Number(price)) * 100) / 100;
  return { daily, duration, gross, afterFees, net, feePercent: fee };
}
