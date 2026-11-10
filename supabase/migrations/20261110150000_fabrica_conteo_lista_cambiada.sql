-- Hotfix 10-11: cambiar una lista de conteo con un borrador abierto trababa el
-- cierre. En prod, Global tenía abierto un borrador cuando se sacó "Sardo pieza"
-- de la lista: su fila quedó en el borrador, la pantalla la escondía (muestra
-- solo la lista) pero cerrar_conteo_fabrica la incluía sin sugerido y el insert
-- en compras_solicitud_items fallaba por cantidad_sugerida not null ("Hay un
-- dato incompleto"). Eliminar el conteo tampoco servía: las cantidades cargadas
-- ya generaron compras_stock_movimientos y su FK conteo_id no deja borrar.
--
--   * Un borrador tiene siempre los ítems activos de su lista. Los que entran
--     los siembra la pantalla de Stock al abrir (como hasta ahora); los que
--     salen —se borran, se desactivan o cambian de lista— los quita este
--     trigger de los borradores de esa lista. Los cerrados no se tocan. Mismo
--     criterio que compras_eliminar_insumo de Bloque 2.
--   * Limpieza de los huérfanos que hubiera (en prod el de Global ya se borró a
--     mano el 10-11; acá queda por si aparece otro).
--   * eliminar_conteo_fabrica: si el conteo ya movió stock avisa con un mensaje
--     claro en vez del error de FK. Bloque 2 trae la misma regla
--     (20261005120000); cuando salga, su texto reemplaza a este.
--   * No se toca cerrar_conteo_fabrica: Bloque 2 lo redefine en migraciones
--     pendientes que pisarían cualquier cambio de este hotfix.
--
-- Vuelta atrás:
--   drop trigger if exists fabrica_conteo_definicion_items_quitar_de_borradores on public.fabrica_conteo_definicion_items;
--   drop function if exists public.fabrica_conteo_quitar_de_borradores();
--   y eliminar_conteo_fabrica con el cuerpo de 20260806110000.

-- security definer: RLS de fabrica_conteo_items no tiene política de borrado.
-- Un update que deja el ítem activo en la misma lista (cambio de meta, orden,
-- modo) no quita nada; el when del trigger no puede mirar new porque también
-- dispara en delete, así que se filtra acá.
create or replace function public.fabrica_conteo_quitar_de_borradores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.activo
     and new.definicion_id = old.definicion_id
     and new.item_id = old.item_id then
    return null;
  end if;

  delete from fabrica_conteo_items fci
  using fabrica_conteos c
  where c.id = fci.conteo_id
    and c.estado = 'borrador'
    and c.definicion_id = old.definicion_id
    and fci.item_id = old.item_id;
  return null;
end;
$$;

revoke execute on function public.fabrica_conteo_quitar_de_borradores() from public, anon, authenticated;

drop trigger if exists fabrica_conteo_definicion_items_quitar_de_borradores on public.fabrica_conteo_definicion_items;
create trigger fabrica_conteo_definicion_items_quitar_de_borradores
  after delete or update of activo, definicion_id, item_id on public.fabrica_conteo_definicion_items
  for each row
  when (old.activo)
  execute function public.fabrica_conteo_quitar_de_borradores();

-- Huérfanos existentes: filas de borradores que no están activas en su lista.
delete from public.fabrica_conteo_items fci
using public.fabrica_conteos c
where c.id = fci.conteo_id
  and c.estado = 'borrador'
  and not exists (
    select 1 from public.fabrica_conteo_definicion_items dci
    where dci.definicion_id = c.definicion_id
      and dci.item_id = fci.item_id
      and dci.activo);

create or replace function public.eliminar_conteo_fabrica(p_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if exists (select 1 from compras_stock_movimientos where conteo_id = p_id) then
    raise exception 'Este conteo ya movió stock y no se puede borrar. Corregí las cantidades que estén mal y cerralo.';
  end if;

  delete from fabrica_conteos where id = p_id and estado = 'borrador';

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;
end;
$$;
