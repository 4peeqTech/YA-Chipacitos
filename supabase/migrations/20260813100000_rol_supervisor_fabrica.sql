-- Renombra el rol 'fabrica' -> 'supervisor_fabrica'. No toca los literales
-- 'fabrica' que son destino de productos/pedidos (dominio distinto que
-- coincide en nombre) — esos quedan igual.

-- ─── 1. Rol (fila de roles + profiles.rol) ─────────────────────────────────
alter table profiles drop constraint profiles_rol_fkey;
update roles set key = 'supervisor_fabrica', nombre = 'Supervisor de Fábrica' where key = 'fabrica';
update profiles set rol = 'supervisor_fabrica' where rol = 'fabrica';
alter table profiles add constraint profiles_rol_fkey foreign key (rol) references roles(key);

-- ─── 2. Funciones que comparaban por nombre de rol ─────────────────────────
create or replace function public.tiene_acceso_fabrica()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and rol in ('supervisor_fabrica', 'admin')
  );
$$;

create or replace function public.fabrica_puede_editar_fecha(p_fecha date)
returns boolean
language sql
stable
security definer
as $$
  select coalesce(get_user_rol(), '') = 'admin'
      or (p_fecha is not null and p_fecha between dia_fabrica() - 1 and dia_fabrica());
$$;

create or replace function public.fabrica_marcar_pedido_enviado(p_pedido_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_destino text;
  v_local_id uuid;
  r record;
begin
  select destino, local_id into v_destino, v_local_id from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (get_user_rol() in ('admin', 'supervisor_fabrica', 'deposito') or v_local_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update pedidos set estado = 'enviado', enviado_at = now() where id = p_pedido_id;

  if v_destino = 'fabrica' then
    for r in
      select pi.producto_id, pi.cantidad, fp.peso_kg
      from pedido_items pi
      join productos p on p.id = pi.producto_id
      join fabrica_presentaciones fp on fp.id = p.presentacion_id
      where pi.pedido_id = p_pedido_id
    loop
      perform mover_stock_terminado(r.producto_id, -(r.cantidad * r.peso_kg), 'salida_pedido', null, p_pedido_id);
    end loop;
  end if;
end;
$$;

-- ─── 3. Policies que comparaban get_user_rol() contra 'fabrica' ────────────
drop policy if exists "fabrica gestiona sus productos" on productos;
create policy "fabrica gestiona sus productos" on productos
  for all using (
    get_user_rol() = 'admin' or (get_user_rol() = 'supervisor_fabrica' and destino = 'fabrica')
  );

drop policy if exists "local ve sus pedidos" on pedidos;
create policy "local ve sus pedidos" on pedidos
  for select using (local_id = auth.uid() or get_user_rol() in ('admin', 'supervisor_fabrica', 'deposito'));

drop policy if exists "operadores actualizan pedidos" on pedidos;
create policy "operadores actualizan pedidos" on pedidos
  for update using (
    get_user_rol() in ('admin', 'supervisor_fabrica', 'deposito')
    or (local_id = auth.uid() and get_user_rol() = 'local')
  );
