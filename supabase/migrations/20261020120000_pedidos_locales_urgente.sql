-- Pedidos de locales y mayorista: base del rediseño (plan "pedidos urgente",
-- decisiones D2 a D8). Sale desde main: no depende de nada del Bloque 2.
--
--   1. Helpers de permisos: puede_operar_destino() y puede_ver_pedido().
--   2. Esquema: estado cancelado, columnas nuevas, cantidades numeric,
--      cantidad_enviada/origen en ítems, pedido_eventos, autor de mensajes.
--   3. RLS: el local ya no inserta ni actualiza directo; cada parte ve solo
--      lo suyo (local dueño u operador del destino).
--   4. RPC: todo cambio de estado o de ítems pasa por acá.
--   5. Corte de versión: cierre de lo viejo y config.pedidos_version_desde.

-- ─── 1. Helpers de permisos ─────────────────────────────────────────────────

-- admin opera todo; mayorista opera fábrica; depósito opera depósito.
create or replace function public.puede_operar_destino(p_destino text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(get_user_rol(), '')
    when 'admin' then true
    when 'mayorista' then p_destino = 'fabrica'
    when 'deposito' then p_destino = 'deposito'
    else false
  end;
$$;

-- security definer para que las policies de ítems/eventos/mensajes no
-- dependan de la RLS de pedidos (y no haya recursión).
create or replace function public.puede_ver_pedido(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pedidos p
    where p.id = p_pedido_id
      and (p.local_id = auth.uid() or puede_operar_destino(p.destino))
  );
$$;

revoke all on function public.puede_operar_destino(text) from public, anon;
revoke all on function public.puede_ver_pedido(uuid) from public, anon;
grant execute on function public.puede_operar_destino(text) to authenticated;
grant execute on function public.puede_ver_pedido(uuid) to authenticated;

-- ─── 2. Esquema ─────────────────────────────────────────────────────────────

-- pedidos
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('pendiente', 'preparando', 'enviado', 'recibido', 'cancelado'));

alter table public.pedidos
  add column if not exists cancelado_at timestamptz,
  add column if not exists cancelado_por uuid references public.profiles(id) on delete set null,
  add column if not exists motivo_cancelacion text,
  add column if not exists recepcion_con_diferencias boolean not null default false,
  add column if not exists nota_recepcion text,
  add column if not exists version_anterior boolean not null default false,
  add column if not exists cierre_automatico boolean not null default false;

-- pedido_items: cantidades con decimales (D2) y tres cantidades (D3).
alter table public.pedido_items drop constraint if exists pedido_items_cantidad_check;
alter table public.pedido_items
  alter column cantidad type numeric using cantidad::numeric,
  alter column cantidad_recibida type numeric using cantidad_recibida::numeric;
alter table public.pedido_items add constraint pedido_items_cantidad_check check (cantidad >= 0);

alter table public.pedido_items
  add column if not exists cantidad_enviada numeric,
  add column if not exists origen text not null default 'pedido';
alter table public.pedido_items add constraint pedido_items_cantidad_enviada_check
  check (cantidad_enviada is null or cantidad_enviada >= 0);
alter table public.pedido_items add constraint pedido_items_cantidad_recibida_check
  check (cantidad_recibida is null or cantidad_recibida >= 0);
alter table public.pedido_items add constraint pedido_items_origen_check
  check (origen in ('pedido', 'despacho', 'recepcion'));

create index if not exists pedido_items_pedido_id_idx on public.pedido_items (pedido_id);

-- pedido_eventos: historial que solo se agrega (D4). Lo escriben las RPC y
-- esta migración; por RLS solo se lee.
create table if not exists public.pedido_eventos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  tipo text not null check (tipo in (
    'creado', 'preparando', 'editado', 'enviado', 'recibido',
    'recibido_con_diferencias', 'cancelado', 'cierre_automatico'
  )),
  detalle jsonb not null default '{}'::jsonb,
  autor_id uuid references public.profiles(id) on delete set null,
  autor_nombre text,
  autor_rol text,
  created_at timestamptz not null default now()
);
create index if not exists pedido_eventos_pedido_id_idx on public.pedido_eventos (pedido_id, created_at);
alter table public.pedido_eventos enable row level security;

-- pedido_mensajes: el autor lo pone la base, no el cliente.
alter table public.pedido_mensajes
  add column if not exists autor_id uuid default auth.uid() references public.profiles(id) on delete set null;
create index if not exists pedido_mensajes_pedido_id_idx on public.pedido_mensajes (pedido_id, created_at);

create or replace function public.pedido_mensajes_completar_autor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_local_nombre text;
  v_rol text;
