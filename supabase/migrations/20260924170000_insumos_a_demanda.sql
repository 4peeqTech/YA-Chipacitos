-- "A demanda" pasa a ser una marca explícita del insumo (decisión X2, opción A
-- del 24-09). Antes se deducía de redondeo = 'sin_calculo' o de un insumo por
-- masa sin receta: Marcos la cambiaba sin saberlo al tocar el redondeo.
--
--   * compras_items.a_demanda: se edita en la ficha de Insumos ("Se pide a
--     demanda"). Solo afecta el aviso de sobrestock: "Sin cálculo" sigue
--     decidiendo si el insumo entra al pedido complementario.
--   * Backfill con la regla vieja: en dev y en prod marca Leche en polvo, Sal y
--     Pategrás. Polvo de hornear queda sin marca (tiene receta).
--   * cerrar_conteo_fabrica usa la marca. Un insumo por masa sin receta y sin
--     la marca ya no avisa (antes habría salido siempre con sobrestock falso).

alter table public.compras_items
  add column if not exists a_demanda boolean not null default false;

comment on column public.compras_items.a_demanda is
  'Reposición a demanda: se pide según se necesite, no por proyección de masas. No avisa sobrestock salvo que tenga stock_maximo.';

update public.compras_items ci
  set a_demanda = true
  where ci.redondeo = 'sin_calculo'
     or (ci.cantidad_por_masa <= 0 and exists (
           select 1 from public.fabrica_conteo_definicion_items d
           where d.item_id = ci.id and d.activo and d.modo_calculo = 'por_masa'));

-- cerrar_conteo_fabrica(): mismo cuerpo que en
-- 20260924120000_fabrica_sobrestock.sql. Único cambio, en el cálculo del
-- exceso: la rama "a demanda" usa compras_items.a_demanda, y un insumo por
-- masa sin receta y sin la marca da exceso null.
-- Espejo en TS: lib/fabrica/calculoSugerido.ts (calcularSobrestock).
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
        when ci.a_demanda then
          case when ci.stock_maximo is not null then f.cantidad - ci.stock_maximo end
        when f.modo_calculo = 'por_masa' and coalesce(f.cantidad_por_masa, 0) <= 0 then
          null  -- por masa sin receta y sin la marca: no hay con qué comparar (Insumos lo avisa)
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
