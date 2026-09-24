-- ============================================================================
-- F2 (Bloque 1 facturación): estados del pedido a proveedor.
--
-- compras_pedidos pasa a tener dos ejes:
--   estado_recepcion   sin_enviar → enviado → parcial → recibido
--                      + cerrado_manual (con motivo) y devuelto (lo calcula F6)
--   estado_facturacion sin_facturar | facturado (lo calcula F4)
-- El "estado visible" se deriva en TS (lib/compras/estadoPedido.ts).
--
-- Cero triggers: compras_recalcular_estado_pedido() recalcula desde cero y la
-- llama toda RPC que toque pedidos o remitos. La columna legacy `estado`
-- (borrador|enviado|cerrado) se sigue sincronizando desde ahí, así
-- HistorialPedidos, reportes y ProveedoresClient siguen andando.
-- ============================================================================

alter table compras_pedidos
  add column if not exists estado_recepcion text not null default 'sin_enviar'
    check (estado_recepcion in ('sin_enviar','enviado','parcial','recibido','cerrado_manual','devuelto')),
  add column if not exists estado_facturacion text not null default 'sin_facturar'
    check (estado_facturacion in ('sin_facturar','facturado')),
  add column if not exists enviado_por uuid references profiles(id),
  add column if not exists cierre_motivo text,
  add column if not exists cerrado_manual_por uuid references profiles(id),
  add column if not exists cerrado_manual_en timestamptz,
  -- Última reapertura. El último cierre manual (motivo, quién, cuándo) no se
  -- borra al reabrir: así el historial muestra "cerrado … / reabierto …".
  add column if not exists reabierto_por uuid references profiles(id),
  add column if not exists reabierto_en timestamptz;

alter table compras_pedidos
  add constraint compras_pedidos_cierre_manual_con_motivo
    check (estado_recepcion <> 'cerrado_manual' or nullif(btrim(cierre_motivo), '') is not null);

create index if not exists idx_compras_pedidos_estado_recepcion on compras_pedidos(estado_recepcion);
create index if not exists idx_compras_pedidos_estado_facturacion on compras_pedidos(estado_facturacion);
create index if not exists idx_compras_pedido_items_item_id on compras_pedido_items(item_id);

-- ----------------------------------------------------------------------------
-- Re-linkeo de líneas de remito huérfanas (pedido_item_id null por el viejo
-- delete+insert de los ítems del pedido): solo si hay un único candidato con el
-- mismo insumo en el mismo pedido.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  v_candidatos uuid[];
begin
  for r in
    select ri.id, ri.item_id, ri.descripcion, rem.pedido_id
    from compras_remito_items ri
    join compras_remitos rem on rem.id = ri.remito_id
    where ri.pedido_item_id is null
  loop
    v_candidatos := null;
    if r.item_id is not null then
      select array_agg(pi.id) into v_candidatos
      from compras_pedido_items pi
      where pi.pedido_id = r.pedido_id and pi.item_id = r.item_id;
    end if;

    if coalesce(array_length(v_candidatos, 1), 0) = 1 then
      update compras_remito_items set pedido_item_id = v_candidatos[1] where id = r.id;
    else
      raise notice 'Línea de remito % ("%") sin re-linkear: % candidatos', r.id, r.descripcion, coalesce(array_length(v_candidatos, 1), 0);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Recálculo desde cero del estado de un pedido.
-- ----------------------------------------------------------------------------
create or replace function public.compras_recalcular_estado_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido      compras_pedidos%rowtype;
  v_recepcion   text;
  v_lineas      integer;
  v_cubiertas   integer;
  v_con_algo    integer;
  v_remitos     integer;
  v_legacy      text;
