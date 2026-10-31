/**
 * Authentification Supabase par numéro de téléphone + mot de passe.
 * Prérequis : Authentication > Sign In / Providers > Phone activé,
 * « Enable phone confirmations » désactivé (aucun SMS n'est alors envoyé).
 *
 * Supabase impose 6 caractères minimum : un suffixe fixe est ajouté au mot de
 * passe saisi pour autoriser des mots de passe de 4 caractères.
 */

const PASSWORD_SUFFIX = '::drivest';
export const MIN_PASSWORD_LENGTH = 6;

/** Indicatif de la RDC, seul pays accepté. */
export const DEFAULT_COUNTRY_CODE = '243';

/**
 * Numéro international sans « + » (ex. 243812345678), ou null s'il est invalide.
 * Un même numéro donne toujours le même résultat, quelle que soit la façon de le saisir
 * (0971234567, 971234567, +243971234567, 002430971234567…) : un numéro = un compte.
 */
export function normalizePhone(countryCode: string, localNumber: string): string | null {
  let digits = localNumber.replace(/\D/g, '');
  const international = localNumber.trim().startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international || (digits.startsWith(countryCode) && digits.length > countryCode.length + 7)) {
    // L'indicatif a été tapé : on le retire
    if (!digits.startsWith(countryCode)) return null;
    digits = digits.slice(countryCode.length);
  }
  digits = digits.replace(/^0+/, '');
  return /^\d{9}$/.test(digits) ? countryCode + digits : null;
}

/**
 * Connexion : format strict d'abord, sinon ancienne normalisation (plus permissive)
 * pour que les comptes créés avant le format strict puissent toujours se connecter.
 */
export function normalizeLoginPhone(countryCode: string, localNumber: string): string | null {
  const strict = normalizePhone(countryCode, localNumber);
  if (strict) return strict;
  let digits = localNumber.replace(/\D/g, '');
  if (localNumber.trim().startsWith('+')) return /^\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return /^\d{8,15}$/.test(digits) ? digits : null;
  }
  digits = digits.replace(/^0+/, '');
  if (digits.startsWith(countryCode) && digits.length > countryCode.length + 7) digits = digits.slice(countryCode.length);
  const full = countryCode + digits;
  return digits.length >= 6 && /^\d{8,15}$/.test(full) ? full : null;
}

/** Format attendu par Supabase Auth : +243812345678. */
export function toE164(phone: string): string {
  return `+${phone.replace(/^\+/, '')}`;
}

export function formatPhone(phone: string | null | undefined): string {
  return phone ? `+${phone.replace(/^\+/, '')}` : '—';
}

export function authPassword(password: string): string {
  return password + PASSWORD_SUFFIX;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  return null;
}

/** Numéro de RDC au format local : 243971234567 -> 0971234567. */
export function formatLocalPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith(DEFAULT_COUNTRY_CODE) ? `0${digits.slice(DEFAULT_COUNTRY_CODE.length)}` : digits;
}

/** Numéro local saisi (ex. 0971234567) -> format international sans « + », ou null s'il est invalide. */
export function parseLocalPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return /^0\d{9}$/.test(digits) ? DEFAULT_COUNTRY_CODE + digits.slice(1) : null;
}
