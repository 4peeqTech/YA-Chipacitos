-- Checklist de supervisión de locales (04-11).
--
-- El Supervisor de locales recorre las sucursales y completa un checklist
-- (Cumple / No cumple / N/A) desde el celular. Viene de una herramienta HTML
-- armada por el equipo de procesos (11 bloques, 82 ítems, 10 sucursales);
-- acá pasa a vivir en el ERP con el login, los roles y el diseño de la app.
--
-- Por ahora no se relaciona con el resto del ERP: tablas propias con prefijo
-- supervision_. Las sucursales son una lista propia porque locales_config es
-- la lista que recorre la sincronización de Fudo e integraciones (solo las 5
-- propias); las que existen ahí quedan enlazadas por local_config_id.
--
-- Los IDs de bloques e ítems son los del HTML original y no se cambian: las
-- respuestas guardadas y el seguimiento de pendientes dependen de ellos. Para
-- agregar un ítem, usar un ID nuevo; para sacarlo, activo = false.
--
-- Acceso: admin o quien tenga el módulo 'supervision' en modulos_permitidos.
-- Borrar visitas, solo admin.

-- ── Catálogo ──────────────────────────────────────────────────────────────

create table public.supervision_sucursales (
  id              text primary key,
  nombre          text not null,
  zona            text not null,
  local_config_id uuid references public.locales_config(id) on delete set null,
  orden           int not null default 0,
  activo          boolean not null default true
);
create index supervision_sucursales_local_config_idx on public.supervision_sucursales (local_config_id);

create table public.supervision_bloques (
  id         text primary key,
  titulo     text not null,
  referencia text not null default '',
  orden      int not null default 0,
  activo     boolean not null default true
);

create table public.supervision_items (
  id        text primary key,
  bloque_id text not null references public.supervision_bloques(id),
  texto     text not null,
  orden     int not null default 0,
  activo    boolean not null default true
);
create index supervision_items_bloque_idx on public.supervision_items (bloque_id, orden);

-- ── Visitas ───────────────────────────────────────────────────────────────
-- Una fila por recorrida. respuestas: { idItem: { r: 'C'|'NC'|'NA', obs } }.
-- pendientes_previos / obs_previas: lo que quedó sin cumplir en la última
-- visita cerrada de la sucursal, para verificar si se corrigió. resumen: los
-- porcentajes calculados en la app al guardar (para listar y exportar).

create table public.supervision_visitas (
  id                 uuid primary key default gen_random_uuid(),
  sucursal_id        text not null references public.supervision_sucursales(id),
  supervisor_nombre  text not null,
  encargado          text,
  fecha              timestamptz not null default now(),
  cierre             timestamptz,
  estado             text not null default 'en_curso' check (estado in ('en_curso', 'cerrada')),
  respuestas         jsonb not null default '{}'::jsonb,
  obs_general        text not null default '',
  anterior_id        uuid references public.supervision_visitas(id) on delete set null,
  anterior_fecha     timestamptz,
  pendientes_previos text[] not null default '{}',
  obs_previas        jsonb not null default '{}'::jsonb,
  resumen            jsonb,
  creado_por         uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index supervision_visitas_sucursal_fecha_idx on public.supervision_visitas (sucursal_id, fecha desc);
create index supervision_visitas_anterior_idx on public.supervision_visitas (anterior_id);
create index supervision_visitas_creado_por_idx on public.supervision_visitas (creado_por);

create or replace function public.supervision_tocar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger supervision_visitas_updated_at
  before update on public.supervision_visitas
  for each row execute function public.supervision_tocar_updated_at();

-- ── Acceso ────────────────────────────────────────────────────────────────

create or replace function public.puede_supervisar()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and estado = 'activo'
      and (rol = 'admin' or 'supervision' = any(modulos_permitidos))
  );
$$;

alter table public.supervision_sucursales enable row level security;
alter table public.supervision_bloques    enable row level security;
alter table public.supervision_items      enable row level security;
alter table public.supervision_visitas    enable row level security;

create policy "supervision_sucursales_lectura" on public.supervision_sucursales
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_sucursales_admin" on public.supervision_sucursales
  for all to authenticated using ((select es_admin())) with check ((select es_admin()));

create policy "supervision_bloques_lectura" on public.supervision_bloques
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_bloques_admin" on public.supervision_bloques
  for all to authenticated using ((select es_admin())) with check ((select es_admin()));

create policy "supervision_items_lectura" on public.supervision_items
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_items_admin" on public.supervision_items
  for all to authenticated using ((select es_admin())) with check ((select es_admin()));

create policy "supervision_visitas_lectura" on public.supervision_visitas
  for select to authenticated using ((select puede_supervisar()));
