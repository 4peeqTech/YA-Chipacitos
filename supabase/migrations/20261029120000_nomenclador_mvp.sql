-- Nomenclador — MVP (T1). Plan: artifact de Traycer "Nomenclador — Plan técnico del MVP".
--
-- Catálogo único de materia prima, insumos, semielaborados, productos,
-- presentaciones de venta, combos y conceptos, con código interno, códigos
-- de Posberry/Fudo y composición (receta / presentación / combo).
--
-- Todo es nuevo: no hay FKs hacia ni desde los catálogos actuales
-- (compras_items, fabrica_*, productos, fudo_productos). Se conectan después,
-- cuando Marcos dé el OK. Por eso esta migración no toca datos existentes.
--
--   1. Acceso: tiene_acceso_nomenclador()
--   2. Parámetros: categorías, sabores, presentaciones
--   3. Ítems + código interno generado (<PREFIJO>-0001, no cambia)
--   4. Componentes (composición) con validación de tipos y ciclos
--   5. Códigos externos (Posberry / Fudo)
--   6. RLS: solo lectura; la escritura pasa por las RPCs
--   7. RPCs


-- ---------------------------------------------------------------------------
-- 1. Acceso
-- ---------------------------------------------------------------------------

create or replace function public.tiene_acceso_nomenclador()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and estado = 'activo'
      and (rol = 'admin' or modulos_permitidos && array['nomenclador'])
  );
$$;


-- ---------------------------------------------------------------------------
-- 2. Parámetros
-- ---------------------------------------------------------------------------

create table public.nomenclador_categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (btrim(nombre) <> ''),
  -- Opcional: solo sirve para filtrar las categorías al elegir tipo.
  tipo       text check (tipo in ('materia_prima', 'insumo', 'semielaborado', 'producto_terminado',
                                  'presentacion', 'combo', 'concepto')),
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index nomenclador_categorias_nombre_uq on public.nomenclador_categorias (lower(btrim(nombre)));

create table public.nomenclador_sabores (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null check (btrim(nombre) <> ''),
  nombres_alternativos text[] not null default '{}',   -- Roquefort = Queso Azul
  orden                integer not null default 0,
  activo               boolean not null default true,
  created_at           timestamptz not null default now()
);
create unique index nomenclador_sabores_nombre_uq on public.nomenclador_sabores (lower(btrim(nombre)));

create table public.nomenclador_presentaciones (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (btrim(nombre) <> ''),   -- "1/2 kg Mayorista", "100 gr horneado"
  cantidad   numeric check (cantidad > 0),
  unidad     text check (unidad in ('kg', 'unidades', 'litros')),
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint nomenclador_presentaciones_cantidad_con_unidad check ((cantidad is null) = (unidad is null))
);
create unique index nomenclador_presentaciones_nombre_uq on public.nomenclador_presentaciones (lower(btrim(nombre)));


-- ---------------------------------------------------------------------------
-- 3. Ítems y código interno
-- ---------------------------------------------------------------------------

create table public.nomenclador_codigo_secuencias (
  prefijo text primary key,
  ultimo  integer not null default 0
);
insert into public.nomenclador_codigo_secuencias (prefijo) values
  ('MP'), ('IN'), ('SE'), ('PT'), ('PV'), ('CB'), ('CO');

create or replace function public._nomenclador_prefijo(p_tipo text)
returns text language sql immutable set search_path = public as $$
  select case p_tipo
    when 'materia_prima'      then 'MP'
    when 'insumo'             then 'IN'
    when 'semielaborado'      then 'SE'
    when 'producto_terminado' then 'PT'
    when 'presentacion'       then 'PV'
    when 'combo'              then 'CB'
    when 'concepto'           then 'CO'
  end;
$$;

-- El update toma el lock de la fila del prefijo: dos altas simultáneas no
-- pueden sacar el mismo número.
create or replace function public._nomenclador_siguiente_codigo(p_tipo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefijo text := _nomenclador_prefijo(p_tipo);
  v_n integer;
begin
  update nomenclador_codigo_secuencias set ultimo = ultimo + 1
   where prefijo = v_prefijo
  returning ultimo into v_n;
  if v_n is null then raise exception 'Tipo de ítem desconocido: %', p_tipo; end if;
  return v_prefijo || '-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0');
