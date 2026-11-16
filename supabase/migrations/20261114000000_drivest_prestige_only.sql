-- =============================================================================
-- Seuls les produits Prestige restent en vente
--  * les anciens produits (espace « standard ») publiés sont désactivés :
--    ils disparaissent de la page Produits et ne peuvent plus être achetés
--  * les membres qui les ont achetés continuent de recevoir leurs revenus
--    quotidiens jusqu'au terme (le versement ne dépend pas du statut du produit)
--  * un membre voit toujours la fiche et les photos des produits qu'il a achetés,
--    même désactivés, pour que « Mes produits » reste complet
-- =============================================================================

-- Vrai si le membre connecté a déjà commandé ce produit
create or replace function public.owns_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.vehicle_id = p_vehicle_id and o.user_id = auth.uid()
  );
$$;
revoke execute on function public.owns_vehicle(uuid) from public;
grant execute on function public.owns_vehicle(uuid) to anon, authenticated;

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles for select
  using (status = 'published' or (select public.is_admin()) or public.owns_vehicle(id));

drop policy if exists vehicle_images_select on public.vehicle_images;
create policy vehicle_images_select on public.vehicle_images for select
  using (exists (
    select 1 from public.vehicles v
    where v.id = vehicle_images.vehicle_id
      and (v.status = 'published' or (select public.is_admin()) or public.owns_vehicle(v.id))
  ));

-- Les anciens produits ne sont plus proposés à la vente
update public.vehicles set status = 'inactive'
where collection = 'standard' and status = 'published';
