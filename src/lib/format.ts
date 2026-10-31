import { getUserTimeZone } from './timezone';

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
  // Affichée à l'heure de la province du membre (RDC : UTC+1 à l'ouest, UTC+2 à l'est)
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: getUserTimeZone(),
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
/** Lien WhatsApp ; un numéro local (097…) est converti au format international (243…). */
export function whatsappLink(number: string, text?: string): string {
  let digits = number.replace(/[^\d]/g, '');
  if (/^0\d{9}$/.test(digits)) digits = `243${digits.slice(1)}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