end $$;

create table public.nomenclador_items (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null unique,           -- lo completa el trigger
  tipo                 text not null check (tipo in ('materia_prima', 'insumo', 'semielaborado',
                         'producto_terminado', 'presentacion', 'combo', 'concepto')),
  nombre               text not null check (btrim(nombre) <> ''),
  nombres_alternativos text[] not null default '{}',
  categoria_id         uuid references public.nomenclador_categorias(id) on delete set null,
  sabor_id             uuid references public.nomenclador_sabores(id) on delete set null,
  presentacion_id      uuid references public.nomenclador_presentaciones(id) on delete set null,
  variante_de          uuid references public.nomenclador_items(id) on delete restrict,
  unidad_base          text check (unidad_base in ('kg', 'unidades', 'litros')),
  rinde_cantidad       numeric check (rinde_cantidad > 0),   -- en la unidad base del ítem
  notas                text,
  a_revisar            boolean not null default false,
  estado               text not null default 'activo' check (estado in ('activo', 'archivado')),
  clave_importacion    text unique,                     -- el script de carga es re-ejecutable
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles(id) on delete set null,
  constraint nomenclador_items_unidad_obligatoria check (tipo in ('concepto', 'combo') or unidad_base is not null),
  constraint nomenclador_items_variante_no_propia check (variante_de is null or variante_de <> id)
);
-- Sin códigos con prefijo cambiado a mano.
alter table public.nomenclador_items
  add constraint nomenclador_items_codigo_formato check (codigo ~ '^(MP|IN|SE|PT|PV|CB|CO)-[0-9]{4,}$');
-- Dos ítems activos del mismo tipo no pueden llamarse igual.
create unique index nomenclador_items_nombre_uq on public.nomenclador_items (tipo, lower(btrim(nombre)))
  where estado = 'activo';
-- Generador sin duplicados: una presentación por producto base.
create unique index nomenclador_items_variante_uq on public.nomenclador_items (variante_de, presentacion_id)
  where variante_de is not null and presentacion_id is not null;
create index nomenclador_items_categoria_idx    on public.nomenclador_items (categoria_id);
create index nomenclador_items_sabor_idx        on public.nomenclador_items (sabor_id);
create index nomenclador_items_presentacion_idx on public.nomenclador_items (presentacion_id);
create index nomenclador_items_variante_idx     on public.nomenclador_items (variante_de);

create table public.nomenclador_componentes (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.nomenclador_items(id) on delete cascade,
  componente_id uuid not null references public.nomenclador_items(id) on delete restrict,
  cantidad      numeric check (cantidad > 0),          -- opcional: las recetas se completan con Marcos
  unidad        text check (unidad in ('kg', 'unidades', 'litros')),
  merma_pct     numeric check (merma_pct >= 0 and merma_pct < 100),
  orden         integer not null default 0,
  notas         text,
  constraint nomenclador_componentes_uq unique (item_id, componente_id),
  constraint nomenclador_componentes_no_propio check (item_id <> componente_id)
);
create index nomenclador_componentes_componente_idx on public.nomenclador_componentes (componente_id);

-- Ítems: código al crear, código nuevo al cambiar de tipo (solo "a revisar"),
-- reglas de tipo y bloqueo al archivar algo que está en uso.
create or replace function public._nomenclador_items_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_usos text;
begin
  if tg_op = 'INSERT' then
    if new.codigo is null then new.codigo := _nomenclador_siguiente_codigo(new.tipo); end if;
    return new;
  end if;

  if new.codigo is distinct from old.codigo and new.tipo = old.tipo then
    raise exception 'El código de un ítem no se puede cambiar.';
  end if;

  if new.tipo <> old.tipo then
    if not old.a_revisar then
      raise exception 'El tipo solo se puede cambiar mientras el ítem está "a revisar" (cambia el código).';
    end if;
    new.codigo := _nomenclador_siguiente_codigo(new.tipo);
    if new.tipo in ('materia_prima', 'insumo', 'concepto')
       and exists (select 1 from nomenclador_componentes where item_id = new.id) then
      raise exception 'Ese tipo no lleva composición: primero quitale los componentes.';
    end if;
    if new.tipo = 'concepto'
       and exists (select 1 from nomenclador_componentes where componente_id = new.id) then
      raise exception 'Un concepto no puede ser componente de otro ítem, y este se usa en alguna composición.';
    end if;
  end if;

  if new.estado = 'archivado' and old.estado <> 'archivado' then
    select string_agg(i.codigo || ' ' || i.nombre, ', ' order by i.codigo) into v_usos
      from nomenclador_componentes c
      join nomenclador_items i on i.id = c.item_id
     where c.componente_id = new.id and i.estado = 'activo';
    if v_usos is not null then
      raise exception 'No se puede archivar: lo usan %.', v_usos;
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create trigger nomenclador_items_antes
  before insert or update on public.nomenclador_items
  for each row execute function public._nomenclador_items_antes();

