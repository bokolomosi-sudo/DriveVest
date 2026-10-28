-- =============================================================================
-- Réseaux de retrait (Airtel Money, Orange Money, M-Pesa…) gérés par l'admin.
-- Le membre choisit son réseau en configurant son portefeuille de retrait.
-- =============================================================================
create table public.withdrawal_networks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 60),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger withdrawal_networks_updated_at before update on public.withdrawal_networks
  for each row execute function public.set_updated_at();
create trigger withdrawal_networks_audit after insert or update or delete on public.withdrawal_networks
  for each row execute function public.audit_row_change();
insert into public.withdrawal_networks (name, sort_order) values ('Airtel Money', 0);

alter table public.withdrawal_networks enable row level security;
revoke all on public.withdrawal_networks from anon, authenticated;
grant select, insert, update, delete on public.withdrawal_networks to authenticated;
create policy withdrawal_networks_select on public.withdrawal_networks for select to authenticated
  using (is_active or public.is_admin());
create policy withdrawal_networks_admin_insert on public.withdrawal_networks for insert to authenticated
  with check (public.is_admin());
create policy withdrawal_networks_admin_update on public.withdrawal_networks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy withdrawal_networks_admin_delete on public.withdrawal_networks for delete to authenticated
  using (public.is_admin());

-- Les portefeuilles existants sont tous sur Airtel Money
alter table public.withdrawal_accounts add column network text not null default 'Airtel Money'
  check (char_length(trim(network)) between 2 and 60);

-- -- Configuration du portefeuille de retrait avec choix du réseau -------------
drop function if exists public.set_withdrawal_account(text, text, text);
create function public.set_withdrawal_account(p_network text, p_holder_name text, p_number text, p_password text)
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

drop function if exists public.get_my_withdrawal_account();
create function public.get_my_withdrawal_account()
returns table (network text, holder_name text, airtel_number text)
language sql stable security definer set search_path = public as $$
  select a.network, a.holder_name, a.airtel_number from public.withdrawal_accounts a where a.user_id = auth.uid();
$$;

-- -- Retrait : le réseau du membre devient l'opérateur de la transaction --------
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

  if not public.has_purchased_product(v_uid) then
    raise exception 'Vous devez avoir acheté au moins un produit pour effectuer un retrait.' using errcode = 'P0001';
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
    raise exception 'Le montant minimum de retrait est de % FC.', v_settings.min_withdrawal using errcode = 'P0001';
  end if;

  perform public.wallet_lock(v_uid);
  if public.wallet_available(v_uid, 'CDF') < p_amount then
    raise exception 'Solde insuffisant : vous ne pouvez pas retirer plus que votre solde.' using errcode = 'P0001';
  end if;
  v_fee := least(round(p_amount * v_settings.withdrawal_fee_percent / 100 + v_settings.withdrawal_fee_fixed, 2), p_amount);
  if p_amount - v_fee <= 0 then
    raise exception 'Montant trop faible après déduction des frais.' using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                   method, destination, idempotency_key)
  values (v_uid, 'withdrawal', p_amount - v_fee, 'CDF', 'pending', public.new_transaction_reference(),
          'Retrait vers ' || v_account.network, true, 'debit', v_account.network,
          public.format_local_phone(v_account.airtel_number) || ' — ' || v_account.holder_name, p_idempotency_key)
  returning * into v_tx;

  if v_fee > 0 then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, related_transaction_id)
    values (v_uid, 'fee', v_fee, 'CDF', 'pending', public.new_transaction_reference(), 'Frais de retrait', true, 'debit', v_tx.id);
  end if;
  return v_tx;
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
    case when p_approve then format('Votre retrait de %s FC a été envoyé sur votre compte %s.', v_tx.amount, coalesce(v_tx.method, 'Mobile Money'))
         else format('Votre retrait de %s FC a été refusé : %s. Le montant est de nouveau disponible.', v_tx.amount, trim(p_reason)) end,
    '/compte/retrait');
  return v_tx;
end;
$$;

-- Fiche membre : le réseau du portefeuille de retrait
create or replace function public.admin_user_overview(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_profile public.profiles;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'balance', public.wallet_available(p_user_id, 'CDF'),
    'sponsor', (select jsonb_build_object('id', s.id, 'full_name', s.full_name, 'phone', public.format_local_phone(s.phone))
                from public.profiles s where s.id = v_profile.referred_by),
    'withdrawal_account', (select jsonb_build_object('network', w.network,
                                                     'holder_name', w.holder_name,
                                                     'airtel_number', public.format_local_phone(w.airtel_number),
                                                     'failed_attempts', w.failed_attempts,
                                                     'locked_until', w.locked_until,
                                                     'created_at', w.created_at)
                           from public.withdrawal_accounts w where w.user_id = p_user_id),
    'team_level1', (select count(*) from public.profiles p where p.referred_by = p_user_id),
    'team_level2', (select count(*) from public.profiles p join public.profiles p1 on p.referred_by = p1.id
                    where p1.referred_by = p_user_id),
    'invested_invitees', public.count_invested_invitees(p_user_id),
    'total_deposits', coalesce((select sum(amount) from public.transactions
                                where user_id = p_user_id and type = 'deposit' and status = 'confirmed'), 0),
    'total_withdrawals', coalesce((select sum(amount) from public.transactions
                                   where user_id = p_user_id and type = 'withdrawal' and status = 'confirmed'), 0),
    'total_commissions', coalesce((select sum(amount) from public.referral_commissions
                                   where referrer_id = p_user_id and reversed_at is null), 0),
    'total_rewards', coalesce((select sum(amount) from public.team_reward_grants where user_id = p_user_id), 0)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.set_withdrawal_account(text, text, text, text), public.get_my_withdrawal_account() from public, anon;
grant execute on function public.set_withdrawal_account(text, text, text, text), public.get_my_withdrawal_account() to authenticated;
