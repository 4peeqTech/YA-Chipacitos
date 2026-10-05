-- A2b — Unidades de medida (Bloque 2, decisiones U1–U3). Plan: docs/bloque2/plan-A2b.md.
--
-- El insumo dice en qué se compra y se cuenta (compras_items.unidad, "Caja"),
-- cuánto trae cada una (cantidad_por_unidad, el contenido nominal: 16,5 kg) y
-- en qué unidad base se mide (unidad_base: kg | unidades | litros). Cada par
-- insumo–proveedor dice si cobra por unidad de compra o por unidad base
-- (compras_item_proveedores.cobra_por).
--
-- - El stock sigue en unidad de compra, con decimales (U3). Los kg reales del
--   remito y de la factura son información: NUNCA entran al ledger. El stock se
--   mueve solo con compras_mover_stock, siempre con `cantidad`.
-- - Cero triggers.
-- - La factura cobra kg × $/kg cuando la línea es precio_por = 'base'
--   (subtotal / iva generados con la expresión nueva, sin perder datos).
-- - Los eventos de remito (remito_creado / remito_editado / remito_eliminado)
--   siguen el contrato que parsea la app (lib/compras/historialPedido.ts):
--   el diff va en el primer nivel del detalle.
-- - RLS de solo lectura en remitos y facturas: se escriben solo por RPC.

-- ============================================================================
-- 3.1 Columnas y restricciones
-- ============================================================================

-- Insumo
alter table compras_items
  add column if not exists unidad_base text,
  add column if not exists cobra_por_default text not null default 'unidad';

comment on column compras_items.unidad is
  'Unidad de compra y de stock (Caja, Bolsa, Cajón…). El stock se cuenta en esta unidad, con decimales (U3).';
comment on column compras_items.cantidad_por_unidad is
  'Contenido nominal: cuánta unidad base trae 1 unidad de compra (1 Caja = 16,5 kg). Cada entrega real puede variar.';
comment on column compras_items.unidad_base is 'kg | unidades | litros. La unidad de la receta y de los kg reales.';
comment on column compras_items.cobra_por_default is
  'unidad | base. Con qué arranca un proveedor nuevo del insumo. La regla vigente es compras_item_proveedores.cobra_por.';

-- ============================================================================
-- 3.2 Datos: unidad_base inicial y lista de revisión (E16, E17)
-- ============================================================================

do $$
declare r record; v_mp boolean;
begin
  v_mp := exists (select 1 from compras_categorias where lower(btrim(nombre)) = 'materia prima');
  if not v_mp then
    raise notice 'A2b: no existe la categoría "Materia prima". Ningún insumo pasa a kg por categoría: revisá la lista.';
  end if;

  update compras_items i set unidad_base = case
      when i.unidad ~* '^\s*(kg|kgs|kilo|kilos|kilogramos?)\.?\s*$' or i.nombre ~* '\(\s*kg\s*\)' then 'kg'
      when i.unidad ~* '^\s*(l|lt|lts|litro|litros)\.?\s*$' then 'litros'
      when lower(btrim(c.nombre)) = 'materia prima' and i.nombre !~* 'huevo' then 'kg'
      else 'unidades'
    end
  from compras_items i2
  left join compras_categorias c on c.id = i2.categoria_id
  where i2.id = i.id and i.unidad_base is null;

  -- Lista de revisión manual.
  for r in select nombre, coalesce(unidad, '∅') u, cantidad_por_unidad cpu from compras_items
           where unidad_base = 'kg' order by nombre loop
    raise notice 'A2b revisar [kg]: % → 1 % = % kg', r.nombre, r.u, trim_scale(r.cpu);
  end loop;
  for r in select nombre, unidad_base from compras_items
           where nullif(btrim(unidad), '') is null order by nombre loop
    raise notice 'A2b revisar [sin unidad de compra]: % (base %)', r.nombre, r.unidad_base;
  end loop;
  for r in select nombre, unidad from compras_items
           where unidad_base <> 'unidades' and cantidad_por_unidad = 1
             and coalesce(unidad, '') !~* '^\s*(kg|kgs|kilo|kilos|l|lt|lts|litro|litros)\.?\s*$' order by nombre loop
    raise notice 'A2b revisar [contenido 1 con unidad que no es la base]: % (%)', r.nombre, coalesce(r.unidad, '∅');
  end loop;

  -- Chequeo pedido por el plan maestro: facturas confirmadas en kg sobre insumos en cajas.
  for r in
    select f.numero, f.estado, p.numero as pedido, i.nombre, fi.unidad as u_fact, i.unidad as u_item, fi.cantidad
    from compras_factura_items fi
    join compras_facturas f on f.id = fi.factura_id
    join compras_pedidos p on p.id = f.pedido_id
    join compras_items i on i.id = fi.item_id
    where f.estado <> 'anulada'
      and lower(btrim(coalesce(fi.unidad, ''))) is distinct from lower(btrim(coalesce(i.unidad, '')))
  loop
    raise notice 'A2b FACTURA EN OTRA UNIDAD: factura % (%; P-%) · % · facturado % % · el insumo se cuenta en %',
      r.numero, r.estado, lpad(r.pedido::text, 4, '0'), r.nombre, trim_scale(r.cantidad), coalesce(r.u_fact, '∅'), coalesce(r.u_item, '∅');
  end loop;
end $$;

alter table compras_items
  alter column unidad_base set not null,
  alter column unidad_base set default 'unidades',
  add constraint compras_items_unidad_base_valida check (unidad_base in ('kg', 'unidades', 'litros')),
  add constraint compras_items_cobra_por_default_valido check (cobra_por_default in ('unidad', 'base'));

-- Par insumo–proveedor (U2)
alter table compras_item_proveedores add column if not exists cobra_por text;
update compras_item_proveedores ip set cobra_por = i.cobra_por_default
  from compras_items i where i.id = ip.item_id and ip.cobra_por is null;
alter table compras_item_proveedores
  alter column cobra_por set not null,
  alter column cobra_por set default 'unidad',
  add constraint compras_item_proveedores_cobra_por_valido check (cobra_por in ('unidad', 'base'));
comment on column compras_item_proveedores.cobra_por is
  'unidad = precio_ref por unidad de compra ($/Caja); base = por unidad base ($/kg).';

-- Remito: kg reales (U1)
alter table compras_remito_items
  add column if not exists cantidad_base numeric,
  add constraint compras_remito_items_cantidad_base_positiva check (cantidad_base is null or cantidad_base > 0);
comment on column compras_remito_items.cantidad_base is
  'Kg (o la unidad base) reales de esta entrega. Informativo: el stock se mueve con cantidad.';

-- Factura
alter table compras_factura_items
  add column if not exists cantidad_base numeric,
  add column if not exists precio_por text not null default 'unidad',
  add constraint compras_factura_items_precio_por_valido check (precio_por in ('unidad', 'base')),
  add constraint compras_factura_items_cantidad_base_positiva check (cantidad_base is null or cantidad_base > 0),
  add constraint compras_factura_items_base_con_cantidad check (precio_por = 'unidad' or cantidad_base is not null);
comment on column compras_factura_items.cantidad_base is
  'Kg (o la unidad base) facturados. Obligatorio si precio_por = base.';
comment on column compras_factura_items.precio_por is
  'unidad = precio_unitario por unidad de compra; base = por unidad base (subtotal = cantidad_base × precio).';

-- ============================================================================
-- 3.3 subtotal e iva: nueva expresión sin perder datos (E4). PG ≥ 17.
-- ============================================================================

create temp table _a2b_totales as
  select factura_id, sum(subtotal) s, sum(iva) i from compras_factura_items group by factura_id;

alter table compras_factura_items
  alter column subtotal set expression as (
    round((case when precio_por = 'base' then cantidad_base else cantidad end) * precio_unitario, 2)),
  alter column iva set expression as (
    round(round((case when precio_por = 'base' then cantidad_base else cantidad end) * precio_unitario, 2) * alicuota_iva / 100, 2));

do $$
begin
  if exists (
    select 1 from _a2b_totales t
    join (select factura_id, sum(subtotal) s, sum(iva) i from compras_factura_items group by factura_id) n using (factura_id)
    where n.s <> t.s or n.i <> t.i
  ) then
    raise exception 'A2b: el recálculo de subtotal/iva cambió el total de alguna factura. No se aplica.';
  end if;
end $$;

drop table _a2b_totales;

-- ============================================================================
-- 3.4 RLS de solo lectura (E13): se escriben solo por RPC (security definer).
-- ============================================================================

drop policy if exists compras_remitos_acceso on compras_remitos;
drop policy if exists compras_remitos_lectura on compras_remitos;
create policy compras_remitos_lectura on compras_remitos for select using (tiene_acceso_compras());
drop policy if exists compras_remito_items_acceso on compras_remito_items;
drop policy if exists compras_remito_items_lectura on compras_remito_items;
create policy compras_remito_items_lectura on compras_remito_items for select using (tiene_acceso_compras());
drop policy if exists compras_facturas_admin on compras_facturas;
drop policy if exists compras_facturas_lectura on compras_facturas;
create policy compras_facturas_lectura on compras_facturas for select using (es_admin());
drop policy if exists compras_factura_items_admin on compras_factura_items;
drop policy if exists compras_factura_items_lectura on compras_factura_items;
create policy compras_factura_items_lectura on compras_factura_items for select using (es_admin());
revoke insert, update, delete, truncate on compras_remitos, compras_remito_items, compras_facturas, compras_factura_items
  from anon, authenticated;

-- ============================================================================
-- 3.5 Helpers
-- ============================================================================

