-- =============================================================================
-- Suppression des données de démonstration (après validation par l'avocat).
-- Comptes démo : numéros 099 000 10xx (243990001000 à 243990001099).
-- Produit démo : « City Car (DÉMO) ».
-- À exécuter UNE fois, dans l'éditeur SQL de Supabase ou par Claude.
-- =============================================================================
begin;

create temporary table demo_users on commit drop as
  select id from public.profiles where phone like '2439900010%';

delete from public.team_reward_grants where user_id in (select id from demo_users);
-- Revenus automatiques et bonus : ils pointent vers des transactions, à retirer avant elles
delete from public.product_daily_credits where user_id in (select id from demo_users);
delete from public.gift_claims where user_id in (select id from demo_users);
delete from public.product_revenue_payouts where user_id in (select id from demo_users);
delete from public.referral_commissions
  where referrer_id in (select id from demo_users) or referred_id in (select id from demo_users);
-- Frais liés aux retraits d'abord, puis le reste des opérations
delete from public.transactions where user_id in (select id from demo_users) and related_transaction_id is not null;
delete from public.transactions where user_id in (select id from demo_users);
delete from public.payments where user_id in (select id from demo_users);
delete from public.order_status_history where order_id in (select id from public.orders where user_id in (select id from demo_users));
delete from public.order_items where order_id in (select id from public.orders where user_id in (select id from demo_users));
delete from public.orders where user_id in (select id from demo_users);
-- Profil, rôles, notifications et portefeuille de retrait suivent le compte
delete from auth.users where id in (select id from demo_users);

-- Le produit démo est supprimé, sauf si un vrai membre l'a acheté : il est alors archivé
delete from public.product_revenue_distributions d using public.vehicles v
  where d.vehicle_id = v.id and v.brand = 'City Car' and v.model = '(DÉMO)'
    and not exists (select 1 from public.product_revenue_payouts p where p.distribution_id = d.id);
delete from public.vehicles v
  where v.brand = 'City Car' and v.model = '(DÉMO)'
    and not exists (select 1 from public.order_items i where i.vehicle_id = v.id);
update public.vehicles set status = 'archived'
  where brand = 'City Car' and model = '(DÉMO)';

commit;
