-- Fase 2 del plan "Catálogo único de insumos, conteos parametrizables,
-- Registro + Devolución": los tres conteos semanales (Bolsaplast/Global/
-- Huevos) pasan de estar hardcodeados en código y SQL a ser datos.
-- fabrica_conteo_definiciones + fabrica_conteo_definicion_items describen
-- día, ventana, si pide proyección de masas y qué ítems entran con qué
-- modo de cálculo; cada fabrica_conteos pasa a pertenecer a una sola
-- definición (antes era un borrador global que mezclaba Bolsaplast +
-- materia prima).
--
-- Desvío respecto al texto literal del plan: NO se dropea
-- compras_items.meta_semanal. Al revisar el código se encontró que ese
-- campo no es exclusivo del conteo de Bolsaplast — /admin/compras/pedidos
-- (sugerido al armar un pedido nuevo) y /admin/compras/stock (indicador de
-- "bajo stock") lo usan como meta/piso general de cualquier insumo,
-- independiente de si participa de algún conteo. Se mantiene como el dato
-- general del catálogo y se copia (no se mueve) a
-- fabrica_conteo_definicion_items.meta_semanal como valor inicial de la
-- membresía Bolsaplast; de acá en adelante son independientes, mismo
-- criterio de snapshot que ya se usa en el resto del módulo.
-- incluir_en_conteo sí se dropea: confirmado que solo lo usaba
-- app/fabrica/stock/page.tsx para armar la lista de Bolsaplast, ahora
-- reemplazada por la membresía explícita en fabrica_conteo_definicion_items.

-- ============================================================================
-- 1. Tablas de definición.
-- ============================================================================

create table fabrica_conteo_definiciones (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  icono        text,
  dia_semana   int not null check (dia_semana between 1 and 7),   -- ISO: 1 = lunes ... 7 = domingo
  turno_desde  text not null default 'tarde' check (turno_desde in ('manana', 'tarde')),
  dias_ventana int not null default 3,
  turno_hasta  text not null default 'manana' check (turno_hasta in ('manana', 'tarde')),
  pide_masas   boolean not null default false,
  orden        int not null default 0,
  activo       boolean not null default true
);

-- La membresía: qué insumo entra en qué conteo y con qué parámetros de
-- compra (modo_calculo/meta_semanal/cantidad_fija) — el reparto de datos
-- decidido con el usuario es "receta en el catálogo, metas en el conteo".
create table fabrica_conteo_definicion_items (
  id            uuid primary key default gen_random_uuid(),
  definicion_id uuid not null references fabrica_conteo_definiciones(id) on delete cascade,
  item_id       uuid not null references compras_items(id),
  modo_calculo  text not null check (modo_calculo in ('por_masa', 'meta_semanal', 'cantidad_fija')),
  meta_semanal  numeric not null default 0,
  cantidad_fija numeric not null default 0,
  orden         int not null default 0,
  activo        boolean not null default true,
  unique (definicion_id, item_id)
);

-- Acceso: fábrica solo lee (arma sus desplegables en /fabrica/stock);
-- Compras gestiona el CRUD desde /admin/compras/conteos. Mismo criterio de
-- policies por comando que ya usa fabrica_conteos.
alter table fabrica_conteo_definiciones enable row level security;
create policy "fabrica_conteo_definiciones_lectura" on fabrica_conteo_definiciones
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());
create policy "fabrica_conteo_definiciones_alta" on fabrica_conteo_definiciones
  for insert with check (tiene_acceso_compras());
create policy "fabrica_conteo_definiciones_modificacion" on fabrica_conteo_definiciones
  for update using (tiene_acceso_compras());
create policy "fabrica_conteo_definiciones_borrado" on fabrica_conteo_definiciones
  for delete using (tiene_acceso_compras());

alter table fabrica_conteo_definicion_items enable row level security;
create policy "fabrica_conteo_definicion_items_lectura" on fabrica_conteo_definicion_items
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());
create policy "fabrica_conteo_definicion_items_alta" on fabrica_conteo_definicion_items
  for insert with check (tiene_acceso_compras());
create policy "fabrica_conteo_definicion_items_modificacion" on fabrica_conteo_definicion_items
  for update using (tiene_acceso_compras());
create policy "fabrica_conteo_definicion_items_borrado" on fabrica_conteo_definicion_items
  for delete using (tiene_acceso_compras());

-- ============================================================================
-- 2. Sembrar las 3 definiciones — equivalentes exactos de las reglas de hoy.
-- ============================================================================

insert into fabrica_conteo_definiciones (nombre, icono, dia_semana, turno_desde, dias_ventana, turno_hasta, pide_masas, orden)
values
  ('Bolsaplast', '📦', 1, 'manana', 7, 'manana', false, 1),  -- lunes, ventana semanal completa, sin proyección de masas
  ('Global',     '🌾', 2, 'tarde',  3, 'manana', true,  2),  -- martes tarde → viernes mañana (ventana actual hardcodeada)
  ('Huevos',     '🥚', 4, 'tarde',  8, 'manana', true,  3);  -- jueves tarde → viernes de la semana siguiente

insert into fabrica_conteo_definicion_items (definicion_id, item_id, modo_calculo, meta_semanal, orden)
select (select id from fabrica_conteo_definiciones where nombre = 'Bolsaplast'),
       ci.id, 'meta_semanal', ci.meta_semanal, row_number() over (order by ci.nombre) - 1
from compras_items ci
where ci.incluir_en_conteo = true and ci.estado = 'activo';

insert into fabrica_conteo_definicion_items (definicion_id, item_id, modo_calculo, orden)
select (select id from fabrica_conteo_definiciones where nombre = 'Global'),
       ci.id, 'por_masa', row_number() over (order by ci.nombre) - 1