-- Foto de las líneas de un remito (para eventos). Mismo formato que las Linea de B1 + kg.
create or replace function public.compras_lineas_remito_snapshot(p_remito_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ri.id, 'item_id', ri.item_id, 'pedido_item_id', ri.pedido_item_id,
           'descripcion', ri.descripcion,
           'unidad', coalesce(pi.unidad, i.unidad),
           'cantidad', ri.cantidad,
           'cantidad_base', ri.cantidad_base,
           'unidad_base', i.unidad_base
         ) order by pi.orden nulls last, ri.descripcion, ri.id), '[]'::jsonb)
  from compras_remito_items ri
  left join compras_pedido_items pi on pi.id = ri.pedido_item_id
  left join compras_items i on i.id = ri.item_id
  where ri.remito_id = p_remito_id;
$$;
revoke execute on function public.compras_lineas_remito_snapshot(uuid) from public, anon, authenticated;

-- E11. Diff de remito: el algoritmo de compras_diff_lineas (20261005140000) + cantidad_base.
-- No se expone (a diferencia de la de B1).
create or replace function public.compras_diff_lineas_remito(p_antes jsonb, p_despues jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_agregados jsonb;
  v_quitados  jsonb;
  v_cambiados jsonb;
  v_res       jsonb := '{}'::jsonb;
begin
  select jsonb_agg(d.x order by d.ord) into v_agregados
  from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) with ordinality d(x, ord)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) a(x) where a.x->>'id' = d.x->>'id'
  );

  select jsonb_agg(a.x order by a.ord) into v_quitados
  from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) with ordinality a(x, ord)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) d(x) where d.x->>'id' = a.x->>'id'
  );

  select jsonb_agg(d.x || jsonb_build_object('antes', jsonb_build_object(
           'cantidad', a.x->'cantidad', 'unidad', a.x->'unidad',
           'descripcion', a.x->'descripcion', 'item_id', a.x->'item_id',
           'cantidad_base', a.x->'cantidad_base'  -- A2b
         )) order by d.ord)
    into v_cambiados
  from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) with ordinality d(x, ord)
  join jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) a(x) on a.x->>'id' = d.x->>'id'
  where (a.x->>'cantidad')::numeric is distinct from (d.x->>'cantidad')::numeric
     or a.x->>'unidad'      is distinct from d.x->>'unidad'
     or a.x->>'descripcion' is distinct from d.x->>'descripcion'
     or a.x->>'item_id'     is distinct from d.x->>'item_id'
     or (a.x->>'cantidad_base')::numeric is distinct from (d.x->>'cantidad_base')::numeric;  -- A2b

  if v_agregados is not null then v_res := v_res || jsonb_build_object('agregados', v_agregados); end if;
  if v_quitados  is not null then v_res := v_res || jsonb_build_object('quitados',  v_quitados);  end if;
  if v_cambiados is not null then v_res := v_res || jsonb_build_object('cambiados', v_cambiados); end if;
  return v_res;
end;
$$;
revoke execute on function public.compras_diff_lineas_remito(jsonb, jsonb) from public, anon, authenticated;

-- Cómo cobra un proveedor un insumo: el par, o el default del insumo si no hay par.
create or replace function public._compras_cobra_por(p_item uuid, p_prov uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cobra_por from compras_item_proveedores where item_id = p_item and proveedor_id = p_prov),
    (select cobra_por_default from compras_items where id = p_item),
    'unidad');
