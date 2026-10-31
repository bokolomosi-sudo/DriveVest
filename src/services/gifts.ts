import { db } from '../lib/supabase';

export interface AdminGift {
  id: string;
  code: string;
  title: string;
  message: string | null;
  amount: number;
  max_winners: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  winners: number;
}

export interface GiftWinner {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  amount: number;
  created_at: string;
}

export interface MyGift {
  title: string;
  message: string | null;
  amount: number;
  created_at: string;
}

export async function adminListGifts(): Promise<AdminGift[]> {
  const { data, error } = await db().rpc('admin_list_gifts');
  if (error) throw error;
  return ((data ?? []) as AdminGift[]).map((g) => ({ ...g, amount: Number(g.amount) }));
}

export async function adminCreateGift(input: {
  title: string;
  message: string;
  amount: number;
  maxWinners: number;
  expiresAt: string | null;
}): Promise<AdminGift> {
  const { data, error } = await db().rpc('admin_create_gift', {
    p_title: input.title,
    p_message: input.message || null,
    p_amount: input.amount,
    p_max_winners: input.maxWinners,
    p_expires_at: input.expiresAt,
  });
  if (error) throw error;
  return { ...(data as AdminGift), amount: Number((data as AdminGift).amount), winners: 0 };
}

export async function adminSetGiftActive(id: string, active: boolean): Promise<void> {
  const { error } = await db().rpc('admin_set_gift_active', { p_gift_id: id, p_active: active });
  if (error) throw error;
}

export async function adminGiftWinners(id: string): Promise<GiftWinner[]> {
  const { data, error } = await db().rpc('admin_gift_winners', { p_gift_id: id });
  if (error) throw error;
  return ((data ?? []) as GiftWinner[]).map((w) => ({ ...w, amount: Number(w.amount) }));
}

export async function claimGift(code: string): Promise<void> {
  const { error } = await db().rpc('claim_gift', { p_code: code });
  if (error) throw error;
}

export async function listMyGifts(): Promise<MyGift[]> {
  const { data, error } = await db().rpc('my_gift_claims');
  if (error) throw error;
  return ((data ?? []) as MyGift[]).map((g) => ({ ...g, amount: Number(g.amount) }));
}

/** Message prêt à coller dans le groupe après la réunion. */
export function giftShareText(gift: Pick<AdminGift, 'code' | 'title' | 'amount' | 'max_winners' | 'expires_at'>, formatAmount: (n: number) => string): string {
  const lines = [
    `🎁 ${gift.title}`,
    `Code : ${gift.code}`,
    `${formatAmount(gift.amount)} pour les ${gift.max_winners} premiers membres ayant déjà acheté un produit.`,
    'Ouvrez Drivest > Bonus surprise et entrez le code.',
  ];
  if (gift.expires_at) {
    lines.push(`Valable jusqu'au ${new Date(gift.expires_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.`);
  }
  return lines.join('\n');
}
