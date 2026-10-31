-- =============================================================================
-- Suppression de tous les comptes, SAUF :
--   * KYANGA (super admin)  : 243993160211
--   * Tresor Tambwe         : 243999330799
-- Les produits (véhicules) sont conservés tels quels.
-- Tout se fait en une seule transaction : en cas d'erreur, rien n'est supprimé.
-- À exécuter UNE fois dans le SQL Editor de Supabase. ACTION DÉFINITIVE.
-- =============================================================================
begin;

create temporary table comptes_a_supprimer on commit drop as
  select id from public.profiles
  where phone is distinct from '243993160211'
    and phone is distinct from '243999330799';

-- Parrainage, récompenses, revenus et bonus liés à ces comptes
delete from public.referral_commissions
  where referrer_id in (select id from comptes_a_supprimer) or referred_id in (select id from comptes_a_supprimer);
delete from public.team_reward_grants where user_id in (select id from comptes_a_supprimer);
delete from public.product_revenue_payouts where user_id in (select id from comptes_a_supprimer);
delete from public.product_daily_credits where user_id in (select id from comptes_a_supprimer);
delete from public.gift_claims where user_id in (select id from comptes_a_supprimer);

-- Opérations : frais de retrait d'abord (ils pointent vers le retrait), puis le reste
delete from public.transactions where user_id in (select id from comptes_a_supprimer) and related_transaction_id is not null;
delete from public.transactions where user_id in (select id from comptes_a_supprimer);
delete from public.refunds where user_id in (select id from comptes_a_supprimer);
delete from public.payments where user_id in (select id from comptes_a_supprimer);
delete from public.investment_participations where user_id in (select id from comptes_a_supprimer);
delete from public.orders where user_id in (select id from comptes_a_supprimer);

-- Le compte lui-même : profil, rôles, notifications, portefeuille de retrait, appareils suivent
delete from auth.users where id in (select id from comptes_a_supprimer);

-- Vérification : il ne doit rester que 2 comptes
select full_name, phone from public.profiles order by full_name;

commit;
