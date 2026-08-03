# Fase 4 de Compras — Reportes (diseño)

## Contexto

Migración del módulo Compras (legacy HTML + Google Sheets, repo `Ya!ModuloCompra`) a módulo nativo en Chipacitos. Fases 1-3 (Stock + Proveedores, Pedidos a proveedores, Remitos) ya están implementadas, pusheadas a `origin/dev` y con QA confirmado por el usuario. Fase 4 es "Reportes", la fase que ya estaba en el roadmap original.

El costeo por masa (cálculo de costo/kg de insumos para lotes de producción interna) fue deliberadamente excluido de esta fase — depende de un diseño propio de precios por insumo + lotes de producción que no existe hoy, y quedó acordado como una fase futura separada.

Trabajo sobre rama `dev`. Nunca tocar `main` (tiene la base de datos de producción real, proyecto Supabase "YA! mayorista").

## Alcance

Una pantalla nueva `/admin/compras/reportes` con tres reportes, cada uno filtrable por un rango de fechas compartido (Mes actual / Mes anterior / Rango personalizado):

1. **Gasto por proveedor** — cuánto se gastó por proveedor en el período.
2. **Historial de pedidos y remitos** — vista consolidada de pedidos y sus remitos, pensada para mirar atrás, no para operar.
3. **Movimiento de stock por insumo** — altas (por remito) y ajustes manuales de stock en el período.

Fuera de alcance: gráficos (no hay librería de charts instalada; se decide explícitamente no agregar una para esta fase — tablas + totales, consistente con el resto del módulo). Costeo por masa. Reconstrucción retroactiva de movimientos de stock anteriores al deploy de esta fase.

## Arquitectura

Sigue el patrón bespoke ya usado en Fases 1-3: `page.tsx` (server component) hace el fetch inicial con el Supabase server client, con los joins necesarios (mismo patrón que `RemitosClient` ya usa para `compras_remitos → compras_pedidos → proveedores`). El client component recibe los datos ya joineados y hace el filtrado por fecha, agrupación y sumas en memoria — sin API routes nuevas, sin librería de agregación externa.

Nueva entrada `Reportes` en `lib/modulos.ts`, sección "Compras", ruta `/admin/compras/reportes`. Mismo control de acceso que el resto del módulo: `admin` sin restricción, `squad` vía `profiles.modulos_permitidos`.

## Modelo de datos nuevo

### `compras_stock_movimientos`

Hoy no existe ningún registro de movimientos de stock: `compras_stock_actual` guarda solo el valor absoluto vigente por insumo (se pisa en cada guardado), sin historial. Esta tabla nueva empieza a trackear movimientos desde que se despliega esta fase — **no hay reconstrucción retroactiva**; el reporte de movimiento de stock arranca vacío y debe dejarlo explícito en la UI ("datos desde [fecha de deploy]") para que no se lea como incompleto por error. Si más adelante se consigue un histórico confiable de otra fuente, la carga de ese histórico se trata como un import manual aparte, no parte de esta fase.

```sql
create table compras_stock_movimientos (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references compras_items(id) on delete cascade,
  delta        numeric not null,           -- positivo = entrada, negativo = salida/ajuste a la baja
  tipo         text not null check (tipo in ('entrada_remito', 'ajuste_manual')),
  remito_id    uuid references compras_remitos(id) on delete set null,
  creado_por   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index idx_compras_stock_movimientos_item_id on compras_stock_movimientos(item_id);

alter table compras_stock_movimientos enable row level security;

create policy "admin y squad manejan compras_stock_movimientos" on compras_stock_movimientos
  for all using (
    (select rol from profiles where id = auth.uid()) in ('admin', 'squad')
  );
```

### Puntos de instrumentación (decisión: extender código existente, no migrar a RPC)

Se evaluaron dos opciones para escribir estos movimientos:

- **Opción A (elegida):** extender las dos funciones que ya son el único punto de escritura sobre `compras_stock_actual`, agregándoles un insert a `compras_stock_movimientos`. Cambio mínimo, no toca la lógica de negocio de Fase 3 (remitos) más allá de sumarle una escritura.
- **Opción B (descartada para esta fase):** centralizar en una función RPC de Postgres que haga upsert de `compras_stock_actual` + insert del movimiento de forma atómica, reemplazando el patrón actual de lectura-luego-escritura (que no es atómico). Más robusto, pero implica refactorizar código de Fase 3 que solo tuvo QA parcial confirmado por el usuario ("salió bien hasta lo que probé"), con riesgo de regresión. Se deja como mejora futura si aparece un bug real de stock por condición de carrera — no se mezcla con esta fase, que es sobre reportes.

