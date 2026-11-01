-- =============================================================================
-- Dépôts automatiques par SMS
--  * le téléphone qui reçoit les paiements Mobile Money transfère chaque SMS
--    (application « SMS Forwarder ») vers la fonction Edge « sms-webhook »
--  * le SMS est enregistré ; s'il contient la référence (ID de transaction) d'un dépôt
--    en attente ET le même montant, le dépôt est validé automatiquement
--  * l'ordre n'a pas d'importance : SMS avant ou après la déclaration du membre
--  * montant différent ou référence inconnue : rien n'est crédité, l'admin voit le SMS
-- =============================================================================

create table if not exists public.auto_deposit_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  webhook_token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  -- Expéditeurs acceptés (nom ou numéro qui envoie le SMS de paiement), insensible à la casse
  allowed_senders text[] not null default array['436'],
  updated_at timestamptz not null default now()
);
insert into public.auto_deposit_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.incoming_sms (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  body text not null,
  sim text,
  sent_at timestamptz,
  received_at timestamptz not null default now(),
  -- ignored_sender : expéditeur non autorisé ; unmatched : aucun dépôt correspondant (pour l'instant)
  -- matched : dépôt validé ; amount_mismatch : référence trouvée mais montant différent
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'amount_mismatch', 'ignored_sender')),
  matched_transaction_id uuid unique references public.transactions (id) on delete set null,
  note text
);
create index if not exists incoming_sms_received_idx on public.incoming_sms (received_at desc);
create index if not exists incoming_sms_status_idx on public.incoming_sms (status);

alter table public.auto_deposit_settings enable row level security;
alter table public.incoming_sms enable row level security;
revoke all on public.auto_deposit_settings, public.incoming_sms from anon, authenticated;
grant select, update (enabled, allowed_senders) on public.auto_deposit_settings to authenticated;
grant select on public.incoming_sms to authenticated;
drop policy if exists auto_deposit_settings_admin_select on public.auto_deposit_settings;
create policy auto_deposit_settings_admin_select on public.auto_deposit_settings for select to authenticated using ((select public.is_admin()));
drop policy if exists auto_deposit_settings_admin_update on public.auto_deposit_settings;
create policy auto_deposit_settings_admin_update on public.auto_deposit_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists incoming_sms_admin_select on public.incoming_sms;
create policy incoming_sms_admin_select on public.incoming_sms for select to authenticated using ((select public.is_admin()));

-- -- Comparaison référence / montant -------------------------------------------------
-- Référence normalisée : majuscules, sans espaces ni ponctuation finale
create or replace function public.normalize_reference(p_value text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9.]', '', 'g');
$$;

-- Le montant du dépôt apparaît-il dans le SMS ? (20000, 20 000, 20,000.00, 20.000,00 …)
create or replace function public.sms_contains_amount(p_body text, p_amount numeric)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_match text;
  v_clean text;
begin
  for v_match in select (regexp_matches(coalesce(p_body, ''), '\d[\d\s.,]*\d|\d', 'g'))[1] loop
    v_clean := regexp_replace(v_match, '\s', '', 'g');
    -- Format « 20,000.00 » : la virgule sépare les milliers
    begin
      if replace(v_clean, ',', '')::numeric = p_amount then return true; end if;
    exception when others then null;
    end;
    -- Format « 20.000,00 » : le point sépare les milliers
    begin
      if replace(replace(v_clean, '.', ''), ',', '.')::numeric = p_amount then return true; end if;
    exception when others then null;
    end;
  end loop;
  return false;
end;
$$;

