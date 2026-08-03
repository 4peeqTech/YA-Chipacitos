# Compras Fase 2: Pedidos a proveedores — Spec

**Contexto general:** segunda de cuatro fases para migrar el módulo de Compras (hoy un HTML monolítico con sync a Google Sheets, en `Ya!ModuloCompra`) a un módulo nativo dentro de Ya!Chipacitos. Roadmap completo: Fase 1 — Stock + Proveedores → **Fase 2 — Pedidos a proveedores** → Fase 3 — Remitos → Fase 4 — Reportes → Cutover (retirar el HTML viejo y el Apps Script). Este documento cubre solo Fase 2. Fase 1 ya está mergeada en `origin/dev` (commits `ae9c167`..`5d5b852`): catálogo de insumos (`compras_items`), stock actual (`compras_stock_actual`), columna `maneja_stock` en `proveedores`.

**Rama:** todo el trabajo va sobre `dev`. Nunca tocar `main` (tiene la base de datos de producción).

## Decisiones previas (no se reabren en esta fase)

- No se migra el historial de la Google Sheet — el módulo arranca en limpio.
- Acceso solo para `admin` y `squad` (los roles operativos `local`/`deposito`/`fabrica` no lo usan).
- RLS de tablas nuevas de Compras: `admin` + `squad` desde el schema (no se repite el gap de `proveedores`, que sigue solo `admin`).

## Investigación del flujo legacy

Revisado `Ya!ModuloCompra/index.html` (tab "Pedidos" + módulo de cálculo + seguimiento de pedidos activos) para entender el comportamiento real antes de diseñar:

- **Cálculo → armado:** cada proveedor (Bolsaplast, Global Base/Complementario, Huevo Campo, etc.) tiene una función de cálculo ad-hoc que compara stock cargado vs. una meta y sugiere ítems; el usuario los revisa/edita en una lista antes de generar el mensaje. Además se pueden agregar ítems manuales sueltos.
- **Mensaje y envío:** se genera un texto formateado (título con sigla del proveedor, fecha, datos de facturación/entrega según una asignación fija proveedor→local, detalle de ítems) y se abre un link de WhatsApp (`api.whatsapp.com/send` o `wa.me/{telefono}`) — envío 100% manual, sin integración real ni confirmación de entrega por API.
- **Estados:** el legacy tiene dos sistemas redundantes (un "historial" con flag manual pendiente/enviado, y un ciclo activo→cerrado con reapertura para los pedidos Global). Fase 2 no replica esa duplicación — diseño limpio con un solo ciclo de estados (ver más abajo).
- **Multiplicidad:** pueden coexistir varios pedidos activos para el mismo proveedor.
- **Cierre:** decisión manual del usuario, desacoplada de si llegó la mercadería.

## Decisiones tomadas en esta sesión

1. **Autosugerencia de cantidades:** al crear un pedido para un proveedor con `maneja_stock = true`, se pre-cargan ítems desde `compras_items` (activos) con `cantidad = max(0, meta_semanal - stock_actual)`, excluyendo los que dan 0. Sin fórmulas especiales por proveedor (no se replican las reglas ad-hoc del legacy, como cajones de huevos).
2. **Estados del pedido:** `borrador` → `enviado` → `cerrado`. Simple, sin paso de "confirmado por el proveedor" ni trackeo de cantidad recibida (eso es Fase 3, vía remitos).
3. **Envío:** mensaje de texto formateado + deep link de WhatsApp, igual espíritu que el legacy. El link usa `wa.me/{proveedores.contacto_telefono}` si el proveedor tiene teléfono cargado; si no, cae a `api.whatsapp.com/send` sin número (el usuario elige el chat a mano).
4. **Datos de facturación/entrega en el mensaje:** se agrega columna `local` (texto libre) a `proveedores`. Los datos de sucursal/CUIT/dirección de cada local (hoy son 2: Paraguay 388 y Gdor. Lagraña) quedan hardcodeados en el código del generador de mensaje, igual que en el legacy — no se crea una tabla de locales.
5. **Multiplicidad:** se permite más de un pedido abierto (`borrador`/`enviado`) por proveedor al mismo tiempo, igual que el legacy.
6. **Cierre no toca stock:** cerrar un pedido es puramente un cambio de estado. `compras_stock_actual` sigue actualizándose solo a mano desde `/admin/compras/stock`; la recepción real ligada a mercadería es tema de Fase 3.
7. **Ítems del pedido:** cada línea puede referenciar un insumo del catálogo (`item_id`) o ser una línea libre sin referencia (`item_id = null`, `descripcion` tipeada a mano) — para pedir algo puntual que no está en `compras_items`. `descripcion`/`unidad` se copian al agregar el ítem, así el pedido queda "congelado" ante cambios futuros del catálogo.
8. **Proveedores elegibles:** cualquier proveedor activo, no solo los que manejan stock. Si no maneja stock (o no tiene faltantes), el pedido arranca vacío y el usuario agrega ítems a mano.

