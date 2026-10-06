# A2c — Ficha de insumo conectada (especificación ejecutable)

> Planificador: agente `b859c75e`, 2026-10-06. Rama `bloque2/stock`, reseteada a `origin/qa` @ `bb49942` (B0, A1, B1, A2a, B2 y A2b adentro).
> Plan maestro: `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md`: fase A2c, "Conexión del circuito" y la tabla de dueños (A2c es dueña de `v_compras_stock_movimientos` y de la trazabilidad del insumo).
> Contratos que se respetan: `notas-A1.md` (ficha de Stock y chips de conteo), `notas-A2a.md` (`v_compras_insumos_resumen`, "último precio solo admin"), `notas-A2b.md` (unidades, `cobra_por`, kg reales; "Para A2c"), `notas-B0.md` (`LinkEntidad`, `useQuitarParams`, `useAlCambiarParam`) y `plan-B3.md` en `origin/bloque2/pedidos` (§1.8, §3.12, §6.6, §6.8).
> El Ejecutor implementa **esto**, sin improvisar. Si la realidad no encaja, frena y avisa al coordinador.

**Reglas que no se negocian:**
- Solo dev (`fafckqysyvtlslfnpzrh`) y QA. **Prod no se toca, ni para leer.** Nunca `supabase link`. Siempre `--linked --project-ref fafckqysyvtlslfnpzrh`.
- Cero triggers. A2c **no mueve stock**: solo lee. No redefine ninguna RPC de escritura.
- Migración `supabase/migrations/20261006120000_compras_trazabilidad_insumo.sql`. El timestamp tiene que ser **mayor que `20261005190000`** (B3, ya aplicada en dev) y que el último de `qa` al momento del push. Si al rebasear hay uno mayor, se renombra.
- **Prerrequisitos por paso** (§10):
  - el paso 1 (SQL en lote revertido + lógica pura) puede arrancar ya;
  - los pasos 2 y 3 (UI, push y Reportes) necesitan **B3 mergeada en `qa`**. Usan `v_compras_proveedor_insumos`, el `pestana` de `rutaDe` y la versión nueva de `ReportesClient`, que son de B3. Además el CLI no deja pushear `120000` si `qa` no tiene `190000`, que dev ya tiene.
- Antes del push: `git fetch && git rebase origin/qa`, el OK del coordinador y un solo push a la vez.
- **Ninguna consulta nueva sin límite:** todo lo que A2c lee va acotado por insumo, por período o con `limit`.

---

## 0. Qué cambia, en una línea

La ficha del insumo (la de Stock, a la que ya llevan todos los links de B0) pasa a tener tres pestañas:
- **Stock:** lo de hoy.
- **Compras:** resumen del período, puente de stock, precio en el tiempo, últimas facturas y remitos, y proveedores.
- **Movimientos:** el ledger, con links a remito, factura y conteo.

Todo sale de una función nueva, `compras_trazabilidad_insumo(desde, hasta, insumo?)`, que responde "cuánto se pidió, recibió, facturó y pagó de este insumo, a qué precio, y cómo se movió el stock". Con esa misma función se arma el reporte **"Por insumo"** de Compras › Reportes, exportable a CSV. La pestaña "Catálogo" de Insumos pasa a llamarse **"Insumos"**.

## 1. Relevamiento del código vigente (`qa` @ `bb49942`, dev en solo lectura el 2026-10-06)

### 1.1 Ficha de Stock

- `app/admin/compras/stock/StockClient.tsx`:
  - abre `StockFicha` en un `Modal` `size="lg"` con `pantallaCompletaMobile`;
  - lee `?insumo=` (prop de `page.tsx`), `useQuitarParams('insumo')` y `useAlCambiarParam`;
  - pide confirmación al cerrar con un ajuste a medio cargar (`onCambios`).
- `StockFicha.tsx` (352 líneas): stock actual con `textoBaseItem`, el bloque "Ajustar stock" y "Últimos movimientos".
  - Los movimientos se leen con el cliente del navegador desde `v_compras_stock_movimientos`, de a 30 (`limit(limite + 1)`).
  - Revertir en línea solo para `ajuste_manual`.
  - Chip de conteo con `LinkEntidad`.
  - El chip del **remito sigue armado a mano** (`<Link href=…?remito=>`, `:256-265`). B0 lo dejó para A1, y A1 no lo cambió.
- `rutaDe({ tipo: 'insumo' })` → `/admin/compras/stock?insumo=<id>`. Llevan ahí los links de B0: líneas del pedido, `DiferenciasPanel`, reporte de movimientos, Insumos (nombre y stock) y ficha del proveedor.

### 1.2 Insumos

- `app/admin/compras/insumos/layout.tsx:9`: la pestaña de la lista se llama **"Catálogo"** (la otra es "Listas de conteo"). En el menú lateral el módulo ya se llama "Insumos" (`lib/modulos.tsx:55`).
- `InsumosClient.tsx`: la fila abre `InsumoModal` (el form de edición, 827 líneas, con estado sucio, archivar, reactivar, eliminar y "Cambios"). El nombre y el stock son `LinkEntidad` a la ficha de Stock.
- **`/admin/compras/insumos` no lee `?insumo=`.**

### 1.3 SQL

- `v_compras_stock_movimientos` (`20260925120000:193-217`, sin cambios desde entonces). Columnas en este orden: `id, item_id, delta, tipo, remito_id, conteo_id, created_at, item_nombre, creado_por_nombre, motivo, cantidad_antes, cantidad_despues, anula_movimiento_id, revertido, remito_codigo`.
  - El filtro es `where tiene_acceso_compras() or tiene_acceso_fabrica()`.
  - **No expone `factura_id` ni `discrepancia_id`**, que la tabla ya tiene (`20260928190000:92`, `20260929120000:77`).
- Quién escribe `factura_id` y `discrepancia_id` en el ledger:
  - el remito automático "desde factura" (`entrada_remito`, `factura_id`);
  - su baja al anular la factura (`salida_remito_anulado`, `factura_id`);
  - el ajuste por diferencia (`ajuste_factura`, `factura_id` + `discrepancia_id`);
  - y su reversión (`reversion`, ambos).
- `v_compras_insumos_resumen` (`20261005180000`): stock, `precio_ref` del principal, último precio facturado (solo admin), `pedidos_abiertos` y contadores. Es una fila por insumo, sin período.
- B3 (`20261005190000`, **ya aplicada en dev**, en `qa` cuando B3 se mergee) crea `v_compras_proveedor_insumos`: una fila por par proveedor–insumo, con `precio_ref`, `cobra_por`, `es_principal`, `activo`, `codigo_proveedor` y el último precio por proveedor (solo admin).
- Facturas (`compras_facturas`, `compras_factura_items`, `compras_factura_discrepancias`): RLS `es_admin()` (P1).
- Remitos, pedidos y sus líneas: `tiene_acceso_compras()`.
- Índices que ya existen: `item_id` en las líneas de pedido, remito y factura, más el ledger `(item_id, created_at desc)`.
- **No hay** índices por fecha en `compras_facturas`, `compras_remitos`, `compras_pedidos.enviado_en` ni `compras_stock_movimientos.created_at`.
- `compras_pedidos.enviado_en` se escribe **una sola vez**: el reenvío de B1 no lo cambia (`20261005140000:356-372`).

### 1.4 Reportes (hoy de B3)

`origin/bloque2/pedidos` @ `fca1eaa`:
- `ReportesClient.tsx`: `type Tab = 'gasto' | 'historial' | 'stock' | 'sugerido'`, pestañas con `Pestanas` + `panelDe`, presets "Mes actual / Mes anterior / Personalizado" con `DateRangePicker` y `esAdmin` como prop.
- `page.tsx` carga todo en el servidor.
- `lib/csv.ts` → `descargarCsv(nombre, cabeceras, filas)`. Los exports de Fábrica pasan los números crudos.
- Los gráficos usan `recharts` con `var(--color-*)` (ver `GastoPorProveedor.tsx`).

### 1.5 Datos de dev (2026-10-06)

- 59 insumos, 213 movimientos (desde el 06/08), 43 líneas de remito, 113 de pedido y las de factura de A2b.
- 12 movimientos con `factura_id` y **0 con `discrepancia_id`**:
  - el único `ajuste_factura` (29/09, P-0015) y su reversión quedaron con `discrepancia_id` en null;
  - la diferencia se regeneró después y la FK es `ON DELETE SET NULL`.
  - El link a la factura igual funciona por `factura_id`.
