-- =============================================================================
-- DRIVEST — Modules financiers : portefeuille, investissement automobile,
-- parrainage et vérification d'identité.
--
-- L'exploitant déclare disposer du cadre juridique et de l'autorisation
-- requise ; les références (entité, autorité, numéro d'agrément) sont saisies
-- dans platform_settings et affichées publiquement.
--
-- Principes conservés :
--   - le solde n'est jamais un champ modifiable : il est calculé à partir du
--     grand livre (transactions) ;
--   - un dépôt n'est crédité qu'après vérification par un administrateur ;
--   - une distribution de revenus exige la description de leur origine réelle ;
--   - toute opération administrative est journalisée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Paramètres : activation des modules et références réglementaires
-- -----------------------------------------------------------------------------
alter table public.platform_settings
  drop constraint wallet_locked,
  drop constraint investment_locked,
  drop constraint referral_locked;

alter table public.platform_settings
  add column legal_entity_name text,
  add column registration_number text,
  add column regulatory_authority text,
  add column license_number text,
  add column deposit_instructions text,
  add column min_deposit numeric(14, 2) not null default 0 check (min_deposit >= 0),
  add column min_withdrawal numeric(14, 2) not null default 0 check (min_withdrawal >= 0),
  add column withdrawal_fee_percent numeric(5, 2) not null default 0 check (withdrawal_fee_percent between 0 and 100),
  add column withdrawal_fee_fixed numeric(14, 2) not null default 0 check (withdrawal_fee_fixed >= 0),
  add column withdrawal_requires_kyc boolean not null default true,
  add column investment_requires_kyc boolean not null default true,
  add column referral_commission_percent numeric(5, 2) not null default 0 check (referral_commission_percent between 0 and 100),
  add column referral_on_orders boolean not null default false,
  add column referral_on_investments boolean not null default false;

update public.platform_settings
  set feature_wallet = true, feature_investment = true, feature_referral = true
  where id = 1;

grant update (feature_wallet, feature_investment, feature_referral, legal_entity_name, registration_number,
  regulatory_authority, license_number, deposit_instructions, min_deposit, min_withdrawal,
  withdrawal_fee_percent, withdrawal_fee_fixed, withdrawal_requires_kyc, investment_requires_kyc,
  referral_commission_percent, referral_on_orders, referral_on_investments)
  on public.platform_settings to authenticated;

create or replace function public.assert_feature(p_feature text)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_enabled boolean;
begin
  select case p_feature
           when 'wallet' then feature_wallet
           when 'investment' then feature_investment
           when 'referral' then feature_referral
         end
    into v_enabled
  from public.platform_settings where id = 1;
  if not coalesce(v_enabled, false) then
    raise exception 'Ce module est actuellement désactivé.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Profils : vérification d'identité et parrainage
-- -----------------------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.profiles
  add column referral_code text unique,
  add column referred_by uuid references public.profiles (id) on delete set null,
  add column kyc_status text not null default 'none' check (kyc_status in ('none', 'pending', 'verified', 'rejected')),
  add column kyc_document_type text,
  add column kyc_document_number text,
  add column kyc_document_path text,
  add column kyc_submitted_at timestamptz,
  add column kyc_reviewed_at timestamptz,
  add column kyc_rejection_reason text;

update public.profiles set referral_code = public.generate_referral_code() where referral_code is null;
alter table public.profiles alter column referral_code set default public.generate_referral_code();
alter table public.profiles alter column referral_code set not null;
create index profiles_referred_by_idx on public.profiles (referred_by);
create index profiles_kyc_status_idx on public.profiles (kyc_status);

-- Inscription : rattachement au parrain si un code valide est fourni
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
    new.email,
    left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    left(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), 30),
    v_referrer
  );
  insert into public.user_roles (user_id, role) values (new.id, 'client');
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Grand livre : nouveaux types et colonnes portefeuille
-- -----------------------------------------------------------------------------
alter type public.transaction_type rename to transaction_type_v1;
create type public.transaction_type as enum (
  'order_payment', 'refund', 'deposit', 'withdrawal', 'fee', 'adjustment',
  'investment', 'distribution', 'capital_return', 'referral_commission'
);
alter table public.transactions
  alter column type type public.transaction_type using type::text::public.transaction_type;
drop type public.transaction_type_v1;

-- -----------------------------------------------------------------------------
-- 4. Investissement automobile
-- -----------------------------------------------------------------------------
create type public.investment_offer_status as enum ('draft', 'open', 'closed', 'active', 'completed', 'cancelled');
create type public.participation_status as enum ('active', 'exited', 'completed', 'refunded');

create table public.investment_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  summary text check (char_length(summary) <= 1000),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  legal_nature text,
  platform_role text,
  asset_description text,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  min_amount numeric(14, 2) not null check (min_amount > 0),
  max_amount numeric(14, 2) check (max_amount is null or max_amount > 0),
  target_amount numeric(14, 2) check (target_amount is null or target_amount > 0),
  duration_months integer not null check (duration_months > 0),
  participant_rights text,
  fees_description text,
  entry_fee_percent numeric(5, 2) not null default 0 check (entry_fee_percent between 0 and 100),
  return_calculation text,
  indicative_annual_rate numeric(6, 2) check (indicative_annual_rate is null or indicative_annual_rate >= 0),
  risks text,
  exit_conditions text,
  refund_conditions text,
  withdrawal_conditions text,
  regulatory_notes text,
  contract_document_path text,
  contract_version text not null default '1',
  status public.investment_offer_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint max_not_below_min check (max_amount is null or max_amount >= min_amount),
  -- Une offre ne peut quitter l'état brouillon que si toutes ses conditions sont rédigées
  constraint terms_required_unless_draft check (
    status = 'draft' or (
      coalesce(trim(legal_nature), '') <> '' and coalesce(trim(platform_role), '') <> ''
      and coalesce(trim(asset_description), '') <> '' and coalesce(trim(participant_rights), '') <> ''
      and coalesce(trim(fees_description), '') <> '' and coalesce(trim(return_calculation), '') <> ''
      and coalesce(trim(risks), '') <> '' and coalesce(trim(exit_conditions), '') <> ''
      and coalesce(trim(refund_conditions), '') <> '' and coalesce(trim(withdrawal_conditions), '') <> ''
    )
  )
);
create index investment_offers_status_idx on public.investment_offers (status, created_at desc);
create trigger investment_offers_updated_at before update on public.investment_offers
  for each row execute function public.set_updated_at();
