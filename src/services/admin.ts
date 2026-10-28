import { db } from '../lib/supabase';
import type { AppRole, AuditLog, DashboardStats, Profile } from '../types';

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await db().rpc('admin_dashboard_stats');
  if (error) throw error;
  return data as DashboardStats;
}

export type AdminUser = Profile & { roles: AppRole[] };

export async function adminListUsers(search = ''): Promise<AdminUser[]> {
  let query = db().from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
  const s = search.replace(/[%,()]/g, '').trim();
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
  return profiles.map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
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