- Invariante del ledger en 0.
- **El SQL de §3 se probó** en un `begin … rollback` contra dev. Queso Barra, 01/09–31/10, como admin:
  - pedido 214 / 7 pedidos;
  - recibido 170 Caja en 8 remitos, con 49,1 kg reales y 6 líneas sin pesar;
  - facturado 84 Caja / 1.386,8 kg / $ 243.500 neto / $ 294.635 total en 4 facturas;
  - último precio $ 1.250 por kg (GLOBAL, 06/10);
  - puente: 28 + 170 + 10 − 26 = 182, igual al stock actual.

  Como coordinador, los pesos y precios dan null. El puente cuadra en los 17 insumos con actividad. Un período de más de 2 años da error.

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §13)

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| E1 | **¿Dónde vive la ficha?** | **En Stock** (`StockFicha` pasa a ser el contenedor con pestañas). Insumos **no** suma pestañas a su form: lee `?insumo=` para abrir **el form**, y form y ficha se linkean entre sí ("Ver ficha" ↔ "Editar insumo"). | 1) Todos los links del circuito (B0) ya llevan a `?insumo=` de Stock: unificar en Insumos los rompería o los duplicaría. 2) `InsumoModal` es un form con estado sucio, guardar, archivar y eliminar. Meterle pestañas de solo lectura con consultas pesadas complica su confirmación de salida y su tamaño. 3) Módulos: la ficha es consulta (`compras-stock`) y el form es configuración (`compras-insumos`). Un rol puede tener uno sin el otro, y `LinkEntidad` ya lo resuelve. 4) El plan maestro pone los consumos de A4 y el reporte de A3 en la ficha de Stock. |
| E2 | **¿Vista o función?** | **Función** `compras_trazabilidad_insumo(p_desde date, p_hasta date, p_item_id uuid default null)`, más una vista plana de documentos (`v_compras_insumo_documentos`) para las listas y el gráfico. | Una vista no recibe el período. Agregar por un rango arbitrario desde una vista obliga a leer todo (sin límite) o a bajar filas por día al navegador. Con la función, el período es obligatorio y tiene tope, así que la regla de "sin consultas sin límite" se cumple por construcción. **El coordinador actualiza la tabla de dueños:** `compras_trazabilidad_insumo` + `v_compras_insumo_documentos` → A2c, después A4. |
| E3 | Fechas del período | Cada dato se cuenta **por la fecha de su documento**: pedido por `enviado_en` (los no enviados no cuentan), remito por `compras_remitos.fecha`, factura por `compras_facturas.fecha` y movimientos por `created_at`. Los timestamps se cortan en hora de Argentina (`America/Argentina/Buenos_Aires`). | Es lo que el usuario entiende por "lo recibido en septiembre". El puente de stock usa el ledger (cuándo se cargó), porque es lo único que cuadra con el stock. La ficha lo aclara en un `HelpTooltip`. |
| E4 | Precio promedio | **Ponderado:** `Σ subtotal / Σ cantidad` ($ por unidad de compra) y `Σ subtotal / Σ kg` ($ por unidad base). Solo facturas (no NC), líneas con cantidad y subtotal > 0. | Respeta `precio_por` sin mezclar precios en unidades distintas: el `subtotal` ya sale de kg × $/kg cuando la línea cobra por kg (A2b). Un promedio simple de `precio_unitario` mezclaría $/Caja con $/kg. |
| E5 | Último precio | `precio_unitario` + `precio_por` de la última línea de factura del período (`fecha desc, confirmada_en desc, orden desc`), como en `v_compras_insumos_resumen`. La UI lo convierte con `convertirPrecio` cuando hace falta. | Mismo criterio que Insumos: la ficha y la lista no se contradicen. |
| E6 | Kg | Recibido: `recibido_base_real = Σ cantidad_base` (solo lo pesado) + `recibido_sin_pesar` (cuántas líneas no tienen kg). Facturado: `Σ coalesce(cantidad_base, cantidad × contenido)`. | En el remito los kg son opcionales (A2b), y sumar nominales como si fueran reales mentiría. En la factura, las líneas por kg siempre los tienen; las otras se estiman con el contenido nominal. |
| E7 | Puente de stock | `stock_inicio` + movimientos del período **por grupo** = `stock_fin`. Una `reversion` cuenta en el grupo del movimiento que anula. Grupos: remitos (`entrada_remito`, `salida_remito_anulado`), conteo (`ajuste_conteo`, `conteo_fabrica`), factura (`ajuste_factura`), manual (`ajuste_manual`), devolución (`devolucion_proveedor`), **consumo** (`consumo_produccion`, el tipo que suma A4) y otros (`apertura` y lo que no matchee). | Es la trazabilidad que pidió Ricardo, en una línea. Con la columna de consumo filtrando un tipo que hoy no existe, A4 **no necesita redefinir la función**: cuando suma el tipo, el número aparece solo. |
| E8 | Permisos | La función es `security definer` con la guarda `tiene_acceso_compras()`. Todo lo de facturas (cantidad, kg, pesos, precios, cantidad de facturas y proveedores facturados) sale **null si no es admin**, y en ese caso las líneas de factura ni se leen. | Las facturas son solo de admin (P1). Ver D1. |
| E9 | Tope del período | Hasta **731 días** (`p_hasta - p_desde`). Si se pasa, error claro. Sin `p_item_id`, la función devuelve solo los insumos con actividad en el período. | Cumple "sin consultas sin límite" y el resultado tiene como mucho una fila por insumo (59 hoy). |
| E10 | Pestaña inicial y param | La ficha abre en **Stock** (como hoy). `?pestana=compras\|movimientos` abre en otra. `rutaDe` acepta `pestana` para `insumo`, igual que B3 hizo para `proveedor`. | El reporte "Por insumo" lleva directo a Compras, y los saltos de hoy no cambian. |
| E11 | Carga de datos | Cada pestaña carga **al abrirse** y conserva lo cargado mientras el modal esté abierto. Compras recarga si cambia el período. Movimientos sigue de a 30. | La ficha abre igual de rápido que hoy, y no se pagan consultas de admin que nadie miró. |
| E12 | Chip "Diferencia" | Un movimiento con `discrepancia_id` muestra el chip **"Diferencia"**, que lleva a la factura (`?factura=`): su modal ya muestra `DiferenciasPanel`. Si solo hay `factura_id`, el chip dice **"Factura"**. | No existe un deep link propio de la diferencia y no hace falta crearlo. En dev el `discrepancia_id` puede venir null (§1.5). |
| E13 | Reporte: dónde calcula | En el cliente, con `rpc('compras_trazabilidad_insumo', { p_desde, p_hasta })` al abrir la pestaña o cambiar el período. **`page.tsx` de Reportes no se toca.** | Así el enganche después del merge de B3 es mínimo (§6.7.4). No suma una carga en el servidor que pagan las otras pestañas. |
| E14 | "Catálogo" | La pestaña de `app/admin/compras/insumos/layout.tsx` pasa a **"Insumos"**. `/admin/catalogo` sigue siendo de productos (el label del menú, ver D2). `/deposito/catalogo` (productos de tipo insumo, otra tabla) queda afuera. | Lo pidió el plan maestro. Sacar "Catálogo" de Compras alcanza para que no haya dos "Catálogo" en el mismo menú de admin. |

## 3. Migración `supabase/migrations/20261006120000_compras_trazabilidad_insumo.sql`

Encabezado con la explicación (como en las migraciones de A2a y A2b): qué agrega, que no mueve stock y que es solo lectura.

### 3.1 Índices

Antes de crearlos, chequear en dev con `pg_indexes` que no existan con otro nombre (hoy no existen, §1.3).

```sql
create index if not exists idx_compras_facturas_fecha_confirmadas on compras_facturas (fecha) where estado = 'confirmada';
create index if not exists idx_compras_remitos_fecha on compras_remitos (fecha);
create index if not exists idx_compras_pedidos_enviado_en on compras_pedidos (enviado_en) where enviado_en is not null;
create index if not exists idx_compras_stock_movimientos_created_at on compras_stock_movimientos (created_at);
create index if not exists idx_compras_stock_movimientos_factura on compras_stock_movimientos (factura_id) where factura_id is not null;
```

Los cuatro primeros sirven para el reporte sin insumo, que filtra solo por fecha. El último sirve para ir de la factura a sus movimientos (anular o revertir, y A4/B4). Con los volúmenes de hoy el planner puede elegir seq scan; no es un error.

### 3.2 `v_compras_stock_movimientos`: `factura_id` y `discrepancia_id` **al final**

`create or replace view` con el cuerpo de `20260925120000:193-217` **idéntico**, más dos columnas después de `remito_codigo` (Postgres solo deja agregar al final):

```sql
  …,
  case when rem.id is not null
    then 'R-' || lpad(ped.numero::text, 4, '0') || '-' || lpad(rem.secuencia::text, 2, '0')
  end as remito_codigo,
  m.factura_id,
  m.discrepancia_id
from compras_stock_movimientos m
… (joins y where sin cambios)
```

- No se suma el número de factura: el `motivo` ya lo dice, y para un no admin el chip queda como texto (`LinkEntidad` sin módulo `compras-facturas`).
- El `grant select` ya existe y no se repite.

### 3.3 Vista `v_compras_insumo_documentos` (listas y gráfico de la ficha)

Tiene una fila por línea de remito y por línea de factura confirmada. Corre como dueño, con la guarda en el `where` de cada rama (patrón de las `v_compras_*`). La rama de facturas exige `es_admin()`.

```sql
create or replace view public.v_compras_insumo_documentos as
select
  'remito'::text as tipo, ri.id as linea_id, ri.item_id, r.id as documento_id, r.fecha,
  'R-' || lpad(p.numero::text, 4, '0') || '-' || lpad(r.secuencia::text, 2, '0') as codigo,
  r.origen, null::text as tipo_comprobante,
  p.id as pedido_id, p.numero as pedido_numero, p.proveedor_id, pr.nombre as proveedor_nombre,
  ri.cantidad, ri.cantidad_base,
  null::text as precio_por, null::numeric as precio_unitario, null::numeric as subtotal,
  r.created_at as cargado_en
from compras_remito_items ri
join compras_remitos r   on r.id = ri.remito_id
join compras_pedidos p   on p.id = r.pedido_id
left join proveedores pr on pr.id = p.proveedor_id
where ri.item_id is not null and tiene_acceso_compras()
union all
select
  'factura', fi.id, fi.item_id, f.id, f.fecha, f.numero, null, f.tipo_comprobante,
  f.pedido_id, p.numero, f.proveedor_id, pr.nombre,
  fi.cantidad, fi.cantidad_base, fi.precio_por, fi.precio_unitario, fi.subtotal,
  f.confirmada_en
from compras_factura_items fi
join compras_facturas f  on f.id = fi.factura_id and f.estado = 'confirmada'
left join compras_pedidos p on p.id = f.pedido_id
left join proveedores pr on pr.id = f.proveedor_id
where fi.item_id is not null and es_admin();

grant select on public.v_compras_insumo_documentos to authenticated;
```

**Se consulta siempre con `item_id` y `limit`** (el filtro baja a las dos ramas del `union all` y usa los índices por `item_id`). Como coordinador, la rama de facturas devuelve 0 filas (probado).

### 3.4 Función `compras_trazabilidad_insumo`

Probada tal cual en dev (§1.5). El Ejecutor la copia y solo cambia lo que el lote de §9.2 obligue a cambiar, con aviso.