begin
  -- auth.uid() null = migración o service role.
  if auth.uid() is not null and not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    return;
  end if;

  if v_pedido.estado_recepcion in ('cerrado_manual', 'devuelto') then
    -- Estados que se ponen a mano (o que calcula F6): no se tocan.
    v_recepcion := v_pedido.estado_recepcion;
  elsif v_pedido.enviado_en is null then
    v_recepcion := 'sin_enviar';
  else
    select count(*),
           count(*) filter (where recibido >= cantidad),
           count(*) filter (where recibido > 0)
      into v_lineas, v_cubiertas, v_con_algo
    from (
      select pi.cantidad, coalesce(sum(ri.cantidad), 0) as recibido
      from compras_pedido_items pi
      left join compras_remito_items ri on ri.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
      group by pi.id, pi.cantidad
    ) l;

    select count(*) into v_remitos from compras_remitos where pedido_id = p_pedido_id;

    if v_lineas > 0 and v_cubiertas = v_lineas then
      v_recepcion := 'recibido';
    elsif v_con_algo > 0 or v_remitos > 0 then
      -- Llegó un remito aunque no cubra ninguna línea (líneas "sin corresponder").
      v_recepcion := 'parcial';
    else
      v_recepcion := 'enviado';
    end if;
  end if;

  v_legacy := case
    when v_recepcion = 'sin_enviar' then 'borrador'
    when v_recepcion in ('recibido', 'cerrado_manual', 'devuelto') then 'cerrado'
    else 'enviado'
  end;

  update compras_pedidos
    set estado_recepcion = v_recepcion,
        estado = v_legacy,
        cerrado_en = case
          when v_legacy = 'cerrado' then coalesce(cerrado_en, cerrado_manual_en, now())
          else null
        end
    where id = p_pedido_id;
end;
$$;

