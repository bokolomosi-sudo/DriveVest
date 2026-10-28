import { db } from '../lib/supabase';
import type {
  Announcement,
  PlatformSettings,
  PublicationStatus,
  SupportRequest,
  SupportStatus,
  SupportTopic,
} from '../types';

// --- Paramètres de la plateforme -------------------------------------------

export async function getSettings(): Promise<PlatformSettings | null> {
  const { data, error } = await db().from('platform_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as PlatformSettings | null;
}

export type SettingsInput = Partial<Omit<PlatformSettings, 'id' | 'updated_at'>>;

export async function adminUpdateSettings(adminId: string, input: SettingsInput): Promise<void> {
  const { error } = await db()
    .from('platform_settings')
    .update({ ...input, updated_by: adminId })
    .eq('id', 1);
  if (error) throw error;
}

// --- Annonces --------------------------------------------------------------

export async function listPublishedAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await db()
    .from('announcements')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function adminListAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await db().from('announcements').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function adminSaveAnnouncement(
  id: string | null,
  input: { title: string; body: string; status: PublicationStatus },
): Promise<void> {
  const { error } = id
    ? await db().from('announcements').update(input).eq('id', id)
    : await db().from('announcements').insert(input);
  if (error) throw error;
}

// --- Service client --------------------------------------------------------

export async function listMySupportRequests(userId: string): Promise<SupportRequest[]> {
  const { data, error } = await db()
    .from('support_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportRequest[];
}

export async function createSupportRequest(input: {
  userId: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  orderId?: string | null;
}): Promise<void> {
  const { error } = await db().from('support_requests').insert({
    user_id: input.userId,
    topic: input.topic,
    subject: input.subject.trim(),
    message: input.message.trim(),
    order_id: input.orderId || null,
  });
  if (error) throw error;
}

export async function adminListSupportRequests(status: SupportStatus | 'all'): Promise<SupportRequest[]> {
  let query = db()
    .from('support_requests')
    .select('*, customer:profiles(full_name, email, phone)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SupportRequest[];
}

export async function adminRespondSupport(id: string, response: string, status: SupportStatus): Promise<void> {
  const { error } = await db().rpc('admin_respond_support', {
    p_request_id: id,
    p_response: response,
    p_status: status,
  });
  if (error) throw error;
}
