-- Un produit publié a toujours un prix et une durée : plus de « prix sur demande ».
-- Les produits publiés sans prix repassent en brouillon le temps que l'admin le fixe.
update public.vehicles set status = 'draft'
  where status = 'published' and (price is null or price <= 0 or duration_days is null);

alter table public.vehicles add constraint published_requires_price_duration
  check (status <> 'published' or (price is not null and price > 0 and duration_days is not null));
