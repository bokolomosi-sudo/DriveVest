-- =============================================================================
-- Performance pour de nombreux membres connectés en même temps
--  * règles d'accès (RLS) : auth.uid() et is_admin() calculés une fois par requête,
--    plus une fois par ligne (recommandation Supabase « auth_rls_initplan »)
--  * index sur les colonnes les plus consultées
-- =============================================================================
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.uid\(\)|is_admin\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)|is_admin\(\)')
  loop
    v_using := p.qual;
    v_check := p.with_check;
    -- Déjà optimisée (sous-requête) : on n'y touche pas
    if coalesce(v_using, '') ~* 'select auth\.uid' or coalesce(v_check, '') ~* 'select auth\.uid' then
      continue;
    end if;
    v_using := replace(replace(v_using, 'auth.uid()', '(select auth.uid())'), 'is_admin()', '(select public.is_admin())');
    v_check := replace(replace(v_check, 'auth.uid()', '(select auth.uid())'), 'is_admin()', '(select public.is_admin())');
    -- « public.(select public.is_admin()) » si l'appel était déjà préfixé
    v_using := replace(v_using, 'public.(select public.is_admin())', '(select public.is_admin())');
    v_check := replace(v_check, 'public.(select public.is_admin())', '(select public.is_admin())');
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end
$$;

create index if not exists transactions_order_idx on public.transactions (order_id);
create index if not exists transactions_related_idx on public.transactions (related_transaction_id);
create index if not exists transactions_type_status_idx on public.transactions (type, status, created_at);
create index if not exists referral_commissions_referred_idx on public.referral_commissions (referred_id);
create index if not exists referral_commissions_transaction_idx on public.referral_commissions (transaction_id);
create index if not exists payments_user_idx on public.payments (user_id);
create index if not exists vehicles_category_idx on public.vehicles (category_id);
create index if not exists team_reward_grants_tier_idx on public.team_reward_grants (tier_id);
create index if not exists team_reward_grants_transaction_idx on public.team_reward_grants (transaction_id);
create index if not exists order_items_vehicle_idx on public.order_items (vehicle_id);
