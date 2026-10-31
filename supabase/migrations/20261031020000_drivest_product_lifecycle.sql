-- =============================================================================
-- Cycle de vie des produits
--  * revenus versés automatiquement par le serveur (pg_cron), même sans connexion
--  * durée figée à l'achat : changer la durée d'un produit ne touche que les futurs achats
--  * produit terminé à la fin de sa durée (statut « delivered », affiché « Terminée ») :
--    le client peut alors racheter le même produit
--  * 6 produits actifs maximum par client
--  * un compte bloqué ne reçoit aucun revenu (les jours bloqués sont perdus)
--  * un numéro de retrait ne peut servir qu'à un seul compte
--  * le client peut changer son mot de passe de retrait avec l'ancien
-- =============================================================================

-- -- Durée figée à l'achat -----------------------------------------------------
alter table public.order_items add column if not exists duration_days integer;

update public.order_items i
set duration_days = v.duration_days
from public.vehicles v
where v.id = i.vehicle_id and i.duration_days is null;

create or replace function public.snapshot_order_daily_revenue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activated_at is null then
    return new;
  end if;
  update public.order_items i
  set
    daily_revenue_percent = coalesce(i.daily_revenue_percent, v.daily_revenue_percent),
    daily_revenue_amount = coalesce(
      i.daily_revenue_amount,
      round(i.unit_price * coalesce(v.daily_revenue_percent, 0) / 100, 2)
    ),
    duration_days = coalesce(i.duration_days, v.duration_days)
  from public.vehicles v
  where i.order_id = new.id and v.id = i.vehicle_id;
  return new;
end;
$$;

-- -- Jours non versés (compte bloqué) -----------------------------------------
alter table public.product_daily_credits add column if not exists skipped boolean not null default false;

