-- Deshace 20261119130000_permisos_base: vuelve helpers, reglas y funciones a como estaban
-- el 19-11 (definiciones tomadas de dev antes de aplicar). Las tablas de T1 quedan.
begin;

drop trigger if exists permisos_puente_persona on public.profiles;
drop trigger if exists permisos_puente_rol on public.roles;
drop function if exists public._permisos_puente_persona();
drop function if exists public._permisos_puente_rol();
drop function if exists public._permisos_vincular_cuenta_local(uuid);

CREATE OR REPLACE FUNCTION public.fabrica_puede_editar_fecha(p_fecha date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce(get_user_rol(), '') in ('admin', 'supervisor_fabrica')
      or (p_fecha is not null and p_fecha between dia_fabrica() - 1 and dia_fabrica());
$function$;

CREATE OR REPLACE FUNCTION public.puede_operar_destino(p_destino text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case coalesce(get_user_rol(), '')
    when 'admin' then true
    when 'mayorista' then p_destino = 'fabrica'
    when 'deposito' then p_destino = 'deposito'
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION public.puede_supervisar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid() and estado = 'activo'
      and (rol = 'admin' or 'supervision' = any(modulos_permitidos))
  );
$function$;

CREATE OR REPLACE FUNCTION public.puede_ver_pedido(p_pedido_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from pedidos p
    where p.id = p_pedido_id
      and (p.local_id = auth.uid() or puede_operar_destino(p.destino))
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_acceso_compras()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (
        rol = 'admin'
        or modulos_permitidos && array[
          'compras-insumos', 'compras-stock', 'compras-pedidos', 'compras-reportes'
        ]
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_acceso_fabrica()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and rol in ('supervisor_fabrica', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_acceso_nomenclador()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (rol = 'admin' or modulos_permitidos && array['nomenclador'])
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_lectura_conteos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tiene_acceso_compras() or tiene_acceso_fabrica() or exists (
    select 1 from profiles
    where id = auth.uid() and estado = 'activo' and 'fabrica-conteos' = any(modulos_permitidos)
  );
$function$;

CREATE OR REPLACE FUNCTION public.compras_anular_devolucion(p_devolucion_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido_id   uuid;
  v_pedido      compras_pedidos%rowtype;
  v_factura     compras_facturas%rowtype;
  v_tiene_fac   boolean;
  v_dev         compras_devoluciones%rowtype;
  v_codigo      text;
  v_tiene_nc    boolean;
  v_nc_res      jsonb;
  v_mov         record;
  v_despues     numeric;
  v_impacto     jsonb := '[]'::jsonb;
  v_snap        jsonb;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'No encontramos la devolución. Recargá la página.';
  end if;
  v_tiene_nc := v_dev.nota_credito_id is not null;
  if v_tiene_nc and not es_admin() then
    raise exception 'Esta devolución tiene nota de crédito: la anula un administrador.';
  end if;
  if not v_dev.devuelve_mercaderia and not es_admin() then
    raise exception 'Esta devolución corrige la factura: la anula un administrador.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la devolución: queda en el historial.';
  end if;
  v_pedido_id := v_dev.pedido_id;

  -- pedido → factura → NC → gasto → devolución
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas
  where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado = 'confirmada'
  for update;
  v_tiene_fac := found;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id for update;
  if v_dev.estado <> 'activa' then
    raise exception 'Esa devolución ya está anulada. Recargá la página.';
  end if;
  if (v_dev.nota_credito_id is not null) <> v_tiene_nc then
    raise exception 'La devolución cambió mientras tanto. Recargá la página.';
  end if;
  v_codigo := _compras_codigo_devolucion(v_pedido.numero, v_dev.secuencia);

  if not v_dev.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id,
      array(select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null),
      'anular la devolución');
  end if;

  if v_tiene_nc then
    v_nc_res := _compras_anular_nc_de_devolucion(v_dev, 'Se anuló la devolución ' || v_codigo || ': ' || btrim(p_motivo));
  end if;

  -- Stock: se revierte lo que se movió (no lo que diga hoy el motivo, E2).
  for v_mov in
    select m.id, m.item_id, m.delta, m.factura_id
    from compras_stock_movimientos m
    where m.devolucion_id = v_dev.id and m.tipo = 'devolucion_proveedor'
    order by m.created_at, m.id
  loop
    perform compras_mover_stock(
      v_mov.item_id, -v_mov.delta, 'reversion',
      'Se anuló la devolución ' || v_codigo || ': ' || btrim(p_motivo),
      null, null, v_mov.id, v_mov.factura_id, null, v_dev.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
    v_impacto := v_impacto || jsonb_build_object(
      'item_id', v_mov.item_id,
      'nombre', (select nombre from compras_items where id = v_mov.item_id),
      'unidad', (select unidad from compras_items where id = v_mov.item_id),
      'delta', -v_mov.delta,
      'cantidad_despues', v_despues
    );
  end loop;

  update compras_devoluciones
    set estado = 'anulada', anulada_por = auth.uid(), anulada_en = now(), anulada_motivo = btrim(p_motivo)
    where id = v_dev.id;

  -- Las diferencias que esperaban esta devolución vuelven a pendiente; el recálculo
  -- decide si siguen o desaparecen.
  update compras_factura_discrepancias
    set devolucion_id = null,
        resolucion = case when resolucion = 'reclamo_proveedor' then 'pendiente' else resolucion end,
        nota = case when resolucion = 'reclamo_proveedor' then null else nota end,
        resuelto_por = case when resolucion = 'reclamo_proveedor' then null else resuelto_por end,
        resuelto_en = case when resolucion = 'reclamo_proveedor' then null else resuelto_en end,
        updated_at = now()
    where devolucion_id = v_dev.id;

  v_snap := compras_lineas_devolucion_snapshot(v_dev.id);
  perform compras_registrar_evento_pedido(v_pedido.id, 'devolucion_anulada', jsonb_build_object(
    'devolucion_id', v_dev.id, 'secuencia', v_dev.secuencia, 'motivo', v_dev.motivo_nombre,
    'motivo_anulacion', btrim(p_motivo), 'lineas', v_snap, 'tenia_nota_credito', v_tiene_nc));

  perform compras_recalcular_estado_pedido(v_pedido.id);
  if v_tiene_fac then
    perform compras_recalcular_diferencias_factura(v_factura.id);
    perform _compras_marcar_esperando_nc(v_dev.id);  -- ajuste B4: otra devolución puede seguir esperando
  end if;

  return jsonb_build_object(
    'impacto', v_impacto,
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = v_pedido.id),
    'nota_credito_anulada', v_tiene_nc,
    'gasto', v_nc_res->>'gasto',
    'monto_despues', v_nc_res->'monto_despues'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_anular_factura(p_factura_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido_id    uuid;
  v_pedido       compras_pedidos%rowtype;
  v_factura      compras_facturas%rowtype;
  v_gasto        gastos%rowtype;
  v_remito       compras_remitos%rowtype;
  v_codigo       text;
  v_mov          record;
  v_despues      numeric;
  v_impacto      jsonb := '[]'::jsonb;
  v_gasto_accion text;
  v_snap         jsonb;  -- A2b
  v_lista        text;   -- B4
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular facturas.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la factura: queda registrado.';
  end if;

  select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
  if not found then
    raise exception 'No encontramos la factura. Recargá la página.';
  end if;
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = p_factura_id for update;

  -- B4 (E18)
  if v_factura.tipo_comprobante = 'nota_credito' then
    raise exception 'Una nota de crédito se anula desde su devolución, en el detalle del pedido.';
  end if;

  if v_factura.estado <> 'confirmada' then
    raise exception 'Solo se anula una factura confirmada. Un borrador se descarta.';
  end if;

  -- B4 (E18)
  select string_agg('N° ' || nc.numero || coalesce(' (' || _compras_codigo_devolucion(v_pedido.numero, d.secuencia) || ')', ''), ', ')
    into v_lista
  from compras_facturas nc
  left join compras_devoluciones d on d.nota_credito_id = nc.id
  where nc.factura_origen_id = v_factura.id and nc.estado = 'confirmada';
  if v_lista is not null then
    raise exception 'Esta factura tiene notas de crédito (%). Anulalas desde sus devoluciones antes de anular la factura.', v_lista;
  end if;
  select string_agg(_compras_codigo_devolucion(v_pedido.numero, d.secuencia), ', ' order by d.secuencia) into v_lista
  from compras_devoluciones d
  where d.factura_id = v_factura.id and d.estado = 'activa' and not d.devuelve_mercaderia;
  if v_lista is not null then
    raise exception 'La devolución % corrige esta factura. Anulala antes de anular la factura.', v_lista;
  end if;

  if exists (
    select 1 from compras_factura_discrepancias
    where factura_id = v_factura.id and resolucion = 'ajusta_stock'
  ) then
    raise exception 'Esta factura tiene diferencias que ya ajustaron el stock. Revertí esos ajustes (en "Diferencias con lo recibido") antes de anularla.';
  end if;

  if v_factura.gasto_id is not null then
    select * into v_gasto from gastos where id = v_factura.gasto_id for update;
    if found then
      if v_gasto.estado in ('Pagado', 'Parcial') then
        raise exception 'El gasto de esta factura ya está %: no se puede anular. Para corregirla, registrá una nota de crédito.',
          case v_gasto.estado when 'Pagado' then 'pagado' else 'pagado en parte' end;
      end if;
      update compras_facturas set gasto_id = null, gasto_generado = false where id = v_factura.id;
      if v_factura.gasto_generado then
        -- Existía solo por esta factura: dejarlo haría que alguien lo pague.
        delete from gastos where id = v_gasto.id;
        v_gasto_accion := 'eliminado';
      else
        update gastos
          set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
                'Se desvinculó de la factura ' || v_factura.numero || ', que se anuló: ' || btrim(p_motivo) || '.')
          where id = v_gasto.id;
        v_gasto_accion := 'desvinculado';
      end if;
    end if;
  end if;

  for v_remito in
    select * from compras_remitos where factura_id = v_factura.id and origen = 'factura' for update
  loop
    v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');
    for v_mov in
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    loop
      continue when v_mov.total = 0;
      perform compras_mover_stock(
        v_mov.item_id, -v_mov.total, 'salida_remito_anulado',
        'Remito ' || v_codigo || ' eliminado al anular la factura ' || v_factura.numero,
        v_remito.id, null, null, v_factura.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', -v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;
    v_snap := compras_lineas_remito_snapshot(v_remito.id);  -- A2b
    delete from compras_remitos where id = v_remito.id;
    -- A2b (E10, E14)
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_eliminado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
      'factura_id', v_factura.id,
      'motivo', 'Se anuló la factura ' || v_factura.numero || ': ' || btrim(p_motivo),
      'lineas', v_snap));
  end loop;

  update compras_facturas
    set estado = 'anulada',
        anulada_en = now(),
        anulada_por = auth.uid(),
        anulada_motivo = btrim(p_motivo)
    where id = v_factura.id;

  -- Sin factura confirmada no hay nada contra qué comparar.
  delete from compras_factura_discrepancias where factura_id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('remito_eliminado', v_codigo, 'impacto', v_impacto, 'gasto', v_gasto_accion);
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_anular_nota_credito(p_devolucion_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido_id uuid;
  v_pedido    compras_pedidos%rowtype;
  v_nc_id     uuid;
  v_factura   compras_facturas%rowtype;
  v_dev       compras_devoluciones%rowtype;
  v_res       jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular notas de crédito.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la nota de crédito: queda registrado.';
  end if;
  select pedido_id, nota_credito_id into v_pedido_id, v_nc_id from compras_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'No encontramos la devolución. Recargá la página.';
  end if;
  if v_nc_id is null then
    raise exception 'Esa devolución no tiene nota de crédito. Recargá la página.';
  end if;

  -- pedido → factura origen → NC (en el helper) → gasto → devolución
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select fo.* into v_factura from compras_facturas nc join compras_facturas fo on fo.id = nc.factura_origen_id
  where nc.id = v_nc_id;
  perform 1 from compras_facturas where id = v_factura.id for update;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id for update;
  if v_dev.nota_credito_id is distinct from v_nc_id then
    raise exception 'La devolución cambió mientras tanto. Recargá la página.';
  end if;

  if not v_dev.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id,
      array(select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null),
      'anular la nota de crédito');
  end if;

  v_res := _compras_anular_nc_de_devolucion(v_dev, p_motivo);

  if v_factura.estado = 'confirmada' then
    perform compras_recalcular_diferencias_factura(v_factura.id);
    perform _compras_marcar_esperando_nc(v_dev.id);
  end if;

  return jsonb_build_object('gasto', v_res->>'gasto', 'monto_antes', v_res->'monto_antes', 'monto_despues', v_res->'monto_despues');
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_buscar_gasto_candidato(p_proveedor_id uuid DEFAULT NULL::uuid, p_monto numeric DEFAULT NULL::numeric, p_fecha date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, fecha date, monto numeric, estado text, local text, categoria text, observaciones text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede ver los gastos.';
  end if;
  if p_proveedor_id is null or p_monto is null or p_monto <= 0 or p_fecha is null then
    return;
  end if;

  return query
  select g.id, g.fecha, g.monto, g.estado, g.local, g.categoria, g.observaciones
  from gastos g
  where g.proveedor_id = p_proveedor_id
    and abs(g.monto - p_monto) <= p_monto * 0.01
    and g.fecha between p_fecha - 15 and p_fecha + 15
    and not exists (select 1 from compras_facturas f where f.gasto_id = g.id)
  order by abs(g.monto - p_monto), abs(g.fecha - p_fecha)
  limit 5;
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_cargar_nota_credito(p_devolucion_id uuid DEFAULT NULL::uuid, p_numero text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_lineas jsonb DEFAULT '[]'::jsonb, p_total_papel numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido_id uuid;
  v_pedido    compras_pedidos%rowtype;
  v_factura   compras_facturas%rowtype;
  v_dev       compras_devoluciones%rowtype;
  v_nc        compras_facturas%rowtype;
  v_gasto     jsonb;
  v_codigo    text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar notas de crédito.';
  end if;
  select pedido_id into v_pedido_id from compras_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'No encontramos la devolución. Recargá la página.';
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas
  where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado = 'confirmada'
  for update;
  if not found then
    raise exception 'Para cargar la nota de crédito, primero confirmá la factura del pedido.';
  end if;
  select * into v_dev from compras_devoluciones where id = p_devolucion_id for update;
  v_codigo := _compras_codigo_devolucion(v_pedido.numero, v_dev.secuencia);

  if v_dev.estado <> 'activa' then
    raise exception 'Esa devolución está anulada.';
  end if;
  if v_dev.nota_credito_id is not null then
    raise exception 'Esa devolución ya tiene su nota de crédito: N° %.',
      (select numero from compras_facturas where id = v_dev.nota_credito_id);
  end if;
  if v_dev.repone then
    raise exception 'La devolución % es con reposición: no lleva nota de crédito.', v_codigo;
  end if;

  if not v_dev.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id,
      array(select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null),
      'cargar la nota de crédito');
  end if;

  v_nc := _compras_crear_nota_credito(v_dev, v_factura, p_numero, p_fecha, p_lineas, p_total_papel);
  -- La factura activa manda (si la de la devolución se anuló, se reescribe).
  update compras_devoluciones set nota_credito_id = v_nc.id, factura_id = v_factura.id
  where id = v_dev.id returning * into v_dev;
  v_gasto := _compras_nc_aplicar_gasto(v_nc.id);
  select * into v_nc from compras_facturas where id = v_nc.id;

  perform compras_recalcular_diferencias_factura(v_factura.id);
  perform _compras_marcar_esperando_nc(v_dev.id);

  return jsonb_build_object(
    'nota_credito', jsonb_build_object(
      'id', v_nc.id, 'numero', v_nc.numero, 'total', v_nc.total,
      'gasto', v_gasto->>'gasto', 'monto_antes', v_gasto->'monto_antes', 'monto_despues', v_gasto->'monto_despues'),
    'diferencias_pendientes',
      (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id and resolucion = 'pendiente')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_confirmar_factura(p_factura_id uuid DEFAULT NULL::uuid, p_mercaderia_llego boolean DEFAULT NULL::boolean, p_actualizar_precios boolean DEFAULT false, p_gasto_existente_id uuid DEFAULT NULL::uuid, p_gasto_local text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_remito     compras_remitos%rowtype;
  v_gasto      gastos%rowtype;
  v_codigo     text;
  v_codigo_ped text;
  v_tiene_rem  boolean;
  v_mov        record;
  v_despues    numeric;
  v_impacto    jsonb := '[]'::jsonb;
  v_gasto_id   uuid;
  v_generado   boolean := false;
  v_local      text;
  -- A2b
  v_lote       uuid := gen_random_uuid();
  v_precio     record;
  v_par        compras_item_proveedores%rowtype;
  v_precios    int := 0;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede confirmar facturas.';
  end if;

  select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
  if not found then
    raise exception 'No encontramos la factura. Recargá la página.';
  end if;
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = p_factura_id for update;
  v_codigo_ped := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if v_factura.estado <> 'borrador' then
    raise exception 'La factura ya está %.', v_factura.estado;
  end if;
  if not exists (select 1 from compras_factura_items where factura_id = v_factura.id) then
    raise exception 'La factura no tiene líneas.';
  end if;

  -- El gasto se valida antes de mover stock: si falla, no queda nada a medias.
  if p_gasto_existente_id is not null then
    select * into v_gasto from gastos where id = p_gasto_existente_id for update;
    if not found then
      raise exception 'Ese gasto ya no existe. Recargá la página y elegí de nuevo.';
    end if;
    if v_gasto.proveedor_id is distinct from v_factura.proveedor_id then
      raise exception 'Ese gasto es de otro proveedor: no se puede vincular a esta factura.';
    end if;
    if exists (select 1 from compras_facturas where gasto_id = v_gasto.id) then
      raise exception 'Ese gasto ya está vinculado a otra factura. Recargá la página y elegí de nuevo.';
    end if;
  else
    v_local := coalesce(
      nullif(btrim(p_gasto_local), ''),
      (select valor #>> '{}' from compras_config where clave = 'gasto.local'),
      'YA! FABRICA'
    );
  end if;

  v_tiene_rem := exists (select 1 from compras_remitos where pedido_id = v_pedido.id);
  if not v_tiene_rem and p_mercaderia_llego is null then
    raise exception 'El pedido no tiene remitos: contanos si la mercadería ya llegó.';
  end if;

  if not v_tiene_rem and p_mercaderia_llego then
    update compras_pedidos
      set ultima_secuencia_remito = greatest(
        ultima_secuencia_remito,
        (select coalesce(max(secuencia), 0) from compras_remitos where pedido_id = v_pedido.id)
      ) + 1
      where id = v_pedido.id
      returning ultima_secuencia_remito into v_pedido.ultima_secuencia_remito;

    insert into compras_remitos (pedido_id, secuencia, fecha, creado_por, origen, factura_id)
    values (v_pedido.id, v_pedido.ultima_secuencia_remito, v_factura.fecha, auth.uid(), 'factura', v_factura.id)
    returning * into v_remito;
    v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');

    -- Solo lo que es mercadería: líneas con insumo o que corresponden al pedido
    -- (una línea libre sin insumo, como el flete, no es un ítem recibido: FA7).
    -- A2b: cantidad son las cajas (también cuando se cobra por kg); los kg van aparte.
    insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad, cantidad_base)
    select v_remito.id, fi.pedido_item_id, fi.item_id, fi.descripcion, fi.cantidad,
           case when fi.item_id is not null then fi.cantidad_base end
    from compras_factura_items fi
    where fi.factura_id = v_factura.id and fi.cantidad > 0
      and (fi.item_id is not null or fi.pedido_item_id is not null);

    for v_mov in
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    loop
      continue when v_mov.total = 0;
      perform compras_mover_stock(
        v_mov.item_id, v_mov.total, 'entrada_remito',
        'Remito ' || v_codigo || ' (desde factura ' || v_factura.numero || ')',
        v_remito.id, null, null, v_factura.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;

    -- A2b (E10)
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_creado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
      'factura_id', v_factura.id, 'factura_numero', v_factura.numero,
      'lineas', compras_lineas_remito_snapshot(v_remito.id)));
  end if;

  -- A2b (E7): el precio de referencia viaja con su unidad. Un insumo puede venir
  -- en más de una línea: se usa la última de la factura (la más abajo en el papel).
  -- Orden de bloqueo: pedido → factura → stock → par (FOR UPDATE) → KEY SHARE del
  -- insumo (historial). compras_guardar_insumo toma NO KEY UPDATE: no se cruzan.
  if coalesce(p_actualizar_precios, false) then
    for v_precio in
      select distinct on (fi.item_id) fi.item_id, fi.precio_unitario, fi.precio_por
      from compras_factura_items fi
      where fi.factura_id = v_factura.id and fi.item_id is not null and fi.precio_unitario > 0
      order by fi.item_id, fi.orden desc, fi.id desc
    loop
      select * into v_par from compras_item_proveedores
      where item_id = v_precio.item_id and proveedor_id = v_factura.proveedor_id and activo
      for update;
      continue when not found;
      continue when v_par.precio_ref is not distinct from v_precio.precio_unitario
                and v_par.cobra_por = v_precio.precio_por;
      update compras_item_proveedores
        set precio_ref = v_precio.precio_unitario, cobra_por = v_precio.precio_por
        where id = v_par.id;
      insert into compras_items_historial (item_id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, origen, creado_por)
      select v_precio.item_id, v_lote, c.campo, v_factura.proveedor_id, c.ant, c.nue, 'factura', auth.uid()
      from (values
        ('proveedor.cobra_por',  v_par.cobra_por,                    v_precio.precio_por),
        ('proveedor.precio_ref', _compras_num_txt(v_par.precio_ref), _compras_num_txt(v_precio.precio_unitario))
      ) c(campo, ant, nue)
      where c.ant is distinct from c.nue;
      v_precios := v_precios + 1;
    end loop;
  end if;

  -- Gasto (F6 del 22-09 / FA10).
  if p_gasto_existente_id is not null then
    v_gasto_id := v_gasto.id;
    update gastos
      set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Vinculado a la factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || '.')
      where id = v_gasto.id;
  elsif v_factura.total > 0 then
    insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones, created_by, origen)
    values (
      v_factura.fecha,
      v_local,
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.rubro'), 'MATERIA PRIMA'),
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.categoria'), 'MATERIA PRIMA'),
      v_factura.proveedor_id,
      v_factura.total,
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.forma_pago'), 'Transferencia'),
      'Pendiente de pago',
      'Factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || ' (se creó al confirmar la factura).',
      auth.uid(),
      'factura'
    )
    returning id into v_gasto_id;
    v_generado := true;
  end if;

  update compras_facturas
    set estado = 'confirmada',
        confirmada_en = now(),
        confirmada_por = auth.uid(),
        mercaderia_llego = case when v_tiene_rem then null else p_mercaderia_llego end,
        gasto_id = v_gasto_id,
        gasto_generado = v_generado
    where id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);
  perform compras_recalcular_diferencias_factura(v_factura.id);

  return jsonb_build_object(
    'remito_generado', v_codigo,
    'impacto', v_impacto,
    'gasto_id', v_gasto_id,
    'gasto_creado', v_generado,
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id),
    'precios_actualizados', v_precios  -- A2b
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_descartar_factura(p_factura_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_factura compras_facturas%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede descartar facturas.';
  end if;
  select * into v_factura from compras_facturas where id = p_factura_id for update;
  if not found then
    return;
  end if;
  if v_factura.estado <> 'borrador' then
    raise exception 'Solo se descarta un borrador. Una factura confirmada se anula.';
  end if;
  delete from compras_facturas where id = v_factura.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_guardar_factura(p_factura_id uuid DEFAULT NULL::uuid, p_pedido_id uuid DEFAULT NULL::uuid, p_numero text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_vencimiento date DEFAULT NULL::date, p_total_papel numeric DEFAULT NULL::numeric, p_observaciones text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_ids_conocidos uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_ids        uuid[];
  v_linea      record;
  v_pi_id      uuid;
  v_item_id    uuid;
  v_existente  record;
  v_precio_por text;     -- A2b
  v_base       numeric;  -- A2b
  v_ub         text;     -- A2b
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar facturas.';
  end if;
  if nullif(btrim(p_numero), '') is null or regexp_replace(p_numero, '[^0-9]', '', 'g') = '' then
    raise exception 'Cargá el número de la factura, tal como figura en el papel.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha de la factura.';
  end if;
  if p_vencimiento is not null and p_vencimiento < p_fecha then
    raise exception 'El vencimiento no puede ser anterior a la fecha de la factura.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas de la factura vienen mal armadas. Recargá la página.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, -1) < 0
       or coalesce((e->>'precio_unitario')::numeric, -1) < 0
  ) then
    raise exception 'Cada línea necesita descripción, cantidad y precio (0 o más).';
  end if;
  -- A2b
  if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
             where coalesce(nullif(e->>'precio_por', ''), 'unidad') not in ('unidad', 'base')) then
    raise exception 'Las líneas de la factura vienen mal armadas. Recargá la página.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
             where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
    raise exception 'Los kg tienen que ser mayores a 0 (o quedar vacíos).';
  end if;

  -- Pedido primero (orden de bloqueo), después la factura.
  if p_factura_id is null then
    v_pedido_id := p_pedido_id;
    if v_pedido_id is null then
      raise exception 'Elegí el pedido al que corresponde la factura.';
    end if;
  else
    select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
    if not found then
      raise exception 'No encontramos la factura. Puede que alguien la haya descartado: recargá la página.';
    end if;
    if p_pedido_id is not null and p_pedido_id <> v_pedido_id then
      raise exception 'Una factura no se puede pasar a otro pedido: descartala y cargala en el correcto.';
    end if;
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  if v_pedido.estado_recepcion = 'sin_enviar' then
    raise exception 'El pedido % todavía no se envió: no se le puede cargar factura.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
  end if;

  -- Número repetido para el proveedor (FA3): mensaje con el pedido de la otra.
  select f.id, p.numero as pedido_numero into v_existente
  from compras_facturas f
  join compras_pedidos p on p.id = f.pedido_id
  where f.proveedor_id = v_pedido.proveedor_id
    and f.tipo_comprobante = 'factura'
    and f.estado <> 'anulada'
    and f.numero_normalizado = regexp_replace(p_numero, '[^0-9]', '', 'g')
    and f.id is distinct from p_factura_id
  limit 1;
  if found then
    raise exception 'Ya cargaste la factura % de este proveedor (pedido %).',
      btrim(p_numero), 'P-' || lpad(v_existente.pedido_numero::text, 4, '0');
  end if;

  if p_factura_id is null then
    if exists (
      select 1 from compras_facturas
      where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado <> 'anulada'
    ) then
      raise exception 'El pedido % ya tiene una factura cargada. Abrila desde la lista de facturas.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    insert into compras_facturas (pedido_id, proveedor_id, numero, fecha, fecha_vencimiento, total_papel, observaciones, creado_por)
    values (v_pedido.id, v_pedido.proveedor_id, btrim(p_numero), p_fecha, p_vencimiento, p_total_papel,
            nullif(btrim(p_observaciones), ''), auth.uid())
    returning * into v_factura;
  else
    select * into v_factura from compras_facturas where id = p_factura_id for update;
    if v_factura.estado <> 'borrador' then
      raise exception 'La factura ya está %: no se puede editar.', case v_factura.estado when 'confirmada' then 'confirmada (anulala para corregirla)' else 'anulada' end;
    end if;
    update compras_facturas
      set numero = btrim(p_numero),
          fecha = p_fecha,
          fecha_vencimiento = p_vencimiento,
          total_papel = p_total_papel,
          observaciones = nullif(btrim(p_observaciones), '')
      where id = v_factura.id;
  end if;

  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_factura_items fi where fi.id = x.id and fi.factura_id = v_factura.id)
  ) then
    raise exception 'Alguien cambió esta factura mientras la editabas. Recargá la página.';
  end if;

  -- Lo que no viene en p_items se borra. Eso es correcto solo si la pantalla
  -- tenía TODAS las líneas: si cargó de menos (por un tope de filas, por
  -- ejemplo) borraría líneas que el usuario nunca vio. p_ids_conocidos son las
  -- líneas que la pantalla tenía al abrir; si alguna existente no está ahí,
  -- frenamos antes de borrar nada.
  if p_ids_conocidos is not null and exists (
    select 1 from compras_factura_items fi
    where fi.factura_id = v_factura.id and fi.id <> all (p_ids_conocidos)
  ) then
    raise exception 'Esta factura tiene líneas que no se cargaron en pantalla. Recargá la página antes de guardar.';
  end if;

  delete from compras_factura_items fi where fi.factura_id = v_factura.id and fi.id <> all (v_ids);

  for v_linea in
    select e, (ord - 1)::int as orden
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord)
  loop
    v_pi_id := nullif(v_linea.e->>'pedido_item_id', '')::uuid;
    if v_pi_id is not null then
      select pi.item_id into v_item_id from compras_pedido_items pi where pi.id = v_pi_id and pi.pedido_id = v_pedido.id;
      if not found then
        raise exception 'Una línea del pedido ya no existe (alguien editó el pedido). Recargá la página.';
      end if;
    else
      v_item_id := nullif(v_linea.e->>'item_id', '')::uuid;
    end if;

    -- A2b: cajas + kg. Por kg exige insumo, kg y cajas.
    v_precio_por := coalesce(nullif(v_linea.e->>'precio_por', ''), 'unidad');
    v_base := nullif(v_linea.e->>'cantidad_base', '')::numeric;
    v_ub := coalesce((select case unidad_base when 'litros' then 'litros' when 'unidades' then 'unidades' else 'kg' end
                      from compras_items where id = v_item_id), 'kg');
    if v_precio_por = 'base' then
      if v_item_id is null then
        raise exception '"%" no tiene insumo: no se puede cobrar por kg.', btrim(v_linea.e->>'descripcion');
      end if;
      if v_base is null then
        raise exception 'Cargá los % de "%": ese proveedor lo cobra por %.', v_ub, btrim(v_linea.e->>'descripcion'), v_ub;
      end if;
      if (v_linea.e->>'cantidad')::numeric <= 0 then
        raise exception 'Cargá cuántas unidades llegaron de "%" (además de los %).', btrim(v_linea.e->>'descripcion'), v_ub;
      end if;
    end if;
    if v_base is not null and v_item_id is null then
      raise exception 'Los kg van solo en líneas con insumo ("%").', btrim(v_linea.e->>'descripcion');
    end if;

    if nullif(v_linea.e->>'id', '') is not null then
      update compras_factura_items
        set pedido_item_id = v_pi_id,
            item_id = v_item_id,
            descripcion = btrim(v_linea.e->>'descripcion'),
            unidad = nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
            cantidad = (v_linea.e->>'cantidad')::numeric,
            precio_unitario = (v_linea.e->>'precio_unitario')::numeric,
            alicuota_iva = coalesce((v_linea.e->>'alicuota_iva')::numeric, 21),
            orden = v_linea.orden,
            cantidad_base = v_base,     -- A2b
            precio_por = v_precio_por   -- A2b
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_factura_items (factura_id, pedido_item_id, item_id, descripcion, unidad, cantidad, precio_unitario, alicuota_iva, orden,
                                         cantidad_base, precio_por)  -- A2b
      values (
        v_factura.id, v_pi_id, v_item_id, btrim(v_linea.e->>'descripcion'),
        nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
        (v_linea.e->>'cantidad')::numeric,
        (v_linea.e->>'precio_unitario')::numeric,
        coalesce((v_linea.e->>'alicuota_iva')::numeric, 21),
        v_linea.orden,
        v_base, v_precio_por
      );
    end if;
  end loop;

  update compras_facturas f
    set subtotal = t.subtotal, iva = t.iva, total = t.subtotal + t.iva
    from (
      select coalesce(sum(subtotal), 0) as subtotal, coalesce(sum(iva), 0) as iva
      from compras_factura_items where factura_id = v_factura.id
    ) t
    where f.id = v_factura.id;

  -- 'items' vuelven en el orden en que se mandaron: la pantalla los pega a sus
  -- líneas, así un segundo guardado las actualiza en vez de duplicarlas.
  return (
    select jsonb_build_object(
      'id', f.id, 'subtotal', f.subtotal, 'iva', f.iva, 'total', f.total,
      'items', coalesce((
        select jsonb_agg(fi.id order by fi.orden)
        from compras_factura_items fi where fi.factura_id = f.id
      ), '[]'::jsonb)
    )
    from compras_facturas f where f.id = v_factura.id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_registrar_devolucion(p_pedido_id uuid DEFAULT NULL::uuid, p_motivo_id uuid DEFAULT NULL::uuid, p_repone boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb, p_nota text DEFAULT NULL::text, p_nota_credito jsonb DEFAULT NULL::jsonb, p_diferencia_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_motivo        compras_devolucion_motivos%rowtype;
  v_pedido        compras_pedidos%rowtype;
  v_factura       compras_facturas%rowtype;
  v_tiene_factura boolean;
  v_repone        boolean := coalesce(p_repone, false);
  v_cod_ped       text;
  v_codigo        text;
  v_proveedor     text;
  v_e             record;
  v_item          compras_items%rowtype;
  v_pi            compras_pedido_items%rowtype;
  v_pi_id         uuid;
  v_fi            compras_factura_items%rowtype;
  v_cant          numeric;
  v_base          numeric;
  v_max           numeric;
  v_lineas        jsonb := '[]'::jsonb;
  v_x             record;
  v_dev           compras_devoluciones%rowtype;
  v_mov           record;
  v_despues       numeric;
  v_impacto       jsonb := '[]'::jsonb;
  v_nc            compras_facturas%rowtype;
  v_nc_lineas     jsonb;
  v_gasto         jsonb;
  v_dif           compras_factura_discrepancias%rowtype;
  v_items_ids     uuid[];
begin
  -- 1. Acceso
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  select * into v_motivo from compras_devolucion_motivos where id = p_motivo_id;
  if not found or not v_motivo.activo then
    raise exception 'Ese motivo ya no está disponible. Recargá la página.';
  end if;
  if (not v_motivo.devuelve_mercaderia or p_nota_credito is not null) and not es_admin() then
    raise exception 'Solo un administrador puede registrar devoluciones que corrigen la factura o cargar notas de crédito.';
  end if;

  -- 2. Ítems
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Elegí qué se devuelve.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where nullif(e->>'cantidad', '') is null or (e->>'cantidad')::numeric <= 0) then
    raise exception 'Las cantidades a devolver tienen que ser mayores que 0.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
    raise exception 'Los kg tienen que ser mayores que 0 (o quedar vacíos).';
  end if;
  if p_nota is not null and length(p_nota) > 500 then
    raise exception 'La nota es muy larga (máximo 500 caracteres).';
  end if;

  -- 3. Bloqueos y estado
  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  v_cod_ped := 'P-' || lpad(v_pedido.numero::text, 4, '0');
  if v_pedido.estado_recepcion = 'sin_enviar' or v_pedido.enviado_en is null then
    raise exception 'El pedido % todavía no se envió: no hay nada para devolver.', v_cod_ped;
  end if;
  select * into v_factura from compras_facturas
  where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado = 'confirmada'
  for update;
  v_tiene_factura := found;
  select nombre into v_proveedor from proveedores where id = v_pedido.proveedor_id;

  if not v_motivo.devuelve_mercaderia then
    if not v_tiene_factura then
      raise exception 'Esta devolución corrige la factura, y el pedido % todavía no tiene una confirmada. Cargala primero.', v_cod_ped;
    end if;
    v_repone := false;
  end if;
  if v_repone and v_pedido.estado_recepcion = 'cerrado_manual' then
    raise exception 'El pedido está cerrado a mano: reabrilo para esperar la reposición, o registrá la devolución sin reposición.';
  end if;
  if v_repone and p_nota_credito is not null then
    raise exception 'Si el proveedor repone, no hay nota de crédito: la reposición ya está facturada. Elegí "No repone" para cargar la nota.';
  end if;
  if p_nota_credito is not null and not v_tiene_factura then
    raise exception 'Para cargar la nota de crédito, primero confirmá la factura del pedido.';
  end if;

  -- 4. Resolver cada ítem (descripción y unidad nunca del cliente).
  for v_e in select e, (ord - 1)::int as idx from jsonb_array_elements(p_items) with ordinality t(e, ord) loop
    v_cant := (v_e.e->>'cantidad')::numeric;
    v_base := nullif(v_e.e->>'cantidad_base', '')::numeric;

    if v_motivo.corrige_precio then
      select * into v_fi from compras_factura_items
      where id = nullif(v_e.e->>'factura_item_id', '')::uuid and factura_id = v_factura.id;
      if not found or v_fi.precio_unitario <= 0 then
        raise exception 'Elegí la línea de la factura con el precio mal cobrado. Recargá la página.';
      end if;
      if v_cant > (case when v_fi.precio_por = 'base' then v_fi.cantidad_base else v_fi.cantidad end) then
        raise exception 'De % se cobraron % %: no se puede corregir el precio de más que eso.',
          v_fi.descripcion, _compras_cant_txt(case when v_fi.precio_por = 'base' then v_fi.cantidad_base else v_fi.cantidad end),
          case when v_fi.precio_por = 'base' then coalesce((select unidad_base from compras_items where id = v_fi.item_id), 'kg')
               else coalesce(v_fi.unidad, '') end;
      end if;
      if nullif(v_e.e->>'precio_correcto', '') is null then
        raise exception 'Cargá el precio correcto de %.', v_fi.descripcion;
      end if;
      if (v_e.e->>'precio_correcto')::numeric < 0 or (v_e.e->>'precio_correcto')::numeric >= v_fi.precio_unitario then
        raise exception 'El precio correcto de % tiene que ser menor que el facturado (%).', v_fi.descripcion, _compras_pesos_txt(v_fi.precio_unitario);
      end if;
      -- Ajuste B4: una sola corrección de precio activa por línea de la factura.
      select _compras_codigo_devolucion(v_pedido.numero, d.secuencia) into v_codigo
      from compras_devoluciones d join compras_devolucion_items di on di.devolucion_id = d.id
      where d.estado = 'activa' and d.corrige_precio and di.factura_item_id = v_fi.id
      limit 1;
      if v_codigo is not null then
        raise exception 'El precio de % ya tiene una corrección registrada (%). Anulala primero si hay que cambiarla.', v_fi.descripcion, v_codigo;
      end if;
      if exists (select 1 from jsonb_to_recordset(v_lineas) as x(factura_item_id uuid) where x.factura_item_id = v_fi.id) then
        raise exception 'La línea de % está dos veces en la corrección de precio. Recargá la página.', v_fi.descripcion;
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'idx', v_e.idx, 'item_id', v_fi.item_id, 'pedido_item_id', v_fi.pedido_item_id, 'factura_item_id', v_fi.id,
        'descripcion', v_fi.descripcion,
        'unidad', case when v_fi.precio_por = 'base'
                       then coalesce((select unidad_base from compras_items where id = v_fi.item_id), 'kg')
                       else v_fi.unidad end,
        'cantidad', v_cant, 'cantidad_base', null,
        'precio_correcto', (v_e.e->>'precio_correcto')::numeric);
      continue;
    end if;

    select * into v_item from compras_items where id = nullif(v_e.e->>'item_id', '')::uuid;
    if not found then
      raise exception 'Falta el insumo de una línea. Recargá la página.';
    end if;

    if v_motivo.devuelve_mercaderia then
      v_pi_id := nullif(v_e.e->>'pedido_item_id', '')::uuid;
      if v_pi_id is not null then
        select * into v_pi from compras_pedido_items where id = v_pi_id and pedido_id = v_pedido.id;
        if not found or v_pi.item_id is distinct from v_item.id then
          raise exception 'Esa línea no es de este pedido. Recargá la página.';
        end if;
      elsif (select count(*) from compras_pedido_items where pedido_id = v_pedido.id and item_id = v_item.id) = 1 then
        -- Una sola línea de ese insumo: se usa, si lo que llegó por esa línea alcanza
        -- (lo que llegó como línea libre del remito queda contra el insumo).
        select * into v_pi from compras_pedido_items where pedido_id = v_pedido.id and item_id = v_item.id;
        if coalesce((select sum(ri.cantidad) from compras_remito_items ri where ri.pedido_item_id = v_pi.id), 0)
           - coalesce((select sum(d.devuelto) from _compras_devuelto(v_pedido.id) d where d.pedido_item_id = v_pi.id), 0)
           - coalesce((select sum((x->>'cantidad')::numeric) from jsonb_array_elements(v_lineas) x
                       where x->>'pedido_item_id' = v_pi.id::text), 0)
           >= v_cant then
          v_pi_id := v_pi.id;
        end if;
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'idx', v_e.idx, 'item_id', v_item.id, 'pedido_item_id', v_pi_id, 'factura_item_id', null,
        'descripcion', v_item.nombre,
        'unidad', coalesce((select unidad from compras_pedido_items where id = v_pi_id), v_item.unidad),
        'cantidad', v_cant, 'cantidad_base', v_base, 'precio_correcto', null);
    else
      -- Facturado y no entregado: el insumo tiene que estar en la factura.
      select * into v_fi from compras_factura_items
      where factura_id = v_factura.id and item_id = v_item.id
      order by orden desc, id desc limit 1;
      if not found then
        raise exception '% no está en la factura %: no hay nada que reclamar.', v_item.nombre, v_factura.numero;
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'idx', v_e.idx, 'item_id', v_item.id, 'pedido_item_id', v_fi.pedido_item_id, 'factura_item_id', null,
        'descripcion', v_item.nombre, 'unidad', coalesce(v_fi.unidad, v_item.unidad),
        'cantidad', v_cant, 'cantidad_base', v_base, 'precio_correcto', null);
    end if;
  end loop;

  -- Máximos (las cantidades del lote se suman por insumo / por línea).
  if v_motivo.devuelve_mercaderia then
    for v_x in
      select x.item_id, sum(x.cantidad) as cant, i.nombre, i.unidad,
             coalesce((select sum(ri.cantidad) from compras_remito_items ri join compras_remitos r on r.id = ri.remito_id
                       where r.pedido_id = v_pedido.id and ri.item_id = x.item_id), 0) as llego,
             coalesce((select sum(d.devuelto) from _compras_devuelto(v_pedido.id) d where d.item_id = x.item_id), 0) as devuelto
      from jsonb_to_recordset(v_lineas) as x(item_id uuid, cantidad numeric)
      join compras_items i on i.id = x.item_id
      group by x.item_id, i.nombre, i.unidad
    loop
      if v_x.cant > v_x.llego - v_x.devuelto then
        raise exception 'De % llegaron % % y ya se devolvieron %: como mucho podés devolver % %.',
          v_x.nombre, _compras_cant_txt(v_x.llego), v_x.unidad, _compras_cant_txt(v_x.devuelto),
          _compras_cant_txt(greatest(v_x.llego - v_x.devuelto, 0)), v_x.unidad;
      end if;
    end loop;
    for v_x in
      select x.pedido_item_id, sum(x.cantidad) as cant, max(x.descripcion) as nombre, max(x.unidad) as unidad,
             coalesce((select sum(ri.cantidad) from compras_remito_items ri where ri.pedido_item_id = x.pedido_item_id), 0) as llego,
             coalesce((select sum(d.devuelto) from _compras_devuelto(v_pedido.id) d where d.pedido_item_id = x.pedido_item_id), 0) as devuelto
      from jsonb_to_recordset(v_lineas) as x(pedido_item_id uuid, cantidad numeric, descripcion text, unidad text)
      where x.pedido_item_id is not null
      group by x.pedido_item_id
    loop
      if v_x.cant > v_x.llego - v_x.devuelto then
        raise exception 'De % llegaron % % y ya se devolvieron %: como mucho podés devolver % %.',
          v_x.nombre, _compras_cant_txt(v_x.llego), v_x.unidad, _compras_cant_txt(v_x.devuelto),
          _compras_cant_txt(greatest(v_x.llego - v_x.devuelto, 0)), v_x.unidad;
      end if;
    end loop;
  elsif not v_motivo.corrige_precio then
    for v_x in
      select x.item_id, sum(x.cantidad) as cant, i.nombre, max(x.unidad) as unidad,
             coalesce((select sum(fi.cantidad) from compras_factura_items fi
                       where fi.factura_id = v_factura.id and fi.item_id = x.item_id), 0) as facturado,
             coalesce((select sum(fi.cantidad) from compras_facturas nc join compras_factura_items fi on fi.factura_id = nc.id
                       where nc.factura_origen_id = v_factura.id and nc.tipo_comprobante = 'nota_credito'
                         and nc.estado = 'confirmada' and fi.item_id = x.item_id), 0)
             + coalesce((select sum(di.cantidad) from compras_devoluciones d join compras_devolucion_items di on di.devolucion_id = d.id
                         where d.pedido_id = v_pedido.id and d.estado = 'activa' and not d.devuelve_mercaderia
                           and not d.corrige_precio and d.nota_credito_id is null and di.item_id = x.item_id), 0) as reclamado
      from jsonb_to_recordset(v_lineas) as x(item_id uuid, cantidad numeric, unidad text)
      join compras_items i on i.id = x.item_id
      group by x.item_id, i.nombre
    loop
      if v_x.cant > v_x.facturado - v_x.reclamado then
        raise exception 'De % se facturaron % % y ya se reclamaron %: como mucho % %.',
          v_x.nombre, _compras_cant_txt(v_x.facturado), v_x.unidad, _compras_cant_txt(v_x.reclamado),
          _compras_cant_txt(greatest(v_x.facturado - v_x.reclamado, 0)), v_x.unidad;
      end if;
    end loop;
  end if;

  select array_agg(distinct x.item_id) into v_items_ids
  from jsonb_to_recordset(v_lineas) as x(item_id uuid) where x.item_id is not null;

  if p_diferencia_id is not null then
    select * into v_dif from compras_factura_discrepancias where id = p_diferencia_id;
    if not found or not v_tiene_factura or v_dif.factura_id <> v_factura.id
       or not coalesce(v_dif.item_id = any(v_items_ids), false) then
      raise exception 'Esa diferencia es de otro insumo. Recargá la página.';
    end if;
  end if;

  -- 5. Guarda R3 (E14). La corrección de precio no cambia cantidades: no la necesita.
  if not v_motivo.corrige_precio then
    perform _compras_exigir_sin_ajuste_factura(v_pedido.id, v_items_ids, 'registrar la devolución');
  end if;

  -- 6. Alta
  update compras_pedidos
    set ultima_secuencia_devolucion = greatest(
      ultima_secuencia_devolucion,
      (select coalesce(max(secuencia), 0) from compras_devoluciones where pedido_id = v_pedido.id)
    ) + 1
    where id = v_pedido.id
    returning ultima_secuencia_devolucion into v_pedido.ultima_secuencia_devolucion;

  insert into compras_devoluciones (pedido_id, secuencia, factura_id, motivo_id, motivo_nombre, devuelve_mercaderia,
                                    corrige_precio, repone, nota, creado_por)
  values (v_pedido.id, v_pedido.ultima_secuencia_devolucion, v_factura.id, v_motivo.id, v_motivo.nombre,
          v_motivo.devuelve_mercaderia, v_motivo.corrige_precio, v_repone, nullif(btrim(p_nota), ''), auth.uid())
  returning * into v_dev;
  v_codigo := _compras_codigo_devolucion(v_pedido.numero, v_dev.secuencia);

  insert into compras_devolucion_items (devolucion_id, pedido_item_id, item_id, factura_item_id, descripcion, unidad,
                                        cantidad, cantidad_base, precio_correcto, orden)
  select v_dev.id, x.pedido_item_id, x.item_id, x.factura_item_id, x.descripcion, x.unidad,
         x.cantidad, x.cantidad_base, x.precio_correcto, x.idx
  from jsonb_to_recordset(v_lineas) as x(idx int, item_id uuid, pedido_item_id uuid, factura_item_id uuid,
                                          descripcion text, unidad text, cantidad numeric, cantidad_base numeric,
                                          precio_correcto numeric);

  -- 7. Stock (solo con mercadería), un movimiento por insumo, en unidad de compra.
  if v_motivo.devuelve_mercaderia then
    for v_mov in
      select di.item_id, sum(di.cantidad) as total,
             case when bool_and(di.cantidad_base is not null) then sum(di.cantidad_base) end as base,
             max(i.unidad_base) as unidad_base
      from compras_devolucion_items di join compras_items i on i.id = di.item_id
      where di.devolucion_id = v_dev.id
      group by di.item_id
    loop
      perform compras_mover_stock(
        v_mov.item_id, -v_mov.total, 'devolucion_proveedor',
        'Devolución ' || v_codigo || ' a ' || coalesce(v_proveedor, 'proveedor') || ': ' || v_motivo.nombre
          || coalesce(' (' || _compras_cant_txt(v_mov.base) || ' ' || coalesce(v_mov.unidad_base, 'kg') || ')', ''),
        null, null, null, v_factura.id, null, v_dev.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', -v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;
  end if;

  -- 8. Nota de crédito
  if p_nota_credito is not null then
    if jsonb_typeof(p_nota_credito->'lineas') <> 'array' then
      raise exception 'Las líneas de la nota de crédito vienen mal armadas. Recargá la página.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'devolucion_item_id', di.id,
             'precio_unitario', l->'precio_unitario',
             'alicuota_iva', l->'alicuota_iva')), '[]'::jsonb)
      into v_nc_lineas
    from jsonb_array_elements(p_nota_credito->'lineas') l
    join compras_devolucion_items di on di.devolucion_id = v_dev.id and di.orden = (l->>'indice')::int;

    v_nc := _compras_crear_nota_credito(v_dev, v_factura, p_nota_credito->>'numero',
              nullif(p_nota_credito->>'fecha', '')::date, v_nc_lineas,
              nullif(p_nota_credito->>'total_papel', '')::numeric);
    update compras_devoluciones set nota_credito_id = v_nc.id where id = v_dev.id returning * into v_dev;
    v_gasto := _compras_nc_aplicar_gasto(v_nc.id);
    select * into v_nc from compras_facturas where id = v_nc.id;
  end if;

  -- 9. Evento (sin montos: lo lee cualquiera con Compras)
  perform compras_registrar_evento_pedido(v_pedido.id, 'devolucion_registrada', jsonb_build_object(
    'devolucion_id', v_dev.id, 'secuencia', v_dev.secuencia, 'motivo', v_dev.motivo_nombre,
    'devuelve_mercaderia', v_dev.devuelve_mercaderia, 'corrige_precio', v_dev.corrige_precio,
    'repone', v_dev.repone, 'nota', v_dev.nota,
    'lineas', compras_lineas_devolucion_snapshot(v_dev.id)));

  -- 10. Recálculos (el del pedido incluye la guarda E7)
  perform compras_recalcular_estado_pedido(v_pedido.id);
  if v_tiene_factura then
    perform compras_recalcular_diferencias_factura(v_factura.id);
    -- 11. E13
    perform _compras_marcar_esperando_nc(v_dev.id);
  end if;

  return jsonb_build_object(
    'id', v_dev.id,
    'codigo', v_codigo,
    'impacto', v_impacto,
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = v_pedido.id),
    'nota_credito', case when v_nc.id is null then null else jsonb_build_object(
      'id', v_nc.id, 'numero', v_nc.numero, 'total', v_nc.total,
      'gasto', v_gasto->>'gasto', 'monto_antes', v_gasto->'monto_antes', 'monto_despues', v_gasto->'monto_despues') end,
    'diferencias_pendientes', case when v_tiene_factura then
      (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id and resolucion = 'pendiente') else 0 end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_resolver_diferencia(p_diferencia_id uuid DEFAULT NULL::uuid, p_resolucion text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_factura_id uuid;
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_dif        compras_factura_discrepancias%rowtype;
  v_mov_id     uuid;
  v_despues    numeric;
  v_codigo     text;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede resolver diferencias de facturas.';
  end if;
  if p_resolucion is null or p_resolucion not in ('ajusta_stock', 'reclamo_proveedor', 'ignorada') then
    raise exception 'Elegí qué hacer con la diferencia.';
  end if;

  select d.factura_id, f.pedido_id into v_factura_id, v_pedido_id
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  where d.id = p_diferencia_id;
  if not found then
    raise exception 'Esa diferencia ya no está: puede que un remito la haya hecho coincidir. Recargá la página.';
  end if;

  -- Orden de bloqueo: pedido → factura → diferencia → stock.
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = v_factura_id for update;
  select * into v_dif from compras_factura_discrepancias where id = p_diferencia_id for update;
  if not found then
    raise exception 'Esa diferencia ya no está: puede que un remito la haya hecho coincidir. Recargá la página.';
  end if;

  v_codigo := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if v_factura.estado <> 'confirmada' then
    raise exception 'La factura ya no está confirmada. Recargá la página.';
  end if;
  if v_dif.resolucion <> 'pendiente' then
    raise exception 'Esa diferencia ya se resolvió. Recargá la página para ver cómo quedó.';
  end if;
  if v_pedido.estado_recepcion not in ('recibido', 'cerrado_manual', 'devuelto') then
    raise exception 'Todavía falta recibir mercadería de %. Esperá el próximo remito o, si no va a llegar, cerrá el pedido a mano.', v_codigo;
  end if;

  if p_resolucion = 'ajusta_stock' then
    v_mov_id := compras_mover_stock(
      v_dif.item_id, v_dif.diferencia, 'ajuste_factura',
      'Diferencia con la factura ' || v_factura.numero || ' (' || v_codigo || ')'
        || coalesce(': ' || nullif(btrim(p_nota), ''), ''),
      null, null, null, v_factura.id, v_dif.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_dif.item_id;
  end if;

  update compras_factura_discrepancias
    set resolucion = p_resolucion,
        movimiento_id = v_mov_id,
        nota = nullif(btrim(p_nota), ''),
        resuelto_por = auth.uid(),
        resuelto_en = now(),
        updated_at = now()
    where id = v_dif.id;

  return jsonb_build_object(
    'resolucion', p_resolucion,
    'delta', case when v_mov_id is null then null else v_dif.diferencia end,
    'cantidad_despues', v_despues
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_revertir_diferencia(p_diferencia_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_factura_id uuid;
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_dif        compras_factura_discrepancias%rowtype;
  v_mov        compras_stock_movimientos%rowtype;
  v_despues    numeric;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede revertir diferencias de facturas.';
  end if;

  select d.factura_id, f.pedido_id into v_factura_id, v_pedido_id
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  where d.id = p_diferencia_id;
  if not found then
    raise exception 'Esa diferencia ya no está. Recargá la página.';
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = v_factura_id for update;
  select * into v_dif from compras_factura_discrepancias where id = p_diferencia_id for update;
  if not found then
    raise exception 'Esa diferencia ya no está. Recargá la página.';
  end if;
  if v_dif.resolucion = 'pendiente' then
    raise exception 'Esa diferencia ya está pendiente. Recargá la página.';
  end if;

  if v_dif.resolucion = 'ajusta_stock' then
    select * into v_mov from compras_stock_movimientos where id = v_dif.movimiento_id;
    perform compras_mover_stock(
      v_mov.item_id, -v_mov.delta, 'reversion',
      'Se revirtió el ajuste por la factura ' || v_factura.numero,
      null, null, v_mov.id, v_factura.id, v_dif.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
  end if;

  update compras_factura_discrepancias
    set resolucion = 'pendiente',
        movimiento_id = null,
        nota = null,
        resuelto_por = null,
        resuelto_en = null,
        updated_at = now()
    where id = v_dif.id;

  perform compras_recalcular_diferencias_factura(v_factura.id);

  return jsonb_build_object(
    'delta', case when v_mov.id is null then null else -v_mov.delta end,
    'cantidad_despues', v_despues
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_tablero_resumen()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin  boolean := es_admin();
  v_dias   int := greatest(_compras_config_num('pedidos.dias_demora', 3)::int, 1);
  v_res    jsonb;
  v_est    numeric;
  v_sin    int;
  v_pend   numeric;
  v_favor  numeric;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_res := jsonb_build_object(
    'dias_demora', v_dias,
    'por_recibir', (select count(*) from _compras_pedidos_por_recibir()),
    'demorados', (select count(*) from _compras_pedidos_demorados(v_dias)),
    'por_facturar', (select count(*) from _compras_pedidos_por_facturar()),
    'stock_bajo', (select count(*) from _compras_insumos_bajo_minimo()),
    'stock_bajo_sin_pedido', (select count(*) from _compras_insumos_bajo_minimo() where not en_pedido));

  if not v_admin then
    return v_res || jsonb_build_object(
      'por_facturar_estimado', null, 'por_facturar_sin_precio', null, 'diferencias', null,
      'nc_pendientes', null, 'deuda_pendiente', null, 'deuda_a_favor', null);
  end if;

  -- D3: lo recibido neto de los pedidos por facturar, a precio_ref del proveedor, sin IVA.
  -- Neto como v_compras_pedido_pendiente (recibido − devuelto con mercadería).
  select coalesce(sum(l.cant * l.precio_ref) filter (where l.precio_ref is not null), 0),
         count(*) filter (where l.precio_ref is null)::int
    into v_est, v_sin
  from (
    select ip.precio_ref,
           case when coalesce(ip.cobra_por, i.cobra_por_default) = 'base'
                then case when r.completo
                          then coalesce(r.recibido_base, 0) - coalesce(dv.devuelto_base, 0)
                          else (coalesce(r.recibido, 0) - coalesce(dv.devuelto, 0)) * coalesce(i.cantidad_por_unidad, 1) end
                else coalesce(r.recibido, 0) - coalesce(dv.devuelto, 0) end as cant
    from _compras_pedidos_por_facturar() pf
    join compras_pedido_items pi on pi.pedido_id = pf.pedido_id
    left join compras_items i on i.id = pi.item_id
    left join compras_item_proveedores ip on ip.item_id = pi.item_id and ip.proveedor_id = pf.proveedor_id
    left join lateral (
      select sum(ri.cantidad) as recibido, sum(ri.cantidad_base) as recibido_base,
             bool_and(ri.cantidad_base is not null) as completo
      from compras_remito_items ri where ri.pedido_item_id = pi.id
    ) r on true
    left join lateral (
      select sum(di.cantidad) as devuelto,
             sum(coalesce(di.cantidad_base, di.cantidad * i.cantidad_por_unidad)) as devuelto_base
      from compras_devolucion_items di
      join compras_devoluciones d on d.id = di.devolucion_id
      where di.pedido_item_id = pi.id and d.estado = 'activa' and d.devuelve_mercaderia
    ) dv on true
    where coalesce(r.recibido, 0) > 0
  ) l;
  -- Una línea sin item_id no tiene precio_ref: cuenta como "sin precio" por el left join.

  -- Deuda: replica estadoPago + resumirPagos (lib/compras/reportes.ts) sobre
  -- comprobantes confirmados; la NC hereda el gasto de su factura origen (v_compras_facturas).
  select coalesce(sum(case when f.tipo_comprobante = 'nota_credito' then -f.total else f.total end)
                    filter (where not (f.tipo_comprobante = 'nota_credito' and f.nc_gasto in ('a_favor', 'sin_gasto'))
                              and coalesce(f.gasto_id, fo.gasto_id) is not null
                              and coalesce(g.estado, go.estado) is distinct from 'Pagado'), 0),
         coalesce(sum(-f.total) filter (where f.tipo_comprobante = 'nota_credito' and f.nc_gasto = 'a_favor'), 0)
    into v_pend, v_favor
  from compras_facturas f
  left join gastos g on g.id = f.gasto_id
  left join compras_facturas fo on fo.id = f.factura_origen_id
  left join gastos go on go.id = fo.gasto_id
  where f.estado = 'confirmada'
    and (f.tipo_comprobante = 'nota_credito' and f.nc_gasto = 'a_favor'
         or (coalesce(f.gasto_id, fo.gasto_id) is not null and coalesce(g.estado, go.estado) is distinct from 'Pagado'));

  return v_res || jsonb_build_object(
    'por_facturar_estimado', round(v_est, 2),
    'por_facturar_sin_precio', v_sin,
    'diferencias', (select count(*) from _compras_pedidos_con_diferencias()),
    'nc_pendientes', (select count(distinct pedido_id) from _compras_devoluciones_esperan_nc()),
    'deuda_pendiente', round(v_pend, 2),
    'deuda_a_favor', round(v_favor, 2));
end;
$function$;

CREATE OR REPLACE FUNCTION public.compras_trazabilidad_insumo(p_desde date, p_hasta date, p_item_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(item_id uuid, item_nombre text, item_estado text, categoria_nombre text, unidad text, unidad_base text, contenido numeric, pedido_cantidad numeric, pedidos integer, recibido_cantidad numeric, recibido_base_real numeric, recibido_sin_pesar integer, remitos integer, facturado_cantidad numeric, facturado_base numeric, facturado_neto numeric, facturado_total numeric, facturas integer, proveedores_facturados integer, precio_prom_unidad numeric, precio_prom_base numeric, ultimo_precio numeric, ultimo_precio_por text, ultimo_precio_fecha date, ultimo_precio_factura_id uuid, ultimo_precio_proveedor text, stock_inicio numeric, stock_fin numeric, stock_actual numeric, mov_remitos numeric, mov_conteo numeric, mov_factura numeric, mov_manual numeric, mov_devolucion numeric, mov_otros numeric, consumido_produccion numeric, pendiente_recibir numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_admin boolean := es_admin();
  v_ini   timestamptz;
  v_fin   timestamptz;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Elegí desde y hasta.';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha "hasta" es anterior a "desde".';
  end if;
  if p_hasta - p_desde > 731 then
    raise exception 'El período puede tener hasta 2 años. Achicalo.';
  end if;

  -- Días de Argentina: [desde 00:00, hasta+1 00:00).
  v_ini := p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_fin := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  return query
  with
  -- Pedido: líneas de pedidos ENVIADOS en el período (enviado_en no cambia con el reenvío).
  pe as (
    select pi.item_id, sum(pi.cantidad) as cantidad, count(distinct p.id)::int as pedidos
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id is not null and p.enviado_en >= v_ini and p.enviado_en < v_fin
      and (p_item_id is null or pi.item_id = p_item_id)
    group by pi.item_id
  ),
  -- Recibido: líneas de remitos con fecha en el período (incluye los "desde factura").
  re as (
    select ri.item_id, sum(ri.cantidad) as cantidad, sum(ri.cantidad_base) as base_real,
           count(*) filter (where ri.cantidad_base is null)::int as sin_pesar,
           count(distinct r.id)::int as remitos
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    where ri.item_id is not null and r.fecha between p_desde and p_hasta
      and (p_item_id is null or ri.item_id = p_item_id)
    group by ri.item_id
  ),
  -- Líneas de factura confirmadas del período. Solo admin: si no, ni se leen.
  fl as (
    select fi.item_id, f.id as factura_id, f.fecha, f.confirmada_en, f.proveedor_id, f.tipo_comprobante,
           fi.cantidad, fi.cantidad_base, fi.precio_unitario, fi.precio_por, fi.orden, fi.id as linea_id,
           coalesce(fi.subtotal, 0) as subtotal, coalesce(fi.iva, 0) as iva,
           case when f.tipo_comprobante = 'nota_credito' then -1 else 1 end as signo,
           coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad) as base
    from compras_factura_items fi
    join compras_facturas f on f.id = fi.factura_id
    join compras_items i on i.id = fi.item_id
    where v_admin and fi.item_id is not null and f.estado = 'confirmada'
      and f.fecha between p_desde and p_hasta
      and (p_item_id is null or fi.item_id = p_item_id)
  ),
  fa as (
    select fl.item_id,
      sum(fl.signo * fl.cantidad) as cantidad,
      sum(fl.signo * fl.base) as base,
      sum(fl.signo * fl.subtotal) as neto,
      sum(fl.signo * (fl.subtotal + fl.iva)) as total,
      count(distinct fl.factura_id)::int as facturas,
      count(distinct fl.proveedor_id)::int as proveedores,
      -- E4: ponderado, solo facturas (no NC), con cantidad y subtotal > 0.
      sum(fl.subtotal) filter (where fl.signo = 1 and fl.cantidad > 0 and fl.subtotal > 0)
        / nullif(sum(fl.cantidad) filter (where fl.signo = 1 and fl.cantidad > 0 and fl.subtotal > 0), 0) as prom_unidad,
      sum(fl.subtotal) filter (where fl.signo = 1 and fl.base > 0 and fl.subtotal > 0)
        / nullif(sum(fl.base) filter (where fl.signo = 1 and fl.base > 0 and fl.subtotal > 0), 0) as prom_base
    from fl
    group by fl.item_id
  ),
  -- E5: último precio del período (mismo orden que v_compras_insumos_resumen).
  uf as (
    select distinct on (fl.item_id) fl.item_id, fl.precio_unitario, fl.precio_por, fl.fecha, fl.factura_id,
           pr.nombre as proveedor
    from fl
    left join proveedores pr on pr.id = fl.proveedor_id
    where fl.signo = 1 and fl.precio_unitario > 0
    order by fl.item_id, fl.fecha desc, fl.confirmada_en desc nulls last, fl.orden desc, fl.linea_id desc
  ),
  -- E7: puente de stock. La reversión cuenta en el grupo del movimiento que anula.
  mv as (
    select m.item_id,
      sum(m.delta) filter (where m.created_at < v_ini) as inicio,
      sum(m.delta) filter (where m.created_at < v_fin) as fin,
      count(*) filter (where m.created_at >= v_ini and m.created_at < v_fin) as en_periodo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) in ('entrada_remito', 'salida_remito_anulado')) as remitos,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) in ('ajuste_conteo', 'conteo_fabrica')) as conteo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'ajuste_factura') as factura,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'ajuste_manual') as manual,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'devolucion_proveedor') as devolucion,
      -- A4 suma el tipo 'consumo_produccion' al check: este número aparece solo.
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'consumo_produccion') as consumo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) not in ('entrada_remito', 'salida_remito_anulado', 'ajuste_conteo',
          'conteo_fabrica', 'ajuste_factura', 'ajuste_manual', 'devolucion_proveedor', 'consumo_produccion')) as otros
    from compras_stock_movimientos m
    left join compras_stock_movimientos o on o.id = m.anula_movimiento_id and m.tipo = 'reversion'
    where m.created_at < v_fin
      and (p_item_id is null or m.item_id = p_item_id)
    group by m.item_id
  ),
  -- Pendiente de recibir hoy (no depende del período; mismo cálculo que v_compras_insumos_resumen).
  pa as (
    select pi.item_id,
           sum(greatest(pi.cantidad - coalesce((select sum(ri.cantidad) from compras_remito_items ri
                                                where ri.pedido_item_id = pi.id), 0), 0)) as pendiente
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id is not null and p.estado_recepcion in ('enviado', 'parcial')
      and (p_item_id is null or pi.item_id = p_item_id)
    group by pi.item_id
  )
  select
    i.id, i.nombre, i.estado, cat.nombre, i.unidad, i.unidad_base, i.cantidad_por_unidad,
    coalesce(pe.cantidad, 0), coalesce(pe.pedidos, 0),
    coalesce(re.cantidad, 0), re.base_real, coalesce(re.sin_pesar, 0), coalesce(re.remitos, 0),
    case when v_admin then coalesce(fa.cantidad, 0) end,
    case when v_admin then coalesce(fa.base, 0) end,
    case when v_admin then coalesce(fa.neto, 0) end,
    case when v_admin then coalesce(fa.total, 0) end,
    case when v_admin then coalesce(fa.facturas, 0) end,
    case when v_admin then coalesce(fa.proveedores, 0) end,
    fa.prom_unidad, fa.prom_base,
    uf.precio_unitario, uf.precio_por, uf.fecha, uf.factura_id, uf.proveedor,
    coalesce(mv.inicio, 0), coalesce(mv.fin, 0), coalesce(sa.cantidad, 0),
    coalesce(mv.remitos, 0), coalesce(mv.conteo, 0), coalesce(mv.factura, 0), coalesce(mv.manual, 0),
    coalesce(mv.devolucion, 0), coalesce(mv.otros, 0), -coalesce(mv.consumo, 0),
    coalesce(pa.pendiente, 0)
  from compras_items i
  left join compras_categorias cat on cat.id = i.categoria_id
  left join pe on pe.item_id = i.id
  left join re on re.item_id = i.id
  left join fa on fa.item_id = i.id
  left join uf on uf.item_id = i.id
  left join mv on mv.item_id = i.id
  left join pa on pa.item_id = i.id
  left join compras_stock_actual sa on sa.item_id = i.id
  where (p_item_id is not null and i.id = p_item_id)
     or (p_item_id is null and (pe.item_id is not null or re.item_id is not null
                                or fa.item_id is not null or coalesce(mv.en_periodo, 0) > 0))
  order by coalesce(fa.neto, 0) desc, i.nombre;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fabrica_confirmar_recepcion_pedido(p_pedido_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_items_nuevos jsonb DEFAULT '[]'::jsonb, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido pedidos%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_diferencias jsonb := '[]'::jsonb;
  v_prod productos%rowtype;
  v_peso_kg numeric;
  v_enviada numeric;
  v_recibida numeric;
  v_dif numeric;
  v_con_dif boolean;
  r record;
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if not (v_pedido.local_id = auth.uid() or get_user_rol() = 'admin') then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado = 'recibido' then
    raise exception 'La recepción de este pedido ya se confirmó';
  elsif v_pedido.estado <> 'enviado' then
    raise exception 'No se puede confirmar la recepción: el pedido está %', _pedido_estado_label(v_pedido.estado);
  end if;

  drop table if exists pg_temp._recepcion;
  drop table if exists pg_temp._recepcion_nuevos;
  create temporary table _recepcion (item_id uuid, cantidad_recibida numeric, valor_total numeric) on commit drop;
  create temporary table _recepcion_nuevos (producto_id uuid, cantidad_recibida numeric, valor_total numeric) on commit drop;
  begin
    insert into _recepcion
    select (it->>'id')::uuid, (it->>'cantidad_recibida')::numeric, (it->>'valor_total')::numeric
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it;
    insert into _recepcion_nuevos
    select (it->>'producto_id')::uuid, (it->>'cantidad_recibida')::numeric, (it->>'valor_total')::numeric
    from jsonb_array_elements(coalesce(p_items_nuevos, '[]'::jsonb)) it;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Hay un producto o una cantidad que no es válida';
  end;

  if exists (select 1 from _recepcion where cantidad_recibida < 0 or valor_total < 0)
     or exists (select 1 from _recepcion_nuevos where cantidad_recibida < 0 or valor_total < 0) then
    raise exception 'Las cantidades y los importes no pueden ser negativos';
  end if;
  if exists (select 1 from _recepcion re where not exists (
    select 1 from pedido_items pi where pi.id = re.item_id and pi.pedido_id = p_pedido_id)) then
    raise exception 'Hay un producto que no es de este pedido';
  end if;
  -- Un ítem repetido duplicaría el ajuste de stock.
  if exists (select 1 from _recepcion group by item_id having count(*) > 1) then
    raise exception 'Hay un producto informado dos veces. Dejá una sola cantidad por producto';
  end if;
  if exists (select 1 from _recepcion_nuevos where producto_id is not null group by producto_id having count(*) > 1) then
    raise exception 'Hay un producto agregado dos veces. Dejá una sola cantidad por producto';
  end if;

  -- Ítems del pedido: recibido = lo informado o, si no se informó, lo enviado.
  for r in
    select pi.id, pi.producto_id, pi.producto_nombre,
           coalesce(pi.cantidad_enviada, pi.cantidad) as enviada,
           re.item_id is not null as informado,
           re.cantidad_recibida, re.valor_total
    from pedido_items pi
    left join _recepcion re on re.item_id = pi.id
    where pi.pedido_id = p_pedido_id
  loop
    v_enviada := r.enviada;
    v_recibida := coalesce(r.cantidad_recibida, v_enviada);

    update pedido_items
      set cantidad_recibida = v_recibida,
          valor_total = case when r.informado then r.valor_total else valor_total end
      where id = r.id;

    v_dif := v_enviada - v_recibida;
    if v_dif <> 0 then
      v_diferencias := v_diferencias || jsonb_build_object(
        'item_id', r.id, 'producto_id', r.producto_id, 'producto_nombre', r.producto_nombre,
        'enviada', v_enviada, 'recibida', v_recibida
      );
      -- El envío descontó lo enviado: si llegó menos se devuelve la
      -- diferencia; si llegó más, se descuenta.
      if v_pedido.destino = 'fabrica' and r.producto_id is not null then
        select fp.peso_kg into v_peso_kg
          from productos p join fabrica_presentaciones fp on fp.id = p.presentacion_id
          where p.id = r.producto_id;
        if v_peso_kg is not null then
          perform mover_stock_terminado(r.producto_id, v_dif * v_peso_kg, 'ajuste_pedido', null, p_pedido_id);
        end if;
      end if;
    end if;
  end loop;

  -- Productos que llegaron sin pedirse.
  for r in select * from _recepcion_nuevos
  loop
    if r.producto_id is null then
      raise exception 'Hay un producto que no es válido';
    end if;
    if r.cantidad_recibida is null or r.cantidad_recibida <= 0 then
      raise exception 'La cantidad de un producto agregado tiene que ser mayor a 0';
    end if;
    select * into v_prod from productos where id = r.producto_id;
    if not found then
      raise exception 'Hay un producto que no es válido';
    end if;
    if v_prod.destino <> v_pedido.destino then
      raise exception '% no se despacha desde este destino', v_prod.nombre;
    end if;
    if exists (select 1 from pedido_items where pedido_id = p_pedido_id and producto_id = r.producto_id) then
      raise exception '% ya está en el pedido: corregí su cantidad en la lista', v_prod.nombre;
    end if;

    insert into pedido_items (pedido_id, producto_id, producto_nombre, cantidad, cantidad_recibida, valor_total, origen)
    values (p_pedido_id, v_prod.id, v_prod.nombre, 0, r.cantidad_recibida, r.valor_total, 'recepcion');

    v_diferencias := v_diferencias || jsonb_build_object(
      'producto_id', v_prod.id, 'producto_nombre', v_prod.nombre,
      'enviada', 0, 'recibida', r.cantidad_recibida, 'agregado', true
    );

    if v_pedido.destino = 'fabrica' then
      select fp.peso_kg into v_peso_kg
        from fabrica_presentaciones fp where fp.id = v_prod.presentacion_id;
      if v_peso_kg is not null then
        -- Nunca se descontó al enviar: sale todo ahora.
        perform mover_stock_terminado(v_prod.id, -(r.cantidad_recibida * v_peso_kg), 'ajuste_pedido', null, p_pedido_id);
      end if;
    end if;
  end loop;

  v_con_dif := jsonb_array_length(v_diferencias) > 0;

  update pedidos
    set estado = 'recibido', recibido_at = now(),
        recepcion_con_diferencias = v_con_dif, nota_recepcion = v_nota
    where id = p_pedido_id;

  perform _pedido_evento(
    p_pedido_id,
    case when v_con_dif then 'recibido_con_diferencias' else 'recibido' end,
    jsonb_build_object('diferencias', v_diferencias, 'nota', v_nota)
  );

  return jsonb_build_object('con_diferencias', v_con_dif);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pedido_cancelar(p_pedido_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido pedidos%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if not (v_pedido.local_id = auth.uid() or puede_operar_destino(v_pedido.destino)) then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado not in ('pendiente', 'preparando') then
    raise exception 'No se puede cancelar: el pedido está %', _pedido_estado_label(v_pedido.estado);
  end if;

  update pedidos
    set estado = 'cancelado', cancelado_at = now(), cancelado_por = auth.uid(), motivo_cancelacion = v_motivo
    where id = p_pedido_id;
  perform _pedido_evento(p_pedido_id, 'cancelado', jsonb_build_object('motivo', v_motivo));
end;
$function$;

CREATE OR REPLACE FUNCTION public.pedidos_crear(p_items jsonb, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_local_nombre text;
  v_grupo uuid := gen_random_uuid();
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_pedido_id uuid;
  v_numero integer;
  v_resultado jsonb := '[]'::jsonb;
  v_destino text;
  v_cant integer;
  r record;
begin
  if coalesce(get_user_rol(), '') <> 'local' then
    raise exception 'No autorizado';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  select coalesce(nullif(local_nombre, ''), nombre) into v_local_nombre from profiles where id = v_uid;

  drop table if exists pg_temp._pedido_nuevo;
  create temporary table _pedido_nuevo (producto_id uuid, cantidad numeric) on commit drop;

  begin
    insert into _pedido_nuevo (producto_id, cantidad)
    select (it->>'producto_id')::uuid, (it->>'cantidad')::numeric
    from jsonb_array_elements(p_items) it;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Hay un producto o una cantidad que no es válida';
  end;

  if exists (select 1 from _pedido_nuevo where producto_id is null) then
    raise exception 'Hay un producto que no es válido';
  end if;

  for r in
    select pr.nombre
    from _pedido_nuevo n left join productos pr on pr.id = n.producto_id
    where n.cantidad is null or n.cantidad <= 0
    limit 1
  loop
    raise exception 'La cantidad de % tiene que ser mayor a 0', coalesce(r.nombre, 'un producto');
  end loop;

  for r in
    select n.producto_id, pr.nombre, pr.activo
    from _pedido_nuevo n
    left join productos pr on pr.id = n.producto_id
    left join catalogo_categorias cat on cat.destino = pr.destino and cat.nombre = pr.categoria
    where pr.id is null or pr.activo is not true or cat.activa is false
    limit 1
  loop
    raise exception '% ya no está disponible. Sacalo del pedido y volvé a enviarlo', coalesce(r.nombre, 'Un producto');
  end loop;

  for v_destino in
    select distinct pr.destino from _pedido_nuevo n join productos pr on pr.id = n.producto_id order by 1
  loop
    insert into pedidos (local_id, local_nombre, destino, notas, grupo_id)
    values (v_uid, coalesce(v_local_nombre, 'Local'), v_destino, v_notas, v_grupo)
    returning id, numero into v_pedido_id, v_numero;

    -- Si el mismo producto viene dos veces se suma.
    insert into pedido_items (pedido_id, producto_id, producto_nombre, cantidad, origen)
    select v_pedido_id, pr.id, pr.nombre, sum(n.cantidad), 'pedido'
    from _pedido_nuevo n join productos pr on pr.id = n.producto_id
    where pr.destino = v_destino
    group by pr.id, pr.nombre;
    get diagnostics v_cant = row_count;

    perform _pedido_evento(v_pedido_id, 'creado', jsonb_build_object('productos', v_cant));

    v_resultado := v_resultado || jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'destino', v_destino);
  end loop;

  return v_resultado;
end;
$function$;

drop policy if exists "Admins gestionan cajas" on public.cajas;
create policy "Admins gestionan cajas" on public.cajas
  as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))));