$$;
revoke execute on function public._compras_cobra_por(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- 3.6 compras_guardar_insumo: cuerpo de 20261005150000:128-407 + unidades (A2b)
-- ============================================================================
-- p_proveedores: { proveedor_id, es_principal, activo, codigo_proveedor,
--                  precio_ref, precio_ref_anterior, cobra_por?, cobra_por_anterior? }

create or replace function public.compras_guardar_insumo(
  p_item_id     uuid  default null,
  p_datos       jsonb default '{}'::jsonb,
  p_proveedores jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campos constant text[] := array['nombre','unidad','categoria_id','cantidad_por_unidad','cantidad_por_masa',
                                    'stock_minimo','redondeo','stock_maximo','a_demanda','alicuota_iva',
                                    'unidad_base','cobra_por_default'];  -- A2b
  v_lote uuid := gen_random_uuid();
  v_id   uuid := p_item_id;
  v_old  compras_items%rowtype;
  v_new  compras_items%rowtype;
  v_k    text;
  v_nombre text; v_unidad text; v_cat uuid; v_cpu numeric; v_cpm numeric; v_smin numeric;
  v_red text; v_smax numeric; v_ademanda boolean; v_iva numeric;
  v_ub text; v_cpd text; v_cobra text; v_cobra_ant text; v_cpd_item text;  -- A2b
  v_otro_estado text;
  v_p jsonb;
  v_principal uuid;
  v_principal_activo boolean;
  v_par compras_item_proveedores%rowtype;
  v_prov_id uuid; v_prov_nombre text; v_prov_estado text;
  v_precio numeric; v_precio_ant numeric; v_codigo text; v_es_ppal boolean; v_activo boolean;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  -- 1. Claves
  p_datos := coalesce(p_datos, '{}'::jsonb);
  if jsonb_typeof(p_datos) <> 'object' then raise exception 'Los datos del insumo no son válidos.'; end if;
  for v_k in select jsonb_object_keys(p_datos) loop
    if not (v_k = any(v_campos)) then
      raise exception 'El campo "%" no se edita desde Insumos.', v_k;
    end if;
  end loop;

  -- 2. Valores presentes
  if p_datos ? 'nombre' then
    v_nombre := btrim(p_datos->>'nombre');
    if coalesce(v_nombre, '') = '' then raise exception 'El nombre es obligatorio.'; end if;
  end if;
  if p_datos ? 'unidad' then
    v_unidad := btrim(p_datos->>'unidad');
    if coalesce(v_unidad, '') = '' then raise exception 'La unidad de compra es obligatoria.'; end if;
  end if;
  if p_datos ? 'categoria_id' then
    v_cat := nullif(p_datos->>'categoria_id', '')::uuid;
    if v_cat is not null and not exists (select 1 from compras_categorias where id = v_cat) then
      raise exception 'Esa categoría no existe. Recargá la página.';
    end if;
  end if;
  if p_datos ? 'cantidad_por_unidad' then
    v_cpu := (p_datos->>'cantidad_por_unidad')::numeric;
    if v_cpu is null or v_cpu <= 0 then raise exception 'Lo que trae cada unidad tiene que ser mayor a 0.'; end if;
  end if;
  if p_datos ? 'cantidad_por_masa' then
    v_cpm := (p_datos->>'cantidad_por_masa')::numeric;
    if v_cpm is null or v_cpm < 0 then raise exception 'La cantidad por masa no puede ser negativa.'; end if;
  end if;
  if p_datos ? 'stock_minimo' then
    v_smin := (p_datos->>'stock_minimo')::numeric;
    if v_smin is null or v_smin < 0 then raise exception 'El stock mínimo no puede ser negativo.'; end if;
  end if;
  if p_datos ? 'redondeo' then
    v_red := p_datos->>'redondeo';
    if v_red is null or v_red not in ('estandar', 'siempre_arriba', 'siempre_abajo', 'sin_calculo') then
      raise exception 'Elegí un redondeo válido.';
    end if;
  end if;
  if p_datos ? 'stock_maximo' then
    v_smax := (p_datos->>'stock_maximo')::numeric;
    if v_smax is not null and v_smax <= 0 then raise exception 'El stock máximo tiene que ser mayor a 0, o quedar vacío.'; end if;
  end if;
  if p_datos ? 'a_demanda' then
    v_ademanda := (p_datos->>'a_demanda')::boolean;
    if v_ademanda is null then raise exception 'Indicá si el insumo se pide a demanda.'; end if;
  end if;
  if p_datos ? 'alicuota_iva' then
    v_iva := (p_datos->>'alicuota_iva')::numeric;
    if v_iva is null or v_iva not in (0, 2.5, 5, 10.5, 21, 27) then raise exception 'Elegí una alícuota de IVA válida.'; end if;
  end if;
  -- A2b
  if p_datos ? 'unidad_base' then
    v_ub := p_datos->>'unidad_base';
    if v_ub is null or v_ub not in ('kg', 'unidades', 'litros') then raise exception 'Elegí la unidad base: kg, unidades o litros.'; end if;
  end if;
  if p_datos ? 'cobra_por_default' then
    v_cpd := p_datos->>'cobra_por_default';
    if v_cpd is null or v_cpd not in ('unidad', 'base') then raise exception 'Elegí cómo se cobra por defecto.'; end if;
  end if;

  -- 3. Crear / editar
  if v_id is null then
    if v_nombre is null then raise exception 'El nombre es obligatorio.'; end if;
    if v_unidad is null then raise exception 'La unidad de compra es obligatoria.'; end if;
    if v_ub is null then raise exception 'Elegí la unidad base del insumo.'; end if;  -- A2b
    if p_proveedores is null or jsonb_typeof(p_proveedores) <> 'array' or jsonb_array_length(p_proveedores) = 0 then
      raise exception 'El insumo necesita al menos un proveedor activo.';
    end if;
  else
    -- A2b (E15): NO KEY UPDATE no choca con el KEY SHARE que toma el historial
    -- desde confirmar factura, y sigue serializando dos ediciones del insumo.
    select * into v_old from compras_items where id = v_id for no key update;
    if not found then raise exception 'No encontramos el insumo. Recargá la página.'; end if;
  end if;

  -- 4. Nombre único (sin distinguir mayúsculas ni espacios de los bordes)
  if v_nombre is not null then
    select estado into v_otro_estado from compras_items
    where lower(btrim(nombre)) = lower(v_nombre) and id is distinct from v_id
    limit 1;
    if found then
      if v_otro_estado = 'archivado' then
        raise exception 'Ya existe un insumo llamado "%" (archivado): reactivalo en lugar de crear otro.', v_nombre;
      end if;
      raise exception 'Ya existe un insumo llamado "%".', v_nombre;
    end if;
  end if;

  -- 5. Escribir el insumo
  if v_id is null then
    -- Los coalesce replican los defaults de la tabla.
    insert into compras_items (nombre, unidad, categoria_id, cantidad_por_unidad, cantidad_por_masa,
                               stock_minimo, redondeo, stock_maximo, a_demanda, alicuota_iva,
                               unidad_base, cobra_por_default)  -- A2b
    values (v_nombre, v_unidad, v_cat, coalesce(v_cpu, 1), coalesce(v_cpm, 0),
            coalesce(v_smin, 0), coalesce(v_red, 'estandar'), v_smax, coalesce(v_ademanda, false), coalesce(v_iva, 21),
            v_ub, coalesce(v_cpd, 'unidad'))
    returning * into v_new;
    v_id := v_new.id;
    perform _compras_item_hist(v_id, v_lote, 'creado', null, null, v_new.nombre);
  elsif p_datos <> '{}'::jsonb then
    update compras_items set
      nombre              = case when p_datos ? 'nombre'              then v_nombre   else nombre              end,
      unidad              = case when p_datos ? 'unidad'              then v_unidad   else unidad              end,
      categoria_id        = case when p_datos ? 'categoria_id'        then v_cat      else categoria_id        end,
      cantidad_por_unidad = case when p_datos ? 'cantidad_por_unidad' then v_cpu      else cantidad_por_unidad end,
      cantidad_por_masa   = case when p_datos ? 'cantidad_por_masa'   then v_cpm      else cantidad_por_masa   end,
      stock_minimo        = case when p_datos ? 'stock_minimo'        then v_smin     else stock_minimo        end,
      redondeo            = case when p_datos ? 'redondeo'            then v_red      else redondeo            end,
      stock_maximo        = case when p_datos ? 'stock_maximo'        then v_smax     else stock_maximo        end,
      a_demanda           = case when p_datos ? 'a_demanda'           then v_ademanda else a_demanda           end,
      alicuota_iva        = case when p_datos ? 'alicuota_iva'        then v_iva      else alicuota_iva        end,
      unidad_base         = case when p_datos ? 'unidad_base'         then v_ub       else unidad_base         end,  -- A2b
      cobra_por_default   = case when p_datos ? 'cobra_por_default'   then v_cpd      else cobra_por_default   end   -- A2b
    where id = v_id
    returning * into v_new;

    -- Se compara con el tipo real (numeric con numeric) y se guarda texto legible.
    insert into compras_items_historial (item_id, lote, campo, valor_anterior, valor_nuevo, creado_por)
    select v_id, v_lote, c.campo, c.ant, c.nue, auth.uid()
    from (values
      ('nombre',              v_old.nombre is distinct from v_new.nombre,                           v_old.nombre, v_new.nombre),
      ('unidad',              v_old.unidad is distinct from v_new.unidad,                           v_old.unidad, v_new.unidad),
      ('categoria',           v_old.categoria_id is distinct from v_new.categoria_id,
                              (select nombre from compras_categorias where id = v_old.categoria_id),
                              (select nombre from compras_categorias where id = v_new.categoria_id)),
      ('cantidad_por_unidad', v_old.cantidad_por_unidad is distinct from v_new.cantidad_por_unidad,
                              _compras_num_txt(v_old.cantidad_por_unidad), _compras_num_txt(v_new.cantidad_por_unidad)),
      ('cantidad_por_masa',   v_old.cantidad_por_masa is distinct from v_new.cantidad_por_masa,
                              _compras_num_txt(v_old.cantidad_por_masa), _compras_num_txt(v_new.cantidad_por_masa)),
      ('stock_minimo',        v_old.stock_minimo is distinct from v_new.stock_minimo,
                              _compras_num_txt(v_old.stock_minimo), _compras_num_txt(v_new.stock_minimo)),
      ('stock_maximo',        v_old.stock_maximo is distinct from v_new.stock_maximo,
                              _compras_num_txt(v_old.stock_maximo), _compras_num_txt(v_new.stock_maximo)),
      ('redondeo',            v_old.redondeo is distinct from v_new.redondeo,                       v_old.redondeo, v_new.redondeo),
      ('a_demanda',           v_old.a_demanda is distinct from v_new.a_demanda,
                              case when v_old.a_demanda then 'sí' else 'no' end,
                              case when v_new.a_demanda then 'sí' else 'no' end),
      ('alicuota_iva',        v_old.alicuota_iva is distinct from v_new.alicuota_iva,
                              _compras_num_txt(v_old.alicuota_iva), _compras_num_txt(v_new.alicuota_iva)),
      -- A2b: valores crudos; la pantalla los traduce.
      ('unidad_base',         v_old.unidad_base is distinct from v_new.unidad_base,             v_old.unidad_base,       v_new.unidad_base),
      ('cobra_por_default',   v_old.cobra_por_default is distinct from v_new.cobra_por_default, v_old.cobra_por_default, v_new.cobra_por_default)
    ) c(campo, cambio, ant, nue)
    where c.cambio;
  end if;

  -- 6. Proveedores
  if p_proveedores is not null then
    if jsonb_typeof(p_proveedores) <> 'array' then raise exception 'Los proveedores del insumo no son válidos.'; end if;
    if exists (select 1 from jsonb_array_elements(p_proveedores) e where nullif(e->>'proveedor_id', '') is null) then
      raise exception 'Elegí el proveedor de cada línea.';
    end if;
    if (select count(*) <> count(distinct e->>'proveedor_id') from jsonb_array_elements(p_proveedores) e) then
      raise exception 'Hay un proveedor repetido.';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_proveedores) e
                   where coalesce((e->>'activo')::boolean, true)) then
      raise exception 'El insumo necesita al menos un proveedor activo.';
    end if;
    if (select count(*) from jsonb_array_elements(p_proveedores) e
        where coalesce((e->>'es_principal')::boolean, false)) <> 1 then
      raise exception 'Marcá un solo proveedor principal (la estrella).';
    end if;
    select (e->>'proveedor_id')::uuid, coalesce((e->>'activo')::boolean, true)
      into v_principal, v_principal_activo
    from jsonb_array_elements(p_proveedores) e
    where coalesce((e->>'es_principal')::boolean, false);
    if not v_principal_activo then raise exception 'El proveedor principal tiene que estar activo.'; end if;

    select cobra_por_default into v_cpd_item from compras_items where id = v_id;  -- A2b

    -- 6.2 Quitados (están en la base y no vienen en el array)
    for v_par in
      select cip.* from compras_item_proveedores cip
      where cip.item_id = v_id
        and not exists (select 1 from jsonb_array_elements(p_proveedores) e
                        where (e->>'proveedor_id')::uuid = cip.proveedor_id)
      order by cip.created_at
      for update
    loop
      select nombre into v_prov_nombre from proveedores where id = v_par.proveedor_id;
      if _compras_par_tiene_historia(v_id, v_par.proveedor_id) then
        update compras_item_proveedores set activo = false, es_principal = false where id = v_par.id;
        perform _compras_item_hist(v_id, v_lote, 'proveedor.activo', v_par.proveedor_id,
                                   case when v_par.activo then 'sí' else 'no' end, 'no');
        perform _compras_item_hist(v_id, v_lote, 'proveedor.principal', v_par.proveedor_id,
                                   case when v_par.es_principal then 'sí' else 'no' end, 'no');
      else
        delete from compras_item_proveedores where id = v_par.id;
        perform _compras_item_hist(v_id, v_lote, 'proveedor', v_par.proveedor_id, v_prov_nombre, null);
      end if;
    end loop;

    -- 6.3 Apagar las estrellas que dejan de ser principales antes de prender
    -- la nueva (si no, choca con el índice único parcial).
    for v_par in
      update compras_item_proveedores set es_principal = false
      where item_id = v_id and es_principal and proveedor_id <> v_principal
      returning *
    loop
      perform _compras_item_hist(v_id, v_lote, 'proveedor.principal', v_par.proveedor_id, 'sí', 'no');
    end loop;

    -- 6.4 Cada elemento
    for v_p in select e from jsonb_array_elements(p_proveedores) e loop
      v_prov_id    := (v_p->>'proveedor_id')::uuid;
      v_es_ppal    := coalesce((v_p->>'es_principal')::boolean, false);
      v_activo     := coalesce((v_p->>'activo')::boolean, true);
      v_codigo     := nullif(btrim(v_p->>'codigo_proveedor'), '');
      v_precio     := (v_p->>'precio_ref')::numeric;
      v_precio_ant := (v_p->>'precio_ref_anterior')::numeric;
      v_cobra      := nullif(v_p->>'cobra_por', '');           -- A2b
      v_cobra_ant  := nullif(v_p->>'cobra_por_anterior', '');  -- A2b
      if v_precio is not null and v_precio < 0 then
        raise exception 'El precio de referencia no puede ser negativo.';
      end if;
      if v_cobra is not null and v_cobra not in ('unidad', 'base') then
        raise exception 'Cobra por: elegí % o la unidad base.', 'la unidad de compra';
      end if;

      select nombre, estado into v_prov_nombre, v_prov_estado from proveedores where id = v_prov_id;

      select * into v_par from compras_item_proveedores
      where item_id = v_id and proveedor_id = v_prov_id
      for update;

      if not found then
        if v_prov_estado is distinct from 'activo' then
          raise exception 'Ese proveedor no existe o está archivado.';
        end if;
        insert into compras_item_proveedores (item_id, proveedor_id, es_principal, activo, precio_ref, codigo_proveedor, cobra_por)
        values (v_id, v_prov_id, v_es_ppal, v_activo, v_precio, v_codigo, coalesce(v_cobra, v_cpd_item));
        perform _compras_item_hist(v_id, v_lote, 'proveedor', v_prov_id, null, v_prov_nombre);
        perform _compras_item_hist(v_id, v_lote, 'proveedor.cobra_por', v_prov_id, null, coalesce(v_cobra, v_cpd_item));  -- A2b
        perform _compras_item_hist(v_id, v_lote, 'proveedor.precio_ref', v_prov_id, null, _compras_num_txt(v_precio));
      else
        -- A2b: cobra_por antes que precio_ref, así el historial queda "Cobra por" y después "Precio ref.".
        if v_cobra is not null and v_cobra is distinct from v_par.cobra_por then
          if v_cobra_ant is distinct from v_par.cobra_por then
            raise exception 'Cómo cobra % cambió mientras editabas (lo cambió una factura). Recargá la página.',
              coalesce(v_prov_nombre, 'el proveedor');
          end if;
          update compras_item_proveedores set cobra_por = v_cobra where id = v_par.id;
          perform _compras_item_hist(v_id, v_lote, 'proveedor.cobra_por', v_prov_id, v_par.cobra_por, v_cobra);
        end if;
        -- precio_ref: solo si el usuario lo tocó (E2).
        if v_precio is distinct from v_precio_ant then
          if v_par.precio_ref is distinct from v_precio_ant then
            raise exception 'El precio de referencia de % cambió mientras editabas (ahora %). Recargá la página y volvé a intentar.',
              v_prov_nombre, coalesce(_compras_num_txt(v_par.precio_ref), 'sin precio');
          end if;
          update compras_item_proveedores set precio_ref = v_precio where id = v_par.id;
          perform _compras_item_hist(v_id, v_lote, 'proveedor.precio_ref', v_prov_id,
                                     _compras_num_txt(v_par.precio_ref), _compras_num_txt(v_precio));
        end if;
        if v_codigo is distinct from v_par.codigo_proveedor then
          update compras_item_proveedores set codigo_proveedor = v_codigo where id = v_par.id;
          perform _compras_item_hist(v_id, v_lote, 'proveedor.codigo', v_prov_id, v_par.codigo_proveedor, v_codigo);
        end if;
        if v_activo is distinct from v_par.activo then
          if v_activo and v_prov_estado is distinct from 'activo' then
            raise exception 'El proveedor % está archivado: no se puede volver a usar.', coalesce(v_prov_nombre, '');
          end if;
          update compras_item_proveedores set activo = v_activo where id = v_par.id;
          perform _compras_item_hist(v_id, v_lote, 'proveedor.activo', v_prov_id,
                                     case when v_par.activo then 'sí' else 'no' end,
                                     case when v_activo then 'sí' else 'no' end);
        end if;
        if v_es_ppal is distinct from v_par.es_principal then
          update compras_item_proveedores set es_principal = v_es_ppal where id = v_par.id;
          perform _compras_item_hist(v_id, v_lote, 'proveedor.principal', v_prov_id,
                                     case when v_par.es_principal then 'sí' else 'no' end,
                                     case when v_es_ppal then 'sí' else 'no' end);
        end if;
      end if;
    end loop;
  end if;

  -- 7. Respuesta
  return jsonb_build_object(
    'item_id', v_id,
    'cambios', (select count(*) from compras_items_historial where lote = v_lote));
