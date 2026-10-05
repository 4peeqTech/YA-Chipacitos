-- B1 (Bloque 2): historial real de pedidos + solicitud ↔ pedido.
-- Spec: docs/bloque2/plan-B1.md.
--
-- Cada cosa que se le hace a un pedido (crearlo, editar sus ítems, cambiarle
-- proveedor o local, generar el mensaje, enviarlo, reenviarlo, cerrarlo y
-- reabrirlo, cada vez) queda como una fila en compras_pedido_eventos con un
-- diff en jsonb.
--
-- Cero triggers: la tabla la escribe únicamente compras_registrar_evento_pedido,
-- que solo llaman otras RPC security definer (B1 hoy, A2b para los remitos).
-- Además: los pedidos que salen de una solicitud recuerdan de qué línea vino
-- cada ítem (solicitud_item_id) y nacen con el local de facturación del
-- proveedor; y compras_pedidos / compras_pedido_items pasan a solo lectura
-- desde la app (D1): después de B1 no queda ningún escritor directo.

-- ----------------------------------------------------------------------------
-- 3.1 Tabla de eventos
-- ----------------------------------------------------------------------------

create table if not exists compras_pedido_eventos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references compras_pedidos(id) on delete cascade,   -- E12
  tipo        text not null check (tipo in (
                'creado', 'items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje',
                'enviado', 'reenviado', 'cerrado', 'reabierto',
                'remito_creado', 'remito_editado', 'remito_eliminado'   -- los escribe A2b (E9)
              )),
  detalle     jsonb not null default '{}'::jsonb check (jsonb_typeof(detalle) = 'object'),
  creado_por  uuid references profiles(id) on delete set null,
  creado_en   timestamptz not null default clock_timestamp()
);

create index if not exists idx_compras_pedido_eventos_pedido on compras_pedido_eventos (pedido_id, creado_en);
create index if not exists idx_compras_pedido_eventos_remito on compras_pedido_eventos ((detalle->>'remito_id'))
  where tipo like 'remito_%';

alter table compras_pedido_eventos enable row level security;

-- Solo lectura desde la app; se escribe únicamente desde compras_registrar_evento_pedido (E1).
drop policy if exists compras_pedido_eventos_lectura on compras_pedido_eventos;
create policy compras_pedido_eventos_lectura on compras_pedido_eventos
  for select using (tiene_acceso_compras());

revoke insert, update, delete, truncate on compras_pedido_eventos from anon, authenticated;

comment on table compras_pedido_eventos is
  'Historial de cada pedido (B1). Append-only salvo el cascade al eliminar un pedido sin enviar. La escribe solo compras_registrar_evento_pedido.';

-- ----------------------------------------------------------------------------
-- 3.2 Columnas nuevas
-- ----------------------------------------------------------------------------

alter table compras_pedidos
  add column if not exists actualizado_en  timestamptz,
  add column if not exists actualizado_por uuid references profiles(id) on delete set null;

alter table compras_pedido_items
  add column if not exists solicitud_item_id uuid references compras_solicitud_items(id) on delete set null;

create index if not exists idx_compras_pedido_items_solicitud_item on compras_pedido_items (solicitud_item_id)
  where solicitud_item_id is not null;

-- ----------------------------------------------------------------------------
-- 3.3 Helpers
-- ----------------------------------------------------------------------------

-- E1. Único escritor de compras_pedido_eventos. Lo llaman RPCs security definer.
-- E2. clock_timestamp(): varias filas de la misma RPC quedan ordenadas.
create or replace function public.compras_registrar_evento_pedido(
  p_pedido_id uuid,
  p_tipo      text,
  p_detalle   jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_fecha timestamptz := clock_timestamp();
begin
  insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
  values (p_pedido_id, p_tipo, coalesce(p_detalle, '{}'::jsonb), auth.uid(), v_fecha)
  returning id into v_id;

  update compras_pedidos
    set actualizado_en = v_fecha,
        actualizado_por = auth.uid()
    where id = p_pedido_id;

  return v_id;
end;
$$;

revoke execute on function public.compras_registrar_evento_pedido(uuid, text, jsonb) from public, anon, authenticated;

-- Foto de las líneas de un pedido (para el diff y para "creado").
create or replace function public.compras_lineas_pedido_snapshot(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pi.id, 'item_id', pi.item_id, 'descripcion', pi.descripcion,
           'unidad', pi.unidad, 'cantidad', pi.cantidad
         ) order by pi.orden, pi.id), '[]'::jsonb)
  from compras_pedido_items pi
  where pi.pedido_id = p_pedido_id;