drop policy if exists "compras_factura_discrepancias_admin" on public.compras_factura_discrepancias;
create policy "compras_factura_discrepancias_admin" on public.compras_factura_discrepancias
  as permissive for select to public
  using (es_admin());

drop policy if exists "compras_factura_items_lectura" on public.compras_factura_items;
create policy "compras_factura_items_lectura" on public.compras_factura_items
  as permissive for select to public
  using (es_admin());

drop policy if exists "compras_facturas_lectura" on public.compras_facturas;
create policy "compras_facturas_lectura" on public.compras_facturas
  as permissive for select to public
  using (es_admin());

drop policy if exists "admin ve conciliaciones" on public.conciliaciones;
create policy "admin ve conciliaciones" on public.conciliaciones
  as permissive for select to public
  using ((get_user_rol() = 'admin'::text));

drop policy if exists "sistema maneja conciliaciones" on public.conciliaciones;
create policy "sistema maneja conciliaciones" on public.conciliaciones
  as permissive for all to public
  using ((get_user_rol() = 'admin'::text));

drop policy if exists "admin gestiona config" on public.config;
create policy "admin gestiona config" on public.config
  as permissive for all to public
  using ((get_user_rol() = 'admin'::text));

drop policy if exists "Admins gestionan formas_pago" on public.formas_pago;
create policy "Admins gestionan formas_pago" on public.formas_pago
  as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_categorias_gasto;
