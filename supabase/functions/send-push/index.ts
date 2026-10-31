// Fonction Edge « send-push » : envoie une notification enregistrée sur tous les
// appareils abonnés de son destinataire. Appelée par la base (trigger + pg_net).
//
// Le secret partagé et les clés VAPID sont lus dans la table push_settings
// (accessible uniquement avec la clé service_role) ; des secrets de fonction
// PUSH_WEBHOOK_SECRET / VAPID_* peuvent les remplacer s'ils sont définis.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

interface PushConfig {
  secret: string;
  publicKey: string;
  privateKey: string;
  subject: string;
}

let config: PushConfig | null = null;

async function readSettings() {
  const { data } = await supabase
    .from('push_settings')
    .select('webhook_secret, vapid_public_key, vapid_private_key, vapid_subject')
    .eq('id', 1)
    .maybeSingle();
  return data;
}

async function loadConfig(): Promise<PushConfig | null> {
  if (config) return config;
  let data = await readSettings();
  // Premier lancement : la fonction crée ses clés VAPID elle-même (la clé privée ne quitte jamais le serveur)
  if (data && !data.vapid_public_key && !Deno.env.get('VAPID_PUBLIC_KEY')) {
    const keys = webpush.generateVAPIDKeys();
    await supabase
      .from('push_settings')
      .update({ vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey })
      .eq('id', 1)
      .is('vapid_public_key', null);
    data = await readSettings();
  }
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? data?.webhook_secret;
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? data?.vapid_public_key;
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? data?.vapid_private_key;
  const subject = Deno.env.get('VAPID_SUBJECT') ?? data?.vapid_subject ?? 'mailto:contact@drivest.app';
  if (!secret || !publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  config = { secret, publicKey, privateKey, subject };
  return config;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const cfg = await loadConfig();
  if (!cfg) return new Response('Clés push non configurées', { status: 503 });
  if (req.headers.get('Authorization') !== `Bearer ${cfg.secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) return new Response('notification_id manquant', { status: 400 });

  const { data: notification } = await supabase
    .from('notifications')
    .select('id, user_id, title, body, link')
    .eq('id', notification_id)
    .maybeSingle();
  if (!notification) return new Response('Notification introuvable', { status: 404 });

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notification.user_id);

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body ?? '',
    link: notification.link ?? '/compte/notifications',
    tag: notification.id,
  });

  let sent = 0;
  await Promise.all(
    (subscriptions ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 24,
          urgency: 'high',
        });
        sent++;
      } catch (err) {
        // Appareil désinstallé ou abonnement expiré : on le retire
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id);
      }
    }),
  );

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
