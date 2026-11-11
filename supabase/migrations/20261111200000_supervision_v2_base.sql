-- Supervisión v2, fase 1a (11-11): de "sucursales" a "lugares con tipo".
--
-- Spec: "Checklist de supervisión – Especificación para el ERP (v2)" (10-11).
-- La herramienta pasa a tener cuatro tipos de visita: sucursal, fábrica,
-- depósito y cliente mayorista. Esta migración deja la base genérica y
-- actualiza el catálogo de sucursal; fábrica, depósito y mayoristas cargan
-- sus lugares y bloques en migraciones posteriores.
--
-- - supervision_sucursales pasa a supervision_lugares (mismos IDs) con tipo,
--   encargado y atributos. Las visitas apuntan a lugar_id.
-- - Cada bloque dice a qué tipos de visita aplica (tipos).
-- - Un ítem puede tener una condición sobre los atributos del lugar; la evalúa
--   la app (lib/supervision/calculos.ts → itemVisible). Si falta el atributo,
--   el ítem se muestra.
-- - La visita guarda al iniciar qué ítems se mostraron (items_visibles), para
--   que un cambio de atributos no mueva el % de visitas viejas. Null en las
--   visitas anteriores a esta migración: usan el catálogo, como hasta ahora.
-- - con_monto: el ítem lleva el campo opcional "Diferencia detectada ($)",
--   guardado en respuestas[id].monto. Solo para análisis.
--
-- Mismas reglas de IDs que la v1: no se reutilizan; baja = activo false;
-- cambio de sentido = ID nuevo; mejora de redacción = mismo ID.

-- ── Lugares ───────────────────────────────────────────────────────────────

alter table public.supervision_sucursales rename to supervision_lugares;
alter table public.supervision_lugares rename constraint supervision_sucursales_pkey to supervision_lugares_pkey;
alter table public.supervision_lugares rename constraint supervision_sucursales_local_config_id_fkey to supervision_lugares_local_config_id_fkey;
alter index public.supervision_sucursales_local_config_idx rename to supervision_lugares_local_config_idx;
alter policy "supervision_sucursales_lectura" on public.supervision_lugares rename to "supervision_lugares_lectura";
alter policy "supervision_sucursales_admin" on public.supervision_lugares rename to "supervision_lugares_admin";

alter table public.supervision_lugares
  add column tipo      text  not null default 'sucursal'
    check (tipo in ('sucursal', 'fabrica', 'deposito', 'mayorista')),
  add column encargado text,
  add column atributos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(atributos) = 'object'),
  alter column zona drop not null;

create index supervision_lugares_tipo_idx on public.supervision_lugares (tipo, orden);

-- El supervisor carga y corrige la ficha de los mayoristas (también desde la
-- visita). Sucursales, fábrica y depósito los edita solo el admin.
create policy "supervision_lugares_mayorista_alta" on public.supervision_lugares
  for insert to authenticated
  with check ((select puede_supervisar()) and tipo = 'mayorista');
create policy "supervision_lugares_mayorista_edicion" on public.supervision_lugares
  for update to authenticated
  using ((select puede_supervisar()) and tipo = 'mayorista')
  with check ((select puede_supervisar()) and tipo = 'mayorista');

-- ── Visitas ───────────────────────────────────────────────────────────────

alter table public.supervision_visitas rename column sucursal_id to lugar_id;
alter table public.supervision_visitas rename constraint supervision_visitas_sucursal_id_fkey to supervision_visitas_lugar_id_fkey;
alter index public.supervision_visitas_sucursal_fecha_idx rename to supervision_visitas_lugar_fecha_idx;
alter table public.supervision_visitas add column items_visibles text[];

-- ── Catálogo ──────────────────────────────────────────────────────────────

alter table public.supervision_bloques
  add column tipos text[] not null default '{sucursal}'
    check (cardinality(tipos) > 0 and tipos <@ array['sucursal', 'fabrica', 'deposito', 'mayorista']);

alter table public.supervision_items
  add column condicion text
    check (condicion in ('horno_rotativo', 'horno_convector', 'jugo', 'cocina',
                         'freezer_ya', 'horno_cliente', 'horno_ya', 'con_equipos')),
  add column con_monto boolean not null default false,
  add column parametro text;

-- Orden × 10 para poder intercalar ítems nuevos sin renumerar.
update public.supervision_items set orden = orden * 10;

-- Bajas
update public.supervision_items set activo = false where id in ('h2', 'o4', 's1');

