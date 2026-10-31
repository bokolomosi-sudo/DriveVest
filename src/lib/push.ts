import { db } from './supabase';

/**
 * Notifications push du navigateur / de l'application installée.
 * L'appareil s'abonne avec la clé publique VAPID ; la base envoie ensuite chaque
 * notification enregistrée via la fonction Edge « send-push ».
 */
// Clé publique VAPID : créée par la fonction send-push et lue dans la base (une fois par session)
let publicKeyPromise: Promise<string | null> | null = null;

function getPublicKey(): Promise<string | null> {
  publicKeyPromise ??= Promise.resolve(db().rpc('get_push_public_key')).then(({ data, error }) => {
    if (error) {
      publicKeyPromise = null;
      return null;
    }
    return (data as string | null) || null;
  });
  return publicKeyPromise;
}

export type PushState = 'unsupported' | 'not-configured' | 'denied' | 'enabled' | 'available';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  // Le service worker n'est enregistré qu'en production (voir main.tsx)
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? null;
}

async function save(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const { error } = await db().rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (!(await getPublicKey())) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'enabled' : 'available';
}

/** Demande l'autorisation puis abonne l'appareil au compte connecté. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  const publicKey = await getPublicKey();
  if (!publicKey) return 'not-configured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'available';
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(publicKey),
    }));
  await save(subscription);
  return 'enabled';
}

/** À la connexion : rattache silencieusement l'appareil déjà autorisé au compte connecté. */
export async function syncPushSubscription(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(sub);
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await db().rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
