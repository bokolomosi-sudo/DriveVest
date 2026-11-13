-- =============================================================================
-- Espaces de la page Produits
--  * « standard » : produits habituels (espace par défaut, aucun changement pour l'existant)
--  * « prestige » : produits précieux, affichés dans l'onglet « Prestige »
-- L'administrateur choisit l'espace dans le formulaire du produit.
-- =============================================================================

alter table public.vehicles
  add column if not exists collection text not null default 'standard';

alter table public.vehicles drop constraint if exists vehicles_collection_check;
alter table public.vehicles
  add constraint vehicles_collection_check check (collection in ('standard', 'prestige'));

create index if not exists vehicles_status_collection_price_idx
  on public.vehicles (status, collection, price);
