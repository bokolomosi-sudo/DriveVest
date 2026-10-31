-- =============================================================================
-- Super administrateur
--  * seul le super admin nomme ou retire les administrateurs
--  * réglages réservés au super admin : paramètres de la plateforme (frais, parrainage,
--    bonus, minimums, modules, coordonnées), paliers d'équipe, comptes de dépôt,
--    réseaux de retrait
--  * chaque action d'argent ou sensible faite par un admin prévient le super admin
--    (notification + push) ; une action louche est signalée comme alerte
-- =============================================================================

create or replace function public.assert_super_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Action réservée au super administrateur.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- -- Nommer / retirer un administrateur -------------------------------------------
create or replace function public.super_admin_set_admin(p_user_id uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_super uuid := public.assert_super_admin();
begin
  if p_user_id = v_super then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role = 'super_admin') then
    raise exception 'Ce compte est super administrateur : son rôle ne peut pas être modifié ici.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Membre introuvable.' using errcode = 'P0001';
  end if;

  if p_make_admin then
    if exists (select 1 from public.profiles where id = p_user_id and is_blocked) then
      raise exception 'Débloquez ce compte avant de le nommer administrateur.' using errcode = 'P0001';
    end if;
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'admin', v_super)
      on conflict (user_id, role) do nothing;
    perform public.notify_user(p_user_id, 'Vous êtes administrateur',
      'Le super administrateur vous a donné l''accès à l''administration de Drivest.', '/admin');
  else
    delete from public.user_roles where user_id = p_user_id and role = 'admin';
    perform public.notify_user(p_user_id, 'Accès administrateur retiré',
      'Votre accès à l''administration de Drivest a été retiré.', '/compte');
  end if;
end;
$$;

-- -- Réglages réservés au super admin --------------------------------------------
drop policy if exists platform_settings_update on public.platform_settings;
create policy platform_settings_update on public.platform_settings for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists deposit_channels_admin_insert on public.deposit_channels;
drop policy if exists deposit_channels_admin_update on public.deposit_channels;
drop policy if exists deposit_channels_admin_delete on public.deposit_channels;
create policy deposit_channels_admin_insert on public.deposit_channels for insert to authenticated
  with check ((select public.is_super_admin()));
create policy deposit_channels_admin_update on public.deposit_channels for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy deposit_channels_admin_delete on public.deposit_channels for delete to authenticated
  using ((select public.is_super_admin()));

drop policy if exists withdrawal_networks_admin_insert on public.withdrawal_networks;
drop policy if exists withdrawal_networks_admin_update on public.withdrawal_networks;
drop policy if exists withdrawal_networks_admin_delete on public.withdrawal_networks;
create policy withdrawal_networks_admin_insert on public.withdrawal_networks for insert to authenticated
  with check ((select public.is_super_admin()));
create policy withdrawal_networks_admin_update on public.withdrawal_networks for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy withdrawal_networks_admin_delete on public.withdrawal_networks for delete to authenticated
  using ((select public.is_super_admin()));