Cambios concretos (Opción A):

- **`sumarStock` en `app/admin/compras/pedidos/RemitosPedido.tsx`** — ya es la única función que hace +/- sobre `compras_stock_actual` al guardar, editar (revertir+reemplazar) o borrar un remito. Se le agrega un insert con `tipo='entrada_remito'`, `remito_id`, y el mismo `delta` que ya calcula. Cubre alta al guardar, baja al revertir/editar/borrar, sin duplicar lógica de negocio.
- **`guardarCantidad` en `app/admin/compras/stock/StockClient.tsx`** — hoy pisa el valor absoluto vía upsert. Se calcula `delta = nuevaCantidad - cantidadAnterior` antes del upsert y, si es distinto de 0, se inserta un movimiento con `tipo='ajuste_manual'` (sin `remito_id`).

## Reporte 1 — Gasto por proveedor

Tabla agrupada por proveedor dentro del rango de fechas elegido (filtra por `compras_remitos.fecha`):

| Proveedor | Remitos | Líneas con precio | Líneas sin precio | Gasto total |
|---|---|---|---|---|

- Gasto total = `Σ cantidad × precio` de `compras_remito_items` donde `precio is not null`, vía `remito → pedido (compras_pedidos) → proveedor_id`.
- `precio` es un campo opcional que se carga a mano al registrar el remito — no todas las líneas lo van a tener. La columna "Líneas sin precio" existe para que el gasto no se lea como total exacto cuando en realidad es parcial: si un proveedor tiene muchas líneas sin precio, se nota en la tabla en vez de esconder el dato.
- Fila de totales al pie (gasto total del período, todos los proveedores).
- Fila de proveedor expandible: detalle línea por línea (descripción, cantidad, precio, subtotal, remito de origen).

## Reporte 2 — Historial de pedidos y remitos

Tabla de pedidos dentro del rango de fechas (filtro por `created_at`/`cerrado_en`, más filtros por proveedor y estado):

| Proveedor | Estado | Creado | Enviado | Cerrado | Remitos | Gasto total |
|---|---|---|---|---|---|---|

- "Remitos" = cantidad de remitos asociados al pedido. "Gasto total" = mismo cálculo del Reporte 1, a nivel pedido.
- Fila de pedido expandible: lista de sus remitos (número, fecha, líneas, gasto).
- A diferencia de la pantalla operativa de Pedidos (que solo distingue "activos/todos"), este reporte cubre cualquier rango de fechas y estado, y no tiene acciones de editar/cerrar/enviar — es de solo lectura, para análisis.

## Reporte 3 — Movimiento de stock por insumo

Tabla agrupada por insumo dentro del rango de fechas elegido (filtra por `compras_stock_movimientos.created_at`):

| Insumo | Proveedor | Entradas (remito) | Ajustes manuales | Balance del período | Stock actual |
|---|---|---|---|---|---|

- "Entradas" = `Σ delta` con `tipo='entrada_remito'` (normalmente positivo; puede incluir reversiones negativas por edición/borrado de remito). "Ajustes manuales" = `Σ delta` con `tipo='ajuste_manual'` (positivo o negativo). "Balance" = suma de ambos.
- "Stock actual" viene de `compras_stock_actual` (foto de hoy, no del período) — solo de contexto.
- Insumos sin ningún movimiento en el rango elegido **se ocultan** (no aparecen con ceros), para que la tabla quede enfocada en lo que realmente pasó en el período.
- Fila de insumo expandible: cada movimiento individual (fecha, tipo, delta, remito de origen si aplica, quién lo hizo).

## Verificación

- `tsc --noEmit`, `npm run lint`, `npm run build` limpios en cada tarea, como en fases anteriores.
- Sanity check de los cálculos de agregación (gasto por proveedor, entradas/ajustes por insumo) con `npx tsx` sobre un archivo real (no `-e`, no imprime nada en este entorno con imports relativos) contra datos de prueba armados a mano.
- Verificación de la migración y RLS contra la base real con `npx supabase db query --linked "<SQL>"` (no hay `psql` en este entorno).
- QA manual antes de cerrar la fase: crear un remito con precio, otro sin precio, y un ajuste manual de stock; confirmar que los tres reportes reflejan lo esperado. Dado que el QA de Fase 3 quedó parcial ("salió bien hasta lo que probé", sin confirmar los 6 puntos uno por uno), esta vez se le va a pedir al usuario que confirme explícitamente cada punto del checklist antes de dar la fase por cerrada.
