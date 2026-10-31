-- Diffuse les modifications des paramètres (frais de retrait, etc.) en temps réel aux clients.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'platform_settings'
     ) then
    alter publication supabase_realtime add table public.platform_settings;
  end if;
end $$;
