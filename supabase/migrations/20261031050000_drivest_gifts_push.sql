-- =============================================================================
-- Bonus surprise et notifications push
--  * l'admin crée un bonus (montant, nombre de gagnants, date limite) : un code est généré
--  * le code est partagé dans le groupe ; seuls les membres ayant acheté un produit
--    peuvent l'utiliser, et seulement les N premiers (les suivants n'ont rien)
--  * chaque notification enregistrée est aussi envoyée en push sur le téléphone
--    (fonction Edge « send-push », appelée par pg_net)
--  * nouvelles notifications : achat confirmé, nouveau filleul, annonce publiée,
--    bonus reçu, et alertes admin (dépôt / retrait à traiter)
-- =============================================================================

-- -- Bonus surprise -------------------------------------------------------------
create table if not exists public.gift_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  title text not null check (char_length(title) between 2 and 120),
  message text check (char_length(message) <= 1000),
  amount numeric(14, 2) not null check (amount > 0),
  max_winners integer not null check (max_winners > 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.gift_claims (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gift_codes (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  unique (gift_id, user_id)
);
create index if not exists gift_claims_user_idx on public.gift_claims (user_id, created_at desc);
create index if not exists gift_claims_transaction_idx on public.gift_claims (transaction_id);

-- Les codes ne sont jamais lisibles par les membres (ils les reçoivent dans le groupe)
alter table public.gift_codes enable row level security;
alter table public.gift_claims enable row level security;
revoke all on public.gift_codes, public.gift_claims from anon, authenticated;
grant select on public.gift_codes, public.gift_claims to authenticated;
drop policy if exists gift_codes_admin_select on public.gift_codes;
create policy gift_codes_admin_select on public.gift_codes for select to authenticated using ((select public.is_admin()));
drop policy if exists gift_claims_select on public.gift_claims;
create policy gift_claims_select on public.gift_claims for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Code de 8 caractères sans lettres ambiguës (0/O, 1/I/L)
create or replace function public.new_gift_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.gift_codes where code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.admin_create_gift(
  p_title text, p_message text, p_amount numeric, p_max_winners integer, p_expires_at timestamptz default null
)
returns public.gift_codes language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_gift public.gift_codes;
begin
  if char_length(trim(coalesce(p_title, ''))) < 2 then
    raise exception 'Donnez un titre au bonus.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du bonus doit être positif.' using errcode = 'P0001';
  end if;
  if p_max_winners is null or p_max_winners < 1 then
    raise exception 'Indiquez combien de personnes peuvent gagner ce bonus.' using errcode = 'P0001';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'La date limite doit être dans le futur.' using errcode = 'P0001';
  end if;
  insert into public.gift_codes (code, title, message, amount, max_winners, expires_at, created_by)
  values (public.new_gift_code(), trim(p_title), nullif(trim(coalesce(p_message, '')), ''), round(p_amount, 2), p_max_winners, p_expires_at, v_admin)
  returning * into v_gift;
  perform public.log_audit('gift.create', 'gift_codes', v_gift.id::text,
    jsonb_build_object('amount', v_gift.amount, 'max_winners', v_gift.max_winners));
  return v_gift;
end;
$$;

create or replace function public.admin_set_gift_active(p_gift_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.gift_codes set is_active = p_active where id = p_gift_id;
  if not found then
    raise exception 'Bonus introuvable.' using errcode = 'P0001';
  end if;
  perform public.log_audit(case when p_active then 'gift.enable' else 'gift.disable' end, 'gift_codes', p_gift_id::text);
end;
$$;

-- Liste admin : bonus avec nombre de gagnants
create or replace function public.admin_list_gifts()
returns table (
  id uuid, code text, title text, message text, amount numeric, max_winners integer,
  expires_at timestamptz, is_active boolean, created_at timestamptz, winners integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    select g.id, g.code, g.title, g.message, g.amount, g.max_winners, g.expires_at, g.is_active, g.created_at,
           (select count(*)::integer from public.gift_claims c where c.gift_id = g.id)
    from public.gift_codes g
    order by g.created_at desc;
end;
$$;

-- Gagnants d'un bonus (admin)
create or replace function public.admin_gift_winners(p_gift_id uuid)
returns table (user_id uuid, full_name text, phone text, amount numeric, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    select c.user_id, p.full_name, p.phone, c.amount, c.created_at
    from public.gift_claims c
    join public.profiles p on p.id = c.user_id
    where c.gift_id = p_gift_id
    order by c.created_at;
end;
$$;

-- Le membre utilise un code
create or replace function public.claim_gift(p_code text)
returns public.gift_claims language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_gift public.gift_codes;
  v_claim public.gift_claims;
  v_tx public.transactions;
  v_count integer;
begin
  perform public.assert_feature('wallet');
  -- Verrou : deux membres qui valident en même temps ne dépassent pas le nombre de gagnants
  select * into v_gift from public.gift_codes where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then
    raise exception 'Code invalide. Vérifiez le code reçu dans le groupe.' using errcode = 'P0001';
  end if;
  if not v_gift.is_active then
    raise exception 'Ce bonus n''est plus disponible.' using errcode = 'P0001';
  end if;
  if v_gift.expires_at is not null and v_gift.expires_at <= now() then
    raise exception 'Trop tard : ce bonus a expiré.' using errcode = 'P0001';
  end if;
  if not public.has_purchased_product(v_uid) then
    raise exception 'Ce bonus est réservé aux membres qui ont déjà acheté un produit.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gift_claims where gift_id = v_gift.id and user_id = v_uid) then
    raise exception 'Vous avez déjà reçu ce bonus.' using errcode = 'P0001';
  end if;
  select count(*)::integer into v_count from public.gift_claims where gift_id = v_gift.id;
  if v_count >= v_gift.max_winners then
    raise exception 'Trop tard : tous les bonus ont déjà été distribués.' using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
  values (v_uid, 'adjustment', v_gift.amount, 'CDF', 'confirmed', public.new_transaction_reference(),
          'Bonus surprise : ' || v_gift.title, true, 'credit')
  returning * into v_tx;
  insert into public.gift_claims (gift_id, user_id, amount, transaction_id)
  values (v_gift.id, v_uid, v_gift.amount, v_tx.id)
  returning * into v_claim;
  perform public.notify_user(v_uid, 'Bonus surprise reçu',
    format('%s : %s FC ont été crédités sur votre compte.', v_gift.title, v_gift.amount), '/compte/bonus');
  return v_claim;
end;
$$;

-- Bonus reçus par le membre
create or replace function public.my_gift_claims()
returns table (title text, message text, amount numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.title, g.message, c.amount, c.created_at
  from public.gift_claims c
  join public.gift_codes g on g.id = c.gift_id
  where c.user_id = auth.uid()
  order by c.created_at desc;
$$;

-- -- Abonnements push -----------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Un appareil (endpoint) appartient au dernier compte connecté dessus
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
begin
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Abonnement aux notifications invalide.' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Réglages de l'envoi (adresse de la fonction Edge et secret partagé) : jamais lisibles par les clients
create table if not exists public.push_settings (
  id integer primary key default 1 check (id = 1),
  function_url text,
  webhook_secret text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
);
insert into public.push_settings (id) values (1) on conflict (id) do nothing;
alter table public.push_settings enable row level security;
revoke all on public.push_settings from anon, authenticated;

-- Chaque notification enregistrée part aussi en push (sans jamais bloquer l'enregistrement)
create or replace function public.notifications_send_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_settings public.push_settings;
begin
  select * into v_settings from public.push_settings where id = 1;
  if v_settings.function_url is null or to_regproc('net.http_post') is null then
    return new;
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return new;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using v_settings.function_url,
            jsonb_build_object('notification_id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_settings.webhook_secret);
  exception when others then
    null;
  end;
  return new;
end;
$$;
drop trigger if exists notifications_send_push on public.notifications;
create trigger notifications_send_push after insert on public.notifications
  for each row execute function public.notifications_send_push();

-- -- Nouvelles notifications -------------------------------------------------------
-- Achat confirmé
create or replace function public.orders_notify_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if new.status = 'payment_confirmed' and old.status is distinct from 'payment_confirmed' then
    select vehicle_label into v_label from public.order_items where order_id = new.id limit 1;
    perform public.notify_user(new.user_id, 'Achat confirmé',
      format('%s est actif. Vos revenus seront versés chaque jour à l''heure de votre achat.', coalesce(v_label, 'Votre produit')),
      '/compte/produits');
  end if;
  return new;
end;
$$;
drop trigger if exists orders_notify_purchase on public.orders;
create trigger orders_notify_purchase after update of status on public.orders
  for each row execute function public.orders_notify_purchase();

-- Nouveau filleul
create or replace function public.profiles_notify_referrer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is not null then
    perform public.notify_user(new.referred_by, 'Nouveau membre dans votre équipe',
      'Une personne vient de s''inscrire avec votre code. Elle comptera pour vos récompenses dès son premier achat.',
      '/compte/parrainage');
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_notify_referrer on public.profiles;
create trigger profiles_notify_referrer after insert on public.profiles
  for each row execute function public.profiles_notify_referrer();

-- Annonce publiée : tous les membres actifs sont prévenus
create or replace function public.announcements_notify_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.notifications (user_id, title, body, link)
    select p.id, left(new.title, 160), left(new.body, 300), '/actualites'
    from public.profiles p
    where not p.is_blocked;
  end if;
  return new;
end;
$$;
drop trigger if exists announcements_notify_members on public.announcements;
create trigger announcements_notify_members after insert or update of status on public.announcements
  for each row execute function public.announcements_notify_members();

-- Alertes admin : dépôt ou retrait à traiter
create or replace function public.transactions_notify_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and new.type in ('deposit', 'withdrawal') then
    insert into public.notifications (user_id, title, body, link)
    select distinct r.user_id,
      case when new.type = 'deposit' then 'Dépôt à vérifier' else 'Retrait à traiter' end,
      format('%s FC — %s', new.amount, coalesce(new.method, '')),
      '/admin/portefeuilles'
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.role in ('admin', 'super_admin') and not p.is_blocked;
  end if;
  return new;
end;
$$;
drop trigger if exists transactions_notify_admins on public.transactions;
create trigger transactions_notify_admins after insert on public.transactions
  for each row execute function public.transactions_notify_admins();

-- -- Droits -----------------------------------------------------------------------
revoke execute on function public.new_gift_code(), public.notifications_send_push(), public.orders_notify_purchase(),
  public.profiles_notify_referrer(), public.announcements_notify_members(), public.transactions_notify_admins()
  from public, anon, authenticated;
revoke execute on function public.admin_create_gift(text, text, numeric, integer, timestamptz),
  public.admin_set_gift_active(uuid, boolean), public.admin_list_gifts(), public.admin_gift_winners(uuid),
  public.claim_gift(text), public.my_gift_claims(),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.admin_create_gift(text, text, numeric, integer, timestamptz),
  public.admin_set_gift_active(uuid, boolean), public.admin_list_gifts(), public.admin_gift_winners(uuid),
  public.claim_gift(text), public.my_gift_claims(),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;