-- Componentes: tipos que no llevan composición, conceptos y archivados como
-- componente, y ciclos (A lleva B ... y B lleva A).
create or replace function public._nomenclador_componentes_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item nomenclador_items;
  v_comp nomenclador_items;
begin
  select * into v_item from nomenclador_items where id = new.item_id;
  select * into v_comp from nomenclador_items where id = new.componente_id;

  if v_item.tipo in ('materia_prima', 'insumo', 'concepto') then
    raise exception '% no lleva composición: es %.', v_item.codigo,
      case v_item.tipo when 'materia_prima' then 'materia prima' when 'insumo' then 'un insumo' else 'un concepto' end;
  end if;
  if v_comp.tipo = 'concepto' then
    raise exception '% es un concepto y no puede ser componente.', v_comp.codigo;
  end if;
  if v_comp.estado = 'archivado' then
    raise exception '% está archivado y no puede usarse como componente.', v_comp.codigo;
  end if;

  if exists (
    with recursive debajo(id) as (
      select new.componente_id
      union
      select c.componente_id from nomenclador_componentes c join debajo d on c.item_id = d.id
    )
    select 1 from debajo where id = new.item_id
  ) then
    raise exception 'Se formaría un ciclo: % ya lleva (directa o indirectamente) a %.', v_comp.codigo, v_item.codigo;
  end if;
  return new;
end $$;

create trigger nomenclador_componentes_antes
  before insert or update on public.nomenclador_componentes
  for each row execute function public._nomenclador_componentes_antes();


-- ---------------------------------------------------------------------------
-- 5. Códigos externos
-- ---------------------------------------------------------------------------

create table public.nomenclador_externos (
  id         uuid primary key default gen_random_uuid(),
  sistema    text not null check (sistema in ('posberry', 'fudo')),
  codigo     text not null check (btrim(codigo) <> ''),
  nombre     text not null,
  item_id    uuid references public.nomenclador_items(id) on delete set null,   -- null = sin mapear
  origen     text not null default 'manual' check (origen in ('excel_marcos', 'manual')),
  activo     boolean not null default true,
  notas      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nomenclador_externos_uq unique (sistema, codigo)
);
create index nomenclador_externos_item_idx on public.nomenclador_externos (item_id);


-- ---------------------------------------------------------------------------
-- 6. RLS: lectura con acceso al módulo; sin policies de escritura
-- ---------------------------------------------------------------------------

alter table public.nomenclador_categorias        enable row level security;
alter table public.nomenclador_sabores           enable row level security;
alter table public.nomenclador_presentaciones    enable row level security;
alter table public.nomenclador_codigo_secuencias enable row level security;
alter table public.nomenclador_items             enable row level security;
alter table public.nomenclador_componentes       enable row level security;
alter table public.nomenclador_externos          enable row level security;

create policy nomenclador_categorias_lectura on public.nomenclador_categorias
  for select to authenticated using ((select tiene_acceso_nomenclador()));
create policy nomenclador_sabores_lectura on public.nomenclador_sabores
  for select to authenticated using ((select tiene_acceso_nomenclador()));
create policy nomenclador_presentaciones_lectura on public.nomenclador_presentaciones
  for select to authenticated using ((select tiene_acceso_nomenclador()));
create policy nomenclador_items_lectura on public.nomenclador_items
  for select to authenticated using ((select tiene_acceso_nomenclador()));
