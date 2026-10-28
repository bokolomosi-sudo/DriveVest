-- =============================================================================
-- DRIVEST — Schéma initial
-- Catalogue automobile, commandes, paiements vérifiés manuellement,
-- remboursements, journal des transactions, notifications, service client,
-- journal d'audit. Toutes les opérations sensibles passent par des fonctions
-- SQL SECURITY DEFINER ; le frontend n'écrit jamais directement dans les tables
-- financières.
--
-- Modules volontairement DÉSACTIVÉS (verrouillés par contrainte CHECK) :
--   - portefeuille (dépôts / retraits)
--   - investissement automobile
--   - parrainage
-- Ils ne pourront être activés que par une migration dédiée, une fois leur
-- cadre juridique et économique défini.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('client', 'admin', 'super_admin');
create type public.category_status as enum ('active', 'inactive', 'archived');
create type public.publication_status as enum ('draft', 'published', 'inactive', 'archived');
create type public.vehicle_condition as enum ('new', 'used');
create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'lpg', 'other');
create type public.transmission_type as enum ('manual', 'automatic', 'semi_automatic', 'other');
create type public.availability_status as enum ('available', 'reserved', 'sold', 'unavailable');
create type public.order_status as enum (
  'draft', 'pending_confirmation', 'payment_verification', 'payment_confirmed',
  'confirmed', 'preparing', 'shipping', 'delivered', 'cancelled', 'refunded'
);
create type public.payment_status as enum ('submitted', 'verified', 'rejected');
create type public.refund_status as enum ('requested', 'approved', 'rejected', 'completed');
create type public.transaction_type as enum ('order_payment', 'refund', 'deposit', 'withdrawal', 'fee', 'adjustment');
create type public.transaction_status as enum ('pending', 'confirmed', 'rejected', 'cancelled');
create type public.support_topic as enum ('order', 'payment', 'vehicle', 'refund', 'account', 'other');
create type public.support_status as enum ('open', 'in_progress', 'answered', 'closed');

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profils et rôles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 30),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 80),
  is_blocked boolean not null default false,
  blocked_reason text,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_requires_reason check (not is_blocked or coalesce(trim(blocked_reason), '') <> '')
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Les rôles vivent dans une table séparée : un utilisateur ne peut jamais
-- s'attribuer un rôle en modifiant son profil.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.role in ('admin', 'super_admin')
      and not p.is_blocked
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

-- Création automatique du profil et du rôle client à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    left(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), 30)
  );
  insert into public.user_roles (user_id, role) values (new.id, 'client');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Journal d'audit
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Trigger générique pour tracer les écritures administratives sur le catalogue
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_details jsonb;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_id := to_jsonb(new) ->> 'id';
    v_details := jsonb_build_object('new', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    v_id := to_jsonb(new) ->> 'id';
    v_details := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  else
    v_id := to_jsonb(old) ->> 'id';
    v_details := jsonb_build_object('old', to_jsonb(old));
  end if;
  perform public.log_audit(lower(tg_op), tg_table_name, v_id, v_details);
  return coalesce(new, old);
end;
$$;

create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- Paramètres de la plateforme (ligne unique)
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  accepted_payment_methods text[] not null default '{}',
  payment_instructions text,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  contact_address text,
  legal_notice text,
  feature_wallet boolean not null default false,
  feature_investment boolean not null default false,
  feature_referral boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  -- Verrous : ces modules ne doivent pas être activés sans cadre juridique,
  -- économique et technique. Lever ces contraintes par une migration dédiée.
  constraint wallet_locked check (feature_wallet = false),
  constraint investment_locked check (feature_investment = false),
  constraint referral_locked check (feature_referral = false)
);
insert into public.platform_settings (id) values (1);
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();
create trigger platform_settings_audit after update on public.platform_settings
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
create table public.vehicle_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  sort_order integer not null default 0,
  status public.category_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vehicle_categories_updated_at before update on public.vehicle_categories
  for each row execute function public.set_updated_at();
create trigger vehicle_categories_audit after insert or update or delete on public.vehicle_categories
  for each row execute function public.audit_row_change();

