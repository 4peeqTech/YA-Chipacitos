-- Nomenclador — ajustes de la revisión de código del MVP (T4).
--
--   1. Una variante archivada ya no bloquea crear otra para el mismo producto y
--      presentación (el índice único y el generador miran solo las activas).
--   2. No se reactiva un ítem que lleva componentes archivados.
--   3. Las escrituras de composición se serializan: dos guardados simultáneos
--      no pueden pasar la validación de ciclos a la vez.
--   4. Generador: no compone si la unidad de la presentación no coincide con la
--      del producto base, y un nombre ya usado por otro ítem activo se informa
--      como "conflicto" (en la vista previa y al crear) en vez de abortar todo.
--   5. El mensaje genérico de error ya no muestra el nombre interno de la regla.
--
-- Solo redefine funciones y un índice de tablas nuevas: no toca datos.

-- 1. Índice único de variantes, solo entre activas.
drop index if exists public.nomenclador_items_variante_uq;
create unique index nomenclador_items_variante_uq on public.nomenclador_items (variante_de, presentacion_id)
  where variante_de is not null and presentacion_id is not null and estado = 'activo';

-- 2. Trigger de ítems: igual que en 20261029120000 + bloqueo al reactivar con componentes archivados.
create or replace function public._nomenclador_items_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_usos text;
begin
  if tg_op = 'INSERT' then
    if new.codigo is null then new.codigo := _nomenclador_siguiente_codigo(new.tipo); end if;
    return new;
  end if;

  if new.codigo is distinct from old.codigo and new.tipo = old.tipo then
    raise exception 'El código de un ítem no se puede cambiar.';
  end if;

  if new.tipo <> old.tipo then
    if not old.a_revisar then
      raise exception 'El tipo solo se puede cambiar mientras el ítem está "a revisar" (cambia el código).';
    end if;
    new.codigo := _nomenclador_siguiente_codigo(new.tipo);
    if new.tipo in ('materia_prima', 'insumo', 'concepto')
       and exists (select 1 from nomenclador_componentes where item_id = new.id) then
      raise exception 'Ese tipo no lleva composición: primero quitale los componentes.';
    end if;
    if new.tipo = 'concepto'
       and exists (select 1 from nomenclador_componentes where componente_id = new.id) then
      raise exception 'Un concepto no puede ser componente de otro ítem, y este se usa en alguna composición.';
    end if;
  end if;

  if new.estado = 'archivado' and old.estado <> 'archivado' then
    select string_agg(i.codigo || ' ' || i.nombre, ', ' order by i.codigo) into v_usos
      from nomenclador_componentes c
      join nomenclador_items i on i.id = c.item_id
     where c.componente_id = new.id and i.estado = 'activo';
    if v_usos is not null then
      raise exception 'No se puede archivar: lo usan %.', v_usos;
    end if;
  end if;

  if new.estado = 'activo' and old.estado = 'archivado' then
    select string_agg(i.codigo || ' ' || i.nombre, ', ' order by i.codigo) into v_usos
      from nomenclador_componentes c
      join nomenclador_items i on i.id = c.componente_id
     where c.item_id = new.id and i.estado = 'archivado';
    if v_usos is not null then
      raise exception 'No se puede reactivar: lleva componentes archivados (%). Reactivalos o sacalos de la composición.', v_usos;
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

-- 3. Trigger de componentes: igual que en 20261029120000 + lock de transacción.
create or replace function public._nomenclador_componentes_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item nomenclador_items;
  v_comp nomenclador_items;
begin
  -- Serializa todas las escrituras de composición hasta el fin de la transacción.
  perform pg_advisory_xact_lock(hashtext('nomenclador_componentes'));

  select * into v_item from nomenclador_items where id = new.item_id;
  select * into v_comp from nomenclador_items where id = new.componente_id;

  if v_item.tipo in ('materia_prima', 'insumo', 'concepto') then
    raise exception '% no lleva composición: es %.', v_item.codigo,
      case v_item.tipo when 'materia_prima' then 'materia prima' when 'insumo' then 'un insumo' else 'un concepto' end;
  end if;
  if v_comp.tipo = 'concepto' then
    raise exception '% es un concepto y no puede ser componente.', v_comp.codigo;
  end if;
  if v_comp.estado = 'archivado' then
    raise exception '% está archivado y no puede usarse como componente.', v_comp.codigo;
  end if;

  if exists (
    with recursive debajo(id) as (
      select new.componente_id
      union
      select c.componente_id from nomenclador_componentes c join debajo d on c.item_id = d.id
    )
    select 1 from debajo where id = new.item_id
  ) then
    raise exception 'Se formaría un ciclo: % ya lleva (directa o indirectamente) a %.', v_comp.codigo, v_item.codigo;
  end if;
  return new;
end $$;

-- 5. Mensajes: el genérico no muestra nombres internos.
create or replace function public._nomenclador_mensaje_constraint(p_constraint text)
returns text language sql immutable set search_path = public as $$
  select case p_constraint
    when 'nomenclador_items_nombre_uq'              then 'Ya hay un ítem activo de ese tipo con ese nombre.'
    when 'nomenclador_items_variante_uq'            then 'Ese producto ya tiene un ítem activo para esa presentación.'
    when 'nomenclador_items_unidad_obligatoria'     then 'La unidad base es obligatoria (salvo en conceptos y combos).'
    when 'nomenclador_categorias_nombre_uq'         then 'Ya hay una categoría con ese nombre.'
    when 'nomenclador_sabores_nombre_uq'            then 'Ya hay un sabor con ese nombre.'
    when 'nomenclador_presentaciones_nombre_uq'     then 'Ya hay una presentación con ese nombre.'
    when 'nomenclador_presentaciones_cantidad_con_unidad' then 'La cantidad y la unidad de la presentación van juntas.'
    when 'nomenclador_externos_uq'                  then 'Ese código ya está cargado para ese sistema.'
    when 'nomenclador_componentes_uq'               then 'Un componente está repetido.'
    else 'Algún dato no es válido. Revisalo y volvé a intentar.'
  end;