-- Nueva redacción (mismo ID). c3 ya tenía el texto de la spec.
update public.supervision_items s set texto = v.texto
from (values
  ('h6', 'Las migas y restos se descartan en el lugar designado, y el piso se barre cada vez que se sacan bandejas del horno.'),
  ('h7', 'Las bandejas se limpian con agua caliente y detergente, sin restos quemados ni de queso. No se usa virulana.'),
  ('o1', 'El horno trabaja a la temperatura estándar de 230 °C.'),
  ('o6', 'Los toppings del XL están en tuppers identificados por sabor y rotulados con la fecha de preparación.'),
  ('c9', 'En pagos con tarjeta de crédito se solicita el DNI y se guarda el ticket firmado del posnet.')
) as v(id, texto)
where s.id = v.id;

-- Pasa a condicional, con el texto de la spec.
update public.supervision_items
set condicion = 'jugo', texto = 'El jugo de naranja preparado está refrigerado y tiene menos de 3 días.'
where id = 'o8';

-- Diferencia de arqueo
update public.supervision_items set con_monto = true where id = 'c3';

-- Altas
insert into public.supervision_items (id, bloque_id, texto, orden, condicion) values
  ('p6',  'b1', 'El personal tiene la barba corta y el cabello recogido.', 60, null),
  ('h2b', 'b4', 'Para cobrar o tocar objetos que no son alimentos (dinero, celular, posnet), se quita los guantes. Para volver a manipular alimentos usa guantes nuevos.', 21, null),
  ('h8',  'b4', 'No guarda guantes usados en el bolsillo ni los deja a un costado para volver a usarlos.', 80, null),
  ('o4r', 'b5', 'Se hornea en tandas de 3 bandejas, con espacio entre ellas.', 41, 'horno_rotativo'),
  ('o4c', 'b5', 'Se usan solo las 2 bandejas centrales del horno.', 42, 'horno_convector'),
  ('s8',  'b6', 'Los productos perecederos abiertos o cortados (por ejemplo, membrillo) están rotulados con la fecha de apertura o corte.', 80, null);

-- Bloques comunes de sucursal, fábrica y depósito (al final del checklist).
insert into public.supervision_bloques (id, titulo, referencia, orden, tipos) values
  ('b12', 'Limpieza de baño',    '', 100, '{sucursal,fabrica,deposito}'),
  ('b13', 'Seguridad e higiene', '', 110, '{sucursal,fabrica,deposito}');

insert into public.supervision_items (id, bloque_id, texto, orden) values
  ('bn1', 'b12', 'El inodoro, el lavamanos y la bacha están limpios.', 10),
  ('bn2', 'b12', 'No hay papel tirado en el piso, ni papel húmedo en la bacha.', 20),
  ('bn3', 'b12', 'Los dispensers de jabón líquido y de papel están cargados.', 30),
  ('bn4', 'b12', 'Hay stock de productos de limpieza: lavandina, detergente, trapos y repasadores.', 40),
  ('bn5', 'b12', 'El baño está ordenado y no se usa para guardar mercadería ni objetos ajenos.', 50),
  ('sg1', 'b13', 'Hay un botiquín de primeros auxilios completo y accesible.', 10),
  ('sg2', 'b13', 'Los matafuegos tienen la carga vigente y están accesibles y señalizados.', 20),
  ('sg3', 'b13', 'Los detectores de humo funcionan (donde estén instalados).', 30),
  ('sg4', 'b13', 'El certificado de control de plagas y fumigación está vigente y disponible en el lugar.', 40);

-- Tipo de horno de cada sucursal. Las convector están confirmadas; el resto
-- queda en rotativo, el valor provisorio de la spec ("a confirmar"). Jugo
-- preparado y encargado, vacíos hasta que los carguen desde admin.
update public.supervision_lugares
set atributos = jsonb_build_object('horno',
  case when id in ('launidad', 'vera', 'saenzpena', 'santafe') then 'convector' else 'rotativo' end)
where tipo = 'sucursal';

-- ── Vista plana ───────────────────────────────────────────────────────────
-- Se rehace con los nombres nuevos (lugar en vez de sucursal) y el monto.

drop view public.supervision_visitas_items;
create view public.supervision_visitas_items with (security_invoker = true) as
select v.id                              as visita_id,
       v.fecha,
       v.lugar_id,
       l.nombre                          as lugar,
       l.tipo,
       v.supervisor_nombre               as supervisor,
       v.encargado,
       v.estado,
       (v.resumen ->> 'pct')::numeric    as cumplimiento_pct,
       r.key                             as item_id,
       i.texto                           as item,
       b.titulo                          as bloque,
       r.value ->> 'r'                   as resultado,
       r.value ->> 'obs'                 as observacion,
       (r.value ->> 'monto')::numeric    as monto
from public.supervision_visitas v
join public.supervision_lugares l on l.id = v.lugar_id
cross join lateral jsonb_each(v.respuestas) r
left join public.supervision_items i on i.id = r.key
left join public.supervision_bloques b on b.id = i.bloque_id;