-- Taxonomie de départ (structure du catalogue, aucun véhicule n'est créé).
-- "Neufs" et "Occasion" sont gérés par le champ vehicles.condition.
insert into public.vehicle_categories (slug, name, sort_order) values
  ('berlines', 'Berlines', 10),
  ('suv-4x4', 'SUV et 4x4', 20),
  ('citadines', 'Citadines', 30),
  ('coupes-sportives', 'Coupés et voitures sportives', 40),
  ('pick-up', 'Pick-up', 50),
  ('utilitaires', 'Véhicules utilitaires', 60),
  ('minibus', 'Minibus', 70),
  ('camions', 'Camions', 80),
  ('electriques-hybrides', 'Véhicules électriques et hybrides', 90);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('VH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  category_id uuid references public.vehicle_categories (id) on delete restrict,
  brand text not null check (char_length(brand) between 1 and 60),
  model text not null check (char_length(model) between 1 and 80),
  year smallint check (year between 1900 and 2100),
  description text check (char_length(description) <= 10000),
  price numeric(14, 2) check (price >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  condition public.vehicle_condition not null,
  mileage_km integer check (mileage_km >= 0),
  fuel public.fuel_type,
  transmission public.transmission_type,
  engine text check (char_length(engine) <= 120),
  color text check (char_length(color) <= 60),
  seats smallint check (seats between 1 and 100),
  availability public.availability_status not null default 'available',
  location text check (char_length(location) <= 160),
  delivery_terms text check (char_length(delivery_terms) <= 2000),
  seller_name text check (char_length(seller_name) <= 120),
  seller_details text check (char_length(seller_details) <= 2000),
  status public.publication_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_requires_category check (status <> 'published' or category_id is not null)
);
create index vehicles_status_category_idx on public.vehicles (status, category_id);
create index vehicles_published_at_idx on public.vehicles (published_at desc);
create index vehicles_brand_idx on public.vehicles (lower(brand));
create index vehicles_price_idx on public.vehicles (price);

create or replace function public.vehicles_set_published_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at = now();
  end if;
  return new;
end;
$$;
create trigger vehicles_published_at before insert or update on public.vehicles
  for each row execute function public.vehicles_set_published_at();
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger vehicles_audit after insert or update or delete on public.vehicles
  for each row execute function public.audit_row_change();

create table public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null unique,
  alt text check (char_length(alt) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, sort_order);
create trigger vehicle_images_audit after insert or delete on public.vehicle_images
  for each row execute function public.audit_row_change();

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vehicle_id)
);

-- -----------------------------------------------------------------------------
-- Commandes
-- -----------------------------------------------------------------------------
create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('DRV-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0')),
  -- on delete restrict : l'historique commercial d'un utilisateur est conservé
  user_id uuid not null references public.profiles (id) on delete restrict,
  status public.order_status not null default 'pending_confirmation',
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  customer_note text check (char_length(customer_note) <= 2000),
  delivery_address text check (char_length(delivery_address) <= 500),
  cancel_reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  vehicle_label text not null,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  currency char(3) not null,
  quantity integer not null default 1 check (quantity > 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_vehicle_idx on public.order_items (vehicle_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- -----------------------------------------------------------------------------
-- Paiements, remboursements, transactions
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null,
  method text not null check (char_length(method) between 2 and 60),
  reference text not null check (char_length(reference) between 3 and 120),
  proof_path text,
  status public.payment_status not null default 'submitted',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  constraint rejection_requires_reason check (status <> 'rejected' or coalesce(trim(rejection_reason), '') <> '')
);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status, created_at);
-- Une même référence ne peut pas être déclarée deux fois (hors paiements refusés)
create unique index payments_reference_uniq on public.payments (lower(method), lower(reference))
  where status <> 'rejected';
-- Un seul paiement en vérification à la fois par commande
create unique index payments_one_pending_per_order on public.payments (order_id)
  where status = 'submitted';

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null,
  reason text not null check (char_length(reason) between 5 and 2000),
  status public.refund_status not null default 'requested',
  admin_note text,
  processed_by uuid references auth.users (id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index refunds_status_idx on public.refunds (status, created_at);
create unique index refunds_one_open_per_order on public.refunds (order_id)
  where status in ('requested', 'approved');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  type public.transaction_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null,
  status public.transaction_status not null default 'pending',
  reference text not null unique,
  reason text,
  order_id uuid references public.orders (id) on delete restrict,
  payment_id uuid unique references public.payments (id) on delete restrict,
  refund_id uuid unique references public.refunds (id) on delete restrict,
  admin_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (user_id, created_at desc);
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Notifications et annonces
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 2000),
  link text check (link is null or link ~ '^/'),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) <= 10000),
  status public.publication_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_status_idx on public.announcements (status, published_at desc);
