-- =============================================================================
-- Retrait minimum 5 000 FC, informations du membre (nom, province, ville),
-- récompenses d'équipe automatiques (paliers réglables par l'administration).
-- =============================================================================
update public.platform_settings set min_withdrawal = 5000 where id = 1;

-- -- Provinces proposées à l'inscription (liste modifiable par l'admin) ---------
alter table public.platform_settings
  add column provinces text[] not null
    default array['Kinshasa', 'Kongo-Central', 'Haut-Katanga', 'Lualaba', 'Nord-Kivu', 'Sud-Kivu'];
grant update (provinces) on public.platform_settings to authenticated;

alter table public.profiles add column province text check (char_length(province) <= 80);

-- Page de bienvenue : nom, province (dans la liste) et ville, en une fois
create or replace function public.complete_my_profile(p_full_name text, p_province text, p_city text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_provinces text[];
begin
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Indiquez votre nom complet.' using errcode = 'P0001';
  end if;
  select provinces into v_provinces from public.platform_settings where id = 1;
  if p_province is null or not (p_province = any (v_provinces)) then
    raise exception 'Choisissez votre province dans la liste.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_city, ''))) not between 2 and 80 then
    raise exception 'Indiquez votre ville.' using errcode = 'P0001';
  end if;
  update public.profiles
    set full_name = trim(p_full_name), province = p_province, city = trim(p_city), country = 'RD Congo'
    where id = v_uid;
end;
$$;

-- -- Récompenses d'équipe ---------------------------------------------------------
-- Palier : « N invités directs ayant acheté un produit » => montant crédité une fois.
create table public.team_reward_tiers (
  id uuid primary key default gen_random_uuid(),
  -- Un palier = un nombre d'invités : réenregistrer la liste ne crée jamais de doublon
  invited_count integer not null unique check (invited_count between 1 and 100000),
  amount numeric(14, 2) not null check (amount > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger team_reward_tiers_updated_at before update on public.team_reward_tiers
  for each row execute function public.set_updated_at();
insert into public.team_reward_tiers (invited_count, amount) values (5, 500), (15, 1000), (22, 1500);

alter table public.team_reward_tiers enable row level security;
revoke all on public.team_reward_tiers from anon, authenticated;
grant select on public.team_reward_tiers to authenticated;
create policy team_reward_tiers_select on public.team_reward_tiers for select to authenticated using (true);

create table public.team_reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier_id uuid not null references public.team_reward_tiers (id) on delete restrict,
  invited_count integer not null,
  amount numeric(14, 2) not null,
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  unique (user_id, tier_id)
);
create index team_reward_grants_user_idx on public.team_reward_grants (user_id);
alter table public.team_reward_grants enable row level security;
revoke all on public.team_reward_grants from anon, authenticated;
grant select on public.team_reward_grants to authenticated;
create policy team_reward_grants_select on public.team_reward_grants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Invités directs ayant acheté au moins un produit
create or replace function public.count_invested_invitees(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.profiles p
  where p.referred_by = p_user_id and public.has_purchased_product(p.id);
$$;

-- Crédite automatiquement chaque palier atteint (une seule fois par palier)
create or replace function public.grant_team_rewards(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_settings public.platform_settings;
  v_count integer;
  v_tier public.team_reward_tiers;
  v_tx public.transactions;
  v_granted integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;
  select * into v_settings from public.platform_settings where id = 1;
  if not v_settings.feature_wallet or not v_settings.feature_referral then
    return 0;
  end if;
  -- Deux achats simultanés d'invités ne doivent pas créditer deux fois
  perform pg_advisory_xact_lock(hashtext('team_rewards:' || p_user_id::text));
  v_count := public.count_invested_invitees(p_user_id);

  for v_tier in
    select t.* from public.team_reward_tiers t
    where t.is_active and t.invited_count <= v_count
      and not exists (select 1 from public.team_reward_grants g where g.user_id = p_user_id and g.tier_id = t.id)
    order by t.invited_count
  loop
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
    values (p_user_id, 'adjustment', v_tier.amount, 'CDF', 'confirmed', public.new_transaction_reference(),
            format('Récompense d''équipe : %s invités ayant investi', v_tier.invited_count), true, 'credit')
    returning * into v_tx;
    insert into public.team_reward_grants (user_id, tier_id, invited_count, amount, transaction_id)
    values (p_user_id, v_tier.id, v_tier.invited_count, v_tier.amount, v_tx.id);
    perform public.notify_user(p_user_id, 'Récompense d''équipe',
      format('Félicitations ! %s de vos invités ont acheté un produit : %s FC ont été crédités sur votre compte.',
             v_tier.invited_count, v_tier.amount),
      '/compte/parrainage');
    v_granted := v_granted + 1;
  end loop;
  return v_granted;
end;
$$;

-- Déclenchement : quand la commande d'un invité est réglée
create or replace function public.orders_grant_team_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('draft', 'pending_confirmation')
     and new.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded') then
    perform public.grant_team_rewards((select referred_by from public.profiles where id = new.user_id));
  end if;
  return new;
end;
$$;
create trigger orders_grant_team_rewards after update of status on public.orders
  for each row execute function public.orders_grant_team_rewards();

-- Paliers vus par le membre : objectif, montant, progression et date d'obtention
create or replace function public.my_team_rewards()
returns table (tier_id uuid, invited_count integer, amount numeric, invested_invitees integer, granted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, coalesce(g.invited_count, t.invited_count), coalesce(g.amount, t.amount),
         public.count_invested_invitees(auth.uid()), g.created_at
  from public.team_reward_tiers t
  left join public.team_reward_grants g on g.tier_id = t.id and g.user_id = auth.uid()
  where t.is_active or g.id is not null
  order by coalesce(g.invited_count, t.invited_count);
$$;

-- Admin : remplace la liste des paliers, puis crédite ceux qui sont déjà atteints.
-- p_tiers = [{"invited_count": 5, "amount": 500}, …]
create or replace function public.admin_set_team_reward_tiers(p_tiers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_item jsonb;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_count integer;
  v_amount numeric;
  v_referrer uuid;
begin
  if jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'Liste de paliers invalide.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_tiers) loop
    v_count := (v_item ->> 'invited_count')::integer;
    v_amount := (v_item ->> 'amount')::numeric;
    if v_count is null or v_count < 1 or v_amount is null or v_amount <= 0 then
      raise exception 'Chaque palier doit avoir un nombre d''invités (1 minimum) et un montant positif.' using errcode = 'P0001';
    end if;
    -- Même nombre d'invités = même palier : un membre déjà récompensé ne l'est pas deux fois
    insert into public.team_reward_tiers (invited_count, amount) values (v_count, v_amount)
      on conflict (invited_count) do update set amount = excluded.amount, is_active = true
      returning id into v_id;
    v_keep := v_keep || v_id;
  end loop;
  -- Paliers retirés : désactivés (l'historique des récompenses déjà versées est conservé)
  update public.team_reward_tiers set is_active = false where is_active and not (id = any (v_keep));

  perform public.log_audit('team_rewards.update', 'team_reward_tiers', null, jsonb_build_object('tiers', p_tiers));
  -- Les membres qui atteignent déjà un nouveau palier sont crédités tout de suite
  for v_referrer in select distinct referred_by from public.profiles where referred_by is not null loop
    perform public.grant_team_rewards(v_referrer);
  end loop;
end;
$$;

-- -- Mon équipe : nom et numéro visibles aux niveaux 1 et 2, masqué au niveau 3 ---
drop function if exists public.my_team();
create function public.my_team()
returns table (
  display_name text, phone text, province text, city text, joined_at timestamptz, level integer,
  has_invested boolean, products_count integer, invested_amount numeric, commissions numeric
)
language sql stable security definer set search_path = public as $$
  with recursive team as (
    select p.id, p.full_name, p.phone, p.province, p.city, p.created_at, 1 as level
    from public.profiles p where p.referred_by = auth.uid()
    union all
    select p.id, p.full_name, p.phone, p.province, p.city, p.created_at, t.level + 1
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
      when t.level <= 2 then public.format_local_phone(t.phone)
      else left(public.format_local_phone(t.phone), 3) || ' ••• ' || right(t.phone, 3)
    end,
    t.province,
    t.city,
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

revoke execute on function public.complete_my_profile(text, text, text) from public, anon;
grant execute on function public.complete_my_profile(text, text, text) to authenticated;
revoke execute on function public.count_invested_invitees(uuid), public.grant_team_rewards(uuid),
  public.orders_grant_team_rewards() from public, anon, authenticated;
revoke execute on function public.my_team_rewards(), public.my_team(), public.admin_set_team_reward_tiers(jsonb) from public, anon;
grant execute on function public.my_team_rewards(), public.my_team(), public.admin_set_team_reward_tiers(jsonb) to authenticated;
