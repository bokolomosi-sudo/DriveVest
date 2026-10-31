import type {
  Transaction,
  AvailabilityStatus,
  InvestmentOfferStatus,
  KycStatus,
  ParticipationStatus,
  CategoryStatus,
  FuelType,
  OrderStatus,
  PaymentStatus,
  PublicationStatus,
  RefundStatus,
  SupportStatus,
  SupportTopic,
  TransactionStatus,
  TransactionType,
  TransmissionType,
  VehicleCondition,
} from '../types';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Brouillon',
  pending_confirmation: 'En attente de confirmation',
  payment_verification: 'Paiement en vérification',
  payment_confirmed: 'Paiement confirmé',
  confirmed: 'Commande confirmée',
  preparing: 'En préparation',
  shipping: 'En livraison',
  delivered: 'Terminée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
  draft: 'neutral',
  pending_confirmation: 'warning',
  payment_verification: 'info',
  payment_confirmed: 'success',
  confirmed: 'success',
  preparing: 'info',
  shipping: 'info',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
};

/** Transitions manuelles autorisées côté admin (miroir de admin_set_order_status). */
export const ADMIN_ORDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  draft: ['pending_confirmation', 'cancelled'],
  pending_confirmation: ['cancelled'],
  payment_confirmed: ['confirmed'],
  confirmed: ['preparing'],
  preparing: ['shipping'],
  shipping: ['delivered'],
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'draft',
  'pending_confirmation',
  'payment_verification',
  'payment_confirmed',
  'confirmed',
  'preparing',
  'shipping',
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  submitted: 'En vérification',
  verified: 'Vérifié',
  rejected: 'Refusé',
};
export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  submitted: 'info',
  verified: 'success',
  rejected: 'danger',
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: 'Demandé',
  approved: 'Approuvé',
  rejected: 'Refusé',
  completed: 'Effectué',
};
export const REFUND_STATUS_TONES: Record<RefundStatus, Tone> = {
  requested: 'warning',
  approved: 'info',
  rejected: 'danger',
  completed: 'success',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  order_payment: 'Paiement de commande',
  refund: 'Remboursement',
  deposit: 'Dépôt',
  withdrawal: 'Retrait',
  fee: 'Frais',
  adjustment: 'Ajustement administratif',
  investment: 'Participation',
  distribution: 'Revenus distribués',
  capital_return: 'Restitution du capital',
  referral_commission: 'Commission de parrainage',
};
export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};
export const TRANSACTION_STATUS_TONES: Record<TransactionStatus, Tone> = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  inactive: 'Désactivé',
  archived: 'Archivé',
};
export const PUBLICATION_STATUS_TONES: Record<PublicationStatus, Tone> = {
  draft: 'neutral',
  published: 'success',
  inactive: 'warning',
  archived: 'danger',
};

export const CATEGORY_STATUS_LABELS: Record<CategoryStatus, string> = {
  active: 'Active',
  inactive: 'Désactivée',
  archived: 'Archivée',
};
export const CATEGORY_STATUS_TONES: Record<CategoryStatus, Tone> = {
  active: 'success',
  inactive: 'warning',
  archived: 'danger',
};

export const CONDITION_LABELS: Record<VehicleCondition, string> = { new: 'Neuf', used: 'Occasion' };

export const FUEL_LABELS: Record<FuelType, string> = {
  petrol: 'Essence',
  diesel: 'Diesel',
  hybrid: 'Hybride',
  plug_in_hybrid: 'Hybride rechargeable',
  electric: 'Électrique',
  lpg: 'GPL',
  other: 'Autre',
};

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  manual: 'Manuelle',
  automatic: 'Automatique',
  semi_automatic: 'Semi-automatique',
  other: 'Autre',
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: 'Disponible',
  reserved: 'Réservé',
  sold: 'Vendu',
  unavailable: 'Indisponible',
};
export const AVAILABILITY_TONES: Record<AvailabilityStatus, Tone> = {
  available: 'success',
  reserved: 'warning',
  sold: 'neutral',
  unavailable: 'danger',
};

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  order: 'Commande',
  payment: 'Paiement',
  vehicle: 'Véhicule',
  refund: 'Remboursement',
  account: 'Mon compte',
  other: 'Autre',
};
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  answered: 'Répondue',
  closed: 'Clôturée',
};
export const SUPPORT_STATUS_TONES: Record<SupportStatus, Tone> = {
  open: 'warning',
  in_progress: 'info',
  answered: 'success',
  closed: 'neutral',
};

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  none: 'Non vérifiée',
  pending: 'En cours de vérification',
  verified: 'Vérifiée',
  rejected: 'Refusée',
};
export const KYC_STATUS_TONES: Record<KycStatus, Tone> = {
  none: 'neutral',
  pending: 'info',
  verified: 'success',
  rejected: 'danger',
};

export const OFFER_STATUS_LABELS: Record<InvestmentOfferStatus, string> = {
  draft: 'Brouillon',
  open: 'Ouverte',
  closed: 'Souscription close',
  active: 'En cours',
  completed: 'Clôturée',
  cancelled: 'Annulée',
};
export const OFFER_STATUS_TONES: Record<InvestmentOfferStatus, Tone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'info',
  active: 'info',
  completed: 'neutral',
  cancelled: 'danger',
};

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  active: 'Active',
  exited: 'Sortie anticipée',
  completed: 'Clôturée',
  refunded: 'Remboursée',
};
export const PARTICIPATION_STATUS_TONES: Record<ParticipationStatus, Tone> = {
  active: 'success',
  exited: 'neutral',
  completed: 'neutral',
  refunded: 'warning',
};

/** Statut affiché d'une transaction : les retraits ont leurs propres libellés. */
export function transactionStatus(t: Pick<Transaction, 'type' | 'status'>): { label: string; tone: Tone } {
  if (t.type === 'withdrawal') {
    const map: Record<Transaction['status'], { label: string; tone: Tone }> = {
      pending: { label: 'Traitement bancaire', tone: 'info' },
      confirmed: { label: 'Retrait effectué', tone: 'success' },
      rejected: { label: 'Refusé', tone: 'danger' },
      cancelled: { label: 'Annulé', tone: 'neutral' },
    };
    return map[t.status];
  }
  return { label: TRANSACTION_STATUS_LABELS[t.status], tone: TRANSACTION_STATUS_TONES[t.status] };
}

export function entries<K extends string>(labels: Record<K, string>): [K, string][] {
  return Object.entries(labels) as [K, string][];
}