```sql
create or replace function public.compras_trazabilidad_insumo(
  p_desde date,
  p_hasta date,
  p_item_id uuid default null
)
returns table (
  item_id uuid, item_nombre text, item_estado text, categoria_nombre text,
  unidad text, unidad_base text, contenido numeric,
  pedido_cantidad numeric, pedidos integer,
  recibido_cantidad numeric, recibido_base_real numeric, recibido_sin_pesar integer, remitos integer,
  facturado_cantidad numeric, facturado_base numeric, facturado_neto numeric, facturado_total numeric,
  facturas integer, proveedores_facturados integer,
  precio_prom_unidad numeric, precio_prom_base numeric,
  ultimo_precio numeric, ultimo_precio_por text, ultimo_precio_fecha date,
  ultimo_precio_factura_id uuid, ultimo_precio_proveedor text,
  stock_inicio numeric, stock_fin numeric, stock_actual numeric,
  mov_remitos numeric, mov_conteo numeric, mov_factura numeric, mov_manual numeric,
  mov_devolucion numeric, mov_otros numeric, consumido_produccion numeric,
  pendiente_recibir numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin boolean := es_admin();
  v_ini   timestamptz;
  v_fin   timestamptz;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Elegí desde y hasta.';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha "hasta" es anterior a "desde".';
  end if;
  if p_hasta - p_desde > 731 then
    raise exception 'El período puede tener hasta 2 años. Achicalo.';
  end if;

  -- Días de Argentina: [desde 00:00, hasta+1 00:00).
  v_ini := p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_fin := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  return query
  with
  -- Pedido: líneas de pedidos ENVIADOS en el período (enviado_en no cambia con el reenvío).
  pe as (
    select pi.item_id, sum(pi.cantidad) as cantidad, count(distinct p.id)::int as pedidos
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id is not null and p.enviado_en >= v_ini and p.enviado_en < v_fin
      and (p_item_id is null or pi.item_id = p_item_id)
    group by pi.item_id
  ),
  -- Recibido: líneas de remitos con fecha en el período (incluye los "desde factura").
  re as (
    select ri.item_id, sum(ri.cantidad) as cantidad, sum(ri.cantidad_base) as base_real,
           count(*) filter (where ri.cantidad_base is null)::int as sin_pesar,
           count(distinct r.id)::int as remitos
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    where ri.item_id is not null and r.fecha between p_desde and p_hasta
      and (p_item_id is null or ri.item_id = p_item_id)
    group by ri.item_id
  ),
  -- Líneas de factura confirmadas del período. Solo admin: si no, ni se leen.
  fl as (
    select fi.item_id, f.id as factura_id, f.fecha, f.confirmada_en, f.proveedor_id, f.tipo_comprobante,
           fi.cantidad, fi.cantidad_base, fi.precio_unitario, fi.precio_por, fi.orden, fi.id as linea_id,
           coalesce(fi.subtotal, 0) as subtotal, coalesce(fi.iva, 0) as iva,
           case when f.tipo_comprobante = 'nota_credito' then -1 else 1 end as signo,
           coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad) as base
    from compras_factura_items fi
    join compras_facturas f on f.id = fi.factura_id
    join compras_items i on i.id = fi.item_id
    where v_admin and fi.item_id is not null and f.estado = 'confirmada'
      and f.fecha between p_desde and p_hasta
      and (p_item_id is null or fi.item_id = p_item_id)
  ),
  fa as (
    select fl.item_id,
      sum(fl.signo * fl.cantidad) as cantidad,
      sum(fl.signo * fl.base) as base,
      sum(fl.signo * fl.subtotal) as neto,
      sum(fl.signo * (fl.subtotal + fl.iva)) as total,
      count(distinct fl.factura_id)::int as facturas,
      count(distinct fl.proveedor_id)::int as proveedores,
      -- E4: ponderado, solo facturas (no NC), con cantidad y subtotal > 0.
      sum(fl.subtotal) filter (where fl.signo = 1 and fl.cantidad > 0 and fl.subtotal > 0)
        / nullif(sum(fl.cantidad) filter (where fl.signo = 1 and fl.cantidad > 0 and fl.subtotal > 0), 0) as prom_unidad,
      sum(fl.subtotal) filter (where fl.signo = 1 and fl.base > 0 and fl.subtotal > 0)
        / nullif(sum(fl.base) filter (where fl.signo = 1 and fl.base > 0 and fl.subtotal > 0), 0) as prom_base
    from fl
    group by fl.item_id
  ),
  -- E5: último precio del período (mismo orden que v_compras_insumos_resumen).
  uf as (
    select distinct on (fl.item_id) fl.item_id, fl.precio_unitario, fl.precio_por, fl.fecha, fl.factura_id,
           pr.nombre as proveedor
    from fl
    left join proveedores pr on pr.id = fl.proveedor_id
    where fl.signo = 1 and fl.precio_unitario > 0
    order by fl.item_id, fl.fecha desc, fl.confirmada_en desc nulls last, fl.orden desc, fl.linea_id desc
  ),
  -- E7: puente de stock. La reversión cuenta en el grupo del movimiento que anula.
  mv as (
    select m.item_id,
      sum(m.delta) filter (where m.created_at < v_ini) as inicio,
      sum(m.delta) filter (where m.created_at < v_fin) as fin,
      count(*) filter (where m.created_at >= v_ini and m.created_at < v_fin) as en_periodo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) in ('entrada_remito', 'salida_remito_anulado')) as remitos,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) in ('ajuste_conteo', 'conteo_fabrica')) as conteo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'ajuste_factura') as factura,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'ajuste_manual') as manual,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'devolucion_proveedor') as devolucion,
      -- A4 suma el tipo 'consumo_produccion' al check: este número aparece solo.
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) = 'consumo_produccion') as consumo,
      sum(m.delta) filter (where m.created_at >= v_ini and m.created_at < v_fin
        and coalesce(o.tipo, m.tipo) not in ('entrada_remito', 'salida_remito_anulado', 'ajuste_conteo',
          'conteo_fabrica', 'ajuste_factura', 'ajuste_manual', 'devolucion_proveedor', 'consumo_produccion')) as otros
    from compras_stock_movimientos m
    left join compras_stock_movimientos o on o.id = m.anula_movimiento_id and m.tipo = 'reversion'
    where m.created_at < v_fin
      and (p_item_id is null or m.item_id = p_item_id)
    group by m.item_id
  ),
  -- Pendiente de recibir hoy (no depende del período; mismo cálculo que v_compras_insumos_resumen).
  pa as (
    select pi.item_id,
           sum(greatest(pi.cantidad - coalesce((select sum(ri.cantidad) from compras_remito_items ri
                                                where ri.pedido_item_id = pi.id), 0), 0)) as pendiente
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id is not null and p.estado_recepcion in ('enviado', 'parcial')
      and (p_item_id is null or pi.item_id = p_item_id)
    group by pi.item_id
  )
  select
    i.id, i.nombre, i.estado, cat.nombre, i.unidad, i.unidad_base, i.cantidad_por_unidad,
    coalesce(pe.cantidad, 0), coalesce(pe.pedidos, 0),
    coalesce(re.cantidad, 0), re.base_real, coalesce(re.sin_pesar, 0), coalesce(re.remitos, 0),
    case when v_admin then coalesce(fa.cantidad, 0) end,
    case when v_admin then coalesce(fa.base, 0) end,
    case when v_admin then coalesce(fa.neto, 0) end,
    case when v_admin then coalesce(fa.total, 0) end,
    case when v_admin then coalesce(fa.facturas, 0) end,
    case when v_admin then coalesce(fa.proveedores, 0) end,
    fa.prom_unidad, fa.prom_base,
    uf.precio_unitario, uf.precio_por, uf.fecha, uf.factura_id, uf.proveedor,
    coalesce(mv.inicio, 0), coalesce(mv.fin, 0), coalesce(sa.cantidad, 0),
    coalesce(mv.remitos, 0), coalesce(mv.conteo, 0), coalesce(mv.factura, 0), coalesce(mv.manual, 0),
    coalesce(mv.devolucion, 0), coalesce(mv.otros, 0), -coalesce(mv.consumo, 0),
    coalesce(pa.pendiente, 0)
  from compras_items i
  left join compras_categorias cat on cat.id = i.categoria_id
  left join pe on pe.item_id = i.id
  left join re on re.item_id = i.id
  left join fa on fa.item_id = i.id
  left join uf on uf.item_id = i.id
  left join mv on mv.item_id = i.id
  left join pa on pa.item_id = i.id
  left join compras_stock_actual sa on sa.item_id = i.id
  where (p_item_id is not null and i.id = p_item_id)
     or (p_item_id is null and (pe.item_id is not null or re.item_id is not null
                                or fa.item_id is not null or coalesce(mv.en_periodo, 0) > 0))
  order by coalesce(fa.neto, 0) desc, i.nombre;
end;
$$;

revoke execute on function public.compras_trazabilidad_insumo(date, date, uuid) from public, anon;
grant execute on function public.compras_trazabilidad_insumo(date, date, uuid) to authenticated;
```

Notas:
- `#variable_conflict use_column` es obligatorio: las columnas de salida (`item_id`, `remitos`, …) se llaman igual que columnas de tablas.
- `consumido_produccion` sale **positivo** (lo que se gastó). En el puente se **resta**: `stock_fin = stock_inicio + mov_remitos + mov_conteo + mov_factura + mov_manual + mov_devolucion + mov_otros − consumido_produccion`. Es invariante: se chequea en §9.2.
- `stock_inicio` suma todo el ledger anterior al período. Eso está acotado por insumo y devuelve una fila por insumo. Antes de la apertura del ledger (25/09) incluye las filas `apertura` que dejaron el saldo bien: es el saldo real del sistema, no una reconstrucción.

### 3.5 Después de la migración

- `npm run types` (después del push) y revisar que el diff de `lib/database.types.ts` solo traiga:
  - la vista nueva;
  - las 2 columnas de `v_compras_stock_movimientos`;
  - la función.
- Hasta el push, los tipos se escriben a mano (como A2a).

## 4. Lógica pura (sin I/O; se chequea con `npx tsx`)

### 4.1 `lib/compras/trazabilidad.ts` (nuevo) + `lib/compras/_check_trazabilidad.ts`