-- -- Limite de produits actifs -------------------------------------------------
create or replace function public.active_product_count(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.orders o
  where o.user_id = p_user_id
    and o.status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping');
$$;

create or replace function public.assert_product_limit(p_user_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.active_product_count(p_user_id) >= 6 then
    raise exception 'Vous avez déjà 6 produits actifs, le maximum autorisé. Attendez qu''un produit se termine pour en acheter un autre.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- -- Versement automatique ------------------------------------------------------
-- Fonction interne (appelée par pg_cron et par credit_due_product_revenues)
create or replace function public.process_due_product_revenues()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.platform_settings;
  v_row record;
  v_paid integer;
  v_next integer;
  v_due timestamptz;
  v_amount numeric;
  v_credited integer := 0;
  v_order_total numeric;
  v_order_n integer;
  v_tx public.transactions;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if not found or not v_settings.feature_wallet then
    return 0;
  end if;

  -- Un seul traitement à la fois ; les autres appels repartent sans attendre
  if not pg_try_advisory_xact_lock(hashtext('credit_due_product_revenues')) then
    return 0;
  end if;

  for v_row in
    select
      o.id as order_id,
      o.user_id,
      o.status,
      o.activated_at,
      i.vehicle_id,
      i.quantity,
      i.unit_price,
      i.daily_revenue_amount,
      i.daily_revenue_percent as item_percent,
      v.daily_revenue_percent as vehicle_percent,
      coalesce(i.duration_days, v.duration_days) as duration_days,
      trim(v.brand || ' ' || v.model) as label,
      p.is_blocked
    from public.orders o
    join public.order_items i on i.order_id = o.id
    join public.vehicles v on v.id = i.vehicle_id
    join public.profiles p on p.id = o.user_id
    where o.activated_at is not null
      and o.status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping', 'delivered')
      and coalesce(i.duration_days, v.duration_days, 0) > 0
      and coalesce((select max(c.period_index) from public.product_daily_credits c where c.order_id = o.id), 0)
          < coalesce(i.duration_days, v.duration_days)
    order by o.activated_at
  loop
    v_amount := coalesce(
      nullif(v_row.daily_revenue_amount, 0),
      round(v_row.unit_price * coalesce(nullif(v_row.item_percent, 0), v_row.vehicle_percent, 0) / 100, 2)
    ) * coalesce(v_row.quantity, 1);
    if v_amount <= 0 then
      continue;
    end if;

    select coalesce(max(period_index), 0) into v_paid
    from public.product_daily_credits
    where order_id = v_row.order_id;

    perform public.wallet_lock(v_row.user_id);
    v_next := v_paid + 1;
    v_order_total := 0;
    v_order_n := 0;

    while v_next <= v_row.duration_days and v_credited < 5000 loop
      v_due := v_row.activated_at + (v_next * interval '1 day');
      exit when v_due > now();

      begin
        if v_row.is_blocked then
          -- Compte bloqué : le jour est marqué comme non versé et ne sera jamais rattrapé
          insert into public.product_daily_credits
            (order_id, user_id, vehicle_id, period_index, due_at, amount, skipped)
          values (v_row.order_id, v_row.user_id, v_row.vehicle_id, v_next, v_due, v_amount, true);
        else
          insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, order_id)
          values (
            v_row.user_id, 'distribution', v_amount, 'CDF', 'confirmed', public.new_transaction_reference(),
            format('Revenu du jour %s/%s : %s', v_next, v_row.duration_days, v_row.label),
            true, 'credit', v_row.order_id
          )
          returning * into v_tx;

          insert into public.product_daily_credits
            (order_id, user_id, vehicle_id, period_index, due_at, amount, transaction_id)
          values (v_row.order_id, v_row.user_id, v_row.vehicle_id, v_next, v_due, v_amount, v_tx.id);

          v_order_total := v_order_total + v_amount;
          v_order_n := v_order_n + 1;
        end if;
      exception when unique_violation then
        v_next := v_next + 1;
        continue;
      end;

      v_credited := v_credited + 1;
      v_next := v_next + 1;
    end loop;

    if v_order_n > 0 then
      perform public.notify_user(
        v_row.user_id,
        'Revenu du produit',
        format('%s : %s FC crédités (%s jour%s).', v_row.label, v_order_total, v_order_n, case when v_order_n > 1 then 's' else '' end),
        '/compte/produits'
      );
    end if;

    -- Dernier jour passé : le produit est terminé et peut être racheté
    if v_next > v_row.duration_days and v_row.status <> 'delivered' then
      update public.orders set status = 'delivered' where id = v_row.order_id;
      perform public.record_order_status(v_row.order_id, v_row.status, 'delivered', 'Produit terminé : durée écoulée');
      perform public.notify_user(
        v_row.user_id,
        'Produit terminé',
        format('%s est arrivé à son terme. Vous pouvez le racheter.', v_row.label),
        '/compte/produits'
      );
    end if;

    exit when v_credited >= 5000;
  end loop;

  if v_credited > 0 then
    perform public.log_audit(
      'product_revenue.auto_credit',
      'product_daily_credits',
      null,
      jsonb_build_object('credited', v_credited)
    );
  end if;
  return v_credited;
end;
$$;

-- Produits déjà terminés avant cette migration
do $$
declare
  v_order record;
begin
  for v_order in
    select o.id, o.status from public.orders o
    join public.order_items i on i.order_id = o.id
    where o.status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping')
      and coalesce(i.duration_days, 0) > 0
      and coalesce((select max(c.period_index) from public.product_daily_credits c where c.order_id = o.id), 0) >= i.duration_days
  loop
    update public.orders set status = 'delivered' where id = v_order.id;
    perform public.record_order_status(v_order.id, v_order.status, 'delivered', 'Produit terminé : durée écoulée');
  end loop;
end $$;

-- Appel manuel (tableau de bord, bouton admin) : simple déclencheur du traitement
create or replace function public.credit_due_product_revenues()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  return public.process_due_product_revenues();
end;
$$;

create or replace function public.my_product_revenues()
returns table (order_id uuid, vehicle_label text, revenue_date date, amount numeric, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.order_id, trim(v.brand || ' ' || v.model), (c.due_at at time zone 'Africa/Kinshasa')::date, c.amount, c.created_at
  from public.product_daily_credits c
  join public.vehicles v on v.id = c.vehicle_id
  where c.user_id = auth.uid() and not c.skipped
  union all
  select p.order_id, trim(v.brand || ' ' || v.model), d.revenue_date, p.amount, p.created_at
  from public.product_revenue_payouts p
  join public.product_revenue_distributions d on d.id = p.distribution_id
  join public.vehicles v on v.id = d.vehicle_id
  where p.user_id = auth.uid()
  order by 5 desc;
$$;

-- Tâche planifiée : chaque minute, chaque client reçoit son revenu à l'heure de son achat
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $cron$select cron.schedule('drivest-product-revenues', '* * * * *', 'select public.process_due_product_revenues()')$cron$;
  end if;
end $$;

-- -- Achat : limite de 6 produits actifs --------------------------------------
create or replace function public.create_order(
  p_vehicle_id uuid,
  p_idempotency_key uuid,
  p_customer_note text default null,
  p_delivery_address text default null
)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_vehicle public.vehicles;
  v_order public.orders;
begin
  if p_idempotency_key is null then
    raise exception 'Requête invalide.' using errcode = '22023';
  end if;

  -- Sérialise les demandes d'un même client pour un même véhicule
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_vehicle_id::text, 0));

  -- Double soumission : renvoie la commande déjà créée
  select * into v_order from public.orders where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_order;
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found or v_vehicle.status <> 'published' then
    raise exception 'Ce véhicule n''est pas disponible à la commande.' using errcode = 'P0001';
  end if;
  if v_vehicle.availability <> 'available' then
    raise exception 'Ce véhicule n''est plus disponible.' using errcode = 'P0001';
  end if;
  if v_vehicle.price is null then
    raise exception 'Le prix de ce véhicule n''est pas encore fixé. Contactez le service client.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = v_uid and oi.vehicle_id = p_vehicle_id
      and o.status not in ('cancelled', 'refunded', 'delivered')
  ) then
    raise exception 'Vous avez déjà ce produit en cours. Vous pourrez le racheter quand il sera terminé.' using errcode = 'P0001';
  end if;
  perform public.assert_product_limit(v_uid);

  insert into public.orders (user_id, status, total_amount, currency, customer_note, delivery_address, idempotency_key)
  values (
    v_uid, 'pending_confirmation', v_vehicle.price, v_vehicle.currency,
    left(nullif(trim(p_customer_note), ''), 2000),
    left(nullif(trim(p_delivery_address), ''), 500),
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.order_items (order_id, vehicle_id, vehicle_label, unit_price, currency, quantity, duration_days)
  values (
    v_order.id, v_vehicle.id,
    concat_ws(' ', v_vehicle.brand, v_vehicle.model, v_vehicle.year::text),
    v_vehicle.price, v_vehicle.currency, 1, v_vehicle.duration_days
  );

  perform public.record_order_status(v_order.id, null, 'pending_confirmation', 'Commande créée par le client');
  return v_order;
end;
$$;

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

-- -- Numéro de retrait unique ---------------------------------------------------
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
  if exists (select 1 from public.withdrawal_accounts where airtel_number = p_number) then
    raise exception 'Ce numéro est déjà utilisé par un autre compte.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_password, '')) < 4 then
    raise exception 'Le mot de passe de retrait doit contenir au moins 4 caractères.' using errcode = 'P0001';
  end if;
  begin
    insert into public.withdrawal_accounts (user_id, network, holder_name, airtel_number, password_salt, password_hash)
    values (v_uid, p_network, trim(p_holder_name), p_number, v_salt, public.hash_withdrawal_password(p_password, v_salt));
  exception when unique_violation then
    raise exception 'Ce numéro est déjà utilisé par un autre compte.' using errcode = 'P0001';
  end;
end;
$$;

-- Garantie en base (créée seulement si aucun doublon n'existe déjà)
do $$
begin
  if not exists (
    select 1 from public.withdrawal_accounts group by airtel_number having count(*) > 1
  ) then
    execute 'create unique index if not exists withdrawal_accounts_number_unique on public.withdrawal_accounts (airtel_number)';
  else
    raise notice 'Doublons de numéros de retrait : index unique non créé, à traiter manuellement.';
  end if;
end $$;

-- -- Changement du mot de passe de retrait --------------------------------------
-- Renvoie false si l'ancien mot de passe est faux (sans annuler le compteur d'essais)
create or replace function public.change_withdrawal_password(p_old_password text, p_new_password text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_account public.withdrawal_accounts;
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  select * into v_account from public.withdrawal_accounts where user_id = v_uid for update;
  if not found then
    raise exception 'Configurez d''abord votre portefeuille de retrait.' using errcode = 'P0001';
  end if;
  if v_account.locked_until is not null and v_account.locked_until > now() then
    raise exception 'Trop d''essais incorrects. Réessayez après %.', to_char(v_account.locked_until at time zone 'Africa/Kinshasa', 'HH24:MI') using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_new_password, '')) < 4 then
    raise exception 'Le nouveau mot de passe de retrait doit contenir au moins 4 caractères.' using errcode = 'P0001';
  end if;
  if public.hash_withdrawal_password(coalesce(p_old_password, ''), v_account.password_salt) <> v_account.password_hash then
    update public.withdrawal_accounts
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where user_id = v_uid;
    return false;
  end if;
  update public.withdrawal_accounts
    set password_salt = v_salt,
        password_hash = public.hash_withdrawal_password(p_new_password, v_salt),
        failed_attempts = 0,
        locked_until = null
    where user_id = v_uid;
  perform public.log_audit('withdrawal_account.password_change', 'withdrawal_accounts', v_uid::text);
  return true;
end;
$$;

-- -- Droits -----------------------------------------------------------------------
revoke execute on function public.process_due_product_revenues(), public.active_product_count(uuid),
  public.assert_product_limit(uuid), public.snapshot_order_daily_revenue() from public, anon, authenticated;
revoke execute on function public.credit_due_product_revenues(), public.my_product_revenues(),
  public.create_order(uuid, uuid, text, text), public.pay_order_with_wallet(uuid),
  public.set_withdrawal_account(text, text, text, text), public.change_withdrawal_password(text, text) from public, anon;
grant execute on function public.credit_due_product_revenues(), public.my_product_revenues(),
  public.create_order(uuid, uuid, text, text), public.pay_order_with_wallet(uuid),
  public.set_withdrawal_account(text, text, text, text), public.change_withdrawal_password(text, text) to authenticated;