from compras_items ci
join compras_categorias cc on cc.id = ci.categoria_id
where cc.nombre = 'Materia prima' and ci.nombre <> 'Huevos' and ci.estado = 'activo';

insert into fabrica_conteo_definicion_items (definicion_id, item_id, modo_calculo, orden)
select (select id from fabrica_conteo_definiciones where nombre = 'Huevos'),
       ci.id, 'por_masa', 0
from compras_items ci
where ci.nombre = 'Huevos' and ci.estado = 'activo';

-- ============================================================================
-- 3. Limpieza de datos transaccionales: mismo criterio que las migraciones
--    anteriores del módulo — se preserva el catálogo (ahora también las
--    nuevas definiciones) y se borran conteos/solicitudes/pedidos en
--    borrador, que usan la semántica vieja (un borrador global sin
--    definicion_id).
-- ============================================================================

update compras_pedidos set solicitud_id = null where solicitud_id is not null;
delete from compras_solicitudes;
delete from fabrica_conteos;

-- ============================================================================
-- 4. fabrica_conteos pasa a ser instancia de una definición. Se borran
--    huevos_cajones_disponibles (huevos ya es un ítem normal del catálogo
--    desde la Fase 1) y proyeccion_embolsado_kg (nunca se llegó a escribir
--    desde ninguna pantalla — el reporte que la lee, /fabrica/reportes,
--    siempre mostró "sin proyección" y sigue así con un 0 hardcodeado).
-- ============================================================================

alter table fabrica_conteos
  add column definicion_id uuid references fabrica_conteo_definiciones(id),
  drop column huevos_cajones_disponibles,
  drop column proyeccion_embolsado_kg;

alter table fabrica_conteos alter column definicion_id set not null;

drop index fabrica_conteos_un_borrador;
create unique index fabrica_conteos_un_borrador_por_definicion
  on fabrica_conteos (definicion_id) where estado = 'borrador';

drop index fabrica_conteos_fecha_cerrado_unique;
create unique index fabrica_conteos_definicion_fecha_cerrado_unique
  on fabrica_conteos (definicion_id, fecha) where estado = 'cerrado';

-- ============================================================================
-- 5. fabrica_conteo_items snapshotea la regla aplicada al cierre (mismo
--    criterio que ya usaba para kg_por_masa/kg_por_unidad): editar la
--    definición la semana que viene no cambia retroactivamente un conteo
--    ya cerrado.
-- ============================================================================

alter table fabrica_conteo_items rename column kg_por_masa to cantidad_por_masa;
alter table fabrica_conteo_items rename column kg_por_unidad to cantidad_por_unidad;
alter table fabrica_conteo_items
  add column modo_calculo  text,
  add column redondeo      text,
  add column meta_semanal  numeric,
  add column cantidad_fija numeric;

-- ============================================================================
-- 6. compras_items: se va incluir_en_conteo (reemplazada por la membresía
--    explícita en fabrica_conteo_definicion_items). meta_semanal se queda
--    — ver nota al principio del archivo.
-- ============================================================================

alter table compras_items drop column incluir_en_conteo;

-- ============================================================================
-- 7. tiene_acceso_compras(): suma compras-conteos al set de módulos que
--    habilitan la bandeja/notificaciones de Compras.
-- ============================================================================

create or replace function public.tiene_acceso_compras()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (
        rol = 'admin'
        or modulos_permitidos && array[
          'compras-insumos', 'compras-stock', 'compras-pedidos',
          'compras-remitos', 'compras-reportes', 'compras-solicitudes',
          'compras-pedido-base', 'compras-conteos'
        ]
      )
  );
$$;

-- ============================================================================
-- 8. cerrar_conteo_fabrica: reescritura genérica. Reemplaza las dos fuentes
--    cableadas (materia prima/Huevos por un lado, Bolsaplast por otro) por
--    una sola pasada sobre modo_calculo, snapshoteando la regla vigente de
--    fabrica_conteo_definicion_items/compras_items en cada línea.
-- ============================================================================

create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas         numeric;
  v_definicion_id uuid;
  v_solicitud_id  uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select masas_proyectadas, definicion_id
    into v_masas, v_definicion_id
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  update fabrica_conteo_items fci set
    cantidad_por_masa   = ci.cantidad_por_masa,
    cantidad_por_unidad = ci.cantidad_por_unidad,
    redondeo            = ci.redondeo,
    modo_calculo        = dci.modo_calculo,
    meta_semanal        = dci.meta_semanal,
    cantidad_fija       = dci.cantidad_fija,
    necesidad           = ci.cantidad_por_masa * v_masas,
    sugerido            = case
                            when ci.redondeo = 'sin_calculo' then 0
                            when dci.modo_calculo = 'cantidad_fija' then dci.cantidad_fija
                            when dci.modo_calculo = 'meta_semanal' then greatest(0, dci.meta_semanal - fci.cantidad)
                            when dci.modo_calculo = 'por_masa' and ci.cantidad_por_unidad > 0 then greatest(
                              case ci.redondeo
                                when 'siempre_arriba' then
                                  ceil(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                when 'siempre_abajo' then
                                  floor(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                else
                                  round(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                              end,
                              case when dci.meta_semanal > 0 then greatest(0, dci.meta_semanal - fci.cantidad) else 0 end
                            )
                            else 0
                          end
  from compras_items ci
  join fabrica_conteo_definicion_items dci on dci.item_id = ci.id and dci.definicion_id = v_definicion_id
  where ci.id = fci.item_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, fci.item_id, ci.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;
