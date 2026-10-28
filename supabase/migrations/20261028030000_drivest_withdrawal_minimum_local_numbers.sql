-- =============================================================================
-- Retrait minimum 5 000 FC, numéros Airtel affichés au format local (0…),
-- notifications vers les nouvelles pages Dépôt et Retrait.
-- =============================================================================
update public.platform_settings set min_withdrawal = 5000 where id = 1;

-- 243971234567 -> 0971234567
create or replace function public.format_local_phone(p_number text)
returns text language sql immutable set search_path = public as $$
  select case when p_number ~ '^243[0-9]{9}$' then '0' || substr(p_number, 4) else p_number end;
$$;

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
    raise exception 'Le montant minimum de retrait est de % FC.', v_settings.min_withdrawal using errcode = 'P0001';
  end if;

  perform public.wallet_lock(v_uid);
  v_fee := round(p_amount * v_settings.withdrawal_fee_percent / 100 + v_settings.withdrawal_fee_fixed, 2);
  if public.wallet_available(v_uid, 'CDF') < p_amount + v_fee then
    raise exception 'Solde insuffisant : vous ne pouvez pas retirer plus que votre solde.' using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                   method, destination, idempotency_key)
  values (v_uid, 'withdrawal', p_amount, 'CDF', 'pending', public.new_transaction_reference(),
          'Retrait vers Airtel Money', true, 'debit', 'Airtel Money',
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
    case when p_approve then format('Votre retrait de %s FC a été envoyé sur votre compte Airtel Money.', v_tx.amount)
         else format('Votre retrait de %s FC a été refusé : %s. Le montant est de nouveau disponible.', v_tx.amount, trim(p_reason)) end,
    '/compte/retrait');
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
    case when p_approve then format('Votre dépôt de %s FC a été vérifié et crédité.', v_tx.amount)
         else format('Votre dépôt de %s FC a été refusé : %s', v_tx.amount, trim(p_reason)) end,
    '/compte/depot');
  return v_tx;
end;
$$;

revoke execute on function public.format_local_phone(text) from public, anon, authenticated;
