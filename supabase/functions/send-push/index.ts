// Fonction Edge « send-push » : envoie une notification enregistrée sur tous les
// appareils abonnés de son destinataire. Appelée par la base (trigger + pg_net).
//
// Secrets à définir (Edge Functions > send-push > Secrets) :
//   PUSH_WEBHOOK_SECRET  valeur de push_settings.webhook_secret
//   VAPID_PUBLIC_KEY     clé publique VAPID (la même que VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY    clé privée VAPID
//   VAPID_SUBJECT        ex. mailto:contact@drivest.app
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@drivest.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('PUSH_WEBHOOK_SECRET')}`) {
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
