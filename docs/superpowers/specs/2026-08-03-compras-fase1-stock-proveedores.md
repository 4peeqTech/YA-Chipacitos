# Compras Fase 1: Stock + Proveedores — Spec

**Contexto general:** primera de cuatro fases para migrar el módulo de Compras (hoy un HTML monolítico con sync a Google Sheets, en `Ya!ModuloCompra`) a un módulo nativo dentro de Ya!Chipacitos. Roadmap completo: **Fase 1 — Stock + Proveedores** → Fase 2 — Pedidos a proveedores → Fase 3 — Remitos → Fase 4 — Reportes → Cutover (retirar el HTML viejo y el Apps Script). Este documento cubre solo Fase 1.

**Rama:** todo el trabajo va sobre `dev`. Nunca tocar `main` (tiene la base de datos de producción).

## Decisiones previas (no se reabren en esta fase)

- No se migra el historial de la Google Sheet — el módulo arranca en limpio.
- Acceso solo para `admin` y `squad` (los roles operativos `local`/`deposito`/`fabrica` no lo usan).
- Catálogo de insumos data-driven (tabla editable desde el admin), no hardcodeado.
- Stock guarda solo el valor actual (upsert), sin historial por ahora.
- "Global" y "Huevos" (Huevo Campo) son proveedores reales ya existentes en la tabla `proveedores`, no categorías — todo insumo tiene `proveedor_id` obligatorio.

## Decisiones tomadas en esta sesión

Verificación contra el código actual de Chipacitos (rama `dev`, sin cambios pendientes) mostró que el diseño original necesitaba tres ajustes, confirmados con el usuario:

1. **Patrón de CRUD: bespoke, no `TablaMaestra`.** `components/ui/TablaMaestra.tsx` es un componente cerrado para listas simples `{id, nombre, activo}` contra una API route REST — no soporta columnas adicionales (`proveedor_id`, `unidad`, `meta_semanal`, `consumo_por_masa`, `orden`). El precedente real en el repo es `app/admin/proveedores/ProveedoresClient.tsx`: componente cliente bespoke con llamadas directas al Supabase browser client (`supabase.from(...).insert/update/delete`) envueltas en `useTransition`, sin fetch a API routes intermedias. Los nuevos componentes de Compras siguen ese mismo patrón.
2. **RLS: `admin` + `squad` desde el schema**, no solo `admin`. La tabla `proveedores` hoy solo permite `rol = 'admin'` en su policy `FOR ALL` pese a que `squad` puede llegar a la pantalla vía `profiles.modulos_permitidos` — un gap existente que no se resuelve en esta fase (fuera de alcance tocar `proveedores`), pero que no se repite en las tablas nuevas.
3. **Lógica de alerta: solo `cantidad < meta_semanal`.** `consumo_por_masa` queda como dato informativo en la ficha del insumo (insumo para calcular `meta_semanal` a mano), sin lógica de alerta propia en Fase 1.

## Alcance

### Incluye
- Migración SQL: columna `maneja_stock` en `proveedores`, tablas nuevas `compras_items` y `compras_stock_actual`.
- Pantalla de catálogo de insumos (CRUD): `/admin/compras/insumos`.
- Pantalla de stock actual (carga de cantidades + alertas): `/admin/compras/stock`.
- Entradas nuevas en `lib/modulos.ts` bajo `section: 'Compras'`.

### No incluye (fases siguientes o fuera de alcance)
- Pedidos a proveedores (Fase 2), remitos (Fase 3), reportes (Fase 4).
- Historial de stock (solo se guarda el valor actual).
- Tocar la RLS existente de `proveedores` (queda con el gap conocido, ver punto 2 arriba).
- Cualquier lógica de alerta basada en `consumo_por_masa`.
- Retirar el HTML viejo o el Apps Script (eso es el paso de Cutover, al final de Fase 4).

## Modelo de datos

### Migración

Archivo nuevo en `supabase/migrations/`, timestamp posterior al último existente (`20260622214420_011_plan_cuentas.sql` es el más reciente visto en esta sesión — confirmar cuál es el último real antes de nombrar el archivo).

```sql
-- Fase 1 de Compras: maneja_stock en proveedores + catálogo de insumos + stock actual

alter table proveedores
  add column if not exists maneja_stock boolean not null default false;

create table if not exists compras_items (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id),
  nombre text not null,
  unidad text not null,
  meta_semanal numeric not null default 0,
  consumo_por_masa numeric,
  orden integer not null default 0,
  estado text not null default 'activo' check (estado in ('activo', 'archivado')),
  created_at timestamptz default now()
);

create index if not exists idx_compras_items_proveedor_id on compras_items(proveedor_id);

create table if not exists compras_stock_actual (
  item_id uuid primary key references compras_items(id) on delete cascade,
  cantidad numeric not null default 0,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references profiles(id)
);

alter table compras_items enable row level security;
alter table compras_stock_actual enable row level security;

create policy "admin y squad manejan compras_items"
  on compras_items for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.rol in ('admin', 'squad')
    )
  );

create policy "admin y squad manejan compras_stock_actual"
  on compras_stock_actual for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.rol in ('admin', 'squad')
    )
  );
```

