# Compras Fase 3: Remitos — Spec

**Contexto general:** tercera de cuatro fases para migrar el módulo de Compras (hoy un HTML monolítico con sync a Google Sheets, en `Ya!ModuloCompra`) a un módulo nativo dentro de Ya!Chipacitos. Roadmap completo: Fase 1 — Stock + Proveedores → Fase 2 — Pedidos a proveedores → **Fase 3 — Remitos** → Fase 4 — Reportes → Cutover (retirar el HTML viejo y el Apps Script). Este documento cubre solo Fase 3. Fase 1 y Fase 2 ya están mergeadas en `origin/dev` (commits `ae9c167`..`96ccf98`): catálogo de insumos, stock actual, `compras_pedidos`/`compras_pedido_items`, columna `local` en `proveedores`. QA manual de Fase 2 confirmado OK por el usuario.

**Rama:** todo el trabajo va sobre `dev`. Nunca tocar `main` (tiene la base de datos de producción).

## Decisiones previas (no se reabren en esta fase)

- No se migra el historial de la Google Sheet — el módulo arranca en limpio.
- Acceso solo para `admin` y `squad` (los roles operativos `local`/`deposito`/`fabrica` no lo usan).
- RLS de tablas nuevas de Compras: `admin` + `squad` desde el schema.
- Cerrar un pedido (Fase 2) es una acción manual e independiente, sin relación con cantidad recibida.

## Investigación del flujo legacy

Revisado `Ya!ModuloCompra/index.html` (módulo "Global" — remitos, precios, costo por masa) para entender el comportamiento real antes de diseñar:

- El legacy trackea remitos **solo para el proveedor Global** (quesos), asociados a "Pedido Base"/"Pedido Complementario" — un concepto de lotes de producción interna, no de compras a proveedores. Ese concepto ya quedó reemplazado conceptualmente por `compras_pedidos` (Fase 2, genérico por proveedor) y no se migra.
- El matching entre línea de remito e ítem de pedido se hace por keywords hardcodeadas en el nombre del producto (`barra`/`tybo`, `sardo`, `pateg`, etc.), acumulando `cantRecibida` por ítem del pedido.
- Existe un cálculo de "costo por masa" (precio/kg de quesos según remito, dividido por lotes de producción) que depende de un precio manual por insumo (`localStorage` tipo `yachipacitos_precio_barra`) y de un contador de lotes de producción — ninguno de los dos existe hoy en Chipacitos. **Se decidió sacar este cálculo de alcance de Fase 3**: queda para una fase futura separada, junto con el diseño de precios por insumo y lotes de producción.
- Hay una pantalla de "Remitos registrados" global (filtro por número/producto, orden por columna, paginado, vista Activos/Todos). La distinción Activos/Todos existe en el legacy por limitaciones de `localStorage` (para no perder remitos de pedidos cerrados al persistir) — no aplica con una tabla real en Supabase.
- Cerrar un pedido en el legacy es independiente de si se recibió la mercadería.

## Decisiones tomadas en esta sesión

1. **Alcance:** Fase 3 cubre solo recepción de mercadería — registrar remitos contra un `compras_pedido`, trackear cantidad recibida vs. pedida por ítem, actualizar stock. Costeo por masa queda explícitamente fuera (ver arriba).
2. **Matching:** auto-match por texto (mismo espíritu que el legacy, pero basado en superposición de palabras normalizadas contra las descripciones reales de `compras_pedido_items`, no keywords hardcodeadas). El usuario puede corregir el match sugerido antes de guardar; si no hay match claro, la línea queda sin corresponder.
3. **Un remito = un pedido:** cada remito se registra contra un único `compras_pedido` (elegido de los pedidos `enviado`/`cerrado` del proveedor), igual que el legacy. No se reparte un remito entre varios pedidos.
4. **Cantidad recibida no se persiste como contador:** se calcula sumando `compras_remito_items` agrupados por `pedido_item_id`. Evita tener que "revertir" un contador al editar/borrar un remito — el total se recalcula solo.
5. **Stock automático:** al guardar un remito, cada línea matcheada a un ítem con `item_id` suma su cantidad a `compras_stock_actual` (upsert). Al editar o borrar un remito, se resta lo que había sumado antes de aplicar el nuevo estado.
6. **Cierre de pedido:** sigue 100% manual e independiente (decisión de Fase 2, no se reabre) — remitos solo agregan visibilidad (recibido X/Y), no bloquean ni fuerzan el cierre.
7. **Precio por línea:** opcional, sin cálculo ni reporte en esta fase — solo se guarda como dato disponible para cuando se diseñe costeo.
8. **Edición/borrado:** admin/squad pueden editar (número, fecha, líneas) o borrar un remito ya registrado; el efecto en stock y en cantidad recibida se recalcula automáticamente al hacerlo.
9. **Duplicados:** si se intenta registrar un remito con el mismo número en el mismo pedido, se avisa y se pregunta si se quiere sobrescribir (reemplaza el remito anterior, revirtiendo y reaplicando el efecto en stock) — mismo comportamiento que el legacy.
10. **Pantalla global de remitos:** además de verlos dentro de cada pedido, hay una pantalla `/admin/compras/remitos` con todos los remitos de todos los proveedores, filtrable y ordenable — sin distinción Activos/Todos (no aplica, ver investigación del legacy).

