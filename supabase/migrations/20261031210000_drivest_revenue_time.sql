-- Revenus du membre avec l'heure exacte du versement (revenue_at), pour que le site
-- les classe par jour selon le fuseau de la province du membre (UTC+1 ou UTC+2).
drop function if exists public.my_product_revenues();
create function public.my_product_revenues()
returns table (order_id uuid, vehicle_label text, revenue_date date, revenue_at timestamptz, amount numeric, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.order_id, trim(v.brand || ' ' || v.model), (c.due_at at time zone 'Africa/Kinshasa')::date, c.due_at, c.amount, c.created_at
  from public.product_daily_credits c
  join public.vehicles v on v.id = c.vehicle_id
  where c.user_id = auth.uid() and not c.skipped
  union all
  select p.order_id, trim(v.brand || ' ' || v.model), d.revenue_date, (d.revenue_date + time '12:00') at time zone 'Africa/Kinshasa', p.amount, p.created_at
  from public.product_revenue_payouts p
  join public.product_revenue_distributions d on d.id = p.distribution_id
  join public.vehicles v on v.id = d.vehicle_id
  where p.user_id = auth.uid()
  order by 4 desc;
$$;
revoke execute on function public.my_product_revenues() from public, anon;
grant execute on function public.my_product_revenues() to authenticated;
