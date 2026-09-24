-- F8 — Sobrestock: marca en el conteo, aviso y sugerencia para el pedido base.
-- Plan: C:\Users\spruy\.claude\plans\bueno-tenemos-todo-septiembre-nifty-meteor.md (decisiones X1 y X2).
--
-- Resumen:
--   * compras_config (clave/valor) nace acá con el umbral de sobrestock.
--   * compras_items.stock_maximo: tope opcional para insumos de reposición a demanda (X2).
--   * cerrar_conteo_fabrica sella exceso / sobrestock / descuento sugerido por ítem.
--   * generar_solicitud_base copia la sugerencia a la solicitud, sin tocar cantidad_ajustada.
-- Nada se aplica solo: la sugerencia la aplica Compras con un botón.

-- 1. compras_config ---------------------------------------------------------
create table if not exists public.compras_config (
  clave       text primary key,
  valor       jsonb not null,
  descripcion text,
  updated_at  timestamptz not null default now()
);

alter table public.compras_config enable row level security;

drop policy if exists "compras_config_lectura" on public.compras_config;
create policy "compras_config_lectura" on public.compras_config
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy if exists "compras_config_escritura" on public.compras_config;
create policy "compras_config_escritura" on public.compras_config
  for all using (es_admin()) with check (es_admin());

insert into public.compras_config (clave, valor, descripcion)
values ('sobrestock.umbral_unidades', '1'::jsonb,
        'Cuántas unidades de compra enteras tienen que sobrar para avisar sobrestock en el conteo.')
on conflict (clave) do nothing;

-- 2. Tope opcional para insumos de reposición a demanda (X2) ----------------
alter table public.compras_items
  add column if not exists stock_maximo numeric;

alter table public.compras_items
  drop constraint if exists compras_items_stock_maximo_positivo;
alter table public.compras_items
  add constraint compras_items_stock_maximo_positivo
  check (stock_maximo is null or stock_maximo > 0);

comment on column public.compras_items.stock_maximo is
  'Tope opcional para insumos de reposición a demanda, en unidades de compra. Si el conteo lo supera, avisa sobrestock.';

-- 3. Columnas nuevas del conteo y de la solicitud ---------------------------
alter table public.fabrica_conteo_items
  add column if not exists exceso numeric,
  add column if not exists sobrestock boolean not null default false,
  add column if not exists descuento_base_sugerido numeric;

comment on column public.fabrica_conteo_items.exceso is
  'Lo que sobra respecto de lo necesario, en unidades de compra (negativo = falta). Null = no se evalúa (a demanda sin tope, cantidad fija, sin masas).';

alter table public.compras_solicitud_items
  add column if not exists descuento_sugerido numeric,
  add column if not exists descuento_origen text;

