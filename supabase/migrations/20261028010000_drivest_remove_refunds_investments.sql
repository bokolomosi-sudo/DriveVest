-- Fonctionnalités retirées à la demande de l'exploitant : remboursements et
-- offres d'investissement. Les tables restent (historique), mais les fonctions
-- ne sont plus appelables depuis l'application.
update public.platform_settings set feature_investment = false, referral_on_investments = false where id = 1;

revoke execute on function
  public.request_refund(uuid, text),
  public.admin_process_refund(uuid, public.refund_status, text),
  public.invest(uuid, numeric, boolean, uuid),
  public.admin_distribute(uuid, numeric, text, text, text),
  public.admin_return_capital(uuid, numeric, text),
  public.admin_exit_participation(uuid, numeric, text),
  public.admin_cancel_offer(uuid, text)
from authenticated;
