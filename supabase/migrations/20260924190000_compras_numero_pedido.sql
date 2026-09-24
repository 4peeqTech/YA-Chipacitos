-- F1 del Bloque 1 (facturación): numeración de pedidos.
--   * compras_pedidos.numero: correlativo global que se asigna al crear (se muestra
--     como P-0001 desde lib/compras/codigos.ts). Borrar un borrador deja un hueco
--     y se acepta (decisión N1).
--   * compras_config suma el seed iva.alicuota_default (lo usa F4).

-- 1. Seed de configuración ---------------------------------------------------
insert into public.compras_config (clave, valor, descripcion)
values ('iva.alicuota_default', '21'::jsonb,
        'Alícuota de IVA (%) que toma un insumo nuevo y cada línea de factura por defecto.')
on conflict (clave) do nothing;

-- 2. Número de pedido ---------------------------------------------------------
create sequence if not exists public.compras_pedidos_numero_seq as integer;

alter table public.compras_pedidos
  add column if not exists numero integer;

-- Backfill: consecutivo por fecha de creación.
with orden as (
  select id, row_number() over (order by created_at, id) as n
  from public.compras_pedidos
  where numero is null
)
update public.compras_pedidos p
set numero = o.n + coalesce((select max(numero) from public.compras_pedidos), 0)
from orden o
where p.id = o.id;

select setval(
  'public.compras_pedidos_numero_seq',
  greatest(coalesce((select max(numero) from public.compras_pedidos), 0), 1),
  (select count(*) > 0 from public.compras_pedidos)
);

alter sequence public.compras_pedidos_numero_seq owned by public.compras_pedidos.numero;

alter table public.compras_pedidos
  alter column numero set default nextval('public.compras_pedidos_numero_seq'),
  alter column numero set not null;

alter table public.compras_pedidos
  drop constraint if exists compras_pedidos_numero_key;
alter table public.compras_pedidos
  add constraint compras_pedidos_numero_key unique (numero);

-- Los roles que insertan pedidos necesitan usar la secuencia del default.
grant usage, select on sequence public.compras_pedidos_numero_seq to authenticated, service_role;