create trigger announcements_published_at before insert or update on public.announcements
  for each row execute function public.vehicles_set_published_at();
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- Service client
-- -----------------------------------------------------------------------------
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  topic public.support_topic not null default 'other',
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 10 and 5000),
  status public.support_status not null default 'open',
  admin_response text,
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_requests_user_idx on public.support_requests (user_id, created_at desc);
create index support_requests_status_idx on public.support_requests (status, created_at);
create trigger support_requests_updated_at before update on public.support_requests
  for each row execute function public.set_updated_at();

-- Limitation anti-abus : 5 demandes par heure et par utilisateur
create or replace function public.support_requests_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.support_requests
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Trop de demandes envoyées. Réessayez dans une heure.' using errcode = 'P0001';
  end if;
  if new.order_id is not null and not exists (
    select 1 from public.orders where id = new.order_id and user_id = new.user_id
  ) then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger support_requests_rate_limit before insert on public.support_requests
  for each row execute function public.support_requests_rate_limit();

-- =============================================================================
-- Fonctions métier (RPC)
-- =============================================================================

create or replace function public.assert_active_user()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_blocked) then
    raise exception 'Votre compte est suspendu. Contactez le service client.' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.assert_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.record_order_status(p_order_id uuid, p_from public.order_status, p_to public.order_status, p_note text)
returns void language sql security definer set search_path = public as $$
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, p_from, p_to, auth.uid(), p_note);
$$;

create or replace function public.notify_user(p_user_id uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link) values (p_user_id, p_title, p_body, p_link);
$$;

create or replace function public.new_transaction_reference()
returns text language sql volatile as $$
  select 'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
$$;

