-- =============================================================================
-- Bonus d'inscription, portefeuille de retrait Airtel Money avec mot de passe
-- de retrait, et suppression de la vérification d'identité.
-- =============================================================================

-- -- Bonus d'inscription (montant modifiable par l'administration) ----------
alter table public.platform_settings
  add column signup_bonus numeric(14, 2) not null default 100 check (signup_bonus >= 0);
grant update (signup_bonus) on public.platform_settings to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid;
  v_settings public.platform_settings;
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

  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.feature_wallet and v_settings.signup_bonus > 0 then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
    values (new.id, 'adjustment', v_settings.signup_bonus, 'CDF', 'confirmed', public.new_transaction_reference(),
            'Bonus d''inscription', true, 'credit');
  end if;
  return new;
end;
$$;

-- -- Identité : plus exigée ---------------------------------------------------
update public.platform_settings set withdrawal_requires_kyc = false, investment_requires_kyc = false where id = 1;
revoke execute on function public.submit_kyc(text, text, text), public.admin_review_kyc(uuid, boolean, text) from authenticated;

-- -- Portefeuille de retrait ---------------------------------------------------
create table public.withdrawal_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  holder_name text not null check (char_length(trim(holder_name)) between 2 and 120),
  airtel_number text not null check (airtel_number ~ '^243[0-9]{9}$'),
  password_salt text not null,
  password_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger withdrawal_accounts_updated_at before update on public.withdrawal_accounts
  for each row execute function public.set_updated_at();
-- Aucune lecture directe : le mot de passe haché ne sort jamais de la base
alter table public.withdrawal_accounts enable row level security;
revoke all on public.withdrawal_accounts from anon, authenticated;

create or replace function public.hash_withdrawal_password(p_password text, p_salt text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_salt || ':' || p_password, 'UTF8')), 'hex');
$$;

create or replace function public.set_withdrawal_account(p_holder_name text, p_airtel_number text, p_password text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  perform public.assert_feature('wallet');
  if exists (select 1 from public.withdrawal_accounts where user_id = v_uid) then
    raise exception 'Votre portefeuille de retrait est déjà configuré. Contactez le service client pour le modifier.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_holder_name, ''))) < 2 then
    raise exception 'Indiquez le nom du titulaire du compte Airtel Money.' using errcode = 'P0001';
  end if;
  if coalesce(p_airtel_number, '') !~ '^243[0-9]{9}$' then
    raise exception 'Numéro Airtel Money invalide.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_password, '')) < 4 then
    raise exception 'Le mot de passe de retrait doit contenir au moins 4 caractères.' using errcode = 'P0001';
  end if;
  insert into public.withdrawal_accounts (user_id, holder_name, airtel_number, password_salt, password_hash)
  values (v_uid, trim(p_holder_name), p_airtel_number, v_salt, public.hash_withdrawal_password(p_password, v_salt));
end;
$$;

create or replace function public.get_my_withdrawal_account()
returns table (holder_name text, airtel_number text)
language sql stable security definer set search_path = public as $$
  select a.holder_name, a.airtel_number from public.withdrawal_accounts a where a.user_id = auth.uid();
$$;

-- -- Retrait avec mot de passe de retrait --------------------------------------
-- Mot de passe incorrect : la fonction renvoie NULL (sans lever d'erreur, pour
-- que le compteur d'essais soit enregistré). 5 erreurs = blocage 15 minutes.
create or replace function public.request_withdrawal_with_password(p_amount numeric, p_password text, p_idempotency_key uuid)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_account public.withdrawal_accounts;
  v_settings public.platform_settings;
  v_tx public.transactions;
  v_fee numeric;
begin
  perform public.assert_feature('wallet');
  if p_idempotency_key is null then
    raise exception 'Requête invalide.' using errcode = '22023';
  end if;
  select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_tx;
  end if;

  select * into v_account from public.withdrawal_accounts where user_id = v_uid for update;
  if not found then
    raise exception 'Configurez d''abord votre portefeuille de retrait.' using errcode = 'P0001';
  end if;
  if v_account.locked_until is not null and v_account.locked_until > now() then
    raise exception 'Trop d''essais incorrects. Réessayez après %.', to_char(v_account.locked_until at time zone 'Africa/Kinshasa', 'HH24:MI') using errcode = 'P0001';
  end if;
  if public.hash_withdrawal_password(coalesce(p_password, ''), v_account.password_salt) <> v_account.password_hash then
    update public.withdrawal_accounts
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where user_id = v_uid;
    return null;
  end if;
  update public.withdrawal_accounts set failed_attempts = 0, locked_until = null where user_id = v_uid;

  select * into v_settings from public.platform_settings where id = 1;
  if p_amount is null or p_amount <= 0 or p_amount < v_settings.min_withdrawal then
    raise exception 'Montant invalide (minimum : % FC).', v_settings.min_withdrawal using errcode = 'P0001';
  end if;

  perform public.wallet_lock(v_uid);
  v_fee := round(p_amount * v_settings.withdrawal_fee_percent / 100 + v_settings.withdrawal_fee_fixed, 2);
  if public.wallet_available(v_uid, 'CDF') < p_amount + v_fee then
    raise exception 'Solde insuffisant (montant % FC + frais % FC).', p_amount, v_fee using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                   method, destination, idempotency_key)
  values (v_uid, 'withdrawal', p_amount, 'CDF', 'pending', public.new_transaction_reference(),
          'Retrait vers Airtel Money', true, 'debit', 'Airtel Money',
          '+' || v_account.airtel_number || ' — ' || v_account.holder_name, p_idempotency_key)
  returning * into v_tx;

  if v_fee > 0 then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, related_transaction_id)
    values (v_uid, 'fee', v_fee, 'CDF', 'pending', public.new_transaction_reference(), 'Frais de retrait', true, 'debit', v_tx.id);
  end if;
  return v_tx;
