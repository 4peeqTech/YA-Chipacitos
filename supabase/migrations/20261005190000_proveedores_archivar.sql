-- B3 — Proveedor y reportes conectados (docs/bloque2/plan-B3.md §3).
--
-- El proveedor se archiva en vez de borrarse y deja de escribirse desde el navegador:
--   1. proveedores.local → local_facturacion_id (el backfill de 20260903150000
--      comparaba contra el slug y no matcheó nada) y se borra la columna (C2, D1).
--   2. FK a RESTRICT: gastos, compras_item_proveedores y compras_items_historial (C1, E6).
--   3. proveedores queda de solo lectura por RLS (E7).
--   4. RPCs proveedores_guardar, proveedores_impacto, proveedores_archivar,
--      proveedores_eliminar, y los helpers _compras_exigir_proveedor_activo y
--      _compras_pedidos_abiertos_de.
--   5. Guardas: un proveedor archivado no entra a un pedido nuevo, a una
--      conversión de solicitud ni a una reapertura (E4).
--   6. v_compras_proveedor_insumos: pestaña Insumos de la ficha (lee columnas de A2b).
--
-- Nota de release:
--   - Requiere 20261005180000 (A2b) aplicada: la vista lee cobra_por, precio_por y unidad_base.
--   - Revisar los "raise notice" del push: LOCAL SIN MATCH (cargar el local a mano
--     en Proveedores) y NOMBRE REPETIDO (la RPC rechaza repetidos de acá en adelante).
--   - Entre el push y el merge del código, la pantalla vieja de Proveedores no puede
--     guardar (RLS de solo lectura y sin columna local): mergear enseguida.


-- ---------------------------------------------------------------------------
-- 3.1 Datos: local → local_facturacion_id (E10). Solo donde está vacío; los
-- pedidos existentes no se tocan.
-- ---------------------------------------------------------------------------

update proveedores p
  set local_facturacion_id = lf.id
  from locales_facturacion lf
  where p.local_facturacion_id is null
    and nullif(btrim(p.local), '') is not null
    and lower(btrim(p.local)) in (lower(btrim(lf.slug)), lower(btrim(lf.nombre)), lower(btrim(lf.direccion)));

do $$
declare r record;
begin
  for r in select nombre, local from proveedores
           where local_facturacion_id is null and nullif(btrim(local), '') is not null loop
    raise notice 'LOCAL SIN MATCH: % → "%" (cargalo a mano en Proveedores)', r.nombre, r.local;
  end loop;
  for r in select lower(btrim(nombre)) n, count(*) c from proveedores group by 1 having count(*) > 1 loop
    raise notice 'NOMBRE REPETIDO: "%" (% proveedores)', r.n, r.c;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3.2 Se borra proveedores.local (C2). Ninguna vista ni función depende de ella.
-- ---------------------------------------------------------------------------

alter table proveedores drop column local;


-- ---------------------------------------------------------------------------
-- 3.3 FK a RESTRICT (C1, E6). El nombre de la constraint se busca por tabla y
-- columna, por si en algún entorno no tiene el nombre por defecto.
-- Las FK de compras_pedidos, compras_facturas, compras_solicitud_items y
-- compras_plantilla_base ya son NO ACTION (bloquean): quedan como están.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_con text;
begin
  for r in select * from (values ('gastos'), ('compras_item_proveedores'), ('compras_items_historial')) t(tabla) loop
    select c.conname into v_con
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.conrelid = ('public.' || r.tabla)::regclass
      and c.confrelid = 'public.proveedores'::regclass
      and array_length(c.conkey, 1) = 1
      and a.attname = 'proveedor_id';
    if v_con is not null then
      execute format('alter table public.%I drop constraint %I', r.tabla, v_con);
    end if;
    execute format(
      'alter table public.%I add constraint %I foreign key (proveedor_id) references public.proveedores(id) on delete restrict',
      r.tabla, r.tabla || '_proveedor_id_fkey');
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3.4 RLS de solo lectura (E7). proveedores_lectura_compras_fabrica queda.
-- ---------------------------------------------------------------------------

