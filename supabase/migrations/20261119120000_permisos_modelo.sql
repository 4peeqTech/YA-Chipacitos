-- Épica roles y permisos, T1: modelo, catálogo y siembra.
-- Plan: artifacts/roles-permisos/plan-tecnico (epic 13f648e6).
--
-- El rol define áreas y permisos por defecto; la persona tiene ajustes
-- (agregar / quitar) y sucursales (locales_config). Nada de la app ni de las
-- reglas lee todavía estas tablas (eso es T2 y T3): esta migración no cambia
-- el acceso de nadie. La siembra reproduce lo que cada persona tiene hoy;
-- scripts/permisos-comparar.ts lo verifica.

-- 1. Catálogo (fuente: lib/permisos/catalogo.ts)

create table if not exists permisos_catalogo (
  clave   text primary key,
  tipo    text not null check (tipo in ('pantalla', 'accion')),
  area    text check (area in ('administracion', 'locales', 'fabrica', 'deposito', 'mayorista')),
  nombre  text not null
);

insert into permisos_catalogo (clave, tipo, area, nombre) values
  ('pantalla:dashboard', 'pantalla', 'administracion', 'Dashboard'),
  ('pantalla:gastos', 'pantalla', 'administracion', 'Gastos'),
  ('pantalla:gastos_pendientes', 'pantalla', 'administracion', 'Pendientes de pago'),
  ('pantalla:gastos_recurrentes', 'pantalla', 'administracion', 'Que se repiten'),
  ('pantalla:gastos_clasificar', 'pantalla', 'administracion', 'Clasificar Fudo'),
  ('pantalla:plan_cuentas', 'pantalla', 'administracion', 'Plan de cuentas'),
  ('pantalla:resumen', 'pantalla', 'administracion', 'Resumen por local'),
  ('pantalla:pedidos_locales', 'pantalla', 'administracion', 'Pedidos de locales'),
  ('pantalla:importar', 'pantalla', 'administracion', 'Sincronizar'),
  ('pantalla:posberry', 'pantalla', 'administracion', 'Ventas Posberry'),
  ('pantalla:conciliacion', 'pantalla', 'administracion', 'Conciliación'),
  ('pantalla:integraciones_ventas', 'pantalla', 'administracion', 'Ventas Fudo'),
  ('pantalla:integraciones_fudo', 'pantalla', 'administracion', 'Conexión Fudo'),
  ('pantalla:nomenclador', 'pantalla', 'administracion', 'Nomenclador'),
  ('pantalla:catalogo', 'pantalla', 'administracion', 'Catálogo de productos'),
  ('pantalla:mapeos', 'pantalla', 'administracion', 'Mapeo productos'),
  ('pantalla:usuarios', 'pantalla', 'administracion', 'Usuarios'),
  ('pantalla:roles', 'pantalla', 'administracion', 'Roles'),
  ('pantalla:cajas', 'pantalla', 'administracion', 'Cajas'),
  ('pantalla:formas_pago', 'pantalla', 'administracion', 'Formas de pago'),
  ('pantalla:proveedores', 'pantalla', 'administracion', 'Proveedores'),
  ('pantalla:compras-insumos', 'pantalla', 'administracion', 'Insumos'),
  ('pantalla:compras-stock', 'pantalla', 'administracion', 'Stock'),
  ('pantalla:compras-pedidos', 'pantalla', 'administracion', 'Pedidos'),
  ('pantalla:compras-reportes', 'pantalla', 'administracion', 'Reportes'),
  ('pantalla:compras-avisos', 'pantalla', 'administracion', 'Avisos'),
  ('pantalla:compras-facturas', 'pantalla', 'administracion', 'Facturas'),
  ('pantalla:fabrica-reportes', 'pantalla', 'administracion', 'Reportes'),
  ('pantalla:fabrica-registros', 'pantalla', 'administracion', 'Registros'),
  ('pantalla:fabrica-stock-terminado', 'pantalla', 'administracion', 'Stock terminado'),
  ('pantalla:fabrica-conteos', 'pantalla', 'administracion', 'Conteos'),
  ('pantalla:fabrica_parametros', 'pantalla', 'administracion', 'Parámetros'),
  ('pantalla:supervision', 'pantalla', 'administracion', 'Supervisión de locales'),
  ('pantalla:tareas', 'pantalla', null, 'Tareas'),
  ('compras.ver_plata', 'accion', 'administracion', 'Ver la plata de Compras'),
  ('compras.facturas', 'accion', 'administracion', 'Facturas y notas de crédito'),
  ('fabrica.corregir_cargas_viejas', 'accion', 'fabrica', 'Corregir cargas viejas de Fábrica'),
  ('usuarios.gestionar', 'accion', null, 'Gestionar usuarios y roles'),
  ('tareas.ver_todas', 'accion', null, 'Ver todas las tareas')