end $$;
revoke execute on function public.compras_guardar_insumo(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.compras_guardar_insumo(uuid, jsonb, jsonb) to authenticated;

-- ============================================================================
-- 3.7 compras_guardar_remito: cuerpo de 20260930180000:13-211 + kg + eventos (A2b)
-- ============================================================================
-- p_items: [{id?, pedido_item_id?, item_id?, descripcion, cantidad, cantidad_base?}]

create or replace function public.compras_guardar_remito(
  p_remito_id uuid default null,
  p_pedido_id uuid default null,
  p_fecha date default null,
  p_items jsonb default '[]'::jsonb,
  p_numero text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id   uuid;
  v_pedido      compras_pedidos%rowtype;
  v_remito      compras_remitos%rowtype;
  v_es_nuevo    boolean := p_remito_id is null;
  v_codigo      text;
  v_ids         uuid[];
  v_antes       jsonb;
  v_linea       record;
  v_item_id     uuid;
  v_pi_id       uuid;
  v_mov         record;
  v_despues     numeric;
  v_impacto     jsonb := '[]'::jsonb;
  -- A2b
  v_snap_antes   jsonb;
  v_fecha_antes  date;
  v_numero_antes text;
  v_det          jsonb;
  v_base         numeric;
  v_cambios      boolean := true;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas del remito vienen mal armadas. Recargá la página.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha del remito.';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Cargá al menos una línea con cantidad.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, 0) <= 0
  ) then
    raise exception 'Cada línea necesita una descripción y una cantidad mayor a 0.';
  end if;
  -- A2b
  if exists (select 1 from jsonb_array_elements(p_items) e
             where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
    raise exception 'Los kg reales tienen que ser mayores a 0 (o quedar vacíos).';
  end if;

  -- Pedido primero (orden de bloqueo), después el remito.
  if v_es_nuevo then
    v_pedido_id := p_pedido_id;
    if v_pedido_id is null then
      raise exception 'Elegí el pedido al que corresponde el remito.';
    end if;
  else
    select pedido_id into v_pedido_id from compras_remitos where id = p_remito_id;
    if not found then
      raise exception 'No encontramos el remito. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    if p_pedido_id is not null and p_pedido_id <> v_pedido_id then
      raise exception 'Un remito no se puede pasar a otro pedido: eliminalo y cargalo en el correcto.';
    end if;
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Puede que alguien lo haya borrado: recargá la página.';
  end if;
  if v_pedido.estado_recepcion = 'sin_enviar' then
    raise exception 'El pedido % todavía no se envió: marcalo como enviado antes de cargar un remito.',
      'P-' || lpad(v_pedido.numero::text, 4, '0');
  end if;

  if v_es_nuevo then
    -- El pedido está bloqueado: el contador no se pisa entre dos cargas.
    update compras_pedidos
      set ultima_secuencia_remito = greatest(
        ultima_secuencia_remito,
        (select coalesce(max(secuencia), 0) from compras_remitos where pedido_id = v_pedido.id)
      ) + 1
      where id = v_pedido.id
      returning ultima_secuencia_remito into v_pedido.ultima_secuencia_remito;
    insert into compras_remitos (pedido_id, secuencia, fecha, numero, creado_por)
    values (v_pedido.id, v_pedido.ultima_secuencia_remito, p_fecha, nullif(btrim(p_numero), ''), auth.uid())
    returning * into v_remito;
  else
    select * into v_remito from compras_remitos where id = p_remito_id for update;
    if not found then
      raise exception 'No encontramos el remito. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    -- A2b: la foto de antes, para el evento.
    v_fecha_antes := v_remito.fecha;
    v_numero_antes := v_remito.numero;
    v_snap_antes := compras_lineas_remito_snapshot(v_remito.id);
    update compras_remitos set fecha = p_fecha, numero = nullif(btrim(p_numero), '') where id = v_remito.id;
  end if;

  v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');

  -- Ids de líneas que se conservan (tienen que ser de este remito).
  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(p_items) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_remito_items ri where ri.id = x.id and ri.remito_id = v_remito.id)
  ) then
    raise exception 'Alguien cambió este remito mientras lo editabas. Recargá la página.';
  end if;

  -- Lo que el remito sumaba por insumo antes de este guardado.
  select coalesce(jsonb_object_agg(item_id, total), '{}'::jsonb)
    into v_antes
  from (
    select item_id, sum(cantidad) as total
    from compras_remito_items
    where remito_id = v_remito.id and item_id is not null
    group by item_id
  ) s;

  delete from compras_remito_items ri
  where ri.remito_id = v_remito.id and ri.id <> all (v_ids);

  for v_linea in
    select e from jsonb_array_elements(p_items) as t(e)
  loop
    v_pi_id := nullif(v_linea.e->>'pedido_item_id', '')::uuid;
    if v_pi_id is not null then
      select pi.item_id into v_item_id
      from compras_pedido_items pi
      where pi.id = v_pi_id and pi.pedido_id = v_pedido.id;
      if not found then
        raise exception 'Una línea del pedido ya no existe (alguien editó el pedido). Recargá la página.';
      end if;
    else
      v_item_id := nullif(v_linea.e->>'item_id', '')::uuid;
      if v_item_id is not null and not exists (select 1 from compras_items where id = v_item_id) then
        raise exception 'Uno de los insumos elegidos ya no existe. Recargá la página.';
      end if;
    end if;

    -- A2b: kg reales, solo en líneas con insumo.
    v_base := nullif(v_linea.e->>'cantidad_base', '')::numeric;
    if v_base is not null and v_item_id is null then
      raise exception 'Los kg reales van solo en líneas con insumo ("%").', btrim(v_linea.e->>'descripcion');
    end if;

    if nullif(v_linea.e->>'id', '') is not null then
      update compras_remito_items
        set pedido_item_id = v_pi_id,
            item_id = v_item_id,
            descripcion = btrim(v_linea.e->>'descripcion'),
            cantidad = (v_linea.e->>'cantidad')::numeric,
            cantidad_base = v_base  -- A2b
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad, cantidad_base)
      values (v_remito.id, v_pi_id, v_item_id, btrim(v_linea.e->>'descripcion'), (v_linea.e->>'cantidad')::numeric, v_base);
    end if;
  end loop;

  -- Reconciliación por diferencia, insumo por insumo (en unidad de compra, nunca kg).
  for v_mov in
    select coalesce(n.item_id, a.item_id) as item_id,
           coalesce(n.total, 0) - coalesce(a.total, 0) as delta
    from (
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    ) n
    full join (
      select key::uuid as item_id, value::numeric as total from jsonb_each_text(v_antes)
    ) a on a.item_id = n.item_id
  loop
    continue when v_mov.delta = 0;
    perform compras_mover_stock(
      v_mov.item_id,
      v_mov.delta,
      case when v_mov.delta > 0 then 'entrada_remito' else 'salida_remito_anulado' end,
      case when v_es_nuevo then 'Remito ' || v_codigo else 'Remito ' || v_codigo || ' editado' end,
      v_remito.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
    v_impacto := v_impacto || jsonb_build_object(
      'item_id', v_mov.item_id,
      'nombre', (select nombre from compras_items where id = v_mov.item_id),
      'unidad', (select unidad from compras_items where id = v_mov.item_id),
      'delta', v_mov.delta,
      'cantidad_despues', v_despues
    );
  end loop;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  -- F5: un remito que llega después de la factura (FA2, R3) mueve sus diferencias.
  perform compras_recalcular_diferencias_factura(f.id)
  from compras_facturas f
  where f.pedido_id = v_pedido.id and f.tipo_comprobante = 'factura' and f.estado = 'confirmada';

  -- A2b (E10): eventos con el contrato del parser de B1.
  if v_es_nuevo then
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_creado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', p_fecha, 'origen', 'manual',
      'numero', nullif(btrim(p_numero), ''), 'lineas', compras_lineas_remito_snapshot(v_remito.id)));
  else
    v_det := compras_diff_lineas_remito(v_snap_antes, compras_lineas_remito_snapshot(v_remito.id));
    if v_fecha_antes is distinct from p_fecha then
      v_det := v_det || jsonb_build_object('fecha', jsonb_build_object('de', v_fecha_antes, 'a', p_fecha));
    end if;
    if v_numero_antes is distinct from nullif(btrim(p_numero), '') then
      v_det := v_det || jsonb_build_object('numero', jsonb_build_object('de', v_numero_antes, 'a', nullif(btrim(p_numero), '')));
    end if;
    v_cambios := v_det <> '{}'::jsonb;
    if v_cambios then
      perform compras_registrar_evento_pedido(v_pedido.id, 'remito_editado',
        v_det || jsonb_build_object('remito_id', v_remito.id, 'secuencia', v_remito.secuencia));
    end if;
  end if;

  return jsonb_build_object(
    'id', v_remito.id,
    'secuencia', v_remito.secuencia,
    'codigo', v_codigo,
    'impacto', v_impacto,
    'cambios', v_cambios  -- A2b
  );
