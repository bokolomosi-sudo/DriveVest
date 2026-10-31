-- Active pg_net : la base appelle la fonction Edge send-push à chaque notification
-- (ignoré là où l'extension n'existe pas, comme la base de test locale)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
end $$;