-- -- Client : créer une commande ----------------------------------------------
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
    raise exception 'Vous avez déjà une commande en cours pour ce véhicule.' using errcode = 'P0001';
  end if;

  insert into public.orders (user_id, status, total_amount, currency, customer_note, delivery_address, idempotency_key)
  values (
    v_uid, 'pending_confirmation', v_vehicle.price, v_vehicle.currency,
    left(nullif(trim(p_customer_note), ''), 2000),
    left(nullif(trim(p_delivery_address), ''), 500),
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.order_items (order_id, vehicle_id, vehicle_label, unit_price, currency, quantity)
  values (
    v_order.id, v_vehicle.id,
    concat_ws(' ', v_vehicle.brand, v_vehicle.model, v_vehicle.year::text),
    v_vehicle.price, v_vehicle.currency, 1
  );

  perform public.record_order_status(v_order.id, null, 'pending_confirmation', 'Commande créée par le client');
  return v_order;
end;
$$;

-- -- Client : annuler sa commande ---------------------------------------------
create or replace function public.cancel_my_order(p_order_id uuid, p_reason text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_order public.orders;
  v_old_status public.order_status;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;
  v_old_status := v_order.status;
  if v_order.status not in ('draft', 'pending_confirmation', 'payment_verification') then
    raise exception 'Cette commande ne peut plus être annulée en ligne. Contactez le service client.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where order_id = p_order_id and status = 'verified') then
    raise exception 'Un paiement a déjà été confirmé : faites une demande de remboursement.' using errcode = 'P0001';
  end if;

  update public.payments
    set status = 'rejected', rejection_reason = 'Commande annulée par le client', reviewed_at = now()
    where order_id = p_order_id and status = 'submitted';
  update public.transactions set status = 'cancelled'
    where order_id = p_order_id and status = 'pending';

  update public.orders
    set status = 'cancelled', cancel_reason = left(nullif(trim(p_reason), ''), 500)
    where id = p_order_id
    returning * into v_order;

  perform public.record_order_status(p_order_id, v_old_status, 'cancelled', coalesce(nullif(trim(p_reason), ''), 'Annulée par le client'));
  return v_order;
end;
$$;

-- -- Client : déclarer un paiement (référence + justificatif) ------------------
-- La déclaration NE confirme PAS le paiement : un administrateur doit le vérifier.
create or replace function public.submit_payment(
  p_order_id uuid,
  p_method text,
  p_reference text,
  p_amount numeric,
  p_proof_path text default null
)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_order public.orders;
  v_payment public.payments;
  v_paid numeric;
  v_remaining numeric;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;
  if v_order.status not in ('pending_confirmation', 'payment_verification') then
    raise exception 'Cette commande n''attend pas de paiement.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where order_id = p_order_id and status = 'submitted') then
    raise exception 'Un paiement est déjà en cours de vérification pour cette commande.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = p_order_id and status = 'verified';
  v_remaining := v_order.total_amount - v_paid;
  if p_amount is null or p_amount <= 0 or p_amount > v_remaining then
    raise exception 'Montant invalide. Reste à payer : % %', v_remaining, v_order.currency using errcode = 'P0001';
  end if;
  if coalesce(trim(p_method), '') = '' or char_length(trim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Le moyen de paiement et la référence de transaction sont obligatoires.' using errcode = 'P0001';
  end if;
  if p_proof_path is not null and p_proof_path not like v_uid::text || '/%' then
    raise exception 'Justificatif invalide.' using errcode = 'P0001';
  end if;

  begin
    insert into public.payments (order_id, user_id, amount, currency, method, reference, proof_path)
    values (p_order_id, v_uid, p_amount, v_order.currency, trim(p_method), trim(p_reference), p_proof_path)
    returning * into v_payment;
  exception when unique_violation then
    raise exception 'Cette référence de paiement a déjà été déclarée.' using errcode = 'P0001';
  end;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, order_id, payment_id)
  values (v_uid, 'order_payment', p_amount, v_order.currency, 'pending', public.new_transaction_reference(),
          'Paiement déclaré pour la commande ' || v_order.order_number, v_order.id, v_payment.id);

  if v_order.status <> 'payment_verification' then
    update public.orders set status = 'payment_verification' where id = p_order_id;
    perform public.record_order_status(p_order_id, v_order.status, 'payment_verification', 'Paiement déclaré par le client');
  end if;

  return v_payment;
end;
$$;

-- -- Client : demander un remboursement ---------------------------------------
create or replace function public.request_refund(p_order_id uuid, p_reason text)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_order public.orders;
  v_paid numeric;
  v_refund public.refunds;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;
  if v_order.status = 'refunded' then
    raise exception 'Cette commande a déjà été remboursée.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Merci de préciser le motif de la demande.' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = p_order_id and status = 'verified';
  if v_paid <= 0 then
    raise exception 'Aucun paiement confirmé sur cette commande.' using errcode = 'P0001';
  end if;

  begin
    insert into public.refunds (order_id, user_id, amount, currency, reason)
    values (p_order_id, v_uid, v_paid, v_order.currency, trim(p_reason))
    returning * into v_refund;
  exception when unique_violation then
    raise exception 'Une demande de remboursement est déjà en cours pour cette commande.' using errcode = 'P0001';
  end;
  return v_refund;
end;
$$;

-- -- Admin : vérifier un paiement ---------------------------------------------
create or replace function public.admin_review_payment(p_payment_id uuid, p_approve boolean, p_reason text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_payment public.payments;
  v_order public.orders;
  v_paid numeric;
  v_new_status public.order_status;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable.' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'submitted' then
    raise exception 'Ce paiement a déjà été traité.' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  if p_approve then
    update public.payments set status = 'verified', reviewed_by = v_admin, reviewed_at = now()
      where id = p_payment_id returning * into v_payment;
    update public.transactions set status = 'confirmed', admin_id = v_admin where payment_id = p_payment_id;
    select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = v_order.id and status = 'verified';
    v_new_status := case when v_paid >= v_order.total_amount then 'payment_confirmed' else 'pending_confirmation' end;
  else
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Un motif de refus est obligatoire.' using errcode = 'P0001';
    end if;
    update public.payments
      set status = 'rejected', rejection_reason = trim(p_reason), reviewed_by = v_admin, reviewed_at = now()
      where id = p_payment_id returning * into v_payment;
    update public.transactions set status = 'rejected', admin_id = v_admin where payment_id = p_payment_id;
    v_new_status := 'pending_confirmation';
  end if;

  if v_order.status = 'payment_verification' then
    update public.orders set status = v_new_status where id = v_order.id;
    perform public.record_order_status(v_order.id, v_order.status, v_new_status,
      case when p_approve then 'Paiement vérifié' else 'Paiement refusé : ' || trim(p_reason) end);
  end if;

  perform public.log_audit(case when p_approve then 'payment.verify' else 'payment.reject' end,
    'payments', p_payment_id::text,
    jsonb_build_object('order_id', v_order.id, 'amount', v_payment.amount, 'currency', v_payment.currency, 'reason', p_reason));

  perform public.notify_user(v_payment.user_id,
    case when p_approve then 'Paiement confirmé' else 'Paiement refusé' end,
    case when p_approve
      then 'Votre paiement pour la commande ' || v_order.order_number || ' a été vérifié.'
      else 'Votre paiement pour la commande ' || v_order.order_number || ' a été refusé : ' || trim(p_reason)
    end,
    '/compte/commandes/' || v_order.id);

  return v_payment;
end;
$$;

-- -- Admin : faire avancer une commande ---------------------------------------
create or replace function public.admin_set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_order public.orders;
  v_allowed public.order_status[];
  v_vehicle_id uuid;
  v_old_status public.order_status;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0001';
  end if;
  v_old_status := v_order.status;

  -- Les passages "paiement confirmé" et "remboursée" sont réservés aux flux
  -- de vérification de paiement et de remboursement.
  v_allowed := case v_order.status
    when 'draft' then array['pending_confirmation', 'cancelled']::public.order_status[]
    when 'pending_confirmation' then array['cancelled']::public.order_status[]
    when 'payment_confirmed' then array['confirmed']::public.order_status[]
    when 'confirmed' then array['preparing']::public.order_status[]
    when 'preparing' then array['shipping']::public.order_status[]
    when 'shipping' then array['delivered']::public.order_status[]
    else array[]::public.order_status[]
  end;
  if not (p_status = any (v_allowed)) then
    raise exception 'Transition de statut non autorisée.' using errcode = 'P0001';
  end if;
  if p_status = 'cancelled' then
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Un motif d''annulation est obligatoire.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.payments where order_id = p_order_id and status = 'verified') then
      raise exception 'Des paiements ont été confirmés : traitez un remboursement.' using errcode = 'P0001';
    end if;
  end if;

  update public.orders
    set status = p_status,
        cancel_reason = case when p_status = 'cancelled' then trim(p_note) else cancel_reason end
    where id = p_order_id
    returning * into v_order;

  select vehicle_id into v_vehicle_id from public.order_items where order_id = p_order_id limit 1;
  if p_status = 'confirmed' then
    update public.vehicles set availability = 'reserved' where id = v_vehicle_id and availability = 'available';
  elsif p_status = 'delivered' then
    update public.vehicles set availability = 'sold' where id = v_vehicle_id;
  end if;

  perform public.record_order_status(p_order_id, v_old_status, p_status, nullif(trim(p_note), ''));
  perform public.log_audit('order.status', 'orders', p_order_id::text,
    jsonb_build_object('from', v_old_status, 'to', p_status, 'note', p_note));
  perform public.notify_user(v_order.user_id, 'Commande mise à jour',
    'Le statut de votre commande ' || v_order.order_number || ' a changé.', '/compte/commandes/' || v_order.id);
  return v_order;
end;
$$;

-- -- Admin : traiter un remboursement -----------------------------------------
-- "completed" signifie que le remboursement a été effectivement versé hors
-- plateforme ; l'administrateur en porte la responsabilité (audit).
create or replace function public.admin_process_refund(p_refund_id uuid, p_decision public.refund_status, p_note text default null)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_refund public.refunds;
  v_order public.orders;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Demande de remboursement introuvable.' using errcode = 'P0001';
  end if;
  if not (
    (v_refund.status = 'requested' and p_decision in ('approved', 'rejected'))
    or (v_refund.status = 'approved' and p_decision = 'completed')
  ) then
    raise exception 'Transition de remboursement non autorisée.' using errcode = 'P0001';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_note), '') = '' then
    raise exception 'Un motif de refus est obligatoire.' using errcode = 'P0001';
  end if;

  update public.refunds
    set status = p_decision, admin_note = coalesce(nullif(trim(p_note), ''), admin_note),
        processed_by = v_admin, processed_at = now()
    where id = p_refund_id
    returning * into v_refund;

  select * into v_order from public.orders where id = v_refund.order_id for update;

  if p_decision = 'completed' then
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, order_id, refund_id, admin_id)
    values (v_refund.user_id, 'refund', v_refund.amount, v_refund.currency, 'confirmed',
            public.new_transaction_reference(), 'Remboursement de la commande ' || v_order.order_number,
            v_order.id, v_refund.id, v_admin);
    update public.orders set status = 'refunded' where id = v_order.id;
    perform public.record_order_status(v_order.id, v_order.status, 'refunded', 'Remboursement effectué');
    update public.vehicles set availability = 'available'
      where id = (select vehicle_id from public.order_items where order_id = v_order.id limit 1)
        and availability = 'reserved';
  end if;

  perform public.log_audit('refund.' || p_decision::text, 'refunds', p_refund_id::text,
    jsonb_build_object('order_id', v_order.id, 'amount', v_refund.amount, 'note', p_note));
  perform public.notify_user(v_refund.user_id, 'Demande de remboursement mise à jour',
    'Votre demande pour la commande ' || v_order.order_number || ' a été mise à jour.', '/compte/commandes/' || v_order.id);
  return v_refund;
