/**
 * Suivi des requêtes réseau en cours (Supabase passe par fetch) pour afficher
 * une barre de chargement et prévenir l'utilisateur quand la connexion est lente.
 */
type Listener = (pending: number) => void;

let pending = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(pending));
}

export function subscribeNetworkActivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}

export function trackNetworkActivity() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    pending += 1;
    emit();
    try {
      return await originalFetch(...args);
    } finally {
      pending -= 1;
      emit();
    }
  };
}
