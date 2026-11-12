-- Supervisión v2, fase 4a (12-11): clientes mayoristas y registro de equipos.
--
-- Spec v2, secciones "Maestro de clientes mayoristas" y "Registro de equipos
-- entregados a mayoristas".
--
-- - Cada cliente mayorista es un lugar con tipo 'mayorista' (supervision_lugares,
--   fase 1a). Su ficha va en atributos: direccion, rubro, perfil (cocina o
--   congelado), freezer y horno (de Ya! o del cliente) y contacto. Lista propia
--   de supervisión: no se relaciona con los pedidos mayoristas. El supervisor
--   la carga y la corrige (RLS de la fase 1a).
-- - Los equipos que Ya! entrega (exhibidoras, hornos, freezers, heladeras) se
--   registran con número de serie, lote o código interno. Cada cambio de lugar
--   o de situación queda en supervision_equipos_movimientos, con fecha y
--   responsable. El lugar y la situación solo se cambian con
--   supervision_mover_equipo(); el resto de la ficha se edita normal.
-- - supervision_parametros: valores que el admin ajusta sin tocar el catálogo.
--   Por ahora, el tiempo máximo del producto cocido en exhibidora (ítem mx2),
--   con un valor provisorio.

-- ── Equipos ───────────────────────────────────────────────────────────────

create table public.supervision_equipos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('exhibidora', 'horno', 'freezer', 'heladera', 'otro')),
  marca_modelo   text not null default '',
  nro_serie      text,
  nro_lote       text,
  codigo_interno text unique,
  lugar_id       text references public.supervision_lugares(id),
  fecha_entrega  date,
  modalidad      text not null default 'comodato' check (modalidad in ('comodato', 'prestamo', 'otro')),
  situacion      text not null default 'en_uso' check (situacion in ('en_uso', 'en_reparacion', 'retirado')),
  observaciones  text not null default '',
  creado_por     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Algo que lo identifique en el local.
  constraint supervision_equipos_identificado check (
    coalesce(nullif(trim(nro_serie), ''), nullif(trim(nro_lote), ''), nullif(trim(codigo_interno), '')) is not null
  ),
  -- En uso = asignado a un cliente; en reparación o retirado = sin cliente.
  constraint supervision_equipos_situacion_lugar check ((situacion = 'en_uso') = (lugar_id is not null))
);
create index supervision_equipos_lugar_idx on public.supervision_equipos (lugar_id);
create index supervision_equipos_creado_por_idx on public.supervision_equipos (creado_por);

