-- ============================================================================
-- Conteo fuera de día (pedido de Marcos, 27-10).
--
-- Un conteo se puede cerrar cualquier día (el cierre nunca bloqueó por día),
-- pero si no es el dia_semana de su lista queda registrado como excepción:
-- fuera_de_dia = true y un motivo obligatorio. Vale para adelantar y atrasar.
--
-- No se toca cerrar_conteo_fabrica: Fábrica guarda el motivo en el borrador
-- (la policy ya le deja editar borradores) y el trigger, al pasar el conteo de
-- borrador a cerrado, calcula la marca con el día de Argentina y corta el
-- cierre si falta el motivo. La marca la pone siempre la base: lo que mande
-- el navegador en fuera_de_dia se pisa.
-- ============================================================================

alter table public.fabrica_conteos
  add column if not exists fuera_de_dia        boolean not null default false,
  add column if not exists motivo_fuera_de_dia text;

create or replace function public.fabrica_conteo_marcar_fuera_de_dia()
returns trigger
language plpgsql
as $$
declare
  v_dia_lista int;
begin
  select dia_semana into v_dia_lista
    from fabrica_conteo_definiciones
    where id = new.definicion_id;

  new.fuera_de_dia := v_dia_lista is not null
    and extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires'))::int <> v_dia_lista;

  if new.fuera_de_dia then
    new.motivo_fuera_de_dia := nullif(btrim(new.motivo_fuera_de_dia), '');
    if new.motivo_fuera_de_dia is null then
      raise exception 'Hoy no es el día de este conteo: escribí por qué lo cerrás igual.';
    end if;
  else
    new.motivo_fuera_de_dia := null;
  end if;

  return new;
end;
$$;

drop trigger if exists fabrica_conteo_marcar_fuera_de_dia on public.fabrica_conteos;
create trigger fabrica_conteo_marcar_fuera_de_dia
  before update of estado on public.fabrica_conteos
  for each row
  when (old.estado = 'borrador' and new.estado = 'cerrado')
  execute function public.fabrica_conteo_marcar_fuera_de_dia();

-- ----------------------------------------------------------------------------
-- v_compras_conteos_historial: cuerpo de 20261005160000 + las dos columnas
-- nuevas al final (create or replace view solo deja agregar al final).
-- ----------------------------------------------------------------------------
create or replace view public.v_compras_conteos_historial as
select
  c.id,
  c.fecha,
  c.semana_desde,
  c.semana_hasta,
  c.masas_proyectadas,
  c.cerrado_en,
  d.id as definicion_id,
  d.nombre as definicion_nombre,
  d.icono as definicion_icono,
  cp.nombre as cerrado_por_nombre,
  c.estado,
  (select s.id     from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_id,
  (select s.estado from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_estado,
  case when tiene_lectura_conteos() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado = 'pendiente'
  )::int end as diferencias_pendientes,
  case when tiene_lectura_conteos() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado in ('aplicada', 'ignorada')
  )::int end as diferencias_resueltas,
  c.fuera_de_dia,
  c.motivo_fuera_de_dia,
  d.dia_semana as definicion_dia_semana
from fabrica_conteos c
join fabrica_conteo_definiciones d on d.id = c.definicion_id
left join profiles cp on cp.id = c.cerrado_por
where c.estado in ('cerrado', 'descartado')
  and tiene_lectura_conteos();

grant select on public.v_compras_conteos_historial to authenticated;
