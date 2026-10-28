export const CURRENCY = 'CDF';

export function formatPrice(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return 'Prix sur demande';
  if (currency === 'CDF') {
    return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 })} FC`;
  }
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(value));
}

export function formatKm(km: number | null | undefined): string | null {
  if (km === null || km === undefined) return null;
  return `${km.toLocaleString('fr-FR')} km`;
}

export function vehicleTitle(v: { brand: string; model: string; year?: number | null }): string {
  return [v.brand, v.model, v.year ?? undefined].filter(Boolean).join(' ');
}

/** Lien WhatsApp à partir d'un numéro officiel (chiffres uniquement). */
export function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, '')}`;
}