```ts
export type FilaTrazabilidad = Database['public']['Functions']['compras_trazabilidad_insumo']['Returns'][number]

export interface Trazabilidad {             // FilaTrazabilidad normalizada (sin nulls donde no corresponde)
  itemId: string; nombre: string; estado: string; categoria: string | null
  unidades: UnidadesInsumo                  // de unidades.ts: { unidad, unidadBase, contenido }
  pedido: { cantidad: number; pedidos: number }
  recibido: { cantidad: number; baseReal: number | null; sinPesar: number; remitos: number }
  facturado: null | {                       // null = no es admin
    cantidad: number; base: number; neto: number; total: number; facturas: number; proveedores: number
    promUnidad: number | null; promBase: number | null
    ultimo: null | { precio: number; por: CobraPor; fecha: string; facturaId: string; proveedor: string | null }
  }
  puente: PuenteStock
  stockActual: number
  pendienteRecibir: number
}
export function aTrazabilidad(f: FilaTrazabilidad): Trazabilidad

export interface PasoPuente { clave: 'remitos' | 'conteo' | 'factura' | 'manual' | 'devolucion' | 'consumo' | 'otros'; label: string; delta: number }
export interface PuenteStock { inicio: number; pasos: PasoPuente[]; fin: number; cuadra: boolean }
export function armarPuente(f: FilaTrazabilidad): PuenteStock
// pasos en ese orden. 'consumo' con delta = −consumido. Labels: "Remitos", "Conteos de fábrica",
// "Diferencias con facturas", "Ajustes a mano", "Devoluciones al proveedor",
// "Consumo de producción", "Otros (apertura)".
// cuadra = |inicio + Σ delta − fin| < 1e-9 (si no cuadra la UI no lo oculta: muestra un aviso, §7 E-borde 9).

export type ModoPrecio = 'unidad' | 'base'
/** Precio efectivo de una línea de factura: subtotal / cantidad (unidad) o subtotal / kg (base). null si no se puede. */
export function precioEfectivo(l: { cantidad: number; cantidadBase: number | null; subtotal: number | null }, u: UnidadesInsumo, modo: ModoPrecio): number | null

export interface PuntoPrecio { fecha: string; precio: number; proveedorId: string; proveedor: string; facturaId: string; numero: string }
/** Puntos del gráfico: solo facturas (no NC), subtotal > 0, en orden de fecha. */
export function puntosPrecio(lineas: LineaDocumento[], u: UnidadesInsumo, modo: ModoPrecio): PuntoPrecio[]

export interface SeriePrecio { proveedorId: string; proveedor: string; color: string; puntos: PuntoPrecio[] }
/** Una serie por proveedor. Hasta 4; el resto se junta en "Otros". El color sigue al proveedor (§6.4). */
export function seriesPrecio(puntos: PuntoPrecio[], principalId: string | null): SeriePrecio[]

/** Modo por defecto del gráfico: el cobra_por del proveedor principal; sin conversión, siempre 'unidad'. */
export function modoPrecioInicial(u: UnidadesInsumo, cobraPorPrincipal: CobraPor | null): ModoPrecio

/** Filtros de la pestaña Movimientos → condición de PostgREST (§6.5). */
export type FiltroMovimientos = 'todos' | 'remitos' | 'conteos' | 'facturas' | 'manuales'
```

Casos mínimos de `_check_trazabilidad.ts` (como `_check_unidades.ts`, con un contador de OK):
1. `armarPuente` con la fila real de Queso Barra de §1.5 (28 + 170 + 10 − 26 = 182) → `cuadra`, 7 pasos, en orden.
2. Consumo 12 → paso `consumo` con delta −12, y el puente cuadra.
3. `aTrazabilidad` como no admin → `facturado === null`.
4. `precioEfectivo`:
   - línea por kg, 2 Caja / 33,4 kg / $ 41.750 → 20.875 ($/Caja) y 1.250 ($/kg);
   - línea sin kg con contenido 16,5 → base = cantidad × 16,5;
   - cantidad 0 → null.
5. `puntosPrecio` excluye las NC y las líneas con subtotal 0.
6. `seriesPrecio`:
   - 6 proveedores → 4 series + "Otros";
   - el principal siempre es la primera;
   - el color de un proveedor no cambia si se saca otro.
7. `modoPrecioInicial`:
   - Bolsa Consorcio (sin conversión) → `'unidad'`;
   - Queso Barra con principal por kg → `'base'`.

### 4.2 `lib/compras/reportePorInsumo.ts` (nuevo) + `lib/compras/_check_reportePorInsumo.ts`

```ts
export interface FilaReporteInsumo {        // una fila del reporte = aTrazabilidad + texto listo para mostrar y exportar
  t: Trazabilidad
  recibidoTexto: string                     // "170 Caja · 49,1 kg (6 sin pesar)"
  facturadoTexto: string | null             // "84 Caja · 1.386,8 kg"
  precioPromTexto: string | null            // "$ 2.898,81 /Caja · $ 175,58 /kg" (solo los modos con dato)
}
export function filasReporte(filas: FilaTrazabilidad[]): FilaReporteInsumo[]
export interface TotalesReporte { neto: number; total: number; insumos: number; facturas: number }
export function totalesReporte(filas: FilaReporteInsumo[]): TotalesReporte   // facturas = Σ por insumo (aclara "líneas", no comprobantes únicos)
export function cabecerasCsv(esAdmin: boolean): string[]
export function filasCsv(filas: FilaReporteInsumo[], esAdmin: boolean): (string | number | null)[][]
export function nombreCsv(desde: string, hasta: string): string   // 'compras_por_insumo_2026-09-01_2026-09-30.csv'
export function filtrarReporte(filas: FilaReporteInsumo[], f: { texto: string; categoria: string | null }): FilaReporteInsumo[]
```

**CSV:**
- Columnas admin: Insumo, Categoría, Unidad de compra, Unidad base, Pedido, Recibido, Recibido kg reales, Líneas sin pesar, Facturado, Facturado kg, Neto $, Total con IVA $, Facturas, Proveedores, $ prom. por unidad, $ prom. por unidad base, Último precio, Último precio por (unidad/base), Fecha último precio, Stock inicio, Stock fin.
- No admin: las mismas **sin** las de factura (de Facturado a Fecha último precio).
- Números crudos, como los exports de Fábrica (`descargarCsv` ya pone BOM).
- Los nulls van vacíos.

Casos mínimos de `_check_reportePorInsumo.ts`:
1. El CSV de no admin no tiene ninguna columna con "$" ni "Factur".
2. Los totales con una NC restan.
3. `filtrarReporte` por texto (sin tildes: "fecula" encuentra "Fécula") y por categoría.
4. `nombreCsv`.

## 5. `lib/compras/rutas.ts` (después del merge de B3)

Sobre la versión de B3 (`Entidad` como unión discriminada):

```ts
/** Pestañas de la ficha del insumo (A2c). */
export type PestanaInsumo = 'stock' | 'compras' | 'movimientos'

export type Entidad =
  | { tipo: Exclude<TipoEntidad, 'proveedor' | 'insumo'>; id: string }
  | { tipo: 'proveedor'; id: string; pestana?: PestanaProveedor }
  | { tipo: 'insumo'; id: string; pestana?: PestanaInsumo }

export function rutaDe(entidad: Entidad): string {
  const { tipo, id } = entidad
  const base = `${BASE[tipo]}?${tipo}=${encodeURIComponent(id)}`
  return (entidad.tipo === 'proveedor' || entidad.tipo === 'insumo') && entidad.pestana
    ? `${base}&pestana=${entidad.pestana}` : base
}

/** El form del insumo en Insumos (A2c): "Editar insumo" desde la ficha. */
export function rutaEditarInsumo(id: string): string {
  return `/admin/compras/insumos?insumo=${encodeURIComponent(id)}`
}
```

`LinkEntidad` no cambia (ya pasa la entidad entera). Si su chequeo de módulo usa `rutaDe(...)` o el pathname, sigue igual: el pathname no cambia.

## 6. UI

### 6.0 Protocolo de diseño

Valen las reglas del Bloque 1 y de `feedback_design_direction`:
- `Modal`, `Pestanas`, `PageHeader`, `DataTable`, `EmptyState`, `KpiCard`, `ChipGroup`, `SegmentedControl` y `HelpTooltip`;
- íconos lucide, tokens semánticos y cero hex;
- `≥ 44px` en mobile, `tabular-nums` y `Skeleton` mientras carga;
- toast para los errores, nunca `confirm()`/`alert()`.

Pasada con skills (A1 y A2a la dejaron como deuda; **acá no se saltea**):
- `impeccable`: *shape* sobre los wireframes de abajo antes de codear, y *harden* al terminar (vacíos, errores, permisos, textos largos, doble carga).
- `emil-design-eng`: transición entre pestañas sin salto de alto (alto mínimo del panel y skeleton del mismo tamaño).
- `ui-ux-pro-max`: revisión de las capturas.
- `dataviz`: los dos gráficos (§6.4 y §6.7.3).

Capturas a 375px y 1440px, en tema claro y oscuro, de las tres pestañas y del reporte.

### 6.1 Ficha: contenedor con pestañas (`StockFicha.tsx` + `app/admin/compras/stock/ficha/*`)

- **`StockClient.tsx`:**
  - el `Modal` pasa a `size="xl"`; sigue `pantallaCompletaMobile`;
  - lee `pestana` (prop nueva desde `page.tsx`: `searchParams.pestana`, validado contra `PestanaInsumo`; si no, `'stock'`);
  - `useQuitarParams('insumo', 'pestana')` al cerrar;
  - `useAlCambiarParam` también reacciona a un `pestana` nuevo con el mismo insumo.
- **`StockFicha.tsx`** queda como contenedor:
  - recibe `pestanaInicial`;
  - arriba, el encabezado fijo de la ficha;
  - después, `Pestanas` (`idBase="ficha-insumo"`, `etiqueta="Ficha del insumo"`) y el panel activo con `{...panelDe('ficha-insumo', tab)}`.
  - Cambiar de pestaña **no** toca la URL (se queda con la de entrada; cerrar la limpia).
- **Encabezado** (siempre visible, una línea en desktop y dos en mobile):
  - stock actual grande con `textoBaseItem` (como hoy) y "Mínimo N";
  - a la derecha, "Editar insumo" (`Pencil`, `Link` a `rutaEditarInsumo`).
    - Si el usuario no tiene `compras-insumos`, no se muestra. Usar la regla de `AccesoModulos` / `puedeEntrarAdmin` que usa `LinkEntidad`, sin duplicarla.
  - Si está archivado, el chip "Archivado".

```text
┌ Queso Barra ─────────────────────────────────────────────── ✕ ┐
│ STOCK ACTUAL                                   ✎ Editar insumo │
│ 182 Caja   ≈ 3.003 kg          Mínimo 40 Caja                  │
│ ┌────────┬──────────┬──────────────┐                           │
│ │ Stock  │ Compras  │ Movimientos  │   ← Pestanas (←/→, Home)  │
│ └────────┴──────────┴──────────────┘                           │
│ [panel de la pestaña activa]                                   │
└────────────────────────────────────────────────────────────────┘
```

- **Archivos nuevos** en `app/admin/compras/stock/ficha/`:
  - `PanelStock.tsx`;
  - `PanelCompras.tsx`;
  - `PanelMovimientos.tsx`;
  - `GraficoPrecio.tsx`;
  - `PuenteStock.tsx`;
  - `datos.ts`: las consultas del navegador con sus tipos, cada una con su `limit` o su período.
- **Cada panel carga al montarse por primera vez** (E11). El contenedor guarda en estado lo que ya cargó cada panel, así volver a una pestaña no vuelve a pedir. El patrón de "respuesta vieja" (`vigente`) es el de `StockFicha:72-91`.

### 6.2 Pestaña **Stock** (`PanelStock.tsx`)