drop policy if exists proveedores_escritura on public.proveedores;


-- ---------------------------------------------------------------------------
-- 3.5 _compras_exigir_proveedor_activo (E4, E20). FOR SHARE choca con el
-- FOR NO KEY UPDATE de archivar: un archivado y un pedido nuevo no se cruzan.
-- ---------------------------------------------------------------------------

create or replace function public._compras_exigir_proveedor_activo(p_proveedor_id uuid, p_para text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_nombre text;
begin
  select estado, nombre into v_estado, v_nombre from proveedores where id = p_proveedor_id for share;
  if not found then
    raise exception 'Ese proveedor no existe. Recargá la página.';
  end if;
  if v_estado <> 'activo' then
    raise exception 'El proveedor % está archivado: reactivalo en Proveedores %.', v_nombre, p_para;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3.6 _compras_pedidos_abiertos_de (E2, E13). Replica pedidoAbierto de
-- lib/compras/estadoPedido.ts: un pedido recibido siempre tiene remito, así que
-- "recibió algo" alcanza con que exista un remito.
-- ---------------------------------------------------------------------------

create or replace function public._compras_pedidos_abiertos_de(p_proveedor_id uuid)
returns table(id uuid, numero int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.numero from compras_pedidos p
  where p.proveedor_id = p_proveedor_id
    and (
      p.estado_recepcion in ('sin_enviar', 'enviado', 'parcial')
      or (p.estado_facturacion = 'sin_facturar' and p.estado_recepcion = 'recibido')
      or (p.estado_facturacion = 'sin_facturar' and p.estado_recepcion = 'cerrado_manual'
          and exists (select 1 from compras_remitos r where r.pedido_id = p.id))
    )
  order by p.numero;
$$;


-- ---------------------------------------------------------------------------
-- Conteo de todo lo que nombra a un proveedor (E5). Lo usan impacto y eliminar,
-- así el diálogo y la RPC dicen lo mismo.
-- ---------------------------------------------------------------------------

create or replace function public._proveedores_referencias(p_proveedor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pedidos',            (select count(*) from compras_pedidos where proveedor_id = p_proveedor_id),
    'pedidos_eliminados', (select count(*) from compras_pedidos_eliminados where proveedor_id = p_proveedor_id),
    'facturas',           (select count(*) from compras_facturas where proveedor_id = p_proveedor_id),
    'gastos',             (select count(*) from gastos where proveedor_id = p_proveedor_id),
    'insumos',            (select count(*) from compras_item_proveedores where proveedor_id = p_proveedor_id),
    'solicitudes',        (select count(distinct solicitud_id) from compras_solicitud_items where proveedor_id = p_proveedor_id),
    'pedido_base',        (select count(*) from compras_plantilla_base where proveedor_id = p_proveedor_id),
    'historial',          (select count(*) from compras_items_historial where proveedor_id = p_proveedor_id)
  );
$$;


-- ---------------------------------------------------------------------------
-- 3.7 proveedores_guardar (E7, E9). Alta (p_id null) o edición de las claves
-- presentes. Sin cambios: no hay update y devuelve cambios: false.
-- ---------------------------------------------------------------------------

-- Los defaults son para que el alta omita p_id (como compras_guardar_insumo).
create or replace function public.proveedores_guardar(p_id uuid default null, p_datos jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_permitidas constant text[] := array[
    'nombre', 'categoria', 'cuit', 'contacto_nombre', 'contacto_telefono', 'contacto_email', 'direccion',
    'tiempo_entrega', 'periodicidad_compra', 'financiacion', 'condiciones_pago', 'notas', 'maneja_stock',
    'local_facturacion_id'];
  v_clave  text;
  v_nombre text;
  v_otro   record;
  v_local  uuid;
  v_old    proveedores%rowtype;
  v_new    proveedores%rowtype;
  v_id     uuid;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del proveedor vienen mal armados. Recargá la página.';
  end if;
  for v_clave in select jsonb_object_keys(p_datos) loop
    if not v_clave = any (c_permitidas) then
      raise exception 'Campo no permitido: %', v_clave;
    end if;
  end loop;

  if p_datos ? 'maneja_stock' and jsonb_typeof(p_datos->'maneja_stock') <> 'boolean' then
    raise exception '"Sugerir cantidades al pedir" tiene que ser sí o no.';
  end if;

  -- Nombre: obligatorio en el alta y si viene; único sin mayúsculas ni espacios (E9).
  if p_id is null or p_datos ? 'nombre' then
    v_nombre := nullif(btrim(p_datos->>'nombre'), '');
    if v_nombre is null then
      raise exception 'El nombre es obligatorio.';
    end if;
    if length(v_nombre) > 120 then
      raise exception 'El nombre es demasiado largo.';
    end if;
    select nombre, estado into v_otro from proveedores
    where lower(btrim(nombre)) = lower(v_nombre) and id is distinct from p_id
    limit 1;
    if found then
      if v_otro.estado = 'archivado' then
        raise exception 'Ya existe un proveedor llamado "%" (archivado): reactivalo en lugar de crear otro.', v_otro.nombre;
      end if;
      raise exception 'Ya existe un proveedor llamado "%".', v_otro.nombre;
    end if;
  end if;

  if p_datos ? 'local_facturacion_id' then
    v_local := nullif(p_datos->>'local_facturacion_id', '')::uuid;
    if v_local is not null and not exists (select 1 from locales_facturacion where id = v_local) then
      raise exception 'Ese local de facturación no existe. Recargá la página.';
    end if;
  end if;

  -- Alta
  if p_id is null then
    insert into proveedores (
      nombre, categoria, cuit, contacto_nombre, contacto_telefono, contacto_email, direccion,
      tiempo_entrega, periodicidad_compra, financiacion, condiciones_pago, notas, maneja_stock,
      local_facturacion_id, estado)
    values (
      v_nombre,
      nullif(btrim(p_datos->>'categoria'), ''),
      nullif(btrim(p_datos->>'cuit'), ''),
      nullif(btrim(p_datos->>'contacto_nombre'), ''),
      nullif(btrim(p_datos->>'contacto_telefono'), ''),
      nullif(btrim(p_datos->>'contacto_email'), ''),
      nullif(btrim(p_datos->>'direccion'), ''),
      nullif(btrim(p_datos->>'tiempo_entrega'), ''),
      nullif(btrim(p_datos->>'periodicidad_compra'), ''),
      nullif(btrim(p_datos->>'financiacion'), ''),
      nullif(btrim(p_datos->>'condiciones_pago'), ''),
      nullif(btrim(p_datos->>'notas'), ''),
      coalesce((p_datos->>'maneja_stock')::boolean, false),
      v_local,
      'activo')
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'cambios', true);
  end if;

  -- Edición: solo las claves presentes. Editar un archivado está permitido.
  select * into v_old from proveedores where id = p_id for no key update;
  if not found then
    raise exception 'No encontramos el proveedor. Recargá la página.';
  end if;
  v_new := v_old;
  if p_datos ? 'nombre'               then v_new.nombre := v_nombre; end if;
  if p_datos ? 'categoria'            then v_new.categoria := nullif(btrim(p_datos->>'categoria'), ''); end if;
  if p_datos ? 'cuit'                 then v_new.cuit := nullif(btrim(p_datos->>'cuit'), ''); end if;
  if p_datos ? 'contacto_nombre'      then v_new.contacto_nombre := nullif(btrim(p_datos->>'contacto_nombre'), ''); end if;
  if p_datos ? 'contacto_telefono'    then v_new.contacto_telefono := nullif(btrim(p_datos->>'contacto_telefono'), ''); end if;
  if p_datos ? 'contacto_email'       then v_new.contacto_email := nullif(btrim(p_datos->>'contacto_email'), ''); end if;
  if p_datos ? 'direccion'            then v_new.direccion := nullif(btrim(p_datos->>'direccion'), ''); end if;
  if p_datos ? 'tiempo_entrega'       then v_new.tiempo_entrega := nullif(btrim(p_datos->>'tiempo_entrega'), ''); end if;
  if p_datos ? 'periodicidad_compra'  then v_new.periodicidad_compra := nullif(btrim(p_datos->>'periodicidad_compra'), ''); end if;
  if p_datos ? 'financiacion'         then v_new.financiacion := nullif(btrim(p_datos->>'financiacion'), ''); end if;
  if p_datos ? 'condiciones_pago'     then v_new.condiciones_pago := nullif(btrim(p_datos->>'condiciones_pago'), ''); end if;
  if p_datos ? 'notas'                then v_new.notas := nullif(btrim(p_datos->>'notas'), ''); end if;
  if p_datos ? 'maneja_stock'         then v_new.maneja_stock := (p_datos->>'maneja_stock')::boolean; end if;
  if p_datos ? 'local_facturacion_id' then v_new.local_facturacion_id := v_local; end if;

  if v_new is not distinct from v_old then
    return jsonb_build_object('id', p_id, 'cambios', false);
  end if;

  update proveedores set
    nombre               = v_new.nombre,
    categoria            = v_new.categoria,
    cuit                 = v_new.cuit,
    contacto_nombre      = v_new.contacto_nombre,
    contacto_telefono    = v_new.contacto_telefono,
    contacto_email       = v_new.contacto_email,
    direccion            = v_new.direccion,
    tiempo_entrega       = v_new.tiempo_entrega,
    periodicidad_compra  = v_new.periodicidad_compra,
    financiacion         = v_new.financiacion,
    condiciones_pago     = v_new.condiciones_pago,
    notas                = v_new.notas,
    maneja_stock         = v_new.maneja_stock,
    local_facturacion_id = v_new.local_facturacion_id,
    updated_at           = now()
  where id = p_id;

  return jsonb_build_object('id', p_id, 'cambios', true);
end;
$$;


-- ---------------------------------------------------------------------------
-- 3.8 proveedores_impacto (E2, E3, E5): solo lectura, para armar los diálogos
-- antes de confirmar.
-- ---------------------------------------------------------------------------

create or replace function public.proveedores_impacto(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_ref    jsonb;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select estado into v_estado from proveedores where id = p_id;
  if not found then
    raise exception 'No encontramos el proveedor. Recargá la página.';
  end if;

  v_ref := _proveedores_referencias(p_id);

  return jsonb_build_object(
    'estado', v_estado,
    'abiertos', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'numero', a.numero) order by a.numero)
      from _compras_pedidos_abiertos_de(p_id) a), '[]'::jsonb),
    'principal_de', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre) order by i.nombre)
      from compras_item_proveedores ip
      join compras_items i on i.id = ip.item_id
      where ip.proveedor_id = p_id and ip.activo and ip.es_principal and i.estado = 'activo'), '[]'::jsonb),
    'pedido_base', (select count(*) from compras_plantilla_base where proveedor_id = p_id),
    'solicitudes_abiertas', (
      select count(distinct s.id)
      from compras_solicitudes s
      join compras_solicitud_items si on si.solicitud_id = s.id
      where s.estado = 'abierta' and si.incluir and si.proveedor_id = p_id),
    'referencias', v_ref,
    'puede_eliminar', not exists (select 1 from jsonb_each(v_ref) e where (e.value)::int > 0)
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 3.9 proveedores_archivar (E1, E2, E20). Reactivar no tiene condiciones.
-- FOR NO KEY UPDATE no choca con el KEY SHARE de las FK (cerrar_conteo_fabrica).
-- ---------------------------------------------------------------------------