create trigger investment_offers_audit after insert or update or delete on public.investment_offers
  for each row execute function public.audit_row_change();

create table public.investment_participations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.investment_offers (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  entry_fee numeric(14, 2) not null default 0 check (entry_fee >= 0),
  currency char(3) not null,
  status public.participation_status not null default 'active',
  contract_version text not null,
  terms_accepted_at timestamptz not null,
  exit_amount numeric(14, 2),
  exited_at timestamptz,
  note text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index investment_participations_offer_idx on public.investment_participations (offer_id, status);
create index investment_participations_user_idx on public.investment_participations (user_id, created_at desc);

create table public.investment_distributions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.investment_offers (id) on delete restrict,
  period_label text not null check (char_length(period_label) between 2 and 80),
  declared_amount numeric(14, 2) not null check (declared_amount > 0),
  distributed_amount numeric(14, 2) not null default 0,
  currency char(3) not null,
  revenue_source text not null check (char_length(revenue_source) >= 10),
  justification_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index investment_distributions_offer_idx on public.investment_distributions (offer_id, created_at desc);

-- Protection des offres : clôture / annulation uniquement via les fonctions dédiées
create or replace function public.investment_offers_guard()
returns trigger language plpgsql as $$
declare
  v_internal boolean := coalesce(current_setting('drivest.internal', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status in ('completed', 'cancelled') then
      raise exception 'Statut initial invalide.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if v_internal then
    return new;
  end if;
  if old.status in ('completed', 'cancelled') then
    raise exception 'Offre clôturée : modification impossible.' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
    raise exception 'Utilisez les actions « Restituer le capital » ou « Annuler l''offre ».' using errcode = 'P0001';
  end if;
  if (new.currency, new.min_amount, new.entry_fee_percent) is distinct from (old.currency, old.min_amount, old.entry_fee_percent)
     and exists (select 1 from public.investment_participations where offer_id = old.id) then
    raise exception 'Des participations existent : devise, minimum et frais d''entrée ne sont plus modifiables.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger investment_offers_guard before insert or update on public.investment_offers
  for each row execute function public.investment_offers_guard();

-- Colonnes portefeuille sur le grand livre
alter table public.transactions
  add column wallet boolean not null default false,
  add column direction text not null default 'credit' check (direction in ('credit', 'debit')),
  add column method text,
  add column external_reference text,
  add column proof_path text,
  add column destination text,
  add column rejection_reason text,
  add column idempotency_key uuid,
  add column related_transaction_id uuid references public.transactions (id) on delete restrict,
  add column offer_id uuid references public.investment_offers (id) on delete restrict,
  add column participation_id uuid references public.investment_participations (id) on delete restrict,
  add column distribution_id uuid references public.investment_distributions (id) on delete restrict;

update public.transactions set direction = 'debit' where type = 'order_payment';

create index transactions_wallet_idx on public.transactions (user_id, currency) where wallet;
create index transactions_type_status_idx on public.transactions (type, status, created_at);
create unique index transactions_idempotency_uniq on public.transactions (user_id, idempotency_key)
  where idempotency_key is not null;
create unique index transactions_deposit_reference_uniq on public.transactions (lower(method), lower(external_reference))
  where type = 'deposit' and status <> 'rejected';

-- -----------------------------------------------------------------------------
-- 5. Parrainage
-- -----------------------------------------------------------------------------
create table public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete restrict,
  referred_id uuid not null references public.profiles (id) on delete restrict,
  source_type text not null check (source_type in ('order', 'investment')),
  source_id uuid not null,
  base_amount numeric(14, 2) not null,
  rate numeric(5, 2) not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null,
  transaction_id uuid references public.transactions (id) on delete restrict,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index referral_commissions_referrer_idx on public.referral_commissions (referrer_id, created_at desc);

-- =============================================================================
-- Fonctions du portefeuille
-- =============================================================================
create or replace function public.wallet_lock(p_user uuid)
returns void language sql security definer set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended('wallet:' || p_user::text, 0));
$$;

-- Disponible = crédits confirmés - débits confirmés - débits en attente (retraits bloqués)
create or replace function public.wallet_available(p_user uuid, p_currency text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case
      when t.status = 'confirmed' and t.direction = 'credit' then t.amount
      when t.status in ('confirmed', 'pending') and t.direction = 'debit' then -t.amount
      else 0 end), 0)
  from public.transactions t
  where t.user_id = p_user and t.wallet and t.currency = p_currency;
$$;

create or replace function public.wallet_balances_for(p_user uuid)
returns table (currency text, available numeric, pending_in numeric, pending_out numeric, invested numeric)
language sql stable security definer set search_path = public as $$
  with currencies as (
    select t.currency::text as c from public.transactions t where t.user_id = p_user and t.wallet
    union
    select p.currency::text from public.investment_participations p where p.user_id = p_user and p.status = 'active'
  )
  select
    cu.c,
    public.wallet_available(p_user, cu.c),
    coalesce((select sum(t.amount) from public.transactions t
              where t.user_id = p_user and t.wallet and t.currency = cu.c and t.status = 'pending' and t.direction = 'credit'), 0),
    coalesce((select sum(t.amount) from public.transactions t
              where t.user_id = p_user and t.wallet and t.currency = cu.c and t.status = 'pending' and t.direction = 'debit'), 0),
    coalesce((select sum(p.amount) from public.investment_participations p
              where p.user_id = p_user and p.currency = cu.c and p.status = 'active'), 0)
  from currencies cu
  order by cu.c;
$$;

create or replace function public.my_wallet_balances()
returns table (currency text, available numeric, pending_in numeric, pending_out numeric, invested numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '28000';
  end if;
  return query select * from public.wallet_balances_for(auth.uid());
end;
$$;

create or replace function public.admin_wallet_balances(p_user uuid)
returns table (currency text, available numeric, pending_in numeric, pending_out numeric, invested numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query select * from public.wallet_balances_for(p_user);
end;
$$;

-- -- Dépôt : déclaration par le client, crédit après vérification ---------------
create or replace function public.request_deposit(
  p_amount numeric, p_currency text, p_method text, p_reference text,
  p_proof_path text, p_idempotency_key uuid
)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_settings public.platform_settings;
  v_tx public.transactions;
  v_currency text := upper(trim(coalesce(p_currency, '')));
begin
  perform public.assert_feature('wallet');
  if p_idempotency_key is null then
    raise exception 'Requête invalide.' using errcode = '22023';
  end if;
  select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_tx;
  end if;

  select * into v_settings from public.platform_settings where id = 1;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount < v_settings.min_deposit then
    raise exception 'Montant invalide (minimum : % %).', v_settings.min_deposit, v_currency using errcode = 'P0001';
  end if;
  if coalesce(trim(p_method), '') = '' or char_length(trim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Le moyen de paiement et la référence de transaction sont obligatoires.' using errcode = 'P0001';
  end if;
  if p_proof_path is not null and p_proof_path not like v_uid::text || '/%' then
    raise exception 'Justificatif invalide.' using errcode = 'P0001';
  end if;

  begin
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                     method, external_reference, proof_path, idempotency_key)
    values (v_uid, 'deposit', p_amount, v_currency, 'pending', public.new_transaction_reference(),
            'Dépôt sur le portefeuille', true, 'credit', trim(p_method), trim(p_reference), p_proof_path, p_idempotency_key)
    returning * into v_tx;
  exception when unique_violation then
    raise exception 'Cette référence de paiement a déjà été déclarée.' using errcode = 'P0001';
  end;
  return v_tx;
end;
$$;

create or replace function public.admin_review_deposit(p_transaction_id uuid, p_approve boolean, p_reason text default null)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or v_tx.type <> 'deposit' then
    raise exception 'Dépôt introuvable.' using errcode = 'P0001';
  end if;
  if v_tx.status <> 'pending' then
    raise exception 'Ce dépôt a déjà été traité.' using errcode = 'P0001';
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'Un motif de refus est obligatoire.' using errcode = 'P0001';
  end if;

  update public.transactions
    set status = case when p_approve then 'confirmed'::public.transaction_status else 'rejected'::public.transaction_status end,
        rejection_reason = case when p_approve then null else trim(p_reason) end,
        admin_id = v_admin
    where id = p_transaction_id
    returning * into v_tx;

  perform public.log_audit(case when p_approve then 'deposit.confirm' else 'deposit.reject' end, 'transactions',
    p_transaction_id::text, jsonb_build_object('user_id', v_tx.user_id, 'amount', v_tx.amount, 'currency', v_tx.currency, 'reason', p_reason));
  perform public.notify_user(v_tx.user_id,
    case when p_approve then 'Dépôt crédité' else 'Dépôt refusé' end,
    case when p_approve then format('Votre dépôt de %s %s a été vérifié et crédité.', v_tx.amount, v_tx.currency)
         else format('Votre dépôt de %s %s a été refusé : %s', v_tx.amount, v_tx.currency, trim(p_reason)) end,
    '/compte/portefeuille');
  return v_tx;
end;
$$;

-- -- Retrait : fonds bloqués dès la demande, versés après traitement -----------
create or replace function public.request_withdrawal(
  p_amount numeric, p_currency text, p_method text, p_destination text, p_idempotency_key uuid
)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_settings public.platform_settings;
  v_kyc text;
  v_tx public.transactions;
  v_fee numeric;
  v_currency text := upper(trim(coalesce(p_currency, '')));
begin
  perform public.assert_feature('wallet');
  if p_idempotency_key is null then
    raise exception 'Requête invalide.' using errcode = '22023';
  end if;
  select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_tx;
  end if;

  select * into v_settings from public.platform_settings where id = 1;
  select kyc_status into v_kyc from public.profiles where id = v_uid;
  if v_settings.withdrawal_requires_kyc and v_kyc <> 'verified' then
    raise exception 'Vérification d''identité requise avant tout retrait.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount < v_settings.min_withdrawal then
    raise exception 'Montant invalide (minimum : % %).', v_settings.min_withdrawal, v_currency using errcode = 'P0001';
  end if;
  if coalesce(trim(p_method), '') = '' or char_length(trim(coalesce(p_destination, ''))) < 3 then
    raise exception 'Le moyen de retrait et le compte de destination sont obligatoires.' using errcode = 'P0001';
  end if;

  perform public.wallet_lock(v_uid);
  v_fee := round(p_amount * v_settings.withdrawal_fee_percent / 100 + v_settings.withdrawal_fee_fixed, 2);
  if public.wallet_available(v_uid, v_currency) < p_amount + v_fee then
    raise exception 'Solde disponible insuffisant (montant % + frais % %).', p_amount, v_fee, v_currency using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                   method, destination, idempotency_key)
  values (v_uid, 'withdrawal', p_amount, v_currency, 'pending', public.new_transaction_reference(),
          'Retrait du portefeuille', true, 'debit', trim(p_method), trim(p_destination), p_idempotency_key)
  returning * into v_tx;

  if v_fee > 0 then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, related_transaction_id)
    values (v_uid, 'fee', v_fee, v_currency, 'pending', public.new_transaction_reference(),
            'Frais de retrait', true, 'debit', v_tx.id);
  end if;
  return v_tx;
end;
$$;

create or replace function public.cancel_my_withdrawal(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_transaction_id and user_id = v_uid for update;
  if not found or v_tx.type <> 'withdrawal' or v_tx.status <> 'pending' then
    raise exception 'Ce retrait ne peut plus être annulé.' using errcode = 'P0001';
  end if;
  update public.transactions set status = 'cancelled'
    where (id = p_transaction_id or related_transaction_id = p_transaction_id) and status = 'pending';
end;
$$;

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
  if p_approve and char_length(trim(coalesce(p_payout_reference, ''))) < 3 then
    raise exception 'La référence du versement effectué est obligatoire.' using errcode = 'P0001';
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'Un motif de refus est obligatoire.' using errcode = 'P0001';
  end if;

  v_status := case when p_approve then 'confirmed' else 'rejected' end;
  update public.transactions
    set status = v_status,
        external_reference = case when p_approve then trim(p_payout_reference) else external_reference end,
        rejection_reason = case when p_approve then null else trim(p_reason) end,
        admin_id = v_admin
    where (id = p_transaction_id or related_transaction_id = p_transaction_id) and status = 'pending';
  select * into v_tx from public.transactions where id = p_transaction_id;

  perform public.log_audit(case when p_approve then 'withdrawal.pay' else 'withdrawal.reject' end, 'transactions',
    p_transaction_id::text, jsonb_build_object('user_id', v_tx.user_id, 'amount', v_tx.amount, 'currency', v_tx.currency,
      'payout_reference', p_payout_reference, 'reason', p_reason));
  perform public.notify_user(v_tx.user_id,
    case when p_approve then 'Retrait effectué' else 'Retrait refusé' end,
    case when p_approve then format('Votre retrait de %s %s a été versé (réf. %s).', v_tx.amount, v_tx.currency, trim(p_payout_reference))
         else format('Votre retrait de %s %s a été refusé : %s. Les fonds sont de nouveau disponibles.', v_tx.amount, v_tx.currency, trim(p_reason)) end,
    '/compte/portefeuille');
  return v_tx;
end;
$$;

-- -- Ajustement administratif justifié ----------------------------------------
create or replace function public.admin_wallet_adjustment(
  p_user uuid, p_amount numeric, p_currency text, p_direction text, p_reason text
)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_tx public.transactions;
  v_currency text := upper(trim(coalesce(p_currency, '')));
begin
  if p_direction not in ('credit', 'debit') then
    raise exception 'Sens invalide.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Montant ou devise invalide.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Un motif détaillé est obligatoire (10 caractères minimum).' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;
  perform public.wallet_lock(p_user);
  if p_direction = 'debit' and public.wallet_available(p_user, v_currency) < p_amount then
    raise exception 'Solde disponible insuffisant pour ce débit.' using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, admin_id)
  values (p_user, 'adjustment', p_amount, v_currency, 'confirmed', public.new_transaction_reference(),
          trim(p_reason), true, p_direction, v_admin)
  returning * into v_tx;

  perform public.log_audit('wallet.adjustment', 'transactions', v_tx.id::text,
    jsonb_build_object('user_id', p_user, 'amount', p_amount, 'currency', v_currency, 'direction', p_direction, 'reason', trim(p_reason)));
  perform public.notify_user(p_user, 'Ajustement de votre portefeuille', trim(p_reason), '/compte/portefeuille');
  return v_tx;
end;
$$;

-- -- Paiement d'une commande depuis le portefeuille ---------------------------
create or replace function public.pay_order_with_wallet(p_order_id uuid)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_order public.orders;
  v_paid numeric;
  v_remaining numeric;
  v_reference text;
  v_payment public.payments;
begin
  perform public.assert_feature('wallet');
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending_confirmation' then
    raise exception 'Cette commande n''attend pas de paiement (ou un paiement est déjà en vérification).' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = p_order_id and status = 'verified';
  v_remaining := v_order.total_amount - v_paid;
  if v_remaining <= 0 then
    raise exception 'Cette commande est déjà réglée.' using errcode = 'P0001';
  end if;

  perform public.wallet_lock(v_uid);
  if public.wallet_available(v_uid, v_order.currency) < v_remaining then
    raise exception 'Solde disponible insuffisant : % % requis.', v_remaining, v_order.currency using errcode = 'P0001';
  end if;

  v_reference := public.new_transaction_reference();
  insert into public.payments (order_id, user_id, amount, currency, method, reference, status, reviewed_at)
  values (p_order_id, v_uid, v_remaining, v_order.currency, 'Portefeuille Drivest', v_reference, 'verified', now())
  returning * into v_payment;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, order_id, payment_id, wallet, direction)
  values (v_uid, 'order_payment', v_remaining, v_order.currency, 'confirmed', v_reference,
          'Paiement de la commande ' || v_order.order_number || ' depuis le portefeuille', v_order.id, v_payment.id, true, 'debit');

  update public.orders set status = 'payment_confirmed' where id = p_order_id;
  perform public.record_order_status(p_order_id, v_order.status, 'payment_confirmed', 'Payée depuis le portefeuille Drivest');
  return v_payment;