end;
$$;

-- -- Traitement admin : confirmer ou refuser (motif obligatoire) ---------------
create or replace function public.admin_process_withdrawal(
  p_transaction_id uuid, p_approve boolean, p_reason text default null, p_payout_reference text default null
)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_tx public.transactions;
  v_status public.transaction_status;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or v_tx.type <> 'withdrawal' then
    raise exception 'Retrait introuvable.' using errcode = 'P0001';
  end if;
  if v_tx.status <> 'pending' then
    raise exception 'Ce retrait a déjà été traité.' using errcode = 'P0001';
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'Un motif de refus est obligatoire.' using errcode = 'P0001';
  end if;

  v_status := case when p_approve then 'confirmed' else 'rejected' end;
  update public.transactions
    set status = v_status,
        external_reference = case when p_approve then nullif(trim(p_payout_reference), '') else external_reference end,
        rejection_reason = case when p_approve then null else trim(p_reason) end,
        admin_id = v_admin
    where (id = p_transaction_id or related_transaction_id = p_transaction_id) and status = 'pending';
  select * into v_tx from public.transactions where id = p_transaction_id;

  perform public.log_audit(case when p_approve then 'withdrawal.pay' else 'withdrawal.reject' end, 'transactions',
    p_transaction_id::text, jsonb_build_object('user_id', v_tx.user_id, 'amount', v_tx.amount, 'reason', p_reason));
  perform public.notify_user(v_tx.user_id,
    case when p_approve then 'Retrait effectué' else 'Retrait refusé' end,
    case when p_approve then format('Votre retrait de %s FC a été envoyé sur votre compte Airtel Money.', v_tx.amount)
         else format('Votre retrait de %s FC a été refusé : %s. Le montant est de nouveau disponible.', v_tx.amount, trim(p_reason)) end,
    '/compte/portefeuille');
  return v_tx;
end;
$$;

revoke execute on function
  public.hash_withdrawal_password(text, text),
  public.set_withdrawal_account(text, text, text),
  public.get_my_withdrawal_account(),
  public.request_withdrawal_with_password(numeric, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.set_withdrawal_account(text, text, text),
  public.get_my_withdrawal_account(),
  public.request_withdrawal_with_password(numeric, text, uuid)
to authenticated;
-- L'ancien retrait sans mot de passe n'est plus utilisable
revoke execute on function public.request_withdrawal(numeric, text, text, text, uuid) from authenticated;
