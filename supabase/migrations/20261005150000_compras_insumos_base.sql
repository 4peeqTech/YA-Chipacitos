-- A2a — Insumos: arreglos de base (docs/bloque2/plan-A2a.md §3).
--
-- Insumos deja de escribir desde el navegador: crear, editar, archivar y
-- eliminar pasan por RPCs security definer que dejan historial.
--   1. compras_items_historial: qué cambió, cuándo y quién (una guardada = un lote).
--   2. Un solo proveedor principal por insumo (índice único parcial), con
--      normalización previa por si prod tiene datos que dev no tiene.
--   3. El ledger ya no se borra en cascada con el insumo (FK RESTRICT, C1).
--   4. compras_items y compras_item_proveedores quedan de solo lectura por RLS.
--   5. RPCs compras_guardar_insumo, compras_archivar_insumo, compras_eliminar_insumo.
--   6. generar_solicitud_base(): un insumo archivado no entra al pedido base.
--   7. v_compras_insumos_resumen: stock, pedido abierto y precios por insumo.


-- ---------------------------------------------------------------------------
-- 1. Historial
-- ---------------------------------------------------------------------------

create table public.compras_items_historial (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references compras_items(id) on delete cascade,
  lote           uuid not null,                 -- una guardada = un lote
  campo          text not null,
  proveedor_id   uuid references proveedores(id) on delete set null,
  valor_anterior text,
  valor_nuevo    text,
  origen         text not null default 'insumos' check (origen in ('insumos', 'factura', 'migracion')),
  creado_por     uuid references profiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index compras_items_historial_item_idx on public.compras_items_historial (item_id, creado_en desc);
create index compras_items_historial_lote_idx on public.compras_items_historial (lote);
alter table public.compras_items_historial enable row level security;
create policy compras_items_historial_lectura on public.compras_items_historial
  for select using (tiene_acceso_compras());
-- Sin policies de escritura: solo la escriben las RPCs.

-- ---------------------------------------------------------------------------
-- 2. Normalización previa y unicidad del principal
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  -- Más de un principal: queda el más viejo.
  for r in
    select item_id, array_agg(id order by created_at, id) ids
    from compras_item_proveedores where es_principal group by item_id having count(*) > 1
  loop
    update compras_item_proveedores set es_principal = false where id = any(r.ids[2:]);
    raise notice 'Insumo % tenía % principales: quedó el más viejo.', r.item_id, array_length(r.ids, 1);
  end loop;
  -- Un principal inactivo: se activa (si estaba inactivo, el pedido nunca lo ofrecía igual).
  for r in select id, item_id from compras_item_proveedores where es_principal and not activo loop
    update compras_item_proveedores set activo = true where id = r.id;
    raise notice 'Insumo %: el principal estaba inactivo, se reactivó.', r.item_id;
  end loop;
  -- Duplicados de nombre: no se tocan, solo se listan (la RPC los rechaza de acá en adelante).
  for r in select lower(btrim(nombre)) n, count(*) c from compras_items group by 1 having count(*) > 1 loop
    raise notice 'Nombre de insumo repetido: "%" (% veces). Revisalo a mano.', r.n, r.c;
  end loop;
end $$;

create unique index compras_item_proveedores_un_principal
  on public.compras_item_proveedores (item_id) where es_principal;

-- ---------------------------------------------------------------------------
-- 3. FK del ledger (C1): un insumo con movimientos no se puede borrar
-- ---------------------------------------------------------------------------

alter table public.compras_stock_movimientos
  drop constraint compras_stock_movimientos_item_id_fkey,
  add  constraint compras_stock_movimientos_item_id_fkey
       foreign key (item_id) references compras_items(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 4. RLS: solo lectura desde el navegador (E9)
-- ---------------------------------------------------------------------------

drop policy compras_items_acceso on public.compras_items;
create policy compras_items_lectura on public.compras_items
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy compras_item_proveedores_escritura on public.compras_item_proveedores;
-- compras_item_proveedores_lectura queda como está.

-- ---------------------------------------------------------------------------
-- 5. Helpers internos
-- ---------------------------------------------------------------------------

create or replace function public._compras_item_hist(
  p_item uuid, p_lote uuid, p_campo text, p_prov uuid, p_ant text, p_nue text
) returns void language sql security definer set search_path = public as $$
  insert into compras_items_historial (item_id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, creado_por)
  select p_item, p_lote, p_campo, p_prov, p_ant, p_nue, auth.uid()
  where p_ant is distinct from p_nue;
$$;
revoke execute on function public._compras_item_hist(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;

-- Número como texto legible para el historial: 16.50 → '16.5'.
create or replace function public._compras_num_txt(p numeric)
returns text language sql immutable set search_path = public as $$
  select trim_scale(p)::text;
$$;
revoke execute on function public._compras_num_txt(numeric) from public, anon, authenticated;

-- ¿El par insumo–proveedor tiene historia? (E4) Pedidos o facturas de ese
-- proveedor con ese insumo, o solicitudes / pedido base con los dos.
create or replace function public._compras_par_tiene_historia(p_item uuid, p_prov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from compras_pedido_items pi join compras_pedidos p on p.id = pi.pedido_id
                 where pi.item_id = p_item and p.proveedor_id = p_prov)
      or exists (select 1 from compras_factura_items fi join compras_facturas f on f.id = fi.factura_id
                 where fi.item_id = p_item and f.proveedor_id = p_prov)
      or exists (select 1 from compras_solicitud_items where item_id = p_item and proveedor_id = p_prov)
      or exists (select 1 from compras_plantilla_base where item_id = p_item and proveedor_id = p_prov);
$$;
revoke execute on function public._compras_par_tiene_historia(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC compras_guardar_insumo
-- ---------------------------------------------------------------------------
-- p_item_id null = crear. p_datos trae SOLO los campos que cambiaron (E1).
-- p_proveedores null = no tocar proveedores; si viene, trae TODOS los pares
-- que el form conoce (activos e inactivos):
--   { proveedor_id, es_principal, activo, codigo_proveedor, precio_ref, precio_ref_anterior }

create or replace function public.compras_guardar_insumo(
  p_item_id     uuid  default null,
  p_datos       jsonb default '{}'::jsonb,
  p_proveedores jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campos constant text[] := array['nombre','unidad','categoria_id','cantidad_por_unidad','cantidad_por_masa',
                                    'stock_minimo','redondeo','stock_maximo','a_demanda','alicuota_iva'];
  v_lote uuid := gen_random_uuid();
  v_id   uuid := p_item_id;
  v_old  compras_items%rowtype;
  v_new  compras_items%rowtype;
  v_k    text;
  v_nombre text; v_unidad text; v_cat uuid; v_cpu numeric; v_cpm numeric; v_smin numeric;
  v_red text; v_smax numeric; v_ademanda boolean; v_iva numeric;
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
    if v_cpu is null or v_cpu <= 0 then raise exception 'La cantidad por unidad tiene que ser mayor a 0.'; end if;
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

  -- 3. Crear / editar
  if v_id is null then
    if v_nombre is null then raise exception 'El nombre es obligatorio.'; end if;
    if v_unidad is null then raise exception 'La unidad de compra es obligatoria.'; end if;
    if p_proveedores is null or jsonb_typeof(p_proveedores) <> 'array' or jsonb_array_length(p_proveedores) = 0 then
      raise exception 'El insumo necesita al menos un proveedor activo.';
    end if;
  else
    select * into v_old from compras_items where id = v_id for update;
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
                               stock_minimo, redondeo, stock_maximo, a_demanda, alicuota_iva)
    values (v_nombre, v_unidad, v_cat, coalesce(v_cpu, 1), coalesce(v_cpm, 0),
            coalesce(v_smin, 0), coalesce(v_red, 'estandar'), v_smax, coalesce(v_ademanda, false), coalesce(v_iva, 21))
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
      alicuota_iva        = case when p_datos ? 'alicuota_iva'        then v_iva      else alicuota_iva        end
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
                              _compras_num_txt(v_old.alicuota_iva), _compras_num_txt(v_new.alicuota_iva))
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
      if v_precio is not null and v_precio < 0 then
        raise exception 'El precio de referencia no puede ser negativo.';
      end if;

      select nombre, estado into v_prov_nombre, v_prov_estado from proveedores where id = v_prov_id;

      select * into v_par from compras_item_proveedores
      where item_id = v_id and proveedor_id = v_prov_id
      for update;

      if not found then
        if v_prov_estado is distinct from 'activo' then
          raise exception 'Ese proveedor no existe o está archivado.';
        end if;
        insert into compras_item_proveedores (item_id, proveedor_id, es_principal, activo, precio_ref, codigo_proveedor)
        values (v_id, v_prov_id, v_es_ppal, v_activo, v_precio, v_codigo);
        perform _compras_item_hist(v_id, v_lote, 'proveedor', v_prov_id, null, v_prov_nombre);
        perform _compras_item_hist(v_id, v_lote, 'proveedor.precio_ref', v_prov_id, null, _compras_num_txt(v_precio));
      else
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

-- ---------------------------------------------------------------------------
-- 7. RPC compras_archivar_insumo (E6, E7)
-- ---------------------------------------------------------------------------
-- Archivar esconde, no borra la configuración: las listas de conteo y la
-- plantilla base conservan la fila (si se reactiva, vuelve solo). Solo se
-- sacan sus filas de los conteos en borrador.

create or replace function public.compras_archivar_insumo(
  p_item_id uuid default null, p_archivar boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item     compras_items%rowtype;
  v_nuevo    text := case when coalesce(p_archivar, true) then 'archivado' else 'activo' end;
  v_quitados integer := 0;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  select * into v_item from compras_items where id = p_item_id for update;
  if not found then raise exception 'No encontramos el insumo. Recargá la página.'; end if;
  if v_item.estado = v_nuevo then
    raise exception '%', case when v_nuevo = 'archivado' then 'Ya está archivado.' else 'Ya está activo.' end;
  end if;

  update compras_items set estado = v_nuevo where id = p_item_id;
  perform _compras_item_hist(p_item_id, gen_random_uuid(), 'estado', null, v_item.estado, v_nuevo);

  if v_nuevo = 'archivado' then
    -- Mismo orden de locks que el cierre y el descarte: primero el conteo.
    perform 1 from fabrica_conteos c
    where c.estado = 'borrador'
      and exists (select 1 from fabrica_conteo_items fci where fci.conteo_id = c.id and fci.item_id = p_item_id)
    order by c.id
    for update;

    delete from fabrica_conteo_items fci using fabrica_conteos c
    where c.id = fci.conteo_id and c.estado = 'borrador' and fci.item_id = p_item_id;
    get diagnostics v_quitados = row_count;
  end if;

  return jsonb_build_object(
    'estado', v_nuevo,
    'borradores_quitados', v_quitados,
    'listas', coalesce((
      select jsonb_agg(x.nombre order by x.orden, x.nombre) from (
        select distinct d.nombre, d.orden
        from fabrica_conteo_definicion_items di
        join fabrica_conteo_definiciones d on d.id = di.definicion_id
        where di.item_id = p_item_id and di.activo and d.activo
      ) x), '[]'::jsonb),
    'pedido_base', (select count(*) from compras_plantilla_base where item_id = p_item_id and activo),
    'stock', coalesce((select cantidad from compras_stock_actual where item_id = p_item_id), 0));
end $$;
revoke execute on function public.compras_archivar_insumo(uuid, boolean) from public, anon;
grant  execute on function public.compras_archivar_insumo(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC compras_eliminar_insumo (E8)
-- ---------------------------------------------------------------------------

create or replace function public.compras_eliminar_insumo(p_item_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item   compras_items%rowtype;
  v_partes text[] := '{}';
  v_n      bigint;
  v_stock  numeric;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  select * into v_item from compras_items where id = p_item_id for update;
  if not found then raise exception 'No encontramos el insumo. Recargá la página.'; end if;

  -- Historia: si hay alguna, no se elimina (se archiva).
  select count(*) into v_n from compras_stock_movimientos where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' movimiento de stock' else ' movimientos de stock' end); end if;
  select count(distinct pedido_id) into v_n from compras_pedido_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' pedido' else ' pedidos' end); end if;
  select count(distinct remito_id) into v_n from compras_remito_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' remito' else ' remitos' end); end if;
  select count(distinct factura_id) into v_n from compras_factura_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' factura' else ' facturas' end); end if;
  select count(*) into v_n from compras_factura_discrepancias where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' diferencia de factura' else ' diferencias de factura' end); end if;
  select count(distinct solicitud_id) into v_n from compras_solicitud_items where item_id = p_item_id;
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' solicitud' else ' solicitudes' end); end if;
  select count(distinct fci.conteo_id) into v_n
  from fabrica_conteo_items fci join fabrica_conteos c on c.id = fci.conteo_id
  where fci.item_id = p_item_id and c.estado <> 'borrador';
  if v_n > 0 then v_partes := v_partes || (v_n || case when v_n = 1 then ' conteo' else ' conteos' end); end if;

  if cardinality(v_partes) > 0 then
    raise exception 'No se puede eliminar: tiene %. Archivalo: deja de aparecer y no pierde su historia.',
      case when cardinality(v_partes) = 1 then v_partes[1]
           else array_to_string(v_partes[1:cardinality(v_partes) - 1], ', ') || ' y ' || v_partes[cardinality(v_partes)]
      end;
  end if;

  select cantidad into v_stock from compras_stock_actual where item_id = p_item_id;
  if coalesce(v_stock, 0) <> 0 then
    raise exception 'No se puede eliminar: figura con stock % sin movimientos que lo expliquen. Avisale a soporte.',
      _compras_num_txt(v_stock);
  end if;

  -- Configuración: se va con él.
  perform 1 from fabrica_conteos c
  where c.estado = 'borrador'
    and exists (select 1 from fabrica_conteo_items fci where fci.conteo_id = c.id and fci.item_id = p_item_id)
  order by c.id
  for update;
  delete from fabrica_conteo_items fci using fabrica_conteos c
  where c.id = fci.conteo_id and c.estado = 'borrador' and fci.item_id = p_item_id;
  delete from fabrica_conteo_definicion_items where item_id = p_item_id;
  delete from compras_plantilla_base where item_id = p_item_id;
  delete from compras_item_proveedores where item_id = p_item_id;
  delete from compras_stock_actual where item_id = p_item_id;
  delete from compras_items where id = p_item_id;   -- el historial cae por cascade

  return jsonb_build_object('nombre', v_item.nombre);
