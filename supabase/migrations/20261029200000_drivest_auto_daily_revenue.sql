-- =============================================================================
-- Revenu quotidien automatique
--  * l'admin fixe, sur le produit, un pourcentage du prix versé chaque jour
--  * l'acheteur reçoit ce montant à l'heure exacte de son achat, chaque jour
--  * après la durée du produit, plus rien n'est versé
--  * plus de déclaration manuelle par l'admin
-- =============================================================================

alter table public.vehicles
  add column if not exists daily_revenue_percent numeric(8, 4)
    check (daily_revenue_percent is null or (daily_revenue_percent >= 0 and daily_revenue_percent <= 100));

alter table public.orders
  add column if not exists activated_at timestamptz;

alter table public.order_items
  add column if not exists daily_revenue_percent numeric(8, 4),
  add column if not exists daily_revenue_amount numeric(14, 2);

-- Anciens produits : convertir le plafond FC en pourcentage du prix
update public.vehicles
set daily_revenue_percent = round(daily_revenue_cap / price * 100, 4)
where daily_revenue_percent is null
  and coalesce(daily_revenue_cap, 0) > 0
  and coalesce(price, 0) > 0;

-- Commandes déjà payées : l'heure d'achat sert de référence
update public.orders
set activated_at = created_at
where activated_at is null
  and status not in ('draft', 'pending_confirmation', 'payment_verification', 'cancelled', 'refunded');

create or replace function public.sync_vehicle_daily_revenue()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.daily_revenue_percent is not null and coalesce(new.price, 0) > 0 then
    new.daily_revenue_cap := round(new.price * new.daily_revenue_percent / 100, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_sync_daily_revenue on public.vehicles;
create trigger vehicles_sync_daily_revenue
  before insert or update of price, daily_revenue_percent on public.vehicles
  for each row execute function public.sync_vehicle_daily_revenue();

create or replace function public.set_order_activated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping', 'delivered')
     and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_activated_at on public.orders;
create trigger orders_set_activated_at
  before insert or update of status on public.orders
  for each row execute function public.set_order_activated_at();

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
    )
  from public.vehicles v
  where i.order_id = new.id and v.id = i.vehicle_id;
  return new;
end;
$$;

drop trigger if exists orders_snapshot_daily_revenue on public.orders;
create trigger orders_snapshot_daily_revenue
  after insert or update of status, activated_at on public.orders
  for each row execute function public.snapshot_order_daily_revenue();

create table if not exists public.product_daily_credits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  period_index integer not null check (period_index >= 1),
  due_at timestamptz not null,
  amount numeric(14, 2) not null check (amount > 0),
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  unique (order_id, period_index)
);
create index if not exists product_daily_credits_user_idx on public.product_daily_credits (user_id, created_at desc);
create index if not exists product_daily_credits_due_idx on public.product_daily_credits (due_at desc);

alter table public.product_daily_credits enable row level security;
revoke all on public.product_daily_credits from anon, authenticated;
grant select on public.product_daily_credits to authenticated;
drop policy if exists product_daily_credits_select on public.product_daily_credits;
create policy product_daily_credits_select on public.product_daily_credits
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- L'admin peut supprimer un produit (si aucune commande n'y est rattachée)
grant delete on public.vehicles to authenticated;
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (public.is_admin());

-- Plus de déclaration manuelle
drop function if exists public.admin_distribute_product_revenue(uuid, date, numeric, text);
drop function if exists public.admin_product_revenue_preview(uuid, date);

create or replace function public.credit_due_product_revenues()
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
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  select * into v_settings from public.platform_settings where id = 1;
  if not found or not v_settings.feature_wallet then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('credit_due_product_revenues'));

  for v_row in
    select
      o.id as order_id,
      o.user_id,
      o.activated_at,
      i.vehicle_id,
      i.quantity,
      i.unit_price,
      i.daily_revenue_amount,
      i.daily_revenue_percent as item_percent,
      v.daily_revenue_percent as vehicle_percent,
      v.duration_days,
      trim(v.brand || ' ' || v.model) as label
    from public.orders o
    join public.order_items i on i.order_id = o.id
    join public.vehicles v on v.id = i.vehicle_id
    where o.activated_at is not null
      and o.status not in ('draft', 'pending_confirmation', 'payment_verification', 'cancelled', 'refunded')
      and coalesce(v.duration_days, 0) > 0
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

    if v_paid >= v_row.duration_days then
      continue;
    end if;

    perform public.wallet_lock(v_row.user_id);
    v_next := v_paid + 1;
    v_order_total := 0;
    v_order_n := 0;
    v_label := v_row.label;

    while v_next <= v_row.duration_days and v_credited < 200 loop
      v_due := v_row.activated_at + (v_next * interval '1 day');
      exit when v_due > now();

      begin
        insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, order_id)
        values (
          v_row.user_id, 'distribution', v_amount, 'CDF', 'confirmed', public.new_transaction_reference(),
          format('Revenu du jour %s/%s : %s', v_next, v_row.duration_days, v_label),
          true, 'credit', v_row.order_id
        )
        returning * into v_tx;

        insert into public.product_daily_credits
          (order_id, user_id, vehicle_id, period_index, due_at, amount, transaction_id)
        values (v_row.order_id, v_row.user_id, v_row.vehicle_id, v_next, v_due, v_amount, v_tx.id);
      exception when unique_violation then
        v_next := v_next + 1;
        continue;
      end;

      v_order_total := v_order_total + v_amount;
      v_order_n := v_order_n + 1;
      v_credited := v_credited + 1;
      v_next := v_next + 1;
    end loop;

    if v_order_n > 0 then
      perform public.notify_user(
        v_row.user_id,
        'Revenu du produit',
        format('%s : %s FC crédités (%s jour%s).', v_label, v_order_total, v_order_n, case when v_order_n > 1 then 's' else '' end),
        '/compte/produits'
      );
    end if;

    exit when v_credited >= 200;
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
  where c.user_id = auth.uid()
  union all
  select p.order_id, trim(v.brand || ' ' || v.model), d.revenue_date, p.amount, p.created_at
  from public.product_revenue_payouts p
  join public.product_revenue_distributions d on d.id = p.distribution_id
  join public.vehicles v on v.id = d.vehicle_id
  where p.user_id = auth.uid()
  order by 5 desc;
$$;

revoke execute on function public.credit_due_product_revenues() from public, anon;
grant execute on function public.credit_due_product_revenues() to authenticated;
revoke execute on function public.my_product_revenues() from public, anon;
grant execute on function public.my_product_revenues() to authenticated;
revoke execute on function public.sync_vehicle_daily_revenue() from public, anon, authenticated;
revoke execute on function public.set_order_activated_at() from public, anon, authenticated;
revoke execute on function public.snapshot_order_daily_revenue() from public, anon, authenticated;
