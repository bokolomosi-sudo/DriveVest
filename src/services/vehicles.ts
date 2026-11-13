import { db, supabase } from '../lib/supabase';
import type {
  FuelType,
  ProductCollection,
  PublicationStatus,
  TransmissionType,
  Vehicle,
  VehicleCondition,
  VehicleImage,
} from '../types';

export const VEHICLE_IMAGES_BUCKET = 'vehicle-images';
export const VEHICLE_SELECT =
  '*, category:vehicle_categories(id, name, slug), images:vehicle_images(id, vehicle_id, storage_path, external_url, alt, sort_order, created_at)';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** URL d'affichage : photo externe (Unsplash, redimensionnée) ou fichier Supabase Storage. */
export function vehicleImageUrl(image: Pick<VehicleImage, 'storage_path' | 'external_url'>, width = 1200): string {
  if (image.external_url) {
    const sep = image.external_url.includes('?') ? '&' : '?';
    return `${image.external_url}${sep}w=${width}&q=80&auto=format&fit=crop`;
  }
  if (!supabase || !image.storage_path) return '';
  return supabase.storage.from(VEHICLE_IMAGES_BUCKET).getPublicUrl(image.storage_path).data.publicUrl;
}

function normalize(v: Vehicle): Vehicle {
  return { ...v, images: [...(v.images ?? [])].sort((a, b) => a.sort_order - b.sort_order) };
}

/** Échappe les caractères qui ont un sens dans les filtres PostgREST. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()*\\:."']/g, ' ').trim().slice(0, 60);
}

export type VehicleSort = 'recent' | 'price_asc' | 'price_desc' | 'year_desc';

export interface VehicleFilters {
  search?: string;
  categoryId?: string;
  collection?: ProductCollection;
  condition?: VehicleCondition;
  fuel?: FuelType;
  transmission?: TransmissionType;
  maxPrice?: number;
  sort?: VehicleSort;
  page?: number;
  pageSize?: number;
}

export async function listPublishedVehicles(f: VehicleFilters = {}): Promise<{ items: Vehicle[]; total: number }> {
  const pageSize = f.pageSize ?? 12;
  const page = Math.max(1, f.page ?? 1);
  let query = db().from('vehicles').select(VEHICLE_SELECT, { count: 'exact' }).eq('status', 'published');

  if (f.categoryId) query = query.eq('category_id', f.categoryId);
  if (f.collection) query = query.eq('collection', f.collection);
  if (f.condition) query = query.eq('condition', f.condition);
  if (f.fuel) query = query.eq('fuel', f.fuel);
  if (f.transmission) query = query.eq('transmission', f.transmission);
  if (f.maxPrice !== undefined && f.maxPrice > 0) query = query.lte('price', f.maxPrice);
  if (f.search) {
    const s = sanitizeSearch(f.search);
    if (s) query = query.or(`brand.ilike.%${s}%,model.ilike.%${s}%`);
  }

  switch (f.sort) {
    case 'price_asc':
      query = query.order('price', { ascending: true, nullsFirst: false });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false, nullsFirst: false });
      break;
    case 'year_desc':
      query = query.order('year', { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order('published_at', { ascending: false, nullsFirst: false });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return { items: ((data ?? []) as Vehicle[]).map(normalize), total: count ?? 0 };
}

/** RLS : un visiteur ne voit que les véhicules publiés, l'administrateur voit tout. */
export async function getVehicle(id: string): Promise<Vehicle | null> {
  const { data, error } = await db().from('vehicles').select(VEHICLE_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalize(data as Vehicle) : null;
}

// --- Administration --------------------------------------------------------

export async function adminListVehicles(
  status: PublicationStatus | 'all',
  search = '',
  collection: ProductCollection | 'all' = 'all',
): Promise<Vehicle[]> {
  // Du moins cher au plus cher (les produits sans prix en dernier), comme côté client
  let query = db()
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .order('price', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);
  if (collection !== 'all') query = query.eq('collection', collection);
  const s = sanitizeSearch(search);
  if (s) query = query.or(`brand.ilike.%${s}%,model.ilike.%${s}%,reference.ilike.%${s}%`);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Vehicle[]).map(normalize);
}

