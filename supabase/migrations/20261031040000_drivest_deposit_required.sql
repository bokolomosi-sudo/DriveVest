-- =============================================================================
-- Dépôt validé obligatoire
--  * acheter un produit : au moins un dépôt validé par l'admin
--  * retirer : au moins un produit acheté ET au moins un dépôt validé par l'admin
--  * commission de parrainage : versée seulement si le filleul a un dépôt validé
--    (le parrain doit toujours avoir lui-même acheté un produit)
-- Les crédits manuels de l'admin, le bonus d'inscription et les commissions
-- ne comptent pas comme dépôt.
-- =============================================================================

create or replace function public.has_approved_deposit(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.transactions t
    where t.user_id = p_user_id and t.type = 'deposit' and t.status = 'confirmed'
  );
$$;

create or replace function public.i_have_approved_deposit()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_approved_deposit(auth.uid());
$$;

-- -- Achat ------------------------------------------------------------------------
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
  if not public.has_approved_deposit(v_uid) then
    raise exception 'Vous devez avoir fait au moins un dépôt validé pour acheter un produit.' using errcode = 'P0001';
  end if;
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
  -- Vérifiée sous le verrou du portefeuille : deux achats simultanés ne dépassent pas la limite
  perform public.assert_product_limit(v_uid);
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

-- -- Retrait ----------------------------------------------------------------------
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
  if not public.has_approved_deposit(v_uid) then
    raise exception 'Vous devez avoir fait au moins un dépôt validé par l''administration pour effectuer un retrait.' using errcode = 'P0001';
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

-- -- Commission de parrainage -------------------------------------------------------
create or replace function public.grant_referral_commission(
  p_referred uuid, p_base numeric, p_currency text, p_source_type text, p_source_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_settings public.platform_settings;
  v_current uuid := p_referred;
  v_referrer uuid;
  v_rate numeric;
  v_amount numeric;
  v_commission_id uuid;
  v_tx_id uuid;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if not v_settings.feature_referral then
    return;
  end if;
  if (p_source_type = 'order' and not v_settings.referral_on_orders)
     or (p_source_type = 'investment' and not v_settings.referral_on_investments) then
    return;
  end if;
  -- Filleul sans vrai dépôt validé (achat avec bonus ou crédits seulement) : aucune commission
  if not public.has_approved_deposit(p_referred) then
    return;
  end if;

  for v_level in 1..3 loop
    select referred_by into v_referrer from public.profiles where id = v_current;
    exit when v_referrer is null;
    v_current := v_referrer;

    v_rate := case v_level
      when 1 then v_settings.referral_commission_percent
      when 2 then v_settings.referral_level2_percent
      else v_settings.referral_level3_percent
    end;
    continue when v_rate <= 0;
    -- Un parrain bloqué ne touche rien, mais la chaîne continue au-dessus de lui
    continue when exists (select 1 from public.profiles where id = v_referrer and is_blocked);
    -- Idem pour un parrain qui n'a encore acheté aucun produit
    continue when not public.has_purchased_product(v_referrer);

    v_amount := round(p_base * v_rate / 100, 2);
    continue when v_amount <= 0;

    v_commission_id := null;
    insert into public.referral_commissions (referrer_id, referred_id, source_type, source_id, base_amount, rate, amount, currency, level)
    values (v_referrer, p_referred, p_source_type, p_source_id, p_base, v_rate, v_amount, p_currency, v_level)
    on conflict (source_type, source_id, level) do nothing
    returning id into v_commission_id;
    continue when v_commission_id is null;

    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
    values (v_referrer, 'referral_commission', v_amount, p_currency, 'confirmed', public.new_transaction_reference(),
            format('Commission de parrainage niveau %s', v_level), true, 'credit')
    returning id into v_tx_id;
    update public.referral_commissions set transaction_id = v_tx_id where id = v_commission_id;
    perform public.notify_user(v_referrer, 'Commission de parrainage',
      format('Vous avez reçu %s %s (niveau %s, %s %%).', v_amount, p_currency, v_level, v_rate), '/compte/parrainage');
  end loop;
end;
$$;

-- -- Droits -----------------------------------------------------------------------
revoke execute on function public.has_approved_deposit(uuid),
  public.grant_referral_commission(uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.i_have_approved_deposit(), public.pay_order_with_wallet(uuid),
  public.request_withdrawal_with_password(numeric, text, uuid) from public, anon;
grant execute on function public.i_have_approved_deposit(), public.pay_order_with_wallet(uuid),
  public.request_withdrawal_with_password(numeric, text, uuid) to authenticated;
