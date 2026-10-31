/**
 * Fuseau horaire de l'utilisateur, d'après sa province.
 * La RD Congo a deux fuseaux : l'ouest est à UTC+1 (heure de Kinshasa),
 * le centre et l'est à UTC+2 (heure de Lubumbashi). Sans province connue,
 * on garde l'heure du téléphone.
 */
const WEST_PROVINCES = new Set(
  ['Kinshasa', 'Kongo-Central', 'Kwango', 'Kwilu', 'Mai-Ndombe', 'Équateur', 'Mongala', 'Nord-Ubangi', 'Sud-Ubangi', 'Tshuapa'].map(normalize),
);

// Aucun changement d'heure en RDC : décalage fixe pour chaque fuseau
const OFFSETS: Record<string, string> = { 'Africa/Kinshasa': '+01:00', 'Africa/Lubumbashi': '+02:00' };

let currentZone: string | undefined;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function timeZoneForProvince(province: string | null | undefined): string | undefined {
  if (!province?.trim()) return undefined;
  return WEST_PROVINCES.has(normalize(province)) ? 'Africa/Kinshasa' : 'Africa/Lubumbashi';
}

/** Appelé à la connexion (et quand le profil change) avec la province du membre. */
export function setUserTimeZone(province: string | null | undefined) {
  currentZone = timeZoneForProvince(province);
}

/** Fuseau à utiliser pour l'affichage (undefined = heure du téléphone). */
export function getUserTimeZone(): string | undefined {
  return currentZone;
}

/** Jour (AAAA-MM-JJ) d'une date, dans le fuseau de l'utilisateur. */
export function dayKey(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: currentZone }).format(new Date(value));
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Minuit aujourd'hui dans le fuseau de l'utilisateur. */
export function startOfToday(): Date {
  const offset = currentZone ? OFFSETS[currentZone] : undefined;
  if (offset) return new Date(`${todayKey()}T00:00:00${offset}`);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