end;
$$;

revoke execute on function public.compras_guardar_remito(uuid, uuid, date, jsonb, text) from public, anon;
grant execute on function public.compras_guardar_remito(uuid, uuid, date, jsonb, text) to authenticated;

-- ============================================================================
-- 3.8 compras_eliminar_remito: cuerpo de 20260928190000:249-314 + evento (A2b)
-- ============================================================================

create or replace function public.compras_eliminar_remito(p_remito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_pedido    compras_pedidos%rowtype;
  v_remito    compras_remitos%rowtype;
  v_codigo    text;
  v_mov       record;
  v_despues   numeric;
  v_impacto   jsonb := '[]'::jsonb;
  v_snap      jsonb;  -- A2b
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select pedido_id into v_pedido_id from compras_remitos where id = p_remito_id;
  if not found then
    raise exception 'No encontramos el remito. Puede que alguien ya lo haya borrado: recargá la página.';
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_remito from compras_remitos where id = p_remito_id for update;
  if not found then
    raise exception 'No encontramos el remito. Puede que alguien ya lo haya borrado: recargá la página.';
  end if;

  if v_pedido.estado_facturacion = 'facturado' then
    raise exception 'El pedido % está facturado. Anulá la factura primero.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
  end if;

  v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');

  for v_mov in
    select item_id, sum(cantidad) as total
    from compras_remito_items
    where remito_id = v_remito.id and item_id is not null
    group by item_id
  loop
    continue when v_mov.total = 0;
    perform compras_mover_stock(
      v_mov.item_id, -v_mov.total, 'salida_remito_anulado',
      'Remito ' || v_codigo || ' eliminado', v_remito.id
    );
    select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
    v_impacto := v_impacto || jsonb_build_object(
      'item_id', v_mov.item_id,
      'nombre', (select nombre from compras_items where id = v_mov.item_id),
      'unidad', (select unidad from compras_items where id = v_mov.item_id),
      'delta', -v_mov.total,
      'cantidad_despues', v_despues
    );
  end loop;

  v_snap := compras_lineas_remito_snapshot(v_remito.id);  -- A2b

  -- remito_items se borran en cascada; los movimientos quedan (remito_id → null)
  -- y el motivo conserva el código.
  delete from compras_remitos where id = v_remito.id;

  -- A2b (E10)
  perform compras_registrar_evento_pedido(v_pedido.id, 'remito_eliminado', jsonb_build_object(
    'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha,
    'numero', v_remito.numero, 'origen', v_remito.origen, 'motivo', null, 'lineas', v_snap));

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('codigo', v_codigo, 'impacto', v_impacto);
end;
$$;

revoke execute on function public.compras_eliminar_remito(uuid) from public, anon;
grant execute on function public.compras_eliminar_remito(uuid) to authenticated;

-- ============================================================================
-- 3.9 compras_guardar_factura: cuerpo de 20260928190000:322-520 + kg y precio_por (A2b)
-- ============================================================================
-- p_items: [{id?, pedido_item_id?, item_id?, descripcion, unidad?, cantidad,
--            precio_unitario, alicuota_iva, cantidad_base?, precio_por?}]

create or replace function public.compras_guardar_factura(
  p_factura_id uuid default null,
  p_pedido_id uuid default null,
  p_numero text default null,
  p_fecha date default null,
  p_vencimiento date default null,
  p_total_papel numeric default null,
  p_observaciones text default null,
  p_items jsonb default '[]'::jsonb,
  p_ids_conocidos uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_ids        uuid[];
  v_linea      record;
  v_pi_id      uuid;
  v_item_id    uuid;
  v_existente  record;
  v_precio_por text;     -- A2b
  v_base       numeric;  -- A2b
  v_ub         text;     -- A2b
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cargar facturas.';
  end if;
  if nullif(btrim(p_numero), '') is null or regexp_replace(p_numero, '[^0-9]', '', 'g') = '' then
    raise exception 'Cargá el número de la factura, tal como figura en el papel.';
  end if;
  if p_fecha is null then
    raise exception 'Elegí la fecha de la factura.';
  end if;
  if p_vencimiento is not null and p_vencimiento < p_fecha then
    raise exception 'El vencimiento no puede ser anterior a la fecha de la factura.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas de la factura vienen mal armadas. Recargá la página.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, -1) < 0
       or coalesce((e->>'precio_unitario')::numeric, -1) < 0
  ) then
    raise exception 'Cada línea necesita descripción, cantidad y precio (0 o más).';
  end if;
  -- A2b
  if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
             where coalesce(nullif(e->>'precio_por', ''), 'unidad') not in ('unidad', 'base')) then
    raise exception 'Las líneas de la factura vienen mal armadas. Recargá la página.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
             where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
    raise exception 'Los kg tienen que ser mayores a 0 (o quedar vacíos).';
  end if;

  -- Pedido primero (orden de bloqueo), después la factura.
  if p_factura_id is null then
    v_pedido_id := p_pedido_id;
    if v_pedido_id is null then
      raise exception 'Elegí el pedido al que corresponde la factura.';
    end if;
  else
    select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
    if not found then
      raise exception 'No encontramos la factura. Puede que alguien la haya descartado: recargá la página.';
    end if;
    if p_pedido_id is not null and p_pedido_id <> v_pedido_id then
      raise exception 'Una factura no se puede pasar a otro pedido: descartala y cargala en el correcto.';
    end if;
  end if;

  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  if v_pedido.estado_recepcion = 'sin_enviar' then
    raise exception 'El pedido % todavía no se envió: no se le puede cargar factura.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
  end if;

  -- Número repetido para el proveedor (FA3): mensaje con el pedido de la otra.
  select f.id, p.numero as pedido_numero into v_existente
  from compras_facturas f
  join compras_pedidos p on p.id = f.pedido_id
  where f.proveedor_id = v_pedido.proveedor_id
    and f.tipo_comprobante = 'factura'
    and f.estado <> 'anulada'
    and f.numero_normalizado = regexp_replace(p_numero, '[^0-9]', '', 'g')
    and f.id is distinct from p_factura_id
  limit 1;
  if found then
    raise exception 'Ya cargaste la factura % de este proveedor (pedido %).',
      btrim(p_numero), 'P-' || lpad(v_existente.pedido_numero::text, 4, '0');
  end if;

  if p_factura_id is null then
    if exists (
      select 1 from compras_facturas
      where pedido_id = v_pedido.id and tipo_comprobante = 'factura' and estado <> 'anulada'
    ) then
      raise exception 'El pedido % ya tiene una factura cargada. Abrila desde la lista de facturas.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    insert into compras_facturas (pedido_id, proveedor_id, numero, fecha, fecha_vencimiento, total_papel, observaciones, creado_por)
    values (v_pedido.id, v_pedido.proveedor_id, btrim(p_numero), p_fecha, p_vencimiento, p_total_papel,
            nullif(btrim(p_observaciones), ''), auth.uid())
    returning * into v_factura;
  else
    select * into v_factura from compras_facturas where id = p_factura_id for update;
    if v_factura.estado <> 'borrador' then
      raise exception 'La factura ya está %: no se puede editar.', case v_factura.estado when 'confirmada' then 'confirmada (anulala para corregirla)' else 'anulada' end;
    end if;
    update compras_facturas
      set numero = btrim(p_numero),
          fecha = p_fecha,
          fecha_vencimiento = p_vencimiento,
          total_papel = p_total_papel,
          observaciones = nullif(btrim(p_observaciones), '')
      where id = v_factura.id;
  end if;

  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_factura_items fi where fi.id = x.id and fi.factura_id = v_factura.id)
  ) then
    raise exception 'Alguien cambió esta factura mientras la editabas. Recargá la página.';
  end if;

  -- Lo que no viene en p_items se borra. Eso es correcto solo si la pantalla
  -- tenía TODAS las líneas: si cargó de menos (por un tope de filas, por
  -- ejemplo) borraría líneas que el usuario nunca vio. p_ids_conocidos son las
  -- líneas que la pantalla tenía al abrir; si alguna existente no está ahí,
  -- frenamos antes de borrar nada.
  if p_ids_conocidos is not null and exists (
    select 1 from compras_factura_items fi
    where fi.factura_id = v_factura.id and fi.id <> all (p_ids_conocidos)
  ) then
    raise exception 'Esta factura tiene líneas que no se cargaron en pantalla. Recargá la página antes de guardar.';
  end if;

  delete from compras_factura_items fi where fi.factura_id = v_factura.id and fi.id <> all (v_ids);

  for v_linea in
    select e, (ord - 1)::int as orden
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord)
  loop
    v_pi_id := nullif(v_linea.e->>'pedido_item_id', '')::uuid;
    if v_pi_id is not null then
      select pi.item_id into v_item_id from compras_pedido_items pi where pi.id = v_pi_id and pi.pedido_id = v_pedido.id;
      if not found then
        raise exception 'Una línea del pedido ya no existe (alguien editó el pedido). Recargá la página.';
      end if;
    else
      v_item_id := nullif(v_linea.e->>'item_id', '')::uuid;
    end if;

    -- A2b: cajas + kg. Por kg exige insumo, kg y cajas.
    v_precio_por := coalesce(nullif(v_linea.e->>'precio_por', ''), 'unidad');
    v_base := nullif(v_linea.e->>'cantidad_base', '')::numeric;
    v_ub := coalesce((select case unidad_base when 'litros' then 'litros' when 'unidades' then 'unidades' else 'kg' end
                      from compras_items where id = v_item_id), 'kg');
    if v_precio_por = 'base' then
      if v_item_id is null then
        raise exception '"%" no tiene insumo: no se puede cobrar por kg.', btrim(v_linea.e->>'descripcion');
      end if;
      if v_base is null then
        raise exception 'Cargá los % de "%": ese proveedor lo cobra por %.', v_ub, btrim(v_linea.e->>'descripcion'), v_ub;
      end if;
      if (v_linea.e->>'cantidad')::numeric <= 0 then
        raise exception 'Cargá cuántas unidades llegaron de "%" (además de los %).', btrim(v_linea.e->>'descripcion'), v_ub;
      end if;
    end if;
    if v_base is not null and v_item_id is null then
      raise exception 'Los kg van solo en líneas con insumo ("%").', btrim(v_linea.e->>'descripcion');
    end if;

    if nullif(v_linea.e->>'id', '') is not null then
      update compras_factura_items
        set pedido_item_id = v_pi_id,
            item_id = v_item_id,
            descripcion = btrim(v_linea.e->>'descripcion'),
            unidad = nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
            cantidad = (v_linea.e->>'cantidad')::numeric,
            precio_unitario = (v_linea.e->>'precio_unitario')::numeric,
            alicuota_iva = coalesce((v_linea.e->>'alicuota_iva')::numeric, 21),
            orden = v_linea.orden,
            cantidad_base = v_base,     -- A2b
            precio_por = v_precio_por   -- A2b
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_factura_items (factura_id, pedido_item_id, item_id, descripcion, unidad, cantidad, precio_unitario, alicuota_iva, orden,
                                         cantidad_base, precio_por)  -- A2b
      values (
        v_factura.id, v_pi_id, v_item_id, btrim(v_linea.e->>'descripcion'),
        nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
        (v_linea.e->>'cantidad')::numeric,
        (v_linea.e->>'precio_unitario')::numeric,
        coalesce((v_linea.e->>'alicuota_iva')::numeric, 21),
        v_linea.orden,
        v_base, v_precio_por
      );
    end if;
  end loop;

  update compras_facturas f
    set subtotal = t.subtotal, iva = t.iva, total = t.subtotal + t.iva
    from (
      select coalesce(sum(subtotal), 0) as subtotal, coalesce(sum(iva), 0) as iva
      from compras_factura_items where factura_id = v_factura.id
    ) t
    where f.id = v_factura.id;

  -- 'items' vuelven en el orden en que se mandaron: la pantalla los pega a sus
  -- líneas, así un segundo guardado las actualiza en vez de duplicarlas.
  return (
    select jsonb_build_object(
      'id', f.id, 'subtotal', f.subtotal, 'iva', f.iva, 'total', f.total,
      'items', coalesce((
        select jsonb_agg(fi.id order by fi.orden)
        from compras_factura_items fi where fi.factura_id = f.id
      ), '[]'::jsonb)
    )
    from compras_facturas f where f.id = v_factura.id
  );
