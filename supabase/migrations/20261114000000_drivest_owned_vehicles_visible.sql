-- =============================================================================
-- Produits achetés toujours visibles par leur propriétaire
--
-- Un produit désactivé (status <> 'published') disparaît du catalogue, mais le
-- client qui l'a acheté doit continuer à voir son nom et ses photos dans
-- « Mes commandes » / « Mes produits ». On ajoute un droit de LECTURE limité aux
-- produits présents dans les commandes de l'utilisateur connecté.
-- Aucune donnée n'est modifiée ; l'achat reste impossible (create_order exige
-- toujours status = 'published').
-- =============================================================================

create or replace function public.user_owns_vehicle(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.vehicle_id = p_vehicle_id
      and o.user_id = (select auth.uid())
  );
$$;

-- Exécutable par anon aussi : la politique est évaluée pour les visiteurs du
-- catalogue (auth.uid() est alors nul, la fonction renvoie false).
revoke all on function public.user_owns_vehicle(uuid) from public;
grant execute on function public.user_owns_vehicle(uuid) to anon, authenticated;

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select using (
    status = 'published'
    or (select public.is_admin())
    or public.user_owns_vehicle(id)
  );

drop policy if exists vehicle_images_select on public.vehicle_images;
create policy vehicle_images_select on public.vehicle_images
  for select using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_images.vehicle_id
        and (v.status = 'published' or (select public.is_admin()))
    )
    or public.user_owns_vehicle(vehicle_id)
  );
