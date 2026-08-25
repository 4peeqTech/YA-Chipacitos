-- Fix: editar/crear/borrar en /admin/fabrica-parametros fallaba con 500 para
-- usuarios no-admin. tiene_acceso_compras() (20260810130000) exige rol admin
-- o algún módulo compras-*, pero la pantalla se abre con el módulo
-- fabrica_parametros, que no está en ese set. La escritura de esta pantalla
-- pasa a ser exclusiva de admin (decisión de producto), con su propio helper.

create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and estado = 'activo' and rol = 'admin'
  );
$$;

drop policy if exists "fabrica_sabores_escritura" on fabrica_sabores;
create policy "fabrica_sabores_escritura" on fabrica_sabores
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "fabrica_presentaciones_escritura" on fabrica_presentaciones;
create policy "fabrica_presentaciones_escritura" on fabrica_presentaciones
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "fabrica_tamanios_escritura" on fabrica_tamanios;
create policy "fabrica_tamanios_escritura" on fabrica_tamanios
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "fabrica_devolucion_motivos_escritura" on fabrica_devolucion_motivos;
create policy "fabrica_devolucion_motivos_escritura" on fabrica_devolucion_motivos
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "fabrica_operarios_escritura" on fabrica_operarios;
create policy "fabrica_operarios_escritura" on fabrica_operarios
  for all to authenticated using (es_admin()) with check (es_admin());