end;
$$;

revoke execute on function public.compras_guardar_factura(uuid, uuid, text, date, date, numeric, text, jsonb, uuid[]) from public, anon;
grant execute on function public.compras_guardar_factura(uuid, uuid, text, date, date, numeric, text, jsonb, uuid[]) to authenticated;

-- ============================================================================
-- 3.10 compras_confirmar_factura: cuerpo de 20260929120000:752-931
--      + kg en el remito automático, precios con su cobra_por y evento (A2b)
-- ============================================================================

create or replace function public.compras_confirmar_factura(
  p_factura_id uuid default null,
  p_mercaderia_llego boolean default null,
  p_actualizar_precios boolean default false,
  p_gasto_existente_id uuid default null,
  p_gasto_local text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id  uuid;
  v_pedido     compras_pedidos%rowtype;
  v_factura    compras_facturas%rowtype;
  v_remito     compras_remitos%rowtype;
  v_gasto      gastos%rowtype;
  v_codigo     text;
  v_codigo_ped text;
  v_tiene_rem  boolean;
  v_mov        record;
  v_despues    numeric;
  v_impacto    jsonb := '[]'::jsonb;
  v_gasto_id   uuid;
  v_generado   boolean := false;
  v_local      text;
  -- A2b
  v_lote       uuid := gen_random_uuid();
  v_precio     record;
  v_par        compras_item_proveedores%rowtype;
  v_precios    int := 0;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede confirmar facturas.';
  end if;

  select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
  if not found then
    raise exception 'No encontramos la factura. Recargá la página.';
  end if;
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = p_factura_id for update;
  v_codigo_ped := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if v_factura.estado <> 'borrador' then
    raise exception 'La factura ya está %.', v_factura.estado;
  end if;
  if not exists (select 1 from compras_factura_items where factura_id = v_factura.id) then
    raise exception 'La factura no tiene líneas.';
  end if;

  -- El gasto se valida antes de mover stock: si falla, no queda nada a medias.
  if p_gasto_existente_id is not null then
    select * into v_gasto from gastos where id = p_gasto_existente_id for update;
    if not found then
      raise exception 'Ese gasto ya no existe. Recargá la página y elegí de nuevo.';
    end if;
    if v_gasto.proveedor_id is distinct from v_factura.proveedor_id then
      raise exception 'Ese gasto es de otro proveedor: no se puede vincular a esta factura.';
    end if;
    if exists (select 1 from compras_facturas where gasto_id = v_gasto.id) then
      raise exception 'Ese gasto ya está vinculado a otra factura. Recargá la página y elegí de nuevo.';
    end if;
  else
    v_local := coalesce(
      nullif(btrim(p_gasto_local), ''),
      (select valor #>> '{}' from compras_config where clave = 'gasto.local'),
      'YA! FABRICA'
    );
  end if;

  v_tiene_rem := exists (select 1 from compras_remitos where pedido_id = v_pedido.id);
  if not v_tiene_rem and p_mercaderia_llego is null then
    raise exception 'El pedido no tiene remitos: contanos si la mercadería ya llegó.';
  end if;

  if not v_tiene_rem and p_mercaderia_llego then
    update compras_pedidos
      set ultima_secuencia_remito = greatest(
        ultima_secuencia_remito,
        (select coalesce(max(secuencia), 0) from compras_remitos where pedido_id = v_pedido.id)
      ) + 1
      where id = v_pedido.id
      returning ultima_secuencia_remito into v_pedido.ultima_secuencia_remito;

    insert into compras_remitos (pedido_id, secuencia, fecha, creado_por, origen, factura_id)
    values (v_pedido.id, v_pedido.ultima_secuencia_remito, v_factura.fecha, auth.uid(), 'factura', v_factura.id)
    returning * into v_remito;
    v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');

    -- Solo lo que es mercadería: líneas con insumo o que corresponden al pedido
    -- (una línea libre sin insumo, como el flete, no es un ítem recibido: FA7).
    -- A2b: cantidad son las cajas (también cuando se cobra por kg); los kg van aparte.
    insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad, cantidad_base)
    select v_remito.id, fi.pedido_item_id, fi.item_id, fi.descripcion, fi.cantidad,
           case when fi.item_id is not null then fi.cantidad_base end
    from compras_factura_items fi
    where fi.factura_id = v_factura.id and fi.cantidad > 0
      and (fi.item_id is not null or fi.pedido_item_id is not null);

    for v_mov in
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    loop
      continue when v_mov.total = 0;
      perform compras_mover_stock(
        v_mov.item_id, v_mov.total, 'entrada_remito',
        'Remito ' || v_codigo || ' (desde factura ' || v_factura.numero || ')',
        v_remito.id, null, null, v_factura.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;

    -- A2b (E10)
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_creado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
      'factura_id', v_factura.id, 'factura_numero', v_factura.numero,
      'lineas', compras_lineas_remito_snapshot(v_remito.id)));
  end if;

  -- A2b (E7): el precio de referencia viaja con su unidad. Un insumo puede venir
  -- en más de una línea: se usa la última de la factura (la más abajo en el papel).
  -- Orden de bloqueo: pedido → factura → stock → par (FOR UPDATE) → KEY SHARE del
  -- insumo (historial). compras_guardar_insumo toma NO KEY UPDATE: no se cruzan.
  if coalesce(p_actualizar_precios, false) then
    for v_precio in
      select distinct on (fi.item_id) fi.item_id, fi.precio_unitario, fi.precio_por
      from compras_factura_items fi
      where fi.factura_id = v_factura.id and fi.item_id is not null and fi.precio_unitario > 0
      order by fi.item_id, fi.orden desc, fi.id desc
    loop
      select * into v_par from compras_item_proveedores
      where item_id = v_precio.item_id and proveedor_id = v_factura.proveedor_id and activo
      for update;
      continue when not found;
      continue when v_par.precio_ref is not distinct from v_precio.precio_unitario
                and v_par.cobra_por = v_precio.precio_por;
      update compras_item_proveedores
        set precio_ref = v_precio.precio_unitario, cobra_por = v_precio.precio_por
        where id = v_par.id;
      insert into compras_items_historial (item_id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, origen, creado_por)
      select v_precio.item_id, v_lote, c.campo, v_factura.proveedor_id, c.ant, c.nue, 'factura', auth.uid()
      from (values
        ('proveedor.cobra_por',  v_par.cobra_por,                    v_precio.precio_por),
        ('proveedor.precio_ref', _compras_num_txt(v_par.precio_ref), _compras_num_txt(v_precio.precio_unitario))
      ) c(campo, ant, nue)
      where c.ant is distinct from c.nue;
      v_precios := v_precios + 1;
    end loop;
  end if;

  -- Gasto (F6 del 22-09 / FA10).
  if p_gasto_existente_id is not null then
    v_gasto_id := v_gasto.id;
    update gastos
      set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
            'Vinculado a la factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || '.')
      where id = v_gasto.id;
  elsif v_factura.total > 0 then
    insert into gastos (fecha, local, rubro, categoria, proveedor_id, monto, forma_pago, estado, observaciones, created_by)
    values (
      v_factura.fecha,
      v_local,
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.rubro'), 'MATERIA PRIMA'),
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.categoria'), 'MATERIA PRIMA'),
      v_factura.proveedor_id,
      v_factura.total,
      coalesce((select valor #>> '{}' from compras_config where clave = 'gasto.forma_pago'), 'Transferencia'),
      'Pendiente de pago',
      'Factura ' || v_factura.numero || ' del pedido ' || v_codigo_ped || ' (se creó al confirmar la factura).',
      auth.uid()
    )
    returning id into v_gasto_id;
    v_generado := true;
  end if;

  update compras_facturas
    set estado = 'confirmada',
        confirmada_en = now(),
        confirmada_por = auth.uid(),
        mercaderia_llego = case when v_tiene_rem then null else p_mercaderia_llego end,
        gasto_id = v_gasto_id,
        gasto_generado = v_generado
    where id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);
  perform compras_recalcular_diferencias_factura(v_factura.id);

  return jsonb_build_object(
    'remito_generado', v_codigo,
    'impacto', v_impacto,
    'gasto_id', v_gasto_id,
    'gasto_creado', v_generado,
    'diferencias', (select count(*) from compras_factura_discrepancias where factura_id = v_factura.id),
    'precios_actualizados', v_precios  -- A2b
  );
end;
$$;

revoke execute on function public.compras_confirmar_factura(uuid, boolean, boolean, uuid, text) from public, anon;
grant execute on function public.compras_confirmar_factura(uuid, boolean, boolean, uuid, text) to authenticated;

-- ============================================================================
-- 3.11 compras_anular_factura: cuerpo de 20260929120000:937-1047 + evento (A2b, E14)
-- ============================================================================

create or replace function public.compras_anular_factura(
  p_factura_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id    uuid;
  v_pedido       compras_pedidos%rowtype;
  v_factura      compras_facturas%rowtype;
  v_gasto        gastos%rowtype;
  v_remito       compras_remitos%rowtype;
  v_codigo       text;
  v_mov          record;
  v_despues      numeric;
  v_impacto      jsonb := '[]'::jsonb;
  v_gasto_accion text;
  v_snap         jsonb;  -- A2b
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede anular facturas.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Contá por qué anulás la factura: queda registrado.';
  end if;

  select pedido_id into v_pedido_id from compras_facturas where id = p_factura_id;
  if not found then
    raise exception 'No encontramos la factura. Recargá la página.';
  end if;
  select * into v_pedido from compras_pedidos where id = v_pedido_id for update;
  select * into v_factura from compras_facturas where id = p_factura_id for update;

  if v_factura.estado <> 'confirmada' then
    raise exception 'Solo se anula una factura confirmada. Un borrador se descarta.';
  end if;

  if exists (
    select 1 from compras_factura_discrepancias
    where factura_id = v_factura.id and resolucion = 'ajusta_stock'
  ) then
    raise exception 'Esta factura tiene diferencias que ya ajustaron el stock. Revertí esos ajustes (en "Diferencias con lo recibido") antes de anularla.';
  end if;

  if v_factura.gasto_id is not null then
    select * into v_gasto from gastos where id = v_factura.gasto_id for update;
    if found then
      if v_gasto.estado in ('Pagado', 'Parcial') then
        raise exception 'El gasto de esta factura ya está %: no se puede anular. Para corregirla, registrá una nota de crédito.',
          case v_gasto.estado when 'Pagado' then 'pagado' else 'pagado en parte' end;
      end if;
      update compras_facturas set gasto_id = null, gasto_generado = false where id = v_factura.id;
      if v_factura.gasto_generado then
        -- Existía solo por esta factura: dejarlo haría que alguien lo pague.
        delete from gastos where id = v_gasto.id;
        v_gasto_accion := 'eliminado';
      else
        update gastos
          set observaciones = concat_ws(E'\n', nullif(btrim(observaciones), ''),
                'Se desvinculó de la factura ' || v_factura.numero || ', que se anuló: ' || btrim(p_motivo) || '.')
          where id = v_gasto.id;
        v_gasto_accion := 'desvinculado';
      end if;
    end if;
  end if;

  for v_remito in
    select * from compras_remitos where factura_id = v_factura.id and origen = 'factura' for update
  loop
    v_codigo := 'R-' || lpad(v_pedido.numero::text, 4, '0') || '-' || lpad(v_remito.secuencia::text, 2, '0');
    for v_mov in
      select item_id, sum(cantidad) as total
      from compras_remito_items
      where remito_id = v_remito.id and item_id is not null
      group by item_id
    loop
      continue when v_mov.total = 0;
      perform compras_mover_stock(
        v_mov.item_id, -v_mov.total, 'salida_remito_anulado',
        'Remito ' || v_codigo || ' eliminado al anular la factura ' || v_factura.numero,
        v_remito.id, null, null, v_factura.id
      );
      select cantidad into v_despues from compras_stock_actual where item_id = v_mov.item_id;
      v_impacto := v_impacto || jsonb_build_object(
        'item_id', v_mov.item_id,
        'nombre', (select nombre from compras_items where id = v_mov.item_id),
        'unidad', (select unidad from compras_items where id = v_mov.item_id),
        'delta', -v_mov.total,
        'cantidad_despues', v_despues
      );
    end loop;
    v_snap := compras_lineas_remito_snapshot(v_remito.id);  -- A2b
    delete from compras_remitos where id = v_remito.id;
    -- A2b (E10, E14)
    perform compras_registrar_evento_pedido(v_pedido.id, 'remito_eliminado', jsonb_build_object(
      'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
      'factura_id', v_factura.id,
      'motivo', 'Se anuló la factura ' || v_factura.numero || ': ' || btrim(p_motivo),
      'lineas', v_snap));
  end loop;

  update compras_facturas
    set estado = 'anulada',
        anulada_en = now(),
        anulada_por = auth.uid(),
        anulada_motivo = btrim(p_motivo)
    where id = v_factura.id;

  -- Sin factura confirmada no hay nada contra qué comparar.
  delete from compras_factura_discrepancias where factura_id = v_factura.id;

  perform compras_recalcular_estado_pedido(v_pedido.id);

  return jsonb_build_object('remito_eliminado', v_codigo, 'impacto', v_impacto, 'gasto', v_gasto_accion);
end;
$$;

revoke execute on function public.compras_anular_factura(uuid, text) from public, anon;
grant execute on function public.compras_anular_factura(uuid, text) to authenticated;

-- ============================================================================
-- 3.12 compras_diferencias_calculadas: misma comparación + kg como información (E6)
-- ============================================================================
-- Cambia el tipo de retorno: drop + create. compras_recalcular_diferencias_factura
-- (plpgsql) lee las columnas por nombre y no se toca.

drop function if exists public.compras_diferencias_calculadas(uuid);

create function public.compras_diferencias_calculadas(p_factura_id uuid)
returns table (
  clave text, pedido_item_id uuid, item_id uuid, descripcion text, unidad text,
  recibida numeric, facturada numeric,
  -- A2b: información en unidad base. *_real = false → al menos una línea sin kg reales (cae a nominal).
  unidad_base text, contenido numeric,
  recibida_base numeric, recibida_base_real boolean,
  facturada_base numeric, facturada_base_real boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select id, pedido_id from compras_facturas where id = p_factura_id
  ),
  facturado as (
    select fi.item_id, sum(fi.cantidad) as cantidad,
           sum(coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(fi.cantidad_base is not null) as base_real
    from compras_factura_items fi
    join f on f.id = fi.factura_id
    join compras_items i on i.id = fi.item_id
    where fi.item_id is not null
    group by fi.item_id
  ),
  recibido as (
    select ri.item_id, sum(ri.cantidad) as cantidad,
           sum(coalesce(ri.cantidad_base, ri.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(ri.cantidad_base is not null) as base_real
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    join f on f.pedido_id = r.pedido_id
    join compras_items i on i.id = ri.item_id
    where ri.item_id is not null
    group by ri.item_id
  ),
  -- La línea del pedido de ese insumo, solo si hay exactamente una.
  lineas as (
    select pi.item_id, (array_agg(pi.id))[1] as pedido_item_id
    from compras_pedido_items pi
    join f on f.pedido_id = pi.pedido_id
    where pi.item_id is not null
    group by pi.item_id
    having count(*) = 1
  )
  select 'item:' || coalesce(fa.item_id, re.item_id)::text,
         l.pedido_item_id,
         coalesce(fa.item_id, re.item_id),
         i.nombre,
         i.unidad,
         coalesce(re.cantidad, 0),
         coalesce(fa.cantidad, 0),
         i.unidad_base,
         i.cantidad_por_unidad,
         re.base,
         coalesce(re.base_real, false),
         fa.base,
         coalesce(fa.base_real, false)
  from facturado fa
  full join recibido re on re.item_id = fa.item_id
  join compras_items i on i.id = coalesce(fa.item_id, re.item_id)
  left join lineas l on l.item_id = coalesce(fa.item_id, re.item_id);
$$;

revoke execute on function public.compras_diferencias_calculadas(uuid) from public, anon, authenticated;

-- ============================================================================
-- 3.13 Vistas: columnas nuevas al final
-- ============================================================================

-- Cuerpo de 20260924200000 + unidades, cobra_por del par y kg recibidos (A2b).
create or replace view public.v_compras_pedido_pendiente as
select
  pi.id as pedido_item_id,
  pi.pedido_id,
  pi.item_id,
  pi.descripcion,
  pi.unidad,
  pi.orden,
  pi.cantidad,
  coalesce(r.recibido, 0) as recibido,
  greatest(pi.cantidad - coalesce(r.recibido, 0), 0) as pendiente,
  greatest(coalesce(r.recibido, 0) - pi.cantidad, 0) as excedente,
  coalesce(r.remitos, 0) as remitos,
  -- A2b
  i.unidad_base,
  i.cantidad_por_unidad as contenido,
  case when pi.item_id is null then null else coalesce(ip.cobra_por, i.cobra_por_default) end as cobra_por,
  r.recibido_base,
  coalesce(r.recibido_base_completo, false) as recibido_base_completo
from compras_pedido_items pi
join compras_pedidos p on p.id = pi.pedido_id
left join compras_items i on i.id = pi.item_id
left join compras_item_proveedores ip on ip.item_id = pi.item_id and ip.proveedor_id = p.proveedor_id
left join lateral (
  select sum(ri.cantidad) as recibido, count(distinct ri.remito_id) as remitos,
         sum(ri.cantidad_base) as recibido_base,
         bool_and(ri.cantidad_base is not null) as recibido_base_completo
  from compras_remito_items ri
  where ri.pedido_item_id = pi.id
) r on true
where tiene_acceso_compras();

grant select on public.v_compras_pedido_pendiente to authenticated;

-- Cuerpo de 20260929120000:1087-1095 + kg (A2b). Los kg se calculan acá con la
-- misma regla que compras_diferencias_calculadas (kg reales, o nominal si falta
-- alguno): la vista corre como dueño para las tablas, pero el EXECUTE de una
-- función se chequea contra quien consulta, y esa función está revocada.
create or replace view public.v_compras_factura_diferencias as
select
  d.id, d.factura_id, f.pedido_id, d.clave, d.pedido_item_id, d.item_id, d.descripcion, d.unidad,
  d.cantidad_recibida, d.cantidad_facturada, d.diferencia, d.resolucion, d.movimiento_id, d.nota,
  d.resuelto_en, pr.nombre as resuelto_por_nombre,
  -- A2b
  i.unidad_base,
  i.cantidad_por_unidad as contenido,
  re.base as recibida_base,
  coalesce(re.base_real, false) as recibida_base_real,
  fa.base as facturada_base,
  coalesce(fa.base_real, false) as facturada_base_real
from compras_factura_discrepancias d
join compras_facturas f on f.id = d.factura_id
left join profiles pr on pr.id = d.resuelto_por
left join compras_items i on i.id = d.item_id
left join lateral (
  select sum(coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad)) as base,
         bool_and(fi.cantidad_base is not null) as base_real
  from compras_factura_items fi
  where fi.factura_id = d.factura_id and fi.item_id = d.item_id
  having count(*) > 0
) fa on true
left join lateral (
  select sum(coalesce(ri.cantidad_base, ri.cantidad * i.cantidad_por_unidad)) as base,
         bool_and(ri.cantidad_base is not null) as base_real
  from compras_remito_items ri
  join compras_remitos r on r.id = ri.remito_id
  where r.pedido_id = f.pedido_id and ri.item_id = d.item_id
  having count(*) > 0
) re on true
where es_admin();

grant select on public.v_compras_factura_diferencias to authenticated;

-- Cuerpo de 20261005150000:597-650 + cobra_por y unidades (A2b).
create or replace view public.v_compras_insumos_resumen as
select
  i.id                                   as item_id,
  coalesce(sa.cantidad, 0)               as stock,
  pp.proveedor_id                        as proveedor_principal_id,
  pp.precio_ref                          as precio_ref_principal,
  case when es_admin() then uf.precio_unitario end as ultimo_precio,
  case when es_admin() then uf.unidad          end as ultimo_precio_unidad,
  case when es_admin() then uf.fecha           end as ultimo_precio_fecha,
  case when es_admin() then uf.factura_id      end as ultimo_precio_factura_id,
  case when es_admin() then uf.proveedor_id    end as ultimo_precio_proveedor_id,
  coalesce(pa.pedidos, '[]'::jsonb)      as pedidos_abiertos,  -- [{pedido_id, numero, pendiente, enviado_en}]
  u.movimientos, u.pedidos, u.remitos, u.facturas, u.solicitudes, u.conteos,
  (u.movimientos + u.pedidos + u.remitos + u.facturas + u.discrepancias + u.solicitudes + u.conteos) = 0
                                         as puede_eliminar,
  -- A2b
  pp.cobra_por                           as cobra_por_principal,
  case when es_admin() then uf.precio_por end as ultimo_precio_por,
  i.unidad_base,
  i.cantidad_por_unidad                  as contenido
from compras_items i
left join compras_stock_actual sa on sa.item_id = i.id
left join compras_item_proveedores pp on pp.item_id = i.id and pp.es_principal and pp.activo
left join lateral (
  select fi.precio_unitario, fi.unidad, f.fecha, f.id as factura_id, f.proveedor_id, fi.precio_por
  from compras_factura_items fi
  join compras_facturas f on f.id = fi.factura_id
  where fi.item_id = i.id and f.estado = 'confirmada' and f.tipo_comprobante = 'factura'
    and fi.precio_unitario > 0
  order by f.fecha desc, f.confirmada_en desc, fi.orden desc, fi.id desc
  limit 1
) uf on true
left join lateral (
  select jsonb_agg(jsonb_build_object('pedido_id', x.pedido_id, 'numero', x.numero,
                                      'pendiente', x.pendiente, 'enviado_en', x.enviado_en)
                   order by x.enviado_en) as pedidos
  from (
    select p.id as pedido_id, p.numero, p.enviado_en,
           sum(greatest(pi.cantidad - coalesce((select sum(ri.cantidad) from compras_remito_items ri
                                                where ri.pedido_item_id = pi.id), 0), 0)) as pendiente
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id = i.id and p.estado_recepcion in ('enviado', 'parcial')
    group by p.id, p.numero, p.enviado_en
  ) x
  where x.pendiente > 0
) pa on true
cross join lateral (
  select
    (select count(*) from compras_stock_movimientos     where item_id = i.id) as movimientos,
    (select count(distinct pedido_id) from compras_pedido_items where item_id = i.id) as pedidos,
    (select count(*) from compras_remito_items          where item_id = i.id) as remitos,
    (select count(*) from compras_factura_items         where item_id = i.id) as facturas,
    (select count(*) from compras_factura_discrepancias where item_id = i.id) as discrepancias,
    (select count(*) from compras_solicitud_items       where item_id = i.id) as solicitudes,
    (select count(*) from fabrica_conteo_items fci join fabrica_conteos c on c.id = fci.conteo_id
       where fci.item_id = i.id and c.estado <> 'borrador')                  as conteos
) u
where tiene_acceso_compras();

grant select on public.v_compras_insumos_resumen to authenticated;

-- ============================================================================
-- 3.14 Backfill de remito_creado (E10). Idempotente; no toca actualizado_en.
-- ============================================================================

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select r.pedido_id, 'remito_creado',
       jsonb_build_object('remito_id', r.id, 'secuencia', r.secuencia, 'fecha', r.fecha,
                          'origen', r.origen, 'factura_id', r.factura_id, 'numero', r.numero, 'backfill', true),
       (select p.id from profiles p where p.id = r.creado_por),
       r.created_at
from compras_remitos r
where not exists (
  select 1 from compras_pedido_eventos e
  where e.tipo = 'remito_creado' and e.detalle->>'remito_id' = r.id::text
);
