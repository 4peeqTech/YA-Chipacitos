-- Descartar una solicitud complementaria libera el conteo que la generó para
-- que Fábrica pueda rehacerlo el mismo día, y le avisa (motivo opcional).
-- Antes: descartar_solicitud() dejaba compras_solicitudes en 'descartada'
-- pero fabrica_conteos seguía en 'cerrado' -> el índice único parcial sobre
-- estado='cerrado' bloqueaba un segundo cierre el mismo día.

-- Estado nuevo + trazabilidad del descarte
alter table fabrica_conteos drop constraint if exists fabrica_conteos_estado_check;
alter table fabrica_conteos add constraint fabrica_conteos_estado_check
  check (estado in ('borrador', 'cerrado', 'descartado'));

alter table fabrica_conteos
  add column if not exists descartado_en   timestamptz,
  add column if not exists descartado_por  uuid references profiles(id),
  add column if not exists motivo_descarte text;

-- Se agrega un parámetro nuevo: create or replace crearía una sobrecarga
-- (y PostgREST quedaría ambiguo sobre cuál llamar), así que se dropea primero.
drop function if exists public.descartar_solicitud(uuid);

create or replace function public.descartar_solicitud(p_solicitud_id uuid, p_motivo text default null)
returns void language plpgsql security definer as $$
declare v_conteo_id uuid;
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;

  update compras_solicitudes
    set estado = 'descartada', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id and estado = 'abierta'
    returning conteo_id into v_conteo_id;

  if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;

  -- El índice fabrica_conteos_definicion_fecha_cerrado_unique es parcial sobre
  -- estado='cerrado': sacar el conteo de ese estado lo libera y deja que Fábrica
  -- lo rehaga el mismo día, sin borrar el conteo ni su snapshot de ítems.
  -- Una solicitud 'base' no tiene conteo_id: por eso el if.
  if v_conteo_id is not null then
    update fabrica_conteos
      set estado          = 'descartado',
          descartado_por  = auth.uid(),
          descartado_en   = now(),
          motivo_descarte = nullif(trim(p_motivo), '')
      where id = v_conteo_id and estado = 'cerrado';
  end if;
end;
$$;