on conflict (clave) do update set tipo = excluded.tipo, area = excluded.area, nombre = excluded.nombre;

-- 2. Rol: áreas y permisos por defecto

create table if not exists rol_areas (
  rol_key  text not null references roles(key) on update cascade on delete cascade,
  area     text not null check (area in ('administracion', 'locales', 'fabrica', 'deposito', 'mayorista')),
  primary key (rol_key, area)
);

create table if not exists rol_permisos (
  rol_key  text not null references roles(key) on update cascade on delete cascade,
  permiso  text not null references permisos_catalogo(clave) on update cascade on delete cascade,
  primary key (rol_key, permiso)
);
create index if not exists idx_rol_permisos_permiso on rol_permisos (permiso);

-- 3. Persona: ajustes sobre su rol y sucursales

create table if not exists persona_permisos (
  persona_id  uuid not null references profiles(id) on delete cascade,
  permiso     text not null references permisos_catalogo(clave) on update cascade on delete cascade,
  efecto      text not null check (efecto in ('agregar', 'quitar')),
  primary key (persona_id, permiso)
);
create index if not exists idx_persona_permisos_permiso on persona_permisos (permiso);

alter table locales_config
  add column if not exists cuenta_local_id uuid unique references profiles(id) on delete set null;

create table if not exists persona_sucursales (
  persona_id       uuid not null references profiles(id) on delete cascade,
  local_config_id  uuid not null references locales_config(id) on delete cascade,
  primary key (persona_id, local_config_id)
);
create index if not exists idx_persona_sucursales_local on persona_sucursales (local_config_id);

-- 4. Historial de cambios (lo escriben las funciones de guardado de T5/T6)