create or replace function public.proveedores_archivar(p_id uuid, p_archivar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prov    proveedores%rowtype;
  v_destino text := case when p_archivar then 'archivado' else 'activo' end;
  v_cant    int;
  v_codigos text;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select * into v_prov from proveedores where id = p_id for no key update;
  if not found then
    raise exception 'No encontramos el proveedor. Recargá la página.';
  end if;

  if v_prov.estado = v_destino then
    return jsonb_build_object('cambio', false, 'estado', v_destino);   -- doble clic
  end if;

  if p_archivar then
    select count(*),
           string_agg('P-' || lpad(a.numero::text, 4, '0'), ', ' order by a.numero) filter (where a.rn <= 5)
      into v_cant, v_codigos
    from (select x.numero, row_number() over (order by x.numero) rn from _compras_pedidos_abiertos_de(p_id) x) a;
    if v_cant > 0 then
      raise exception '% tiene % %: %. Recibilos, facturalos o cerralos a mano antes de archivarlo.',
        v_prov.nombre, v_cant,
        case when v_cant = 1 then 'pedido abierto' else 'pedidos abiertos' end,
        v_codigos || case when v_cant > 5 then ' y ' || (v_cant - 5) || ' más' else '' end;
    end if;
  end if;

  update proveedores set estado = v_destino, updated_at = now() where id = p_id;

  return jsonb_build_object('cambio', true, 'estado', v_destino);
end;
$$;


-- ---------------------------------------------------------------------------
-- 3.10 proveedores_eliminar (E5): solo sin referencias. Las FK son el respaldo.
-- ---------------------------------------------------------------------------

create or replace function public.proveedores_eliminar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_ref    jsonb;
  v_partes text[] := '{}';
  v_n      int;
  r        record;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select nombre into v_nombre from proveedores where id = p_id for update;
  if not found then
    raise exception 'No encontramos el proveedor. Recargá la página.';
  end if;

  v_ref := _proveedores_referencias(p_id);
  for r in select * from (values
      ('pedidos', 'pedido', 'pedidos', 1),
      ('pedidos_eliminados', 'pedido eliminado', 'pedidos eliminados', 2),
      ('facturas', 'factura', 'facturas', 3),
      ('gastos', 'gasto', 'gastos', 4),
      ('insumos', 'insumo asociado', 'insumos asociados', 5),
      ('solicitudes', 'solicitud', 'solicitudes', 6),
      ('pedido_base', 'línea del pedido base', 'líneas del pedido base', 7),
      ('historial', 'cambio en el historial de insumos', 'cambios en el historial de insumos', 8)
    ) t(clave, singular, plural, orden) order by orden
  loop
    v_n := (v_ref->>r.clave)::int;
    if v_n > 0 then
      v_partes := v_partes || (v_n || ' ' || case when v_n = 1 then r.singular else r.plural end);
    end if;
  end loop;

  if cardinality(v_partes) > 0 then
    raise exception 'No se puede eliminar % porque tiene %. Archivalo: deja de aparecer para pedidos nuevos y conserva su historia.',
      v_nombre,
      case when cardinality(v_partes) = 1 then v_partes[1]
           else array_to_string(v_partes[1:cardinality(v_partes) - 1], ', ') || ' y ' || v_partes[cardinality(v_partes)] end;
  end if;

  delete from proveedores where id = p_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3.11 Guardas en las funciones de pedido (E4). Cuerpos de 20261005140000;
-- los cambios van marcados "B3".
-- ---------------------------------------------------------------------------

create or replace function public.compras_guardar_pedido(
  p_pedido_id uuid default null,
  p_proveedor_id uuid default null,
  p_local_facturacion_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido    compras_pedidos%rowtype;
  v_id        uuid;
  v_linea     record;
  v_ids       uuid[];
  v_bloqueada text;
  v_nuevo     boolean := p_pedido_id is null;      -- B1
  v_antes     jsonb;                               -- B1
  v_despues   jsonb;                               -- B1
  v_diff      jsonb;                               -- B1
  v_cambios   boolean := false;                    -- B1
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Las líneas del pedido vienen mal armadas. Recargá la página.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where nullif(btrim(e->>'descripcion'), '') is null
       or coalesce((e->>'cantidad')::numeric, 0) <= 0
  ) then
    raise exception 'Cada línea necesita una descripción y una cantidad mayor a 0.';
  end if;

  if v_nuevo then
    if p_proveedor_id is null then
      raise exception 'Elegí un proveedor.';
    end if;
    perform _compras_exigir_proveedor_activo(p_proveedor_id, 'para pedirle');   -- B3
    insert into compras_pedidos (proveedor_id, local_facturacion_id, estado, creado_por)
    values (p_proveedor_id, p_local_facturacion_id, 'borrador', auth.uid())
    returning * into v_pedido;
  else
    select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
    if not found then
      raise exception 'No encontramos el pedido. Puede que alguien lo haya borrado: recargá la página.';
    end if;
    if v_pedido.estado_facturacion = 'facturado' then
      raise exception 'El pedido % ya está facturado: anulá la factura para editarlo.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    if v_pedido.estado_recepcion in ('cerrado_manual', 'devuelto') then
      raise exception 'El pedido % está cerrado: reabrilo para editarlo.', 'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    if p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id and v_pedido.estado_recepcion <> 'sin_enviar' then
      raise exception 'No se puede cambiar el proveedor de un pedido ya enviado.';
    end if;
    if p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id then          -- B3
      perform _compras_exigir_proveedor_activo(p_proveedor_id, 'para pedirle');
    end if;

    v_antes := compras_lineas_pedido_snapshot(v_pedido.id);   -- B1: foto con el pedido ya bloqueado
    -- B1: el update de cabecera se mueve abajo, después del diff (E5, E6).
  end if;
  v_id := v_pedido.id;

  -- Ids que se conservan (y que tienen que ser de este pedido).
  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(e->>'id', '') is not null;

  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from compras_pedido_items pi where pi.id = x.id and pi.pedido_id = v_id)
  ) then
    raise exception 'Alguien cambió este pedido mientras lo editabas. Recargá la página.';
  end if;

  -- Una línea con remitos no se puede quitar.
  select pi.descripcion into v_bloqueada
  from compras_pedido_items pi
  where pi.pedido_id = v_id
    and pi.id <> all (v_ids)
    and exists (select 1 from compras_remito_items ri where ri.pedido_item_id = pi.id)
  limit 1;
  if v_bloqueada is not null then
    raise exception 'La línea "%" ya tiene remitos cargados: no se puede quitar. Si llegó menos, dejala y cerrá el pedido a mano.', v_bloqueada;
  end if;

  delete from compras_pedido_items pi
  where pi.pedido_id = v_id and pi.id <> all (v_ids);

  for v_linea in
    select e, (ord - 1)::int as orden
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord)
  loop
    if nullif(v_linea.e->>'id', '') is not null then
      update compras_pedido_items
        set item_id = nullif(v_linea.e->>'item_id', '')::uuid,
            descripcion = btrim(v_linea.e->>'descripcion'),
            unidad = nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
            cantidad = (v_linea.e->>'cantidad')::numeric,
            orden = v_linea.orden
        where id = (v_linea.e->>'id')::uuid;
    else
      insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden)
      values (
        v_id,
        nullif(v_linea.e->>'item_id', '')::uuid,
        btrim(v_linea.e->>'descripcion'),
        nullif(btrim(coalesce(v_linea.e->>'unidad', '')), ''),
        (v_linea.e->>'cantidad')::numeric,
        v_linea.orden
      );
    end if;
  end loop;

  v_despues := compras_lineas_pedido_snapshot(v_id);          -- B1

  if v_nuevo then
    perform compras_registrar_evento_pedido(v_id, 'creado',
      jsonb_build_object('origen', 'manual', 'lineas', v_despues));
    v_cambios := true;
  else
    v_diff := compras_diff_lineas(v_antes, v_despues);
    if v_diff <> '{}'::jsonb then
      perform compras_registrar_evento_pedido(v_id, 'items_editados', v_diff);
      v_cambios := true;
    end if;

    if p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id then
      perform compras_registrar_evento_pedido(v_id, 'proveedor_cambiado', jsonb_build_object(
        'de', jsonb_build_object('id', v_pedido.proveedor_id,
                                 'nombre', (select nombre from proveedores where id = v_pedido.proveedor_id)),
        'a',  jsonb_build_object('id', p_proveedor_id,
                                 'nombre', (select nombre from proveedores where id = p_proveedor_id))
      ));
      v_cambios := true;
    end if;

    -- E5: el mensaje de WhatsApp se arma con las líneas: solo queda viejo (y se
    -- borra) si algo cambió, así nunca se manda un pedido desactualizado.
    -- E6: el local de un pedido existente no se toca acá.
    if v_cambios then
      update compras_pedidos
        set proveedor_id = coalesce(p_proveedor_id, proveedor_id),
            mensaje = null
        where id = v_id;
    end if;
  end if;

  perform compras_recalcular_estado_pedido(v_id);

  return jsonb_build_object('id', v_id, 'numero', v_pedido.numero, 'cambios', v_cambios);  -- B1: + cambios
