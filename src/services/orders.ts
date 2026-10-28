import { db } from '../lib/supabase';
import type {
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  Transaction,
} from '../types';

export const PAYMENT_PROOFS_BUCKET = 'payment-proofs';
const ORDER_SELECT = '*, items:order_items(*), payments(*), history:order_status_history(*)';
const CUSTOMER = 'customer:profiles(full_name, email, phone)';
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function sortOrder(o: Order): Order {
  return {
    ...o,
    payments: [...(o.payments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    history: [...(o.history ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

// --- Client ----------------------------------------------------------------

/** Produits achetés par le client (commandes avec la photo et la durée du produit). */
export async function listMyOrders(userId: string): Promise<Order[]> {
  const { data, error } = await db()
    .from('orders')
    .select('*, items:order_items(*, vehicle:vehicles(id, brand, model, duration_days, images:vehicle_images(id, vehicle_id, storage_path, external_url, alt, sort_order, created_at)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await db().from('orders').select(`${ORDER_SELECT}, ${CUSTOMER}`).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? sortOrder(data as Order) : null;
}

export async function createOrder(params: {
  vehicleId: string;
  idempotencyKey: string;
  note?: string;
  deliveryAddress?: string;
}): Promise<Order> {
  const { data, error } = await db().rpc('create_order', {
    p_vehicle_id: params.vehicleId,
    p_idempotency_key: params.idempotencyKey,
    p_customer_note: params.note ?? null,
    p_delivery_address: params.deliveryAddress ?? null,
  });
  if (error) throw error;
  return data as Order;
}

export async function cancelMyOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await db().rpc('cancel_my_order', { p_order_id: orderId, p_reason: reason || null });
  if (error) throw error;
}

export async function submitPayment(params: {
  userId: string;
  orderId: string;
  method: string;
  reference: string;
  amount: number;
  proof?: File | null;
}): Promise<Payment> {
  let proofPath: string | null = null;
  if (params.proof) {
    if (!ALLOWED_PROOF_TYPES.includes(params.proof.type)) {
      throw new Error('Justificatif accepté : image (JPEG, PNG, WebP) ou PDF.');
    }
    if (params.proof.size > MAX_PROOF_BYTES) throw new Error('Justificatif trop lourd (5 Mo maximum).');
    const ext = params.proof.type === 'application/pdf' ? 'pdf' : params.proof.type.split('/')[1];
    proofPath = `${params.userId}/${params.orderId}/${crypto.randomUUID()}.${ext}`;
    const upload = await db()
      .storage.from(PAYMENT_PROOFS_BUCKET)
      .upload(proofPath, params.proof, { contentType: params.proof.type });
    if (upload.error) throw upload.error;
  }

  const { data, error } = await db().rpc('submit_payment', {
    p_order_id: params.orderId,
    p_method: params.method,
    p_reference: params.reference,
    p_amount: params.amount,
    p_proof_path: proofPath,
  });
  if (error) throw error;
  return data as Payment;
}

export async function listMyTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await db()
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

/** URL signée (5 min) : les justificatifs ne sont jamais publics. */
export async function getProofUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(PAYMENT_PROOFS_BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

// --- Administration --------------------------------------------------------

export async function adminListOrders(status: OrderStatus | 'all', search = ''): Promise<Order[]> {
  let query = db()
    .from('orders')
    .select(`*, items:order_items(*), ${CUSTOMER}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);
  const s = search.replace(/[%,()]/g, '').trim();
  if (s) query = query.ilike('order_number', `%${s}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function adminSetOrderStatus(orderId: string, status: OrderStatus, note: string): Promise<void> {
  const { error } = await db().rpc('admin_set_order_status', {
    p_order_id: orderId,
    p_status: status,
    p_note: note || null,
  });
  if (error) throw error;
}

export type AdminPayment = Payment & {
  order: { order_number: string; total_amount: number; currency: string } | null;
  customer: { full_name: string | null; email: string | null } | null;
};

export async function adminListPayments(status: PaymentStatus | 'all'): Promise<AdminPayment[]> {
  let query = db()
    .from('payments')
    .select('*, order:orders(order_number, total_amount, currency), customer:profiles(full_name, email)')
    .order('created_at', { ascending: status === 'submitted' })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AdminPayment[];
}

export async function adminReviewPayment(paymentId: string, approve: boolean, reason: string): Promise<void> {
  const { error } = await db().rpc('admin_review_payment', {
    p_payment_id: paymentId,
    p_approve: approve,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function adminListTransactions(): Promise<Transaction[]> {
  const { data, error } = await db()
    .from('transactions')
    .select(`*, ${CUSTOMER}`)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Transaction[];
}