create table if not exists permisos_historial (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid references profiles(id) on delete set null,
  rol_key     text references roles(key) on update cascade on delete set null,
  cambio      jsonb not null,
  hecho_por   uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_permisos_historial_persona on permisos_historial (persona_id, created_at desc);
create index if not exists idx_permisos_historial_rol on permisos_historial (rol_key, created_at desc);

-- 5. Lectura. Escribir: nadie por ahora (T5/T6 lo hacen con funciones security definer).

alter table permisos_catalogo  enable row level security;
alter table rol_areas          enable row level security;
alter table rol_permisos       enable row level security;
alter table persona_permisos   enable row level security;
alter table persona_sucursales enable row level security;
alter table permisos_historial enable row level security;

create policy "permisos_catalogo_lectura" on permisos_catalogo for select using ((select auth.uid()) is not null);
create policy "rol_areas_lectura" on rol_areas for select using ((select auth.uid()) is not null);
create policy "rol_permisos_lectura" on rol_permisos for select using ((select auth.uid()) is not null);
create policy "persona_permisos_lectura" on persona_permisos for select
  using (persona_id = (select auth.uid()) or (select es_admin()));
create policy "persona_sucursales_lectura" on persona_sucursales for select
  using (persona_id = (select auth.uid()) or (select es_admin()));
create policy "permisos_historial_lectura" on permisos_historial for select using ((select es_admin()));


-- Normaliza un nombre de sucursal para cruzar cuentas de local con locales_config:
-- "Suc. Ituzaingó" → "ituzaingo", "YA! UNIDAD" → "unidad", "Suc La Unidad" → "unidad".
create or replace function pg_temp._norm_sucursal(p text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(
           lower(translate(btrim(p), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn')),
           '^(suc\.?|ya!)\s*', ''), '^la\s+', ''), '\s+', ' ', 'g')
$$;

-- 6. Siembra: lo que cada persona tiene hoy (proxy.ts + modulos_permitidos)

do $$
declare
  v_solo_admin text[] := array['pantalla:gastos_recurrentes', 'pantalla:gastos_clasificar', 'pantalla:pedidos_locales', 'pantalla:integraciones_fudo', 'pantalla:proveedores', 'pantalla:compras-avisos', 'pantalla:compras-facturas', 'pantalla:fabrica-reportes', 'pantalla:fabrica-registros', 'pantalla:fabrica-stock-terminado', 'pantalla:fabrica_parametros'];
  v_destinatario_tareas uuid := '2957d327-77af-4116-a991-adac12a43c92';  -- DESTINATARIO_DEFAULT_INFORME_ID (S9)
  v_cuenta record;
begin
  -- Áreas de cada rol (rolRoutes de proxy.ts; admin hoy no entra a /mayorista).
  insert into rol_areas (rol_key, area)
  select r.key, a.area
  from roles r
  cross join lateral unnest(case r.key
    when 'admin' then array['administracion', 'locales', 'deposito', 'fabrica']
    when 'local' then array['locales']
    when 'deposito' then array['deposito']
    when 'supervisor_fabrica' then array['fabrica']
    when 'mayorista' then array['mayorista']
    else array['administracion'] end) as a(area)
  on conflict do nothing;

  -- Admin: todo el catálogo (el resolver igual le da todo; esto es para mostrarlo).
  insert into rol_permisos (rol_key, permiso)
  select 'admin', clave from permisos_catalogo
  where exists (select 1 from roles where key = 'admin')
  on conflict do nothing;

  -- Pantallas que cuentan hoy para cada persona que no es admin:
  -- operativos solo Tareas; el resto, sus módulos menos los soloAdmin.
  create temp table _pantallas_hoy on commit drop as
  select p.id as persona_id, p.rol, p.estado, 'pantalla:' || m as permiso
  from profiles p
  cross join lateral unnest(coalesce(p.modulos_permitidos, '{}'::text[])) as m
  where p.rol is not null and p.rol <> 'admin'
    and exists (select 1 from permisos_catalogo c where c.clave = 'pantalla:' || m)
    and case when p.rol in ('local', 'deposito', 'supervisor_fabrica', 'mayorista')
             then m = 'tareas'
             else not ('pantalla:' || m = any (v_solo_admin)) end;

  -- Defaults del rol: lo que comparten todas sus personas activas.
  insert into rol_permisos (rol_key, permiso)
  select rol, permiso
  from _pantallas_hoy
  where estado = 'activo'
  group by rol, permiso
  having count(*) = (select count(*) from profiles p where p.rol = _pantallas_hoy.rol and p.estado = 'activo')
  on conflict do nothing;

  insert into rol_permisos (rol_key, permiso)
  select 'supervisor_fabrica', 'fabrica.corregir_cargas_viejas'
  where exists (select 1 from roles where key = 'supervisor_fabrica')
  on conflict do nothing;

  -- Ajustes: lo que cada persona tiene de más sobre su rol.
  insert into persona_permisos (persona_id, permiso, efecto)
  select h.persona_id, h.permiso, 'agregar'
  from _pantallas_hoy h
  where not exists (select 1 from rol_permisos rp where rp.rol_key = h.rol and rp.permiso = h.permiso)
  on conflict do nothing;

  insert into persona_permisos (persona_id, permiso, efecto)
  select id, 'tareas.ver_todas', 'agregar' from profiles where id = v_destinatario_tareas
  on conflict do nothing;

  -- Sucursales: cada cuenta de local con su fila de locales_config, por nombre.
  -- Si no hay fila (Suc. Santa Fé en prod), se crea; las de prueba, inactivas.
  for v_cuenta in
    select p.id, coalesce(nullif(p.local_nombre, ''), p.nombre) as nombre, p.estado
    from profiles p where p.rol = 'local'
    order by p.nombre
  loop
    declare
      v_norm text := pg_temp._norm_sucursal(v_cuenta.nombre);
      v_config uuid;
    begin
      select id into v_config from locales_config lc
      where pg_temp._norm_sucursal(lc.sucursal) = v_norm and lc.cuenta_local_id is null
      order by lc.orden limit 1;

      if v_config is null then
        insert into locales_config (sucursal, activo, orden)
        values ('YA! ' || upper(v_norm),
                v_cuenta.estado = 'activo' and v_cuenta.nombre !~* 'prueba',
                coalesce((select max(orden) from locales_config), 0) + 1)
        returning id into v_config;
        raise notice 'Sucursal creada para la cuenta "%": YA! %', v_cuenta.nombre, upper(v_norm);
      end if;

      update locales_config set cuenta_local_id = v_cuenta.id where id = v_config;
      insert into persona_sucursales (persona_id, local_config_id) values (v_cuenta.id, v_config) on conflict do nothing;
    end;
  end loop;
end $$;