end;
$$;

-- =============================================================================
-- Parrainage : commission sur opérations réelles et confirmées uniquement
-- =============================================================================
create or replace function public.grant_referral_commission(
  p_referred uuid, p_base numeric, p_currency text, p_source_type text, p_source_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_settings public.platform_settings;
  v_referrer uuid;
  v_amount numeric;
  v_commission_id uuid;
  v_tx_id uuid;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if not v_settings.feature_referral or v_settings.referral_commission_percent <= 0 then
    return;
  end if;
  if (p_source_type = 'order' and not v_settings.referral_on_orders)
     or (p_source_type = 'investment' and not v_settings.referral_on_investments) then
    return;
  end if;
  select referred_by into v_referrer from public.profiles where id = p_referred;
  if v_referrer is null or exists (select 1 from public.profiles where id = v_referrer and is_blocked) then
    return;
  end if;
  v_amount := round(p_base * v_settings.referral_commission_percent / 100, 2);
  if v_amount <= 0 then
    return;
  end if;

  insert into public.referral_commissions (referrer_id, referred_id, source_type, source_id, base_amount, rate, amount, currency)
  values (v_referrer, p_referred, p_source_type, p_source_id, p_base, v_settings.referral_commission_percent, v_amount, p_currency)
  on conflict (source_type, source_id) do nothing
  returning id into v_commission_id;
  if v_commission_id is null then
    return;
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
  values (v_referrer, 'referral_commission', v_amount, p_currency, 'confirmed', public.new_transaction_reference(),
          'Commission de parrainage', true, 'credit')
  returning id into v_tx_id;
  update public.referral_commissions set transaction_id = v_tx_id where id = v_commission_id;
  perform public.notify_user(v_referrer, 'Commission de parrainage',
    format('Vous avez reçu une commission de %s %s.', v_amount, p_currency), '/compte/parrainage');
end;
$$;

-- Annule les commissions liées à des opérations remboursées
create or replace function public.reverse_referral_commissions(p_source_type text, p_source_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.referral_commissions;
begin
  for r in
    select * from public.referral_commissions
    where source_type = p_source_type and source_id = any (p_source_ids) and reversed_at is null
    for update
  loop
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
    values (r.referrer_id, 'adjustment', r.amount, r.currency, 'confirmed', public.new_transaction_reference(),
            'Annulation de commission de parrainage (opération remboursée)', true, 'debit');
    update public.referral_commissions set reversed_at = now() where id = r.id;
  end loop;
end;
$$;

create or replace function public.payments_referral_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    perform public.grant_referral_commission(new.user_id, new.amount, new.currency, 'order', new.id);
  end if;
  return new;
end;
$$;
create trigger payments_referral after insert or update of status on public.payments
  for each row execute function public.payments_referral_trigger();

create or replace function public.refunds_referral_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.reverse_referral_commissions('order',
      array(select id from public.payments where order_id = new.order_id and status = 'verified'));
  end if;
  return new;
end;
$$;
create trigger refunds_referral after update of status on public.refunds
  for each row execute function public.refunds_referral_trigger();

create or replace function public.my_referrals()
returns table (display_name text, joined_at timestamptz, commissions numeric)
language sql stable security definer set search_path = public as $$
  select
    coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Membre')
      || coalesce(' ' || left(nullif(split_part(p.full_name, ' ', 2), ''), 1) || '.', ''),
    p.created_at,
    coalesce((select sum(c.amount) from public.referral_commissions c
              where c.referred_id = p.id and c.referrer_id = auth.uid() and c.reversed_at is null), 0)
  from public.profiles p
  where p.referred_by = auth.uid()
  order by p.created_at desc;
$$;

-- =============================================================================
-- Vérification d'identité
-- =============================================================================
create or replace function public.submit_kyc(p_document_type text, p_document_number text, p_document_path text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = v_uid for update;
  if v_profile.kyc_status = 'verified' then
    raise exception 'Votre identité est déjà vérifiée.' using errcode = 'P0001';
  end if;
  if v_profile.kyc_status = 'pending' then
    raise exception 'Une vérification est déjà en cours.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_document_type), '') = '' or char_length(trim(coalesce(p_document_number, ''))) < 3 then
    raise exception 'Type et numéro de pièce d''identité obligatoires.' using errcode = 'P0001';
  end if;
  if p_document_path is null or p_document_path not like v_uid::text || '/%' then
    raise exception 'Le document d''identité est obligatoire.' using errcode = 'P0001';
  end if;

  update public.profiles
    set kyc_status = 'pending', kyc_document_type = trim(p_document_type),
        kyc_document_number = trim(p_document_number), kyc_document_path = p_document_path,
        kyc_submitted_at = now(), kyc_reviewed_at = null, kyc_rejection_reason = null
    where id = v_uid
    returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.admin_review_kyc(p_user uuid, p_approve boolean, p_reason text default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user for update;
  if not found or v_profile.kyc_status <> 'pending' then
    raise exception 'Aucune vérification en attente pour cet utilisateur.' using errcode = 'P0001';
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'Un motif de refus est obligatoire.' using errcode = 'P0001';
  end if;
  update public.profiles
    set kyc_status = case when p_approve then 'verified' else 'rejected' end,
        kyc_reviewed_at = now(),
        kyc_rejection_reason = case when p_approve then null else trim(p_reason) end
    where id = p_user
    returning * into v_profile;
  perform public.log_audit(case when p_approve then 'kyc.verify' else 'kyc.reject' end, 'profiles', p_user::text,
    jsonb_build_object('admin', v_admin, 'reason', p_reason));
  perform public.notify_user(p_user,
    case when p_approve then 'Identité vérifiée' else 'Vérification d''identité refusée' end,
    case when p_approve then 'Votre identité a été vérifiée.' else 'Motif : ' || trim(p_reason) end,
    '/compte/identite');
  return v_profile;
end;
$$;

-- =============================================================================
-- Investissement : participation, distributions, sortie, annulation
-- =============================================================================
create or replace function public.offer_progress()
returns table (offer_id uuid, raised numeric, participants bigint)
language sql stable security definer set search_path = public as $$
  select o.id,
         coalesce(sum(p.amount) filter (where p.status = 'active'), 0),
         count(distinct p.user_id) filter (where p.status = 'active')
  from public.investment_offers o
  left join public.investment_participations p on p.offer_id = o.id
  where o.status <> 'draft' or public.is_admin()
  group by o.id;
$$;

create or replace function public.invest(p_offer_id uuid, p_amount numeric, p_accept_terms boolean, p_idempotency_key uuid)
returns public.investment_participations language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_settings public.platform_settings;
  v_kyc text;
  v_offer public.investment_offers;
  v_part public.investment_participations;
  v_user_total numeric;
  v_raised numeric;
  v_fee numeric;
begin
  perform public.assert_feature('investment');
  perform public.assert_feature('wallet');
  if p_idempotency_key is null then
    raise exception 'Requête invalide.' using errcode = '22023';
  end if;
  select * into v_part from public.investment_participations where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_part;
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'Vous devez accepter les conditions contractuelles et les risques de l''offre.' using errcode = 'P0001';
  end if;

  select * into v_settings from public.platform_settings where id = 1;
  select kyc_status into v_kyc from public.profiles where id = v_uid;
  if v_settings.investment_requires_kyc and v_kyc <> 'verified' then
    raise exception 'Vérification d''identité requise avant toute participation.' using errcode = 'P0001';
  end if;

  select * into v_offer from public.investment_offers where id = p_offer_id for update;
  if not found or v_offer.status <> 'open' then
    raise exception 'Cette offre n''est pas ouverte aux participations.' using errcode = 'P0001';
  end if;
  if v_offer.opens_at is not null and now() < v_offer.opens_at then
    raise exception 'Cette offre n''est pas encore ouverte.' using errcode = 'P0001';
  end if;
  if v_offer.closes_at is not null and now() > v_offer.closes_at then
    raise exception 'La période de participation est terminée.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < v_offer.min_amount then
    raise exception 'Montant minimum : % %.', v_offer.min_amount, v_offer.currency using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_user_total from public.investment_participations
    where offer_id = p_offer_id and user_id = v_uid and status = 'active';
  if v_offer.max_amount is not null and v_user_total + p_amount > v_offer.max_amount then
    raise exception 'Montant maximum par participant : % % (déjà engagé : %).', v_offer.max_amount, v_offer.currency, v_user_total using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_raised from public.investment_participations
    where offer_id = p_offer_id and status = 'active';
  if v_offer.target_amount is not null and v_raised + p_amount > v_offer.target_amount then
    raise exception 'Montant restant disponible sur cette offre : % %.', v_offer.target_amount - v_raised, v_offer.currency using errcode = 'P0001';
  end if;

  v_fee := round(p_amount * v_offer.entry_fee_percent / 100, 2);
  perform public.wallet_lock(v_uid);
  if public.wallet_available(v_uid, v_offer.currency) < p_amount + v_fee then
    raise exception 'Solde disponible insuffisant : % % requis (frais d''entrée inclus). Effectuez d''abord un dépôt.',
      p_amount + v_fee, v_offer.currency using errcode = 'P0001';
  end if;

  insert into public.investment_participations (offer_id, user_id, amount, entry_fee, currency, contract_version, terms_accepted_at, idempotency_key)
  values (p_offer_id, v_uid, p_amount, v_fee, v_offer.currency, v_offer.contract_version, now(), p_idempotency_key)
  returning * into v_part;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, offer_id, participation_id)
  values (v_uid, 'investment', p_amount, v_offer.currency, 'confirmed', public.new_transaction_reference(),
          'Participation : ' || v_offer.title, true, 'debit', p_offer_id, v_part.id);
  if v_fee > 0 then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, offer_id, participation_id)
    values (v_uid, 'fee', v_fee, v_offer.currency, 'confirmed', public.new_transaction_reference(),
            'Frais d''entrée : ' || v_offer.title, true, 'debit', p_offer_id, v_part.id);
  end if;

  perform public.grant_referral_commission(v_uid, p_amount, v_offer.currency, 'investment', v_part.id);
  return v_part;
end;
$$;

-- Distribution des revenus réellement perçus, au prorata des participations actives
create or replace function public.admin_distribute(
  p_offer_id uuid, p_total numeric, p_period_label text, p_revenue_source text, p_justification_path text default null
)
returns public.investment_distributions language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_offer public.investment_offers;
  v_base numeric;
  v_share numeric;
  v_sum numeric := 0;
  v_dist public.investment_distributions;
  r public.investment_participations;
begin
  select * into v_offer from public.investment_offers where id = p_offer_id for update;
  if not found or v_offer.status not in ('open', 'closed', 'active') then
    raise exception 'Distribution impossible pour cette offre.' using errcode = 'P0001';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'Montant invalide.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_period_label, ''))) < 2 then
    raise exception 'Indiquez la période concernée.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_revenue_source, ''))) < 10 then
    raise exception 'Décrivez l''origine réelle des revenus distribués (10 caractères minimum).' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_base from public.investment_participations
    where offer_id = p_offer_id and status = 'active';
  if v_base <= 0 then
    raise exception 'Aucune participation active sur cette offre.' using errcode = 'P0001';
  end if;

  insert into public.investment_distributions (offer_id, period_label, declared_amount, currency, revenue_source, justification_path, created_by)
  values (p_offer_id, trim(p_period_label), p_total, v_offer.currency, trim(p_revenue_source), p_justification_path, v_admin)
  returning * into v_dist;

  for r in select * from public.investment_participations where offer_id = p_offer_id and status = 'active' loop
    v_share := round(p_total * r.amount / v_base, 2);
    if v_share > 0 then
      insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                       offer_id, participation_id, distribution_id, admin_id)
      values (r.user_id, 'distribution', v_share, v_offer.currency, 'confirmed', public.new_transaction_reference(),
              'Revenus ' || trim(p_period_label) || ' : ' || v_offer.title, true, 'credit', p_offer_id, r.id, v_dist.id, v_admin);
      v_sum := v_sum + v_share;
      perform public.notify_user(r.user_id, 'Revenus distribués',
        format('%s %s versés pour « %s » (%s).', v_share, v_offer.currency, v_offer.title, trim(p_period_label)),
        '/compte/investissements');
    end if;
  end loop;

  update public.investment_distributions set distributed_amount = v_sum where id = v_dist.id returning * into v_dist;
  perform public.log_audit('investment.distribute', 'investment_offers', p_offer_id::text,
    jsonb_build_object('distribution_id', v_dist.id, 'declared', p_total, 'distributed', v_sum,
      'period', p_period_label, 'revenue_source', p_revenue_source));
  return v_dist;
end;
$$;

-- Fin de l'opération : restitution d'un pourcentage du capital (perte possible)
create or replace function public.admin_return_capital(p_offer_id uuid, p_percent numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_offer public.investment_offers;
  v_back numeric;
  r public.investment_participations;
begin
  select * into v_offer from public.investment_offers where id = p_offer_id for update;
  if not found or v_offer.status in ('draft', 'completed', 'cancelled') then
    raise exception 'Clôture impossible pour cette offre.' using errcode = 'P0001';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'Le pourcentage restitué doit être compris entre 0 et 100.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Un compte rendu de clôture est obligatoire (10 caractères minimum).' using errcode = 'P0001';
  end if;

  for r in select * from public.investment_participations where offer_id = p_offer_id and status = 'active' for update loop
    v_back := round(r.amount * p_percent / 100, 2);
    if v_back > 0 then
      insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                       offer_id, participation_id, admin_id)
      values (r.user_id, 'capital_return', v_back, r.currency, 'confirmed', public.new_transaction_reference(),
              'Restitution du capital : ' || v_offer.title, true, 'credit', p_offer_id, r.id, v_admin);
    end if;
    update public.investment_participations
      set status = 'completed', exit_amount = v_back, exited_at = now(), note = trim(p_note)
      where id = r.id;
    perform public.notify_user(r.user_id, 'Opération clôturée',
      format('« %s » est clôturée : %s %s restitués. %s', v_offer.title, v_back, r.currency, trim(p_note)),
      '/compte/investissements');
  end loop;

  perform set_config('drivest.internal', 'on', true);
  update public.investment_offers set status = 'completed' where id = p_offer_id;
  perform set_config('drivest.internal', 'off', true);
  perform public.log_audit('investment.complete', 'investment_offers', p_offer_id::text,
    jsonb_build_object('percent_returned', p_percent, 'note', p_note));
end;
$$;

-- Sortie anticipée d'une participation selon les conditions de sortie de l'offre
create or replace function public.admin_exit_participation(p_participation_id uuid, p_amount numeric, p_note text)
returns public.investment_participations language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_part public.investment_participations;
begin
  select * into v_part from public.investment_participations where id = p_participation_id for update;
  if not found or v_part.status <> 'active' then
    raise exception 'Participation introuvable ou déjà clôturée.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > v_part.amount then
    raise exception 'Le montant restitué doit être compris entre 0 et %.', v_part.amount using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Un motif détaillé est obligatoire (10 caractères minimum).' using errcode = 'P0001';
  end if;
  if p_amount > 0 then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                     offer_id, participation_id, admin_id)
    values (v_part.user_id, 'capital_return', p_amount, v_part.currency, 'confirmed', public.new_transaction_reference(),
            'Sortie anticipée', true, 'credit', v_part.offer_id, v_part.id, v_admin);
  end if;
  update public.investment_participations
    set status = 'exited', exit_amount = p_amount, exited_at = now(), note = trim(p_note)
    where id = p_participation_id
    returning * into v_part;
  perform public.log_audit('investment.exit', 'investment_participations', p_participation_id::text,
    jsonb_build_object('amount', p_amount, 'note', p_note));
  perform public.notify_user(v_part.user_id, 'Sortie de participation',
    format('Votre participation a été clôturée : %s %s restitués.', p_amount, v_part.currency), '/compte/investissements');
  return v_part;
