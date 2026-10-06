-- ============================================================================
-- B4 — ajustes del code-review sobre 20261006150000 (ya aplicada en dev).
--
-- 1. espera_nota_credito (v_compras_devoluciones): una devolución registrada
--    ANTES de la factura solo espera NC si la factura cobró de más lo devuelto
--    (queda una diferencia > 0 abierta de ese insumo). Si la factura vino neta,
--    no hay NC que esperar.
-- 2. compras_registrar_devolucion: una sola corrección de precio activa por
--    línea de la factura (si no, se podía acreditar dos veces lo mismo).
-- 3. _compras_marcar_esperando_nc pasa a trabajar por pedido: una devolución
--    nueva no le saca la diferencia a otra que sigue esperando su NC, y al
--    anular una devolución (compras_anular_devolucion la llama ahora) la
--    diferencia vuelve a la que sigue esperando.
--
-- Cuerpos de partida: 20261006150000 (mismo archivo, misma rama). Solo dev/QA.
-- ============================================================================

-- E13 por pedido: cada diferencia > 0 abierta queda como "Reclamo al proveedor"
-- de la devolución más vieja que espera su NC con ese insumo. Una diferencia ya
-- tomada por otra devolución que sigue esperando no se le pasa a una nueva.
create or replace function public._compras_marcar_esperando_nc(p_devolucion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_numero    int;
  v_fac       compras_facturas%rowtype;
  v_dev       record;
begin
  select d.pedido_id, p.numero into v_pedido_id, v_numero
  from compras_devoluciones d join compras_pedidos p on p.id = d.pedido_id
  where d.id = p_devolucion_id;
  select * into v_fac from compras_facturas
  where pedido_id = v_pedido_id and tipo_comprobante = 'factura' and estado = 'confirmada';
  if not found then
    return;
  end if;

  -- Sueltan las diferencias: las que el recálculo devolvió a pendiente y las de
  -- devoluciones que ya no esperan (anuladas, con NC, con reposición).
  update compras_factura_discrepancias x set devolucion_id = null
  where x.factura_id = v_fac.id and x.devolucion_id is not null
    and (x.resolucion = 'pendiente'
         or not exists (select 1 from compras_devoluciones o
                        where o.id = x.devolucion_id and o.estado = 'activa' and not o.repone
                          and not o.corrige_precio and o.nota_credito_id is null));
  update compras_factura_discrepancias x
    set resolucion = 'pendiente', nota = null, resuelto_por = null, resuelto_en = null, updated_at = now()
  where x.factura_id = v_fac.id and x.devolucion_id is null and x.resolucion = 'reclamo_proveedor'
    and x.nota like 'Esperando la nota de crédito de %';

  for v_dev in
    select d.id, d.secuencia from compras_devoluciones d
    where d.pedido_id = v_pedido_id and d.estado = 'activa' and not d.repone
      and not d.corrige_precio and d.nota_credito_id is null
    order by d.secuencia
  loop
    update compras_factura_discrepancias x
      set resolucion = 'reclamo_proveedor', devolucion_id = v_dev.id,
          nota = 'Esperando la nota de crédito de ' || _compras_codigo_devolucion(v_numero, v_dev.secuencia),
          resuelto_por = coalesce(x.resuelto_por, auth.uid()), resuelto_en = coalesce(x.resuelto_en, now()), updated_at = now()
    where x.factura_id = v_fac.id and x.devolucion_id is null and x.diferencia > 0
      and x.resolucion in ('pendiente', 'reclamo_proveedor')
      and x.item_id in (select item_id from compras_devolucion_items where devolucion_id = v_dev.id and item_id is not null);
  end loop;
end;
$$;

create or replace function public.compras_registrar_devolucion(
  p_pedido_id uuid default null,
  p_motivo_id uuid default null,
  p_repone boolean default false,
  p_items jsonb default '[]'::jsonb,
  p_nota text default null,
  p_nota_credito jsonb default null,
  p_diferencia_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.compras_anular_devolucion(
  p_devolucion_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace view public.v_compras_devoluciones as
select
  d.id, d.pedido_id, ped.numero as pedido_numero, d.secuencia,
  _compras_codigo_devolucion(ped.numero, d.secuencia) as codigo,
  ped.proveedor_id, pr.nombre as proveedor_nombre,
  d.factura_id, d.motivo_id, d.motivo_nombre, d.devuelve_mercaderia, d.corrige_precio, d.repone, d.nota,
  d.estado, d.created_at, pc.nombre as creado_por_nombre,
  d.anulada_en, pa.nombre as anulada_por_nombre, d.anulada_motivo,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', di.id, 'pedido_item_id', di.pedido_item_id, 'item_id', di.item_id,
             'factura_item_id', di.factura_item_id, 'descripcion', di.descripcion, 'unidad', di.unidad,
             'cantidad', di.cantidad, 'cantidad_base', di.cantidad_base,
             'unidad_base', i.unidad_base,
             'precio_correcto', case when es_admin() then di.precio_correcto end
           ) order by di.orden, di.id)
    from compras_devolucion_items di
    left join compras_items i on i.id = di.item_id
    where di.devolucion_id = d.id
  ), '[]'::jsonb) as lineas,
  d.nota_credito_id,
  case when es_admin() then nc.numero end           as nc_numero,
  case when es_admin() then nc.fecha end            as nc_fecha,
  case when es_admin() then nc.total end            as nc_total,
  case when es_admin() then nc.estado end           as nc_estado,
  case when es_admin() then nc.nc_gasto end         as nc_gasto,
  case when es_admin() then nc.gasto_descontado end as nc_gasto_descontado,
  case when es_admin() then fa.numero end           as factura_numero,
  (d.estado = 'activa' and not d.repone and d.nota_credito_id is null
    and exists (
      select 1 from compras_facturas f
      where f.pedido_id = d.pedido_id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada'
        and (
          -- Registrada contra esa factura: lo que se devolvió estaba facturado.
          d.factura_id = f.id
          -- Registrada antes (D1): solo si la factura cobró de más lo devuelto (diferencia > 0 abierta).
          or exists (select 1 from compras_factura_discrepancias x
                     join compras_devolucion_items di on di.devolucion_id = d.id and di.item_id = x.item_id
                     where x.factura_id = f.id and x.diferencia > 0 and x.resolucion in ('pendiente', 'reclamo_proveedor'))
        )))
    as espera_nota_credito
from compras_devoluciones d
join compras_pedidos ped on ped.id = d.pedido_id
left join proveedores pr on pr.id = ped.proveedor_id
left join profiles pc on pc.id = d.creado_por
left join profiles pa on pa.id = d.anulada_por
left join compras_facturas nc on nc.id = d.nota_credito_id
left join compras_facturas fa on fa.id = d.factura_id
where tiene_acceso_compras();

grant select on public.v_compras_devoluciones to authenticated;

revoke execute on function public._compras_marcar_esperando_nc(uuid) from public, anon, authenticated;
revoke execute on function public.compras_registrar_devolucion(uuid, uuid, boolean, jsonb, text, jsonb, uuid) from public, anon;
grant execute on function public.compras_registrar_devolucion(uuid, uuid, boolean, jsonb, text, jsonb, uuid) to authenticated;
revoke execute on function public.compras_anular_devolucion(uuid, text) from public, anon;
grant execute on function public.compras_anular_devolucion(uuid, text) to authenticated;
