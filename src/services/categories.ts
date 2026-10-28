import { db } from '../lib/supabase';
import type { CategoryStatus, VehicleCategory } from '../types';

export async function listActiveCategories(): Promise<VehicleCategory[]> {
  const { data, error } = await db()
    .from('vehicle_categories')
    .select('*')
    .eq('status', 'active')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as VehicleCategory[];
}

export async function adminListCategories(): Promise<VehicleCategory[]> {
  const { data, error } = await db().from('vehicle_categories').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []) as VehicleCategory[];
}

export type CategoryInput = Pick<VehicleCategory, 'slug' | 'name' | 'description' | 'sort_order' | 'status'>;

export async function adminSaveCategory(id: string | null, input: CategoryInput): Promise<void> {
  const { error } = id
    ? await db().from('vehicle_categories').update(input).eq('id', id)
    : await db().from('vehicle_categories').insert(input);
  if (error) throw error;
}

export async function adminSetCategoryStatus(id: string, status: CategoryStatus): Promise<void> {
  const { error } = await db().from('vehicle_categories').update({ status }).eq('id', id);
  if (error) throw error;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