$$;

revoke execute on function public.compras_lineas_pedido_snapshot(uuid) from public, anon, authenticated;

-- E4. Diff puro entre dos fotos. '{}' = sin cambios. El orden no cuenta.
-- Sin jsonb_strip_nulls: antes.unidad = null tiene que quedar.
create or replace function public.compras_diff_lineas(p_antes jsonb, p_despues jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_agregados jsonb;
  v_quitados  jsonb;
  v_cambiados jsonb;
  v_res       jsonb := '{}'::jsonb;
begin
  select jsonb_agg(d.x order by d.ord) into v_agregados
  from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) with ordinality d(x, ord)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) a(x) where a.x->>'id' = d.x->>'id'
  );

  select jsonb_agg(a.x order by a.ord) into v_quitados
  from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) with ordinality a(x, ord)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) d(x) where d.x->>'id' = a.x->>'id'
  );

  select jsonb_agg(d.x || jsonb_build_object('antes', jsonb_build_object(
           'cantidad', a.x->'cantidad', 'unidad', a.x->'unidad',
           'descripcion', a.x->'descripcion', 'item_id', a.x->'item_id'
         )) order by d.ord)
    into v_cambiados
  from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) with ordinality d(x, ord)
  join jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) a(x) on a.x->>'id' = d.x->>'id'
  where (a.x->>'cantidad')::numeric is distinct from (d.x->>'cantidad')::numeric
     or a.x->>'unidad'      is distinct from d.x->>'unidad'
     or a.x->>'descripcion' is distinct from d.x->>'descripcion'
     or a.x->>'item_id'     is distinct from d.x->>'item_id';

  if v_agregados is not null then v_res := v_res || jsonb_build_object('agregados', v_agregados); end if;
  if v_quitados  is not null then v_res := v_res || jsonb_build_object('quitados',  v_quitados);  end if;
  if v_cambiados is not null then v_res := v_res || jsonb_build_object('cambiados', v_cambiados); end if;
  return v_res;
end;
$$;

revoke execute on function public.compras_diff_lineas(jsonb, jsonb) from public, anon;
grant execute on function public.compras_diff_lineas(jsonb, jsonb) to authenticated;  -- pura, sin datos

-- ----------------------------------------------------------------------------
-- 3.4 compras_guardar_pedido: cuerpo de 20260924200000 + eventos (marcado B1).
-- E5: sin cambios no hay evento ni se borra el mensaje (cambios: false).
-- E6: en una edición se ignora p_local_facturacion_id (el local cambia solo
--     por compras_guardar_mensaje_pedido).
-- ----------------------------------------------------------------------------

