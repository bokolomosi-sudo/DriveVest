import { db } from '../lib/supabase';
import type { AdminUserOverview, AppRole, AuditLog, DashboardStats, Profile } from '../types';

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await db().rpc('admin_dashboard_stats');
  if (error) throw error;
  return data as DashboardStats;
}

export type AdminUser = Profile & { roles: AppRole[]; balance?: number };

export async function adminListUsers(search = ''): Promise<AdminUser[]> {
  let query = db().from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
  // Un numéro saisi au format local (097…) est cherché au format enregistré (24397…)
  const raw = search.replace(/[%,()]/g, '').trim();
  const s = /^0\d{3,}$/.test(raw) ? `243${raw.slice(1)}` : raw;
  if (s) query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
  const { data, error } = await query;
  if (error) throw error;
  const profiles = (data ?? []) as Profile[];
  if (profiles.length === 0) return [];

  const roles = await db()
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', profiles.map((p) => p.id));
  if (roles.error) throw roles.error;
  const byUser = new Map<string, AppRole[]>();
  for (const r of (roles.data ?? []) as { user_id: string; role: AppRole }[]) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]);
  }
  const balances = await db().rpc('admin_users_balances', { p_user_ids: profiles.map((p) => p.id) });
  if (balances.error) throw balances.error;
  const balanceOf = new Map(((balances.data ?? []) as { user_id: string; balance: number }[]).map((b) => [b.user_id, Number(b.balance)]));
  return profiles.map((p) => ({ ...p, roles: byUser.get(p.id) ?? [], balance: balanceOf.get(p.id) ?? 0 }));
}

export async function adminGetUser(userId: string): Promise<AdminUser | null> {
  const { data, error } = await db().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const roles = await db().from('user_roles').select('role').eq('user_id', userId);
  if (roles.error) throw roles.error;
  return { ...(data as Profile), roles: (roles.data ?? []).map((r: { role: AppRole }) => r.role) };
}

export async function adminUserOverview(userId: string): Promise<AdminUserOverview> {
  const { data, error } = await db().rpc('admin_user_overview', { p_user_id: userId });
  if (error) throw error;
  const o = data as AdminUserOverview;
  return {
    ...o,
    balance: Number(o.balance),
    total_deposits: Number(o.total_deposits),
    total_withdrawals: Number(o.total_withdrawals),
    total_commissions: Number(o.total_commissions),
    total_rewards: Number(o.total_rewards),
  };
}

/** Mot de passe oublié : l'admin définit un mot de passe provisoire (sessions fermées). */
export async function adminResetUserPassword(userId: string, password: string): Promise<void> {
  const { error } = await db().rpc('admin_reset_user_password', { p_user_id: userId, p_new_password: password });
  if (error) throw error;
}

/** Supprime le réseau, le numéro et le mot de passe de retrait : le membre les configure de nouveau. */
export async function adminResetWithdrawalAccount(userId: string, reason: string): Promise<void> {
  const { error } = await db().rpc('admin_reset_withdrawal_account', { p_user_id: userId, p_reason: reason });
  if (error) throw error;
}

export async function adminSetUserBlocked(userId: string, blocked: boolean, reason: string): Promise<void> {
  const { error } = await db().rpc('admin_set_user_blocked', {
    p_user_id: userId,
    p_blocked: blocked,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function adminListAuditLogs(entityType: string): Promise<AuditLog[]> {
  let query = db().from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
  if (entityType !== 'all') query = query.eq('entity_type', entityType);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}
