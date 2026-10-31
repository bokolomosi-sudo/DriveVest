-- =============================================================================
-- Super administrateur invisible
--  * les admins peuvent de nouveau modifier les paramètres, règles, paliers, comptes de
--    dépôt et réseaux de retrait (le super admin est prévenu des changements sensibles)
--  * seul le super admin nomme ou retire un admin (inchangé)
--  * un admin ne voit jamais qu'un super admin existe : rôle caché, journal filtré,
--    messages d'erreur neutres, et il ne peut agir sur ce compte
-- =============================================================================

-- -- Réglages rendus aux admins ----------------------------------------------------
drop policy if exists platform_settings_update on public.platform_settings;
create policy platform_settings_update on public.platform_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists deposit_channels_admin_insert on public.deposit_channels;
drop policy if exists deposit_channels_admin_update on public.deposit_channels;
drop policy if exists deposit_channels_admin_delete on public.deposit_channels;
create policy deposit_channels_admin_insert on public.deposit_channels for insert to authenticated
  with check ((select public.is_admin()));
create policy deposit_channels_admin_update on public.deposit_channels for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy deposit_channels_admin_delete on public.deposit_channels for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists withdrawal_networks_admin_insert on public.withdrawal_networks;
drop policy if exists withdrawal_networks_admin_update on public.withdrawal_networks;
drop policy if exists withdrawal_networks_admin_delete on public.withdrawal_networks;
create policy withdrawal_networks_admin_insert on public.withdrawal_networks for insert to authenticated
  with check ((select public.is_admin()));
create policy withdrawal_networks_admin_update on public.withdrawal_networks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy withdrawal_networks_admin_delete on public.withdrawal_networks for delete to authenticated
  using ((select public.is_admin()));

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

-- -- Rôle et journal cachés aux admins ---------------------------------------------
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin()) and (role <> 'super_admin' or (select public.is_super_admin())))
  );

-- Schéma « private » : non exposé par l'API, la fonction ne peut pas être appelée pour deviner un compte
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.is_super_admin_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = p_user_id and role = 'super_admin');
$$;
revoke execute on function private.is_super_admin_user(uuid) from public, anon;
grant execute on function private.is_super_admin_user(uuid) to authenticated;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      (select public.is_admin())
      and entity_type <> 'user_roles'
      and (actor_id is null or not private.is_super_admin_user(actor_id))
    )
  );