end;
$$;

create or replace function public.compras_reabrir_pedido(p_pedido_id uuid)
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

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  if v_pedido.estado_recepcion <> 'cerrado_manual' then
    raise exception 'Solo se puede reabrir un pedido cerrado a mano.';
  end if;
  perform _compras_exigir_proveedor_activo(v_pedido.proveedor_id, 'para reabrir el pedido');   -- B3

  -- El recálculo decide si vuelve a Enviado, Parcial o Recibido.
  update compras_pedidos
    set estado_recepcion = 'enviado',
        reabierto_por = auth.uid(),
        reabierto_en = now()
    where id = p_pedido_id;

  perform compras_recalcular_estado_pedido(p_pedido_id);

  -- B1: después del recálculo, para saber en qué estado quedó.
  perform compras_registrar_evento_pedido(p_pedido_id, 'reabierto', jsonb_build_object(
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = p_pedido_id),
    'motivo_cierre', v_pedido.cierre_motivo));
end;
$$;

create or replace function public.convertir_solicitud_a_pedidos(p_solicitud_id uuid)
returns integer
language plpgsql
security definer
set search_path = public                       -- B1: faltaba
as $$
declare
  v_solicitud    compras_solicitudes%rowtype;  -- B1
  v_proveedor_id uuid;
  v_pedido_id    uuid;
  v_creados      integer := 0;
  v_archivados   text;                         -- B3
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_solicitud from compras_solicitudes
  where id = p_solicitud_id and estado = 'abierta' for update;
  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;

  -- B3 (E4, E20): ningún pedido nuevo para un proveedor archivado; todo o nada.
  perform 1 from proveedores
  where id in (select proveedor_id from compras_solicitud_items
               where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0)
  for share;
  select string_agg(p.nombre, ', ' order by p.nombre) into v_archivados
  from proveedores p
  where p.estado <> 'activo'
    and p.id in (select proveedor_id from compras_solicitud_items
                 where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0);
  if v_archivados is not null then
    raise exception 'Hay líneas para % (archivado): cambiales el proveedor o reactivalo en Proveedores.', v_archivados;
  end if;

  for v_proveedor_id in
    select distinct proveedor_id
    from compras_solicitud_items
    where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0
  loop
    insert into compras_pedidos (proveedor_id, local_facturacion_id, estado, creado_por, solicitud_id)
    values (
      v_proveedor_id,
      (select local_facturacion_id from proveedores where id = v_proveedor_id),   -- B1 (E14)
      'borrador', auth.uid(), p_solicitud_id
    )
    returning id into v_pedido_id;

    insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden, solicitud_item_id)
    select v_pedido_id, csi.item_id, csi.descripcion, csi.unidad, csi.cantidad_ajustada,
           row_number() over (order by csi.orden, csi.descripcion) - 1,
           csi.id                                                                    -- B1
    from compras_solicitud_items csi
    where csi.solicitud_id = p_solicitud_id
      and csi.proveedor_id = v_proveedor_id
      and csi.incluir
      and csi.cantidad_ajustada > 0;

    perform compras_registrar_evento_pedido(v_pedido_id, 'creado', jsonb_build_object(   -- B1
      'origen', 'solicitud',
      'solicitud_id', p_solicitud_id,
      'solicitud_tipo', v_solicitud.tipo,
      'solicitud_fecha', v_solicitud.created_at,
      'conteo_id', v_solicitud.conteo_id,
      'lineas', compras_lineas_pedido_snapshot(v_pedido_id)
    ));

    v_creados := v_creados + 1;
  end loop;

  update compras_solicitudes
    set estado = 'convertida', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id;

  return v_creados;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3.12 v_compras_proveedor_insumos: pestaña Insumos de la ficha. Corre como