create policy nomenclador_componentes_lectura on public.nomenclador_componentes
  for select to authenticated using ((select tiene_acceso_nomenclador()));
create policy nomenclador_externos_lectura on public.nomenclador_externos
  for select to authenticated using ((select tiene_acceso_nomenclador()));
-- nomenclador_codigo_secuencias: sin policies, solo la usa _nomenclador_siguiente_codigo.


-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------

-- Traduce los errores de constraints a mensajes para el usuario.
create or replace function public._nomenclador_mensaje_constraint(p_constraint text)
returns text language sql immutable set search_path = public as $$
  select case p_constraint
    when 'nomenclador_items_nombre_uq'              then 'Ya hay un ítem activo de ese tipo con ese nombre.'
    when 'nomenclador_items_variante_uq'            then 'Ese producto ya tiene un ítem para esa presentación.'
    when 'nomenclador_items_unidad_obligatoria'     then 'La unidad base es obligatoria (salvo en conceptos y combos).'
    when 'nomenclador_categorias_nombre_uq'         then 'Ya hay una categoría con ese nombre.'
    when 'nomenclador_sabores_nombre_uq'            then 'Ya hay un sabor con ese nombre.'
    when 'nomenclador_presentaciones_nombre_uq'     then 'Ya hay una presentación con ese nombre.'
    when 'nomenclador_presentaciones_cantidad_con_unidad' then 'La cantidad y la unidad de la presentación van juntas.'
    when 'nomenclador_externos_uq'                  then 'Ese código ya está cargado para ese sistema.'
    when 'nomenclador_componentes_uq'               then 'Un componente está repetido.'
    else 'Algún dato no es válido (' || coalesce(p_constraint, 'sin detalle') || ').'
  end;
$$;

-- Alta o edición de un ítem. Solo se tocan las claves presentes en p_datos.
create or replace function public.nomenclador_guardar_item(p_item_id uuid default null, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_k text;
  v_id uuid := p_item_id;
  v_codigo text;
  v_constraint text;
  v_permitidas text[] := array['tipo', 'nombre', 'nombres_alternativos', 'categoria_id', 'sabor_id',
    'presentacion_id', 'variante_de', 'unidad_base', 'rinde_cantidad', 'notas', 'a_revisar'];
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_datos) <> 'object' then raise exception 'Los datos del ítem no son válidos.'; end if;
  for v_k in select jsonb_object_keys(p_datos) loop
    if not v_k = any(v_permitidas) then raise exception 'El campo "%" no se edita acá.', v_k; end if;
  end loop;

  begin
    if v_id is null then
      if coalesce(btrim(p_datos->>'nombre'), '') = '' then raise exception 'El nombre es obligatorio.'; end if;
      if _nomenclador_prefijo(p_datos->>'tipo') is null then raise exception 'Elegí un tipo de ítem.'; end if;
      insert into nomenclador_items (tipo, nombre, nombres_alternativos, categoria_id, sabor_id, presentacion_id,
                                     variante_de, unidad_base, rinde_cantidad, notas, a_revisar)
      values (
        p_datos->>'tipo',
        btrim(p_datos->>'nombre'),
        coalesce(array(select btrim(x) from jsonb_array_elements_text(p_datos->'nombres_alternativos') x where btrim(x) <> ''), '{}'),
        (p_datos->>'categoria_id')::uuid,
        (p_datos->>'sabor_id')::uuid,
        (p_datos->>'presentacion_id')::uuid,
        (p_datos->>'variante_de')::uuid,
        p_datos->>'unidad_base',
        (p_datos->>'rinde_cantidad')::numeric,
        nullif(btrim(p_datos->>'notas'), ''),
        coalesce((p_datos->>'a_revisar')::boolean, false)
      )
      returning id, codigo into v_id, v_codigo;
    else
      if p_datos ? 'nombre' and coalesce(btrim(p_datos->>'nombre'), '') = '' then
        raise exception 'El nombre es obligatorio.';
      end if;
      update nomenclador_items set
        tipo                 = case when p_datos ? 'tipo' then p_datos->>'tipo' else tipo end,
        nombre               = case when p_datos ? 'nombre' then btrim(p_datos->>'nombre') else nombre end,
        nombres_alternativos = case when p_datos ? 'nombres_alternativos' then
          coalesce(array(select btrim(x) from jsonb_array_elements_text(p_datos->'nombres_alternativos') x where btrim(x) <> ''), '{}')
          else nombres_alternativos end,
        categoria_id         = case when p_datos ? 'categoria_id' then (p_datos->>'categoria_id')::uuid else categoria_id end,
        sabor_id             = case when p_datos ? 'sabor_id' then (p_datos->>'sabor_id')::uuid else sabor_id end,
        presentacion_id      = case when p_datos ? 'presentacion_id' then (p_datos->>'presentacion_id')::uuid else presentacion_id end,
        variante_de          = case when p_datos ? 'variante_de' then (p_datos->>'variante_de')::uuid else variante_de end,
        unidad_base          = case when p_datos ? 'unidad_base' then p_datos->>'unidad_base' else unidad_base end,
        rinde_cantidad       = case when p_datos ? 'rinde_cantidad' then (p_datos->>'rinde_cantidad')::numeric else rinde_cantidad end,
        notas                = case when p_datos ? 'notas' then nullif(btrim(p_datos->>'notas'), '') else notas end,
        a_revisar            = case when p_datos ? 'a_revisar' then (p_datos->>'a_revisar')::boolean else a_revisar end
      where id = v_id
      returning codigo into v_codigo;
      if v_codigo is null then raise exception 'Ese ítem no existe. Recargá la página.'; end if;
    end if;
  exception
    when unique_violation or check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', _nomenclador_mensaje_constraint(v_constraint);
    when foreign_key_violation then
      raise exception 'La categoría, el sabor, la presentación o el producto base elegido ya no existe. Recargá la página.';
    when invalid_text_representation then
      raise exception 'Algún dato no tiene el formato correcto (por ejemplo, un número).';
  end;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end $$;