end;
$$;

-- Annulation : remboursement intégral (capital + frais d'entrée)
create or replace function public.admin_cancel_offer(p_offer_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_offer public.investment_offers;
  v_ids uuid[];
  r public.investment_participations;
begin
  select * into v_offer from public.investment_offers where id = p_offer_id for update;
  if not found or v_offer.status in ('completed', 'cancelled') then
    raise exception 'Annulation impossible pour cette offre.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Un motif détaillé est obligatoire (10 caractères minimum).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.investment_distributions where offer_id = p_offer_id) then
    raise exception 'Des revenus ont déjà été distribués : utilisez la clôture avec restitution du capital.' using errcode = 'P0001';
  end if;

  for r in select * from public.investment_participations where offer_id = p_offer_id and status = 'active' for update loop
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                     offer_id, participation_id, admin_id)
    values (r.user_id, 'refund', r.amount + r.entry_fee, r.currency, 'confirmed', public.new_transaction_reference(),
            'Annulation de l''offre : ' || v_offer.title, true, 'credit', p_offer_id, r.id, v_admin);
    update public.investment_participations
      set status = 'refunded', exit_amount = r.amount + r.entry_fee, exited_at = now(), note = trim(p_note)
      where id = r.id;
    v_ids := array_append(v_ids, r.id);
    perform public.notify_user(r.user_id, 'Offre annulée',
      format('« %s » a été annulée. %s %s ont été recrédités sur votre portefeuille.', v_offer.title, r.amount + r.entry_fee, r.currency),
      '/compte/investissements');
  end loop;
  if v_ids is not null then
    perform public.reverse_referral_commissions('investment', v_ids);
  end if;

  perform set_config('drivest.internal', 'on', true);
  update public.investment_offers set status = 'cancelled' where id = p_offer_id;
  perform set_config('drivest.internal', 'off', true);
  perform public.log_audit('investment.cancel', 'investment_offers', p_offer_id::text, jsonb_build_object('note', p_note));
end;
$$;

-- -- Statistiques administrateur étendues -------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_blocked', (select count(*) from public.profiles where is_blocked),
    'vehicles_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.vehicles group by status) s), '{}'::jsonb),
    'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.orders group by status) s), '{}'::jsonb),
    'payments_pending', (select count(*) from public.payments where status = 'submitted'),
    'refunds_open', (select count(*) from public.refunds where status in ('requested', 'approved')),
    'support_open', (select count(*) from public.support_requests where status in ('open', 'in_progress')),
    'confirmed_payments_by_currency', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount) total from public.payments where status = 'verified' group by currency) s), '{}'::jsonb),
    'deposits_pending', (select count(*) from public.transactions where type = 'deposit' and status = 'pending'),
    'withdrawals_pending', (select count(*) from public.transactions where type = 'withdrawal' and status = 'pending'),
    'kyc_pending', (select count(*) from public.profiles where kyc_status = 'pending'),
    'invested_by_currency', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount) total from public.investment_participations where status = 'active' group by currency) s), '{}'::jsonb)
  );