create or replace function public.admin_set_team_reward_tiers(p_tiers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_super_admin();
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

-- -- Alertes au super admin ----------------------------------------------------------
create or replace function public.audit_alert_super_admins()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_amount numeric;
  v_target uuid;
  v_actor_name text;
  v_target_name text;
  v_suspicious boolean := false;
  v_body text;
begin
  -- Seules les actions d'un admin (pas du super admin, ni du système) sont signalées
  if new.actor_id is null
     or exists (select 1 from public.user_roles where user_id = new.actor_id and role = 'super_admin')
     or not exists (select 1 from public.user_roles where user_id = new.actor_id and role = 'admin') then
    return new;
  end if;

  v_label := case new.action
    when 'wallet.adjustment' then
      case when new.details ->> 'direction' = 'debit' then 'a débité un compte' else 'a crédité un compte' end
    when 'deposit.confirm' then 'a validé un dépôt'
    when 'deposit.reject' then 'a refusé un dépôt'
    when 'withdrawal.pay' then 'a validé un retrait'
    when 'withdrawal.reject' then 'a refusé un retrait'
    when 'payment.verify' then 'a validé un paiement'
    when 'gift.create' then 'a créé un bonus surprise'
    when 'gift.enable' then 'a réactivé un bonus surprise'
    when 'user.password_reset' then 'a réinitialisé le mot de passe d''un membre'
    when 'withdrawal_account.reset' then 'a réinitialisé le portefeuille de retrait d''un membre'
    when 'user.block' then 'a bloqué un membre'
    when 'user.unblock' then 'a débloqué un membre'
    when 'order.status' then 'a changé le statut d''une commande'
    else null
  end;

  -- Produit modifié : seulement si le prix, le pourcentage ou la durée change ; suppression toujours
  if v_label is null and new.entity_type = 'vehicles' then
    if new.action = 'delete' then
      v_label := 'a supprimé un produit';
    elsif new.action = 'update'
      and ((new.details -> 'old' ->> 'price') is distinct from (new.details -> 'new' ->> 'price')
        or (new.details -> 'old' ->> 'daily_revenue_percent') is distinct from (new.details -> 'new' ->> 'daily_revenue_percent')
        or (new.details -> 'old' ->> 'duration_days') is distinct from (new.details -> 'new' ->> 'duration_days')) then
      v_label := 'a modifié le prix, le revenu ou la durée d''un produit';
    end if;
  end if;

  if v_label is null then
    return new;
  end if;

  v_amount := nullif(new.details ->> 'amount', '')::numeric;
  v_target := case
    when new.details ? 'user_id' then nullif(new.details ->> 'user_id', '')::uuid
    when new.entity_type = 'profiles' then nullif(new.entity_id, '')::uuid
    when new.entity_type = 'withdrawal_accounts' then nullif(new.entity_id, '')::uuid
  end;

  select coalesce(nullif(full_name, ''), phone, 'Un admin') into v_actor_name from public.profiles where id = new.actor_id;
  if v_target is not null then
    select coalesce(nullif(full_name, ''), phone, 'un membre') into v_target_name from public.profiles where id = v_target;
  end if;

  -- Louche : l'admin agit sur son propre compte, ajustement manuel d'argent, ou montant élevé
  v_suspicious := v_target = new.actor_id
    or new.action = 'wallet.adjustment'
    or coalesce(v_amount, 0) >= 100000;

  v_body := v_actor_name || ' ' || v_label
    || coalesce(' de ' || replace(to_char(round(v_amount), 'FM999,999,999,999'), ',', ' ') || ' FC', '')
    || coalesce(' pour ' || v_target_name, '')
    || case when v_target = new.actor_id then ' (son propre compte)' else '' end
    || coalesce(' — motif : ' || nullif(new.details ->> 'reason', ''), '')
    || '.';

  insert into public.notifications (user_id, title, body, link)
  select r.user_id,
         case when v_suspicious then '🚨 Alerte : action d''un admin à vérifier' else 'Action d''un admin' end,
         left(v_body, 2000),
         '/admin/audit'
  from public.user_roles r
  where r.role = 'super_admin';
  return new;
exception when others then
  -- Une alerte ne doit jamais bloquer l'action elle-même
  return new;
end;
$$;
drop trigger if exists audit_alert_super_admins on public.audit_logs;
create trigger audit_alert_super_admins after insert on public.audit_logs
  for each row execute function public.audit_alert_super_admins();

-- -- Droits -----------------------------------------------------------------------
revoke execute on function public.assert_super_admin(), public.audit_alert_super_admins() from public, anon, authenticated;
-- Utilisée par les règles de sécurité (RLS) et par l'interface pour afficher les menus du super admin
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
revoke execute on function public.super_admin_set_admin(uuid, boolean), public.admin_set_team_reward_tiers(jsonb) from public, anon;
grant execute on function public.super_admin_set_admin(uuid, boolean), public.admin_set_team_reward_tiers(jsonb) to authenticated;