Es el bloque "Ajustar stock" de hoy, sin cambios de comportamiento:
- `onCambios` sigue avisando al contenedor, y cerrar con un ajuste a medio cargar pide confirmación como hoy;
- abajo, una línea: "En camino: P-0037 · faltan 2 Caja" (los `pedidos_abiertos` de `v_compras_insumos_resumen`, `.eq('item_id', id).maybeSingle()`), con `LinkEntidad` pedido;
- el link "Histórico por conteo" se queda acá.

**Los "Últimos movimientos" salen de esta pestaña** y pasan a Movimientos.

### 6.3 Pestaña **Compras** (`PanelCompras.tsx`)

**Período:**
- `ChipGroup` con "30 días · 3 meses · 12 meses" (default **3 meses**). Son hasta hoy en hora local, con `rangoFechas.ts`: sumar `calcularRangoUltimos(dias, ahora)` puro, con su caso en el check.
- Al lado: "Del 06/07 al 06/10" y un `HelpTooltip` E3: "Lo recibido cuenta por la fecha del remito, lo facturado por la fecha de la factura y el stock por cuándo se cargó cada movimiento."

**Consultas** (en paralelo; cada una con su `Skeleton`):

| Bloque | Consulta | Límite |
|---|---|---|
| Resumen y puente | `rpc('compras_trazabilidad_insumo', { p_desde, p_hasta, p_item_id })` | 1 fila |
| Últimos remitos | `v_compras_insumo_documentos` `.eq('item_id').eq('tipo','remito').order('fecha',{ascending:false}).order('cargado_en',{ascending:false}).limit(10)` | 10 |
| Últimas facturas (admin) | ídem con `tipo = 'factura'` | 10 |
| Gráfico (admin) | ídem `tipo = 'factura'`, `.eq('tipo_comprobante','factura').gte('fecha', hace 12 meses).order('fecha').limit(120)` | 120 |
| Proveedores | `v_compras_proveedor_insumos` (B3) `.eq('item_id', id).order('es_principal',{ascending:false})` | los del insumo |

- **Las listas no dependen del período:** siempre son "las últimas".
- **El gráfico es siempre de 12 meses.** Solo el resumen y el puente siguen al chip, y se dice en el título de cada bloque.
- Para un no admin no se dispara ninguna consulta de facturas.

**Layout** (de arriba hacia abajo):

```text
Período: [30 días] [3 meses●] [12 meses]   Del 06/07 al 06/10 ⓘ

┌ Pedido ─────┐ ┌ Recibido ─────────┐ ┌ Facturado ─────────┐ ┌ Precio promedio ──┐
│ 214 Caja    │ │ 170 Caja          │ │ 84 Caja · 1.386 kg │ │ $ 175,58 /kg      │
│ 7 pedidos   │ │ 49,1 kg pesados · │ │ $ 243.500 neto     │ │ último $ 1.250/kg │
│             │ │ 6 sin pesar       │ │ 4 facturas         │ │ GLOBAL · 06/10    │
└─────────────┘ └───────────────────┘ └────────────────────┘ └───────────────────┘
   (KpiCard ×4; grid 2×2 en mobile; los dos de la derecha solo admin)

Cómo se movió el stock (del 06/07 al 06/10)
  Stock el 06/07 ........................ 28 Caja
  + Remitos ............................ +170
  + Conteos de fábrica ..................   0
  + Diferencias con facturas ............   0
  + Ajustes a mano ...................... +10
  − Consumo de producción ............... — (llega con la receta)
  + Otros (apertura) .................... −26
  ─────────────────────────────────────────────
  Stock el 06/10 ........................ 182 Caja   ≈ 3.003 kg

Precio en los últimos 12 meses          [por Caja | por kg●]   (admin)
  [gráfico de líneas, §6.4]

Últimas facturas (admin)                 Últimos remitos
  06/10  A2B-QA-0001  GLOBAL               06/10  R-0037-01  P-0037  GLOBAL
         2 Caja · 33,4 kg  $1.250/kg            2 Caja · 32,9 kg
         $ 41.750                          …
  …

Proveedores                                              ✎ Editar en Insumos
  ★ GLOBAL       cobra por kg    Ref. $ 1.250 /kg    Últ. $ 1.250 /kg · 06/10
    AL SA        cobra por Caja  Ref. $ 125 /Caja    —
    BOLSAPLAST   (anterior)      …
```

**Reglas por bloque:**
- **Recibido:**
  - "N kg pesados" solo si `tieneConversion` y `baseReal != null`;
  - "· M sin pesar" si `sinPesar > 0` y el insumo se cobra por kg en algún par;
  - sin conversión, solo la cantidad.
- **Facturado y precio (solo admin):**
  - sin facturas en el período: "Sin facturas en el período" en `text-muted` dentro de la tarjeta;
  - el promedio muestra el modo del gráfico, y el otro va como texto chico si hay conversión;
  - el "último" lleva `LinkEntidad` factura en la fecha.
- **No admin:** en lugar de esas dos tarjetas, una sola con `Lock` y "Lo facturado y los precios los ve un administrador" (mismo texto que el KPI de Reportes).
- **Puente** (`PuenteStock.tsx`):
  - es una lista `dl`, en `tabular-nums`, alineada a la derecha;
  - los pasos en 0 se muestran igual ("0"), así el puente se lee completo;
  - "Consumo de producción" con `consumido = 0` y **sin** movimientos de consumo en todo el ledger muestra "— (llega con la receta)" en `text-muted`.
    - La UI no lo puede saber por la fila: se usa el texto mientras `consumido === 0`.
    - **A4 cambia este texto.** Dejar `// A4: cuando el consumo sea real, mostrar 0 y el link a Fábrica`.
  - Si `!cuadra`: aviso `text-warning` "Los movimientos no cierran con el stock: avisá a sistemas." No debería pasar nunca (el invariante del ledger está en 0), y si pasa queda a la vista.
- **Últimas facturas y remitos:**
  - en desktop, dos columnas lado a lado (`lg:grid-cols-2`); en mobile, una abajo de la otra;
  - cada fila es `fecha · código (LinkEntidad) · proveedor` y debajo `cantidad unidad · kg · precio con /unidad (etiquetaCobraPor) · subtotal`;
  - el remito suma `LinkEntidad` pedido (P-xxxx);
  - un remito con `origen = 'factura'` lleva el chip "desde factura";
  - una NC lleva el chip "Nota de crédito" y el subtotal en negativo;
  - vacíos: "Todavía no hay remitos de este insumo" y "…facturas…";
  - el pie dice "Últimos 10" cuando llega a 10 (no hay "ver todos" en esta fase: el reporte Por insumo y la lista de Facturas cubren lo demás).
- **Proveedores:**
  - el nombre es `LinkEntidad` proveedor con `pestana: 'insumos'`;
  - ★ si es principal;
  - "cobra por {etiquetaCobraPor}";
  - "Ref. {precio_ref} /{unidad}";
  - último precio (admin) con su fecha y `LinkEntidad` factura;
  - los inactivos van abajo, en `text-muted`, con "(anterior)";
  - el link "Editar en Insumos" (mismo permiso que en el encabezado).

### 6.4 Gráfico de precio (`GraficoPrecio.tsx`, solo admin)

Sigue `dataviz` (forma → color → validar → marcas → hover → accesibilidad → mirarlo):

- **Forma:** `LineChart` de recharts, con `x = fecha` (escala de tiempo, `type="number"` sobre epoch o categórica por fecha, sin huecos raros) e `y = precio efectivo` (`precioEfectivo`).
- **Un solo eje.** El `SegmentedControl` "por {unidad} | por kg":
  - solo aparece si `tieneConversion`;
  - arranca en `modoPrecioInicial`;
  - **cambia la serie, nunca agrega un segundo eje**.
- **Series:** una por proveedor (`seriesPrecio`), hasta 4 + "Otros".
  - El color sigue al proveedor, en orden fijo: el principal primero y el resto por nombre. Tokens: `var(--color-accent)`, `var(--color-info)`, `var(--color-green)` y `var(--color-orange)`; "Otros", `var(--color-muted)`.
  - **Antes de dar por cerrado**, correr `node <skill dataviz>/scripts/validate_palette.js "<hex de esos tokens>" --mode light` y `--mode dark` con los hex resueltos de `globals.css`. Si una pareja falla, se reemplaza el token, nunca se inventa un hex.
- **Marcas:** línea de 2px, puntos de ≥ 8px (`r=4`) con un anillo de 2px del color de la superficie, y `type="monotone"` no (`"linear"`: son precios puntuales, no una curva).
  - Referencia horizontal punteada (`ReferenceLine`) con el `precio_ref` del principal convertido al modo, con la etiqueta "Ref." en `text-muted`.
- **Ejes y grilla:** grilla horizontal en `var(--color-border)`, `strokeDasharray="3 3"`. Ticks en `var(--color-muted)` de 11px. Precio en formato corto (`$ 1,2 mil` si hace falta) y fecha `dd/mm`.
- **Hover:** tooltip propio (como `ChartTooltip` de `GastoPorProveedor`) con la fecha, el proveedor, el precio con "/unidad", "Factura N°" y el subtotal. Crosshair vertical (`cursor`). El texto va en tokens de texto, nunca en el color de la serie.
- **Leyenda:** si hay ≥ 2 series, va arriba a la izquierda. Con 1 sola, sin leyenda (el título la nombra).
- **Vacíos:**
  - 0 puntos: no hay gráfico, sale "Sin facturas en los últimos 12 meses".
  - 1 punto: no hay gráfico, sale una línea de texto: "Una sola factura: $ 1.250 /kg el 06/10 (GLOBAL)".
- **Tabla:** la lista "Últimas facturas" hace de vista en tabla.
- **Alto:** 220px en mobile y 260px en desktop. `ResponsiveContainer` dentro de un contenedor con alto fijo (si no, el alto salta).

### 6.5 Pestaña **Movimientos** (`PanelMovimientos.tsx`)

Es la lista de "Últimos movimientos" de hoy (de a 30, "Ver 30 más" y revertir en línea los `ajuste_manual`), más:

- **Filtro** con `ChipGroup`: "Todos · Remitos · Conteos · Facturas · A mano". Cambiarlo reinicia a 30. Condiciones en `datos.ts`:

  | Filtro | Condición |
  |---|---|
  | Remitos | `.not('remito_id','is',null)` |
  | Conteos | `.not('conteo_id','is',null)` |
  | Facturas | `.not('factura_id','is',null)` |
  | A mano | `.in('tipo', ['ajuste_manual','reversion']).is('remito_id', null).is('conteo_id', null).is('factura_id', null)` |