create policy "supervision_visitas_alta" on public.supervision_visitas
  for insert to authenticated with check ((select puede_supervisar()));
create policy "supervision_visitas_edicion" on public.supervision_visitas
  for update to authenticated using ((select puede_supervisar())) with check ((select puede_supervisar()));
create policy "supervision_visitas_baja" on public.supervision_visitas
  for delete to authenticated using ((select es_admin()));

-- Vista plana (una fila por ítem respondido) para analizar o exportar.
create or replace view public.supervision_visitas_items with (security_invoker = true) as
select v.id                            as visita_id,
       v.fecha,
       v.sucursal_id,
       s.nombre                        as sucursal,
       v.supervisor_nombre             as supervisor,
       v.encargado,
       v.estado,
       (v.resumen ->> 'pct')::numeric  as cumplimiento_pct,
       r.key                           as item_id,
       i.texto                         as item,
       b.titulo                        as bloque,
       r.value ->> 'r'                 as resultado,
       r.value ->> 'obs'               as observacion
from public.supervision_visitas v
join public.supervision_sucursales s on s.id = v.sucursal_id
cross join lateral jsonb_each(v.respuestas) r
left join public.supervision_items i on i.id = r.key
left join public.supervision_bloques b on b.id = i.bloque_id;

-- Rol para el supervisor. Los módulos se le asignan al usuario en Usuarios
-- (modulos_permitidos), como a cualquier rol personalizado.
insert into public.roles (key, nombre, color, es_sistema)
values ('supervisor_locales', 'Supervisor de locales', '#d32f2f', false)
on conflict (key) do nothing;

-- ── Datos iniciales (catálogo del HTML de procesos) ──────────────────────

insert into public.supervision_sucursales (id, nombre, zona, orden) values
  ('paraguay', 'Paraguay 388', 'Corrientes Capital', 1),
  ('cordoba', 'Córdoba 1533', 'Corrientes Capital', 2),
  ('yrigoyen', 'H. Yrigoyen 950', 'Corrientes Capital', 3),
  ('sanlorenzo', 'San Lorenzo 780', 'Corrientes Capital', 4),
  ('launidad', 'La Unidad', 'Corrientes Capital', 5),
  ('vera', 'Av. Vera 1370', 'Corrientes Capital', 6),
  ('goya', 'Goya', 'Corrientes', 7),
  ('ituzaingo', 'Ituzaingó', 'Corrientes', 8),
  ('saenzpena', 'Sáenz Peña', 'Chaco', 9),
  ('santafe', 'Santa Fe', 'Santa Fe', 10);

insert into public.supervision_bloques (id, titulo, referencia, orden) values
  ('b1', 'Imagen del personal', 'Ventas minoristas (1) y Horneado (1)', 1),
  ('b2', 'Local y exhibición', 'Ventas minoristas (5 y 7) y Horneado (6 y 8)', 2),
  ('b3', 'Atención al cliente', 'Ventas minoristas (2, 3, 6, 7 y 8)', 3),
  ('b4', 'Higiene y manipulación', 'Ventas minoristas (5), Horneado (10, 18 y 19) y Políticas generales', 4),
  ('b5', 'Horno y producción', 'Horneado (2 a 13, 17, 20 y 22)', 5),
  ('b6', 'Stock, depósito y cadena de frío', 'Abastecimiento (1.4 y 3) y Horneado (3 y 20)', 6),
  ('b7', 'Recepción de mercadería', 'Abastecimiento, recepción y control de stock (1 y 2)', 7),
  ('b8', 'Caja y administración', 'Gestión de caja (1 a 6)', 8),
  ('b9', 'Canales digitales', 'Ventas minoristas (9) y Gestión de caja (4)', 9),
  ('b10', 'Logística y entrega', 'Logística y reparto (1 a 14) y Ventas minoristas (10)', 10),
  ('b11', 'Equipos y mantenimiento', 'Horneado (23)', 11);

