// Types métier Drivest — alignés sur supabase/migrations/*_drivest_initial_schema.sql

export type AppRole = 'client' | 'admin' | 'super_admin';
export type CategoryStatus = 'active' | 'inactive' | 'archived';
export type PublicationStatus = 'draft' | 'published' | 'inactive' | 'archived';
export type VehicleCondition = 'new' | 'used';
export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'plug_in_hybrid' | 'electric' | 'lpg' | 'other';
export type TransmissionType = 'manual' | 'automatic' | 'semi_automatic' | 'other';
export type AvailabilityStatus = 'available' | 'reserved' | 'sold' | 'unavailable';
export type OrderStatus =
  | 'draft'
  | 'pending_confirmation'
  | 'payment_verification'
  | 'payment_confirmed'
  | 'confirmed'
  | 'preparing'
  | 'shipping'
  | 'delivered'
  | 'cancelled'
  | 'refunded';
export type PaymentStatus = 'submitted' | 'verified' | 'rejected';
export type RefundStatus = 'requested' | 'approved' | 'rejected' | 'completed';
export type TransactionType =
  | 'order_payment'
  | 'refund'
  | 'deposit'
  | 'withdrawal'
  | 'fee'
  | 'adjustment'
  | 'investment'
  | 'distribution'
  | 'capital_return'
  | 'referral_commission';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type InvestmentOfferStatus = 'draft' | 'open' | 'closed' | 'active' | 'completed' | 'cancelled';
export type ParticipationStatus = 'active' | 'exited' | 'completed' | 'refunded';
export type TransactionStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type SupportTopic = 'order' | 'payment' | 'vehicle' | 'refund' | 'account' | 'other';
export type SupportStatus = 'open' | 'in_progress' | 'answered' | 'closed';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  province: string | null;
  city: string | null;
  country: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  blocked_at: string | null;
  referral_code: string;
  referred_by: string | null;
  kyc_status: KycStatus;
  kyc_document_type: string | null;
  kyc_document_number: string | null;
  kyc_document_path: string | null;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  user_id: string;
  role: AppRole;
  granted_at: string;
}

export interface PlatformSettings {
  id: number;
  default_currency: string;
  accepted_payment_methods: string[];
  payment_instructions: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_number: string | null;
  telegram_url: string | null;
  /** Provinces proposées sur la page de bienvenue */
  provinces: string[];
  whatsapp_group_url: string | null;
  /** Nom du service client affiché sur WhatsApp */
  support_name: string | null;
  support_hours: string | null;
  contact_address: string | null;
  legal_notice: string | null;
  feature_wallet: boolean;
  feature_investment: boolean;
  feature_referral: boolean;
  legal_entity_name: string | null;
  registration_number: string | null;
  regulatory_authority: string | null;
  license_number: string | null;
  deposit_instructions: string | null;
  min_deposit: number;
  min_withdrawal: number;
  withdrawal_fee_percent: number;
  withdrawal_fee_fixed: number;
  withdrawal_requires_kyc: boolean;
  investment_requires_kyc: boolean;
  referral_commission_percent: number;
  referral_level2_percent: number;
  referral_level3_percent: number;
  signup_bonus: number;
  referral_on_orders: boolean;
  referral_on_investments: boolean;
  updated_at: string;
}

export interface VehicleCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: CategoryStatus;
  created_at: string;
  updated_at: string;
}

export interface VehicleImage {
  id: string;
  vehicle_id: string;
  storage_path: string | null;
  external_url: string | null;
  alt: string | null;
  sort_order: number;
  created_at: string;
}

