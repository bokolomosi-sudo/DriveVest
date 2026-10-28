-- =============================================================================
-- Inscription par numéro de téléphone + mot de passe (sans e-mail ni SMS).
-- Le frontend crée l'utilisateur avec l'identifiant technique
-- « <numéro>@telephone.drivest.app » : il n'est pas un e-mail réel et n'est
-- donc pas copié dans profiles.email. Le numéro est stocké dans profiles.phone.
-- Prérequis côté Supabase : Authentication > Sign In / Providers > Email >
-- « Confirm email » désactivé.
-- =============================================================================

create or replace function public.is_phone_login_email(p_email text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_email like '%@telephone.drivest.app', false);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid;
begin
  select id into v_referrer from public.profiles
    where referral_code = upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  insert into public.profiles (id, email, full_name, phone, referred_by)
  values (
    new.id,
    case when public.is_phone_login_email(new.email) then null else new.email end,
    left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
      case when public.is_phone_login_email(new.email) then split_part(new.email, '@', 1) end
    ), 30),
    v_referrer
  );
  insert into public.user_roles (user_id, role) values (new.id, 'client');
  return new;
end;
$$;

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
    set email = case when public.is_phone_login_email(new.email) then null else new.email end
    where id = new.id;
  return new;
end;
$$;

create index if not exists profiles_phone_idx on public.profiles (phone);

revoke execute on function public.is_phone_login_email(text), public.handle_new_user(), public.handle_user_email_change()
  from public, anon, authenticated;
