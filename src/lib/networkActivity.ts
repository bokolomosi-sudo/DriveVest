/**
 * Suivi des requêtes réseau en cours (Supabase passe par fetch) pour afficher
 * une barre de chargement et prévenir l'utilisateur quand la connexion est lente,
 * et suivi de la connexion elle-même (données mobiles / Wi-Fi coupés).
 */
type Listener = (pending: number) => void;
type ConnectivityListener = (online: boolean) => void;

/** Événement envoyé quand la connexion revient : les pages en erreur se rechargent. */
export const BACK_ONLINE_EVENT = 'drivest:back-online';

const PROBE_EVERY_MS = 4000;

let pending = 0;
const listeners = new Set<Listener>();

let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let probeTimer: number | undefined;
const connectivityListeners = new Set<ConnectivityListener>();
let originalFetch: typeof fetch = (...args) => fetch(...args);

function emit() {
  listeners.forEach((listener) => listener(pending));
}

export function subscribeNetworkActivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}

export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  connectivityListeners.add(listener);
  listener(online);
  return () => connectivityListeners.delete(listener);
}

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  connectivityListeners.forEach((listener) => listener(online));
  if (online) {
    window.clearTimeout(probeTimer);
    probeTimer = undefined;
    window.dispatchEvent(new Event(BACK_ONLINE_EVENT));
  } else {
    scheduleProbe();
  }
}

function scheduleProbe() {
  window.clearTimeout(probeTimer);
  probeTimer = window.setTimeout(() => void checkConnection(), PROBE_EVERY_MS);
}

/** Vérifie réellement l'accès à internet (le navigateur peut se croire connecté à tort). */
export async function checkConnection(): Promise<boolean> {
  try {
    await originalFetch(`/favicon.svg?ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    setOnline(true);
    return true;
  } catch {
    if (online) setOnline(false);
    else scheduleProbe();
    return false;
  }
}

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError && !(err instanceof DOMException && err.name === 'AbortError');
}

export function trackNetworkActivity() {
  originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    pending += 1;
    emit();
    try {
      const response = await originalFetch(...args);
      setOnline(true);
      return response;
    } catch (err) {
      // Requête impossible à envoyer : on vérifie si c'est la connexion qui est coupée
      if (isNetworkFailure(err)) void checkConnection();
      throw err;
    } finally {
      pending -= 1;
      emit();
    }
  };
  window.addEventListener('online', () => void checkConnection());
  window.addEventListener('offline', () => setOnline(false));
  if (!online) scheduleProbe();
}