## Alcance

### Incluye

- Migración SQL: columna `local` en `proveedores`, tablas nuevas `compras_pedidos` y `compras_pedido_items`.
- Pantalla `/admin/compras/pedidos`: armar pedido (selección de proveedor + autosugerencia), edición de ítems, generación de mensaje, envío por WhatsApp, listado con filtro Activos/Todos, edición y cierre de pedidos existentes.
- Entrada nueva en `lib/modulos.ts` bajo `section: 'Compras'`.

### No incluye (fases siguientes o fuera de alcance)

- Remitos y recepción de mercadería (Fase 3), reportes (Fase 4).
- Cualquier actualización de `compras_stock_actual` desde el flujo de pedidos.
- Integración real con WhatsApp Business API o confirmación de entrega — sigue siendo un deep link manual.
- Reglas de cálculo especiales por proveedor (ej. cajones de huevos) — la autosugerencia es genérica (`meta_semanal - stock_actual`).
- Tabla de locales — `proveedores.local` es texto libre, sin catálogo propio.
- Retirar el HTML viejo o el Apps Script (eso es el paso de Cutover, al final de Fase 4).

## Modelo de datos

### Migración

Archivo nuevo en `supabase/migrations/`, timestamp posterior al último de Fase 1 (`5d5b852` en `origin/dev` — confirmar el nombre exacto del archivo más reciente antes de nombrar el nuevo).

```sql
-- Fase 2 de Compras: pedidos a proveedores

alter table proveedores
  add column if not exists local text;

create table if not exists compras_pedidos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id),
  estado text not null default 'borrador' check (estado in ('borrador', 'enviado', 'cerrado')),
  mensaje text,
  creado_por uuid references profiles(id),
  created_at timestamptz default now(),
  enviado_en timestamptz,
  cerrado_en timestamptz
);

create index if not exists idx_compras_pedidos_proveedor_id on compras_pedidos(proveedor_id);
create index if not exists idx_compras_pedidos_estado on compras_pedidos(estado);

create table if not exists compras_pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references compras_pedidos(id) on delete cascade,
  item_id uuid references compras_items(id),
  descripcion text not null,
  unidad text,
  cantidad numeric not null default 0,
  orden integer not null default 0
);

create index if not exists idx_compras_pedido_items_pedido_id on compras_pedido_items(pedido_id);

alter table compras_pedidos enable row level security;
alter table compras_pedido_items enable row level security;

create policy "admin y squad manejan compras_pedidos"
  on compras_pedidos for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.rol in ('admin', 'squad')
    )
  );

create policy "admin y squad manejan compras_pedido_items"
  on compras_pedido_items for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.rol in ('admin', 'squad')
    )
  );
```

Notas:
- `estado` sigue la convención de texto con `check` ya usada en `proveedores`/`compras_items`, adaptada a los 3 valores propios de un pedido (no es el mismo dominio `activo`/`archivado`).
- `mensaje` guarda el último texto generado (se puede regenerar y sobreescribir mientras el pedido no esté cerrado).
- Confirmar el nombre exacto de la policy de `profiles`/columna `rol` contra el patrón real usado en la migración de Fase 1 antes de ejecutar (mismo chequeo que se hizo en esa fase).

## Rutas y navegación