create table public.supervision_equipos_movimientos (
  id            uuid primary key default gen_random_uuid(),
  equipo_id     uuid not null references public.supervision_equipos(id) on delete cascade,
  tipo          text not null check (tipo in ('alta', 'entrega', 'traslado', 'reparacion', 'retiro')),
  lugar_origen  text references public.supervision_lugares(id),
  lugar_destino text references public.supervision_lugares(id),
  fecha         date not null default current_date,
  responsable   text,
  nota          text not null default '',
  creado_por    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index supervision_equipos_movimientos_equipo_idx on public.supervision_equipos_movimientos (equipo_id, fecha desc);
create index supervision_equipos_movimientos_origen_idx on public.supervision_equipos_movimientos (lugar_origen);
create index supervision_equipos_movimientos_destino_idx on public.supervision_equipos_movimientos (lugar_destino);
create index supervision_equipos_movimientos_creado_por_idx on public.supervision_equipos_movimientos (creado_por);

-- El lugar y la situación cambian solo con supervision_mover_equipo(), que
-- registra el movimiento. Editar marca, serie u observaciones es libre.
create or replace function public.supervision_equipos_antes_de_editar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if (new.lugar_id is distinct from old.lugar_id or new.situacion is distinct from old.situacion)
     and coalesce(current_setting('supervision.moviendo_equipo', true), '') <> 'si' then
    raise exception 'El lugar y la situación de un equipo se cambian con supervision_mover_equipo()';
  end if;
  return new;
end;
$$;

create trigger supervision_equipos_antes_de_editar
  before update on public.supervision_equipos
  for each row execute function public.supervision_equipos_antes_de_editar();

-- Al dar de alta un equipo queda el primer movimiento: "entrega" si ya viene
-- con cliente, "alta" si no. security definer porque los movimientos no se
-- insertan a mano (no tienen policy de alta).
create or replace function public.supervision_equipos_al_crear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into supervision_equipos_movimientos (equipo_id, tipo, lugar_destino, fecha, creado_por)
  values (new.id, case when new.lugar_id is null then 'alta' else 'entrega' end,
          new.lugar_id, coalesce(new.fecha_entrega, current_date), auth.uid());
  return new;
end;
$$;

create trigger supervision_equipos_al_crear
  after insert on public.supervision_equipos
  for each row execute function public.supervision_equipos_al_crear();

-- Entrega (a un cliente), traslado (a otro cliente), reparación o retiro.
-- Valida la transición, actualiza el equipo y registra el movimiento, todo en
-- la misma transacción.
create or replace function public.supervision_mover_equipo(
  p_equipo uuid, p_tipo text, p_destino text, p_fecha date, p_responsable text, p_nota text
)
returns public.supervision_equipos
language plpgsql
security definer
set search_path = public
as $$
declare
  e supervision_equipos;
  v_origen text;
begin
  if not puede_supervisar() then
    raise exception 'Sin permiso para mover equipos' using errcode = '42501';
  end if;
  select * into e from supervision_equipos where id = p_equipo for update;
  if not found then raise exception 'No existe el equipo'; end if;

  if p_tipo in ('entrega', 'traslado') then
    if p_destino is null or not exists (select 1 from supervision_lugares where id = p_destino and tipo = 'mayorista') then
      raise exception 'Elegí un cliente mayorista';
    end if;
    if p_tipo = 'entrega' and e.situacion = 'en_uso' then raise exception 'El equipo ya está en un cliente: usá traslado'; end if;
    if p_tipo = 'traslado' and e.situacion <> 'en_uso' then raise exception 'El equipo no está en un cliente: usá entrega'; end if;
    if p_destino = e.lugar_id then raise exception 'El equipo ya está en ese cliente'; end if;
  elsif p_tipo in ('reparacion', 'retiro') then
    if p_tipo = 'reparacion' and e.situacion = 'en_reparacion' then raise exception 'El equipo ya está en reparación'; end if;
    if p_tipo = 'retiro' and e.situacion = 'retirado' then raise exception 'El equipo ya está retirado'; end if;
  else
    raise exception 'Movimiento desconocido: %', p_tipo;
  end if;

  v_origen := e.lugar_id;
  perform set_config('supervision.moviendo_equipo', 'si', true);
  update supervision_equipos set
    lugar_id = case when p_tipo in ('entrega', 'traslado') then p_destino end,
    situacion = case p_tipo when 'reparacion' then 'en_reparacion' when 'retiro' then 'retirado' else 'en_uso' end,
    fecha_entrega = case when p_tipo in ('entrega', 'traslado') then coalesce(p_fecha, current_date) else fecha_entrega end
  where id = p_equipo
  returning * into e;
  perform set_config('supervision.moviendo_equipo', '', true);

  insert into supervision_equipos_movimientos (equipo_id, tipo, lugar_origen, lugar_destino, fecha, responsable, nota, creado_por)
  values (p_equipo, p_tipo, v_origen, e.lugar_id, coalesce(p_fecha, current_date),
          nullif(trim(p_responsable), ''), coalesce(trim(p_nota), ''), auth.uid());
  return e;
end;
$$;

revoke all on function public.supervision_mover_equipo(uuid, text, text, date, text, text) from public, anon;
grant execute on function public.supervision_mover_equipo(uuid, text, text, date, text, text) to authenticated;

alter table public.supervision_equipos             enable row level security;
alter table public.supervision_equipos_movimientos enable row level security;

create policy "supervision_equipos_lectura" on public.supervision_equipos
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_equipos_alta" on public.supervision_equipos
  for insert to authenticated with check ((select puede_supervisar()));
create policy "supervision_equipos_edicion" on public.supervision_equipos
  for update to authenticated using ((select puede_supervisar())) with check ((select puede_supervisar()));
create policy "supervision_equipos_baja" on public.supervision_equipos
  for delete to authenticated using ((select es_admin()));

create policy "supervision_equipos_movimientos_lectura" on public.supervision_equipos_movimientos
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_equipos_movimientos_baja" on public.supervision_equipos_movimientos
  for delete to authenticated using ((select es_admin()));

-- ── Parámetros ────────────────────────────────────────────────────────────

create table public.supervision_parametros (
  clave       text primary key,
  valor       jsonb not null,
  descripcion text not null default '',
  updated_at  timestamptz not null default now()
);

create trigger supervision_parametros_updated_at
  before update on public.supervision_parametros
  for each row execute function public.supervision_tocar_updated_at();

alter table public.supervision_parametros enable row level security;

create policy "supervision_parametros_lectura" on public.supervision_parametros
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_parametros_admin" on public.supervision_parametros
  for all to authenticated using ((select es_admin())) with check ((select es_admin()));

-- Valor provisorio: la spec no da número. Se ajusta con las primeras visitas
-- (caso de referencia: Supermax, cocinado a las 6 y vendido duro a las 11).
insert into public.supervision_parametros (clave, valor, descripcion) values
  ('mx2_tiempo_max', '{"horas": 3}', 'Tiempo máximo del producto cocido en la exhibidora (ítem mx2). Valor provisorio.');
