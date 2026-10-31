-- Un parrain qui n'a encore acheté aucun produit ne touche ni commission de parrainage
-- ni récompense d'équipe. Les commissions manquées ne sont pas rattrapées ; les paliers
-- d'équipe déjà atteints sont versés dès son premier achat.

create or replace function public.grant_referral_commission(
  p_referred uuid, p_base numeric, p_currency text, p_source_type text, p_source_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_settings public.platform_settings;
  v_current uuid := p_referred;
  v_referrer uuid;
  v_rate numeric;
  v_amount numeric;
  v_commission_id uuid;
  v_tx_id uuid;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if not v_settings.feature_referral then
    return;
  end if;
  if (p_source_type = 'order' and not v_settings.referral_on_orders)
     or (p_source_type = 'investment' and not v_settings.referral_on_investments) then
    return;
  end if;

  for v_level in 1..3 loop
    select referred_by into v_referrer from public.profiles where id = v_current;
    exit when v_referrer is null;
    v_current := v_referrer;

    v_rate := case v_level
      when 1 then v_settings.referral_commission_percent
      when 2 then v_settings.referral_level2_percent
      else v_settings.referral_level3_percent
    end;
    continue when v_rate <= 0;
    -- Un parrain bloqué ne touche rien, mais la chaîne continue au-dessus de lui
    continue when exists (select 1 from public.profiles where id = v_referrer and is_blocked);
    -- Idem pour un parrain qui n'a encore acheté aucun produit
    continue when not public.has_purchased_product(v_referrer);

    v_amount := round(p_base * v_rate / 100, 2);
    continue when v_amount <= 0;

    v_commission_id := null;
    insert into public.referral_commissions (referrer_id, referred_id, source_type, source_id, base_amount, rate, amount, currency, level)
    values (v_referrer, p_referred, p_source_type, p_source_id, p_base, v_rate, v_amount, p_currency, v_level)
    on conflict (source_type, source_id, level) do nothing
    returning id into v_commission_id;
    continue when v_commission_id is null;

    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
    values (v_referrer, 'referral_commission', v_amount, p_currency, 'confirmed', public.new_transaction_reference(),
            format('Commission de parrainage niveau %s', v_level), true, 'credit')
    returning id into v_tx_id;
    update public.referral_commissions set transaction_id = v_tx_id where id = v_commission_id;
    perform public.notify_user(v_referrer, 'Commission de parrainage',
      format('Vous avez reçu %s %s (niveau %s, %s %%).', v_amount, p_currency, v_level, v_rate), '/compte/parrainage');
  end loop;
end;
$$;

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
  -- Pas de récompense tant que le parrain n'a pas lui-même acheté un produit
  if not public.has_purchased_product(p_user_id) then
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

-- Déclenchement : quand une commande est réglée, on récompense le parrain de l'acheteur
-- et l'acheteur lui-même (paliers atteints avant son propre premier achat).
create or replace function public.orders_grant_team_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('draft', 'pending_confirmation')
     and new.status not in ('draft', 'pending_confirmation', 'cancelled', 'refunded') then
    perform public.grant_team_rewards((select referred_by from public.profiles where id = new.user_id));
    perform public.grant_team_rewards(new.user_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.grant_referral_commission(uuid, numeric, text, text, uuid),
  public.grant_team_rewards(uuid), public.orders_grant_team_rewards() from public, anon, authenticated;