-- -- Compte du super admin protégé (message neutre, rien ne le trahit) -----------------
create or replace function public.protect_hidden_account(p_user_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if private.is_super_admin_user(p_user_id) and not public.is_super_admin() then
    raise exception 'Action impossible sur ce compte.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_reset_user_password(p_user_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.assert_admin();
begin
  perform public.protect_hidden_account(p_user_id);
  if char_length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Le mot de passe doit contenir au moins 6 caractères.' using errcode = 'P0001';
  end if;
  update auth.users
    set encrypted_password = extensions.crypt(p_new_password || '::drivest', extensions.gen_salt('bf')),
        updated_at = now()
    where id = p_user_id;
  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;

  perform public.log_audit('user.password_reset', 'profiles', p_user_id::text, '{}'::jsonb);
  perform public.notify_user(p_user_id, 'Mot de passe réinitialisé',
    'Votre mot de passe a été réinitialisé par le service client. Changez-le dans Sécurité après votre connexion.',
    '/compte/securite');
end;
$$;

create or replace function public.admin_reset_withdrawal_account(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
begin
  perform public.protect_hidden_account(p_user_id);
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Indiquez le motif de la réinitialisation.' using errcode = 'P0001';
  end if;
  delete from public.withdrawal_accounts where user_id = p_user_id;
  if not found then
    raise exception 'Ce membre n''a pas de portefeuille de retrait.' using errcode = 'P0001';
  end if;
  perform public.log_audit('withdrawal_account.reset', 'withdrawal_accounts', p_user_id::text,
    jsonb_build_object('reason', trim(p_reason)));
  perform public.notify_user(p_user_id, 'Portefeuille de retrait réinitialisé',
    'Votre numéro Airtel Money et votre mot de passe de retrait ont été réinitialisés. Configurez-les de nouveau avant votre prochain retrait.',
    '/compte/retrait');
end;
$$;

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
  perform public.protect_hidden_account(p_user_id);

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

create or replace function public.admin_wallet_adjustment(p_user uuid, p_amount numeric, p_currency text, p_direction text, p_reason text)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_tx public.transactions;
  v_currency text := upper(trim(coalesce(p_currency, '')));
begin
  perform public.protect_hidden_account(p_user);
  if p_direction not in ('credit', 'debit') then
    raise exception 'Sens invalide.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Montant ou devise invalide.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Un motif détaillé est obligatoire (10 caractères minimum).' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;
  perform public.wallet_lock(p_user);
  if p_direction = 'debit' and public.wallet_available(p_user, v_currency) < p_amount then
    raise exception 'Solde disponible insuffisant pour ce débit.' using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction, admin_id)
  values (p_user, 'adjustment', p_amount, v_currency, 'confirmed', public.new_transaction_reference(),
          trim(p_reason), true, p_direction, v_admin)
  returning * into v_tx;

  perform public.log_audit('wallet.adjustment', 'transactions', v_tx.id::text,
    jsonb_build_object('user_id', p_user, 'amount', p_amount, 'currency', v_currency, 'direction', p_direction, 'reason', trim(p_reason)));
  perform public.notify_user(p_user, 'Ajustement de votre portefeuille', trim(p_reason), '/compte/portefeuille');
  return v_tx;
end;
$$;

-- Message neutre aussi pour la nomination des admins
create or replace function public.assert_super_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- -- Alertes : réglages sensibles modifiés par un admin -----------------------------
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
  v_old jsonb := new.details -> 'old';
  v_new jsonb := new.details -> 'new';
  v_changed text[];
begin
  -- Seules les actions d'un admin (pas du super admin, ni du système) sont signalées
  if new.actor_id is null
     or private.is_super_admin_user(new.actor_id)
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
    when 'team_rewards.update' then 'a modifié les récompenses d''équipe'
    else null
  end;

  if v_label is null and new.entity_type = 'vehicles' then
    if new.action = 'delete' then
      v_label := 'a supprimé un produit';
    elsif new.action = 'update'
      and ((v_old ->> 'price') is distinct from (v_new ->> 'price')
        or (v_old ->> 'daily_revenue_percent') is distinct from (v_new ->> 'daily_revenue_percent')
        or (v_old ->> 'duration_days') is distinct from (v_new ->> 'duration_days')) then
      v_label := 'a modifié le prix, le revenu ou la durée d''un produit';
    end if;
  end if;

  -- Frais, minimums, parrainage, bonus : les chiffres qui touchent à l'argent des membres
  if v_label is null and new.entity_type = 'platform_settings' and new.action = 'update' then
    select array_agg(k) into v_changed
    from unnest(array['withdrawal_fee_percent', 'withdrawal_fee_fixed', 'min_withdrawal', 'min_deposit',
                      'referral_commission_percent', 'referral_level2_percent', 'referral_level3_percent',
                      'signup_bonus', 'feature_wallet', 'feature_referral']) k
    where (v_old ->> k) is distinct from (v_new ->> k);
    if v_changed is not null then
      v_label := 'a modifié les règles d''argent (' || array_to_string(v_changed, ', ') || ')';
    end if;
  end if;

  -- Comptes de dépôt : un numéro changé peut détourner les dépôts des membres
  if v_label is null and new.entity_type = 'deposit_channels' then
    v_label := case new.action
      when 'insert' then 'a ajouté un compte de dépôt : ' || coalesce(v_new ->> 'name', '') || ' ' || coalesce(v_new ->> 'account_number', '')
      when 'delete' then 'a supprimé un compte de dépôt : ' || coalesce(v_old ->> 'account_number', '')
      else case when (v_old ->> 'account_number') is distinct from (v_new ->> 'account_number')
                  or (v_old ->> 'account_name') is distinct from (v_new ->> 'account_name')
                then 'a changé un compte de dépôt : ' || coalesce(v_old ->> 'account_number', '') || ' → ' || coalesce(v_new ->> 'account_number', '')
                     || ' (' || coalesce(v_new ->> 'account_name', '') || ')'
           end
    end;
    v_suspicious := v_label is not null and new.action <> 'delete';
  end if;

  if v_label is null and new.entity_type = 'withdrawal_networks' and new.action in ('insert', 'delete') then
    v_label := case new.action when 'insert' then 'a ajouté un réseau de retrait' else 'a supprimé un réseau de retrait' end;
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

  -- Louche : l'admin agit sur son propre compte, ajustement manuel, montant élevé, compte de dépôt changé
  v_suspicious := v_suspicious
    or v_target = new.actor_id
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

-- -- Droits -----------------------------------------------------------------------
revoke execute on function public.protect_hidden_account(uuid),
  public.audit_alert_super_admins(), public.assert_super_admin() from public, anon, authenticated;
revoke execute on function public.admin_reset_user_password(uuid, text), public.admin_reset_withdrawal_account(uuid, text),
  public.admin_set_user_blocked(uuid, boolean, text), public.admin_wallet_adjustment(uuid, numeric, text, text, text),
  public.admin_set_team_reward_tiers(jsonb) from public, anon;
grant execute on function public.admin_reset_user_password(uuid, text), public.admin_reset_withdrawal_account(uuid, text),
  public.admin_set_user_blocked(uuid, boolean, text), public.admin_wallet_adjustment(uuid, numeric, text, text, text),
  public.admin_set_team_reward_tiers(jsonb) to authenticated;
