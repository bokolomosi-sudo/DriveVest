import { lazy, type ComponentType } from 'react';

const RETRIES = 3;
const DELAY_MS = 1500;

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
    throw lastError;
  });
}