end;
$$;

-- -- Admin : bloquer / réactiver un compte ------------------------------------
create or replace function public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean, p_reason text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_profile public.profiles;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Un motif est obligatoire.' using errcode = 'P0001';
  end if;
  if p_user_id = v_admin then
    raise exception 'Vous ne pouvez pas modifier le statut de votre propre compte.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role = 'super_admin')
     and not public.is_super_admin() then
    raise exception 'Seul un super administrateur peut agir sur ce compte.' using errcode = '42501';
  end if;

  update public.profiles
    set is_blocked = p_blocked,
        blocked_reason = case when p_blocked then trim(p_reason) else null end,
        blocked_at = case when p_blocked then now() else null end
    where id = p_user_id
    returning * into v_profile;
  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;

  perform public.log_audit(case when p_blocked then 'user.block' else 'user.unblock' end,
    'profiles', p_user_id::text, jsonb_build_object('reason', trim(p_reason)));
  return v_profile;
end;
$$;

-- -- Admin : répondre au service client ---------------------------------------
create or replace function public.admin_respond_support(p_request_id uuid, p_response text, p_status public.support_status)
returns public.support_requests language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_req public.support_requests;
begin
  update public.support_requests
    set admin_response = coalesce(nullif(trim(p_response), ''), admin_response),
        status = p_status,
        responded_by = case when nullif(trim(p_response), '') is not null then v_admin else responded_by end,
        responded_at = case when nullif(trim(p_response), '') is not null then now() else responded_at end
    where id = p_request_id
    returning * into v_req;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'P0001';
  end if;

  perform public.log_audit('support.respond', 'support_requests', p_request_id::text,
    jsonb_build_object('status', p_status));
  if nullif(trim(p_response), '') is not null then
    perform public.notify_user(v_req.user_id, 'Réponse du service client',
      'Drivest a répondu à votre demande « ' || v_req.subject || ' ».', '/service-client');
  end if;
  return v_req;
