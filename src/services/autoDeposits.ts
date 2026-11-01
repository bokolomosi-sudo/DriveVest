import { db } from '../lib/supabase';

export interface AutoDepositSettings {
  enabled: boolean;
  webhook_token: string;
  allowed_senders: string[];
}

export type IncomingSmsStatus = 'unmatched' | 'matched' | 'amount_mismatch' | 'ignored_sender';

export interface IncomingSms {
  id: string;
  sender: string;
  body: string;
  sim: string | null;
  received_at: string;
  status: IncomingSmsStatus;
  matched_transaction_id: string | null;
  note: string | null;
  transaction?: { amount: number; user_id: string; profile?: { full_name: string | null; phone: string | null } | null } | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export function smsWebhookUrl(token: string): string {
  return `${SUPABASE_URL ?? ''}/functions/v1/sms-webhook?token=${token}`;
}

export async function getAutoDepositSettings(): Promise<AutoDepositSettings | null> {
  const { data, error } = await db().from('auto_deposit_settings').select('enabled, webhook_token, allowed_senders').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as AutoDepositSettings | null;
}

export async function updateAutoDepositSettings(input: Pick<AutoDepositSettings, 'enabled' | 'allowed_senders'>): Promise<void> {
  const { error } = await db().from('auto_deposit_settings').update(input).eq('id', 1);
  if (error) throw error;
}

export async function regenerateSmsToken(): Promise<string> {
  const { data, error } = await db().rpc('admin_regenerate_sms_token');
  if (error) throw error;
  return data as string;
}

export async function listIncomingSms(): Promise<IncomingSms[]> {
  const { data, error } = await db()
    .from('incoming_sms')
    .select('*, transaction:transactions!incoming_sms_matched_transaction_id_fkey(amount, user_id, profile:profiles(full_name, phone))')
    .order('received_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as IncomingSms[];
}
