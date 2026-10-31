-- =============================================================================
-- Nettoyage et performances
--  * suppression des anciennes fonctions que le site n'utilise plus : versement
--    manuel des revenus, investissements, remboursements (évite un double versement
--    par erreur). Les tables sont conservées pour l'historique.
--  * index sur chaque clé étrangère qui n'en a pas (recherches et suppressions plus rapides)
-- =============================================================================

drop function if exists public.admin_distribute_product_revenue(uuid, date, numeric, text);
drop function if exists public.admin_product_revenue_preview(uuid, date);
drop function if exists public.active_product_holders(uuid, date);
drop function if exists public.invest(uuid, numeric, boolean, uuid);
drop function if exists public.offer_progress();
drop function if exists public.admin_cancel_offer(uuid, text);
drop function if exists public.admin_distribute(uuid, numeric, text, text, text);
drop function if exists public.admin_return_capital(uuid, numeric, text);
drop function if exists public.admin_exit_participation(uuid, numeric, text);
drop function if exists public.request_refund(uuid, text);
drop function if exists public.admin_process_refund(uuid, public.refund_status, text);

-- Un index par clé étrangère sans index couvrant (colonne unique, schéma public)
do $$
declare
  v_fk record;
begin
  for v_fk in
    select c.conrelid::regclass as tbl, cl.relname as tbl_name, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    execute format('create index if not exists %I on %s (%I)', left(v_fk.tbl_name || '_' || v_fk.col || '_fk_idx', 63), v_fk.tbl, v_fk.col);
  end loop;
end $$;