end;
$$;

-- =============================================================================
-- Privilèges et RLS
-- =============================================================================
revoke all on public.investment_offers, public.investment_participations, public.investment_distributions,
  public.referral_commissions from anon, authenticated;

grant select on public.investment_offers, public.investment_distributions to anon, authenticated;
grant select on public.investment_participations, public.referral_commissions to authenticated;
grant insert, update on public.investment_offers to authenticated;

alter table public.investment_offers enable row level security;
alter table public.investment_participations enable row level security;
alter table public.investment_distributions enable row level security;
alter table public.referral_commissions enable row level security;

create policy offers_select on public.investment_offers for select
  using (status <> 'draft' or public.is_admin());
create policy offers_insert on public.investment_offers for insert to authenticated
  with check (public.is_admin());
create policy offers_update on public.investment_offers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy participations_select on public.investment_participations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy distributions_select on public.investment_distributions for select
  using (exists (select 1 from public.investment_offers o where o.id = offer_id and (o.status <> 'draft' or public.is_admin())));

create policy referral_commissions_select on public.referral_commissions for select to authenticated
  using (referrer_id = auth.uid() or public.is_admin());

revoke execute on function
  public.assert_feature(text), public.generate_referral_code(), public.investment_offers_guard(),
  public.wallet_lock(uuid), public.wallet_available(uuid, text), public.wallet_balances_for(uuid),
  public.my_wallet_balances(), public.admin_wallet_balances(uuid),
  public.request_deposit(numeric, text, text, text, text, uuid), public.admin_review_deposit(uuid, boolean, text),
  public.request_withdrawal(numeric, text, text, text, uuid), public.cancel_my_withdrawal(uuid),
  public.admin_process_withdrawal(uuid, boolean, text, text), public.admin_wallet_adjustment(uuid, numeric, text, text, text),
  public.pay_order_with_wallet(uuid),
  public.grant_referral_commission(uuid, numeric, text, text, uuid), public.reverse_referral_commissions(text, uuid[]),
  public.payments_referral_trigger(), public.refunds_referral_trigger(), public.my_referrals(),
  public.submit_kyc(text, text, text), public.admin_review_kyc(uuid, boolean, text),
  public.offer_progress(), public.invest(uuid, numeric, boolean, uuid),
  public.admin_distribute(uuid, numeric, text, text, text), public.admin_return_capital(uuid, numeric, text),
  public.admin_exit_participation(uuid, numeric, text), public.admin_cancel_offer(uuid, text)
