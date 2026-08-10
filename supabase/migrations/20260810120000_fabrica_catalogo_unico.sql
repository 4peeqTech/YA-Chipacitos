-- Fase 1 del plan "Catálogo único de insumos, conteos parametrizables,
-- Registro + Devolución": fusiona fabrica_materia_prima dentro de
-- compras_items — una sola tabla para todo lo que se le compra a un
-- proveedor, con stock persistente en compras_stock_actual para todos.
-- El truco que evita una tabla de mapeo: se inserta preservando el `id`
-- original de fabrica_materia_prima, así todos los materia_prima_id que
-- hay dando vueltas ya son item_id válidos y el remapeo es un coalesce.

-- ============================================================================
-- Limpieza de datos transaccionales: mismo criterio que las dos migraciones
-- anteriores del módulo (20260806110000, 20260806120000) — se preserva todo
-- el catálogo (insumos, materia prima, proveedores, categorías, plantilla
-- base) y se borran conteos/solicitudes/pedidos en borrador, que usan la
-- semántica vieja (materia_prima_id separado de item_id).
-- ============================================================================

update compras_pedidos set solicitud_id = null where solicitud_id is not null;
delete from compras_solicitudes;
delete from fabrica_conteos;

-- ============================================================================
-- 1. compras_items pasa a ser el catálogo único: suma los datos de receta
--    que hoy solo tiene fabrica_materia_prima. siempre_abajo es el valor
--    nuevo de redondeo: un faltante de 0,9 unidades no pide nada.
-- ============================================================================

alter table compras_items
  add column if not exists cantidad_por_unidad numeric not null default 1,
  add column if not exists cantidad_por_masa   numeric not null default 0,
  add column if not exists redondeo text not null default 'estandar'
    check (redondeo in ('estandar', 'siempre_arriba', 'siempre_abajo', 'sin_calculo'));

insert into compras_categorias (nombre) values ('Materia prima') on conflict (nombre) do nothing;

-- ============================================================================
-- 2. Migrar fabrica_materia_prima → compras_items, preservando el id.
-- ============================================================================

insert into compras_items (id, proveedor_id, categoria_id, nombre, unidad,
                            cantidad_por_unidad, cantidad_por_masa, redondeo, precio, estado)
select fmp.id, fmp.proveedor_id, (select id from compras_categorias where nombre = 'Materia prima'),
       fmp.nombre, fmp.unidad_compra, fmp.kg_por_unidad, fmp.kg_por_masa, fmp.redondeo, fmp.precio, fmp.estado
from fabrica_materia_prima fmp;

-- Ahora que su materia prima tiene stock persistente en compras_stock_actual
-- (recibida por remito o cargada a mano), estos proveedores "manejan stock"
-- igual que Bolsaplast — corrige además el desplegable de proveedor en
-- /admin/compras/insumos, que filtraba por este flag.
update proveedores set maneja_stock = true
where upper(nombre) in ('GLOBAL', 'HUEVO CAMPO');

-- ============================================================================
-- 3. Remapeo de FK en las tablas que hoy tienen materia_prima_id en paralelo
--    a item_id (compras_solicitud_items, compras_pedido_items,
--    compras_plantilla_base). Como los ids se preservaron en el paso 2, el
--    remapeo es un coalesce sin tabla intermedia.
-- ============================================================================

update compras_solicitud_items set item_id = coalesce(item_id, materia_prima_id) where materia_prima_id is not null;
alter table compras_solicitud_items drop column materia_prima_id;

update compras_pedido_items set item_id = coalesce(item_id, materia_prima_id) where materia_prima_id is not null;
alter table compras_pedido_items drop column materia_prima_id;

update compras_plantilla_base set item_id = coalesce(item_id, materia_prima_id) where materia_prima_id is not null;
alter table compras_plantilla_base drop column materia_prima_id;

-- fabrica_conteo_items no tiene item_id (se lo sacó 20260806110000 al
-- separar materia prima) — se vació arriba junto con fabrica_conteos, así
-- que no hay filas que remapear: se recrea la columna directo.
alter table fabrica_conteo_items
  drop constraint if exists fabrica_conteo_items_conteo_id_materia_prima_id_key,
  drop column if exists materia_prima_id,
  add column item_id uuid references compras_items(id);
alter table fabrica_conteo_items alter column item_id set not null;
alter table fabrica_conteo_items add constraint fabrica_conteo_items_conteo_id_item_id_key unique (conteo_id, item_id);

drop table fabrica_materia_prima;

-- ============================================================================
-- 4. Sembrar Huevos como ítem normal del catálogo — desaparece el hardcode
--    90 huevos/masa, 360 huevos/cajón (12 maples × 30) de calculoSugerido.ts.
-- ============================================================================

insert into compras_items (proveedor_id, categoria_id, nombre, unidad, cantidad_por_unidad, cantidad_por_masa, redondeo, estado)
select p.id, (select id from compras_categorias where nombre = 'Materia prima'),
       'Huevos', 'Cajón', 360, 90, 'siempre_arriba', 'activo'
from proveedores p
where upper(p.nombre) = 'HUEVO CAMPO'
  and not exists (
    select 1 from compras_items where nombre = 'Huevos' and proveedor_id = p.id
  );

