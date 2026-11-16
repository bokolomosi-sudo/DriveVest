-- =============================================================================
-- Certification Prestige et retraits
--  * un membre qui a acheté au moins un produit Prestige a un compte certifié
--    (badge bleu sur son profil et son tableau de bord)
--  * retrait réservé aux membres certifiés (au moins un produit Prestige acheté)
--  * tableau de bord admin : nombre de membres ayant acheté (chaque membre compté
--    une seule fois, même s'il a acheté plusieurs produits), à côté des produits vendus
-- =============================================================================

-- Vrai si le membre a acheté (et payé) au moins un produit Prestige
create or replace function public.has_prestige_product(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.orders o
    join public.order_items i on i.order_id = o.id
    join public.vehicles v on v.id = i.vehicle_id
    where o.user_id = p_user_id
      and v.collection = 'prestige'
      and o.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded')
  );
$$;
revoke execute on function public.has_prestige_product(uuid) from public, anon, authenticated;

-- Le membre connecté est-il certifié ?
create or replace function public.i_am_certified()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_prestige_product(auth.uid());
$$;
revoke execute on function public.i_am_certified() from public, anon;
grant execute on function public.i_am_certified() to authenticated;

-- Retrait : il faut avoir acheté au moins un produit Prestige
create or replace function public.request_withdrawal_with_password(p_amount numeric, p_password text, p_idempotency_key uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.has_prestige_product(v_uid) then
    raise exception 'Pour effectuer un retrait, vous devez avoir acheté au moins un produit Prestige.' using errcode = 'P0001';
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

-- Tableau de bord admin : + membres ayant acheté (distincts) et membres certifiés
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
    'invested_by_currency', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount) total from public.investment_participations where status = 'active' group by currency) s), '{}'::jsonb),
    -- Montants cumulés (FC)
    'deposits_received_total', (select coalesce(sum(amount), 0) from public.transactions
      where type = 'deposit' and status = 'confirmed' and currency = 'CDF'),
    'members_balance_total', (select coalesce(sum(public.wallet_available(p.id, 'CDF')), 0) from public.profiles p),
    'users_earned_total', (select coalesce(sum(t.amount), 0) from public.transactions t
      where t.status = 'confirmed' and t.currency = 'CDF' and t.direction = 'credit'
        and (t.type in ('distribution', 'referral_commission')
             or t.id in (select transaction_id from public.team_reward_grants where transaction_id is not null)
             or t.id in (select transaction_id from public.gift_claims where transaction_id is not null))),
    'withdrawals_paid_total', (select coalesce(sum(amount), 0) from public.transactions
      where type = 'withdrawal' and status = 'confirmed' and currency = 'CDF'),
    'commissions_paid_total', (select coalesce(sum(amount), 0) from public.transactions
      where type = 'referral_commission' and status = 'confirmed' and currency = 'CDF'),
    -- Produits vendus : un par achat ; membres ayant acheté : chaque membre une seule fois
    'products_sold', (select count(*) from public.orders
      where status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping', 'delivered')),
    'buyers_total', (select count(distinct user_id) from public.orders
      where status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping', 'delivered')),
    'certified_members', (select count(distinct o.user_id) from public.orders o
      join public.order_items i on i.order_id = o.id
      join public.vehicles v on v.id = i.vehicle_id
      where v.collection = 'prestige'
        and o.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded')),
    'products_active', (select count(*) from public.orders
      where status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping'))
  );
end;
$$;

-- Fiche membre (admin) : + certification
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
    'certified', public.has_prestige_product(p_user_id),
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
