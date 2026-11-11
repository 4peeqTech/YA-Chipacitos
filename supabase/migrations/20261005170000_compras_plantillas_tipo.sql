-- B2: plantillas de mensaje por tipo (pedido | factura), una default por tipo,
-- y el número de WhatsApp de la administración para el mensaje de factura.

-- 1. Tipo ---------------------------------------------------------------------
alter table public.compras_plantillas_mensaje
  add column if not exists tipo text not null default 'pedido';
alter table public.compras_plantillas_mensaje
  drop constraint if exists compras_plantillas_mensaje_tipo_check;
alter table public.compras_plantillas_mensaje
  add constraint compras_plantillas_mensaje_tipo_check check (tipo in ('pedido', 'factura'));

-- 2. Una default por tipo (antes: una en toda la tabla) -------------------------
drop index if exists public.idx_plantilla_default_unica;
create unique index if not exists idx_plantilla_default_por_tipo
  on public.compras_plantillas_mensaje (tipo) where es_default;

-- 3. Seed de la plantilla de factura -------------------------------------------
-- Reproduce CUERPO_FACTURA_FALLBACK de lib/compras/facturaMensaje.ts: el día 1
-- la plantilla y el formato estándar dan el mismo texto.
insert into public.compras_plantillas_mensaje (nombre, cuerpo, tipo, es_default, activo, orden)
values (
  'Factura estándar',
  E'🧾 *FACTURA {{numero_factura}}* · {{proveedor}}\n📅 {{fecha}} · Vence: {{vencimiento}}\n📦 Pedido {{pedido}}{{facturado_a}}\n\n*Detalle:*\n{{detalle}}\n\nSubtotal: {{subtotal}}{{iva_detalle}}\n*TOTAL: {{total}}*',
  'factura', true, true, 0
)
on conflict (nombre) do nothing;

-- 4. Marcar la default, atómico y por tipo -------------------------------------
create or replace function public.compras_marcar_plantilla_default(p_plantilla_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_activo boolean;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select tipo, activo into v_tipo, v_activo
  from compras_plantillas_mensaje where id = p_plantilla_id for update;
  if not found then
    raise exception 'La plantilla no existe';
  end if;
  if not v_activo then
    raise exception 'Activá la plantilla antes de marcarla como predeterminada.';
  end if;

  update compras_plantillas_mensaje
     set es_default = false, updated_at = now()
   where tipo = v_tipo and es_default and id <> p_plantilla_id;
  update compras_plantillas_mensaje
     set es_default = true, updated_at = now()
   where id = p_plantilla_id;
end;
$$;

revoke execute on function public.compras_marcar_plantilla_default(uuid) from public, anon;
grant execute on function public.compras_marcar_plantilla_default(uuid) to authenticated;

-- 5. WhatsApp de la administración ----------------------------------------------
insert into public.compras_config (clave, valor, descripcion) values
  ('factura.whatsapp_admin', '""'::jsonb,
   'WhatsApp de la administración para el mensaje de una factura (con código de país, solo dígitos). Vacío: se elige el contacto en WhatsApp.')
on conflict (clave) do nothing;