create or replace function public.compras_guardar_pedido(
  p_pedido_id uuid default null,
  p_proveedor_id uuid default null,
  p_local_facturacion_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido    compras_pedidos%rowtype;
  v_id        uuid;
  v_linea     record;
  v_ids       uuid[];
  v_bloqueada text;
  v_nuevo     boolean := p_pedido_id is null;      -- B1
  v_antes     jsonb;                               -- B1
  v_despues   jsonb;                               -- B1
  v_diff      jsonb;                               -- B1
  v_cambios   boolean := false;                    -- B1
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas del pedido vienen mal armadas. Recargá la página.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, 0) <= 0
  ) then
    raise exception 'Cada línea necesita una descripción y una cantidad mayor a 0.';
  end if;

  if v_nuevo then
    if p_proveedor_id is null then
      raise exception 'Elegí un proveedor.';
    end if;
    insert into compras_pedidos (proveedor_id, local_facturacion_id, estado, creado_por)
    values (p_proveedor_id, p_local_facturacion_id, 'borrador', auth.uid())
    returning * into v_pedido;
  else
    select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
    if not found then
      raise exception 'No encontramos el pedido. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    if v_pedido.estado_facturacion = 'facturado' then
      raise exception 'El pedido % ya está facturado: anulá la factura para editarlo.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    if v_pedido.estado_recepcion in ('cerrado_manual', 'devuelto') then
      raise exception 'El pedido % está cerrado: reabrilo para editarlo.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    if p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id and v_pedido.estado_recepcion <> 'sin_enviar' then
      raise exception 'No se puede cambiar el proveedor de un pedido ya enviado.';
    end if;

    v_antes := compras_lineas_pedido_snapshot(v_pedido.id);   -- B1: foto con el pedido ya bloqueado
    -- B1: el update de cabecera se mueve abajo, después del diff (E5, E6).
  end if;
  v_id := v_pedido.id;

  -- Ids que se conservan (y que tienen que ser de este pedido).
  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_pedido_items pi where pi.id = x.id and pi.pedido_id = v_id)
  ) then
    raise exception 'Alguien cambió este pedido mientras lo editabas. Recargá la página.';
  end if;

  -- Una línea con remitos no se puede quitar.
  select pi.descripcion into v_bloqueada
  from compras_pedido_items pi
  where pi.pedido_id = v_id
    and pi.id <> all (v_ids)
    and exists (select 1 from compras_remito_items ri where ri.pedido_item_id = pi.id)
  limit 1;
  if v_bloqueada is not null then
    raise exception 'La línea "%" ya tiene remitos cargados: no se puede quitar. Si llegó menos, dejala y cerrá el pedido a mano.', v_bloqueada;
  end if;

  delete from compras_pedido_items pi
  where pi.pedido_id = v_id and pi.id <> all (v_ids);

  for v_linea in
    select e, (ord - 1)::int as orden
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord)
  loop
    if nullif(v_linea.e->>'id', '') is not null then
      update compras_pedido_items
        set item_id = nullif(v_linea.e->>'item_id', '')::uuid,
            descripcion = btrim(v_linea.e->>'descripcion'),
            unidad = nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
            cantidad = (v_linea.e->>'cantidad')::numeric,
            orden = v_linea.orden
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden)
      values (
        v_id,
        nullif(v_linea.e->>'item_id', '')::uuid,
        btrim(v_linea.e->>'descripcion'),
        nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
        (v_linea.e->>'cantidad')::numeric,
        v_linea.orden
      );
    end if;
  end loop;

  v_despues := compras_lineas_pedido_snapshot(v_id);          -- B1

  if v_nuevo then
    perform compras_registrar_evento_pedido(v_id, 'creado',
      jsonb_build_object('origen', 'manual', 'lineas', v_despues));
    v_cambios := true;
  else
    v_diff := compras_diff_lineas(v_antes, v_despues);
    if v_diff <> '{}'::jsonb then
      perform compras_registrar_evento_pedido(v_id, 'items_editados', v_diff);
      v_cambios := true;
    end if;

    if p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id then
      perform compras_registrar_evento_pedido(v_id, 'proveedor_cambiado', jsonb_build_object(
        'de', jsonb_build_object('id', v_pedido.proveedor_id,
                                 'nombre', (select nombre from proveedores where id = v_pedido.proveedor_id)),
        'a',  jsonb_build_object('id', p_proveedor_id,
                                 'nombre', (select nombre from proveedores where id = p_proveedor_id))
      ));
      v_cambios := true;
    end if;

    -- E5: el mensaje de WhatsApp se arma con las líneas: solo queda viejo (y se
    -- borra) si algo cambió, así nunca se manda un pedido desactualizado.
    -- E6: el local de un pedido existente no se toca acá.
    if v_cambios then
      update compras_pedidos
        set proveedor_id = coalesce(p_proveedor_id, proveedor_id),
            mensaje = null
        where id = v_id;
    end if;
  end if;

  perform compras_recalcular_estado_pedido(v_id);

  return jsonb_build_object('id', v_id, 'numero', v_pedido.numero, 'cambios', v_cambios);  -- B1: + cambios
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.5 compras_marcar_pedido_enviado: firma nueva con reenvío (E7).
-- Sumar un parámetro con default crearía otra sobrecarga (llamadas ambiguas).
-- ----------------------------------------------------------------------------

