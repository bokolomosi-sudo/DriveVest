-- =============================================================================
-- Parrainage sur 3 niveaux (25 % / 5 % / 1 %) et franc congolais (CDF) unique.
-- Les commissions ne portent que sur des achats confirmés, jamais sur la
-- simple inscription d'un filleul.
-- =============================================================================

-- -- Taux par niveau --------------------------------------------------------
alter table public.platform_settings
  add column referral_level2_percent numeric(5, 2) not null default 0 check (referral_level2_percent between 0 and 100),
  add column referral_level3_percent numeric(5, 2) not null default 0 check (referral_level3_percent between 0 and 100);

grant update (referral_level2_percent, referral_level3_percent) on public.platform_settings to authenticated;

update public.platform_settings
  set referral_commission_percent = 25,
      referral_level2_percent = 5,
      referral_level3_percent = 1,
      referral_on_orders = true
  where id = 1;

-- -- Une commission par niveau et par opération -----------------------------
alter table public.referral_commissions
  add column level smallint not null default 1 check (level between 1 and 3);
alter table public.referral_commissions
  drop constraint referral_commissions_source_type_source_id_key;
alter table public.referral_commissions
  add constraint referral_commissions_source_level_key unique (source_type, source_id, level);

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

-- -- Équipe sur 3 niveaux ---------------------------------------------------
drop function if exists public.my_referrals();
create function public.my_referrals()
returns table (display_name text, joined_at timestamptz, level integer, commissions numeric)
language sql stable security definer set search_path = public as $$
  with recursive team as (
    select p.id, p.full_name, p.phone, p.created_at, 1 as level
    from public.profiles p where p.referred_by = auth.uid()
    union all
    select p.id, p.full_name, p.phone, p.created_at, t.level + 1
    from public.profiles p join team t on p.referred_by = t.id
    where t.level < 3
  )
  select
    coalesce(
      nullif(split_part(t.full_name, ' ', 1), '') || coalesce(' ' || left(nullif(split_part(t.full_name, ' ', 2), ''), 1) || '.', ''),
      -- Numéro masqué : seuls les 3 derniers chiffres sont visibles
      case when t.phone is not null then '+' || left(t.phone, 3) || ' ••• ••• ' || right(t.phone, 3) else 'Membre' end
    ),
    t.created_at,
    t.level,
    coalesce((select sum(c.amount) from public.referral_commissions c
              where c.referred_id = t.id and c.referrer_id = auth.uid() and c.reversed_at is null), 0)
  from team t
  order by t.level, t.created_at desc;
$$;
revoke execute on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- -- Franc congolais uniquement ---------------------------------------------
alter table public.platform_settings alter column default_currency set default 'CDF';
update public.platform_settings set default_currency = 'CDF' where id = 1;
alter table public.platform_settings add constraint platform_currency_cdf check (default_currency = 'CDF');

alter table public.vehicles alter column currency set default 'CDF';
alter table public.investment_offers alter column currency set default 'CDF';

-- Les véhicules en dollars sont retirés de la vente en attendant le catalogue officiel en CDF
-- (avant les contraintes : celles-ci s'appliquent aussi aux lignes modifiées)
update public.vehicles set status = 'draft' where currency <> 'CDF' and status = 'published';

-- NOT VALID : s'applique à toute nouvelle écriture sans bloquer sur les anciennes lignes
alter table public.vehicles add constraint vehicles_currency_cdf check (currency = 'CDF') not valid;
alter table public.investment_offers add constraint offers_currency_cdf check (currency = 'CDF') not valid;
alter table public.orders add constraint orders_currency_cdf check (currency = 'CDF') not valid;
alter table public.payments add constraint payments_currency_cdf check (currency = 'CDF') not valid;
alter table public.transactions add constraint transactions_currency_cdf check (currency = 'CDF') not valid;
