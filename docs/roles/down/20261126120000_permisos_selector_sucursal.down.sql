-- Down de 20261126120000_permisos_selector_sucursal (T4): pedidos_crear sin sucursal;
-- cada persona deja de leer las filas de locales_config de sus sucursales.

begin;

drop policy if exists "ve sus sucursales" on public.locales_config;
drop function if exists public.pedidos_crear(jsonb, text, uuid);

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
  -- T4 suma la sucursal elegida; hasta entonces crea pedidos solo una cuenta de local.
  if not exists (select 1 from locales_config where cuenta_local_id = v_uid) then
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
$$;

revoke all on function public.pedidos_crear(jsonb, text) from public, anon;
grant execute on function public.pedidos_crear(jsonb, text) to authenticated;

delete from supabase_migrations.schema_migrations where version = '20261126120000';

commit;
