import { db } from '../lib/supabase';
import type {
  DepositChannel,
  WithdrawalNetwork, Order, PlatformSettings, Transaction, TransactionStatus, WalletBalance } from '../types';
import { PAYMENT_PROOFS_BUCKET } from './orders';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Dépose un fichier dans le dossier privé de l'utilisateur et renvoie son chemin. */
export async function uploadPrivateFile(bucket: string, userId: string, folder: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Fichier accepté : image (JPEG, PNG, WebP) ou PDF.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Fichier trop lourd (5 Mo maximum).');
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

const toBalance = (r: Record<string, unknown>): WalletBalance => ({
  currency: String(r.currency),
  available: Number(r.available),
  pending_in: Number(r.pending_in),
  pending_out: Number(r.pending_out),
  invested: Number(r.invested),
});

export async function getMyBalances(): Promise<WalletBalance[]> {
  const { data, error } = await db().rpc('my_wallet_balances');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toBalance);
}

/** Gains crédités aujourd'hui (commissions, revenus distribués, restitutions). */
export async function getTodayGains(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await db()
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('wallet', true)
    .eq('status', 'confirmed')
    .eq('direction', 'credit')
    .in('type', ['referral_commission', 'distribution', 'capital_return'])
    .gte('created_at', startOfDay.toISOString());
  if (error) throw error;
  return ((data ?? []) as { amount: number }[]).reduce((sum, t) => sum + Number(t.amount), 0);
}

export async function listMyWalletTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await db()
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet', true)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

