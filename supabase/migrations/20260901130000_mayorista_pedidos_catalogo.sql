-- Mayorista pasa a manejar Pedidos/Catálogo de fábrica (destino='fabrica') en
-- lugar de supervisor_fabrica. El routing ya trata 'mayorista' como rol operativo
-- de ruta fija (ver lib/modulos.tsx, proxy.ts, app/fabrica/layout.tsx); esta
-- migración alinea el rol y las policies de datos con ese cambio.

-- ─── 1. Alta/blindaje del rol mayorista ────────────────────────────────────
-- En dev el rol ya existía creado a mano desde /admin/roles (es_sistema=false);
-- en prod no existe todavía. Alta si falta + blindaje es_sistema=true en ambos
-- casos, igual que local/deposito/supervisor_fabrica (no puede borrarse ni
-- renombrarse por accidente una vez que queda hardcodeado en el routing).
insert into roles (key, nombre, color, es_sistema)
values ('mayorista', 'Mayorista', '#34d399', true)
on conflict (key) do update set es_sistema = true;

-- ─── 2. RLS de productos/pedidos (destino='fabrica'): supervisor_fabrica -> mayorista ──
drop policy if exists "fabrica gestiona sus productos" on productos;
create policy "fabrica gestiona sus productos" on productos
  for all using (
    get_user_rol() = 'admin' or (get_user_rol() = 'mayorista' and destino = 'fabrica')
  );

drop policy if exists "local ve sus pedidos" on pedidos;
create policy "local ve sus pedidos" on pedidos
  for select using (local_id = auth.uid() or get_user_rol() in ('admin', 'mayorista', 'deposito'));

drop policy if exists "operadores actualizan pedidos" on pedidos;
create policy "operadores actualizan pedidos" on pedidos
  for update using (
    get_user_rol() in ('admin', 'mayorista', 'deposito')
    or (local_id = auth.uid() and get_user_rol() = 'local')
  );

-- fabrica_marcar_pedido_enviado() hace su propio chequeo de rol (no depende solo
-- de las policies de arriba) para autorizar el botón "marcar enviado" en
-- /fabrica/pedidos (ver components/pedidos/PedidosOperadorClient.tsx). Sin este
-- cambio, mayorista podría ver/crear pedidos de fábrica pero nunca marcarlos
-- como enviados.
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

  if not (get_user_rol() in ('admin', 'mayorista', 'deposito') or v_local_id = auth.uid()) then
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

-- pedido_items no requiere cambios: ninguna policy nombra supervisor_fabrica/fabrica
-- explícitamente ("todos los autenticados ven items" + policies de insert/update
-- scoped a local_id, ver 20260601000000_initial_schema.sql y
-- 20260619132617_rls_pedido_items_update.sql).

-- ─── 3. Backfill del perfil de prueba ──────────────────────────────────────
-- Mayorista ya no depende de modulos_permitidos para su acceso principal (rutas
-- fijas, ver lib/modulos.tsx). Limpia lo que quedó en el perfil de prueba de dev;
-- en prod todavía no hay perfiles con este rol, no-op.
update profiles set modulos_permitidos = '{}' where rol = 'mayorista';
