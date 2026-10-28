import { authPassword, toE164, validatePassword } from '../lib/phoneAuth';
import { db } from '../lib/supabase';
import type { AppNotification, AppRole, Profile } from '../types';

// --- Authentification (téléphone + mot de passe, voir lib/phoneAuth) --------

export async function signIn(phone: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({
    phone: toE164(phone),
    password: authPassword(password),
  });
  if (error) {
    if (/Invalid login credentials/i.test(error.message)) {
      throw new Error('Numéro de téléphone ou mot de passe incorrect.');
    }
    throw error;
  }
}

/** Crée le compte et ouvre la session immédiatement. */
export async function signUp(params: { phone: string; password: string; referralCode?: string }): Promise<void> {
  const { data, error } = await db().auth.signUp({
    phone: toE164(params.phone),
    password: authPassword(params.password),
    options: {
      data: {
        phone: params.phone,
        referral_code: params.referralCode?.trim().toUpperCase() || undefined,
      },
    },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      throw new Error('Un compte existe déjà avec ce numéro de téléphone.');
    }
    if (/signups? (are|is) disabled|signup.*not allowed/i.test(error.message)) {
      throw new Error("Les inscriptions par téléphone sont désactivées dans Supabase : activez le fournisseur Phone.");
    }
    if (/phone.*(disabled|not enabled)|unsupported phone provider/i.test(error.message)) {
      throw new Error("La connexion par téléphone n'est pas activée dans Supabase (fournisseur Phone).");
    }
    if (/sending.*(sms|otp)|sms provider|confirmation/i.test(error.message)) {
      throw new Error("Inscription impossible : désactivez « Enable phone confirmations » dans Supabase.");
    }
    throw error;
  }
  if (!data.session) {
    throw new Error("Compte créé mais session non ouverte : désactivez « Enable phone confirmations » dans Supabase, puis connectez-vous.");
  }
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await db().auth.updateUser({ password: authPassword(password) });
  if (error) throw error;
}

export { validatePassword };

// --- Profil ----------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getMyRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await db().from('user_roles').select('role').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

export type ProfileInput = Pick<Profile, 'full_name' | 'phone' | 'city' | 'country'>;

export async function updateMyProfile(userId: string, input: ProfileInput): Promise<void> {
  const { error } = await db().from('profiles').update(input).eq('id', userId);
  if (error) throw error;
}

/** Informations du membre : nom, province (liste de l'admin) et ville. */
export async function completeMyProfile(params: { fullName: string; province: string; city: string }): Promise<void> {
  const { error } = await db().rpc('complete_my_profile', {
    p_full_name: params.fullName,
    p_province: params.province,
    p_city: params.city,
  });
  if (error) throw error;
}

export function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(profile?.full_name?.trim() && profile.province && profile.city?.trim());
}

// --- Notifications ---------------------------------------------------------

export async function listMyNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await db()
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { count, error } = await db()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  let query = db().from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (ids) query = query.in('id', ids);
  const { error } = await query;
  if (error) throw error;
}
