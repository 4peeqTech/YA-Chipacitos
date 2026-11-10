-- Categorías del catálogo de productos, editables por el admin (Admin → Catálogo
-- de productos → pestaña Categorías). Antes la lista vivía fija en el código
-- (AdminCatalogoClient y lib/pedidos/categorias.ts) y no se podía crear,
-- renombrar, ordenar ni desactivar ninguna.
--
-- productos.categoria sigue guardando el nombre, pero ahora es una FK compuesta
-- (destino, categoria) → catalogo_categorias(destino, nombre):
--   * on update cascade: renombrar una categoría renombra la de sus productos;
--   * on delete restrict: no se borra una categoría que tiene productos;
--   * no se puede asignar a un producto una categoría que no existe (ni por CSV).
-- Así las pantallas que leen productos.categoria siguen andando sin cambios.
--
-- activa = false: nadie la puede pedir. Los locales no la ven en Pedir, el
-- mayorista no la ve en su Catálogo y pedidos_crear la rechaza.
-- sugerida = true: sus productos son "Tus habituales" de un local que todavía no
-- tiene pedidos (antes era fijo: la categoría que se llamara "Masas").

create table public.catalogo_categorias (
  id         uuid primary key default gen_random_uuid(),
  destino    text not null check (destino in ('fabrica', 'deposito')),
  nombre     text not null check (btrim(nombre) <> '' and nombre = btrim(nombre)),
  orden      integer not null default 0,
  -- Clave de ICONOS en lib/pedidos/categorias.ts; null = el genérico.
  icono      text,
  color      text not null default 'gris' check (color in ('ambar', 'celeste', 'verde', 'rosa', 'gris')),
  activa     boolean not null default true,
  sugerida   boolean not null default false,
  created_at timestamptz not null default now(),
  constraint catalogo_categorias_destino_nombre_key unique (destino, nombre)
);

-- "Masas" y "masas" serían la misma categoría para cualquiera que la lea.
create unique index catalogo_categorias_nombre_uq
  on public.catalogo_categorias (destino, lower(nombre));

alter table public.catalogo_categorias enable row level security;

create policy catalogo_categorias_lectura on public.catalogo_categorias
  for select to authenticated using (true);

create policy catalogo_categorias_admin on public.catalogo_categorias
  for all to authenticated using (es_admin()) with check (es_admin());

-- ─── Carga inicial: las categorías que ya usan los productos ────────────────

update public.productos
set categoria = nullif(btrim(categoria), '')
where categoria is distinct from nullif(btrim(categoria), '');

-- Orden, ícono y color que estaban fijos en lib/pedidos/categorias.ts. Una
-- categoría que haya entrado por CSV y no esté en esta lista queda al final, en gris.
insert into public.catalogo_categorias (destino, nombre, orden, icono, color, sugerida)
select distinct on (p.destino, lower(p.categoria))
  p.destino,
  coalesce(d.nombre, p.categoria),
  coalesce(d.orden, 100),
  d.icono,
  coalesce(d.color, 'gris'),
  coalesce(d.sugerida, false)
from public.productos p
left join (values
  ('Masas',             1,  'masa',      'ambar',   true),
  ('Productos Ya!',     2,  'congelado', 'celeste', false),
  ('Bolsas Congelados', 3,  'congelado', 'celeste', false),
  ('Cajas Congelados',  4,  'congelado', 'celeste', false),
  ('Toppings',          5,  'topping',   'verde',   false),
  ('Insumos Facturas',  6,  'torta',     'rosa',    false),
  ('Insumos General',   7,  'paquete',   'gris',    false),
  ('Bolsas Ya!',        8,  'bolsa',     'gris',    false),
  ('Cajas Ya!',         9,  'caja',      'gris',    false),
  ('Vasos Café Ya!',    10, 'vaso',      'gris',    false)
) as d(nombre, orden, icono, color, sugerida) on lower(d.nombre) = lower(p.categoria)
where p.categoria is not null
order by p.destino, lower(p.categoria), p.categoria;

-- Si un producto tenía "masas" en vez de "Masas", queda con el nombre de la categoría.
update public.productos p
set categoria = c.nombre
from public.catalogo_categorias c
where c.destino = p.destino and lower(c.nombre) = lower(p.categoria) and c.nombre <> p.categoria;

-- Orden correlativo dentro de cada destino.
update public.catalogo_categorias c
set orden = o.n
from (
  select id, row_number() over (partition by destino order by orden, nombre) as n
  from public.catalogo_categorias
) o
where o.id = c.id;

alter table public.productos
  add constraint productos_categoria_fkey
  foreign key (destino, categoria) references public.catalogo_categorias (destino, nombre)
  on update cascade on delete restrict;

-- ─── pedidos_crear: rechaza productos de una categoría desactivada ──────────
-- Igual a la de 20261020120000_pedidos_locales_urgente.sql salvo la condición
-- del "ya no está disponible".

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