export interface Vehicle {
  id: string;
  reference: string;
  category_id: string | null;
  brand: string;
  model: string;
  year: number | null;
  description: string | null;
  price: number | null;
  currency: string;
  condition: VehicleCondition;
  mileage_km: number | null;
  fuel: FuelType | null;
  transmission: TransmissionType | null;
  engine: string | null;
  color: string | null;
  seats: number | null;
  duration_days: number | null;
  /** Pourcentage du prix versé chaque jour (ex. 5 = 1 000 FC/jour sur 20 000 FC) */
  daily_revenue_percent: number | null;
  /** Montant quotidien correspondant au pourcentage (FC) */
  daily_revenue_cap: number | null;
  availability: AvailabilityStatus;
  location: string | null;
  delivery_terms: string | null;
  seller_name: string | null;
  seller_details: string | null;
  status: PublicationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category?: Pick<VehicleCategory, 'id' | 'name' | 'slug'> | null;
  images?: VehicleImage[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  vehicle_id: string;
  vehicle_label: string;
  unit_price: number;
  currency: string;
  quantity: number;
  daily_revenue_percent?: number | null;
  daily_revenue_amount?: number | null;
  /** Durée figée à l'achat (jours). */
  duration_days?: number | null;
  vehicle?: (Pick<Vehicle, 'id' | 'brand' | 'model' | 'duration_days'> & { images?: VehicleImage[] }) | null;
}

export interface OrderStatusHistory {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  method: string;
  reference: string;
  proof_path: string | null;
  status: PaymentStatus;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface Refund {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  admin_note: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface CustomerSummary {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  total_amount: number;
  currency: string;
  customer_note: string | null;
  delivery_address: string | null;
  cancel_reason: string | null;
  /** Heure d'achat (paiement confirmé) : les versements quotidiens se font à cette heure. */
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  payments?: Payment[];
  refunds?: Refund[];
  history?: OrderStatusHistory[];
  customer?: CustomerSummary | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  reference: string;
  reason: string | null;
  order_id: string | null;
  payment_id: string | null;
  refund_id: string | null;
  admin_id: string | null;
  wallet: boolean;
  direction: 'credit' | 'debit';
  method: string | null;
  external_reference: string | null;
  proof_path: string | null;
  destination: string | null;
  rejection_reason: string | null;
  related_transaction_id: string | null;
  offer_id: string | null;
  participation_id: string | null;
  distribution_id: string | null;
  created_at: string;
  customer?: CustomerSummary | null;
}

export interface WalletBalance {
  currency: string;
  available: number;
  pending_in: number;
  pending_out: number;
  invested: number;
}

export interface InvestmentOffer {
  id: string;
  title: string;
  summary: string | null;
  vehicle_id: string | null;
  legal_nature: string | null;
  platform_role: string | null;
  asset_description: string | null;
  currency: string;
  min_amount: number;
  max_amount: number | null;
  target_amount: number | null;
  duration_months: number;
  participant_rights: string | null;
  fees_description: string | null;
  entry_fee_percent: number;
  return_calculation: string | null;
  indicative_annual_rate: number | null;
  risks: string | null;
  exit_conditions: string | null;
  refund_conditions: string | null;
  withdrawal_conditions: string | null;
  regulatory_notes: string | null;
  contract_document_path: string | null;
  contract_version: string;
  status: InvestmentOfferStatus;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferProgress {
  offer_id: string;
  raised: number;
  participants: number;
}

export interface InvestmentParticipation {
  id: string;
  offer_id: string;
  user_id: string;
  amount: number;
  entry_fee: number;
  currency: string;
  status: ParticipationStatus;
  contract_version: string;
  terms_accepted_at: string;
  exit_amount: number | null;
  exited_at: string | null;
  note: string | null;
  created_at: string;
  offer?: Pick<InvestmentOffer, 'id' | 'title' | 'status' | 'duration_months'> | null;
  customer?: CustomerSummary | null;
}

export interface InvestmentDistribution {
  id: string;
  offer_id: string;
  period_label: string;
  declared_amount: number;
  distributed_amount: number;
  currency: string;
  revenue_source: string;
  justification_path: string | null;
  created_at: string;
}

export interface ReferralCommission {
  id: string;
  referrer_id: string;
  referred_id: string;
  source_type: 'order' | 'investment';
  base_amount: number;
  rate: number;
  amount: number;
  currency: string;
  reversed_at: string | null;
  level: number;
  created_at: string;
}

export interface TeamMember {
  display_name: string;
  /** Numéro complet au niveau 1, masqué aux niveaux 2 et 3 */
  phone: string | null;
  province: string | null;
  city: string | null;
  joined_at: string;
  level: number;
  has_invested: boolean;
  products_count: number;
  invested_amount: number;
  commissions: number;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  status: PublicationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportRequest {
  id: string;
  user_id: string;
  order_id: string | null;
  topic: SupportTopic;
  subject: string;
  message: string;
  status: SupportStatus;
  admin_response: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: CustomerSummary | null;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DashboardStats {
  users_total: number;
  users_blocked: number;
  vehicles_by_status: Partial<Record<PublicationStatus, number>>;
  orders_by_status: Partial<Record<OrderStatus, number>>;
  payments_pending: number;
  refunds_open: number;
  support_open: number;
  confirmed_payments_by_currency: Record<string, number>;
  deposits_pending: number;
  withdrawals_pending: number;
  kyc_pending: number;
  invested_by_currency: Record<string, number>;
}

/** Palier de récompense d'équipe vu par le membre */
export interface TeamReward {
  tier_id: string;
  invited_count: number;
  amount: number;
  /** Invités directs ayant déjà acheté un produit */
  invested_invitees: number;
  granted_at: string | null;
}

export interface TeamRewardTier {
  id: string;
  invited_count: number;
  amount: number;
  is_active: boolean;
}

/** Compte sur lequel le client envoie son dépôt (Airtel Money…) */
export interface DepositChannel {
  id: string;
  name: string;
  account_number: string;
  account_name: string | null;
  ussd_code: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Fiche complète d'un membre (administration) */
export interface AdminUserOverview {
  balance: number;
  sponsor: { id: string; full_name: string | null; phone: string | null } | null;
  withdrawal_account: {
    network: string;
    holder_name: string;
    airtel_number: string;
    failed_attempts: number;
    locked_until: string | null;
    created_at: string;
  } | null;
  team_level1: number;
  team_level2: number;
  invested_invitees: number;
  total_deposits: number;
  total_withdrawals: number;
  total_commissions: number;
  total_rewards: number;
}

/** Réseau Mobile Money sur lequel un membre peut recevoir ses retraits */
export interface WithdrawalNetwork {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

/** Versement quotidien automatique d'un produit acheté */
export interface ProductDailyCredit {
  id: string;
  order_id: string;
  user_id: string;
  vehicle_id: string;
  period_index: number;
  due_at: string;
  amount: number;
  created_at: string;
  vehicle?: { brand: string; model: string } | null;
  profile?: { full_name: string | null; phone: string | null } | null;
}

/** Revenu reçu par le membre connecté */
export interface MyProductRevenue {
  order_id: string;
  vehicle_label: string;
  revenue_date: string;
  /** Heure exacte du versement (classement par jour selon le fuseau du membre). */
  revenue_at: string;
  amount: number;
  created_at: string;
}
