-- Crochet « Send SMS » sans envoi : remplace le fournisseur SMS (Twilio…) exigé
-- pour activer la connexion par téléphone. Les confirmations par SMS étant
-- désactivées, Supabase n'appelle pas ce crochet ; s'il l'était, aucun SMS ne part.
-- À activer dans Authentication > Auth Hooks > Send SMS hook (type Postgres).
create or replace function public.drivest_send_sms_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return '{}'::jsonb;
end;
$$;

grant execute on function public.drivest_send_sms_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.drivest_send_sms_hook(jsonb) from public, anon, authenticated;