end $$;
revoke execute on function public.compras_eliminar_insumo(uuid) from public, anon;
grant  execute on function public.compras_eliminar_insumo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. generar_solicitud_base(): el archivado no entra
-- ---------------------------------------------------------------------------
-- Mismo cuerpo que en 20260924150000_solicitud_base_stock.sql; solo cambia el
-- where del insert (A2a toma la función para este cambio).

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
    (solicitud_id, item_id, proveedor_id, descripcion, unidad, cantidad_sugerida, cantidad_ajustada, incluir, orden, stock_actual)
  select v_solicitud_id, pb.item_id, pb.proveedor_id, pb.descripcion, pb.unidad, pb.cantidad, pb.cantidad, true, pb.orden,
         case when pb.item_id is not null then coalesce(sa.cantidad, 0) end
  from compras_plantilla_base pb
  left join compras_stock_actual sa on sa.item_id = pb.item_id
  where pb.activo
    and (pb.item_id is null
         or exists (select 1 from compras_items ci where ci.id = pb.item_id and ci.estado = 'activo'))
  order by pb.orden;

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

-- ---------------------------------------------------------------------------
-- 10. Vista v_compras_insumos_resumen
-- ---------------------------------------------------------------------------
-- Una fila por insumo. Corre como dueño (igual que las demás v_compras_*): el
-- gate va en el where. El último precio facturado solo lo ve admin (E10).

create view public.v_compras_insumos_resumen as
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
                                         as puede_eliminar
from compras_items i
left join compras_stock_actual sa on sa.item_id = i.id
left join compras_item_proveedores pp on pp.item_id = i.id and pp.es_principal and pp.activo
left join lateral (
  select fi.precio_unitario, fi.unidad, f.fecha, f.id as factura_id, f.proveedor_id
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