`lib/modulos.ts` — agregar una entrada nueva bajo la sección `Compras` (creada en Fase 1):

```ts
{ key: 'compras-pedidos', label: 'Pedidos', icon: '📋', href: '/admin/compras/pedidos', section: 'Compras' },
```

Mismo esquema de acceso que Fase 1: gateado por `app/admin/layout.tsx`, y para que `squad` lo vea hace falta asignarle `compras-pedidos` en `profiles.modulos_permitidos`.

## Pantalla

### `/admin/compras/pedidos` — Pedidos a proveedores

- `app/admin/compras/pedidos/page.tsx`: server component, mismo patrón que Fase 1 — auth check, fetch inicial (`compras_pedidos` con join a `proveedores(nombre, local, contacto_telefono)` y a `compras_pedido_items`), pasa como prop al client component.
- `components/compras/PedidosClient.tsx`: client component bespoke (patrón `ProveedoresClient.tsx`/`StockClient.tsx`):
  - **Selector de proveedor + botón "Nuevo pedido":** lista proveedores activos. Al confirmar, crea la fila en `compras_pedidos` (`estado = 'borrador'`) y, si el proveedor tiene `maneja_stock = true`, pre-carga `compras_pedido_items` desde `compras_items` activos con `cantidad = max(0, meta_semanal - stock_actual)` (excluyendo cantidad 0). Si no maneja stock, o no hay faltantes, arranca sin ítems.
  - **Edición de ítems del borrador:** lista editable (cantidad, descripción, unidad), agregar línea libre, quitar línea. Autosave con `useTransition`, igual que Stock.
  - **Generar mensaje:** construye el texto (título con sigla del proveedor + fecha del día, sección de facturación/entrega según `proveedores.local` — mapeo hardcodeado igual que el legacy para los 2 locales existentes —, detalle de ítems) y lo guarda en `compras_pedidos.mensaje`. Se puede regenerar mientras no esté cerrado.
  - **Enviar:** botón que abre `https://wa.me/{contacto_telefono}?text=...` si el proveedor tiene teléfono, o `https://api.whatsapp.com/send?text=...` si no; marca `estado = 'enviado'` y `enviado_en = now()`.
  - **Listado de pedidos:** toggle **Activos** (`borrador` + `enviado`) / **Todos**, con paginación — mismo patrón ya usado en la vista global de remitos. Columnas: proveedor, estado (badge), fecha, cantidad de ítems. Acciones por fila: ver/editar ítems, regenerar y reenviar mensaje, **cerrar pedido** (confirmación → `estado = 'cerrado'`, `cerrado_en = now()`).

## Checklist de cobertura para el plan de implementación

- [ ] Migración SQL (columna `local` + tablas + RLS) aplicada localmente y verificada con `supabase db diff` / migration dry-run.
- [ ] `lib/modulos.ts` actualizado con la entrada `compras-pedidos`.
- [ ] `/admin/compras/pedidos` + `PedidosClient.tsx`: alta de pedido con autosugerencia, edición de ítems (catálogo + líneas libres), generación de mensaje, envío por WhatsApp, listado Activos/Todos con paginación, cierre de pedido.
- [ ] Probado manualmente con un usuario `admin` y un usuario `squad` con el módulo asignado vía `modulos_permitidos`.
- [ ] Confirmar que un usuario sin `compras-pedidos` en `modulos_permitidos` (y no admin) no puede acceder ni por URL directa ni por RLS.
- [ ] Verificar que cerrar/reenviar un pedido no modifica `compras_stock_actual`.

## Preguntas abiertas para la siguiente sesión (no bloquean Fase 2)

- El diseño de Fase 3 (Remitos) va a necesitar referenciar `compras_pedidos.id` para asociar la mercadería recibida a un pedido — confirmar en esa fase si un remito puede cubrir ítems de más de un pedido a la vez (el legacy lo permite vía `remito_pedido_id` por remito, pero un remito real puede traer cosas de distintos pedidos).
- Si en el futuro se agrega un tercer local, el mapeo hardcodeado de datos de facturación en el generador de mensaje habría que revisarlo (hoy alcanza con 2, igual que el legacy).