-- ============================================================================
-- 5. Admin: una sola lista. compras-materia-prima sale del set de módulos;
--    se reescriben los modulos_permitidos existentes para no dejar a nadie
--    sin acceso en silencio (esa pantalla se fusiona en Insumos).
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
          'compras-remitos', 'compras-reportes', 'compras-solicitudes', 'compras-pedido-base'
        ]
      )
  );
$$;

update profiles
set modulos_permitidos = array(
  select distinct unnest(array_replace(modulos_permitidos, 'compras-materia-prima', 'compras-insumos'))
)
where 'compras-materia-prima' = any(modulos_permitidos);

-- ============================================================================
-- 6. generar_solicitud_base / convertir_solicitud_a_pedidos: vuelven a
--    copiar solo item_id (materia_prima_id ya no existe en ninguna tabla).
-- ============================================================================

create or replace function public.generar_solicitud_base()
returns uuid
language plpgsql
security definer
as $$
declare
  v_solicitud_id uuid;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  if exists (select 1 from compras_solicitudes where tipo = 'base' and estado = 'abierta') then
    raise exception 'Ya hay un pedido base pendiente de revisión en la bandeja de solicitudes';
  end if;

  insert into compras_solicitudes (tipo, estado, creado_por)
  values ('base', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad, cantidad, true
  from compras_plantilla_base
  where activo
  order by orden;

  return v_solicitud_id;
end;
$$;

create or replace function public.convertir_solicitud_a_pedidos(p_solicitud_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_proveedor_id uuid;
  v_pedido_id    uuid;
  v_creados      integer := 0;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  perform 1 from compras_solicitudes where id = p_solicitud_id and estado = 'abierta' for update;
  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;

  for v_proveedor_id in
    select distinct proveedor_id
    from compras_solicitud_items
    where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0
  loop
    insert into compras_pedidos (proveedor_id, estado, creado_por, solicitud_id)
    values (v_proveedor_id, 'borrador', auth.uid(), p_solicitud_id)
    returning id into v_pedido_id;

    insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden)
    select v_pedido_id, csi.item_id, csi.descripcion, csi.unidad, csi.cantidad_ajustada,
           row_number() over (order by csi.descripcion) - 1
    from compras_solicitud_items csi
    where csi.solicitud_id = p_solicitud_id
      and csi.proveedor_id = v_proveedor_id
      and csi.incluir
      and csi.cantidad_ajustada > 0;

    v_creados := v_creados + 1;
  end loop;

  update compras_solicitudes
    set estado = 'convertida', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id;

  return v_creados;
end;
$$;

-- ============================================================================
-- 7. cerrar_conteo_fabrica: reescritura mínima para el catálogo unificado.
--    Fuente 1 (materia prima + Huevos, ahora catálogo normal vía item_id en
--    fabrica_conteo_items) usa cantidad_por_masa/cantidad_por_unidad/
--    redondeo de compras_items — reemplaza el join a fabrica_materia_prima y
--    absorbe el bloque que antes calculaba Huevos aparte. Fuente 2
--    (Bolsaplast) sigue igual: sin cambios, todavía vive en
--    incluir_en_conteo/meta_semanal de compras_items hasta que la Fase 2
--    los mueva a la definición del conteo. Es interina: la Fase 2 la
--    reemplaza por la versión genérica con modo_calculo.
-- ============================================================================

create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas        numeric;
  v_solicitud_id uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  select masas_proyectadas
    into v_masas
    from fabrica_conteos
    where id = p_conteo_id and estado = 'borrador'
    for update;

  if not found then
    raise exception 'Conteo no encontrado o ya cerrado';
  end if;

  -- Fuente 1: materia prima + Huevos (líneas ya sembradas en fabrica_conteo_items).
  update fabrica_conteo_items fci set
    kg_por_masa   = ci.cantidad_por_masa,
    kg_por_unidad = ci.cantidad_por_unidad,
    unidad_compra = ci.unidad,
    necesidad     = ci.cantidad_por_masa * v_masas,
    sugerido      = case
                      when ci.redondeo = 'sin_calculo' then 0
                      when ci.cantidad_por_unidad <= 0 then 0
                      when ci.redondeo = 'siempre_arriba' then
                        ceil(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                      when ci.redondeo = 'siempre_abajo' then
                        floor(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                      else
                        round(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                    end
  from compras_items ci
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

  -- Fuente 2: Bolsaplast (depósito) — faltante = max(0, meta_semanal − stock_actual).
  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir)
  select v_solicitud_id, ci.id, ci.proveedor_id, ci.nombre, ci.unidad,
         greatest(0, ci.meta_semanal - coalesce(csa.cantidad, 0)),
         greatest(0, ci.meta_semanal - coalesce(csa.cantidad, 0)),
         greatest(0, ci.meta_semanal - coalesce(csa.cantidad, 0)) > 0
  from compras_items ci
  left join compras_stock_actual csa on csa.item_id = ci.id
  where ci.incluir_en_conteo and ci.estado = 'activo';

  return v_solicitud_id;
end;
$$;