- **Chips de entidad** (`LinkEntidad variante="chip"`, `min-h-11 sm:min-h-9`), en este orden:
  - **Remito:** `Truck` + código. **Reemplaza el `<Link>` a mano** (`:256-265`).
  - **Factura:** `ReceiptText` + "Factura". Si hay `discrepancia_id`: `Scale` + "Diferencia" (E12). Destino `{ tipo: 'factura', id: factura_id }`.
  - **Conteo:** el de hoy.
  - Si el usuario no tiene el módulo del destino, `LinkEntidad` lo deja como texto (B0). En la ficha, un no admin ve "Factura" sin link.
- `detalleMovimiento` también saca del motivo "(desde factura N)" cuando se muestra el chip de factura **y** el de remito. El resto del motivo queda.
- "Se revierte desde el conteo" (A1) sigue igual. Para `ajuste_factura` sin revertir: "Se revierte desde la factura" (`text-muted`).
- `onNavegar={onCerrar}` en todos los chips, como hoy.

### 6.6 Insumos

- **`app/admin/compras/insumos/layout.tsx:9`:** `label: 'Catálogo'` → **`'Insumos'`**. El ícono no cambia.
- **`?insumo=` en Insumos:**
  - `page.tsx` recibe `searchParams: Promise<{ insumo?: string }>` y pasa `insumoInicial`;
  - `InsumosClient` abre el form de ese insumo si existe (activos o archivados);
  - si no existe: toast "No encontramos ese insumo" y limpia el param;
  - `useQuitarParams('insumo')` al cerrar el form;
  - `useAlCambiarParam` igual que en Stock.
- **En `InsumoModal`**, en el encabezado del form (no en el pie, que es de acciones): link **"Ver ficha"**, con `BarChart3`/`ArrowUpRight`, `LinkEntidad` insumo y la variante texto.
  - Si hay cambios sin guardar, **no navega directo**: usa la misma confirmación de "Descartar cambios" del form (`onNavegar` + `preventDefault` hasta confirmar). Si eso no se puede hacer limpio con `LinkEntidad`, el link se deshabilita mientras haya cambios, con el `title` "Guardá o descartá los cambios para ver la ficha".
- Nada más cambia en Insumos.

### 6.7 Reporte **"Por insumo"** en Compras › Reportes

#### 6.7.1 Archivos

- `lib/compras/reportePorInsumo.ts` (§4.2): nuevo.
- `app/admin/compras/reportes/PorInsumo.tsx`: nuevo, `'use client'`. Es un archivo nuevo dentro de la carpeta de B3: **se crea después del merge de B3**, junto con el enganche.

#### 6.7.2 `PorInsumo.tsx`

Props: `{ rango: RangoFechas; esAdmin: boolean }`.

**Carga:**
- con el cliente del navegador: `rpc('compras_trazabilidad_insumo', { p_desde: rango.desde, p_hasta: rango.hasta })`;
- con la guarda de respuesta vieja, al montar y cuando cambia `rango`;
- error → toast con `mensajeError` y la tabla vacía con "No se pudo cargar el reporte";
- si el rango supera 2 años, el mensaje de la función llega tal cual.

**Arriba:**
- `SearchInput` "Buscar insumo";
- selector de categoría: `ChipGroup` con las categorías presentes y "Todas";
- `ClearFiltersButton`;
- a la derecha, **"Exportar CSV"** (`Download`), que exporta **lo filtrado** con `descargarCsv(nombreCsv(...), cabecerasCsv(esAdmin), filasCsv(filtradas, esAdmin))`. Deshabilitado si no hay filas.

**Gráfico** (solo admin, si hay ≥ 2 insumos con neto > 0):
- "Top 8 por pesos facturados (neto)";
- `BarChart` horizontal de una serie, `var(--color-accent)`, `maxBarSize={22}`, extremo redondeado 4px y 2px de separación entre barras;
- sin leyenda (es una sola serie);
- tooltip con el neto, el total con IVA y las cantidades;
- mismo estilo que `GastoPorProveedor`.

**Tabla** (`DataTable`, la fila no es clickeable; el nombre es el link):

| Columna | Admin | No admin | Breakpoint |
|---|---|---|---|
| Insumo (`LinkEntidad` insumo, `pestana: 'compras'`) + chip "Archivado" | ✓ | ✓ | siempre |
| Categoría | ✓ | ✓ | `xl` |
| Pedido | ✓ | ✓ | `lg` |
| Recibido (`recibidoTexto`) | ✓ | ✓ | siempre |
| Facturado (`facturadoTexto`) | ✓ | — | `md` |
| Neto | ✓ | — | siempre |
| Total con IVA | ✓ | — | `lg` |
| $ promedio (`precioPromTexto`) | ✓ | — | `lg` |
| Último precio (con /unidad y fecha → factura) | ✓ | — | `2xl` |
| Stock al final | — | ✓ | `md` |

- **Orden por defecto:** admin, por neto desc; no admin, por recibido desc. Todas las columnas numéricas se pueden ordenar.
- **Pie** (debajo de la tabla, no dentro):
  - admin: "N insumos · Neto $ X · Total con IVA $ Y";
  - no admin: "N insumos".
- Las NC restan, y se aclara con un `HelpTooltip` en "Neto".
- **Vacío:** `EmptyState` con `ShoppingBasket`: "Sin compras de insumos en el período", con la descripción "Probá con otro período".
- **No admin:** una línea arriba, "Lo facturado y los precios los ve un administrador".

#### 6.7.3 Gráfico

Valen las reglas de `dataviz` de §6.4: una sola serie y sin leyenda; tooltip; texto en tokens; validar el token contra las dos superficies.

#### 6.7.4 Enganche en `ReportesClient.tsx` (los hunks exactos, sobre la versión de B3 @ `fca1eaa`)

`page.tsx` **no se toca**. En `ReportesClient.tsx`:

1. **Imports:**
   ```diff
   -import { BarChart3, Wallet, ClipboardList, Inbox, TriangleAlert, Package, Scale } from 'lucide-react'
   +import { BarChart3, Wallet, ClipboardList, Inbox, TriangleAlert, Package, Scale, ShoppingBasket } from 'lucide-react'
   …
    import SugeridoVsRecibido from './SugeridoVsRecibido'
   +import PorInsumo from './PorInsumo'
   ```
2. **Tipo de pestaña:**
   ```diff
   -type Tab = 'gasto' | 'historial' | 'stock' | 'sugerido'
   +type Tab = 'gasto' | 'insumo' | 'historial' | 'stock' | 'sugerido'
   ```
3. **Pestañas** (segunda, al lado de "Gasto por proveedor": las dos responden "cuánto se compró"):
   ```diff
       { id: 'gasto', label: 'Gasto por proveedor', icon: <Wallet size={14} /> },
   +    { id: 'insumo', label: 'Por insumo', icon: <ShoppingBasket size={14} /> },
       { id: 'historial', label: 'Historial de pedidos y remitos', icon: <ClipboardList size={14} /> },
   ```
4. **Panel** (el selector de período ya se muestra, porque `tab !== 'sugerido'`):
   ```diff
       {tab === 'gasto' && <GastoPorProveedor facturas={facturasFiltradas} pedidos={pedidosIniciales} esAdmin={esAdmin} />}
   +   {tab === 'insumo' && <PorInsumo rango={rango} esAdmin={esAdmin} />}
   ```
5. **Subtítulo:**
   ```diff
   -<p className="text-muted text-sm mt-0.5">Gasto, historial de pedidos/remitos y movimiento de stock del período elegido.</p>
   +<p className="text-muted text-sm mt-0.5">Gasto por proveedor y por insumo, historial de pedidos/remitos y movimiento de stock del período elegido.</p>
   ```

Si B3 cambió algo de esto antes de mergear, se aplica la misma intención sobre lo vigente y se avisa al coordinador. **No** se toca nada más de la carpeta de Reportes ni de `lib/compras/reportes.ts`.

## 7. Casos borde (y cómo se resuelven)

1. **Insumo sin nada en el período:**
   - la ficha muestra todo en 0 y el puente con inicio = fin;
   - en el reporte no aparece (E9).
2. **Insumo archivado:**
   - la ficha abre igual (por `?insumo=`), con el chip "Archivado";
   - en el reporte aparece si tuvo actividad, con su chip.
3. **Insumo sin conversión** (Bolsa Consorcio): sin "kg" en ningún lado, sin `SegmentedControl` en el gráfico y precio "/Unid.".
4. **Remito sin kg en un insumo por kg:** cuenta en "M sin pesar" y no se inventan kg.
5. **Factura vieja (antes de A2b, sin `cantidad_base`):** el facturado en kg sale de `cantidad × contenido` (estimado). El precio por kg del gráfico usa lo mismo. Es coherente con D4 de A2b (no se recalculan facturas viejas).
6. **Nota de crédito** (B4, hoy no hay): resta en cantidad, kg y pesos. No entra en el promedio, el último precio ni el gráfico.
7. **Factura anulada:** no cuenta (solo `confirmada`). El remito automático que se borró tampoco: su línea ya no existe.
   - En el ledger quedan la entrada y la salida (`salida_remito_anulado`, `factura_id`), que se netean en el grupo Remitos.
8. **Reversión de un ajuste:** cuenta en el grupo del movimiento original (E7). Una reversión de un `ajuste_manual` netea en "Ajustes a mano".
9. **El puente no cuadra:** imposible con el invariante en 0. Si pasa, se ve el aviso (§6.3) y el número igual.
10. **`ajuste_factura` con `discrepancia_id` null** (dev, §1.5): el chip dice "Factura" y lleva a la factura.
11. **Pedido no enviado:** no cuenta como pedido.
    - Un pedido enviado en septiembre y recibido en octubre: con el período de octubre aparece en Recibido y no en Pedido. Es lo esperado (E3), y lo explica el `HelpTooltip`.
12. **Movimiento sin `cantidad_despues`** (anterior al ledger): se muestra como hoy, sin "queda N", y suma igual al puente.
13. **Período > 2 años:** error de la función, que va al toast. Los presets nunca llegan a eso.
14. **Rol con `compras-stock` sin `compras-insumos`:** no ve "Editar insumo".
    - Rol con `compras-insumos` sin `compras-stock`: "Ver ficha" queda como texto (`LinkEntidad`).
    - Rol solo `fabrica-conteos`: no ve la ficha (proxy) y la función le da "No autorizado".
