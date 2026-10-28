-- =============================================================================
-- Règles de retrait et page « Mon équipe »
--  * retrait réservé aux membres ayant acheté au moins un produit
--  * minimum 6 000 FC, frais de 30 % prélevés sur le montant demandé
--    (10 000 FC demandés = 7 000 FC envoyés + 3 000 FC de frais)
--  * retrait définitif : le membre ne peut plus l'annuler
--  * my_team() : équipe sur 3 niveaux, avec numéro et statut d'achat
-- =============================================================================
update public.platform_settings
  set min_withdrawal = 6000, withdrawal_fee_percent = 30, withdrawal_fee_fixed = 0
  where id = 1;

-- Un produit acheté = une commande réglée (ni brouillon, ni en attente, ni annulée)
create or replace function public.has_purchased_product(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.user_id = p_user_id
      and o.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded')
  );
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
  -- Les frais sont prélevés sur le montant demandé : le solde baisse exactement de p_amount
  v_fee := least(round(p_amount * v_settings.withdrawal_fee_percent / 100 + v_settings.withdrawal_fee_fixed, 2), p_amount);
  if p_amount - v_fee <= 0 then
    raise exception 'Montant trop faible après déduction des frais.' using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                   method, destination, idempotency_key)
  values (v_uid, 'withdrawal', p_amount - v_fee, 'CDF', 'pending', public.new_transaction_reference(),
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

-- Retrait définitif une fois soumis
revoke execute on function public.cancel_my_withdrawal(uuid) from public, anon, authenticated;

-- -- Mon équipe ---------------------------------------------------------------
-- Numéro complet pour les invités directs (niveau 1), masqué pour les niveaux 2 et 3.
create or replace function public.my_team()
returns table (
  display_name text, phone text, joined_at timestamptz, level integer,
  has_invested boolean, products_count integer, invested_amount numeric, commissions numeric
)
language sql stable security definer set search_path = public as $$
  with recursive team as (
    select p.id, p.full_name, p.phone, p.created_at, 1 as level
    from public.profiles p where p.referred_by = auth.uid()
    union all
    select p.id, p.full_name, p.phone, p.created_at, t.level + 1
    from public.profiles p join team t on p.referred_by = t.id
    where t.level < 3
  ),
  purchases as (
    select o.user_id, count(*)::integer as products_count, sum(o.total_amount) as invested_amount
    from public.orders o
    where o.user_id in (select id from team)
      and o.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded')
    group by o.user_id
  )
  select
    coalesce(nullif(trim(t.full_name), ''), nullif(trim(w.holder_name), ''), 'Membre'),
    case
      when t.phone is null then null
      when t.level = 1 then public.format_local_phone(t.phone)
      else left(public.format_local_phone(t.phone), 3) || ' ••• ' || right(t.phone, 3)
    end,
    t.created_at,
    t.level,
    pu.user_id is not null,
    coalesce(pu.products_count, 0),
    coalesce(pu.invested_amount, 0),
    coalesce((select sum(c.amount) from public.referral_commissions c
              where c.referred_id = t.id and c.referrer_id = auth.uid() and c.reversed_at is null), 0)
  from team t
  left join purchases pu on pu.user_id = t.id
  left join public.withdrawal_accounts w on w.user_id = t.id
  order by t.level, t.created_at desc;
$$;

-- Pour l'interface : le membre connecté a-t-il déjà acheté un produit ?
create or replace function public.i_have_purchased()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_purchased_product(auth.uid());
$$;

revoke execute on function public.has_purchased_product(uuid) from public, anon, authenticated;
revoke execute on function public.i_have_purchased() from public, anon;
grant execute on function public.i_have_purchased() to authenticated;
revoke execute on function public.my_team() from public, anon;
grant execute on function public.my_team() to authenticated;
