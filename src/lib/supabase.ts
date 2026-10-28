import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const SUPABASE_NOT_CONFIGURED =
  "Supabase n'est pas configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.";

/** Client Supabase garanti ; lève une erreur explicite si la configuration manque. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED);
  return supabase;
}