export type VehicleInput = Pick<
  Vehicle,
  | 'category_id'
  | 'brand'
  | 'model'
  | 'year'
  | 'description'
  | 'price'
  | 'currency'
  | 'condition'
  | 'mileage_km'
  | 'fuel'
  | 'transmission'
  | 'engine'
  | 'color'
  | 'seats'
  | 'duration_days'
  | 'daily_revenue_percent'
  | 'daily_revenue_cap'
  | 'availability'
  | 'collection'
  | 'location'
  | 'delivery_terms'
  | 'seller_name'
  | 'seller_details'
  | 'status'
>;

export async function adminSaveVehicle(id: string | null, input: VehicleInput): Promise<Vehicle> {
  const query = id
    ? db().from('vehicles').update(input).eq('id', id)
    : db().from('vehicles').insert(input);
  const { data, error } = await query.select(VEHICLE_SELECT).single();
  if (error) throw error;
  return normalize(data as Vehicle);
}

export async function adminSetVehicleStatus(id: string, status: PublicationStatus): Promise<void> {
  const { error } = await db().from('vehicles').update({ status }).eq('id', id);
  if (error) throw error;
}

// Les photos sont réduites avant l'envoi : une photo de téléphone (3-5 Mo) devient ~150 Ko,
// ce qui accélère fortement l'affichage des produits sur les connexions mobiles.
const MAX_IMAGE_SIDE = 1280;
const IMAGE_QUALITY = 0.8;

async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY));
    // Navigateur sans WebP (il renvoie du PNG) ou résultat plus lourd : on garde l'original
    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function adminUploadVehicleImage(vehicleId: string, file: File, sortOrder: number, alt: string): Promise<VehicleImage> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Format accepté : JPEG, PNG ou WebP.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image trop lourde (5 Mo maximum).');
  const image = await compressImage(file);
  const ext = image.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${vehicleId}/${crypto.randomUUID()}.${ext}`;
  const upload = await db().storage.from(VEHICLE_IMAGES_BUCKET).upload(path, image, {
    contentType: image.type,
    cacheControl: '31536000',
  });
  if (upload.error) throw upload.error;
  const { data, error } = await db()
    .from('vehicle_images')
    .insert({ vehicle_id: vehicleId, storage_path: path, sort_order: sortOrder, alt: alt || null })
    .select()
    .single();
  if (error) {
    await db().storage.from(VEHICLE_IMAGES_BUCKET).remove([path]);
    throw error;
  }
  return data as VehicleImage;
}

/** Ajoute une photo hébergée ailleurs (ex. Unsplash, licence gratuite), sans téléversement. */
export async function adminAddVehicleImageUrl(vehicleId: string, url: string, sortOrder: number, alt: string): Promise<VehicleImage> {
  const clean = url.trim();
  if (!/^https:\/\/\S+$/.test(clean)) throw new Error("L'adresse de l'image doit commencer par https://");
  const { data, error } = await db()
    .from('vehicle_images')
    .insert({ vehicle_id: vehicleId, external_url: clean, sort_order: sortOrder, alt: alt || null })
    .select()
    .single();
  if (error) throw error;
  return data as VehicleImage;
}

export async function adminDeleteVehicleImage(image: VehicleImage): Promise<void> {
  const { error } = await db().from('vehicle_images').delete().eq('id', image.id);
  if (error) throw error;
  if (image.storage_path) await db().storage.from(VEHICLE_IMAGES_BUCKET).remove([image.storage_path]);
}

export async function adminDeleteVehicle(id: string): Promise<void> {
  const { error } = await db().from('vehicles').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error("Ce produit a déjà des commandes enregistrées. Vous pouvez le désactiver ou l'archiver au lieu de le supprimer.");
    }
    throw error;
  }
}

export async function adminSetImageOrder(images: VehicleImage[]): Promise<void> {
  for (const [index, img] of images.entries()) {
    const { error } = await db().from('vehicle_images').update({ sort_order: index }).eq('id', img.id);
    if (error) throw error;
  }
}
