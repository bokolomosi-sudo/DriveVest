-- =============================================================================
-- Mises à jour de données — 13 et 14 novembre 2026 (déjà appliquées en production)
--
--  1. Photos Unsplash (licence Unsplash gratuite, vérifiées visuellement) pour
--     les 9 produits Prestige, enregistrées via vehicle_images.external_url.
--  2. Désactivation des anciens produits « standard » (status = 'inactive'),
--     remplacés par la collection Prestige publiée.
--
-- Script idempotent : il peut être rejoué sans créer de doublons.
-- =============================================================================

-- 1. Photos des produits Prestige ---------------------------------------------
insert into public.vehicle_images (vehicle_id, external_url, alt, sort_order)
select v.id, x.url, x.alt, x.ord
from (values
  -- Rolls-Royce Cullinan
  ('VH-F97D46FB', 'https://images.unsplash.com/photo-1772990915311-0710c4e7e74a', 'Rolls-Royce Cullinan, vue de face', 0),
  ('VH-F97D46FB', 'https://images.unsplash.com/photo-1625510872834-7db6c4273870', 'Rolls-Royce Cullinan en showroom', 1),
  -- Bentley Continental GT
  ('VH-07716D91', 'https://images.unsplash.com/photo-1661683768522-2113b9ad82f9', 'Bentley Continental GT grise, calandre avant', 0),
  -- Lamborghini Urus S
  ('VH-0F10E840', 'https://images.unsplash.com/photo-1707030949340-3435af59fe01', 'Lamborghini Urus jaune, vue de trois-quarts', 0),
  ('VH-0F10E840', 'https://images.unsplash.com/photo-1549288830-f95a7354fea8', 'Lamborghini Urus jaune, vue de face', 1),
  -- Mercedes-AMG G 63
  ('VH-F62F3E33', 'https://images.unsplash.com/photo-1648413653877-ade5eefd2f1b', 'Mercedes-AMG G 63 noir devant des montagnes enneigées', 0),
  ('VH-F62F3E33', 'https://images.unsplash.com/photo-1648413653819-7c0fd93e8e6a', 'Mercedes-AMG G 63 noir sur piste mouillée', 1),
  -- Range Rover Autobiography
  ('VH-CA01A8D2', 'https://images.unsplash.com/photo-1767274592417-c986b7619c8c', 'Range Rover blanc, vue de face', 0),
  -- Porsche 911 Turbo S
  ('VH-5E110629', 'https://images.unsplash.com/photo-1611651336487-802fe164d3e5', 'Porsche 911 Turbo S argent, vue arrière', 0),
  -- Mercedes-Maybach Classe S 680
  ('VH-6A9C56BB', 'https://images.unsplash.com/photo-1749454006955-d677069782c4', 'Mercedes-Maybach Classe S, capot et calandre', 0),
  ('VH-6A9C56BB', 'https://images.unsplash.com/photo-1723083467074-748d2a908ee2', 'Mercedes-Maybach Classe S, monogramme Maybach', 1),
  ('VH-6A9C56BB', 'https://images.unsplash.com/photo-1584978591559-8b58d6e5089f', 'Mercedes-Maybach Classe S, intérieur arrière', 2),
  -- Ferrari Purosangue
  ('VH-4D238E41', 'https://images.unsplash.com/photo-1731317913350-df41a6c3ab3b', 'Ferrari Purosangue rouge, face avant', 0),
  ('VH-4D238E41', 'https://images.unsplash.com/photo-1714495784040-fb0c8a6f2d28', 'Ferrari Purosangue jaune, vue de trois-quarts', 1),
  ('VH-4D238E41', 'https://images.unsplash.com/photo-1714538701027-790deaef725b', 'Ferrari Purosangue noire, vue avant', 2),
  ('VH-4D238E41', 'https://images.unsplash.com/photo-1731317837697-f9942c7cd8ab', 'Ferrari Purosangue, sièges en cuir orange', 3),
  -- Aston Martin DBX707
  ('VH-57128DFF', 'https://images.unsplash.com/photo-1664928217716-2cb15c89783e', 'Aston Martin DBX707, vue arrière', 0),
  ('VH-57128DFF', 'https://images.unsplash.com/photo-1664928217880-d17360030adf', 'Aston Martin DBX707, arrière et échappements', 1),
  ('VH-57128DFF', 'https://images.unsplash.com/photo-1752681226624-eac359c57c58', 'Aston Martin DBX, logo sur carrosserie verte', 2)
) as x(ref, url, alt, ord)
join public.vehicles v on v.reference = x.ref
where not exists (
  select 1 from public.vehicle_images i
  where i.vehicle_id = v.id and i.external_url = x.url
);

-- 2. Désactivation des anciens produits standard ------------------------------
-- Statuts avant l'opération :
--   publiés  : VH-803E90BD (Toyota Coaster), VH-C8E99509 (Mercedes-Benz Sprinter),
--              VH-7690B92D (Isuzu Elf plateau), VH-6ADCE25E (Toyota Noah),
--              VH-34D5D1CB (City Car 911 GT3), VH-EA5BF486 (Toyota 911 GT3)
--   brouillon: VH-6DCF1DA0, VH-FB3F5F4A, VH-3C6C7407, VH-E2FB146A, VH-BCB284BB,
--              VH-4F7D4687, VH-B51026D4, VH-E96E9E58, VH-9D7BA382
update public.vehicles
set status = 'inactive', updated_at = now()
where collection = 'standard'
  and status in ('published', 'draft');