create policy "admin_select" on public.fudo_categorias_gasto
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_categorias_ingrediente;
create policy "admin_select" on public.fudo_categorias_ingrediente
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_categorias_producto;
create policy "admin_select" on public.fudo_categorias_producto
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_clientes;
create policy "admin_select" on public.fudo_clientes
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_gastos;
create policy "admin_select" on public.fudo_gastos
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_ingredientes;
create policy "admin_select" on public.fudo_ingredientes
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_metodos_pago;
create policy "admin_select" on public.fudo_metodos_pago
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "Admins gestionan fudo_pagos" on public.fudo_pagos;
create policy "Admins gestionan fudo_pagos" on public.fudo_pagos
  as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_pagos;
create policy "admin_select" on public.fudo_pagos
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_productos;
create policy "admin_select" on public.fudo_productos
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_proveedores;
create policy "admin_select" on public.fudo_proveedores
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_sync_log;
create policy "admin_select" on public.fudo_sync_log
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_venta_items;
create policy "admin_select" on public.fudo_venta_items
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin_select" on public.fudo_ventas;
create policy "admin_select" on public.fudo_ventas
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text)))));

drop policy if exists "admin maneja gastos" on public.gastos;
create policy "admin maneja gastos" on public.gastos
  as permissive for all to public
  using ((( SELECT profiles.rol
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

drop policy if exists "Solo admins pueden modificar locales_config" on public.locales_config;
create policy "Solo admins pueden modificar locales_config" on public.locales_config
  as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))));

