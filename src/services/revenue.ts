import { db } from '../lib/supabase';
import type { MyProductRevenue, ProductRevenueDistribution } from '../types';

export interface RevenuePreview {
  units: number;
  holders: number;
  daily_cap: number | null;
  already_declared: boolean;
}

/** Unités actives et plafond d'un produit à une date, avant de déclarer son revenu. */
export async function adminRevenuePreview(vehicleId: string, date: string): Promise<RevenuePreview> {
  const { data, error } = await db().rpc('admin_product_revenue_preview', { p_vehicle_id: vehicleId, p_date: date });
  if (error) throw error;
  const p = data as RevenuePreview;
  return { ...p, daily_cap: p.daily_cap === null ? null : Number(p.daily_cap) };
}

/** Déclare le revenu réel d'un produit pour un jour et le partage entre les acheteurs (plafonné). */
export async function adminDistributeRevenue(params: { vehicleId: string; date: string; amount: number; note: string }): Promise<ProductRevenueDistribution> {
  const { data, error } = await db().rpc('admin_distribute_product_revenue', {
    p_vehicle_id: params.vehicleId,
    p_date: params.date,
    p_amount: params.amount,
    p_note: params.note || null,
  });
  if (error) throw error;
  return data as ProductRevenueDistribution;
}

export async function adminListDistributions(): Promise<ProductRevenueDistribution[]> {
  const { data, error } = await db()
    .from('product_revenue_distributions')
    .select('*, vehicle:vehicles(brand, model)')
    .order('revenue_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as ProductRevenueDistribution[]).map((d) => ({
    ...d,
    declared_amount: Number(d.declared_amount),
    per_unit: Number(d.per_unit),
    paid_total: Number(d.paid_total),
    retained: Number(d.retained),
    daily_cap: Number(d.daily_cap),
  }));
}

export async function listMyProductRevenues(): Promise<MyProductRevenue[]> {
  const { data, error } = await db().rpc('my_product_revenues');
  if (error) throw error;
  return ((data ?? []) as MyProductRevenue[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Date du jour à Kinshasa, au format AAAA-MM-JJ. */
export function todayInKinshasa(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kinshasa' }).format(new Date());
}
