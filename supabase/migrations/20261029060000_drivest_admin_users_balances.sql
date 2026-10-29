-- Liste des utilisateurs (admin) : solde disponible de chaque membre affiché
create or replace function public.admin_users_balances(p_user_ids uuid[])
returns table (user_id uuid, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin uuid := public.assert_admin();
begin
  return query
    select u.id, public.wallet_available(u.id, 'CDF')
    from unnest(coalesce(p_user_ids, '{}')) as u(id);
end;
$$;

revoke execute on function public.admin_users_balances(uuid[]) from public, anon;
grant execute on function public.admin_users_balances(uuid[]) to authenticated;