drop function if exists public.compras_marcar_pedido_enviado(uuid);

create function public.compras_marcar_pedido_enviado(p_pedido_id uuid, p_reenvio boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido compras_pedidos%rowtype;
  v_codigo text;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  v_codigo := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if not coalesce(p_reenvio, false) then
    if v_pedido.enviado_en is not null then
      return;  -- doble clic u otra persona: no es error y no duplica el evento
    end if;
    if not exists (select 1 from compras_pedido_items where pedido_id = p_pedido_id) then
      raise exception 'Agregá al menos un ítem antes de enviar el pedido.';
    end if;

    update compras_pedidos
      set enviado_en = now(), enviado_por = auth.uid()
      where id = p_pedido_id;

    perform compras_registrar_evento_pedido(p_pedido_id, 'enviado', jsonb_build_object(
      'mensaje', v_pedido.mensaje, 'local_facturacion_id', v_pedido.local_facturacion_id));

    perform compras_recalcular_estado_pedido(p_pedido_id);
    return;
  end if;

  -- Reenvío
  if v_pedido.enviado_en is null then
    raise exception 'El pedido % todavía no se envió: marcalo como enviado.', v_codigo;
  end if;
  if v_pedido.estado_facturacion = 'facturado' or v_pedido.estado_recepcion not in ('enviado', 'parcial') then
    raise exception 'El pedido % ya no está esperando mercadería: no hace falta reenviarlo.', v_codigo;
  end if;
  if v_pedido.mensaje is null then
    raise exception 'Generá el mensaje antes de reenviar el pedido.';
  end if;

  -- Doble clic: el mismo reenvío de la misma persona en el último minuto no se repite.
  if exists (
    select 1 from compras_pedido_eventos e
    where e.pedido_id = p_pedido_id
      and e.tipo = 'reenviado'
      and e.creado_por is not distinct from auth.uid()
      and e.creado_en > clock_timestamp() - interval '60 seconds'
      and e.detalle->>'mensaje' = v_pedido.mensaje
  ) then
    return;
  end if;

  perform compras_registrar_evento_pedido(p_pedido_id, 'reenviado', jsonb_build_object(
    'mensaje', v_pedido.mensaje, 'local_facturacion_id', v_pedido.local_facturacion_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.6 Cerrar y reabrir: cuerpo de 20260924200000 + un evento cada vez.
-- Las columnas cerrado_manual_*, cierre_motivo y reabierto_* se siguen
-- escribiendo (estado, "Motivo:" del detalle); la historia completa va en la tabla.
-- ----------------------------------------------------------------------------

create or replace function public.compras_cerrar_pedido_manual(p_pedido_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido compras_pedidos%rowtype;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contanos por qué cerrás el pedido.';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  if v_pedido.estado_recepcion = 'sin_enviar' then
    raise exception 'Un pedido sin enviar no se cierra: si no va, eliminalo.';
  end if;
  if v_pedido.estado_recepcion not in ('enviado', 'parcial') then
    raise exception 'Este pedido ya no está esperando mercadería. Recargá la página.';
  end if;

  update compras_pedidos
    set estado_recepcion = 'cerrado_manual',
        cierre_motivo = btrim(p_motivo),
        cerrado_manual_por = auth.uid(),
        cerrado_manual_en = now(),
        cerrado_en = now()
    where id = p_pedido_id;

  perform compras_registrar_evento_pedido(p_pedido_id, 'cerrado', jsonb_build_object(   -- B1
    'motivo', btrim(p_motivo), 'estado_recepcion_anterior', v_pedido.estado_recepcion));

  perform compras_recalcular_estado_pedido(p_pedido_id);
end;
$$;

create or replace function public.compras_reabrir_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido compras_pedidos%rowtype;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  if v_pedido.estado_recepcion <> 'cerrado_manual' then
    raise exception 'Solo se puede reabrir un pedido cerrado a mano.';
  end if;

  -- El recálculo decide si vuelve a Enviado, Parcial o Recibido.
  update compras_pedidos
    set estado_recepcion = 'enviado',
        reabierto_por = auth.uid(),
        reabierto_en = now()
    where id = p_pedido_id;

  perform compras_recalcular_estado_pedido(p_pedido_id);

  -- B1: después del recálculo, para saber en qué estado quedó.
  perform compras_registrar_evento_pedido(p_pedido_id, 'reabierto', jsonb_build_object(
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = p_pedido_id),
    'motivo_cierre', v_pedido.cierre_motivo));
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.7 compras_guardar_mensaje_pedido: reemplaza el update directo de la
-- server action guardarMensaje. Bloquea el cambio de local en un pedido facturado.
-- ----------------------------------------------------------------------------

create or replace function public.compras_guardar_mensaje_pedido(
  p_pedido_id uuid,
  p_mensaje text,
  p_local_facturacion_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido compras_pedidos%rowtype;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if nullif(btrim(p_mensaje), '') is null then
    raise exception 'El mensaje está vacío.';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Puede que alguien lo haya borrado: recargá la página.';
  end if;

  if p_local_facturacion_id is distinct from v_pedido.local_facturacion_id then
    if v_pedido.estado_facturacion = 'facturado' then
      raise exception 'El pedido % ya está facturado: el local de facturación no se puede cambiar. Si está mal, anulá la factura primero.',
        'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    perform compras_registrar_evento_pedido(p_pedido_id, 'local_cambiado', jsonb_build_object(
      'de', (select jsonb_build_object('id', l.id, 'nombre', l.nombre) from locales_facturacion l where l.id = v_pedido.local_facturacion_id),
      'a',  (select jsonb_build_object('id', l.id, 'nombre', l.nombre) from locales_facturacion l where l.id = p_local_facturacion_id)
    ));
  end if;

  if p_mensaje is distinct from v_pedido.mensaje then
    perform compras_registrar_evento_pedido(p_pedido_id, 'mensaje', jsonb_build_object(
      'accion', case when v_pedido.mensaje is null then 'generado' else 'regenerado' end));
  end if;

  update compras_pedidos
    set mensaje = p_mensaje,
        local_facturacion_id = p_local_facturacion_id
    where id = p_pedido_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.8 convertir_solicitud_a_pedidos: cuerpo de 20260903120000 + local del
-- proveedor (E14), solicitud_item_id (E15), evento "creado" y search_path.
-- ----------------------------------------------------------------------------

create or replace function public.convertir_solicitud_a_pedidos(p_solicitud_id uuid)
returns integer
language plpgsql
security definer
set search_path = public                       -- B1: faltaba
as $$
declare
  v_solicitud    compras_solicitudes%rowtype;  -- B1
  v_proveedor_id uuid;
  v_pedido_id    uuid;
  v_creados      integer := 0;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_solicitud from compras_solicitudes
  where id = p_solicitud_id and estado = 'abierta' for update;
  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;

  for v_proveedor_id in
    select distinct proveedor_id
    from compras_solicitud_items
    where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0
  loop
    insert into compras_pedidos (proveedor_id, local_facturacion_id, estado, creado_por, solicitud_id)
    values (
      v_proveedor_id,
      (select local_facturacion_id from proveedores where id = v_proveedor_id),   -- B1 (E14)
      'borrador', auth.uid(), p_solicitud_id
    )
    returning id into v_pedido_id;

    insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden, solicitud_item_id)
    select v_pedido_id, csi.item_id, csi.descripcion, csi.unidad, csi.cantidad_ajustada,
           row_number() over (order by csi.orden, csi.descripcion) - 1,
           csi.id                                                                    -- B1
    from compras_solicitud_items csi
    where csi.solicitud_id = p_solicitud_id
      and csi.proveedor_id = v_proveedor_id
      and csi.incluir
      and csi.cantidad_ajustada > 0;

    perform compras_registrar_evento_pedido(v_pedido_id, 'creado', jsonb_build_object(   -- B1
      'origen', 'solicitud',
      'solicitud_id', p_solicitud_id,
      'solicitud_tipo', v_solicitud.tipo,
      'solicitud_fecha', v_solicitud.created_at,
      'conteo_id', v_solicitud.conteo_id,
      'lineas', compras_lineas_pedido_snapshot(v_pedido_id)
    ));

    v_creados := v_creados + 1;
  end loop;

  update compras_solicitudes
    set estado = 'convertida', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id;

  return v_creados;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3.9 Vista v_compras_pedido_eventos (E9, E10, E11).
-- B1: lee la tabla; el remito sale vivo de compras_remitos hasta que A2b
-- escriba su remito_creado; factura, factura anulada y diferencia siguen
-- saliendo de sus tablas, solo admin. detalle pasa de text a jsonb, se suman
-- id y persona_id y sale remito_id (por eso drop + create).
-- ----------------------------------------------------------------------------

drop view if exists public.v_compras_pedido_eventos;

create view public.v_compras_pedido_eventos as
select * from (
  -- Todo lo que registran las RPC.
  select e.id, e.pedido_id, e.tipo, e.creado_en as fecha,
         e.creado_por as persona_id, pr.nombre as persona, e.detalle
  from compras_pedido_eventos e
  left join profiles pr on pr.id = e.creado_por
  union all
  -- Remitos que todavía no tienen su fila (todos, hasta que A2b escriba remito_creado).
  select r.id, r.pedido_id, 'remito_creado', r.created_at,
         r.creado_por, pr.nombre,
         jsonb_build_object('remito_id', r.id, 'secuencia', r.secuencia, 'fecha', r.fecha)
  from compras_remitos r
  left join profiles pr on pr.id = r.creado_por
  where not exists (
    select 1 from compras_pedido_eventos e
    where e.tipo = 'remito_creado' and e.detalle->>'remito_id' = r.id::text
  )
  union all
  select f.id, f.pedido_id, 'factura', f.confirmada_en, f.confirmada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero)
  from compras_facturas f
  left join profiles pr on pr.id = f.confirmada_por
  where f.confirmada_en is not null and f.tipo_comprobante = 'factura' and es_admin()
  union all
  select f.id, f.pedido_id, 'factura_anulada', f.anulada_en, f.anulada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero)
  from compras_facturas f
  left join profiles pr on pr.id = f.anulada_por
  where f.anulada_en is not null and es_admin()
  union all
  select d.id, f.pedido_id, 'diferencia', d.resuelto_en, d.resuelto_por, pr.nombre,
         jsonb_build_object('resolucion', d.resolucion, 'insumo', d.descripcion,
                            'item_id', d.item_id, 'factura_id', f.id)
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  left join profiles pr on pr.id = d.resuelto_por
  where d.resuelto_en is not null and es_admin()
) v
where tiene_acceso_compras();

