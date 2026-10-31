-- Un numéro de téléphone = un seul compte à l'inscription.
-- Le numéro de retrait, lui, peut être partagé entre plusieurs comptes.

-- -- Retrait : on retire l'unicité du numéro -----------------------------------
drop index if exists public.withdrawal_accounts_number_unique;

create or replace function public.set_withdrawal_account(p_network text, p_holder_name text, p_number text, p_password text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  perform public.assert_feature('wallet');
  if exists (select 1 from public.withdrawal_accounts where user_id = v_uid) then
    raise exception 'Votre portefeuille de retrait est déjà configuré. Contactez le service client pour le modifier.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.withdrawal_networks where name = p_network and is_active) then
    raise exception 'Choisissez un réseau de retrait dans la liste.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_holder_name, ''))) < 2 then
    raise exception 'Indiquez le nom du titulaire du compte.' using errcode = 'P0001';
  end if;
  if coalesce(p_number, '') !~ '^243[0-9]{9}$' then
    raise exception 'Numéro de téléphone invalide.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_password, '')) < 4 then
    raise exception 'Le mot de passe de retrait doit contenir au moins 4 caractères.' using errcode = 'P0001';
  end if;
  insert into public.withdrawal_accounts (user_id, network, holder_name, airtel_number, password_salt, password_hash)
  values (v_uid, p_network, trim(p_holder_name), p_number, v_salt, public.hash_withdrawal_password(p_password, v_salt));
end;
$$;
revoke execute on function public.set_withdrawal_account(text, text, text, text) from public, anon;
grant execute on function public.set_withdrawal_account(text, text, text, text) to authenticated;

-- -- Inscription : un numéro, un compte ------------------------------------------
-- Supabase refuse déjà deux comptes avec le même numéro, mais seulement s'il est écrit
-- pareil : on impose le format RDC unique 243 + 9 chiffres (bloque +2430971234567, etc.).
create or replace function public.enforce_auth_phone_format()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone is not null and new.phone <> '' and new.phone !~ '^243[0-9]{9}$' then
    raise exception 'Numéro de téléphone invalide : utilisez un numéro de RDC (ex. 0971234567).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_auth_phone_format() from public, anon, authenticated;

drop trigger if exists auth_users_phone_format on auth.users;
create trigger auth_users_phone_format before insert or update of phone on auth.users
  for each row execute function public.enforce_auth_phone_format();

-- Le numéro du profil est aussi unique (créé seulement si aucun doublon n'existe déjà)
do $$
begin
  if not exists (
    select 1 from public.profiles where phone is not null group by phone having count(*) > 1
  ) then
    execute 'create unique index if not exists profiles_phone_unique on public.profiles (phone) where phone is not null';
  else
    raise notice 'Doublons de numéros dans profiles : index unique non créé, à traiter manuellement.';
  end if;
end $$;
