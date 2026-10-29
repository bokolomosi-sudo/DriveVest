-- Service client : nom affiché sur WhatsApp et horaires, personnalisables par l'admin
alter table public.platform_settings
  add column support_name text check (char_length(support_name) <= 80),
  add column support_hours text check (char_length(support_hours) <= 160);
update public.platform_settings set support_name = 'Service client Drivest' where id = 1 and support_name is null;
grant update (support_name, support_hours) on public.platform_settings to authenticated;