begin
  -- Sin sesión (service role / migraciones) se respeta lo que venga.
  if auth.uid() is null then
    return new;
  end if;

  select nombre, local_nombre, rol into v_nombre, v_local_nombre, v_rol
    from profiles where id = auth.uid();

  new.autor_id := auth.uid();
  new.autor_rol := coalesce(v_rol, 'desconocido');
  new.autor_nombre := case
    when v_rol = 'local' then coalesce(nullif(v_local_nombre, ''), v_nombre, 'Local')
    else coalesce(v_nombre, 'Usuario')
  end;
  return new;
end;
$$;

drop trigger if exists pedido_mensajes_completar_autor on public.pedido_mensajes;
create trigger pedido_mensajes_completar_autor
  before insert on public.pedido_mensajes
  for each row execute function public.pedido_mensajes_completar_autor();

-- Realtime para el chat y el historial.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedido_mensajes') then
    alter publication supabase_realtime add table public.pedido_mensajes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedido_eventos') then
    alter publication supabase_realtime add table public.pedido_eventos;
  end if;
end;
$$;

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

-- pedidos: nadie inserta ni actualiza directo. Todo cambio pasa por las RPC
-- (D7), que validan la transición, mueven stock y graban el evento.
drop policy if exists "local ve sus pedidos" on public.pedidos;
drop policy if exists "local crea pedidos" on public.pedidos;
drop policy if exists "operadores actualizan pedidos" on public.pedidos;

create policy "ven pedidos el local dueño y el operador del destino" on public.pedidos
  for select using (local_id = auth.uid() or puede_operar_destino(destino));

-- pedido_items: solo lectura según la visibilidad del pedido.
drop policy if exists "todos los autenticados ven items" on public.pedido_items;
drop policy if exists "local crea items de sus pedidos" on public.pedido_items;
drop policy if exists "local actualiza items de sus pedidos" on public.pedido_items;

create policy "ven items quienes ven el pedido" on public.pedido_items
  for select using (puede_ver_pedido(pedido_id));

-- pedido_eventos
drop policy if exists "ven eventos quienes ven el pedido" on public.pedido_eventos;
create policy "ven eventos quienes ven el pedido" on public.pedido_eventos
  for select using (puede_ver_pedido(pedido_id));

-- pedido_mensajes
drop policy if exists "authenticated_all" on public.pedido_mensajes;
drop policy if exists "ven mensajes quienes ven el pedido" on public.pedido_mensajes;
drop policy if exists "escriben mensajes quienes ven el pedido" on public.pedido_mensajes;

create policy "ven mensajes quienes ven el pedido" on public.pedido_mensajes
  for select to authenticated using (puede_ver_pedido(pedido_id));

create policy "escriben mensajes quienes ven el pedido" on public.pedido_mensajes
  for insert to authenticated with check (puede_ver_pedido(pedido_id) and autor_id = auth.uid());

-- ─── 4. RPC ─────────────────────────────────────────────────────────────────

-- Etiqueta del estado para los mensajes de error.
create or replace function public._pedido_estado_label(p_estado text)
returns text
language sql
immutable
as $$
  select case p_estado
    when 'pendiente' then 'pendiente'
    when 'preparando' then 'en preparación'
    when 'enviado' then 'en camino'
    when 'recibido' then 'recibido'
    when 'cancelado' then 'cancelado'
    else p_estado
  end;
$$;

