-- =============================================================================
-- Revenu journalier plafonné des produits
--  * l'admin fixe, sur chaque produit, un plafond de revenu par jour et par unité achetée
--  * chaque jour, il déclare le revenu RÉELLEMENT encaissé par ce produit
--  * le site le partage entre les acheteurs dont le produit n'a pas expiré,
--    sans jamais dépasser le plafond ; le reste revient à l'entreprise
--  * aucun montant n'est promis : sans revenu déclaré, rien n'est versé
-- =============================================================================
alter table public.vehicles
  add column daily_revenue_cap numeric(14, 2) check (daily_revenue_cap is null or daily_revenue_cap >= 0);

create table public.product_revenue_distributions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  revenue_date date not null,
  declared_amount numeric(14, 2) not null check (declared_amount > 0),
  daily_cap numeric(14, 2) not null,
  units integer not null check (units > 0),
  per_unit numeric(14, 2) not null check (per_unit > 0),
  paid_total numeric(14, 2) not null,
  retained numeric(14, 2) not null,
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Un seul partage par produit et par jour
  unique (vehicle_id, revenue_date)
);
create index product_revenue_distributions_date_idx on public.product_revenue_distributions (revenue_date desc);

create table public.product_revenue_payouts (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.product_revenue_distributions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  transaction_id uuid references public.transactions (id),
  units integer not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now()
);
create index product_revenue_payouts_user_idx on public.product_revenue_payouts (user_id, created_at desc);
create index product_revenue_payouts_order_idx on public.product_revenue_payouts (order_id);
create index product_revenue_payouts_distribution_idx on public.product_revenue_payouts (distribution_id);

alter table public.product_revenue_distributions enable row level security;
alter table public.product_revenue_payouts enable row level security;
revoke all on public.product_revenue_distributions, public.product_revenue_payouts from anon, authenticated;
grant select on public.product_revenue_distributions, public.product_revenue_payouts to authenticated;
create policy product_revenue_distributions_select on public.product_revenue_distributions for select to authenticated
  using ((select public.is_admin()));
