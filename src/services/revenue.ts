import { db } from '../lib/supabase';
import type { MyProductRevenue, ProductDailyCredit } from '../types';

/** Crédite les revenus dus (heure d'achat dépassée, produit non expiré). */
export async function creditDueProductRevenues(): Promise<number> {
  const { data, error } = await db().rpc('credit_due_product_revenues');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function adminListDailyCredits(): Promise<ProductDailyCredit[]> {
  const { data, error } = await db()
    .from('product_daily_credits')
    .select('*, vehicle:vehicles(brand, model), profile:profiles(full_name, phone)')
    .eq('skipped', false)
    .order('due_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as ProductDailyCredit[]).map((d) => ({ ...d, amount: Number(d.amount) }));
}

export async function listMyProductRevenues(): Promise<MyProductRevenue[]> {
  await creditDueProductRevenues().catch(() => undefined);
  const { data, error } = await db().rpc('my_product_revenues');
  if (error) throw error;
  return ((data ?? []) as MyProductRevenue[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Date du jour à Kinshasa, au format AAAA-MM-JJ. */
export function todayInKinshasa(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kinshasa' }).format(new Date());
}