end;
$$;

-- -- Admin : statistiques réelles ---------------------------------------------
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
    'confirmed_payments_by_currency', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount) total from public.payments where status = 'verified' group by currency) s), '{}'::jsonb)
  );
end;
$$;

-- =============================================================================
-- Privilèges et Row Level Security
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Lecture publique du catalogue
grant select on public.vehicle_categories, public.vehicles, public.vehicle_images,
  public.platform_settings, public.announcements to anon, authenticated;

-- Lecture authentifiée (filtrée par RLS)
grant select on public.profiles, public.user_roles, public.favorites, public.orders,
  public.order_items, public.order_status_history, public.payments, public.refunds,
  public.transactions, public.notifications, public.support_requests, public.audit_logs
  to authenticated;

-- Écritures client limitées à des colonnes précises
grant update (full_name, phone, city, country) on public.profiles to authenticated;
grant insert, delete on public.favorites to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant insert (user_id, order_id, topic, subject, message) on public.support_requests to authenticated;

-- Écritures administrateur (contrôlées par RLS via is_admin())
grant insert, update on public.vehicle_categories, public.vehicles, public.announcements to authenticated;
grant insert, update, delete on public.vehicle_images to authenticated;
grant update (default_currency, accepted_payment_methods, payment_instructions, contact_email,
  contact_phone, whatsapp_number, contact_address, legal_notice, updated_by)
  on public.platform_settings to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.vehicle_categories enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_images enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.support_requests enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin());

