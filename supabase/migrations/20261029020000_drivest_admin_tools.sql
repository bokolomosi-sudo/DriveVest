-- =============================================================================
-- Outils d'administration
--  * comptes de dépôt (Airtel Money…) affichés sur la page Dépôt du client
--  * réinitialisation du mot de passe de connexion d'un membre
--  * réinitialisation du portefeuille de retrait (numéro + mot de passe de retrait)
--  * fiche complète d'un membre
-- =============================================================================

-- -- Comptes de dépôt -----------------------------------------------------------
create table public.deposit_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  account_number text not null check (char_length(trim(account_number)) between 3 and 40),
  account_name text check (char_length(account_name) <= 120),
  ussd_code text check (char_length(ussd_code) <= 40),
  instructions text check (char_length(instructions) <= 2000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deposit_channels_updated_at before update on public.deposit_channels
  for each row execute function public.set_updated_at();
create trigger deposit_channels_audit after insert or update or delete on public.deposit_channels
  for each row execute function public.audit_row_change();

alter table public.deposit_channels enable row level security;
revoke all on public.deposit_channels from anon, authenticated;
grant select, insert, update, delete on public.deposit_channels to authenticated;
create policy deposit_channels_select on public.deposit_channels for select to authenticated
  using (is_active or public.is_admin());
create policy deposit_channels_admin_insert on public.deposit_channels for insert to authenticated
  with check (public.is_admin());
create policy deposit_channels_admin_update on public.deposit_channels for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy deposit_channels_admin_delete on public.deposit_channels for delete to authenticated
  using (public.is_admin());

-- -- Mot de passe oublié : l'admin définit un mot de passe provisoire -------------
-- Le client ajoute « ::drivest » au mot de passe saisi (Supabase exige 6 caractères) :
-- le mot de passe enregistré doit suivre la même règle.
create or replace function public.admin_reset_user_password(p_user_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin uuid := public.assert_admin();
begin
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
  -- Les sessions ouvertes sont fermées : l'ancien mot de passe ne donne plus accès
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;

  perform public.log_audit('user.password_reset', 'profiles', p_user_id::text, '{}'::jsonb);
  perform public.notify_user(p_user_id, 'Mot de passe réinitialisé',
    'Votre mot de passe a été réinitialisé par le service client. Changez-le dans Sécurité après votre connexion.',
    '/compte/securite');
end;
$$;

-- -- Portefeuille de retrait : le membre pourra le configurer de nouveau --------
create or replace function public.admin_reset_withdrawal_account(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
begin
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

-- -- Fiche complète d'un membre (informations non lisibles directement) ---------
create or replace function public.admin_user_overview(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
  v_profile public.profiles;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'balance', public.wallet_available(p_user_id, 'CDF'),
    'sponsor', (select jsonb_build_object('id', s.id, 'full_name', s.full_name, 'phone', public.format_local_phone(s.phone))
                from public.profiles s where s.id = v_profile.referred_by),
    'withdrawal_account', (select jsonb_build_object('holder_name', w.holder_name,
                                                     'airtel_number', public.format_local_phone(w.airtel_number),
                                                     'failed_attempts', w.failed_attempts,
                                                     'locked_until', w.locked_until,
                                                     'created_at', w.created_at)
                           from public.withdrawal_accounts w where w.user_id = p_user_id),
    'team_level1', (select count(*) from public.profiles p where p.referred_by = p_user_id),
    'team_level2', (select count(*) from public.profiles p join public.profiles p1 on p.referred_by = p1.id
                    where p1.referred_by = p_user_id),
    'invested_invitees', public.count_invested_invitees(p_user_id),
    'total_deposits', coalesce((select sum(amount) from public.transactions
                                where user_id = p_user_id and type = 'deposit' and status = 'confirmed'), 0),
    'total_withdrawals', coalesce((select sum(amount) from public.transactions
                                   where user_id = p_user_id and type = 'withdrawal' and status = 'confirmed'), 0),
    'total_commissions', coalesce((select sum(amount) from public.referral_commissions
                                   where referrer_id = p_user_id and reversed_at is null), 0),
    'total_rewards', coalesce((select sum(amount) from public.team_reward_grants where user_id = p_user_id), 0)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_reset_user_password(uuid, text), public.admin_reset_withdrawal_account(uuid, text),
  public.admin_user_overview(uuid) from public, anon;
grant execute on function public.admin_reset_user_password(uuid, text), public.admin_reset_withdrawal_account(uuid, text),
  public.admin_user_overview(uuid) to authenticated;