-- 4. Sugerencias vigentes para el próximo pedido base ------------------------
-- Por ítem, el conteo cerrado MÁS RECIENTE que lo evaluó (exceso no null),
-- cerrado después de la última solicitud base no descartada. Si ese conteo ya
-- no marca sobrestock, no hay sugerencia (un conteo más nuevo manda).
-- Sin ninguna solicitud base previa, mira solo los últimos 14 días.
-- La usan generar_solicitud_base() (excluyendo la solicitud que está creando)
-- y la pantalla de Pedido base (banner).
create or replace function public.compras_sugerencias_sobrestock(p_excluir_solicitud uuid default null)
returns table (
  item_id    uuid,
  nombre     text,
  unidad     text,
  exceso     numeric,
  descuento  numeric,
  origen     text,
  conteo_id  uuid,
  cerrado_en timestamptz
)
language plpgsql
stable
security definer
as $$
declare
  v_desde timestamptz;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select max(created_at) into v_desde
    from compras_solicitudes
    where tipo = 'base' and estado <> 'descartada'
      and id is distinct from p_excluir_solicitud;

  v_desde := coalesce(v_desde, now() - interval '14 days');

  return query
  select s.item_id, s.nombre, s.unidad, s.exceso, s.descuento, s.origen, s.conteo_id, s.cerrado_en
  from (
    select distinct on (fci.item_id)
      fci.item_id,
      ci.nombre,
      ci.unidad,
      fci.exceso,
      fci.sobrestock,
      fci.descuento_base_sugerido as descuento,
      'Conteo ' || d.nombre || ' ' ||
        to_char(c.cerrado_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') as origen,
      c.id as conteo_id,
      c.cerrado_en
    from fabrica_conteo_items fci
    join fabrica_conteos c on c.id = fci.conteo_id
    join fabrica_conteo_definiciones d on d.id = c.definicion_id
    join compras_items ci on ci.id = fci.item_id
    where c.estado = 'cerrado'
      and c.cerrado_en > v_desde
      and fci.exceso is not null
    order by fci.item_id, c.cerrado_en desc
  ) s
  where s.sobrestock and coalesce(s.descuento, 0) > 0;
end;
$$;

-- 5. cerrar_conteo_fabrica(): mismo cuerpo que en
--    20260903120000_pedido_base_orden.sql:92-164. Único cambio: después de
--    sellar el sugerido, un segundo UPDATE calcula exceso / sobrestock /
--    descuento_base_sugerido con los valores ya sellados en la fila.
--    Espejo en TS: lib/fabrica/calculoSugerido.ts (calcularSobrestock).
--    Reglas (u = compras_config 'sobrestock.umbral_unidades', 1 por defecto):
--      a demanda (redondeo 'sin_calculo', o por_masa sin receta):
--          sin stock_maximo → exceso null; con tope → exceso = contado − tope
--      por_masa con receta, cpu > 0 y masas > 0:
--          exceso = contado − max(necesidad / cpu, meta si > 0)
--      meta_semanal con meta > 0: exceso = contado − meta
--      cantidad_fija / resto: exceso null
--      sobrestock = exceso ≥ u
--      descuento  = least(floor(exceso), Σ plantilla base activa del ítem), solo si hay sobrestock y el ítem está en la plantilla
create or replace function public.cerrar_conteo_fabrica(p_conteo_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_masas         numeric;
  v_definicion_id uuid;
  v_solicitud_id  uuid;
  v_umbral        numeric;
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

  select coalesce((select (valor #>> '{}')::numeric from compras_config where clave = 'sobrestock.umbral_unidades'), 1)
    into v_umbral;

  update fabrica_conteo_items fci set
    cantidad_por_masa   = ci.cantidad_por_masa,
    cantidad_por_unidad = ci.cantidad_por_unidad,
    redondeo            = ci.redondeo,
    modo_calculo        = dci.modo_calculo,
    meta                = dci.meta,
    cantidad_fija       = dci.cantidad_fija,
    necesidad           = ci.cantidad_por_masa * v_masas,
    sugerido            = case
                            when ci.redondeo = 'sin_calculo' then 0
                            when dci.modo_calculo = 'cantidad_fija' then dci.cantidad_fija
                            when dci.modo_calculo = 'meta_semanal' then greatest(0, dci.meta - fci.cantidad)
                            when dci.modo_calculo = 'por_masa' and ci.cantidad_por_unidad > 0 then greatest(
                              case ci.redondeo
                                when 'siempre_arriba' then
                                  ceil(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                when 'siempre_abajo' then
                                  floor(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                                else
                                  round(greatest(0, ci.cantidad_por_masa * v_masas - fci.cantidad * ci.cantidad_por_unidad) / ci.cantidad_por_unidad)
                              end,
                              case when dci.meta > 0 then greatest(0, dci.meta - fci.cantidad) else 0 end
                            )
                            else 0
                          end
  from compras_items ci
  join fabrica_conteo_definicion_items dci on dci.item_id = ci.id and dci.definicion_id = v_definicion_id
  where ci.id = fci.item_id and fci.conteo_id = p_conteo_id;

  update fabrica_conteo_items fci set
    exceso                  = x.exceso,
    sobrestock              = coalesce(x.exceso >= v_umbral, false),
    descuento_base_sugerido = case
                                when x.exceso >= v_umbral and x.en_base > 0 then least(floor(x.exceso), x.en_base)
                              end
  from (
    select
      f.id,
      round(case
        when f.redondeo = 'sin_calculo'
          or (f.modo_calculo = 'por_masa' and coalesce(f.cantidad_por_masa, 0) <= 0) then
          case when ci.stock_maximo is not null then f.cantidad - ci.stock_maximo end
        when f.modo_calculo = 'por_masa' and f.cantidad_por_unidad > 0 and v_masas > 0 then
          f.cantidad - greatest(f.necesidad / f.cantidad_por_unidad, case when f.meta > 0 then f.meta else 0 end)
        when f.modo_calculo = 'meta_semanal' and f.meta > 0 then
          f.cantidad - f.meta
      end, 2) as exceso,
      coalesce((select sum(pb.cantidad) from compras_plantilla_base pb
                where pb.item_id = f.item_id and pb.activo), 0) as en_base
    from fabrica_conteo_items f
    join compras_items ci on ci.id = f.item_id
    where f.conteo_id = p_conteo_id
      and f.modo_calculo is not null
  ) x
  where x.id = fci.id;

  update fabrica_conteos
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_conteo_id;

  insert into compras_solicitudes (conteo_id, tipo, estado, creado_por)
  values (p_conteo_id, 'complementario', 'abierta', auth.uid())
  returning id into v_solicitud_id;

  insert into compras_solicitud_items
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, stock_actual, orden)
  select v_solicitud_id, fci.item_id, cip.proveedor_id, ci.nombre, ci.unidad, fci.sugerido, fci.sugerido, fci.sugerido > 0, fci.cantidad, coalesce(dci.orden, 0)
  from fabrica_conteo_items fci
  join compras_items ci on ci.id = fci.item_id
  left join compras_item_proveedores cip on cip.item_id = ci.id and cip.es_principal
  left join fabrica_conteo_definicion_items dci on dci.item_id = fci.item_id and dci.definicion_id = v_definicion_id
  where fci.conteo_id = p_conteo_id;

  return v_solicitud_id;
end;
$$;

-- 6. generar_solicitud_base(): mismo cuerpo que en
--    20260903120000_pedido_base_orden.sql:56-85. Único cambio: después de
--    insertar las líneas, copia la sugerencia vigente (excluyendo la
--    solicitud recién creada, para que "la última base" sea la anterior).
--    cantidad_ajustada no se toca: la sugerencia la aplica Compras.
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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, orden)
  select v_solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad, cantidad, true, orden
  from compras_plantilla_base
  where activo
  order by orden;

  -- Si un ítem tiene varias líneas en la plantilla (por ejemplo, dos
  -- proveedores), la sugerencia va solo a la primera: así "Aplicar todas"
  -- nunca descuenta más de lo que sobra.
  update compras_solicitud_items csi set
    descuento_sugerido = least(s.descuento, csi.cantidad_sugerida),
    descuento_origen   = s.origen
  from compras_sugerencias_sobrestock(v_solicitud_id) s
  where csi.solicitud_id = v_solicitud_id
    and csi.item_id = s.item_id
    and csi.cantidad_sugerida > 0
    and csi.id = (
      select c2.id from compras_solicitud_items c2
      where c2.solicitud_id = v_solicitud_id and c2.item_id = s.item_id and c2.cantidad_sugerida > 0
      order by c2.orden, c2.id
      limit 1
    );

  return v_solicitud_id;
end;
$$;
