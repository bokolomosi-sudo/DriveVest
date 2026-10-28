-- Module d'investissement retiré : sa fonction de progression n'est plus appelable depuis l'API
revoke execute on function public.offer_progress() from public, anon, authenticated;