Notas:
- `estado` (no `activo` boolean) para ser consistente con la convención ya usada en `proveedores` (`estado text check (in 'activo','archivado')`).
- `compras_stock_actual.item_id` es la PK (1 fila = 1 insumo, sin historial, como ya se decidió). El upsert de stock es por `item_id`.
- Confirmar el nombre exacto de la policy de `profiles` / la forma de chequear `rol` contra el patrón real usado en otras migraciones (revisar `20260601000000_initial_schema.sql` u otra migración con policies por rol) antes de ejecutar — el snippet de arriba asume una tabla `profiles` con columna `rol`, que es lo que confirmó la exploración de esta sesión.

## Rutas y navegación

`lib/modulos.ts` — agregar dos entradas nuevas bajo una sección `Compras` (sección nueva, no existe hoy):

```ts
{ key: 'compras-insumos', label: 'Insumos', icon: '📋', href: '/admin/compras/insumos', section: 'Compras' },
{ key: 'compras-stock', label: 'Stock', icon: '📦', href: '/admin/compras/stock', section: 'Compras' },
```

`Proveedores` permanece donde está (`section: 'Parámetros'`) — no se mueve a `Compras` en esta fase.

El acceso a `/admin/*` ya está gateado por `app/admin/layout.tsx` (redirect si `rol !== 'admin' && !esRolConModulos(rol)`); para que `squad` vea estos módulos hace falta que un admin les asigne `compras-insumos` / `compras-stock` en `profiles.modulos_permitidos` desde la pantalla de Roles — no requiere cambios de código adicionales, es configuración de datos.

## Pantallas

### `/admin/compras/insumos` — Catálogo de insumos

- `app/admin/compras/insumos/page.tsx`: server component, mismo patrón que `app/admin/proveedores/page.tsx` — auth check, fetch `compras_items` (`select('*, proveedores(nombre)').order('orden')`), pasa como prop inicial al client component.
- `components/compras/InsumosClient.tsx`: client component bespoke (mismo patrón que `ProveedoresClient.tsx`):
  - Lista de insumos con filtro activo/archivado/todos, búsqueda por nombre.
  - Formulario de alta/edición: `nombre`, `proveedor_id` (select poblado con `proveedores` que tengan `maneja_stock = true`), `unidad`, `meta_semanal`, `consumo_por_masa` (opcional), `orden`.
  - CRUD directo con `supabase.from('compras_items').insert/update` (`estado` en vez de eliminar duro, igual que `proveedores.archivar()`).

### `/admin/compras/stock` — Carga de stock actual

- `app/admin/compras/stock/page.tsx`: server component, fetch `compras_items` (solo `estado = 'activo'`, `order('orden')`) con join a `compras_stock_actual` (`left join`, cantidad default 0 si no hay fila todavía).
- `components/compras/StockClient.tsx`: client component:
  - Lista de insumos agrupados/ordenados por `orden`, cada uno con un input numérico de `cantidad` y botón guardar (o autosave on blur).
  - Al guardar: `supabase.from('compras_stock_actual').upsert({ item_id, cantidad, actualizado_en: new Date().toISOString(), actualizado_por: user.id }, { onConflict: 'item_id' })`.
  - Alerta visual (badge/color) por insumo cuando `cantidad < meta_semanal`. Cálculo 100% en cliente a partir de los datos ya cargados — sin lógica en el servidor ni columna calculada.
  - `consumo_por_masa` se muestra como dato informativo en la fila (si está cargado), sin afectar la alerta.

## Checklist de cobertura para el plan de implementación

- [ ] Migración SQL (tabla + columna + RLS) aplicada localmente y verificada con `supabase db diff` / migration dry-run.
- [ ] `lib/modulos.ts` actualizado con sección `Compras`.
- [ ] `/admin/compras/insumos` + `InsumosClient.tsx` (CRUD completo: alta, edición, archivar).
- [ ] `/admin/compras/stock` + `StockClient.tsx` (carga de cantidad, upsert, alerta visual).
- [ ] Probado manualmente con un usuario `admin` y un usuario `squad` con el módulo asignado vía `modulos_permitidos`.
- [ ] Confirmar que un usuario sin `compras-insumos`/`compras-stock` en `modulos_permitidos` (y no admin) no puede acceder ni por URL directa ni por RLS.

## Preguntas abiertas para la siguiente sesión (no bloquean Fase 1)

- El gap de RLS de `proveedores` (solo `admin`, pese a que `squad` puede llegar por `modulos_permitidos`) — ¿se corrige en algún momento, o es intencional que solo admin pueda escribir proveedores?
- Confirmar el nombre real de la última migración aplicada antes de fijar el timestamp del archivo nuevo.
