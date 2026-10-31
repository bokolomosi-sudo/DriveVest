-- Clés VAPID rangées dans push_settings (table lisible uniquement par le serveur).
-- La fonction Edge send-push les crée elle-même au premier lancement : la clé privée
-- ne quitte jamais le serveur. Le site lit seulement la clé publique.
alter table public.push_settings
  add column if not exists vapid_public_key text,
  add column if not exists vapid_private_key text,
  add column if not exists vapid_subject text;

revoke all on public.push_settings from anon, authenticated;

create or replace function public.get_push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select vapid_public_key from public.push_settings where id = 1;
$$;
revoke execute on function public.get_push_public_key() from public, anon;
grant execute on function public.get_push_public_key() to authenticated;