create or replace function public.nomenclador_archivar_item(p_item_id uuid, p_archivar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  update nomenclador_items set estado = case when p_archivar then 'archivado' else 'activo' end
   where id = p_item_id;
  if not found then raise exception 'Ese ítem no existe. Recargá la página.'; end if;
exception
  when unique_violation then
    raise exception 'No se puede reactivar: ya hay otro ítem activo de ese tipo con ese nombre.';
end $$;

create or replace function public.nomenclador_marcar_revisado(p_ids uuid[], p_revisado boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  update nomenclador_items set a_revisar = not p_revisado
   where id = any(p_ids) and a_revisar = p_revisado;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Reemplaza la composición completa de un ítem (y su rendimiento).
-- p_componentes: [{componente_id, cantidad?, unidad?, merma_pct?, notas?}, ...] en orden.
create or replace function public.nomenclador_guardar_componentes(
  p_item_id uuid, p_rinde_cantidad numeric default null, p_componentes jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_c jsonb;
  v_orden integer := 0;
  v_constraint text;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_componentes) <> 'array' then raise exception 'Los componentes no son válidos.'; end if;
  perform 1 from nomenclador_items where id = p_item_id for update;
  if not found then raise exception 'Ese ítem no existe. Recargá la página.'; end if;

  begin
    update nomenclador_items set rinde_cantidad = p_rinde_cantidad where id = p_item_id;
    delete from nomenclador_componentes where item_id = p_item_id;
    for v_c in select * from jsonb_array_elements(p_componentes) loop
      v_orden := v_orden + 1;
      insert into nomenclador_componentes (item_id, componente_id, cantidad, unidad, merma_pct, orden, notas)
      values (p_item_id, (v_c->>'componente_id')::uuid, (v_c->>'cantidad')::numeric, v_c->>'unidad',
              (v_c->>'merma_pct')::numeric, v_orden, nullif(btrim(v_c->>'notas'), ''));
    end loop;
  exception
    when unique_violation or check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'nomenclador_componentes_no_propio' then
        raise exception 'Un ítem no puede ser componente de sí mismo.';
      end if;
      if v_constraint like 'nomenclador_componentes_%check' or v_constraint like 'nomenclador_items_%check' then
        raise exception 'Revisá las cantidades: tienen que ser mayores a 0 y la merma, entre 0 y 99.';
      end if;
      raise exception '%', _nomenclador_mensaje_constraint(v_constraint);
    when foreign_key_violation then
      raise exception 'Algún componente ya no existe. Recargá la página.';
    when invalid_text_representation then
      raise exception 'Revisá las cantidades: tienen que ser números.';
  end;
end $$;

-- Alta o edición de un código externo. p_datos: sistema, codigo, nombre, item_id, activo, notas.
create or replace function public.nomenclador_guardar_externo(p_externo_id uuid default null, p_datos jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_externo_id;
  v_constraint text;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_datos) <> 'object' then raise exception 'Los datos del código no son válidos.'; end if;
  begin
    if v_id is null then
      if coalesce(btrim(p_datos->>'codigo'), '') = '' then raise exception 'El código es obligatorio.'; end if;
      if p_datos->>'sistema' not in ('posberry', 'fudo') then raise exception 'Elegí Posberry o Fudo.'; end if;
      insert into nomenclador_externos (sistema, codigo, nombre, item_id, origen, activo, notas)
      values (p_datos->>'sistema', btrim(p_datos->>'codigo'), coalesce(btrim(p_datos->>'nombre'), ''),
              (p_datos->>'item_id')::uuid, 'manual', coalesce((p_datos->>'activo')::boolean, true),
              nullif(btrim(p_datos->>'notas'), ''))
      returning id into v_id;
    else
      update nomenclador_externos set
        nombre     = case when p_datos ? 'nombre' then coalesce(btrim(p_datos->>'nombre'), '') else nombre end,
        item_id    = case when p_datos ? 'item_id' then (p_datos->>'item_id')::uuid else item_id end,
        activo     = case when p_datos ? 'activo' then (p_datos->>'activo')::boolean else activo end,
        notas      = case when p_datos ? 'notas' then nullif(btrim(p_datos->>'notas'), '') else notas end,
        updated_at = now()
      where id = v_id;
      if not found then raise exception 'Ese código no existe. Recargá la página.'; end if;
    end if;
  exception
    when unique_violation or check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', _nomenclador_mensaje_constraint(v_constraint);
    when foreign_key_violation then
      raise exception 'Ese ítem ya no existe. Recargá la página.';
  end;
  return v_id;
end $$;

-- Asignar (o quitar, con p_item_id null) el ítem de un código externo.
create or replace function public.nomenclador_asignar_externo(p_externo_id uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform nomenclador_guardar_externo(p_externo_id, jsonb_build_object('item_id', p_item_id));
end $$;

-- ABM de parámetros. p_tabla: 'categoria' | 'sabor' | 'presentacion'.
create or replace function public.nomenclador_guardar_parametro(p_tabla text, p_id uuid default null, p_datos jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
  v_constraint text;
  v_alt text[] := case when p_datos ? 'nombres_alternativos' then
    coalesce(array(select btrim(x) from jsonb_array_elements_text(p_datos->'nombres_alternativos') x where btrim(x) <> ''), '{}') end;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_datos) <> 'object' then raise exception 'Los datos no son válidos.'; end if;
  if p_datos ? 'nombre' and coalesce(btrim(p_datos->>'nombre'), '') = '' then raise exception 'El nombre es obligatorio.'; end if;

  begin
    if p_tabla = 'categoria' then
      if v_id is null then
        insert into nomenclador_categorias (nombre, tipo, orden)
        values (btrim(p_datos->>'nombre'), p_datos->>'tipo', coalesce((p_datos->>'orden')::int, 0))
        returning id into v_id;
      else
        update nomenclador_categorias set
          nombre = case when p_datos ? 'nombre' then btrim(p_datos->>'nombre') else nombre end,
          tipo   = case when p_datos ? 'tipo' then p_datos->>'tipo' else tipo end,
          orden  = case when p_datos ? 'orden' then (p_datos->>'orden')::int else orden end,
          activo = case when p_datos ? 'activo' then (p_datos->>'activo')::boolean else activo end
        where id = v_id;
        if not found then raise exception 'Esa categoría no existe. Recargá la página.'; end if;
      end if;
    elsif p_tabla = 'sabor' then
      if v_id is null then
        insert into nomenclador_sabores (nombre, nombres_alternativos, orden)
        values (btrim(p_datos->>'nombre'), coalesce(v_alt, '{}'), coalesce((p_datos->>'orden')::int, 0))
        returning id into v_id;
      else
        update nomenclador_sabores set
          nombre               = case when p_datos ? 'nombre' then btrim(p_datos->>'nombre') else nombre end,
          nombres_alternativos = coalesce(v_alt, nombres_alternativos),
          orden                = case when p_datos ? 'orden' then (p_datos->>'orden')::int else orden end,
          activo               = case when p_datos ? 'activo' then (p_datos->>'activo')::boolean else activo end
        where id = v_id;
        if not found then raise exception 'Ese sabor no existe. Recargá la página.'; end if;
      end if;
    elsif p_tabla = 'presentacion' then
      if v_id is null then
        insert into nomenclador_presentaciones (nombre, cantidad, unidad, orden)
        values (btrim(p_datos->>'nombre'), (p_datos->>'cantidad')::numeric, p_datos->>'unidad',
                coalesce((p_datos->>'orden')::int, 0))
        returning id into v_id;
      else
        update nomenclador_presentaciones set
          nombre   = case when p_datos ? 'nombre' then btrim(p_datos->>'nombre') else nombre end,
          cantidad = case when p_datos ? 'cantidad' then (p_datos->>'cantidad')::numeric else cantidad end,
          unidad   = case when p_datos ? 'unidad' then p_datos->>'unidad' else unidad end,
          orden    = case when p_datos ? 'orden' then (p_datos->>'orden')::int else orden end,
          activo   = case when p_datos ? 'activo' then (p_datos->>'activo')::boolean else activo end
        where id = v_id;
        if not found then raise exception 'Esa presentación no existe. Recargá la página.'; end if;
      end if;
    else
      raise exception 'Parámetro desconocido: %', p_tabla;
    end if;
  exception
    when unique_violation or check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', _nomenclador_mensaje_constraint(v_constraint);
  end;
  return v_id;
end $$;

-- Generador de variantes: producto base × sabores × presentaciones.
-- Por cada sabor busca (o crea) el producto terminado "<base> <sabor>", y por
-- cada presentación busca (o crea) la presentación de venta
-- "<base> <sabor> · <presentación>" con composición = producto × cantidad.
-- p_base: {nombre, categoria_id?, unidad_base?}. Con p_simular no escribe nada.
-- Devuelve [{accion: 'crear'|'existe', tipo, nombre, codigo?, id?}, ...].
create or replace function public.nomenclador_generar_variantes(
  p_base jsonb, p_sabores uuid[], p_presentaciones uuid[], p_simular boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_base text := btrim(p_base->>'nombre');
  v_cat uuid := (p_base->>'categoria_id')::uuid;
  v_unidad text := coalesce(p_base->>'unidad_base', 'kg');
  v_s nomenclador_sabores;
  v_p nomenclador_presentaciones;
  v_pt nomenclador_items;
  v_pv nomenclador_items;
  v_nombre_pt text;
  v_nombre_pv text;
  v_res jsonb := '[]'::jsonb;
begin
  if not tiene_acceso_nomenclador() then raise exception 'No autorizado'; end if;
  if coalesce(v_base, '') = '' then raise exception 'Escribí el nombre del producto base (ej. "Chipá").'; end if;
  if coalesce(array_length(p_sabores, 1), 0) = 0 then raise exception 'Elegí al menos un sabor.'; end if;
  if coalesce(array_length(p_presentaciones, 1), 0) = 0 then raise exception 'Elegí al menos una presentación.'; end if;

  for v_s in select * from nomenclador_sabores where id = any(p_sabores) order by orden, nombre loop
    v_nombre_pt := v_base || ' ' || v_s.nombre;
    select * into v_pt from nomenclador_items
     where tipo = 'producto_terminado' and estado = 'activo' and lower(btrim(nombre)) = lower(v_nombre_pt);
    if found then
      v_res := v_res || jsonb_build_object('accion', 'existe', 'tipo', 'producto_terminado',
                                           'nombre', v_pt.nombre, 'codigo', v_pt.codigo, 'id', v_pt.id);
    elsif p_simular then
      v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'producto_terminado', 'nombre', v_nombre_pt);
    else
      insert into nomenclador_items (tipo, nombre, categoria_id, sabor_id, unidad_base)
      values ('producto_terminado', v_nombre_pt, v_cat, v_s.id, v_unidad)
      returning * into v_pt;
      v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'producto_terminado',
                                           'nombre', v_pt.nombre, 'codigo', v_pt.codigo, 'id', v_pt.id);
    end if;

    for v_p in select * from nomenclador_presentaciones where id = any(p_presentaciones) order by orden, nombre loop
      v_nombre_pv := v_nombre_pt || ' · ' || v_p.nombre;
      v_pv := null;
      if v_pt.id is not null then
        select * into v_pv from nomenclador_items where variante_de = v_pt.id and presentacion_id = v_p.id;
      end if;
      if v_pv.id is not null then
        v_res := v_res || jsonb_build_object('accion', 'existe', 'tipo', 'presentacion',
                                             'nombre', v_pv.nombre, 'codigo', v_pv.codigo, 'id', v_pv.id);
      elsif p_simular then
        v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'presentacion', 'nombre', v_nombre_pv);
      else
        begin
          insert into nomenclador_items (tipo, nombre, categoria_id, sabor_id, presentacion_id, variante_de, unidad_base)
          values ('presentacion', v_nombre_pv, v_cat, v_s.id, v_p.id, v_pt.id, 'unidades')
          returning * into v_pv;
        exception when unique_violation then
          raise exception 'Ya hay un ítem activo llamado "%". Renombralo o archivalo y volvé a generar.', v_nombre_pv;
        end;
        insert into nomenclador_componentes (item_id, componente_id, cantidad, unidad, orden)
        values (v_pv.id, v_pt.id, v_p.cantidad, v_p.unidad, 1);
        v_res := v_res || jsonb_build_object('accion', 'crear', 'tipo', 'presentacion',
                                             'nombre', v_pv.nombre, 'codigo', v_pv.codigo, 'id', v_pv.id);
      end if;
    end loop;
    v_pt := null;
  end loop;

  return v_res;
exception
  when unique_violation then
    raise exception 'Ya hay un producto terminado activo con uno de esos nombres. Revisá la lista y volvé a generar.';
end $$;


-- Permisos de ejecución: los helpers no se llaman desde el navegador.
revoke execute on function public._nomenclador_prefijo(text) from public, anon, authenticated;
revoke execute on function public._nomenclador_siguiente_codigo(text) from public, anon, authenticated;
revoke execute on function public._nomenclador_mensaje_constraint(text) from public, anon, authenticated;
revoke execute on function public._nomenclador_items_antes() from public, anon, authenticated;
revoke execute on function public._nomenclador_componentes_antes() from public, anon, authenticated;

revoke execute on function public.nomenclador_guardar_item(uuid, jsonb) from public, anon;
revoke execute on function public.nomenclador_archivar_item(uuid, boolean) from public, anon;
revoke execute on function public.nomenclador_marcar_revisado(uuid[], boolean) from public, anon;
revoke execute on function public.nomenclador_guardar_componentes(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.nomenclador_guardar_externo(uuid, jsonb) from public, anon;
revoke execute on function public.nomenclador_asignar_externo(uuid, uuid) from public, anon;
revoke execute on function public.nomenclador_guardar_parametro(text, uuid, jsonb) from public, anon;
revoke execute on function public.nomenclador_generar_variantes(jsonb, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.nomenclador_guardar_item(uuid, jsonb) to authenticated;
grant execute on function public.nomenclador_archivar_item(uuid, boolean) to authenticated;
grant execute on function public.nomenclador_marcar_revisado(uuid[], boolean) to authenticated;
grant execute on function public.nomenclador_guardar_componentes(uuid, numeric, jsonb) to authenticated;
grant execute on function public.nomenclador_guardar_externo(uuid, jsonb) to authenticated;
grant execute on function public.nomenclador_asignar_externo(uuid, uuid) to authenticated;
grant execute on function public.nomenclador_guardar_parametro(text, uuid, jsonb) to authenticated;
grant execute on function public.nomenclador_generar_variantes(jsonb, uuid[], uuid[], boolean) to authenticated;
