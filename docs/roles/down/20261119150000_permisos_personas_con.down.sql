-- Down de 20261119150000_permisos_personas_con (T3).

begin;

drop function if exists public.personas_con_alguno(text[]);

delete from supabase_migrations.schema_migrations where version = '20261119150000';

commit;