drop policy if exists "Solo admins pueden ver locales_config" on public.locales_config;
create policy "Solo admins pueden ver locales_config" on public.locales_config
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.rol = 'admin'::text)))));

drop policy if exists "ven pedidos el local dueño y el operador del destino" on public.pedidos;
create policy "ven pedidos el local dueño y el operador del destino" on public.pedidos
  as permissive for select to public
  using (((local_id = auth.uid()) OR puede_operar_destino(destino)));

drop policy if exists "deposito gestiona sus insumos" on public.productos;
create policy "deposito gestiona sus insumos" on public.productos
  as permissive for all to public
  using (((get_user_rol() = 'admin'::text) OR ((get_user_rol() = 'deposito'::text) AND (destino = 'deposito'::text))));

drop policy if exists "fabrica gestiona sus productos" on public.productos;
create policy "fabrica gestiona sus productos" on public.productos
  as permissive for all to public
  using (((get_user_rol() = 'admin'::text) OR ((get_user_rol() = 'mayorista'::text) AND (destino = 'fabrica'::text))));

drop policy if exists "admin puede actualizar perfiles" on public.profiles;
create policy "admin puede actualizar perfiles" on public.profiles
  as permissive for update to public
  using ((get_user_rol() = 'admin'::text));

drop policy if exists "admin puede insertar perfiles" on public.profiles;
create policy "admin puede insertar perfiles" on public.profiles
  as permissive for insert to public
  with check ((get_user_rol() = 'admin'::text));

