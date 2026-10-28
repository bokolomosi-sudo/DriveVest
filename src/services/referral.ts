import { db } from '../lib/supabase';
import type { ReferralCommission, ReferralMember } from '../types';

// --- Parrainage ------------------------------------------------------------

export function referralLink(code: string): string {
  return `${window.location.origin}/inscription?ref=${encodeURIComponent(code)}`;
}

export async function listMyReferrals(): Promise<ReferralMember[]> {
  const { data, error } = await db().rpc('my_referrals');
  if (error) throw error;
  return ((data ?? []) as ReferralMember[]).map((m) => ({ ...m, commissions: Number(m.commissions) }));
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