create policy platform_settings_select on public.platform_settings for select
  using (true);
create policy platform_settings_update on public.platform_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy categories_select on public.vehicle_categories for select
  using (status = 'active' or public.is_admin());
create policy categories_insert on public.vehicle_categories for insert to authenticated
  with check (public.is_admin());
create policy categories_update on public.vehicle_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy vehicles_select on public.vehicles for select
  using (status = 'published' or public.is_admin());
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (public.is_admin());
create policy vehicles_update on public.vehicles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy vehicle_images_select on public.vehicle_images for select
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and (v.status = 'published' or public.is_admin())));
create policy vehicle_images_insert on public.vehicle_images for insert to authenticated
  with check (public.is_admin());
create policy vehicle_images_update on public.vehicle_images for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy vehicle_images_delete on public.vehicle_images for delete to authenticated
  using (public.is_admin());

create policy favorites_select on public.favorites for select to authenticated
  using (user_id = auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated
  with check (user_id = auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated
  using (user_id = auth.uid());

create policy orders_select on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy order_status_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy refunds_select on public.refunds for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy transactions_select on public.transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy announcements_select on public.announcements for select
  using (status = 'published' or public.is_admin());
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.is_admin());
create policy announcements_update on public.announcements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy support_select on public.support_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy support_insert_own on public.support_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_blocked)
  );

-- -----------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- -----------------------------------------------------------------------------
revoke execute on function
  public.is_admin(), public.is_super_admin(), public.handle_new_user(), public.handle_user_email_change(),
  public.log_audit(text, text, text, jsonb), public.audit_row_change(), public.support_requests_rate_limit(),
  public.assert_active_user(), public.assert_admin(),
  public.record_order_status(uuid, public.order_status, public.order_status, text),
  public.notify_user(uuid, text, text, text), public.new_transaction_reference(),
  public.create_order(uuid, uuid, text, text), public.cancel_my_order(uuid, text),
  public.submit_payment(uuid, text, text, numeric, text), public.request_refund(uuid, text),
  public.admin_review_payment(uuid, boolean, text),
  public.admin_set_order_status(uuid, public.order_status, text),
  public.admin_process_refund(uuid, public.refund_status, text),
  public.admin_set_user_blocked(uuid, boolean, text),
  public.admin_respond_support(uuid, text, public.support_status),
  public.admin_dashboard_stats()
from public, anon, authenticated;

-- is_admin() est utilisée dans les politiques RLS évaluées pour anon et authenticated
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function
  public.create_order(uuid, uuid, text, text), public.cancel_my_order(uuid, text),
  public.submit_payment(uuid, text, text, numeric, text), public.request_refund(uuid, text),
  public.admin_review_payment(uuid, boolean, text),
  public.admin_set_order_status(uuid, public.order_status, text),
  public.admin_process_refund(uuid, public.refund_status, text),
  public.admin_set_user_blocked(uuid, boolean, text),
  public.admin_respond_support(uuid, text, public.support_status),
  public.admin_dashboard_stats()
to authenticated;

-- =============================================================================
-- Stockage
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-images', 'vehicle-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "vehicle_images_public_read" on storage.objects for select
  using (bucket_id = 'vehicle-images');
create policy "vehicle_images_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-images' and public.is_admin());
create policy "vehicle_images_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'vehicle-images' and public.is_admin());
create policy "vehicle_images_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-images' and public.is_admin());

-- Justificatifs : chaque client dépose dans son dossier {user_id}/...
create policy "payment_proofs_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "payment_proofs_read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