15. **Usuario de Fábrica** (lee `v_compras_stock_movimientos` por `tiene_acceso_fabrica`): las dos columnas nuevas son uuids. No hay pantalla de Fábrica que las use, y no exponen montos.
16. **Proveedor archivado** (B3): aparece en Proveedores con "(anterior)" si su par está inactivo. Su nombre sigue siendo link a su ficha.
17. **Dos facturas el mismo día del mismo proveedor:** son dos puntos en la misma x, y el tooltip muestra el N° de cada uno. No se agregan.
18. **Concurrencia:** solo lectura, sin locks. Si la ficha está abierta mientras alguien carga un remito, se ve al cambiar de pestaña o de período (no hay realtime en esta fase).

## 8. Archivos

**En alcance:**

| Archivo | Qué |
|---|---|
| `supabase/migrations/20261006120000_compras_trazabilidad_insumo.sql` | §3 (nuevo) |
| `docs/bloque2/escenarios-A2c.sql` | §9.2 (nuevo) |
| `lib/database.types.ts` | regenerado tras el push |
| `lib/compras/trazabilidad.ts`, `_check_trazabilidad.ts` | §4.1 (nuevos) |
| `lib/compras/reportePorInsumo.ts`, `_check_reportePorInsumo.ts` | §4.2 (nuevos) |
| `lib/compras/rangoFechas.ts` | `calcularRangoUltimos` (agregado, sin tocar lo existente) |
| `lib/compras/rutas.ts` | §5 (después de B3) |
| `app/admin/compras/stock/page.tsx`, `StockClient.tsx`, `StockFicha.tsx` | §6.1 |
| `app/admin/compras/stock/ficha/{PanelStock,PanelCompras,PanelMovimientos,GraficoPrecio,PuenteStock}.tsx`, `ficha/datos.ts` | §6.1–6.5 (nuevos) |
| `app/admin/compras/insumos/layout.tsx` | E14 |
| `app/admin/compras/insumos/page.tsx`, `InsumosClient.tsx`, `InsumoModal.tsx` | §6.6: `?insumo=` y "Ver ficha" |
| `app/admin/compras/reportes/PorInsumo.tsx` | §6.7 (nuevo, después de B3) |
| `app/admin/compras/reportes/ReportesClient.tsx` | **solo** los 5 hunks de §6.7.4 (después de B3) |
| `eslint.config.mjs` | sumar `app/admin/compras/stock/**/*.tsx` a la regla de hex si no está |
| `docs/bloque2/notas-A2c.md` | notas de la fase |

**Fuera de alcance (no se tocan):**
- **Funciones de escritura y de otros carriles:** cualquier RPC de escritura, `compras_mover_stock`, `v_compras_insumos_resumen` (se lee, no se redefine), `v_compras_proveedor_insumos` (de B3) y `lib/compras/reportes.ts`.
- **El resto de Reportes:** `app/admin/compras/reportes/page.tsx` y los otros archivos de esa carpeta.
- **Otras pantallas:** Proveedores, Fábrica, `/admin/catalogo`, `/deposito/catalogo` y `lib/modulos.tsx` (salvo D2).
- **Lo que llega en otras fases:** consumos (A4), "Receta vs. conteo" (A3), realtime y "ver todas" las facturas o remitos del insumo.
- **El manual `/ayuda`** se actualiza en la entrega final, no por fase.

## 9. Verificación

### 9.1 Antes de empezar

1. Copiar `.env.local`, `npm install` y dev server en **3005** desde PowerShell (protocolo).
2. `npx supabase migration list --linked --project-ref fafckqysyvtlslfnpzrh`: dev tiene que tener hasta `20261005190000`. Si dev tiene algo mayor, frenar y avisar.
3. Invariante del ledger en 0 (la consulta de `plan-A2b.md` §9.4).
4. Que no existan los índices de §3.1 con otro nombre (`select indexname, indexdef from pg_indexes where tablename in (…)`).

### 9.2 SQL de escenarios (dev, **sin pushear**; todo se revierte)

Archivo `docs/bloque2/escenarios-A2c.sql`, con el patrón de `escenarios-A2a.sql`: un `do $$ … $$` que cambia de usuario con `set_config('request.jwt.claims', …)` + `set_config('role','authenticated', true)` y termina con `raise exception 'RESULTADO: %', v_res`.

Se corre pegado detrás de la migración, en un solo archivo temporal:

```bash
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <tmp: begin; migración; escenarios; rollback;>
```

**Usuarios:**
- admin `37794588-426a-4699-85df-889b6b828e07` (`qa-admin`);
- coordinador `01e4dfd9-598f-49ac-87fd-15c538cc0ed9`;
- fábrica `b716e74f-91c7-4fa7-a8e0-aab0ff2de18d`.

**Insumos:** Queso Barra `7e60be56-9d6d-41dc-b2bd-30fce887ca24`. Para T10 se arma un insumo de prueba dentro del lote.

| # | Escenario | Esperado |
|---|---|---|
| T1 | Admin, Queso Barra, 01/09–31/10 | Los números de §1.5 (o los vigentes si dev cambió). `facturado_*` no null y `ultimo_precio_por = 'base'` |
| T2 | Admin, sin insumo, 01/09–31/10 | Una fila por insumo con actividad (17 hoy), ordenada por neto desc |
| T3 | Puente, 01/08 → hoy, todos | 0 filas donde `inicio + Σ mov − consumido ≠ fin` |
| T4 | Hasta hoy | `stock_fin = stock_actual` en todas las filas |
| T5 | Coordinador, Queso Barra | `facturado_*`, `precio_prom_*` y `ultimo_*` null; `recibido_cantidad` igual que T1 |
| T6 | Coordinador, `v_compras_insumo_documentos` tipo factura | 0 filas. Tipo remito: las mismas que admin |
| T7 | Fábrica: `compras_trazabilidad_insumo(...)` | Error "No autorizado". `v_compras_insumo_documentos` → 0 filas |
| T8 | Período de 800 días; `hasta < desde`; `desde` null | Los tres mensajes de §3.4 |
| T9 | `v_compras_stock_movimientos` | Columnas en el mismo orden que antes + `factura_id`, `discrepancia_id` al final. 12 filas con `factura_id` (hoy) |
| T10 | Insumo de prueba (dentro del lote): `compras_ajustar_stock` a stock + 5 y después `compras_revertir_movimiento` de ese ajuste (confirmar los nombres vigentes en `stock/acciones.ts`); un remito con kg y otro sin kg; una factura confirmada por kg | `mov_manual = 0` (el ajuste y su reversión se netean en Manual); `recibido_base_real` = solo los kg cargados; `recibido_sin_pesar = 1`; `precio_prom_base = Σ subtotal / Σ kg` |
| T11 | Período sin actividad para Queso Barra (p. ej. 01/01–31/01/2026) | 1 fila con todo en 0 y `stock_inicio = stock_fin` |
| T12 | Corte de día. Se busca un movimiento existente cargado entre las 21:00 y las 23:59 de Argentina (en UTC ya es el día siguiente) y se llama a la función para ese insumo con `desde = hasta =` su día local | El movimiento cuenta en ese día y no en el siguiente. Si dev no tiene ninguno, el `ajuste_manual` de T10 se hace con `set local timezone` y se compara contra el día local de `now()` |
| T13 | `explain` del reporte sin insumo (01/09–31/10) | Corre en < 200 ms en dev. Se pega el tiempo en las notas, no se exige el plan |
| T14 | Invariante del ledger | 0 antes y después |

Si T10 se complica de armar con las RPC reales (remito y factura de un pedido nuevo), se puede hacer con un pedido de prueba creado con las RPC de pedido. **Nada de `insert` directos en el ledger.**

### 9.3 Chequeos puros, tipos, lint y build

- `npx tsx lib/compras/_check_trazabilidad.ts` y `npx tsx lib/compras/_check_reportePorInsumo.ts`: todos OK.
- Los checks que ya existen siguen OK: `_check_unidades`, y `_check_reportes` cuando B3 esté adentro.
- `npx tsc --noEmit` limpio. `eslint` de los archivos tocados limpio.
- Cero hex y cero `as any` nuevos. **Los tipos de la función se usan desde `Database['public']['Functions']`**, sin castear.
- `npm run build` OK.

### 9.4 Push a dev (con OK del coordinador)

1. **B3 ya está en `qa`.** `git fetch && git rebase origin/qa`.
2. Renombrar la migración si `qa` tiene un timestamp ≥ `20261006120000`.
3. `npx supabase db push --dry-run --linked --project-ref fafckqysyvtlslfnpzrh`: tiene que aparecer **solo** la de A2c.
4. Pedir el OK al coordinador y hacer `db push` con los mismos flags.
5. `npm run types`: el diff solo trae lo de §3.5.
6. Invariante en 0.

### 9.5 QA en el navegador (local :3005 contra dev)

**Con `qa-admin`:**

1. **Stock › Queso Barra.** La ficha abre en **Stock**, igual que antes.
   - Ajustar +1 y revertirlo: anda como antes.
   - Cerrar con un ajuste a medio cargar: pide confirmación.
2. **Compras (3 meses):**
   - las tarjetas coinciden con T1 para ese período;
   - el puente cuadra y "Consumo de producción" dice "— (llega con la receta)";
   - cambiar a 12 meses recarga resumen y puente, pero no las listas;
   - en el gráfico, puntos de GLOBAL; el cambio "por Caja / por kg" convierte los valores y la línea "Ref." se mueve con el modo; el tooltip tiene el N° de factura;
   - A2B-QA-0001 en "Últimas facturas" abre la factura;
   - R-0037-01 en "Últimos remitos" abre el remito, y P-0037 abre el pedido;
   - GLOBAL en Proveedores abre su ficha en la pestaña Insumos.
3. **Movimientos:**
   - el filtro "Facturas" muestra los movimientos con `factura_id`, cada uno con el chip "Factura", que abre la factura;
   - "Remitos" muestra el chip con el código y abre el remito;
   - en otro insumo con conteo (Sal), "Conteos" abre el conteo;
   - "Ver 30 más" funciona con un filtro activo.
4. **Deep links:**
   - `/admin/compras/stock?insumo=<QB>&pestana=compras` abre en Compras;
   - al cerrar se limpian los dos params y F5 no reabre;
   - un id inexistente da el comportamiento de hoy (no abre nada y limpia).
5. **Insumos:**
   - la pestaña se llama "Insumos";
   - `/admin/compras/insumos?insumo=<QB>` abre el form de Queso Barra;
   - "Ver ficha" lleva a la ficha y "Editar insumo" vuelve al form;
   - con un cambio sin guardar en el form, "Ver ficha" no te saca sin confirmar.