drop policy if exists "usuarios ven su propio perfil" on public.profiles;
create policy "usuarios ven su propio perfil" on public.profiles
  as permissive for select to public
  using (((id = auth.uid()) OR (get_user_rol() = 'admin'::text)));

drop policy if exists "ver perfiles con acceso a tareas" on public.profiles;
create policy "ver perfiles con acceso a tareas" on public.profiles
  as permissive for select to public
  using (((estado = 'activo'::text) AND ((rol = 'admin'::text) OR ('tareas'::text = ANY (modulos_permitidos)))));

drop policy if exists "admin gestiona roles" on public.roles;
create policy "admin gestiona roles" on public.roles
  as permissive for all to public
  using ((( SELECT profiles.rol
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

drop policy if exists "admin inserta ventas" on public.ventas_posberry;
create policy "admin inserta ventas" on public.ventas_posberry
  as permissive for insert to public
  with check ((get_user_rol() = 'admin'::text));

drop policy if exists "local ve sus ventas" on public.ventas_posberry;
create policy "local ve sus ventas" on public.ventas_posberry
  as permissive for select to public
  using (((local_id = auth.uid()) OR (get_user_rol() = 'admin'::text)));

drop function if exists public.mis_cuentas_local();
drop function if exists public.mis_sucursales();
drop function if exists public.tiene_area(text);
drop function if exists public.tiene_permiso(text);
drop function if exists public.persona_tiene_permiso(uuid, text);
drop function if exists public._norm_sucursal(text);
delete from supabase_migrations.schema_migrations where version = '20261119130000';

commit;