-- dueño, como las otras v_compras_*; el último precio facturado es de admin.
-- ---------------------------------------------------------------------------

create or replace view public.v_compras_proveedor_insumos as
select
  ip.proveedor_id, ip.item_id,
  i.nombre as item_nombre, i.unidad, i.estado as item_estado,
  i.unidad_base, i.cantidad_por_unidad as contenido,          -- A2b
  ip.activo, ip.es_principal, ip.codigo_proveedor, ip.precio_ref,
  ip.cobra_por,                                                -- A2b
  case when es_admin() then uf.precio_unitario end as ultimo_precio,
  case when es_admin() then uf.precio_por      end as ultimo_precio_por,   -- A2b
  case when es_admin() then uf.fecha           end as ultima_factura_fecha,
  case when es_admin() then uf.factura_id      end as ultima_factura_id
from compras_item_proveedores ip
join compras_items i on i.id = ip.item_id
left join lateral (
  select fi.precio_unitario, fi.precio_por, f.fecha, f.id as factura_id
  from compras_factura_items fi
  join compras_facturas f on f.id = fi.factura_id
  where fi.item_id = ip.item_id and f.proveedor_id = ip.proveedor_id
    and f.estado = 'confirmada' and f.tipo_comprobante = 'factura' and fi.precio_unitario > 0
  order by f.fecha desc, f.confirmada_en desc nulls last
  limit 1
) uf on true
where tiene_acceso_compras();

