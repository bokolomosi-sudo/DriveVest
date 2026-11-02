import { db } from '../lib/supabase';
import type { ReferralCommission, TeamMember, TeamReward, TeamRewardTier } from '../types';

// --- Parrainage ------------------------------------------------------------

// Adresse officielle : le lien copié pointe toujours vers le domaine, même depuis l'ancien lien Vercel ou l'application
const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://www.drivest.world').replace(/\/+$/, '');

export function referralLink(code: string): string {
  return `${SITE_URL}/inscription?ref=${encodeURIComponent(code)}`;
}

/** Équipe sur 3 niveaux, avec le statut d'achat de chaque invité. */
export async function listMyTeam(): Promise<TeamMember[]> {
  const { data, error } = await db().rpc('my_team');
  if (error) throw error;
  return ((data ?? []) as TeamMember[]).map((m) => ({
    ...m,
    invested_amount: Number(m.invested_amount),
    commissions: Number(m.commissions),
  }));
}

/** Paliers de récompense d'équipe et progression du membre. */
export async function listMyTeamRewards(): Promise<TeamReward[]> {
  const { data, error } = await db().rpc('my_team_rewards');
  if (error) throw error;
  return ((data ?? []) as TeamReward[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function adminListTeamRewardTiers(): Promise<TeamRewardTier[]> {
  const { data, error } = await db()
    .from('team_reward_tiers')
    .select('id, invited_count, amount, is_active')
    .eq('is_active', true)
    .order('invited_count');
  if (error) throw error;
  return ((data ?? []) as TeamRewardTier[]).map((t) => ({ ...t, amount: Number(t.amount) }));
}

/** Remplace les paliers ; les membres qui atteignent déjà un palier sont crédités aussitôt. */
export async function adminSetTeamRewardTiers(tiers: { invited_count: number; amount: number }[]): Promise<void> {
  const { error } = await db().rpc('admin_set_team_reward_tiers', { p_tiers: tiers });
  if (error) throw error;
}

export async function listMyCommissions(userId: string): Promise<ReferralCommission[]> {
  const { data, error } = await db()
    .from('referral_commissions')
    .select('*')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReferralCommission[];
}

export type AdminCommission = ReferralCommission & {
  referrer: { full_name: string | null; email: string | null } | null;
};

export async function adminListCommissions(): Promise<AdminCommission[]> {
  const { data, error } = await db()
    .from('referral_commissions')
    .select('*, referrer:profiles!referral_commissions_referrer_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as AdminCommission[];
}
