-- Liens officiels affichés sur la page « Messages » (Telegram, groupe WhatsApp).
alter table public.platform_settings
  add column telegram_url text check (telegram_url is null or telegram_url ~ '^https://'),
  add column whatsapp_group_url text check (whatsapp_group_url is null or whatsapp_group_url ~ '^https://');

grant update (telegram_url, whatsapp_group_url) on public.platform_settings to authenticated;

-- Les véhicules de démonstration passent en francs congolais, prix à fixer par
-- l'administration avant publication (les photos sont conservées).
update public.vehicles set currency = 'CDF', price = null where currency <> 'CDF' and status = 'draft';