grant select on public.v_compras_proveedor_insumos to authenticated;


-- ---------------------------------------------------------------------------
-- 3.13 Grants
-- ---------------------------------------------------------------------------

revoke execute on function public._compras_exigir_proveedor_activo(uuid, text) from public, anon, authenticated;
revoke execute on function public._compras_pedidos_abiertos_de(uuid)           from public, anon, authenticated;
revoke execute on function public._proveedores_referencias(uuid)               from public, anon, authenticated;

revoke execute on function public.proveedores_guardar(uuid, jsonb)      from public, anon;
grant  execute on function public.proveedores_guardar(uuid, jsonb)      to authenticated;
revoke execute on function public.proveedores_impacto(uuid)             from public, anon;
grant  execute on function public.proveedores_impacto(uuid)             to authenticated;
revoke execute on function public.proveedores_archivar(uuid, boolean)   from public, anon;
grant  execute on function public.proveedores_archivar(uuid, boolean)   to authenticated;
revoke execute on function public.proveedores_eliminar(uuid)            from public, anon;
grant  execute on function public.proveedores_eliminar(uuid)            to authenticated;

revoke execute on function public.compras_guardar_pedido(uuid, uuid, uuid, jsonb) from public, anon;
grant  execute on function public.compras_guardar_pedido(uuid, uuid, uuid, jsonb) to authenticated;
revoke execute on function public.compras_reabrir_pedido(uuid) from public, anon;
grant  execute on function public.compras_reabrir_pedido(uuid) to authenticated;
revoke execute on function public.convertir_solicitud_a_pedidos(uuid) from public, anon;
grant  execute on function public.convertir_solicitud_a_pedidos(uuid) to authenticated;