grant select on public.v_compras_pedido_eventos to authenticated;

-- ----------------------------------------------------------------------------
-- 3.10 RLS de pedidos a solo lectura (E16, D1). Verificado antes: el único
-- escritor directo era guardarMensaje (B1 lo pasa a RPC) y toda función que
-- escribe compras_pedidos / compras_pedido_items es security definer.
-- ----------------------------------------------------------------------------

drop policy if exists "compras_pedidos_acceso" on compras_pedidos;
drop policy if exists "compras_pedidos_lectura" on compras_pedidos;
create policy "compras_pedidos_lectura" on compras_pedidos
  for select using (tiene_acceso_compras());

drop policy if exists "compras_pedido_items_acceso" on compras_pedido_items;
drop policy if exists "compras_pedido_items_lectura" on compras_pedido_items;
create policy "compras_pedido_items_lectura" on compras_pedido_items
  for select using (tiene_acceso_compras());

-- ----------------------------------------------------------------------------
-- Grants (la firma de guardar_pedido no cambia; se repiten por claridad).
-- ----------------------------------------------------------------------------

revoke execute on function public.compras_guardar_pedido(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.compras_guardar_pedido(uuid, uuid, uuid, jsonb) to authenticated;
revoke execute on function public.compras_marcar_pedido_enviado(uuid, boolean) from public, anon;
grant execute on function public.compras_marcar_pedido_enviado(uuid, boolean) to authenticated;
revoke execute on function public.compras_cerrar_pedido_manual(uuid, text) from public, anon;
grant execute on function public.compras_cerrar_pedido_manual(uuid, text) to authenticated;
revoke execute on function public.compras_reabrir_pedido(uuid) from public, anon;
grant execute on function public.compras_reabrir_pedido(uuid) to authenticated;
revoke execute on function public.compras_guardar_mensaje_pedido(uuid, text, uuid) from public, anon;
grant execute on function public.compras_guardar_mensaje_pedido(uuid, text, uuid) to authenticated;
-- Hasta B1 convertir_solicitud_a_pedidos era ejecutable por anon (el cuerpo igual exige acceso).
revoke execute on function public.convertir_solicitud_a_pedidos(uuid) from public, anon;
grant execute on function public.convertir_solicitud_a_pedidos(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3.11 Backfill (una sola vez, idempotente).
-- E13. Los eventos que hoy salen de columnas. Los ciclos anteriores no se conocen.
-- ----------------------------------------------------------------------------

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'creado',
       jsonb_build_object('origen', case when p.solicitud_id is null then 'manual' else 'solicitud' end,
                          'backfill', true)
         || case when p.solicitud_id is null then '{}'::jsonb
                 else jsonb_build_object('solicitud_id', p.solicitud_id, 'solicitud_tipo', s.tipo) end,
       p.creado_por, coalesce(p.created_at, now())
from compras_pedidos p
left join compras_solicitudes s on s.id = p.solicitud_id
where not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'creado');

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'enviado', jsonb_build_object('backfill', true), p.enviado_por, p.enviado_en
from compras_pedidos p
where p.enviado_en is not null
  and not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'enviado');

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'cerrado', jsonb_build_object('motivo', p.cierre_motivo, 'backfill', true),
       p.cerrado_manual_por, p.cerrado_manual_en