-- -- Validation automatique ------------------------------------------------------------
create or replace function public.auto_confirm_deposit(p_tx_id uuid, p_sms_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions;
begin
  update public.transactions set status = 'confirmed', rejection_reason = null
    where id = p_tx_id and type = 'deposit' and status = 'pending'
    returning * into v_tx;
  if not found then
    return;
  end if;
  update public.incoming_sms set status = 'matched', matched_transaction_id = p_tx_id, note = null where id = p_sms_id;
  perform public.log_audit('deposit.auto_confirm', 'transactions', p_tx_id::text,
    jsonb_build_object('user_id', v_tx.user_id, 'amount', v_tx.amount, 'sms_id', p_sms_id, 'reference', v_tx.external_reference));
  perform public.notify_user(v_tx.user_id, 'Dépôt crédité',
    format('Votre dépôt de %s FC a été vérifié et crédité automatiquement.', v_tx.amount), '/compte/depot');
end;
$$;

-- Cherche, pour un SMS, le dépôt en attente qui porte sa référence
create or replace function public.match_sms_to_deposit(p_sms_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sms public.incoming_sms;
  v_tx public.transactions;
  v_norm_body text;
begin
  select * into v_sms from public.incoming_sms where id = p_sms_id for update;
  if not found or v_sms.status not in ('unmatched', 'amount_mismatch') then
    return;
  end if;
  if not (select enabled from public.auto_deposit_settings where id = 1) then
    return;
  end if;
  v_norm_body := public.normalize_reference(v_sms.body);

  for v_tx in
    select t.* from public.transactions t
    where t.type = 'deposit' and t.status = 'pending'
      and char_length(public.normalize_reference(rtrim(t.external_reference, '.'))) >= 6
      and position(public.normalize_reference(rtrim(t.external_reference, '.')) in v_norm_body) > 0
    order by t.created_at
    for update skip locked
  loop
    if public.sms_contains_amount(v_sms.body, v_tx.amount) then
      perform public.auto_confirm_deposit(v_tx.id, v_sms.id);
      return;
    end if;
    update public.incoming_sms
      set status = 'amount_mismatch',
          note = format('Référence trouvée (dépôt de %s FC déclaré) mais le montant du SMS est différent : vérifiez avant de valider.', v_tx.amount)
      where id = v_sms.id;
    return;
  end loop;
end;
$$;

-- Cherche, pour un dépôt déclaré, un SMS déjà reçu avec la même référence
create or replace function public.match_deposit_to_sms(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions;
  v_ref text;
  v_sms public.incoming_sms;
begin
  select * into v_tx from public.transactions where id = p_tx_id and type = 'deposit' and status = 'pending';
  if not found or not (select enabled from public.auto_deposit_settings where id = 1) then
    return;
  end if;
  v_ref := public.normalize_reference(rtrim(v_tx.external_reference, '.'));
  if char_length(v_ref) < 6 then
    return;
  end if;
  for v_sms in
    select s.* from public.incoming_sms s
    where s.status in ('unmatched', 'amount_mismatch')
      and position(v_ref in public.normalize_reference(s.body)) > 0
    order by s.received_at desc
    for update skip locked
  loop
    if public.sms_contains_amount(v_sms.body, v_tx.amount) then
      perform public.auto_confirm_deposit(v_tx.id, v_sms.id);
    else
      update public.incoming_sms
        set status = 'amount_mismatch',
            note = format('Référence trouvée (dépôt de %s FC déclaré) mais le montant du SMS est différent : vérifiez avant de valider.', v_tx.amount)
        where id = v_sms.id;
    end if;
    return;
  end loop;
end;
$$;

create or replace function public.incoming_sms_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'unmatched' then
    perform public.match_sms_to_deposit(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists incoming_sms_after_insert on public.incoming_sms;
create trigger incoming_sms_after_insert after insert on public.incoming_sms
  for each row execute function public.incoming_sms_after_insert();

create or replace function public.transactions_match_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'deposit' and new.status = 'pending' then
    perform public.match_deposit_to_sms(new.id);
  end if;
  return new;
exception when others then
  -- La déclaration du dépôt ne doit jamais échouer à cause de la vérification automatique
  return new;
end;
$$;
drop trigger if exists transactions_match_deposit on public.transactions;
create trigger transactions_match_deposit after insert on public.transactions
  for each row execute function public.transactions_match_deposit();

-- Réception d'un SMS (appelée par la fonction Edge avec la clé service_role)
create or replace function public.receive_sms(p_token text, p_sender text, p_body text, p_sim text, p_sent_ms bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_settings public.auto_deposit_settings;
  v_status text := 'unmatched';
  v_id uuid;
  v_final text;
begin
  select * into v_settings from public.auto_deposit_settings where id = 1;
  if p_token is null or p_token <> v_settings.webhook_token then
    raise exception 'Jeton invalide.' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'SMS vide.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from unnest(v_settings.allowed_senders) s
    where upper(regexp_replace(s, '\s', '', 'g')) = upper(regexp_replace(coalesce(p_sender, ''), '\s', '', 'g'))
  ) then
    v_status := 'ignored_sender';
  end if;
  insert into public.incoming_sms (sender, body, sim, sent_at, status)
  values (left(coalesce(p_sender, '?'), 120), left(p_body, 2000), left(p_sim, 60),
          case when p_sent_ms > 0 then to_timestamp(p_sent_ms / 1000.0) end, v_status)
  returning id into v_id;
  select status into v_final from public.incoming_sms where id = v_id;
  return v_final;
end;
$$;

-- Admin : nouveau jeton (l'ancienne adresse du webhook cesse de fonctionner)
create or replace function public.admin_regenerate_sms_token()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform public.assert_admin();
  update public.auto_deposit_settings set webhook_token = v_token, updated_at = now() where id = 1;
  perform public.log_audit('auto_deposit.token_regenerated', 'auto_deposit_settings', '1');
  return v_token;
end;
$$;

-- -- Droits -----------------------------------------------------------------------
revoke execute on function public.auto_confirm_deposit(uuid, uuid), public.match_sms_to_deposit(uuid),
  public.match_deposit_to_sms(uuid), public.incoming_sms_after_insert(), public.transactions_match_deposit(),
  public.receive_sms(text, text, text, text, bigint) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.receive_sms(text, text, text, text, bigint) to service_role';
  end if;
end $$;
revoke execute on function public.admin_regenerate_sms_token() from public, anon;
grant execute on function public.admin_regenerate_sms_token() to authenticated;
