-- ============================================================================
-- Pedidos eliminados (pedido del usuario, 2026-09-28, probando H1): borrar un
-- borrador deja un hueco en la numeración (N1). Para que se entienda por qué
-- falta un número, cada eliminación queda registrada con su motivo, quién, cuándo
-- y qué líneas tenía. La lista de Pedidos lo muestra en la pestaña "Eliminados".
--
-- También se registran los huecos que ya existían (números salteados antes de
-- este registro), sin datos del pedido.
-- ============================================================================

create table if not exists compras_pedidos_eliminados (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null,             -- sin FK: el pedido ya no existe
  numero           int not null unique,
  proveedor_id     uuid,
  proveedor_nombre text,
  lineas           jsonb not null default '[]'::jsonb,  -- [{descripcion, unidad, cantidad}]
  motivo           text not null check (nullif(btrim(motivo), '') is not null),
  creado_en        timestamptz,
  creado_por       uuid references profiles(id) on delete set null,
  eliminado_por    uuid references profiles(id) on delete set null,
  eliminado_en     timestamptz default now()  -- null en los huecos previos: no se sabe cuándo
);

alter table compras_pedidos_eliminados enable row level security;

-- Solo lectura desde la app; se escribe únicamente desde compras_eliminar_pedido.
drop policy if exists compras_pedidos_eliminados_lectura on compras_pedidos_eliminados;
create policy compras_pedidos_eliminados_lectura on compras_pedidos_eliminados
  for select using (tiene_acceso_compras());

-- Huecos previos: números menores al último que no están ni en pedidos ni acá.
insert into compras_pedidos_eliminados (pedido_id, numero, motivo, eliminado_en)
select gen_random_uuid(), n, 'Se eliminó antes de que existiera este registro', null
from generate_series(1, coalesce((select max(numero) from compras_pedidos), 0)) as n
where not exists (select 1 from compras_pedidos where numero = n)
  and not exists (select 1 from compras_pedidos_eliminados where numero = n);

-- Vista con los nombres (profiles no se lee entre usuarios), gateada en el WHERE.
create or replace view public.v_compras_pedidos_eliminados as
select
  e.id,
  e.pedido_id,
  e.numero,
  e.proveedor_id,
  e.proveedor_nombre,
  e.lineas,
  e.motivo,
  e.creado_en,
  pc.nombre as creado_por_nombre,
  e.eliminado_en,
  pe.nombre as eliminado_por_nombre
from compras_pedidos_eliminados e
left join profiles pc on pc.id = e.creado_por
left join profiles pe on pe.id = e.eliminado_por
where tiene_acceso_compras();

grant select on public.v_compras_pedidos_eliminados to authenticated;

-- Eliminar ahora pide motivo y deja el registro. Cuerpo de 20260924200000 +
-- el insert en compras_pedidos_eliminados.
drop function if exists public.compras_eliminar_pedido(uuid);

create or replace function public.compras_eliminar_pedido(
  p_pedido_id uuid default null,
  p_motivo text default null
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
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contanos por qué eliminás el pedido: queda registrado junto a su número.';
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

  insert into compras_pedidos_eliminados (
    pedido_id, numero, proveedor_id, proveedor_nombre, lineas, motivo,
    creado_en, creado_por, eliminado_por
  )
  select
    v_pedido.id, v_pedido.numero, v_pedido.proveedor_id, pr.nombre,
    coalesce((
      select jsonb_agg(jsonb_build_object('descripcion', pi.descripcion, 'unidad', pi.unidad, 'cantidad', pi.cantidad) order by pi.orden)
      from compras_pedido_items pi where pi.pedido_id = v_pedido.id
    ), '[]'::jsonb),
    btrim(p_motivo),
    v_pedido.created_at, v_pedido.creado_por, auth.uid()
  from (select 1) x
  left join proveedores pr on pr.id = v_pedido.proveedor_id;

  delete from compras_pedidos where id = p_pedido_id;
end;
$$;

revoke execute on function public.compras_eliminar_pedido(uuid, text) from public, anon;
grant execute on function public.compras_eliminar_pedido(uuid, text) to authenticated;