from compras_pedidos p
where p.cerrado_manual_en is not null
  and not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'cerrado');

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'reabierto', jsonb_build_object('backfill', true), p.reabierto_por, p.reabierto_en
from compras_pedidos p
where p.reabierto_en is not null
  and not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'reabierto');

-- actualizado_en/por = el último evento de cada pedido.
update compras_pedidos p
  set actualizado_en = u.creado_en, actualizado_por = u.creado_por
  from (
    select distinct on (pedido_id) pedido_id, creado_en, creado_por
    from compras_pedido_eventos
    order by pedido_id, creado_en desc
  ) u
  where u.pedido_id = p.id and p.actualizado_en is null;

-- E15. solicitud_item_id por candidato único (misma solicitud, proveedor e
-- insumo; o descripción si es línea libre).
do $$
declare
  r record;
  v_cand uuid[];
  v_sin  integer := 0;
begin
  for r in
    select pi.id, pi.item_id, pi.descripcion, p.solicitud_id, p.proveedor_id
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where p.solicitud_id is not null and pi.solicitud_item_id is null
  loop
    select array_agg(csi.id) into v_cand
    from compras_solicitud_items csi
    where csi.solicitud_id = r.solicitud_id
      and csi.proveedor_id = r.proveedor_id
      and csi.incluir
      and (case when r.item_id is not null then csi.item_id = r.item_id
                else csi.item_id is null and csi.descripcion = r.descripcion end);

    if coalesce(array_length(v_cand, 1), 0) = 1 then
      update compras_pedido_items set solicitud_item_id = v_cand[1] where id = r.id;
    else
      v_sin := v_sin + 1;
      raise notice 'Línea de pedido % ("%") sin solicitud_item_id: % candidatos', r.id, r.descripcion, coalesce(array_length(v_cand, 1), 0);
    end if;
  end loop;
  raise notice 'B1: % líneas de pedidos de solicitud quedaron sin solicitud_item_id', v_sin;
end $$;
