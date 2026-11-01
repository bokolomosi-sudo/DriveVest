// Fonction Edge « sms-webhook » : reçoit les SMS transférés par l'application
// « SMS Forwarder » installée sur le téléphone qui reçoit les paiements Mobile Money.
// Adresse à configurer dans l'application :
//   https://<projet>.supabase.co/functions/v1/sms-webhook?token=<jeton affiché dans l'admin>
// Corps JSON attendu (modèle par défaut de l'application) :
//   { "from": "%from%", "text": "%text%", "sentStamp": %sentStamp%, "receivedStamp": %receivedStamp%, "sim": "%sim%" }
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const token = new URL(req.url).searchParams.get('token') ?? req.headers.get('x-drivest-token') ?? '';

  const payload = await req.json().catch(() => null) as
    | { from?: string; text?: string; sim?: string; sentStamp?: number | string }
    | null;
  if (!payload?.text) return json({ error: 'SMS vide' }, 400);

  const { data, error } = await supabase.rpc('receive_sms', {
    p_token: token,
    p_sender: String(payload.from ?? ''),
    p_body: String(payload.text),
    p_sim: payload.sim ? String(payload.sim) : null,
    p_sent_ms: Number(payload.sentStamp) || 0,
  });
  if (error) {
    const unauthorized = /Jeton invalide/.test(error.message);
    return json({ error: unauthorized ? 'Jeton invalide' : 'Erreur serveur' }, unauthorized ? 401 : 500);
  }
  return json({ ok: true, status: data });
});