create policy product_revenue_payouts_select on public.product_revenue_payouts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Acheteurs dont le produit est actif à cette date (une ligne par commande, avec le nombre d'unités)
create or replace function public.active_product_holders(p_vehicle_id uuid, p_date date)
returns table (order_id uuid, user_id uuid, units integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.user_id, sum(i.quantity)::integer
  from public.orders o
  join public.order_items i on i.order_id = o.id
  join public.vehicles v on v.id = i.vehicle_id
  where i.vehicle_id = p_vehicle_id
    and o.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded')
    and p_date >= (o.created_at at time zone 'Africa/Kinshasa')::date
    and p_date < (o.created_at at time zone 'Africa/Kinshasa')::date + coalesce(v.duration_days, 0)
  group by o.id, o.user_id;
$$;

-- Aperçu pour l'admin avant de valider : unités actives et plafond
create or replace function public.admin_product_revenue_preview(p_vehicle_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_units integer;
  v_holders integer;
  v_cap numeric;
begin
  select coalesce(sum(h.units), 0), count(*) into v_units, v_holders from public.active_product_holders(p_vehicle_id, p_date) h;
  select daily_revenue_cap into v_cap from public.vehicles where id = p_vehicle_id;
  return jsonb_build_object(
    'units', v_units,
    'holders', v_holders,
    'daily_cap', v_cap,
    'already_declared', exists (select 1 from public.product_revenue_distributions where vehicle_id = p_vehicle_id and revenue_date = p_date)
  );
end;
$$;

create or replace function public.admin_distribute_product_revenue(p_vehicle_id uuid, p_date date, p_amount numeric, p_note text default null)
returns public.product_revenue_distributions
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_vehicle public.vehicles;
  v_units integer;
  v_per_unit numeric;
  v_dist public.product_revenue_distributions;
  v_holder record;
  v_tx public.transactions;
  v_label text;
begin
  perform public.assert_feature('wallet');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Indiquez le revenu réellement encaissé (montant positif).' using errcode = 'P0001';
  end if;
  if p_date is null or p_date > (now() at time zone 'Africa/Kinshasa')::date then
    raise exception 'On ne peut déclarer que le revenu d''un jour passé ou d''aujourd''hui.' using errcode = 'P0001';
  end if;
  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0001';
  end if;
  if coalesce(v_vehicle.daily_revenue_cap, 0) <= 0 then
    raise exception 'Fixez d''abord le plafond de revenu journalier de ce produit.' using errcode = 'P0001';
  end if;
  -- Deux déclarations simultanées du même jour ne paient pas deux fois
  perform pg_advisory_xact_lock(hashtext('product_revenue:' || p_vehicle_id::text || ':' || p_date::text));
  if exists (select 1 from public.product_revenue_distributions where vehicle_id = p_vehicle_id and revenue_date = p_date) then
    raise exception 'Le revenu de ce produit a déjà été déclaré pour ce jour.' using errcode = 'P0001';
  end if;

  select coalesce(sum(h.units), 0) into v_units from public.active_product_holders(p_vehicle_id, p_date) h;
  if v_units = 0 then
    raise exception 'Aucun acheteur n''a ce produit actif à cette date.' using errcode = 'P0001';
  end if;
  -- Part par unité : le revenu divisé entre les unités, jamais au-delà du plafond (arrondi au centime inférieur)
  v_per_unit := least(v_vehicle.daily_revenue_cap, floor(p_amount / v_units * 100) / 100);
  if v_per_unit <= 0 then
    raise exception 'Revenu trop faible pour être partagé entre % unités.', v_units using errcode = 'P0001';
  end if;

  insert into public.product_revenue_distributions
    (vehicle_id, revenue_date, declared_amount, daily_cap, units, per_unit, paid_total, retained, note, created_by)
  values (p_vehicle_id, p_date, p_amount, v_vehicle.daily_revenue_cap, v_units, v_per_unit,
          v_per_unit * v_units, p_amount - v_per_unit * v_units, nullif(trim(p_note), ''), v_admin)
  returning * into v_dist;

  v_label := trim(v_vehicle.brand || ' ' || v_vehicle.model);
  for v_holder in select * from public.active_product_holders(p_vehicle_id, p_date) loop
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, order_id)
    values (v_holder.user_id, 'distribution', v_per_unit * v_holder.units, 'CDF', 'confirmed', public.new_transaction_reference(),
            format('Revenu du %s : %s', to_char(p_date, 'DD/MM/YYYY'), v_label), true, 'credit', v_holder.order_id)
    returning * into v_tx;
    insert into public.product_revenue_payouts (distribution_id, user_id, order_id, transaction_id, units, amount)
    values (v_dist.id, v_holder.user_id, v_holder.order_id, v_tx.id, v_holder.units, v_per_unit * v_holder.units);
    perform public.notify_user(v_holder.user_id, 'Revenu du jour',
      format('%s : %s FC crédités pour le %s.', v_label, v_per_unit * v_holder.units, to_char(p_date, 'DD/MM/YYYY')),
      '/compte/produits');
  end loop;

  perform public.log_audit('product_revenue.distribute', 'product_revenue_distributions', v_dist.id::text,
    jsonb_build_object('vehicle_id', p_vehicle_id, 'date', p_date, 'declared', p_amount, 'per_unit', v_per_unit,
                       'units', v_units, 'paid', v_dist.paid_total, 'retained', v_dist.retained));
  return v_dist;
end;
$$;

-- Revenus reçus par le membre connecté
create or replace function public.my_product_revenues()
returns table (order_id uuid, vehicle_label text, revenue_date date, amount numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.order_id, trim(v.brand || ' ' || v.model), d.revenue_date, p.amount, p.created_at
  from public.product_revenue_payouts p
  join public.product_revenue_distributions d on d.id = p.distribution_id
  join public.vehicles v on v.id = d.vehicle_id
  where p.user_id = auth.uid()
  order by d.revenue_date desc, p.created_at desc;
$$;

revoke execute on function public.active_product_holders(uuid, date) from public, anon, authenticated;
revoke execute on function public.admin_product_revenue_preview(uuid, date), public.admin_distribute_product_revenue(uuid, date, numeric, text),
  public.my_product_revenues() from public, anon;
grant execute on function public.admin_product_revenue_preview(uuid, date), public.admin_distribute_product_revenue(uuid, date, numeric, text),
  public.my_product_revenues() to authenticated;
