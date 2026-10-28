-- Fige le search_path des fonctions triggers / utilitaires (avertissement du linter Supabase 0011).
alter function public.set_updated_at() set search_path = public;
alter function public.vehicles_set_published_at() set search_path = public;
alter function public.new_transaction_reference() set search_path = public;
alter function public.investment_offers_guard() set search_path = public;