## Alcance

### Incluye

- Migración SQL: tablas nuevas `compras_remitos` y `compras_remito_items`.
- Sección de remitos dentro de `/admin/compras/pedidos`: registrar remito (con auto-match de líneas), listado de remitos del pedido, editar/borrar, indicador "recibido X/Y" por ítem.
- Pantalla nueva `/admin/compras/remitos`: listado global de remitos, filtro por proveedor/número, orden por columna, sin paginación por Activos/Todos (ver decisión 10).
- Actualización automática de `compras_stock_actual` al registrar/editar/borrar remitos.
- Entrada nueva en `lib/modulos.ts` bajo `section: 'Compras'`.

### No incluye (fases siguientes o fuera de alcance)

- Costeo por masa (precio/kg + lotes de producción) — fase futura separada.
- Bloqueo de cierre de pedido por recepción incompleta.
- Reparto de un remito entre varios pedidos.
- OCR/foto del remito físico (existe en el legacy para Facturas, no se migra acá).
- Reportes (Fase 4).
- Retirar el HTML viejo o el Apps Script (Cutover, al final de Fase 4).

## Modelo de datos

### Migración

Archivo nuevo en `supabase/migrations/`, timestamp posterior a `20260803150000_compras_fase2_pedidos_proveedores.sql` (confirmar el nombre exacto del archivo más reciente antes de nombrar el nuevo).

```sql
-- Fase 3 de Compras: remitos (recepción de mercadería)

create table if not exists compras_remitos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references compras_pedidos(id) on delete cascade,
  numero       text not null,
  fecha        date not null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz default now()
);

create index if not exists idx_compras_remitos_pedido_id on compras_remitos(pedido_id);
create unique index if not exists uq_compras_remitos_pedido_numero on compras_remitos(pedido_id, numero);

alter table compras_remitos enable row level security;

create policy "admin y squad manejan compras_remitos" on compras_remitos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );

create table if not exists compras_remito_items (
  id             uuid primary key default gen_random_uuid(),
  remito_id      uuid not null references compras_remitos(id) on delete cascade,
  pedido_item_id uuid references compras_pedido_items(id) on delete set null,
  item_id        uuid references compras_items(id),
  descripcion    text not null,
  cantidad       numeric not null default 0,
  precio         numeric
);

create index if not exists idx_compras_remito_items_remito_id on compras_remito_items(remito_id);
create index if not exists idx_compras_remito_items_pedido_item_id on compras_remito_items(pedido_item_id);

alter table compras_remito_items enable row level security;

create policy "admin y squad manejan compras_remito_items" on compras_remito_items
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
```

Notas:

- `pedido_item_id` nullable: una línea "sin corresponder" (sin match aceptado) no se asocia a ningún ítem del pedido, pero queda en el registro del remito.
- `item_id` se copia del `pedido_item_id` matcheado (si ese ítem del pedido tenía `item_id`) — permite actualizar `compras_stock_actual` sin tener que resolver el join en cada operación. Si el `pedido_item_id` era una línea libre (sin `item_id`), esta columna queda null y esa línea no actualiza stock.
- `unique index (pedido_id, numero)`: sostiene la detección de duplicados (decisión 9) a nivel de base; la UI debe capturar el conflicto y ofrecer sobrescribir en vez de mostrar un error crudo.
- Cantidad recibida por ítem de pedido = `sum(cantidad) from compras_remito_items where pedido_item_id = ...` — no se persiste, se calcula al leer.

## Rutas y navegación

`lib/modulos.ts` — agregar una entrada nueva bajo la sección `Compras`:

```ts
{ key: 'compras-remitos', label: 'Remitos', icon: '🚚', href: '/admin/compras/remitos', section: 'Compras' },
```

Mismo esquema de acceso que Fase 1/2: gateado por `app/admin/layout.tsx`, y para que `squad` lo vea hace falta asignarle `compras-remitos` en `profiles.modulos_permitidos`.

## Pantallas

### Sección "Remitos" dentro de `/admin/compras/pedidos`

Extiende `PedidosClient.tsx` (o un componente nuevo `RemitosPedidoSection.tsx` usado ahí):

- Visible cuando el pedido está en `enviado` o `cerrado` (no en `borrador`).
- Cada ítem del pedido muestra "recibido X / Y" (X = suma de `compras_remito_items.cantidad` matcheadas a ese `pedido_item_id`).
- Botón "Registrar remito": abre un form con número + fecha + líneas (descripción libre + cantidad + precio opcional). A medida que se tipea cada descripción, se sugiere el `pedido_item_id` con mejor match por superposición de palabras normalizadas (sin tildes, minúsculas, ignorando palabras muy cortas); el usuario puede aceptar o corregir con un selector de los ítems del pedido (incluyendo la opción "sin corresponder").
- Al guardar: si ya existe un remito con el mismo número en ese pedido, confirmar sobrescritura (borra el remito anterior — lo que revierte su efecto en stock vía `on delete cascade` + recálculo — e inserta el nuevo). Si no, inserta `compras_remitos` + `compras_remito_items`, y para cada línea con `item_id` resuelto, upsert de `compras_stock_actual` (`cantidad = cantidad + recibido`, `actualizado_en = now()`, `actualizado_por = usuario`).
- Listado de remitos ya registrados en el pedido (número, fecha, líneas): acciones editar (reabre el form precargado) y borrar (confirmación → delete, revierte stock restando lo que ese remito había sumado).

### `/admin/compras/remitos` — Listado global

- `app/admin/compras/remitos/page.tsx`: server component, mismo patrón que fases anteriores — fetch inicial (`compras_remitos` con join a `compras_pedidos(proveedor_id → proveedores(nombre))` y conteo de líneas), pasa como prop.
- `components/compras/RemitosClient.tsx`: tabla con columnas proveedor, pedido (fecha), N° remito, fecha, cantidad de líneas. Filtro por proveedor y por número (texto libre), orden por columna clickeando encabezado (mismo patrón que el legacy y que `sortRemitos` en spirit, adaptado a las columnas nuevas). Sin toggle Activos/Todos ni paginación por ahora (volumen esperado bajo, igual que Insumos/Proveedores en Fase 1).

## Checklist de cobertura para el plan de implementación

- [ ] Migración SQL (`compras_remitos`, `compras_remito_items`, índices, unique constraint, RLS) aplicada localmente y verificada.
- [ ] `lib/modulos.ts` actualizado con la entrada `compras-remitos`.
- [ ] Registro de remito dentro de un pedido: form con auto-match de líneas, upsert de `compras_stock_actual`, manejo de duplicados (sobrescribir).
- [ ] Indicador "recibido X/Y" por ítem del pedido, calculado por agregación (no columna persistida).
- [ ] Editar y borrar remito: recalcula cantidad recibida y revierte/reaplica stock correctamente.
- [ ] `/admin/compras/remitos` + `RemitosClient.tsx`: listado, filtro por proveedor/número, orden por columna.
- [ ] Probado manualmente con un usuario `admin` y un usuario `squad` con el módulo asignado vía `modulos_permitidos`.
- [ ] Confirmar que un usuario sin `compras-remitos` en `modulos_permitidos` (y no admin) no puede acceder ni por URL directa ni por RLS.
- [ ] Verificar que cerrar un pedido sigue sin bloquearse ni verse afectado por recepción incompleta.
- [ ] Verificar que borrar/editar un remito deja `compras_stock_actual` en el valor correcto (sumar y luego revertir da el mismo stock inicial).

## Preguntas abiertas para la siguiente sesión (no bloquean Fase 3)

- El diseño de costeo por masa (fase futura) va a necesitar precio por insumo y un concepto de lotes de producción — ninguno definido todavía; el campo `precio` opcional de `compras_remito_items` queda como dato crudo disponible para esa fase.
- Si en el futuro se necesita repartir un remito entre varios pedidos, este modelo (`pedido_id` en `compras_remitos`) habría que revisarlo — decisión 3 lo descarta por ahora.