from public, anon, authenticated;

grant execute on function public.offer_progress() to anon, authenticated;
grant execute on function
  public.my_wallet_balances(), public.admin_wallet_balances(uuid),
  public.request_deposit(numeric, text, text, text, text, uuid), public.admin_review_deposit(uuid, boolean, text),
  public.request_withdrawal(numeric, text, text, text, uuid), public.cancel_my_withdrawal(uuid),
  public.admin_process_withdrawal(uuid, boolean, text, text), public.admin_wallet_adjustment(uuid, numeric, text, text, text),
  public.pay_order_with_wallet(uuid), public.my_referrals(),
  public.submit_kyc(text, text, text), public.admin_review_kyc(uuid, boolean, text),
  public.invest(uuid, numeric, boolean, uuid),
  public.admin_distribute(uuid, numeric, text, text, text), public.admin_return_capital(uuid, numeric, text),
  public.admin_exit_participation(uuid, numeric, text), public.admin_cancel_offer(uuid, text)
to authenticated;

-- =============================================================================
-- Stockage : pièces d'identité (privé) et documents d'investissement
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('kyc-documents', 'kyc-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('investment-documents', 'investment-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "kyc_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc_read" on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "investment_docs_read" on storage.objects for select to authenticated
  using (bucket_id = 'investment-documents');
create policy "investment_docs_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'investment-documents' and public.is_admin());
create policy "investment_docs_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'investment-documents' and public.is_admin());
