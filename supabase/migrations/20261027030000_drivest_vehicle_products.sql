-- =============================================================================
-- Véhicules vendus comme produits : durée, photos externes (Unsplash, licence
-- gratuite) et achat en un clic depuis le portefeuille.
-- =============================================================================

-- Photos : fichier dans Supabase Storage OU adresse https externe
alter table public.vehicle_images alter column storage_path drop not null;
alter table public.vehicle_images
  add column external_url text check (external_url is null or external_url ~ '^https://'),
  add constraint vehicle_image_source check (storage_path is not null or external_url is not null);

-- Durée associée au produit (en jours)
alter table public.vehicles
  add column duration_days integer check (duration_days is null or duration_days > 0);

-- Achat immédiat : crée la commande puis la règle avec le solde du portefeuille.
create or replace function public.buy_vehicle_with_wallet(p_vehicle_id uuid, p_idempotency_key uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  perform public.assert_feature('wallet');
  v_order := public.create_order(p_vehicle_id, p_idempotency_key, null, null);
  -- Double soumission : la commande existe déjà et a été réglée
  if v_order.status <> 'pending_confirmation' then
    return v_order;
  end if;
  perform public.pay_order_with_wallet(v_order.id);
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end;
$$;

revoke execute on function public.buy_vehicle_with_wallet(uuid, uuid) from public, anon, authenticated;
grant execute on function public.buy_vehicle_with_wallet(uuid, uuid) to authenticated;