insert into public.supervision_items (id, bloque_id, texto, orden) values
  ('p1', 'b1', 'Todo el personal usa la gorra de la marca (en horno: gorra o cofia que retiene todo el cabello).', 1),
  ('p2', 'b1', 'Usa la remera institucional.', 2),
  ('p3', 'b1', 'Usa el delantal institucional en atención y en horno.', 3),
  ('p4', 'b1', 'No usa prendas llamativas, de fútbol o ajenas a la imagen de la marca.', 4),
  ('p5', 'b1', 'La presentación es prolija: ropa limpia y en buen estado.', 5),
  ('l1', 'b2', 'El salón y el mostrador están ordenados y visiblemente limpios.', 1),
  ('l2', 'b2', 'La vitrina está abastecida y el producto bien presentado.', 2),
  ('l3', 'b2', 'Las facturas se exhiben en bandejas de madera con papel parafinado.', 3),
  ('l4', 'b2', 'La carta con productos y precios está a la vista del cliente.', 4),
  ('l5', 'b2', 'El QR y el alias exhibidos corresponden a esta sucursal.', 5),
  ('l6', 'b2', 'Hay stock de bolsas con logo (N.º 3 y N.º 6), cajitas y papel parafinado.', 6),
  ('a1', 'b3', 'Saluda a todo cliente que ingresa, de forma cordial.', 1),
  ('a2', 'b3', 'Respeta el orden de llegada para tomar y entregar pedidos.', 2),
  ('a3', 'b3', 'Muestra la carta y explica el sistema de venta a clientes nuevos.', 3),
  ('a4', 'b3', 'En ventas por gramaje, pesa en la balanza frente al cliente.', 4),
  ('a5', 'b3', 'Ante falta de stock, informa el tiempo real de espera y ofrece una alternativa.', 5),
  ('a6', 'b3', 'Informa el monto exacto y consulta medio de pago y si quiere ticket.', 6),
  ('a7', 'b3', 'Entrega el producto recién cuando el cobro está confirmado.', 7),
  ('a8', 'b3', 'Entrega en bolsa del tamaño correcto, bien cerrada y con el logo hacia afuera.', 8),
  ('a9', 'b3', 'Despide al cliente y agradece la compra.', 9),
  ('a10', 'b3', 'La atención es cercana y sin presión de venta.', 10),
  ('h1', 'b4', 'Usa guantes para manipular cualquier producto.', 1),
  ('h2', 'b4', 'Cambia el guante después de tocar dinero, celular u otras superficies.', 2),
  ('h3', 'b4', 'Usa guantes distintos para la masa y para el armado de chipandwich.', 3),
  ('h4', 'b4', 'Limpia la mesada al pasar de producto dulce a salado.', 4),
  ('h5', 'b4', 'La mesada está sin restos de masa y se limpia con esponja y trapo húmedo.', 5),
  ('h6', 'b4', 'Las migas y restos se descartan en el lugar designado y el piso está barrido.', 6),
  ('h7', 'b4', 'Las bandejas están sin restos quemados y no se limpian con virulana.', 7),
  ('o1', 'b5', 'El horno trabaja a la temperatura estándar (cerca de 230° para el clásico).', 1),
  ('o2', 'b5', 'Hay balanza de precisión en el puesto y se controla el peso del bollo (38 a 40 g en crudo).', 2),
  ('o3', 'b5', 'Los bollos se cortan al aire, sin apoyar la masa en la mesada o la bandeja.', 3),
  ('o4', 'b5', 'Se hornea en tandas de 3 bandejas con espacio entre ellas.', 4),
  ('o5', 'b5', 'El producto exhibido tiene cocción correcta: ni crudo, ni quemado, ni aplastado.', 5),
  ('o6', 'b5', 'Los toppings del XL están preparados en tuppers identificados por sabor.', 6),
  ('o7', 'b5', 'El chipandwich se exhibe fresco, sin tostar y sin aderezo por defecto.', 7),
  ('o8', 'b5', 'El jugo de naranja está refrigerado y tiene menos de 3 días.', 8),
  ('o9', 'b5', 'La limpieza semanal del horno tiene día fijo y se está cumpliendo.', 9),
  ('o10', 'b5', 'Al cierre, el hornero informa masa usada, sobrante y desperdicio (verificar planilla).', 10),
  ('s1', 'b6', 'Hay al menos una masa de reserva en la heladera.', 1),
  ('s2', 'b6', 'Freezer y heladera están ordenados aplicando PEPS (lo más antiguo adelante).', 2),
  ('s3', 'b6', 'Masas y congelados tienen bolsas selladas y consistencia adecuada.', 3),
  ('s4', 'b6', 'Los insumos secos están elevados, en lugar seco y ventilado (nunca en el piso).', 4),
  ('s5', 'b6', 'Los insumos críticos (queso, jamón, harinas) están por encima del stock mínimo.', 5),
  ('s6', 'b6', 'Todos los productos están dentro de su fecha de vencimiento.', 6),
  ('s7', 'b6', 'La limpieza de freezer y heladera tiene día fijo y se está cumpliendo.', 7),
  ('r1', 'b7', 'Los pedidos al mayorista se hacen por el sistema con el usuario de la sucursal.', 1),
  ('r2', 'b7', 'Las recepciones están confirmadas en el sistema con las cantidades reales.', 2),
  ('r3', 'b7', 'Los remitos con diferencias están corregidos y firmados por el cadete.', 3),
  ('r4', 'b7', 'Los remitos cargados en Fudo coinciden con lo confirmado en el sistema.', 4),
  ('r5', 'b7', 'Los comprobantes de proveedores externos están subidos al Drive de Egresos en el día.', 5),
  ('r6', 'b7', 'Las devoluciones a proveedores constan en el remito con firma de ambas partes.', 6),
  ('r7', 'b7', 'Los pedidos a proveedores externos se hacen con 24 h de anticipación.', 7),
  ('c1', 'b8', 'La caja está abierta en Fudo con el usuario de la sucursal, sin contraseñas guardadas ni compartidas.', 1),
  ('c2', 'b8', 'El fondo de caja inicial es el definido para el local ($30.000 a $40.000).', 2),
  ('c3', 'b8', 'Arqueo en el momento: el efectivo físico coincide con lo que marca el sistema.', 3),
  ('c4', 'b8', 'Los egresos están cargados con descripción y su comprobante está en la caja.', 4),
  ('c5', 'b8', 'Los pagos a cadetes están cargados como egreso con N.º de pedido y destino.', 5),
  ('c6', 'b8', 'Los retiros parciales están registrados, con ticket impreso y en sobre.', 6),
  ('c7', 'b8', 'El arqueo del día anterior está impreso y con el efectivo resaltado.', 7),
  ('c8', 'b8', 'Las transferencias se validan (fecha, destinatario y monto) antes de entregar.', 8),
  ('c9', 'b8', 'En pagos con tarjeta se pide DNI y se guarda el ticket del posnet.', 9),
  ('c10', 'b8', 'Cuando el cliente pide factura, se emite A o B con los datos correctos.', 10),
  ('c11', 'b8', 'Pedidos Ya se registra con el cliente “Pedidos ya” y productos “P Ya”, sin pedidos eliminados.', 11),
  ('d1', 'b9', 'WhatsApp Business está en estado “abierto” durante la atención.', 1),
  ('d2', 'b9', 'Fudo online está activo según el horario y con la zonificación de envíos configurada.', 2),
  ('d3', 'b9', 'Los mensajes y pedidos recibidos fuera de horario se revisan al iniciar la jornada.', 3),
  ('d4', 'b9', 'El stock de Pedidos Ya está actualizado y coincide con la vitrina.', 4),
  ('d5', 'b9', 'A quienes escriben por WhatsApp se les envía el link de Fudo.', 5),
  ('e1', 'b10', 'Al confirmar un envío se informa producto, tipo de entrega, tiempo estimado y total.', 1),
  ('e2', 'b10', 'Los tiempos se informan con margen (10 a 15 min por encima de la preparación).', 2),
  ('e3', 'b10', 'En pagos por transferencia, el comprobante se valida antes de despachar.', 3),
  ('e4', 'b10', 'Se avisa al cadete al comenzar la preparación del pedido.', 4),
  ('e5', 'b10', 'El mensaje al cadete incluye dirección con altura, total con envío discriminado, modalidad de pago y teléfono.', 5),
  ('e6', 'b10', 'Los envíos salen en cajita y bien presentados.', 6),
  ('e7', 'b10', 'Se prioriza la cadetería interna; la externa se usa solo como respaldo.', 7),
  ('e8', 'b10', 'Cadete externo con pago en efectivo: abona el producto al retirar.', 8),
  ('e9', 'b10', 'Pedidos Ya: se verifica el nombre contra el ticket y el cadete marca “retirado” frente al personal.', 9),
  ('e10', 'b10', 'El cadete interno rinde al final del turno, antes del cierre de caja.', 10),
  ('e11', 'b10', 'Las cadeterías externas facturan el servicio y el encargado lo controla.', 11),
  ('m1', 'b11', 'Horno, extractor, licuadora, máquina de café y posnet funcionan correctamente.', 1),
  ('m2', 'b11', 'Las balanzas de mostrador y de precisión funcionan.', 2),
  ('m3', 'b11', 'Las fallas detectadas fueron reportadas al encargado y están en gestión.', 3);

-- Enlace con locales_config para las sucursales propias que ya existen ahí.
update public.supervision_sucursales s
set local_config_id = l.id
from (values
  ('paraguay',   'YA! PARAGUAY'),
  ('cordoba',    'YA! CORDOBA'),
  ('yrigoyen',   'YA! IRIGOYEN'),
  ('sanlorenzo', 'YA! SAN LORENZO'),
  ('launidad',   'YA! UNIDAD')
) as m(id, sucursal)
join public.locales_config l on l.sucursal = m.sucursal
where s.id = m.id;