6. **Reportes › Por insumo** (después del merge de B3):
   - mes actual: Queso Barra arriba, con neto y promedio;
   - el gráfico top 8 aparece;
   - buscar "fecula" encuentra Fécula;
   - filtrar por categoría funciona;
   - "Exportar CSV" baja un archivo que abre bien en Excel, con tildes y las columnas de §4.2;
   - el nombre del insumo abre la ficha en Compras.

**Con `qa-coordinador`:**

7. **Ficha en Compras:** sin las tarjetas de facturado y precio (sale el aviso con candado), sin gráfico ni últimas facturas, y con remitos y proveedores. Ninguna consulta a facturas en la pestaña Network.
8. **Movimientos:** "Factura" se ve como texto, sin link.
9. **Reportes › Por insumo:** sin columnas de pesos ni gráfico. El CSV no tiene columnas de factura.

**Siempre:**

10. **375px, tema claro y oscuro:** las tres pestañas, el gráfico y el reporte, sin scroll horizontal. Las pestañas se manejan con el teclado (←/→).
11. **Consola:** sin errores nuevos.

Si el navegador de pruebas no corre `requestAnimationFrame` (notas de A2b), se parchea igual que en A2b y se anota.

### 9.6 Datos de dev

A2c no escribe nada. Si para la QA hace falta una factura más (para que el gráfico tenga 2 puntos de proveedores distintos), se carga por la UI en un pedido de prueba y se anota en las notas con su código (`A2C-QA-000N`).

## 10. Commits y cierre (rama `bloque2/stock`)

**Paso 1 (ya):**
- migración + `escenarios-A2c.sql` corridos en el lote revertido;
- lógica pura y sus checks.

Commit: `feat(compras): trazabilidad por insumo en SQL (función, vista de documentos, ledger con factura) + lógica pura (A2c, sin aplicar)`.

**Paso 2 (con B3 en `qa`):**
- rebase y `rutas.ts`;
- ficha con pestañas (§6.1–6.5) e Insumos (§6.6).

Commit: `feat(compras): ficha del insumo con pestañas Stock, Compras y Movimientos; ?insumo= en Insumos (A2c)`.

**Paso 3 (con el OK del coordinador):**
- push a dev y tipos regenerados;
- `PorInsumo.tsx`, `reportePorInsumo.ts` y los 5 hunks.

Commits:
- `chore(tipos): regenerar database.types tras aplicar A2c en dev`
- `feat(compras): reporte Por insumo con CSV (A2c)`

**Cierre:**
- QA de §9.5 y capturas;
- `docs/bloque2/notas-A2c.md` con "Lo hecho", "Desvíos", "Verificación", "Datos que quedan en dev", "Para otras fases" (A3, A4, B4) y la "Lista de pruebas para el usuario";
- push después de cada paso verificado.

## 11. Criterios de aceptación

1. `compras_trazabilidad_insumo` existe en dev y devuelve lo de §3.4. El puente cuadra (T3), `stock_fin = stock_actual` hasta hoy (T4), y un no admin recibe null en todo lo de facturas (T5).
2. La función rechaza Fábrica, los períodos de más de 2 años y los inválidos (T7, T8). Ninguna consulta nueva de la app corre sin insumo, período o `limit`.
3. `v_compras_stock_movimientos` expone `factura_id` y `discrepancia_id` al final, sin cambiar las columnas que ya tenía (T9). Los movimientos linkean a remito, factura (o "Diferencia") y conteo con `LinkEntidad`, y el chip del remito ya no está armado a mano.
4. La ficha de Stock tiene las pestañas Stock (igual que antes), Compras y Movimientos, y abre en la pestaña de `?pestana=`. Cerrar limpia los params.
5. La pestaña Compras muestra:
   - el resumen del período (pedido, recibido en unidad de compra y kg reales, y facturado en cantidad, kg y $ con promedio y último precio solo para admin);
   - el puente de stock con "Consumo de producción" previsto;
   - el gráfico de precio de 12 meses (admin), con un solo eje y el selector de unidad;
   - las últimas facturas y remitos con link;
   - los proveedores con `precio_ref` y `cobra_por`.
6. Insumos lee `?insumo=` y abre el form, que tiene "Ver ficha". La ficha tiene "Editar insumo". La pestaña se llama "Insumos".
7. Reportes tiene "Por insumo", con cantidad y pesos facturados por insumo en el período, búsqueda, categoría, top 8 (admin) y CSV. Un no admin no ve ni exporta pesos.
8. El enganche en Reportes son solo los 5 hunks de §6.7.4. `page.tsx` de Reportes y `lib/compras/reportes.ts` no cambian.
9. `tsc`, lint, build y los checks puros, limpios. QA de §9.5 OK, con capturas a 375 y 1440 en claro y oscuro. La paleta del gráfico, validada con el script de `dataviz`.
10. El invariante del ledger queda en 0 y A2c no movió stock.

## 12. Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test` (contraseña en `docs/qa-credenciales-dev.md`), **una vez mergeado a `qa`**:

1. **Compras › Stock › Queso Barra.** → La ficha abre como siempre: stock y "Ajustar stock". Arriba aparecen tres pestañas: Stock, Compras y Movimientos.
2. **Pestaña Compras.** → Cuatro tarjetas:
   - cuánto se pidió;
   - cuánto llegó (en cajas y kg pesados);
   - cuánto se facturó (cajas, kg y $);
   - el precio promedio y el último.

   Cambiá entre "30 días", "3 meses" y "12 meses": los números cambian.
3. **"Cómo se movió el stock".** → Arranca en el stock del primer día y suma remitos, conteos, diferencias con facturas y ajustes, hasta llegar al stock de hoy. "Consumo de producción" dice que llega con la receta.
4. **"Precio en los últimos 12 meses".** → Hay un punto por factura, por proveedor. Pasá el mouse: dice la factura y el precio. Cambiá "por Caja / por kg" y fijate que la línea "Ref." acompañe.
5. **"Últimas facturas" y "Últimos remitos".** → Tocá un número de factura, un R-xxxx y un P-xxxx: cada uno abre lo suyo.
6. **"Proveedores".** → Muestra cómo cobra cada uno (Caja o kg), el precio de referencia y el último facturado. El nombre abre la ficha del proveedor.
7. **Pestaña Movimientos.** → Es la lista de siempre. Probá los filtros (Remitos, Conteos, Facturas, A mano). Los movimientos que vienen de una factura tienen el chip "Factura" (o "Diferencia"), que abre esa factura. Los de un conteo abren el conteo.
8. **Compras › Insumos.** → La pestaña se llama "Insumos" (antes "Catálogo"). Abrí Queso Barra y tocá "Ver ficha": te lleva a la ficha. Ahí, "Editar insumo" te devuelve al form.
9. **Compras › Reportes › Por insumo.** → Lista lo comprado de cada insumo en el período, con los pesos y el precio promedio, y un gráfico con los 8 que más se pagaron. Buscá "fecula". Tocá "Exportar CSV" y abrilo en Excel. Tocá un insumo: abre su ficha en la pestaña Compras.
10. **Con `qa-coordinador@chipacitos.test`.** → En la ficha y en el reporte no aparece nada de pesos ni de facturas. Dice que eso lo ve un administrador. El resto, igual.
11. **Celular (375px) y tema claro.** → La ficha y el reporte se leen sin scroll horizontal, y las pestañas se tocan bien.

## 13. Decisiones que necesitan al usuario

| # | Pregunta | Recomendación | Por qué |
|---|---|---|---|
| **D1** | ¿Un usuario de Compras que no es admin ve **las cantidades facturadas** (sin pesos)? | **No: todo lo de facturas, solo admin**, como hoy (P1). El no admin ve pedido, recibido, stock y ajustes. | Las facturas, sus líneas y las diferencias son solo de admin desde F5. Mostrar las cantidades sería abrir una regla que hoy no existe, y lo que sirve para controlar mercadería (lo que llegó) ya lo ve. Si se quiere abrir, es un cambio chico: sacar la condición `v_admin` de las cantidades. |
| **D2** | El menú lateral tiene "Catálogo" (de productos, en Parámetros). Con la pestaña de Compras renombrada ya no hay dos, pero "Catálogo" solo sigue siendo ambiguo. ¿Se le cambia el nombre? | **Sí, "Catálogo de productos"** (solo el `label` en `lib/modulos.tsx:45`; la `key` y los permisos no cambian). | Es el título que ya tiene esa pantalla y elimina la confusión que señaló la reunión. Si se prefiere no tocar `modulos.tsx` en esta fase, queda como está. |
| **D3** | ¿El reporte "Por insumo" va **antes** que "Historial de pedidos" (segunda pestaña, al lado de "Gasto por proveedor")? | **Sí, segunda.** | "Por proveedor" y "por insumo" son las dos preguntas de Ricardo (cuánto se compró y se pagó). El historial es operativo. |

Las demás decisiones (dónde vive la ficha, función en vez de vista, fechas por documento, promedio ponderado, tope de 2 años y la carga por pestaña) se tomaron en §2 con su porqué.

## 14. Para el coordinador

- **Tabla de dueños del plan maestro:** `v_compras_trazabilidad_insumo` pasa a ser **`compras_trazabilidad_insumo(date, date, uuid)`** (función, E2) + **`v_compras_insumo_documentos`**. Las dos son de A2c, después A4. A4 no necesita redefinir la función para el consumo (E7). Solo cambia el texto de "llega con la receta" en `PuenteStock.tsx`.
- **Dependencia de B3:** los pasos 2 y 3 necesitan B3 en `qa`:
  - `v_compras_proveedor_insumos`;
  - `rutaDe` con `pestana`;
  - `ReportesClient` nuevo;
  - la migración `190000`, que ya está en dev.
- **Hallazgos (no son de A2c, no se tocan):**
  - **`app/admin/compras/reportes/page.tsx` (B3) carga sin límite** `v_compras_stock_movimientos` (`select('*')`), `compras_remitos` y `compras_pedidos` con sus remitos, y después filtra el período en el cliente. Hoy son ~200 movimientos; con el consumo de A4 (un movimiento por insumo y carga) crece rápido. Sugerencia: filtrar por período en el servidor (B3 o F9).
  - En dev, el `ajuste_factura` de P-0015 y su reversión tienen `discrepancia_id` en null: la diferencia se regeneró y la FK es `SET NULL`. No rompe nada (E12). Si B4 necesita ir de la diferencia al movimiento, que use `compras_factura_discrepancias.movimiento_id`.