-- Graba un evento con el autor de la sesión. Solo para las RPC de acá.
create or replace function public._pedido_evento(p_pedido_id uuid, p_tipo text, p_detalle jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_local_nombre text;
  v_rol text;
begin
  select nombre, local_nombre, rol into v_nombre, v_local_nombre, v_rol
    from profiles where id = auth.uid();

  insert into pedido_eventos (pedido_id, tipo, detalle, autor_id, autor_nombre, autor_rol)
  values (
    p_pedido_id, p_tipo, coalesce(p_detalle, '{}'::jsonb), auth.uid(),
    case when v_rol = 'local' then coalesce(nullif(v_local_nombre, ''), v_nombre) else v_nombre end,
    v_rol
  );
end;
$$;

revoke all on function public._pedido_estado_label(text) from public, anon, authenticated;
revoke all on function public._pedido_evento(uuid, text, jsonb) from public, anon, authenticated;

-- 4.1 pedidos_crear: un pedido por destino, en una sola transacción.
create or replace function public.pedidos_crear(p_items jsonb, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    from _pedido_nuevo n left join productos pr on pr.id = n.producto_id
    where pr.id is null or pr.activo is not true
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
$$;

-- 4.2 pedido_empezar_preparacion
create or replace function public.pedido_empezar_preparacion(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if not puede_operar_destino(v_pedido.destino) then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado <> 'pendiente' then
    raise exception 'No se puede empezar a preparar: el pedido está %', _pedido_estado_label(v_pedido.estado);
  end if;

  update pedidos set estado = 'preparando', preparando_at = now() where id = p_pedido_id;
  perform _pedido_evento(p_pedido_id, 'preparando');
end;
$$;

-- 4.3 pedido_editar_items: el operador fija lo que va a mandar. Devuelve la
-- cantidad de cambios (0 = no cambió nada y no se graba evento).
create or replace function public.pedido_editar_items(p_pedido_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
  v_item pedido_items%rowtype;
  v_prod productos%rowtype;
  v_item_id uuid;
  v_producto_id uuid;
  v_nueva numeric;
  v_antes numeric;
  v_cambios jsonb := '[]'::jsonb;
  it jsonb;
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if not puede_operar_destino(v_pedido.destino) then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado not in ('pendiente', 'preparando') then
    raise exception 'No se puede editar: el pedido está %', _pedido_estado_label(v_pedido.estado);
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'No hay cambios para guardar';
  end if;

  for it in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_item_id := nullif(it->>'item_id', '')::uuid;
      v_producto_id := nullif(it->>'producto_id', '')::uuid;
      v_nueva := (it->>'cantidad_enviada')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Hay un producto o una cantidad que no es válida';
    end;

    if v_nueva is null or v_nueva < 0 then
      raise exception 'La cantidad a enviar no puede ser negativa ni quedar vacía';
    end if;

    v_item := null;
    if v_item_id is not null then
      select * into v_item from pedido_items where id = v_item_id and pedido_id = p_pedido_id for update;
      if not found then
        raise exception 'Hay un producto que no es de este pedido';
      end if;
    elsif v_producto_id is not null then
      select * into v_item from pedido_items
        where pedido_id = p_pedido_id and producto_id = v_producto_id
        order by created_at limit 1 for update;
    else
      raise exception 'Hay un producto que no es válido';
    end if;

    if v_item.id is not null then
      v_antes := coalesce(v_item.cantidad_enviada, v_item.cantidad);
      if v_antes = v_nueva then
        continue;
      end if;
      update pedido_items set cantidad_enviada = v_nueva where id = v_item.id;
      v_cambios := v_cambios || jsonb_build_object(
        'tipo', case when v_nueva = 0 then 'quitado' else 'modificado' end,
        'item_id', v_item.id, 'producto_id', v_item.producto_id, 'producto_nombre', v_item.producto_nombre,
        'antes', v_antes, 'despues', v_nueva
      );
    else
      -- Producto que no estaba en el pedido: lo agrega el operador.
      if v_nueva = 0 then
        continue;
      end if;
      select * into v_prod from productos where id = v_producto_id;
      if not found then
        raise exception 'Hay un producto que no es válido';
      end if;
      if v_prod.destino <> v_pedido.destino then
        raise exception '% no se despacha desde este destino', v_prod.nombre;
      end if;
      insert into pedido_items (pedido_id, producto_id, producto_nombre, cantidad, cantidad_enviada, origen)
      values (p_pedido_id, v_prod.id, v_prod.nombre, 0, v_nueva, 'despacho')
      returning id into v_item_id;
      v_cambios := v_cambios || jsonb_build_object(
        'tipo', 'agregado',
        'item_id', v_item_id, 'producto_id', v_prod.id, 'producto_nombre', v_prod.nombre,
        'antes', 0, 'despues', v_nueva
      );
    end if;
  end loop;

  if jsonb_array_length(v_cambios) > 0 then
    perform _pedido_evento(p_pedido_id, 'editado', jsonb_build_object('cambios', v_cambios));
  end if;

  return jsonb_array_length(v_cambios);
end;
$$;

-- 4.4 fabrica_marcar_pedido_enviado: se mantiene el nombre (lo usa depósito).
-- Ya no lo puede llamar el local dueño. Descuenta stock con lo enviado (D3).
create or replace function public.fabrica_marcar_pedido_enviado(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
  r record;
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if not puede_operar_destino(v_pedido.destino) then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado not in ('pendiente', 'preparando') then
    raise exception 'No se puede marcar como enviado: el pedido está %', _pedido_estado_label(v_pedido.estado);
  end if;

  update pedidos set estado = 'enviado', enviado_at = now() where id = p_pedido_id;

  if v_pedido.destino = 'fabrica' then
    for r in
      select pi.producto_id, coalesce(pi.cantidad_enviada, pi.cantidad) as cantidad, fp.peso_kg
      from pedido_items pi
      join productos p on p.id = pi.producto_id
      join fabrica_presentaciones fp on fp.id = p.presentacion_id
      where pi.pedido_id = p_pedido_id
        and coalesce(pi.cantidad_enviada, pi.cantidad) > 0
    loop
      perform mover_stock_terminado(r.producto_id, -(r.cantidad * r.peso_kg), 'salida_pedido', null, p_pedido_id);
    end loop;
  end if;

  perform _pedido_evento(p_pedido_id, 'enviado');
end;
$$;

-- 4.5 pedido_cancelar: local dueño, operador del destino o admin, antes de
-- "En camino" (D5).
create or replace function public.pedido_cancelar(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- 4.6 fabrica_confirmar_recepcion_pedido: nueva firma con nota (se borra la
-- de 3 argumentos para que no quede una sobrecarga).
--   p_items        [{id, cantidad_recibida, valor_total?}]: solo los ítems que
--                  se informan; el resto se da por recibido igual a lo enviado.
--                  Sin ítems = "Llegó todo bien".
--   p_items_nuevos [{producto_id, cantidad_recibida, valor_total?}]: llegaron
--                  sin pedirse.
-- Devuelve {con_diferencias}.
drop function if exists public.fabrica_confirmar_recepcion_pedido(uuid, jsonb, jsonb);

create or replace function public.fabrica_confirmar_recepcion_pedido(
  p_pedido_id uuid,
  p_items jsonb default '[]'::jsonb,
  p_items_nuevos jsonb default '[]'::jsonb,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- 4.7 pedidos_inicio_version: config solo la lee admin, por eso definer.
create or replace function public.pedidos_inicio_version()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select nullif(value, '')::date from config where key = 'pedidos_version_desde';
$$;

-- Permisos de las RPC: solo usuarios con sesión.
revoke all on function public.pedidos_crear(jsonb, text) from public, anon;
revoke all on function public.pedido_empezar_preparacion(uuid) from public, anon;
revoke all on function public.pedido_editar_items(uuid, jsonb) from public, anon;
revoke all on function public.fabrica_marcar_pedido_enviado(uuid) from public, anon;
revoke all on function public.pedido_cancelar(uuid, text) from public, anon;
revoke all on function public.fabrica_confirmar_recepcion_pedido(uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.pedidos_inicio_version() from public, anon;
grant execute on function public.pedidos_crear(jsonb, text) to authenticated;
grant execute on function public.pedido_empezar_preparacion(uuid) to authenticated;
grant execute on function public.pedido_editar_items(uuid, jsonb) to authenticated;
grant execute on function public.fabrica_marcar_pedido_enviado(uuid) to authenticated;
grant execute on function public.pedido_cancelar(uuid, text) to authenticated;
grant execute on function public.fabrica_confirmar_recepcion_pedido(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.pedidos_inicio_version() to authenticated;

-- ─── 5. Cierre de lo anterior y corte de versión (D6) ──────────────────────

-- Enviados de hace más de 3 días: se dan por recibidos (cuenta lo enviado).
with cerrados as (
  update public.pedidos
    set estado = 'recibido',
        recibido_at = coalesce(enviado_at, created_at),
        cierre_automatico = true
    where estado = 'enviado'
      and coalesce(enviado_at, created_at) < now() - interval '3 days'
    returning id
)
insert into public.pedido_eventos (pedido_id, tipo, detalle, autor_nombre, autor_rol)
select id, 'cierre_automatico',
       jsonb_build_object('motivo', 'Cerrado como recibido al pasar a la versión nueva'),
       'Sistema', 'sistema'
from cerrados;

-- Pendientes y en preparación de hace más de 14 días: se cancelan.
with cancelados as (
  update public.pedidos
    set estado = 'cancelado',
        cancelado_at = now(),
        motivo_cancelacion = 'Cerrado al pasar a la versión nueva'
    where estado in ('pendiente', 'preparando')
      and created_at < now() - interval '14 days'
    returning id
)
insert into public.pedido_eventos (pedido_id, tipo, detalle, autor_nombre, autor_rol)
select id, 'cancelado',
       jsonb_build_object('motivo', 'Cerrado al pasar a la versión nueva', 'automatico', true),
       'Sistema', 'sistema'
from cancelados;

-- Todo lo existente queda marcado como de la versión anterior.
update public.pedidos set version_anterior = true;

insert into public.config (key, value)
values ('pedidos_version_desde', to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD'))
on conflict (key) do nothing;
