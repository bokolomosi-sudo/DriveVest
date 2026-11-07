-- =============================================================================
-- Tableau de bord admin : montants cumulés (en FC)
--  * total reçu (dépôts validés), solde total des membres
--  * total gagné par les membres (revenus des produits + commissions + récompenses d'équipe + bonus surprise)
--  * retraits payés, commissions versées, produits vendus et actifs
-- =============================================================================

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
    'confirmed_payments_by_currency', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount) total from public.payments where status = 'verified' group by currency) s), '{}'::jsonb),
    'deposits_pending', (select count(*) from public.transactions where type = 'deposit' and status = 'pending'),
    'withdrawals_pending', (select count(*) from public.transactions where type = 'withdrawal' and status = 'pending'),
    'kyc_pending', (select count(*) from public.profiles where kyc_status = 'pending'),
    'invested_by_currency', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount) total from public.investment_participations where status = 'active' group by currency) s), '{}'::jsonb),
    -- Montants cumulés (FC)
    'deposits_received_total', (select coalesce(sum(amount), 0) from public.transactions
      where type = 'deposit' and status = 'confirmed' and currency = 'CDF'),
    'members_balance_total', (select coalesce(sum(public.wallet_available(p.id, 'CDF')), 0) from public.profiles p),
    'users_earned_total', (select coalesce(sum(t.amount), 0) from public.transactions t
      where t.status = 'confirmed' and t.currency = 'CDF' and t.direction = 'credit'
        and (t.type in ('distribution', 'referral_commission')
             or t.id in (select transaction_id from public.team_reward_grants where transaction_id is not null)
             or t.id in (select transaction_id from public.gift_claims where transaction_id is not null))),
    'withdrawals_paid_total', (select coalesce(sum(amount), 0) from public.transactions
      where type = 'withdrawal' and status = 'confirmed' and currency = 'CDF'),
    'commissions_paid_total', (select coalesce(sum(amount), 0) from public.transactions
      where type = 'referral_commission' and status = 'confirmed' and currency = 'CDF'),
    'products_sold', (select count(*) from public.orders
      where status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping', 'delivered')),
    'products_active', (select count(*) from public.orders
      where status in ('payment_confirmed', 'confirmed', 'preparing', 'shipping'))
  );
end;
$$;