$$;

-- Reactivar puede chocar con otro activo del mismo nombre o con otra variante activa.
create or replace function public.nomenclador_archivar_item(p_item_id uuid, p_archivar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_constraint text;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  update nomenclador_items set estado = case when p_archivar then 'archivado' else 'activo' end
   where id = p_item_id;
  if not found then raise exception 'Ese ítem no existe. Recargá la página.'; end if;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise exception 'No se puede reactivar: %', _nomenclador_mensaje_constraint(v_constraint);
end $$;

-- 4. Generador.
-- Devuelve [{accion: 'crear'|'existe'|'conflicto', tipo, nombre, codigo?, id?}, ...].
-- "conflicto": ya hay otro ítem activo con ese nombre que no es esta variante;
-- no se crea y el resto sigue.
create or replace function public.nomenclador_generar_variantes(
  p_base jsonb, p_sabores uuid[], p_presentaciones uuid[], p_simular boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_base text := btrim(p_base->>'nombre');
  v_cat uuid := (p_base->>'categoria_id')::uuid;
  v_unidad text := coalesce(p_base->>'unidad_base', 'kg');
  v_s nomenclador_sabores;
  v_p nomenclador_presentaciones;
  v_pt nomenclador_items;
  v_pv nomenclador_items;
  v_otro nomenclador_items;
  v_nombre_pt text;
  v_nombre_pv text;
  v_res jsonb := '[]'::jsonb;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  if coalesce(v_base, '') = '' then raise exception 'Escribí el nombre del producto base (ej. "Chipá").'; end if;
  if coalesce(array_length(p_sabores, 1), 0) = 0 then raise exception 'Elegí al menos un sabor.'; end if;
  if coalesce(array_length(p_presentaciones, 1), 0) = 0 then raise exception 'Elegí al menos una presentación.'; end if;

  for v_s in select * from nomenclador_sabores where id = any(p_sabores) order by orden, nombre loop
    v_nombre_pt := v_base || ' ' || v_s.nombre;
    select * into v_pt from nomenclador_items
     where tipo = 'producto_terminado' and estado = 'activo' and lower(btrim(nombre)) = lower(v_nombre_pt);
    if found then
      v_res := v_res || jsonb_build_object('accion', 'existe', 'tipo', 'producto_terminado',
                                           'nombre', v_pt.nombre, 'codigo', v_pt.codigo, 'id', v_pt.id);
    elsif p_simular then
      v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'producto_terminado', 'nombre', v_nombre_pt);
    else
      insert into nomenclador_items (tipo, nombre, categoria_id, sabor_id, unidad_base)
      values ('producto_terminado', v_nombre_pt, v_cat, v_s.id, v_unidad)
      returning * into v_pt;
      v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'producto_terminado',
                                           'nombre', v_pt.nombre, 'codigo', v_pt.codigo, 'id', v_pt.id);
    end if;

    for v_p in select * from nomenclador_presentaciones where id = any(p_presentaciones) order by orden, nombre loop
      v_nombre_pv := v_nombre_pt || ' · ' || v_p.nombre;
      v_pv := null;
      v_otro := null;
      if v_pt.id is not null then
        select * into v_pv from nomenclador_items
         where variante_de = v_pt.id and presentacion_id = v_p.id and estado = 'activo';
      end if;
      if v_pv.id is not null then
        v_res := v_res || jsonb_build_object('accion', 'existe', 'tipo', 'presentacion',
                                             'nombre', v_pv.nombre, 'codigo', v_pv.codigo, 'id', v_pv.id);
        continue;
      end if;
      select * into v_otro from nomenclador_items
       where tipo = 'presentacion' and estado = 'activo' and lower(btrim(nombre)) = lower(v_nombre_pv);
      if v_otro.id is not null then
        v_res := v_res || jsonb_build_object('accion', 'conflicto', 'tipo', 'presentacion',
                                             'nombre', v_otro.nombre, 'codigo', v_otro.codigo, 'id', v_otro.id);
        continue;
      end if;
      if p_simular then
        v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'presentacion', 'nombre', v_nombre_pv);
        continue;
      end if;
      insert into nomenclador_items (tipo, nombre, categoria_id, sabor_id, presentacion_id, variante_de, unidad_base)
      values ('presentacion', v_nombre_pv, v_cat, v_s.id, v_p.id, v_pt.id, 'unidades')
      returning * into v_pv;
      -- Composición solo si la unidad de la presentación es la del producto
      -- (ej. "1/2 kg" de un producto en kg; "12 unidades" de uno en kg, no).
      if v_p.cantidad is not null and v_p.unidad = v_pt.unidad_base then
        insert into nomenclador_componentes (item_id, componente_id, cantidad, unidad, orden)
        values (v_pv.id, v_pt.id, v_p.cantidad, v_p.unidad, 1);
      end if;
      v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'presentacion',
                                           'nombre', v_pv.nombre, 'codigo', v_pv.codigo, 'id', v_pv.id);
    end loop;
    v_pt := null;
  end loop;

  return v_res;
exception
  when unique_violation then
    raise exception 'Ya hay un producto terminado activo con uno de esos nombres. Revisá la lista y volvé a generar.';
end $$;