revoke execute on function public.compras_recalcular_estado_pedido(uuid) from public, anon;
grant execute on function public.compras_recalcular_estado_pedido(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Pendiente por línea: pedido, recibido, pendiente y excedente.
-- Vista plana gateada en el WHERE (patrón de v_compras_stock_movimientos).
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_pedido_pendiente as
select
  pi.id as pedido_item_id,
  pi.pedido_id,
  pi.item_id,
  pi.descripcion,
  pi.unidad,
  pi.orden,
  pi.cantidad,
  coalesce(r.recibido, 0) as recibido,
  greatest(pi.cantidad - coalesce(r.recibido, 0), 0) as pendiente,
  greatest(coalesce(r.recibido, 0) - pi.cantidad, 0) as excedente,
  coalesce(r.remitos, 0) as remitos
from compras_pedido_items pi
left join lateral (
  select sum(ri.cantidad) as recibido, count(distinct ri.remito_id) as remitos
  from compras_remito_items ri
  where ri.pedido_item_id = pi.id
) r on true
where tiene_acceso_compras();

grant select on public.v_compras_pedido_pendiente to authenticated;

-- ----------------------------------------------------------------------------
-- Historial del pedido: una fila por evento, con el nombre de quién lo hizo
-- (profiles no se puede leer entre usuarios; la vista corre como owner y se
-- gatea en el WHERE).
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_pedido_eventos as
select * from (
  select p.id as pedido_id, 'creado'::text as tipo, p.created_at as fecha,
         pr.nombre as persona, null::text as detalle, null::uuid as remito_id
  from compras_pedidos p
  left join profiles pr on pr.id = p.creado_por
  union all
  select p.id, 'enviado', p.enviado_en, pr.nombre, null, null
  from compras_pedidos p
  left join profiles pr on pr.id = p.enviado_por
  where p.enviado_en is not null
  union all
  select r.pedido_id, 'remito', r.created_at, pr.nombre, r.fecha::text, r.id
  from compras_remitos r
  left join profiles pr on pr.id = r.creado_por
  union all
  select p.id, 'cerrado', p.cerrado_manual_en, pr.nombre, p.cierre_motivo, null
  from compras_pedidos p
  left join profiles pr on pr.id = p.cerrado_manual_por
  where p.cerrado_manual_en is not null
  union all
  select p.id, 'reabierto', p.reabierto_en, pr.nombre, null, null
  from compras_pedidos p
  left join profiles pr on pr.id = p.reabierto_por
  where p.reabierto_en is not null
) e
where tiene_acceso_compras();

grant select on public.v_compras_pedido_eventos to authenticated;

-- ----------------------------------------------------------------------------
-- RPCs del pedido. Todas validan tiene_acceso_compras() y recalculan.
-- ----------------------------------------------------------------------------

-- Alta o edición con sus líneas. p_items: [{id?, item_id?, descripcion, unidad?, cantidad}]
-- Las líneas se actualizan por id (así no se desvinculan de sus remitos).
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

  if p_pedido_id is null then
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

    -- El mensaje de WhatsApp se arma con las líneas: al editarlas queda viejo y
    -- se borra, así nunca se manda (ni se reenvía) un pedido desactualizado.
    update compras_pedidos
      set proveedor_id = coalesce(p_proveedor_id, proveedor_id),
          local_facturacion_id = p_local_facturacion_id,
          mensaje = null
      where id = v_pedido.id;
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

  perform compras_recalcular_estado_pedido(v_id);

  return jsonb_build_object('id', v_id, 'numero', v_pedido.numero);
end;
$$;

create or replace function public.compras_marcar_pedido_enviado(p_pedido_id uuid)
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
  if v_pedido.enviado_en is not null then
    -- Ya estaba enviado (doble click u otra persona): no es un error.
    return;
  end if;
  if not exists (select 1 from compras_pedido_items where pedido_id = p_pedido_id) then
    raise exception 'Agregá al menos un ítem antes de enviar el pedido.';
  end if;

  update compras_pedidos
    set enviado_en = now(), enviado_por = auth.uid()
    where id = p_pedido_id;

  perform compras_recalcular_estado_pedido(p_pedido_id);
end;
$$;

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
end;
$$;

create or replace function public.compras_eliminar_pedido(p_pedido_id uuid)
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
    return; -- ya no está: el resultado es el mismo
  end if;
  if v_pedido.estado_recepcion <> 'sin_enviar' or v_pedido.enviado_en is not null then
    raise exception 'Solo se puede eliminar un pedido sin enviar. Si ya salió, cerralo a mano.';
  end if;
  if exists (select 1 from compras_remitos where pedido_id = p_pedido_id) then
    raise exception 'El pedido tiene remitos cargados: borralos primero.';
  end if;

  delete from compras_pedidos where id = p_pedido_id;
end;
$$;

revoke execute on function public.compras_guardar_pedido(uuid, uuid, uuid, jsonb) from public, anon;
revoke execute on function public.compras_marcar_pedido_enviado(uuid) from public, anon;
revoke execute on function public.compras_cerrar_pedido_manual(uuid, text) from public, anon;
revoke execute on function public.compras_reabrir_pedido(uuid) from public, anon;
revoke execute on function public.compras_eliminar_pedido(uuid) from public, anon;
grant execute on function public.compras_guardar_pedido(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.compras_marcar_pedido_enviado(uuid) to authenticated;
grant execute on function public.compras_cerrar_pedido_manual(uuid, text) to authenticated;
grant execute on function public.compras_reabrir_pedido(uuid) to authenticated;
grant execute on function public.compras_eliminar_pedido(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill: recalcular todo y pasar a "cerrado a mano" los que estaban
-- cerrados (legacy) sin haber recibido todo.
-- ----------------------------------------------------------------------------
create temp table _f2_cerrados as
  select id, coalesce(cerrado_en, created_at) as cerrado_en
  from compras_pedidos where estado = 'cerrado';

do $$
declare
  r record;
begin
  for r in select id from compras_pedidos loop
    perform compras_recalcular_estado_pedido(r.id);
  end loop;

  update compras_pedidos p
    set estado_recepcion = 'cerrado_manual',
        cierre_motivo = 'Migración: pedido cerrado con líneas pendientes',
        cerrado_manual_en = c.cerrado_en,
        cerrado_en = c.cerrado_en
    from _f2_cerrados c
    where c.id = p.id
      and p.estado_recepcion <> 'recibido';

  for r in select id from _f2_cerrados loop
    perform compras_recalcular_estado_pedido(r.id);
  end loop;

  raise notice 'F2: % pedidos legacy cerrados → cerrado_manual',
    (select count(*) from compras_pedidos p join _f2_cerrados c on c.id = p.id where p.estado_recepcion = 'cerrado_manual');
end $$;

drop table _f2_cerrados;
