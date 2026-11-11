-- Supervisión v2, fase 2 (11-11): requerimientos de la visita.
--
-- Lo que el supervisor detecta o le pide el personal durante la visita:
-- herramientas o insumos que faltan, reparaciones, ideas. No es parte del
-- checklist ni suma al porcentaje. Tiene seguimiento propio (estado,
-- respuesta, responsable) y los abiertos se le vuelven a mostrar al visitar
-- el mismo lugar. No aplica a las visitas a mayoristas (lo resuelve la app).
--
-- El responsable es texto libre: muchos no tienen usuario en el sistema.

create table public.supervision_requerimientos (
  id           uuid primary key default gen_random_uuid(),
  lugar_id     text not null references public.supervision_lugares(id),
  visita_id    uuid references public.supervision_visitas(id) on delete set null,
  descripcion  text not null check (length(trim(descripcion)) > 0),
  categoria    text not null default 'herramienta_insumo'
    check (categoria in ('herramienta_insumo', 'mantenimiento', 'idea', 'otro')),
  prioridad    text not null default 'no_urgente'
    check (prioridad in ('urgente', 'no_urgente', 'cuando_se_pueda', 'reunion')),
  estado       text not null default 'pendiente'
    check (estado in ('pendiente', 'en_gestion', 'resuelto', 'descartado')),
  respuesta    text not null default '',
  responsable  text,
  resuelto_at  timestamptz,
  creado_por   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index supervision_requerimientos_lugar_estado_idx on public.supervision_requerimientos (lugar_id, estado);
create index supervision_requerimientos_visita_idx on public.supervision_requerimientos (visita_id);
create index supervision_requerimientos_creado_por_idx on public.supervision_requerimientos (creado_por);

-- Fecha de resolución: se pone al pasar a resuelto o descartado (y se
-- conserva si ya estaba cerrado), y se limpia si vuelve a pendiente o en gestión.
create or replace function public.supervision_requerimientos_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.estado in ('resuelto', 'descartado') then
    if tg_op = 'UPDATE' and old.estado in ('resuelto', 'descartado') then
      new.resuelto_at := coalesce(old.resuelto_at, now());
    else
      new.resuelto_at := now();
    end if;
  else
    new.resuelto_at := null;
  end if;
  return new;
end;
$$;

create trigger supervision_requerimientos_estado
  before insert or update on public.supervision_requerimientos
  for each row execute function public.supervision_requerimientos_estado();

alter table public.supervision_requerimientos enable row level security;

create policy "supervision_requerimientos_lectura" on public.supervision_requerimientos
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_requerimientos_alta" on public.supervision_requerimientos
  for insert to authenticated with check ((select puede_supervisar()));
create policy "supervision_requerimientos_edicion" on public.supervision_requerimientos
  for update to authenticated using ((select puede_supervisar())) with check ((select puede_supervisar()));
-- Borrar: el admin siempre; el supervisor, solo los que cargó en una visita
-- que sigue en curso (para corregir un error mientras la completa).
create policy "supervision_requerimientos_baja" on public.supervision_requerimientos
  for delete to authenticated using (
    (select es_admin())
    or (
      (select puede_supervisar())
      and creado_por = (select auth.uid())
      and exists (select 1 from public.supervision_visitas v where v.id = visita_id and v.estado = 'en_curso')
    )
  );
