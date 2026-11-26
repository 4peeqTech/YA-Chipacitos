-- Down de 20261119140000_permisos_mi_acceso (T3).

begin;

drop function if exists public.mi_acceso();

delete from supabase_migrations.schema_migrations where version = '20261119140000';

commit;
