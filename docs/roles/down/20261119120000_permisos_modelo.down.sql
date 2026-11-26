-- Down de 20261119120000_permisos_modelo (T1): borra las tablas del modelo y
-- locales_config.cuenta_local_id. profiles.modulos_permitidos no se tocó nunca, así
-- que el acceso vuelve a ser el de antes con el código anterior.
-- Si la siembra creó alguna fila de locales_config (Suc. Santa Fé en prod), queda:
-- es una sucursal más, sin cuenta.

begin;

drop table if exists public.permisos_historial;
drop table if exists public.persona_sucursales;
drop table if exists public.persona_permisos;
drop table if exists public.rol_permisos;
drop table if exists public.rol_areas;
drop table if exists public.permisos_catalogo;
alter table public.locales_config drop column if exists cuenta_local_id;

delete from supabase_migrations.schema_migrations where version = '20261119120000';

commit;
