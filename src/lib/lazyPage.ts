import { lazy, type ComponentType } from 'react';

const RETRIES = 3;
const DELAY_MS = 1500;
const RELOAD_KEY = 'drivest:reloaded-for-new-version';

/**
 * Une page introuvable après plusieurs essais vient presque toujours d'une
 * nouvelle version du site : on recharge une fois pour la récupérer.
 */
function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Comme React.lazy, mais réessaie le téléchargement de la page quand le réseau
 * coupe (fréquent sur les connexions mobiles) au lieu de rester bloqué.
 */
export function lazyPage<T extends ComponentType<object>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (attempt < RETRIES) await new Promise((r) => setTimeout(r, DELAY_MS * (attempt + 1)));
      }
    }
    // Rechargement en cours : on attend sans afficher d'erreur
    if (reloadOnceForNewVersion()) return new Promise<never>(() => undefined);
    throw lastError;
  });
}