export async function requestDeposit(params: {
  userId: string;
  amount: number;
  currency: string;
  method: string;
  reference: string;
  proof?: File | null;
  idempotencyKey: string;
}): Promise<Transaction> {
  const proofPath = params.proof ? await uploadPrivateFile(PAYMENT_PROOFS_BUCKET, params.userId, 'deposits', params.proof) : null;
  const { data, error } = await db().rpc('request_deposit', {
    p_amount: params.amount,
    p_currency: params.currency,
    p_method: params.method,
    p_reference: params.reference,
    p_proof_path: proofPath,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw error;
  return data as Transaction;
}

export function withdrawalFee(amount: number, settings: PlatformSettings | null): number {
  if (!settings || !Number.isFinite(amount) || amount <= 0) return 0;
  // Frais prélevés sur le montant demandé (le membre reçoit montant − frais)
  const fee = (amount * Number(settings.withdrawal_fee_percent)) / 100 + Number(settings.withdrawal_fee_fixed);
  return Math.min(Math.round(fee * 100) / 100, amount);
}

export interface WithdrawalAccount {
  network: string;
  holder_name: string;
  airtel_number: string;
}

/** Réseaux de retrait proposés aux membres (Airtel Money, Orange Money…). */
export async function listWithdrawalNetworks(): Promise<WithdrawalNetwork[]> {
  const { data, error } = await db().from('withdrawal_networks').select('*').eq('is_active', true).order('sort_order').order('name');
  if (error) throw error;
  return (data ?? []) as WithdrawalNetwork[];
}

export async function adminListWithdrawalNetworks(): Promise<WithdrawalNetwork[]> {
  const { data, error } = await db().from('withdrawal_networks').select('*').order('sort_order').order('name');
  if (error) throw error;
  return (data ?? []) as WithdrawalNetwork[];
}

export async function adminSaveWithdrawalNetwork(input: Omit<WithdrawalNetwork, 'id'>, id?: string): Promise<void> {
  const { error } = id
    ? await db().from('withdrawal_networks').update(input).eq('id', id)
    : await db().from('withdrawal_networks').insert(input);
  if (error) throw error;
}

export async function adminDeleteWithdrawalNetwork(id: string): Promise<void> {
  const { error } = await db().from('withdrawal_networks').delete().eq('id', id);
  if (error) throw error;
}

/** Portefeuille de retrait du client (null s'il n'est pas encore configuré). */
export async function getMyWithdrawalAccount(): Promise<WithdrawalAccount | null> {
  const { data, error } = await db().rpc('get_my_withdrawal_account');
  if (error) throw error;
  return ((data ?? []) as WithdrawalAccount[])[0] ?? null;
}

export async function setWithdrawalAccount(params: { network: string; holderName: string; number: string; password: string }): Promise<void> {
  const { error } = await db().rpc('set_withdrawal_account', {
    p_network: params.network,
    p_holder_name: params.holderName,
    p_number: params.number,
    p_password: params.password,
  });
  if (error) throw error;
}

/** Change le mot de passe de retrait ; l'ancien est exigé. */
export async function changeWithdrawalPassword(oldPassword: string, newPassword: string): Promise<void> {
  const { data, error } = await db().rpc('change_withdrawal_password', {
    p_old_password: oldPassword,
    p_new_password: newPassword,
  });
  if (error) throw error;
  if (data !== true) throw new Error('Ancien mot de passe de retrait incorrect.');
}

/** Retrait vers le réseau du membre, protégé par le mot de passe de retrait. */
export async function requestWithdrawal(params: { amount: number; password: string; idempotencyKey: string }): Promise<Transaction> {
  const { data, error } = await db().rpc('request_withdrawal_with_password', {
    p_amount: params.amount,
    p_password: params.password,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw error;
  const tx = data as Transaction | null;
  if (!tx || !tx.id) throw new Error('Mot de passe de retrait incorrect.');
  return tx;
}

/** Le membre connecté a-t-il déjà acheté au moins un produit ? (condition de retrait) */
export async function iHavePurchased(): Promise<boolean> {
  const { data, error } = await db().rpc('i_have_purchased');
  if (error) throw error;
  return data === true;
}

/** Le membre connecté a-t-il au moins un dépôt validé par l'admin ? (condition d'achat et de retrait) */
export async function iHaveApprovedDeposit(): Promise<boolean> {
  const { data, error } = await db().rpc('i_have_approved_deposit');
  if (error) throw error;
  return data === true;
}

/** Achat immédiat d'un véhicule : commande créée et réglée avec le solde du portefeuille. */
export async function buyVehicleWithWallet(vehicleId: string, idempotencyKey: string): Promise<Order> {
  const { data, error } = await db().rpc('buy_vehicle_with_wallet', {
    p_vehicle_id: vehicleId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data as Order;
}

export async function payOrderWithWallet(orderId: string): Promise<void> {
  const { error } = await db().rpc('pay_order_with_wallet', { p_order_id: orderId });
  if (error) throw error;
}

// --- Comptes de dépôt ---------------------------------------------------------

export type DepositChannelInput = Omit<DepositChannel, 'id'>;

export async function listDepositChannels(): Promise<DepositChannel[]> {
  const { data, error } = await db()
    .from('deposit_channels')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as DepositChannel[];
}

export async function adminListDepositChannels(): Promise<DepositChannel[]> {
  const { data, error } = await db().from('deposit_channels').select('*').order('sort_order').order('created_at');
  if (error) throw error;
  return (data ?? []) as DepositChannel[];
}

export async function adminSaveDepositChannel(input: DepositChannelInput, id?: string): Promise<void> {
  const { error } = id
    ? await db().from('deposit_channels').update(input).eq('id', id)
    : await db().from('deposit_channels').insert(input);
  if (error) throw error;
}

export async function adminDeleteDepositChannel(id: string): Promise<void> {
  const { error } = await db().from('deposit_channels').delete().eq('id', id);
  if (error) throw error;
}

// --- Administration --------------------------------------------------------

export async function adminListWalletOperations(type: 'deposit' | 'withdrawal', status: TransactionStatus | 'all'): Promise<Transaction[]> {
  let query = db()
    .from('transactions')
    .select('*, customer:profiles(full_name, email, phone)')
    .eq('type', type)
    .eq('wallet', true)
    .order('created_at', { ascending: status === 'pending' })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

/** Frais prélevés sur chaque retrait (pour afficher le montant demandé = net + frais). */
export async function adminWithdrawalFees(withdrawalIds: string[]): Promise<Map<string, number>> {
  const fees = new Map<string, number>();
  if (withdrawalIds.length === 0) return fees;
  const { data, error } = await db()
    .from('transactions')
    .select('amount, related_transaction_id')
    .eq('type', 'fee')
    .in('related_transaction_id', withdrawalIds);
  if (error) throw error;
  for (const f of (data ?? []) as { amount: number; related_transaction_id: string }[]) {
    fees.set(f.related_transaction_id, (fees.get(f.related_transaction_id) ?? 0) + Number(f.amount));
  }
  return fees;
}

export async function adminReviewDeposit(id: string, approve: boolean, reason: string): Promise<void> {
  const { error } = await db().rpc('admin_review_deposit', { p_transaction_id: id, p_approve: approve, p_reason: reason || null });
  if (error) throw error;
}

export async function adminProcessWithdrawal(id: string, approve: boolean, reason: string, payoutReference: string): Promise<void> {
  const { error } = await db().rpc('admin_process_withdrawal', {
    p_transaction_id: id,
    p_approve: approve,
    p_reason: reason || null,
    p_payout_reference: payoutReference || null,
  });
  if (error) throw error;
}

export async function adminWalletAdjustment(params: {
  userId: string;
  amount: number;
  currency: string;
  direction: 'credit' | 'debit';
  reason: string;
}): Promise<void> {
  const { error } = await db().rpc('admin_wallet_adjustment', {
    p_user: params.userId,
    p_amount: params.amount,
    p_currency: params.currency,
    p_direction: params.direction,
    p_reason: params.reason,
  });
  if (error) throw error;
}

export async function adminUserBalances(userId: string): Promise<WalletBalance[]> {
  const { data, error } = await db().rpc('admin_wallet_balances', { p_user: userId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toBalance);
}
