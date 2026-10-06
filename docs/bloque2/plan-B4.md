# B4 — Devoluciones al proveedor + nota de crédito (especificación ejecutable)

> Es la **F6 del Bloque 1** (`C:\Users\spruy\.claude\plans\bueno-tenemos-todo-septiembre-nifty-meteor.md`, líneas ~789-857, escenarios D1–D5 en ~247-256), actualizada contra todo lo que entró después: A1, B1, A2a, B2, A2b, B3 y A2c.
>
> - Rama `bloque2/pedidos`, que sale de `qa` @ `c59eb64` (A2c adentro).
> - Migración: **`supabase/migrations/20261006150000_compras_devoluciones.sql`**. Es mayor que `20261006120000` (A2c, ya aplicada en dev).
> - **Solo dev (`fafckqysyvtlslfnpzrh`) y QA.** Prod no se toca de ninguna forma. Nunca `supabase link`: siempre `--linked --project-ref fafckqysyvtlslfnpzrh`.
> - El `db push` se hace **con el OK del coordinador**.
> - Push de la rama: `git -c credential.helper= push https://x-access-token:$(gh auth token -u 4peeqTech)@github.com/4peeqTech/YA-Chipacitos.git bloque2/pedidos` (el token solo en ese comando; no se hace `gh auth switch`).
>
> Las decisiones que necesitan al usuario están en **§13**. Cada una trae la recomendación que asume el resto de la spec.

## 0. Qué cambia, en una línea

Desde el pedido, la factura o una diferencia "Reclamo al proveedor" se registra una **devolución** con un motivo parametrizable. El motivo dice si **sale mercadería del stock** o si **solo corrige la factura**. Al devolver se elige si el proveedor **repone** o **no repone**. La devolución puede traer la **nota de crédito** en el momento o cargarla después. La NC es una `compras_facturas` con `tipo_comprobante = 'nota_credito'`, que **baja el gasto pendiente** o, si el gasto ya se pagó, queda **a favor**. Todo se puede anular. El pedido llega a **Devuelto** cuando se devolvió todo lo recibido y no queda reposición pendiente.

## 1. Relevamiento del código vigente (`qa` @ `c59eb64`; dev en solo lectura el 2026-10-06)

### 1.1 Lo que ya existe y B4 aprovecha

| Qué | Dónde | Estado |
|---|---|---|
| Tipo de movimiento `devolucion_proveedor` en el ledger | check de `20260925120000:35-38` | ya existe, sin uso |
| `compras_facturas.tipo_comprobante` (`factura` \| `nota_credito`) y `factura_origen_id` | `20260928190000` | sin uso; 0 NC en dev |
| Unique del número por `(proveedor_id, tipo_comprobante, numero_normalizado)` donde no está anulada | `20260928190000` | sirve tal cual para las NC |
| Unique "una factura por pedido" **solo** para `tipo_comprobante = 'factura'` | `20260928190000` | la NC no choca |
| `compras_pedidos.estado_recepcion` acepta `devuelto` | check de `20260924200000:18` | hoy nadie lo escribe |
| Estado visible `devuelto` (gana a todo), `ESTADOS.compras_pedido.devuelto` (tono peligro, ícono `Undo2`), filtro "Devueltos", subtexto "con devolución" vía `hayDevolucion` | `lib/compras/estadoPedido.ts`, `lib/estados.ts:34` | listo; `hayDevolucion` hoy siempre `false` |
| Las NC restan (signo −1) en `resumirPagos`, `calcularGastoPorProveedor`, la Cuenta del proveedor y Reportes | `lib/compras/reportes.ts:137`, `FichaPaneles.tsx:212-338`, `ReportesClient.tsx:92` | listo (B3) |
| A2c: la trazabilidad resta las líneas de NC **con `item_id`** en cantidad, kg y pesos, y suma `devolucion_proveedor` en su propio grupo del puente de stock | `20261006120000:167-224` | listo; B4 no lo redefine |
| `compras_anular_factura` ya dice "registrá una nota de crédito" cuando el gasto está pagado | `20261005180000:1426-1428` | B4 la hereda (§3.11) |
| `compras_resolver_diferencia` ya acepta `estado_recepcion = 'devuelto'` como recepción completa | `20260929120000:548` | sin cambios |
| `TablaMaestra` con `camposExtra` (checkbox, select y número) + patrón de API route | `components/ui/TablaMaestra.tsx`, `app/api/fabrica-devolucion-motivos/route.ts` | se copia para los motivos |
| `cargarComprobante` rechaza la NC con 409 "Por ahora solo se comparten facturas" | `lib/compras/cargarComprobante.ts:31` | queda así (D5 de §13) |

### 1.2 Cuerpos vigentes de las funciones que B4 redefine (partir **siempre** de estos)

| Objeto | Último cuerpo | Dueño hasta hoy |
|---|---|---|
| `compras_mover_stock` (9 parámetros, hasta `p_discrepancia_id`) | `20260929120000:96-155` | A1 → A4 (A1 no la redefinió) |
| `compras_recalcular_estado_pedido` | `20260928190000:163-` (bloque completo hasta su `$$;`) | sin dueño en la tabla (F2/F4) |
| `compras_diferencias_calculadas` (con kg) | `20261005180000:1505-1573` | A2b |
| `compras_recalcular_diferencias_factura` | `20260929120000:220-286` | **no se toca** (lee columnas por nombre) |
| `compras_anular_factura` | `20261005180000:1376-1497` | A2b → **B4** (lo dice la tabla de dueños) |
| `v_compras_factura_diferencias` (calcula los kg en la vista) | `20261005180000:1618-1652` | A2b |
| `v_compras_pedido_pendiente` | `20261005180000:1580-1612` | A2b |
| `v_compras_facturas` | `20260929120000:1058-1084` | F5 (nadie la redefinió después) |
| `v_compras_pedido_eventos` | `20261005140000:619-662` (es `drop` + `create view`) | B1 |
| Check `compras_pedido_eventos_tipo_check` | `20261005140000:23-27` | B1 |

**Antes de copiar un cuerpo:** `rg -n "function public.<nombre>|view public.<nombre>" supabase/migrations` y confirmar que no hay uno más nuevo. Otras sesiones mergean a `qa` en paralelo.

**No se redefinen** (la guarda nueva va en el recálculo; ver E7): `compras_guardar_remito`, `compras_eliminar_remito`, `compras_guardar_factura`, `compras_confirmar_factura` (A2b), `compras_trazabilidad_insumo`, `v_compras_insumo_documentos` y `v_compras_stock_movimientos` (A2c → A4).

### 1.3 Lo que hoy está mal o falta para B4

1. **`compras_recalcular_estado_pedido` trata `devuelto` como un estado "pegado"** (igual que `cerrado_manual`): nunca lo calcula y nunca lo saca. B4 lo pasa a **calculado**.
2. **`v_compras_pedido_eventos` muestra cualquier comprobante anulado como "factura anulada":** la rama `factura_anulada` no filtra `tipo_comprobante`. Una NC anulada aparecería como "Anuló la factura".
3. **`v_compras_facturas` no tiene nada de la NC:** ni la factura que corrige, ni su devolución, ni cómo afectó al gasto. Su `gasto_id` / `gasto_estado` quedan en null para la NC, así que `resumirPagos` la mandaría a "Sin gasto" aunque haya bajado un gasto pendiente. El resultado sería un "Pendiente" inflado y un "Sin gasto" negativo (ver E10).
4. **Las diferencias no conocen las devoluciones ni las NC:** comparan lo facturado contra lo que llegó en los remitos, sin más.
5. **Editar o eliminar un remito, o anular una factura con remito automático, puede dejar menos recibido que devuelto.** Hoy no hay devoluciones, así que no pasa; con B4 hace falta la guarda (E7).
6. **Fábrica ya tiene "Motivos de devolución"** (`fabrica_devolucion_motivos`, devoluciones de producto de los locales a fábrica). Son otra cosa: en Proveedores la pestaña se llama **"Motivos de devolución al proveedor"** y la tabla `compras_devolucion_motivos`.

### 1.4 Datos de dev (2026-10-06, solo lectura)

- **0 notas de crédito**, 6 facturas confirmadas y ninguna tabla `compras_devol*`.
- Pedidos por `estado_recepcion`: `cerrado_manual 2 · enviado 8 · parcial 3 · recibido 7 · sin_enviar 6`.
- `gastos`: no hay CHECK sobre `monto`; la validación `> 0` vive en `gastos_guardar`. Columnas de pago: `fecha_pago`, `pagado_por`, `caja` y `forma_pago` (`not null`, sin CHECK). PostgreSQL 17.6.
- Para la QA sirven:
  - **P-0037** (GLOBAL): remito R-0037-01 (Queso Barra 2 Caja / 32,9 kg + Fécula 3 Bolsa) y factura **A2B-QA-0001** confirmada, con Queso Barra **por kg** a $ 1.250 y gasto pendiente de $ 59.411;
  - **P-0019**: factura A2B-QA-0002, con 1 diferencia pendiente (1 Caja de Queso Barra);
  - **P-0016**: factura `0001-00000777`, con 1 diferencia a resolver (Huevos +2, cerrado a mano).

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §13)

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| E1 | **Qué hace un motivo** | Dos flags: `devuelve_mercaderia` (lo pide la consigna) y `corrige_precio`. CHECK: no pueden estar los dos en `true`. Quedan tres comportamientos: **sale mercadería** · **facturado y no entregado** (sin mercadería, acredita cantidad) · **precio mal facturado** (sin mercadería, acredita plata). Ver D1. | Con un solo flag no se distingue "me cobraron 2 cajas que no llegaron" (la NC baja la cantidad facturada y cierra la diferencia +2 de F5) de "me cobraron $ 1.300 el kg y era $ 1.250" (la NC baja plata y las cantidades no cambian). Tratarlas igual rompe las diferencias o la trazabilidad de A2c. |
| E2 | **Foto del motivo** | `compras_devoluciones` copia `motivo_nombre`, `devuelve_mercaderia` y `corrige_precio` al registrar. Todo lo que se calcula después lee la copia, no la tabla de motivos. | Marcos puede editar un motivo en la `TablaMaestra`. Si se le cambiara el flag a uno ya usado, cambiaría de golpe el stock esperado, la recepción y las diferencias de devoluciones viejas, y anular revertiría algo distinto de lo que se movió. |
| E3 | **Código** | `D-0012-01`: el número del pedido + una secuencia por pedido (`compras_pedidos.ultima_secuencia_devolucion`, mismo patrón que el remito). `codigoDevolucion()` en `lib/compras/codigos.ts`. | "Búsqueda por código en todas las listas" y "lenguaje del negocio". El ledger, el historial y las NC lo nombran. |
| E4 | **Unidad** | La cantidad devuelta va **en unidad de compra** (cajas, con decimales). Los **kg reales** van en `compras_devolucion_items.cantidad_base`: son opcionales, como en el remito, pero **obligatorios si la devolución trae NC y la línea de la factura cobra por kg** (`precio_por = 'base'`). El movimiento `devolucion_proveedor` mueve cajas; los kg van en el `motivo` del movimiento ("… (16,4 kg)"). | U3 del Bloque 2: el stock sigue en unidad de compra. Es la regla de A2b para remitos. La NC por kg necesita los kg para el subtotal (`cantidad_base × precio`). |
| E5 | **Líneas de la NC** | Se arman **en el servidor** desde los ítems de la devolución. El cliente solo manda el precio y la alícuota de cada línea (editables, prellenados con la última línea de ese insumo en la factura origen), el número, la fecha y el "total según el papel". **Sale mercadería / facturado y no entregado:** una línea por ítem, con `item_id`, `pedido_item_id`, `cantidad` = lo devuelto, `cantidad_base` (si cobra por kg) y el `precio_por` de la línea original. **Precio mal facturado:** una línea **sin insumo** ("Diferencia de precio · Queso Barra: de $ 1.300 a $ 1.250 por kg"), con `cantidad` = la cantidad cobrada en su unidad (kg si `precio_por = base`), `precio_unitario` = facturado − correcto, `precio_por = 'unidad'` y la alícuota de la línea. | Las cantidades no se confían al navegador. La línea sin insumo de la corrección de precio no toca las diferencias (solo cuentan líneas con insumo) ni la cantidad comprada de A2c. El costo: A2c no le resta esa plata al insumo (D2). |
| E6 | **Repone y NC** | Si el motivo saca mercadería se elige **repone / no repone**. Si no saca mercadería, `repone = false` siempre. **"Repone" no lleva NC**: la reposición ya está facturada (D3). | Con 1 factura = 1 pedido (F1), la reposición entra por remito al mismo pedido y ya está cubierta por la factura. Una NC encima acreditaría dos veces. |
| E7 | **Guarda "recibido ≥ devuelto"** | Va en `compras_recalcular_estado_pedido`: por insumo (y por línea del pedido cuando el ítem la tiene), `Σ remitos ≥ Σ devuelto activo con mercadería`. Si no, `raise` con el código de la devolución y qué hacer. | Todas las RPC que cambian lo recibido llaman al recálculo antes de terminar: guardar y eliminar remito, anular factura (remito automático) y las devoluciones. El `raise` revierte la transacción entera, stock incluido. Así no hay que redefinir `compras_guardar_remito` ni `compras_eliminar_remito` de A2b, que son los cuerpos más largos y delicados. |
| E8 | **Recepción con devoluciones** (F6) | Por línea del pedido, contando solo devoluciones activas con mercadería: `neto = Σ remitos − Σ devuelto`, `cubierto = neto + Σ devuelto con repone = false`; la línea está completa si `cubierto ≥ cantidad`. **Devuelto** = todas las líneas cubiertas **y** `Σ neto` del pedido (incluidas las líneas libres) = 0 **y** hay al menos una devolución activa con mercadería y sin reposición. Si no, la regla normal con `cubierto` y `neto`. `cerrado_manual` sigue "pegado" (E9). | Es la regla de F6. "Todas cubiertas" reemplaza a "no queda reposición pendiente": una reposición pendiente deja su línea sin cubrir. Además, una línea que nunca llegó no deja el pedido en Devuelto. |
| E9 | **Cerrado a mano** | Sigue sin recalcularse. Una devolución **con reposición** en un pedido cerrado a mano se frena: "El pedido está cerrado a mano: reabrilo para esperar la reposición, o registrá la devolución sin reposición." Sin reposición se permite, y el pedido sigue "Cerrado". | El cierre a mano dice "no espera más mercadería". Si el proveedor dijo que reponía y después no repone, el camino es "Cerrar a mano" sobre el pedido Parcial, que ya existe (P2). |
| E10 | **NC y gasto** | Al confirmarse la NC se mira el gasto de la factura origen, con `for update`: **Pendiente de pago** → `monto −= least(total NC, monto)` (`nc_gasto = 'descontado'`); si queda en $ 0 → D4 (`'cancelo_gasto'`); **Pagado/Parcial** → no se toca (`'a_favor'`, aviso D5); **sin gasto** → `'sin_gasto'`. Lo descontado se guarda en la NC (`gasto_descontado`) y **anular lo devuelve exacto** (delta, no recálculo desde cero). | El gasto vinculado a mano (FA10) puede diferir ±1 % del total: recalcularlo desde `factura.total − Σ NC` le cambiaría el monto. Con el delta guardado, anular deja el gasto como estaba. |
| E11 | **NC en las vistas de plata** | En `v_compras_facturas`, la fila de una NC toma `gasto_id`, `gasto_estado` y `gasto_local` **de su factura origen** (`coalesce`), y suma `nc_gasto`. `estadoPago()` devuelve **`'a_favor'`** para una NC con `nc_gasto = 'a_favor'`. `resumirPagos` suma el bucket `aFavor`, y el invariante pasa a `facturado = pagado + pendiente + sinGasto + aFavor`. | Factura 100 pendiente + NC 20 descontada → Pendiente 80 = el monto real del gasto. Si después se paga: Pagado 80. Si se pagó antes (D5): Pagado 100 y A favor −20. Sin esto, la NC cae en "Sin gasto" y descuadra la Cuenta (§1.3.3). |
| E12 | **Diferencias con devoluciones** | `compras_diferencias_calculadas`, por insumo: `recibida = Σ remitos − Σ devuelto activo con mercadería` (con o sin reposición) y `facturada = Σ factura − Σ líneas con insumo de las NC confirmadas de esa factura`. Lo mismo para los kg. Devuelve además `devuelta` y `acreditada` (informativas). | Lo que se queda contra lo que se cobra neto. Sale bien en todos los casos (ver §3.7): con reposición pendiente es "pendiente de llegar"; lo que llegó de más y se devolvió da 0; lo facturado y no entregado se cierra con la NC; la corrección de precio no cambia nada. |
| E13 | **Devolución sin NC esperando** | Si se registra una devolución que **espera NC** (sin reposición, sin NC y con factura confirmada), las diferencias pendientes con diferencia > 0 de esos insumos quedan como **`reclamo_proveedor`**, con la nota "Esperando la nota de crédito de D-…" y `devolucion_id`. Cuando llega la NC, los números coinciden y la diferencia desaparece. Si se anula la devolución, el recálculo la vuelve a pendiente o la borra. | Sin esto, devolver 2 cajas en mal estado de un pedido ya facturado haría aparecer una "diferencia a resolver" nueva justo después de registrar la devolución, que es justamente el reclamo. |
| E14 | **Guarda R3 en devoluciones** | Antes de mover nada, `registrar`, `cargar NC`, `anular NC` y `anular devolución` frenan si algún insumo de la devolución tiene una diferencia resuelta como `ajusta_stock` en la factura del pedido: "Queso Barra ya se ajustó desde la factura (Diferencias con lo recibido). Revertí ese ajuste antes de <registrar la devolución \| cargar la nota de crédito \| anular>." | El recálculo igual frenaría (R3), pero con el texto del remito. Así el mensaje dice qué hacer. |
| E15 | **Permisos** | Ver D6. Devolución **con mercadería y sin NC**: `tiene_acceso_compras()`. Motivos sin mercadería, cualquier cosa con NC, cargar NC y anular NC: `es_admin()`. Anular una devolución: Compras si no tiene NC activa; admin si la tiene. Las vistas esconden los montos a quien no es admin (`case when es_admin()`). | Quien recibe la mercadería (rol de Compras) es quien ve que llegó mal. La plata y las facturas son solo de admin (P1). |
| E16 | **Eventos del pedido** | En la tabla de B1: `devolucion_registrada` y `devolucion_anulada`, sin montos. La NC entra al historial **desde `compras_facturas`** en dos ramas nuevas de la vista, solo para admin: `nota_credito` y `nota_credito_anulada` (igual que la factura). | La tabla de eventos la lee cualquiera con Compras: no puede llevar plata. Es el mismo criterio que B1 usó para la factura. |
| E17 | **Lock order** | pedido (`for update`) → factura origen → NC → gasto → devolución → stock (`compras_mover_stock`). | Es el mismo orden que `compras_confirmar_factura` (pedido → factura → gasto → stock) y `compras_resolver_diferencia` (pedido → factura → diferencia → stock). Dos devoluciones del mismo pedido a la vez se serializan en el pedido y la segunda ve el máximo actualizado. |
| E18 | **Factura con NC** | `compras_anular_factura` frena si la factura tiene alguna NC confirmada ("Anulá primero la nota de crédito N° … desde su devolución D-…") o alguna devolución activa sin mercadería (corrige esta factura). Recibir `tipo_comprobante = 'nota_credito'` también frena: "Una nota de crédito se anula desde su devolución." | Una NC sin su factura no tiene sentido, y el gasto queda atado a la factura. |
| E19 | **Anular la NC sola** | `compras_anular_nota_credito(p_devolucion_id, p_motivo)`: anula la NC, devuelve el gasto y deja la devolución activa, "esperando nota de crédito". | "Todo error de carga tiene salida": la NC se puede cargar con el número o el precio mal sin que eso obligue a deshacer la devolución y el stock. |
| E20 | **Estructura de archivos** | Sin ruta ni pestaña nueva en Pedidos: la devolución vive dentro del pedido. `app/admin/compras/pedidos/devoluciones/` (componentes, `acciones.ts`, `datos.ts`) + `lib/compras/devoluciones.ts` (puro). Deep link: `/admin/compras/pedidos?pedido=<id>&devolucion=<id>` abre el pedido y resalta esa devolución. La NC se abre con `?factura=<id>` en Facturas. | Mismo patrón que remitos y facturas. `rutaDe` suma `{ tipo: 'devolucion', id, pedidoId }`. |

## 3. Migración `supabase/migrations/20261006150000_compras_devoluciones.sql`

Encabezado con la explicación (como A2b): qué agrega, qué funciones redefine y desde qué cuerpo, el invariante del ledger y que **no** toca prod. Todo aditivo. Las funciones van con `create or replace` (o `drop` + `create` si cambia la firma o el retorno), con `security definer` y `set search_path = public`.

### 3.1 Motivos

```sql
create table if not exists compras_devolucion_motivos (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  devuelve_mercaderia  boolean not null default true,
  corrige_precio       boolean not null default false,
  orden                int not null default 0,
  activo               boolean not null default true,
  created_at           timestamptz not null default now(),
  constraint compras_devolucion_motivos_flags_validos check (not (devuelve_mercaderia and corrige_precio))
);
create unique index if not exists compras_devolucion_motivos_nombre_unico
  on compras_devolucion_motivos (lower(btrim(nombre)));

insert into compras_devolucion_motivos (nombre, devuelve_mercaderia, corrige_precio, orden) values
  ('Mercadería en mal estado', true,  false, 1),
  ('Producto equivocado',      true,  false, 2),
  ('Cantidad de más',          true,  false, 3),
  ('Vencido o por vencer',     true,  false, 4),
  ('Facturado y no entregado', false, false, 5),
  ('Precio mal facturado',     false, true,  6)
on conflict do nothing;

alter table compras_devolucion_motivos enable row level security;
create policy compras_devolucion_motivos_lectura on compras_devolucion_motivos
  for select using (tiene_acceso_compras());
create policy compras_devolucion_motivos_admin on compras_devolucion_motivos
  for all using (es_admin()) with check (es_admin());
```

- Los motivos se escriben desde la `TablaMaestra` por la API route con `requireAdmin` (§6.1), igual que los de Fábrica. Es una tabla de catálogo, sin auditoría: por eso E2 guarda la foto en la devolución.
- "Facturado y no entregado" **no estaba en el seed de F6**. Es el que cierra el camino de la diferencia +2 de F5 ("la factura dice 2 más de lo que llegó") con una NC (D1).

### 3.2 Devoluciones e ítems

```sql
alter table compras_pedidos
  add column if not exists ultima_secuencia_devolucion int not null default 0;

create table if not exists compras_devoluciones (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid not null references compras_pedidos(id) on delete restrict,
  secuencia            int not null,
  factura_id           uuid references compras_facturas(id) on delete restrict,   -- la factura que corrige (null si todavía no hay)
  motivo_id            uuid not null references compras_devolucion_motivos(id) on delete restrict,
  -- E2: foto del motivo
  motivo_nombre        text not null,
  devuelve_mercaderia  boolean not null,
  corrige_precio       boolean not null,
  repone               boolean not null,
  nota                 text,
  nota_credito_id      uuid references compras_facturas(id) on delete restrict,
  estado               text not null default 'activa' check (estado in ('activa', 'anulada')),
  creado_por           uuid references profiles(id),
  created_at           timestamptz not null default now(),
  anulada_por          uuid references profiles(id),
  anulada_en           timestamptz,
  anulada_motivo       text,
  constraint compras_devoluciones_pedido_secuencia_key unique (pedido_id, secuencia),
  constraint compras_devoluciones_repone_con_mercaderia check (not repone or devuelve_mercaderia),
  constraint compras_devoluciones_repone_sin_nc check (not repone or nota_credito_id is null),
  constraint compras_devoluciones_anulada_con_motivo check (estado <> 'anulada' or nullif(btrim(anulada_motivo), '') is not null)
);
create index if not exists idx_compras_devoluciones_pedido on compras_devoluciones (pedido_id);
create unique index if not exists compras_devoluciones_nc_unica
  on compras_devoluciones (nota_credito_id) where nota_credito_id is not null;

create table if not exists compras_devolucion_items (
  id               uuid primary key default gen_random_uuid(),
  devolucion_id    uuid not null references compras_devoluciones(id) on delete cascade,
  pedido_item_id   uuid references compras_pedido_items(id) on delete restrict,
  item_id          uuid references compras_items(id) on delete restrict,
  factura_item_id  uuid references compras_factura_items(id) on delete restrict,   -- solo corrige_precio
  descripcion      text not null,
  unidad           text,
  cantidad         numeric not null check (cantidad > 0),
  cantidad_base    numeric check (cantidad_base is null or cantidad_base > 0),
  precio_correcto  numeric(14,4) check (precio_correcto is null or precio_correcto >= 0),   -- solo corrige_precio
  orden            int not null default 0,
  constraint compras_devolucion_items_con_referencia check (item_id is not null or factura_item_id is not null)
);
create index if not exists idx_compras_devolucion_items_devolucion on compras_devolucion_items (devolucion_id);
create index if not exists idx_compras_devolucion_items_item on compras_devolucion_items (item_id) where item_id is not null;

alter table compras_devoluciones enable row level security;
alter table compras_devolucion_items enable row level security;
create policy compras_devoluciones_lectura on compras_devoluciones for select using (tiene_acceso_compras());
create policy compras_devolucion_items_lectura on compras_devolucion_items for select using (tiene_acceso_compras());
-- Sin políticas de escritura: solo por RPC (security definer).
```

- `factura_item_id` con `on delete restrict`: en una factura confirmada no se borran líneas (`compras_guardar_factura` trabaja solo sobre borradores), así que la FK no molesta. Si apareciera, el mensaje va a `CONSTRAINTS` (§5.5).
- `precio_correcto` se lee **solo desde las vistas**, que lo ocultan si no sos admin (§3.12). Un rol de Compras no registra correcciones de precio (E15), pero sí puede leer la tabla: por eso las pantallas leen la vista y no la tabla.

### 3.3 Columnas nuevas en tablas existentes

```sql
alter table compras_stock_movimientos
  add column if not exists devolucion_id uuid references compras_devoluciones(id) on delete set null;
create index if not exists idx_compras_stock_movimientos_devolucion
  on compras_stock_movimientos (devolucion_id) where devolucion_id is not null;

alter table compras_facturas
  add column if not exists nc_gasto text
    check (nc_gasto is null or nc_gasto in ('descontado', 'cancelo_gasto', 'a_favor', 'sin_gasto')),
  add column if not exists gasto_descontado numeric(14,2),
  add column if not exists gasto_forma_pago_anterior text,
  add constraint compras_facturas_nc_campos check (tipo_comprobante = 'nota_credito' or (nc_gasto is null and gasto_descontado is null)),
  add constraint compras_facturas_nc_con_origen check (tipo_comprobante <> 'nota_credito' or factura_origen_id is not null);

alter table compras_factura_discrepancias
  add column if not exists devolucion_id uuid references compras_devoluciones(id) on delete set null;
```

- `compras_facturas_nc_con_origen`: antes de crearla, verificar que en dev haya 0 NC (§1.4). Si apareciera alguna, se crea como `not valid` y se avisa al coordinador.
- `compras_facturas.gasto_id` de la NC queda **siempre null**: el gasto es de la factura. Lo de la NC se ve por `nc_gasto` y por la vista (E11). Así el unique `compras_facturas_gasto_unico` y `v_gastos` siguen igual.

### 3.4 `compras_mover_stock` suma `p_devolucion_id`

`drop function if exists public.compras_mover_stock(uuid, numeric, text, text, uuid, uuid, uuid, uuid, uuid);` y `create` con el cuerpo de `20260929120000:96-153` **idéntico** (incluida la rama de auto-curación del conteo, que A4 piensa convertir en `raise`), más:

- el parámetro `p_devolucion_id uuid default null`, al final;
- `devolucion_id` en el `insert`.

Repetir el `revoke execute … from public, anon, authenticated` con la firma nueva. Los llamadores son plpgsql y pasan como mucho 9 argumentos posicionales: siguen andando sin tocarlos. **Nota para A4:** su redefinición parte de este cuerpo.

### 3.5 Helpers internos (revocados a `public, anon, authenticated`)

1. **`_compras_devuelto(p_pedido_id uuid) returns table (item_id uuid, pedido_item_id uuid, devuelto numeric, devuelto_sin_repone numeric, devuelto_base numeric, devuelto_base_real boolean)`** (`language sql stable`).
   - Agrupa por `(item_id, pedido_item_id)` las líneas de devoluciones **activas con `devuelve_mercaderia`** del pedido.
   - `devuelto_base` = `Σ coalesce(cantidad_base, cantidad × contenido)`; `devuelto_base_real` = `bool_and(cantidad_base is not null)`.
   - Lo usan el recálculo, las diferencias, las vistas y las validaciones.
2. **`_compras_codigo_devolucion(p_numero int, p_secuencia int) returns text`** → `'D-' || lpad(p_numero::text, 4, '0') || '-' || lpad(p_secuencia::text, 2, '0')`. `immutable`.
3. **`compras_lineas_devolucion_snapshot(p_devolucion_id uuid) returns jsonb`**: el arreglo `[{item_id, pedido_item_id, descripcion, unidad, cantidad, cantidad_base}]` para los eventos, **sin precios**. Es el mismo patrón que `compras_lineas_remito_snapshot`.
4. **`_compras_exigir_sin_ajuste_factura(p_pedido_id uuid, p_item_ids uuid[], p_accion text)`**: la guarda E14. Busca una diferencia `ajusta_stock` en la factura confirmada (`tipo_comprobante = 'factura'`) del pedido para alguno de esos insumos. Si la encuentra:
   `raise exception '% ya se ajustó desde la factura (en "Diferencias con lo recibido"). Revertí ese ajuste antes de %.', descripcion, p_accion`.
5. **`_compras_crear_nota_credito(p_devolucion compras_devoluciones, p_factura compras_facturas, p_numero text, p_fecha date, p_lineas jsonb, p_total_papel numeric) returns compras_facturas`**: arma la NC (E5) y la confirma.
   - **Validaciones:**
     - número no vacío;
     - fecha no nula;
     - `p_lineas` es un arreglo con una entrada por ítem de la devolución (`{devolucion_item_id, precio_unitario, alicuota_iva}`), y todos los ids son de esa devolución;
     - `precio_unitario > 0`;
     - alícuota en (0, 2.5, 5, 10.5, 21, 27);
     - si la línea origen cobra por kg y el ítem no tiene `cantidad_base` → `'Cargá los kg devueltos de %: la factura lo cobra por kg.'`.
   - **Línea origen de un ítem:** la última línea de `p_factura` con ese `item_id` (`order by orden desc, id desc`, como el precio de referencia de A2b). Para `corrige_precio`, `factura_item_id`.
   - **Corrección de precio:** se valida `precio_correcto < precio_unitario` de la línea. La línea de la NC sale con `precio_unitario = precio_factura − precio_correcto` (lo que manda el cliente para esa línea se ignora; solo se toma su alícuota).
   - **Inserta** la cabecera (`tipo_comprobante = 'nota_credito'`, `estado = 'confirmada'`, `pedido_id`, `proveedor_id` de la factura, `factura_origen_id`, `numero`, `fecha`, `total_papel`, `creado_por`, `confirmada_en`, `confirmada_por`) y las líneas. Después recalcula `subtotal`, `iva` y `total` desde las líneas, con la misma expresión que `compras_guardar_factura`.
   - **Tope:** `total NC ≤ factura.total − Σ total de las NC confirmadas de esa factura`. Si no: `'La nota de crédito ($ %) supera lo que queda de la factura % ($ %). Revisá precios y cantidades.'`.
   - El unique de número (`compras_facturas_numero_unique`) ya existe: el mensaje va a `CONSTRAINTS` (§5.5).
6. **`_compras_nc_aplicar_gasto(p_nc_id uuid) returns jsonb`**: implementa E10 con `for update` del gasto. Escribe `nc_gasto`, `gasto_descontado` y `gasto_forma_pago_anterior` en la NC. Devuelve `{gasto, gasto_id, monto_antes, monto_despues}`.
   - **`descontado`:** `update gastos set monto = monto − v_desc, observaciones = concat_ws(E'\n', …, 'Nota de crédito N° … (D-…): −$ …')`.
   - **`cancelo_gasto`** (D4): `monto = 0`, `estado = 'Pagado'`, `fecha_pago = NC.fecha`, `pagado_por = auth.uid()`, `forma_pago = 'Nota de crédito'` (la anterior queda en `gasto_forma_pago_anterior`) y la línea en observaciones.
   - **`a_favor` / `sin_gasto`:** no toca `gastos`.
7. **`_compras_nc_revertir_gasto(p_nc_id uuid) returns jsonb`**: lo inverso.
   - **`descontado`:** si el gasto está Pendiente → `monto += gasto_descontado` + nota. Si está Pagado o Parcial: `'El gasto de la factura % ya se pagó con el descuento de esta nota de crédito: no se puede anular. Si hay que corregirlo, hablalo con la administración.'`.
   - **`cancelo_gasto`:** si `estado = 'Pagado'` y `forma_pago = 'Nota de crédito'` → `estado = 'Pendiente de pago'`, `monto += gasto_descontado`, `forma_pago = coalesce(gasto_forma_pago_anterior, config)` y `fecha_pago`, `pagado_por` y `caja` en null. Si no (alguien deshizo el pago o lo cambió): `'El gasto de la factura % cambió después de esta nota de crédito: revisalo en Gastos antes de anular.'`.
   - **Varias NC:** si el gasto está cancelado por **otra** NC (`cancelo_gasto` de otra fila activa): `'El gasto quedó cancelado por la nota de crédito N° %: anulá esa primero.'`.
   - **`a_favor` / `sin_gasto`:** nada.
   - Si el gasto ya no existe (borrado a mano), sigue sin error y lo dice en el resultado.

### 3.6 `compras_recalcular_estado_pedido` (E7, E8)

Cuerpo de `20260928190000` (§1.2) con estos cambios. Lo demás queda **igual**: la guarda de acceso, el `for update`, la facturación, el `legacy` y `cerrado_en`.

1. Después del `for update`, **guarda E7** (solo si hay devoluciones activas con mercadería en el pedido):
   ```sql
   select d.item_id, d.pedido_item_id, d.devuelto, i.nombre, i.unidad, coalesce(r.recibido, 0) as recibido
     into v_excede
   from _compras_devuelto(p_pedido_id) d
   join compras_items i on i.id = d.item_id
   left join lateral (
     select sum(ri.cantidad) as recibido
     from compras_remito_items ri join compras_remitos rm on rm.id = ri.remito_id
     where rm.pedido_id = p_pedido_id and ri.item_id = d.item_id
       and (d.pedido_item_id is null or ri.pedido_item_id = d.pedido_item_id)
   ) r on true
   where d.devuelto > coalesce(r.recibido, 0)
   limit 1;
   ```
   Además se chequea el total por insumo, sin `pedido_item_id`. Si algo excede:
   `raise exception 'De % se devolvieron % % al proveedor (%): con este cambio quedaría menos recibido que devuelto. Anulá esa devolución primero.'`, con la lista de códigos D-… de las devoluciones activas de ese insumo.
2. `if v_pedido.estado_recepcion = 'cerrado_manual'` → se conserva (ya **no** incluye `devuelto`).
3. Las líneas pasan a:
   ```sql
   select pi.id, pi.cantidad,
          coalesce(sum(ri.cantidad), 0) as recibido,
          coalesce(dv.devuelto, 0) as devuelto,
          coalesce(dv.devuelto_sin_repone, 0) as sin_repone
   …
   -- neto = recibido − devuelto; cubierto = neto + sin_repone
   ```
   - `v_cubiertas` = `count(*) filter (where cubierto >= cantidad)`;
   - `v_con_algo` = `count(*) filter (where neto > 0)`;
   - `v_neto_total` = `Σ remito_items del pedido con item_id − Σ devuelto` (todas las líneas, incluidas las libres);
   - `v_sin_repone` = `exists` de una devolución activa con mercadería y `repone = false`.
4. Regla:
   ```
   si v_lineas > 0 y v_cubiertas = v_lineas:
       si v_neto_total = 0 y v_sin_repone → 'devuelto'
       si no                              → 'recibido'
   si no, si v_con_algo > 0 o v_remitos > 0 → 'parcial'
   si no                                   → 'enviado'
   ```
   Un pedido que tuvo remitos y se devolvió todo con reposición queda `parcial` (tiene remitos), que es lo correcto: espera la reposición.
5. **`legacy`:** `devuelto → 'cerrado'`, como hoy.

### 3.7 Diferencias (E12)

**`compras_diferencias_calculadas`:** `drop` + `create`, porque cambia el retorno. Parte de `20261005180000:1505-1571` y suma al final del `returns table` las columnas `devuelta numeric, acreditada numeric`.

- `recibido`: a `Σ remitos` le resta `_compras_devuelto(f.pedido_id)` agrupado por `item_id`. La base hace lo mismo con `devuelto_base`, y `base_real` es el `and` de los dos.
- `facturado`: le resta las líneas con `item_id` de las NC confirmadas cuyo `factura_origen_id = p_factura_id`. La base = `Σ coalesce(cantidad_base, cantidad × contenido)` de esas líneas.
- `devuelta` = lo devuelto con mercadería; `acreditada` = la cantidad de las NC.
- Un insumo que **solo** aparece en una devolución o una NC (sin factura ni remito) no puede existir: la devolución exige recibido o facturado.
- Sigue revocada.

**`compras_recalcular_diferencias_factura` no se toca.** Lee `clave`, `recibida`, `facturada`, `pedido_item_id`, `descripcion` y `unidad` por nombre. Se verifica en el escenario S1 (§9.2) que compila contra la función nueva.

Los casos, con factura 10 y remitos 10 salvo que se diga otra cosa:

| Caso | recibida | facturada | Diferencia |
|---|---|---|---|
| Mal estado 2, **no repone**, sin NC | 8 | 10 | +2 → `reclamo_proveedor` "esperando NC" (E13) |
| … llega la NC de 2 | 8 | 8 | 0 → se borra |
| Mal estado 2, **repone**, sin reposición todavía | 8 | 10 | +2, con la recepción incompleta → "Pendiente de llegar" |
| … llega el remito de reposición (+2) | 10 | 10 | 0 |
| Remitos 12, factura 10 (llegó de más, −2) → "Cantidad de más" 2, no repone | 10 | 10 | 0 |
| Remitos 8, cerrado a mano (+2) → "Facturado y no entregado" 2 + NC 2 | 8 | 8 | 0 |
| Precio mal facturado + NC (línea sin insumo) | 10 | 10 | 0 (no cambia) |

**`v_compras_factura_diferencias`:** `create or replace` con el cuerpo de `20261005180000:1618-1650`. Los laterales de kg (`fa`, `re`) restan las NC y las devoluciones con la misma regla que la función. Se suman al final:

- `devuelta`, `acreditada` (laterales con la misma regla);
- `devolucion_id` (`d.devolucion_id`);
- `devolucion_codigo` (`_compras_codigo_devolucion`).

**Ojo con A2b (desvío 1 de sus notas):** la vista **no** puede llamar a `_compras_devuelto` si esa función está revocada a `authenticated`, porque el `EXECUTE` se chequea contra quien consulta. Dos caminos: hacer los laterales inline o dejar `_compras_devuelto` con `grant execute … to authenticated` (solo lee devoluciones, que el mismo rol ya ve por RLS). **Se recomienda inline** en todas las vistas, para no abrir funciones. El recálculo y las RPC (security definer) sí usan el helper.

### 3.8 RPC `compras_registrar_devolucion`

```
compras_registrar_devolucion(
  p_pedido_id uuid default null,
  p_motivo_id uuid default null,
  p_repone boolean default false,
  p_items jsonb default '[]',            -- [{pedido_item_id?, item_id?, factura_item_id?, cantidad, cantidad_base?, precio_correcto?}]
  p_nota text default null,
  p_nota_credito jsonb default null,     -- {numero, fecha, total_papel?, lineas: [{indice, precio_unitario, alicuota_iva}]}
  p_diferencia_id uuid default null      -- si viene desde "Reclamo al proveedor"
) returns jsonb
```

`lineas[].indice` es la posición del ítem en `p_items`: los ids todavía no existen. Internamente se mapea a `devolucion_item_id` antes de llamar a `_compras_crear_nota_credito`.

**Pasos (E17 = orden de bloqueo):**

1. **Acceso.** Sin `tiene_acceso_compras()` → `'No autorizado'`. Motivo activo (si no: `'Ese motivo ya no está disponible. Recargá la página.'`). Si el motivo no saca mercadería o viene `p_nota_credito`, y no sos admin → `'Solo un administrador puede registrar devoluciones que corrigen la factura o cargar notas de crédito.'`.
2. **`p_items`:** un arreglo no vacío, cantidades > 0 y kg > 0 si vienen.
3. **Bloqueos y estado.** `select … from compras_pedidos where id = p_pedido_id for update`.
   - Pedido `sin_enviar` → `'El pedido % todavía no se envió: no hay nada para devolver.'`.
   - La factura activa del pedido (`tipo_comprobante = 'factura'`, `estado = 'confirmada'`) va `for update` si existe.
   - Sin mercadería y sin factura → `'Esta devolución corrige la factura, y el pedido % todavía no tiene una confirmada. Cargala primero.'`.
   - `p_repone` y el motivo no saca mercadería → se fuerza `false`.
   - `p_repone` en `cerrado_manual` → el mensaje de E9.
   - `p_repone` con `p_nota_credito` → `'Si el proveedor repone, no hay nota de crédito: la reposición ya está facturada. Elegí "No repone" para cargar la nota.'`.
   - `p_nota_credito` sin factura confirmada → `'Para cargar la nota de crédito, primero confirmá la factura del pedido.'`.
4. **Resolver cada ítem.**
   - **Con mercadería:** `item_id` obligatorio. Si viene `pedido_item_id`, tiene que ser del pedido y del mismo insumo. Si no viene y el pedido tiene exactamente una línea de ese insumo, se usa esa. Máximo por insumo: `Σ remitos − Σ devuelto activo (mercadería)`; y por `pedido_item_id`, si lo tiene, lo mismo sobre esa línea. Error: `'De % llegaron % % y ya se devolvieron %: como mucho podés devolver % %.'`. Las cantidades del lote se suman por insumo antes de comparar (dos líneas del mismo insumo en el mismo `p_items`).
   - **Facturado y no entregado:** `item_id` obligatorio y que esté en la factura. Máximo: `facturado − acreditado por NC − Σ devoluciones activas sin mercadería ni precio, sin NC, de ese insumo`. Error: `'De % se facturaron % % y ya se reclamaron %: como mucho % %.'`.
   - **Precio:** `factura_item_id` obligatorio (una línea de la factura activa con `precio_unitario > 0`). `cantidad ≤` la cantidad de la línea (o sus kg si cobra por kg). `precio_correcto` obligatorio y `< precio_unitario`. El ítem copia `item_id`, `pedido_item_id`, la descripción y la unidad de la línea.
   - La descripción y la unidad salen de `compras_items` (o de la línea), **nunca del cliente**.
5. **Guarda R3:** `_compras_exigir_sin_ajuste_factura(pedido, items, 'registrar la devolución')`.
6. **Alta.**
   - Secuencia: `update compras_pedidos set ultima_secuencia_devolucion = greatest(ultima_secuencia_devolucion, (select coalesce(max(secuencia),0) …)) + 1 … returning`.
   - Se inserta la devolución con la foto del motivo y `factura_id` = la factura activa (o null). Después, los ítems con `orden`.
7. **Stock** (solo con mercadería), por cada insumo (suma de sus ítems):
   `compras_mover_stock(item, −cantidad, 'devolucion_proveedor', 'Devolución ' || codigo || ' a ' || proveedor || ': ' || motivo || coalesce(' (' || kg || ' kg)', ''), null, null, null, factura_id, null, devolucion_id)`.
   Se arma `impacto[]` `{item_id, nombre, unidad, delta, cantidad_despues}`, como en los remitos. Si el stock queda negativo, se deja pasar: la UI ya lo avisó en ámbar.
8. **NC** (si vino): `_compras_crear_nota_credito` → `update compras_devoluciones set nota_credito_id = …` → `_compras_nc_aplicar_gasto`.
9. **Evento** `devolucion_registrada`: `{devolucion_id, secuencia, motivo, devuelve_mercaderia, corrige_precio, repone, nota, lineas: snapshot}`.
10. **Recálculos.** `compras_recalcular_estado_pedido(pedido)`, que incluye la guarda E7, y `compras_recalcular_diferencias_factura(factura activa)` si existe.
11. **E13:** si no hay NC, `not repone` y existe factura activa:
    ```sql
    update compras_factura_discrepancias
      set resolucion = 'reclamo_proveedor', devolucion_id = v_dev.id,
          nota = 'Esperando la nota de crédito de ' || codigo, resuelto_por = auth.uid(), resuelto_en = now(), updated_at = now()
      where factura_id = v_factura.id and resolucion in ('pendiente', 'reclamo_proveedor')
        and item_id = any(items) and diferencia > 0;
    ```
    Con `p_diferencia_id`, además se valida que sea de esa factura y que su `item_id` esté entre los ítems (si no: `'Esa diferencia es de otro insumo. Recargá la página.'`).
12. **`return`:** `{id, codigo, impacto, estado_recepcion, nota_credito: {id, numero, total, gasto, monto_antes, monto_despues} | null, diferencias_pendientes}`.

### 3.9 RPC `compras_cargar_nota_credito` (D3)

```
compras_cargar_nota_credito(p_devolucion_id uuid default null, p_numero text default null, p_fecha date default null,
                            p_lineas jsonb default '[]', p_total_papel numeric default null) returns jsonb
```

- Solo admin.
- Bloqueos: pedido → factura activa → devolución (`for update`).
- Validaciones:
  - la devolución está activa (`'Esa devolución está anulada.'`), sin NC (`'Esa devolución ya tiene su nota de crédito: N° %.'`) y sin reposición (`'La devolución % es con reposición: no lleva nota de crédito.'`);
  - el pedido tiene factura confirmada.
- Guarda R3 con `'cargar la nota de crédito'`.
- `_compras_crear_nota_credito` (con `p_lineas` por `devolucion_item_id`) → `update compras_devoluciones set nota_credito_id = …, factura_id = coalesce(factura_id, v_factura.id)` → `_compras_nc_aplicar_gasto`.
- Recalcula las diferencias.
- `return {nota_credito: {...}, diferencias_pendientes}`.

### 3.10 RPC `compras_anular_nota_credito` (E19) y `compras_anular_devolucion` (D4)

**`compras_anular_nota_credito(p_devolucion_id uuid default null, p_motivo text default null) returns jsonb`:**

- Solo admin; el motivo es obligatorio.
- Bloqueos: pedido → factura origen → NC → gasto.
- La NC tiene que estar confirmada.
- Guarda R3 con `'anular la nota de crédito'`.
- `_compras_nc_revertir_gasto`. Si falla, no se anula nada.
- `update compras_facturas set estado = 'anulada', anulada_en, anulada_por, anulada_motivo` sobre la NC.
- `update compras_devoluciones set nota_credito_id = null`. **La devolución queda esperando NC.**
- Recalcula las diferencias y aplica E13 de nuevo para esa devolución (vuelve a "esperando NC").
- `return {gasto, monto_antes, monto_despues}`.

**`compras_anular_devolucion(p_devolucion_id uuid default null, p_motivo text default null) returns jsonb`:**

- Acceso según E15. Sin NC activa: `tiene_acceso_compras()`. Con NC activa: admin (`'Esta devolución tiene nota de crédito: la anula un administrador.'`).
- El motivo es obligatorio (`'Contá por qué anulás la devolución: queda en el historial.'`).
- Bloqueos: pedido → factura → NC → gasto → devolución. Si ya está anulada: `'Esa devolución ya está anulada. Recargá la página.'`.
- Guarda R3 con `'anular la devolución'`.
- Si tiene NC activa: el mismo bloque que `compras_anular_nota_credito` (revertir el gasto + anular la NC), en la misma transacción.
- **Stock:** por cada movimiento `devolucion_proveedor` de la devolución, `compras_mover_stock(item, −delta, 'reversion', 'Se anuló la devolución ' || codigo || ': ' || motivo, null, null, mov.id, factura_id, null, devolucion_id)`. El unique `compras_stock_movimientos_anula_unico` impide revertir dos veces.
- `update compras_devoluciones set estado = 'anulada', anulada_*`.
- `update compras_factura_discrepancias set devolucion_id = null where devolucion_id = …`: el recálculo decide si vuelven a pendiente o desaparecen.
- Evento `devolucion_anulada`: `{devolucion_id, secuencia, motivo_anulacion, lineas, tenia_nota_credito}`.
- Recálculos (estado y diferencias).
- `return {impacto, estado_recepcion, nota_credito_anulada: bool, gasto, monto_despues}`.

### 3.11 `compras_anular_factura` (heredada de A2b; E18)

Cuerpo de `20261005180000:1376-1494` **completo**, incluidos el evento `remito_eliminado` y el snapshot de A2b. Después de bloquear la factura, se agregan:

```sql
if v_factura.tipo_comprobante = 'nota_credito' then
  raise exception 'Una nota de crédito se anula desde su devolución, en el detalle del pedido.';
end if;
if exists (select 1 from compras_facturas nc
           where nc.factura_origen_id = v_factura.id and nc.estado = 'confirmada') then
  raise exception 'Esta factura tiene notas de crédito (%). Anulalas desde sus devoluciones antes de anular la factura.', <lista "N° x (D-…)">;
end if;
if exists (select 1 from compras_devoluciones d
           where d.factura_id = v_factura.id and d.estado = 'activa' and not d.devuelve_mercaderia) then
  raise exception 'La devolución % corrige esta factura. Anulala antes de anular la factura.', <código>;
end if;
```

Las devoluciones activas **con** mercadería no frenan por sí mismas. Pero si la factura generó el remito automático y se devolvió mercadería de ese remito, el recálculo del final dispara la guarda E7 y revierte todo con el mensaje "Anulá esa devolución primero". Hay un escenario para esto (S12).

### 3.12 Vistas

Todas con `create or replace` y las columnas nuevas **al final**. Postgres no deja cambiar el orden ni el tipo de las existentes; sí la expresión con el mismo nombre y tipo.

1. **`v_compras_devoluciones`** (nueva), `where tiene_acceso_compras()`:
   - de la devolución: `d.id, d.pedido_id, ped.numero as pedido_numero, d.secuencia, codigo, ped.proveedor_id, pr.nombre as proveedor_nombre, d.factura_id, d.motivo_id, d.motivo_nombre, d.devuelve_mercaderia, d.corrige_precio, d.repone, d.nota, d.estado, d.created_at, creado_por_nombre, d.anulada_en, anulada_por_nombre, d.anulada_motivo`;
   - `lineas jsonb`: `[{id, pedido_item_id, item_id, factura_item_id, descripcion, unidad, cantidad, cantidad_base, precio_correcto: case when es_admin() then … end}]`, ordenado;
   - `d.nota_credito_id` (el id no es sensible);
   - solo admin (`case when es_admin()`): `nc_numero, nc_fecha, nc_total, nc_estado, nc_gasto, nc_gasto_descontado, factura_numero`;
   - `espera_nota_credito boolean` = activa, sin reposición, sin NC y `(d.factura_id is not null or el pedido tiene factura confirmada)`.
   - `grant select … to authenticated`.
2. **`v_compras_pedido_pendiente`** (cuerpo de `20261005180000:1580-1610`):
   - `pendiente` → `greatest(pi.cantidad − (recibido − devuelto + devuelto_sin_repone), 0)`;
   - `excedente` → `greatest((recibido − devuelto + devuelto_sin_repone) − pi.cantidad, 0)`;
   - se suman al final `devuelto`, `devuelto_sin_repone` y `devuelto_base`, con un lateral inline por `pedido_item_id`.
   - `recibido` sigue siendo lo que llegó en los remitos (el "llegó" de la pantalla).
   - **Consumidores que hay que revisar:** `pedidos/page.tsx`, `facturas/page.tsx`, `remitos/page.tsx`, `PedidoEnvio.tsx`, `remitos/modelo.ts` y `facturas/modelo.ts` (§5.4, §8).
3. **`v_compras_facturas`** (cuerpo de `20260929120000:1058-1082`, más `left join compras_facturas fo on fo.id = f.factura_origen_id left join gastos go on go.id = fo.gasto_id`):
   - `gasto_id` → `coalesce(f.gasto_id, fo.gasto_id)`, `gasto_estado` → `coalesce(g.estado, go.estado)` y `gasto_local` → `coalesce(g.local, go.local)` (E11);
   - al final: `factura_origen_id`, `factura_origen_numero` (`fo.numero`), `nc_gasto`, `gasto_descontado`, `gasto_monto` (`coalesce(g.monto, go.monto)`), `devolucion_id`, `devolucion_codigo` (la devolución con `nota_credito_id = f.id`) y `notas_credito_total` (Σ de las NC confirmadas con `factura_origen_id = f.id`; 0 si no hay).
4. **`v_compras_factura_diferencias`**: §3.7.
5. **`v_compras_pedido_eventos`**: `drop view` + `create view`, como hizo B1 (cuerpo de `20261005140000:621-660`), con:
   - la rama `factura_anulada` + `and f.tipo_comprobante = 'factura'` (§1.3.2);
   - la rama nueva `nota_credito`: `select f.id, f.pedido_id, 'nota_credito', f.confirmada_en, f.confirmada_por, pr.nombre, jsonb_build_object('factura_id', f.id, 'numero', f.numero, 'total', f.total, 'factura_origen_id', f.factura_origen_id, 'devolucion_id', d.id, 'secuencia', d.secuencia, 'gasto', f.nc_gasto) … where f.tipo_comprobante = 'nota_credito' and f.confirmada_en is not null and es_admin()`;
   - la rama nueva `nota_credito_anulada`: lo mismo con `anulada_en`, `anulada_por` y `'motivo', f.anulada_motivo`.
   - `grant select … to authenticated`.
   - Antes del `drop`, `pg_depend`: confirmar que no hay vistas que dependan de esta (B1 lo verificó; repetirlo).

### 3.13 Eventos: tipos nuevos

```sql
alter table compras_pedido_eventos drop constraint compras_pedido_eventos_tipo_check;
alter table compras_pedido_eventos add constraint compras_pedido_eventos_tipo_check check (tipo in (
  'creado', 'items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje',
  'enviado', 'reenviado', 'cerrado', 'reabierto',
  'remito_creado', 'remito_editado', 'remito_eliminado',
  'devolucion_registrada', 'devolucion_anulada'   -- B4
));
```

Antes, `select distinct tipo from compras_pedido_eventos` en dev: tiene que ser un subconjunto de la lista (si no, el `add constraint` falla y el lote lo muestra).

### 3.14 Grants

- `revoke execute … from public, anon` + `grant execute … to authenticated` en las 4 RPC: `compras_registrar_devolucion`, `compras_cargar_nota_credito`, `compras_anular_nota_credito` y `compras_anular_devolucion`.
- Se repite lo mismo para `compras_anular_factura`.
- `revoke execute … from public, anon, authenticated` en `compras_mover_stock` (firma nueva), `_compras_devuelto`, `_compras_exigir_sin_ajuste_factura`, `_compras_crear_nota_credito`, `_compras_nc_aplicar_gasto`, `_compras_nc_revertir_gasto`, `compras_lineas_devolucion_snapshot` y `compras_diferencias_calculadas`.
- `_compras_codigo_devolucion` es `immutable` y no lee tablas: se le puede dar `grant` a `authenticated` para usarla en las vistas.

### 3.15 Después de la migración

- `npm run types`. Tiene que traer **solo** lo de B4: las 3 tablas nuevas, las columnas, las 4 RPC y las vistas. Si trae algo más, alguien pusheó en el medio: avisar al coordinador.
- El invariante del ledger tiene que dar 0 (§9.1).

## 4. Server Actions: `app/admin/compras/pedidos/devoluciones/acciones.ts` (nuevo, `'use server'`)

Mismo patrón que `remitos/acciones.ts` y `facturas/acciones.ts`: zod + `rpc` + `refresh()` de `next/cache` → `Resultado<T>` (`lib/acciones.ts`), sin `throw` a través del borde. **Antes de escribirla, leé `node_modules/next/dist/docs/` (Server Functions y `refresh`)**, como pide `AGENTS.md`.

| Acción | RPC | Entrada (zod) | Devuelve |
|---|---|---|---|
| `registrarDevolucion` | `compras_registrar_devolucion` | `pedidoId`, `motivoId`, `repone`, `items[]` (`cantidad > 0`, `cantidadBase?` > 0, `precioCorrecto?` ≥ 0), `nota?` (≤ 500), `notaCredito?` `{numero (1–40), fecha (yyyy-mm-dd), totalPapel?, lineas[{indice, precioUnitario > 0, alicuotaIva ∈ ALICUOTAS}]}`, `diferenciaId?` | `{ id, codigo, impacto, estadoRecepcion, notaCredito }` |
| `cargarNotaCredito` | `compras_cargar_nota_credito` | `devolucionId`, `numero`, `fecha`, `totalPapel?`, `lineas[{devolucionItemId, precioUnitario, alicuotaIva}]` | `{ notaCredito, diferenciasPendientes }` |
| `anularNotaCredito` | `compras_anular_nota_credito` | `devolucionId`, `motivo` (1–300) | `{ gasto, montoDespues }` |
| `anularDevolucion` | `compras_anular_devolucion` | `devolucionId`, `motivo` (1–300) | `{ impacto, estadoRecepcion, notaCreditoAnulada, gasto }` |

- Los errores pasan por `mensajeError` (§5.5). El `raise` nuestro (P0001) ya llega como texto para el usuario.
- La acción no decide permisos: los decide la RPC. La UI esconde lo que no corresponde (E15).

## 5. Lógica pura (sin I/O; se chequea con `npx tsx`)

### 5.1 `lib/compras/devoluciones.ts` (nuevo) + `lib/compras/_check_devoluciones.ts`

- `type EfectoMotivo = 'mercaderia' | 'no_entregado' | 'precio'` y `efectoDeMotivo({devuelve_mercaderia, corrige_precio})`. La UI piensa en efectos y la base en flags.
- `TEXTO_EFECTO`: `mercaderia` → "Sale del stock y vuelve al proveedor" · `no_entregado` → "No mueve stock: corrige lo que te facturaron de más" · `precio` → "No mueve stock: corrige el precio cobrado".
- `lineasDevolvibles(pedido, pendiente, devoluciones, factura?)` → por insumo/línea: `{ key, pedidoItemId, itemId, descripcion, unidad, cobraPorBase, llego, devuelto, maximo, facturado, acreditado, maximoNoEntregado }`. Replica las reglas de §3.8.4 para mostrar el máximo antes de mandar. **La RPC vuelve a validar.**
- `lineasPrecio(factura)` → líneas de la factura con `precio_unitario > 0`, con la cantidad cobrada en su unidad (kg si `precio_por = 'base'`).
- `armarNotaCredito(items, factura, efecto, preciosEditados)` → líneas `{descripcion, cantidad, cantidadBase, precioUnitario, precioPor, alicuotaIva, subtotal, iva}`, con la misma regla que `_compras_crear_nota_credito` (E5), y los totales con `lib/compras/totalesFactura.ts`. **Tiene que dar el mismo total que la RPC:** hay un caso del check por cada efecto, y uno por kg.
- `impactoGasto({ gastoId, gastoEstado, gastoMonto, totalNc })` → `{ caso: 'descontado'|'cancelo_gasto'|'a_favor'|'sin_gasto', texto, montoDespues }`. Los textos:
  - descontado: "El gasto pendiente de la factura {N} baja de $ X a $ Y."
  - cancelo_gasto: "La nota de crédito cubre todo el gasto: queda en $ 0 y se marca como pagado con la nota de crédito."
  - a_favor (D5): "El gasto ya está pagado: estos $ X quedan a favor. Se verán en la cuenta corriente del proveedor (noviembre); por ahora figuran como «A favor» en la Cuenta del proveedor."
  - sin_gasto: "La factura no tiene gasto: la nota de crédito resta en los reportes."
- `impactoEstado(entrada, devolucion)` → el estado visible en que queda el pedido ("Queda Devuelto", "Vuelve a Parcialmente recibido: espera la reposición", "Sigue Facturado"). Reusa `estadoVisible` con la regla E8 aplicada en TS (`estadoRecepcionConDevolucion`, que replica §3.6 y se chequea contra los mismos casos que el escenario SQL).
- `textoLineaDevolucion(l)` → "Queso Barra 2 Caja (33,4 kg)". Usa `textoBaseItem` de `lib/compras/unidades.ts`, de A2b.
- `sugerenciaDesdeDiferencia(dif, motivos)` → `{ motivoId, cantidad, notaCredito: boolean }`:
  - `diferencia > 0` → el primer motivo activo con efecto `no_entregado`, la cantidad `diferencia` y la NC sugerida;
  - `diferencia < 0` → el primer motivo activo con efecto `mercaderia`, `|diferencia|`, "no repone" y sin NC.
  Se elige por flags, nunca por nombre.
- `codigoDevolucion` va en `lib/compras/codigos.ts` (junto a `codigoRemito`).
- **Check:** ≥ 30 casos, entre ellos todos los de la tabla de §3.7, los máximos, los 4 casos de gasto, el redondeo de la NC por kg (33,4 kg × $ 1.250 = $ 41.750 + IVA 21 % = $ 8.767,50) y la corrección de precio (33,4 × $ 50 = $ 1.670).

### 5.2 `lib/compras/estadoPedido.ts`

- `hayDevolucion` deja de ser siempre `false`: lo arma la página con las devoluciones activas del pedido.
- Entrada nueva opcional: `devolucionEsperaNc?: { id: string; codigo: string } | null` (la primera devolución con `espera_nota_credito`).
- `proximaAccion`:
  - nuevo `TipoAccion` **`'cargar_nota_credito'`**. En `facturado` con la recepción completa, **sin diferencias pendientes** y con `devolucionEsperaNc` y `puedeFacturar`: título "Falta la nota de crédito", descripción "Se devolvió mercadería de este pedido (D-…) y el proveedor todavía no mandó la nota de crédito.", botón "Cargar nota de crédito";
  - "Resolver diferencias" sigue ganando si hay pendientes, y "falta recibir" gana a todo;
  - `devuelto` → título "Devuelto", descripción "Se devolvió todo lo que llegó y el proveedor no repone." + (si `devolucionEsperaNc`) " Falta cargar la nota de crédito.", con el mismo botón para admin.
- `subtextoEstado` sigue igual ("con devolución"). Agrega "esperando nota de crédito" cuando `devolucionEsperaNc` y quien mira es admin.
- `_check_estado.ts`: +8 casos (devuelto con y sin NC, facturado esperando NC, diferencias que ganan, parcial con reposición).

### 5.3 `lib/compras/reportes.ts` (B3 → B4)

- `EstadoPago` suma **`'a_favor'`**. `estadoPago(f)` recibe `tipo_comprobante` y `nc_gasto` (opcionales, para no romper a quien no los pasa): una NC con `nc_gasto = 'a_favor'` → `'a_favor'`; el resto, como hoy (con el `gasto_estado` heredado de la factura origen, E11).
- `ResumenPagos` suma `aFavor`. `resumirPagos` lo acumula (con signo, así que queda negativo). El comentario del invariante pasa a `facturado = pagado + pendiente + sinGasto + aFavor`.
- `GastoProveedor` suma `aFavor`.
- `FacturaReporte` suma `nc_gasto: string | null`.
- `_check_reportes.ts`: +6 casos (los 4 de E10, y los dos de "factura pendiente → NC descontada → se paga").

### 5.4 Otros archivos puros que cambian

- **`lib/compras/historialPedido.ts`:**
  - tipos nuevos `devolucion_registrada`, `devolucion_anulada`, `nota_credito` y `nota_credito_anulada`, con zod para el `detalle` (si viene mal, solo la etiqueta, como hoy);
  - títulos e íconos (`Undo2`, `Ban`, `ReceiptText`):
    - "Devolvió mercadería al proveedor · D-0037-01 · Mercadería en mal estado · El proveedor repone"
    - "Registró un reclamo a la factura · D-0037-02 · Facturado y no entregado"
    - "Anuló la devolución D-0037-01 · Motivo: …"
    - "Nota de crédito N° 0001-00000123 · $ 50.517,50 · descontada del gasto" (admin)
    - "Anuló la nota de crédito N° …"
  - el agrupado de 5 minutos no cambia;
  - `_check_historial.ts` +6.
- **`lib/compras/diferencias.ts`:**
  - el texto de la diferencia, cuando `devuelta > 0` o `acreditada > 0`: "Llegaron 10 Caja, se devolvieron 2: quedaron 8 · la factura dice 10 (8 con la nota de crédito)";
  - en las resueltas como reclamo con `devolucion_id`: "Esperando la nota de crédito de D-0037-01";
  - `accionDevolucion(d)` → si se ofrece "Registrar devolución": `resolucion = 'reclamo_proveedor'` y sin `devolucion_id`, con la recepción completa;
  - `_check_diferencias.ts` +5.
- **`lib/compras/rutas.ts`:** `TipoEntidad` suma `'devolucion'`. `Entidad` suma `{ tipo: 'devolucion'; id: string; pedidoId: string }` → `/admin/compras/pedidos?pedido=<pedidoId>&devolucion=<id>`. El módulo para `LinkEntidad` es `compras-pedidos` (en `lib/modulos.tsx`, donde B0 dejó la regla de acceso).
- **`app/admin/compras/pedidos/facturas/modelo.ts`** (prellenado de una factura nueva):
  - la cantidad prellenada pasa a `recibido − devuelto` (de `v_compras_pedido_pendiente`), así lo devuelto antes de facturar (D1) no se prellena;
  - si `devuelto > 0`, la línea muestra "Se descontaron 2 devueltas (D-…)";
  - `_check_modelo.ts` +2.
- **`app/admin/compras/pedidos/remitos/modelo.ts`:** si prellena con `pendiente`, ya toma la reposición sin cambios (la columna cambió en la vista). Verificarlo y sumar 1 caso al check.

### 5.5 `lib/errores.ts` (`CONSTRAINTS`)

| Constraint | Mensaje |
|---|---|
| `compras_devolucion_motivos_nombre_unico` | Ya hay un motivo con ese nombre. |
| `compras_devolucion_motivos_flags_validos` | Un motivo que devuelve mercadería no puede ser a la vez una corrección de precio. |
| `compras_devoluciones_motivo_id_fkey` | Ese motivo ya se usó en devoluciones: desactivalo en vez de borrarlo. |
| `compras_devoluciones_pedido_secuencia_key` | Otra persona registró una devolución de este pedido al mismo tiempo. Probá de nuevo. |
| `compras_devoluciones_nc_unica` | Esa nota de crédito ya está asociada a otra devolución. Recargá la página. |
| `compras_facturas_numero_unique` (ya existe) | se mantiene, y la acción lo traduce a "Ya cargaste una nota de crédito con ese número para este proveedor." cuando el `tipo` es NC (lo decide la acción, que sabe qué estaba guardando) |
| `compras_devolucion_items_factura_item_id_fkey` | Esa línea de la factura tiene una corrección de precio registrada: anulá esa devolución primero. |

## 6. UI

### 6.0 Protocolo de diseño (obligatorio: es el Definition of Done)

Lo dice el plan del Bloque 1 ("Protocolo de UX y diseño por fase") y lo repite el protocolo del Bloque 2. A1, B1 y F5 lo hicieron a mano, y quedó como deuda. **En B4 se invocan las skills de verdad**, porque es la pantalla con más plata y stock en juego:

1. **`impeccable` en modo *shape*, antes de codear.** Se le pasan §0, las filas D1–D5 + los casos borde de §7 y las primitivas de §6.0.1. La mini-spec que devuelva va a `notas-B4.md` y manda sobre lo de abajo en lo visual (no en las reglas).
2. **`emil-design-eng`** para el modal de pasos, el cambio de estado de la fila de devolución y los toasts.
3. Construir.
4. **`impeccable` *harden*** (doble clic, textos largos, 0 motivos, permisos, sin factura) + **`emil-design-eng`** (foco, transiciones, números alineados).
5. **Capturas** a 375 px y desktop, en oscuro y claro, revisadas contra **`ui-ux-pro-max`** (contraste, ≥ 44 px, jerarquía).
6. **`code-review`** en nivel medium sobre el diff, antes del último commit.

#### 6.0.1 Primitivas

`Modal` (xl en desktop; pantalla completa con pie sticky en mobile), `Field`/`controlClass`, `InputNumero` (nunca `type="number"`), `DatePicker` (nunca `<input type="date">`), `Chip`/`SegmentedControl`, `EstadoBadge` + `lib/estados.ts`, `EmptyState`, `Skeleton`, `useToast()`, `useConfirmar()`/`ConfirmDialog`, `HelpTooltip`, `LinkEntidad`, `useParamDeepLink`/`useQuitarParams`, íconos lucide, tokens semánticos (**sin hex**) y `formatearMoneda`/`formatearMonedaExacta`.

Prohibido: `confirm()`/`alert()`, `router.push` después de una acción y la columna "editar".

### 6.1 Motivos: pestaña "Motivos de devolución al proveedor" en Proveedores

- `app/admin/proveedores/layout.tsx`: cuarto ítem de `Tabs`, `{ href: '/admin/proveedores/motivos-devolucion', label: 'Motivos de devolución', icon: <Undo2 size={14} /> }`. En la pestaña dice "Motivos de devolución"; el título de la página dice "al proveedor" (§1.3.6).
- `app/admin/proveedores/motivos-devolucion/page.tsx` (nuevo) con `TablaMaestra`:
  - título "Motivos de devolución al proveedor";
  - descripción "Al registrar una devolución, el motivo decide si la mercadería sale del stock o si solo se corrige la factura. Cambiar un motivo no cambia las devoluciones ya registradas.";
  - `camposExtra = [{ key: 'efecto', tipo: 'select', label: 'Qué pasa', opciones: [mercaderia, no_entregado, precio] }]`, con los textos de `TEXTO_EFECTO`;
  - `resumenFila` → un chip del efecto.
- `app/api/compras-devolucion-motivos/route.ts` (nuevo, copia de `fabrica-devolucion-motivos`):
  - `GET` agrega `efecto` desde los flags;
  - `POST` y `PATCH` traducen `efecto` → `devuelve_mercaderia` + `corrige_precio` (cualquier otro campo, 400);
  - `DELETE` → si da la FK, el mensaje de §5.5 (`errorResponse` con el código `23503` → 409).
  - Escrituras con `requireAdmin`.
- Si `TablaMaestra` todavía tiene hex propios, no se arregla en B4 (es compartido): se anota en las notas.

### 6.2 `DevolucionModal.tsx` (registrar)

Se abre desde (a) el **detalle del pedido**, (b) la **factura confirmada** y (c) una **diferencia** resuelta como reclamo. Recibe `pedido`, `pendiente`, `devoluciones`, `factura?`, `diferencia?`, `motivos`, `esAdmin` y `stockPorItem`.

```
┌ Registrar devolución · P-0037 · GLOBAL ───────────────────────── ✕ ┐
│ 1 Motivo                                                          │
│  ( ) Mercadería en mal estado      Sale del stock                 │
│  ( ) Producto equivocado           Sale del stock                 │
│  ( ) Facturado y no entregado      Corrige la factura   [admin]   │
│  ( ) Precio mal facturado          Corrige el precio    [admin]   │
│ 2 Qué se devuelve                                [Devolver todo]  │
│  Insumo         Llegó     Ya devuelto   Devolver      kg reales    │
│  Queso Barra    2 Caja    —             [ 1    ] Caja [16,4 ] kg   │
│  Fécula         3 Bolsa   —             [      ] Bolsa             │
│  máx. 2 Caja · queda en 181 Caja en stock                          │
│ 3 ¿El proveedor repone?  (solo si sale del stock)                  │
│  [ Sí, repone ]  Vuelve a quedar pendiente de llegar en el pedido. │
│  [ No repone  ]  Esa cantidad se cierra. Si estaba facturada,      │
│                  falta la nota de crédito.                         │
│ 4 Nota de crédito  (admin · factura confirmada · no repone)        │
│  [x] Ya llegó la nota de crédito                                   │
│  N° [0001-00000123]  Fecha [06/10/2026]                            │
│  Queso Barra  16,4 kg × $ 1.250,00 /kg  IVA [21 ▾]  $ 20.500,00    │
│  Subtotal $ 20.500 · IVA $ 4.305 · Total $ 24.805                  │
│  Total según el papel [        ]                                   │
│ Nota [ opcional                                              ]     │
├────────────────────────────────────────────────────────────────────┤
│ Resta 1 Caja de Queso Barra (queda en 181). El pedido vuelve a     │
│ Parcialmente recibido. El gasto pendiente baja de $ 59.411 a       │
│ $ 34.606.                         [Cancelar]  [Registrar devolución]│
└────────────────────────────────────────────────────────────────────┘
```

- **Paso 1:** opciones grandes (radio cards, como "¿Ya llegó la mercadería?" de F4), agrupadas en "Sale del stock" y "Corrige la factura". Un no admin solo ve las de mercadería. Las de "Corrige la factura" aparecen deshabilitadas si no hay factura confirmada, con la ayuda "Primero confirmá la factura del pedido".
- **Paso 2** cambia según el efecto:
  - **mercadería:** las filas de `lineasDevolvibles` con `llego > 0`;
  - **no entregado:** las filas facturadas, con "Facturado / Ya reclamado / Máx.";
  - **precio:** las líneas de la factura, con "Cobrado $ 1.300 /kg → Correcto [ ]" y la cantidad (prellenada con todo lo cobrado).
  - La columna "kg reales" solo aparece en los insumos que se cobran por kg. Lleva el placeholder nominal y el aviso del 10 % de A2b; si hay NC y la línea cobra por kg, es obligatoria.
  - Pasarse del máximo → error en la celda, sin mandar. Si el stock va a quedar negativo, se avisa en ámbar sin bloquear.
- **Paso 3:** solo si el efecto es mercadería. "Sí, repone" se deshabilita en un pedido cerrado a mano (con el texto de E9) y si el paso 4 está marcado (con el texto de E6).
- **Paso 4:** solo admin, con factura confirmada y sin reposición. Si el switch está apagado: "La nota de crédito se puede cargar después, desde la devolución." Las líneas vienen de `armarNotaCredito`: precio y alícuota editables; la variación contra la factura se muestra como en FA4 ("↓ 4 % vs factura"). "Total según el papel", con el aviso de FA6 si difiere en más de $ 1.
- **Pie:** el impacto en vivo (stock, estado y gasto: `impactoGasto`/`impactoEstado`). "Registrar devolución" abre un `useConfirmar` con el mismo resumen y los números ("Confirmá: resta 1 Caja de Queso Barra (queda en 181) y crea la nota de crédito 0001-00000123 por $ 24.805"). Mientras corre, `useTransition` + spinner + el botón deshabilitado.
- **Al terminar:** toast "D-0037-01 registrada" (+ "· nota de crédito cargada"), `refresh()` y se cierra el modal. Si la RPC devuelve el caso `a_favor`, el toast lleva el texto D5. **Sin `router.push`.**
- **Estados:**
  - cargando los motivos (esqueleto);
  - 0 motivos activos (`EmptyState`: "No hay motivos de devolución" + link a Proveedores › Motivos para admin);
  - nada para devolver ("Todavía no llegó mercadería de este pedido: no hay nada para devolver." + "Corrige la factura" si corresponde);
  - error (toast + `refresh()`; si es "Recargá la página", se recarga el modal con los datos nuevos).
- Cerrar con cambios pide confirmación ("Sin pérdida de trabajo").
- **Prellenado desde una diferencia:** `sugerenciaDesdeDiferencia` → motivo, línea y cantidad elegidos, y NC marcada si corresponde. Arriba: "Desde la diferencia de Queso Barra (+2)".

### 6.3 Detalle del pedido (`PedidoDetalle.tsx`): sección Devoluciones

- **Dónde:** después de la sección Factura y antes del Historial. Se muestra si hay alguna devolución (activa o anulada).
- **Encabezado:** "Devoluciones" con el ícono `Undo2` y la cantidad de activas. Botón secundario "Registrar devolución", que se muestra si llegó algo o, para admin, si hay factura confirmada.
- **Una tarjeta por devolución:**
  - **arriba:** `LinkEntidad` código `D-0037-01` · fecha · persona; chip del efecto ("Sale del stock" / "Corrige la factura" / "Corrige el precio"); chip "Repone" o "No repone";
  - **cuerpo:** las líneas con `textoLineaDevolucion`; la corrección de precio solo para admin ("de $ 1.300 a $ 1.250 /kg"); la nota;
  - **bloque NC (solo admin):** "Nota de crédito N° … · $ 24.805 · bajó el gasto a $ 34.606", con link a la NC (`?factura=`). O "Falta la nota de crédito", con el botón "Cargar nota de crédito" si `espera_nota_credito`. O "Con reposición: no lleva nota de crédito". Para un no admin: "Tiene nota de crédito" / "Esperando nota de crédito", sin montos;
  - **menú (`MenuSecundario`):** "Cargar nota de crédito" · "Anular nota de crédito" · "Anular devolución" (peligro).
- **Anuladas:** van al final, con opacidad baja y el código tachado. "Anulada por Admin QA el 06/10 · Motivo: …". Si son más de 2, plegadas en "Ver N anuladas".
- **Deep link `?devolucion=`:** el pedido abre y la tarjeta hace `scrollIntoView` + un anillo de acento 2 s. Al cerrar el pedido se limpian los dos params (`useQuitarParams('pedido', 'devolucion')`). Si el id no es de ese pedido: toast "No encontramos esa devolución en P-…".
- **"Qué sigue":** `cargar_nota_credito` → abre `NotaCreditoModal` (§5.2). En el menú secundario del pedido se suma "Registrar devolución".
- **Ítems:** la línea muestra "devuelto 1" junto a "llegó 2" cuando corresponde. "Falta" se calcula con el `pendiente` nuevo.
- **Historial:** los 4 eventos nuevos (§5.4), con links a la devolución y a la NC.
- **Datos (`pedidos/page.tsx` + `datos.ts`):**
  - `v_compras_devoluciones` acotada a los pedidos cargados (`.in('pedido_id', ids)` en tandas de 100, como en B3);
  - `compras_devolucion_motivos` activos (orden);
  - `v_compras_facturas` ya se lee (la factura del pedido): sumar `gasto_monto`, `notas_credito_total` y `nc_gasto` a las columnas.
  - `hayDevolucion` y `devolucionEsperaNc` se arman acá.
  - La lista de pedidos (`PedidosClient`) muestra "con devolución" en el subtexto (ya existe).

### 6.4 `NotaCreditoModal.tsx` (cargar después, D3)

- Cabecera: "Nota de crédito de D-0037-01 · factura 0001-…".
- Campos: N° (obligatorio), fecha (`DatePicker`, hoy por defecto, no futura), líneas (`armarNotaCredito`: solo precio y alícuota editables; la cantidad y los kg salen de la devolución), totales y "Total según el papel".
- Impacto en el pie: el gasto con `impactoGasto` y las diferencias ("La diferencia de Queso Barra (+1) se cierra").
- `useConfirmar` → `cargarNotaCredito` → toast + `refresh()`.
- Si la devolución no tiene kg y la línea cobra por kg, el modal no deja guardar: "Esta devolución no tiene los kg de Queso Barra y la factura lo cobra por kg. Anulá la devolución y registrala de nuevo con los kg." (D7).

### 6.5 `AnularModal.tsx` (compartido: anular devolución y anular NC)

- Motivos rápidos (chips): "Se cargó por error" · "El proveedor no la aceptó" · "Otro" (con texto obligatorio).
- **Impacto antes de confirmar:**
  - "Vuelve a sumar 1 Caja de Queso Barra (queda en 182)";
  - "Se anula la nota de crédito N° … y el gasto vuelve a $ 59.411";
  - "El pedido vuelve a Facturado".
- **Bloqueos conocidos de antemano** (con los datos que ya tiene la pantalla): la NC descontó un gasto que ahora está Pagado → el botón se deshabilita y aparece el mensaje de §3.5.7, con link al gasto.
- Anular solo la NC aclara: "La devolución queda activa, esperando una nota de crédito nueva."
- Al terminar: toast + `refresh()`.

### 6.6 Facturas

- **Lista (`FacturasClient.tsx`):**
  - una NC lleva el chip "Nota de crédito" debajo del número, el total con "−" y, en la columna Pedido, "corrige 0001-… (D-…)";
  - "Vence" queda vacío; la búsqueda por número la encuentra;
  - el filtro de estado sigue igual, y se suma una pestaña **"Notas de crédito"** solo si hay alguna.
- **Factura confirmada (`FacturaForm.tsx`, solo lectura):**
  - en el pie, el botón secundario **"Registrar devolución"** (abre §6.2 con la factura);
  - bloque **"Notas de crédito"** (si hay): lista con número, total y link, y "Neto de la factura: $ X";
  - "Anular" avisa antes si hay NC (E18), con el mismo patrón del aviso de gasto pagado de F5.
- **Vista de una NC** (`FacturaForm` en modo `nota_credito`, solo lectura):
  - título "Nota de crédito 0001-…";
  - "Corrige la factura `<LinkEntidad factura>`" · "De la devolución `<LinkEntidad devolucion>`";
  - líneas y totales;
  - bloque de gasto según `nc_gasto` ("Se descontaron $ X del gasto de la factura" / "Canceló el gasto" / "A favor: el gasto ya estaba pagado" / "La factura no tenía gasto");
  - pie: "Anular nota de crédito" (§6.5) + "Cerrar". Sin "Compartir" (D5), sin diferencias y sin editar.
  - **`CabeceraFactura.tsx` / `modelo.ts`** ya tienen `tipoComprobante`: se usa para elegir el modo.
- **`DiferenciasPanel.tsx`:**
  - en una diferencia `reclamo_proveedor` sin `devolucion_id`, el botón "Registrar devolución" (§6.2 prellenado);
  - con `devolucion_id`: "Esperando la nota de crédito de `<LinkEntidad devolucion>`" + "Cargar nota de crédito" (admin);
  - el texto de la diferencia usa `devuelta`/`acreditada` (§5.4).
  - El modal "Resolver" no cambia. Después de elegir "Reclamo al proveedor", el toast trae la acción "Registrar devolución".

### 6.7 Cuenta del proveedor y Reportes (las NC a favor)

- **`components/compras/PagoFactura.tsx`:** el estado `a_favor` → chip "A favor" (tono info).
- **`app/admin/proveedores/FichaPaneles.tsx` (Cuenta):** si `aFavor ≠ 0`, una tarjeta más, "A favor $ X", con la ayuda "Notas de crédito que llegaron con el gasto ya pagado: se descuentan del próximo pago (cuenta corriente en noviembre)". La suma visible sigue cuadrando: Pagado + Pendiente + Sin gasto + A favor = Facturado.
- **`app/admin/proveedores/datos.ts`:** sumar `nc_gasto` al `select` de facturas.
- **`app/admin/compras/reportes/page.tsx`:** sumar `nc_gasto` a `COLUMNAS_FACTURA` (una línea; A2c no toca este archivo).
- **`app/admin/compras/reportes/GastoPorProveedor.tsx`:** la columna "A favor" aparece solo si algún proveedor tiene ≠ 0. En el detalle, la NC con su chip.
- `ReportesClient.tsx` **no se toca** (el KPI ya resta las NC).

### 6.8 Stock

- **Sin cambios de pantalla en B4** (la ficha es de A2c → A4). El movimiento `devolucion_proveedor` ya se ve en Movimientos con su `motivo` ("Devolución D-0037-01 a GLOBAL: Mercadería en mal estado (16,4 kg)") y en el puente de A2c, en el grupo "Devolución".
- **Para el coordinador:** exponer `devolucion_id` al final de `v_compras_stock_movimientos` y el chip "Devolución" en `PanelMovimientos` queda para A4 o una tanda chica (§14).

## 7. Casos borde (y cómo se resuelven)

1. **Kg:** un insumo que se cobra por kg y se devuelve sin NC → los kg son opcionales (aviso). Con NC → obligatorios (`'Cargá los kg devueltos de…'`). El subtotal de la NC = kg × $/kg de la factura (A2b E4). Los kg nunca mueven stock.
2. **Devolución de algo facturado en kg con la NC después (D3):** si la devolución se registró **sin kg**, la NC no se puede cargar → anular y volver a registrar con kg (D7). El modal de la devolución lo previene: si el pedido tiene factura con esa línea por kg y "no repone", el campo kg ya aparece como "necesario para la nota de crédito".
3. **Factura anulada:**
   - con NC → frena (E18);
   - con una devolución sin mercadería → frena;
   - con una devolución con mercadería de lo que llegó por remito manual → se anula; la devolución queda con `factura_id` apuntando a la anulada y la NC, si hace falta, se carga sobre la factura nueva (`factura_id = coalesce(…)` no la pisa: la RPC usa la **factura activa** y la reescribe si la vieja está anulada);
   - con mercadería del **remito automático** → el recálculo frena (E7).
4. **Gasto pagado (D5):** la NC se registra igual, `a_favor`, y el gasto no cambia. Anular esa NC: no toca el gasto. Una NC descontada de un gasto que **después** se pagó: anular se frena (§3.5.7).
5. **Gasto en $ 0** (NC = total): `cancelo_gasto` (D4). Si alguien deshace ese pago en Gastos, el gasto queda Pendiente en $ 0 y anular la NC se frena con "revisalo en Gastos" (limitación conocida, §12).
6. **Gasto vinculado a mano (FA10)** con un monto distinto ±1 %: se descuenta `least(total NC, monto)` y la diferencia de redondeo queda en el gasto.
7. **Factura vieja sin gasto** (P-0006, P-0011 y P-0027 en dev): `sin_gasto`. Resta en los reportes y en la Cuenta, en "Sin gasto".
8. **Devolución antes de la factura (D1)** y la factura llega neta (8 de 10): el prellenado ya descuenta lo devuelto (§5.4). Si el proveedor factura 10, aparece la diferencia +2 → E13 la marca "esperando NC" (si la devolución es sin reposición).
9. **Reposición que llega con otro precio:** la reposición no se factura (E6). Si el proveedor la factura aparte, eso es otro pedido, y se dice en la ayuda del paso 3.
10. **Reposición que nunca llega:** el pedido queda Parcial → "Cerrar a mano" (P2). No hace falta editar la devolución.
11. **Devolución con reposición en un pedido cerrado a mano:** frena (E9).
12. **Remito editado por debajo de lo devuelto**, o eliminado: frena (E7), con el código D-… y "Anulá esa devolución primero".
13. **Doble clic / dos personas:** el `for update` del pedido serializa, y la segunda ve el máximo nuevo y falla con el mensaje de máximo. La secuencia D-… no se pisa (unique + lock).
14. **Motivo desactivado o editado después:** las devoluciones viejas usan la foto (E2); el motivo desactivado no aparece en el modal. Borrar un motivo usado → FK → "desactivalo".
15. **Stock negativo** después de devolver (ya se consumió): se avisa en ámbar y no bloquea (principio del Bloque 1).
16. **R3:** una diferencia ajustada en el stock frena registrar, cargar la NC y anular (E14).
17. **Corrección de precio sobre una línea por kg:** la cantidad son los kg cobrados. "Precio correcto" en $/kg. La NC = kg × (cobrado − correcto).
18. **Insumo archivado** (A2a): se puede devolver igual (está en el pedido). El chip "Archivado" aparece en la línea.
19. **Proveedor archivado** (B3): un proveedor con pedidos abiertos no se archiva, así que un pedido Devuelto no cuenta como abierto (`pedidoAbierto` ya devuelve false). Registrar una devolución de un proveedor archivado **se permite** (es cerrar cuentas). No se llama a `_compras_exigir_proveedor_activo`.
20. **Rol custom de Compras** (`qa-squad`): ve la sección, registra y anula devoluciones con mercadería sin NC, y no ve montos ni la NC (E15). Un rol solo `fabrica-conteos`: sin acceso (A2a D4).
21. **NC con total > lo que queda de la factura:** frena (§3.5.5).
22. **Una devolución que vacía el pedido**, pero con una línea que nunca llegó: queda Parcial, no Devuelto (E8).

## 8. Archivos

**En alcance:**

| Archivo | Qué |
|---|---|
| `supabase/migrations/20261006150000_compras_devoluciones.sql` | §3 (nuevo) |
| `docs/bloque2/escenarios-B4.sql` | §9.2 (nuevo) |
| `lib/database.types.ts` | regenerado después del push |
| `lib/compras/devoluciones.ts`, `_check_devoluciones.ts` | §5.1 (nuevos) |
| `lib/compras/codigos.ts` | `codigoDevolucion` |
| `lib/compras/estadoPedido.ts`, `_check_estado.ts` | §5.2 |
| `lib/compras/reportes.ts`, `_check_reportes.ts` | §5.3 |
| `lib/compras/historialPedido.ts`, `_check_historial.ts` | §5.4 |
| `lib/compras/diferencias.ts`, `_check_diferencias.ts` | §5.4 |
| `lib/compras/rutas.ts`, `lib/modulos.tsx` (solo el mapeo de `devolucion` → `compras-pedidos`, si `LinkEntidad` lo necesita) | §5.4 |
| `lib/errores.ts` | §5.5 |
| `app/admin/compras/pedidos/devoluciones/{DevolucionModal,NotaCreditoModal,AnularModal,DevolucionesSeccion}.tsx`, `acciones.ts`, `datos.ts` | §4, §6.2–6.5 (nuevos) |
| `app/admin/compras/pedidos/{PedidoDetalle,PedidosClient}.tsx`, `page.tsx`, `datos.ts` | §6.3 |
| `app/admin/compras/pedidos/facturas/{FacturaForm,FacturasClient,DiferenciasPanel,CabeceraFactura}.tsx`, `modelo.ts`, `_check_modelo.ts`, `datos.ts`, `page.tsx` | §5.4, §6.6 |
| `app/admin/compras/pedidos/remitos/modelo.ts`, `_check_modelo.ts` | solo si el prellenado necesita el `pendiente` nuevo (§5.4) |
| `app/admin/proveedores/layout.tsx`, `motivos-devolucion/page.tsx` (nuevo) | §6.1 |
| `app/api/compras-devolucion-motivos/route.ts` | §6.1 (nuevo) |
| `components/compras/PagoFactura.tsx`, `app/admin/proveedores/{FichaPaneles.tsx,datos.ts}` | §6.7 |
| `app/admin/compras/reportes/{page.tsx,GastoPorProveedor.tsx}` | §6.7: una línea en `page.tsx` + la columna |
| `eslint.config.mjs` | sumar `app/admin/compras/pedidos/devoluciones/*.tsx` y `app/admin/proveedores/motivos-devolucion/*.tsx` a la regla de hex |
| `docs/bloque2/notas-B4.md` | notas, mini-spec de `impeccable` y lista de pruebas |

**Fuera de alcance (no se tocan):**

- **SQL de otros carriles o ya estable:**
  - `compras_guardar_remito`, `compras_eliminar_remito`, `compras_guardar_factura` y `compras_confirmar_factura` (la guarda va en el recálculo, E7);
  - `compras_trazabilidad_insumo`, `v_compras_insumo_documentos` y `v_compras_stock_movimientos` (A2c → A4);
  - `cerrar_conteo_fabrica` y las de conteo (A1/A3);
  - las de producción (A3);
  - `gastos_*` y `v_gastos`;
  - `proveedores_*`.
- **Pantallas de A2c (y después A3/A4):** ficha de Stock (`app/admin/compras/stock/**`), Insumos (`app/admin/compras/insumos/**`) y Reportes › "Por insumo" (`reportes/PorInsumo.tsx`, `ReportesClient.tsx`, `lib/compras/reportePorInsumo.ts`, `lib/compras/trazabilidad.ts`).
- **Compartir la NC** (B2: `CompartirFacturaModal`, `cargarComprobante`, `comprobanteFactura`, `facturaMensaje`; ver D5).
- **Gastos** (`app/admin/gastos/**`): el gasto se modifica desde la RPC; la pantalla lo muestra como siempre.
- **Fábrica:** devoluciones de producto de los locales (`fabrica_devolucion_motivos`).
- **El manual `/ayuda`:** se arma en la entrega final, no por fase. Las notas dejan qué secciones cambian.

## 9. Verificación

### 9.1 Antes de empezar

```bash
git fetch && git reset --hard origin/qa        # o rebase si ya hay commits propios
git log --oneline -1                           # c59eb64 o posterior
rg -n "function public.compras_recalcular_estado_pedido|view public.v_compras_facturas|function public.compras_anular_factura|function public.compras_mover_stock|function public.compras_diferencias_calculadas|view public.v_compras_pedido_pendiente|view public.v_compras_pedido_eventos|view public.v_compras_factura_diferencias" supabase/migrations
npx supabase migration list --linked --project-ref fafckqysyvtlslfnpzrh   # la última local y remota: 20261006120000
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select count(*) from compras_stock_actual a where a.cantidad <> (select coalesce(sum(delta),0) from compras_stock_movimientos m where m.item_id = a.item_id)"   # 0
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select distinct tipo from compras_pedido_eventos"
```

Copiar `.env.local` desde `C:\Dev\Trabajo\4peeq\YA!Chipacitos\.env.local`, correr `npm install` y levantar el dev server en el **3006** desde PowerShell (`npx next dev -p 3006`; desde Git Bash, `/admin` da 404).

### 9.2 SQL de escenarios (dev, **sin pushear**; todo se revierte)

`docs/bloque2/escenarios-B4.sql`, con el patrón de `escenarios-B3.sql`: un `do $$ … $$` que corre como `qa-admin` o `qa-squad` (`set_config('request.jwt.claims', …)` + `set_config('role','authenticated')`) y termina con `raise exception 'RESULTADO: %', v_res`, así revierte todo.

```bash
cat supabase/migrations/20261006150000_compras_devoluciones.sql docs/bloque2/escenarios-B4.sql > <scratchpad>/b4_escenarios.sql
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <scratchpad>/b4_escenarios.sql
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select to_regclass('public.compras_devoluciones') is null as limpio"   # true
```

**Datos del lote:** se arman pedidos propios dentro del lote, con GLOBAL y Queso Barra (cobra por kg, $ 1.250) más Fécula (por bolsa). Se envían y se les cargan remitos y facturas con las RPC reales. Así no dependen de P-0037 ni de P-0019, y no los cambian.

| # | Escenario | Resultado esperado |
|---|---|---|
| **S1** | Migración | 6 motivos con sus flags; los 3 CHECK; columnas nuevas; RLS: solo `select` en devoluciones e ítems; check de eventos con los 2 tipos; `compras_recalcular_diferencias_factura` compila y corre contra la función nueva; `v_compras_pedido_eventos` sin dependientes rotos |
| **S2 (D1)** | Pedido A sin factura: remito 2 Caja Queso Barra (33 kg) + 3 Bolsa Fécula. Devolución "Mal estado" 1 Caja / 16,4 kg, **repone** | Movimiento `devolucion_proveedor` −1 con `devolucion_id` y "(16,4 kg)" en el motivo; stock −1; pedido `parcial`; `pendiente` de la línea = 1; evento `devolucion_registrada` sin montos; código `D-xxxx-01` |
| **S3** | Remito de reposición, 1 Caja | Pedido `recibido`; `pendiente` 0 |
| **S4** | Pedido B: remito con todo; devolución de **todo**, sin reposición | `devuelto`, legacy `cerrado`; `pedidoAbierto` (TS) false |
| **S5 (D2)** | Pedido C facturado 2 Caja / 33,4 kg a $ 1.250 + 3 Bolsa (gasto pendiente creado). Devolución "Mal estado" 1 Caja / 16,4 kg, no repone, **con NC** | NC confirmada con `factura_origen_id`: 16,4 × 1.250 = 20.500 + IVA 4.305 = 24.805; gasto: monto − 24.805, `nc_gasto = 'descontado'`; diferencias de la factura: 0; `v_compras_facturas` de la NC: `gasto_estado = 'Pendiente de pago'`; la suma con signo de las filas por proveedor coincide con el `monto` del gasto |
| **S6 (D2, desde la diferencia)** | Pedido D facturado 10 Bolsa, remitos 8, cerrado a mano → diferencia +2 → Reclamo → devolución "Facturado y no entregado" 2 + NC (`p_diferencia_id`) | Sin movimiento de stock; la NC baja la cantidad facturada; la diferencia desaparece; gasto descontado |
| **S7** | Pedido C: "Precio mal facturado" sobre la línea por kg, correcto $ 1.200 | NC con una línea **sin `item_id`**: 33,4 kg cobrados (la cantidad es la de la línea de la factura, aunque una parte ya se haya devuelto) × $ 50 = $ 1.670 + IVA; stock sin cambios; las diferencias no cambian; la trazabilidad de A2c del insumo no cambia de cantidad |
| **S8 (D3)** | Pedido E facturado; devolución "Mal estado" 1, no repone, **sin NC** | La diferencia +1 queda `reclamo_proveedor`, con `devolucion_id` y la nota "Esperando…"; `espera_nota_credito = true`; después `compras_cargar_nota_credito` → la diferencia se borra, el gasto baja, `nota_credito_id` cargado y `espera_nota_credito = false` |
| **S9 (D4)** | Anular la devolución de S5 | `reversion` +1 con `anula_movimiento_id`; NC anulada; gasto = monto original exacto; diferencias = antes; evento `devolucion_anulada`; anular de nuevo → "ya está anulada"; el `reversion` duplicado no se puede crear |
| **S10 (D5)** | Pedido F: factura, gasto marcado Pagado (`gastos_registrar_pago`), devolución + NC | `nc_gasto = 'a_favor'`; el gasto no cambia; el retorno trae `gasto = 'a_favor'`; `estadoPago` TS → `a_favor`; anular la NC no toca el gasto |
| **S11** | NC descontada y después el gasto se paga → anular la NC | Error "ya se pagó con el descuento…"; nada cambió |
| **S12** | Pedido G con factura "ya llegó" (remito automático) + devolución con mercadería; anular la factura | Error de la guarda E7 ("Anulá esa devolución primero"); el remito y el stock siguen |
| **S13** | Factura con NC → anular la factura | Error E18 con el N° de la NC; anular la NC y después la factura → OK. `compras_anular_factura(<id de una NC>)` → "Una nota de crédito se anula desde su devolución" |
| **S14** | NC por el total de la factura (devolución de todo, sin reposición, con NC) | Gasto en $ 0, `Pagado`, `forma_pago = 'Nota de crédito'`, `nc_gasto = 'cancelo_gasto'`; pedido `devuelto`; anular → `Pendiente de pago`, monto original y forma de pago anterior |
| **S15** | Límites | Devolver > llegó; la segunda devolución pasa lo que queda; NC > lo que queda de la factura; N° de NC repetido (constraint); repone + NC; repone en un cerrado a mano; sin mercadería sin factura; NC con kg faltantes en una línea por kg; `precio_correcto ≥ cobrado`. Cada uno con su mensaje, y nada queda a medias |
| **S16 (R3)** | Diferencia de Queso Barra resuelta como `ajusta_stock` → registrar una devolución de Queso Barra | El mensaje E14, sin movimientos |
| **S17 (E7)** | Pedido A (S2): editar el remito y bajarlo por debajo de lo devuelto; eliminar el remito | Los dos con el error E7; el stock no cambió |
| **S18** | Permisos (`qa-squad`) | Devolución con mercadería y sin NC: OK; sin mercadería: error admin; con NC: error; cargar o anular NC: error; anular una devolución con NC: error; la vista de devoluciones con `nc_*` y `precio_correcto` en null; `v_compras_pedido_eventos` sin `nota_credito`; `insert` directo en `compras_devoluciones` → RLS; `anon` sin `execute` en las 4 RPC |
| **S19** | Motivo editado después (cambiar `devuelve_mercaderia` del motivo usado en S2) y anular S2 | La reversión mueve lo mismo que se movió (foto, E2) |
| **S20** | Eventos | La rama `factura_anulada` no lista NC; `nota_credito` y `nota_credito_anulada` solo para admin, con `devolucion_id` |
| **S21** | Vistas | `v_compras_pedido_pendiente` con `devuelto`/`pendiente` correctos en S2–S3; `v_compras_factura_diferencias` con `devuelta`/`acreditada` y kg netos; `v_compras_facturas` con `notas_credito_total` y `gasto_monto` |
| **S22** | **Invariante del ledger** | 0 filas, al final del lote |

**S23 (concurrencia, aparte, dos sesiones con `pg_sleep`, las dos revertidas):** dos devoluciones del mismo insumo y el mismo pedido a la vez, que juntas pasan el máximo → la segunda espera el `for update` del pedido y falla con el mensaje de máximo. Una devolución y un `compras_guardar_remito` del mismo pedido → se serializan, sin deadlock (los dos bloquean el pedido primero).

### 9.3 Chequeos puros, tipos, lint y build

- `npx tsx lib/compras/_check_devoluciones.ts`, `_check_estado.ts`, `_check_reportes.ts`, `_check_historial.ts` y `_check_diferencias.ts`, más `facturas/_check_modelo.ts` (y `remitos/_check_modelo.ts` si se tocó). Todos OK, con la cantidad de casos en las notas.
- `npx tsc --noEmit`, `npx eslint` de los archivos tocados (0) y `npm run build`. Cero `as any` nuevos y cero hex nuevos.

### 9.4 Push a dev (con OK del coordinador)

1. `git fetch && git rebase origin/qa`. El timestamp tiene que seguir siendo el mayor de `qa`; si entró otro mayor, renombrar la migración (todavía no se aplicó).
2. Pedirle el OK al coordinador (un solo push a la vez).
3. `npx supabase db push --dry-run --linked --project-ref fafckqysyvtlslfnpzrh` → **solo** `20261006150000`.
4. `npx supabase db push --linked --project-ref fafckqysyvtlslfnpzrh`.
5. `npm run types` → solo lo de B4. Commit `chore(tipos): …`.
6. El invariante en 0 y los motivos sembrados.

### 9.5 QA en el navegador (local :3006 contra dev, `qa-admin` y `qa-squad`)

El navegador de Traycer no hidrató `compras/pedidos/*` en B3. Si vuelve a pasar, usar el script de Playwright de B1 (`playwright-core` + Chromium) o un Chrome común.

1. Proveedores › Motivos de devolución: los 6, con su chip. Crear "QA B4 motivo" (corrige el precio), editarlo, desactivarlo y borrarlo. Borrar "Mercadería en mal estado" después de usarlo → "desactivalo".
2. **D1** en un pedido nuevo de GLOBAL (Queso Barra 2 + Fécula 3, enviado, remito con 33 kg):
   - "Registrar devolución" › Mal estado › 1 Caja con 16,4 kg › Repone;
   - el confirm dice "Resta 1 Caja… queda en …" y "vuelve a Parcialmente recibido";
   - el toast; la sección Devoluciones y el historial;
   - "Qué sigue" → cargar remito; el remito de reposición → Recibido.
3. **D2:** facturar ese pedido (con el prellenado correcto) → "Registrar devolución" desde la factura, "no repone", con NC; el impacto del gasto ("baja de… a…"); la NC en la lista de Facturas; abrirla (vista NC, links); la Cuenta de GLOBAL cuadra.
4. **Desde la diferencia:** P-0019 (1 diferencia pendiente) → Resolver › Reclamo → "Registrar devolución" prellenado ("Facturado y no entregado", 1, NC) → la diferencia desaparece.
5. **D3:** una devolución sin NC → la diferencia "Esperando la nota de crédito de D-…" → "Qué sigue: Falta la nota de crédito" → `NotaCreditoModal` → listo.
6. **D4:** anular esa devolución → el confirm con el stock y el gasto → todo vuelve (stock, gasto en Gastos › Pendientes, estado e historial).
7. **D5:** marcar un gasto como pagado en Gastos › Pendientes y cargar una NC → el aviso "a favor"; la Cuenta muestra "A favor"; Reportes › Gasto por proveedor muestra la columna.
8. **Corrección de precio** sobre la línea por kg → la NC "Diferencia de precio · …".
9. **Bloqueos en pantalla:** anular una factura con NC (aviso previo); bajar un remito por debajo de lo devuelto (toast con D-…); repone en un cerrado a mano (opción deshabilitada con el texto).
10. **`qa-squad`:** ve Devoluciones sin montos; registra "Mal estado" sin NC; no ve las opciones de "Corrige la factura" ni "Cargar nota de crédito".
11. **Deep link** `?pedido=…&devolucion=…`: abre y resalta; al cerrar se limpia.
12. **375 px y tema claro:** el modal de devolución en pantalla completa con el pie sticky, sin scroll horizontal y con los kg tocables; la sección Devoluciones; la vista de la NC.

### 9.6 Datos de dev

Lo que quede de la QA en el navegador se anota en `notas-B4.md` (pedido, códigos D-…, NC y estado de los gastos). Los escenarios SQL no dejan nada.

## 10. Commits y cierre (rama `bloque2/pedidos`)

Commits chicos, y push de la rama después de cada uno (con el token de 4peeqTech, §cabecera):

1. `feat(compras): devoluciones al proveedor y nota de crédito en SQL (B4, sin aplicar)`: la migración + `escenarios-B4.sql` + `lib/database.types.ts` a mano, si hace falta para compilar.
2. `feat(compras): lógica pura de devoluciones, estado, pagos a favor e historial (B4)`: `lib/compras/*` + checks.
3. Después del push a dev: `chore(tipos): regenerar database.types tras aplicar B4 en dev`.
4. `feat(compras): motivos de devolución al proveedor (B4)`.
5. `feat(compras): registrar, anular y cargar nota de crédito desde el pedido, la factura y las diferencias (B4)`.
6. `feat(compras): notas de crédito en Facturas, Cuenta del proveedor y Reportes (B4)`.
7. `docs(bloque2): notas de B4`.

Al cerrar, mandarle al coordinador: commits, resultado de S1–S23, invariante, checks y la lista de pruebas (§12). El plan maestro **no** se edita (lo actualiza el coordinador).

## 11. Criterios de aceptación

1. La migración corre en un lote revertido con S1–S22 en verde, y el push a dev deja el invariante del ledger en 0.
2. Una devolución con mercadería mueve el stock **en unidad de compra**, con un `devolucion_proveedor` por insumo que lleva `devolucion_id`, y los kg reales quedan en la línea y en el motivo.
3. El estado del pedido se calcula con E8: con reposición pendiente queda Parcial, y se llega a Devuelto con todo devuelto sin reposición. Anular lo deja como estaba.
4. La NC es una `compras_facturas` `nota_credito` confirmada, con `factura_origen_id`. Sus líneas salen del servidor (E5) y su total coincide con el de `armarNotaCredito` en TS.
5. El gasto pendiente baja exactamente el total de la NC. Un gasto pagado no cambia y la NC queda "A favor". Anular la NC devuelve el gasto al centavo, o frena con un mensaje que dice qué hacer.
6. Las diferencias reflejan devoluciones y NC (tabla de §3.7). Una devolución sin NC deja la diferencia "Esperando la nota de crédito" en vez de una pendiente nueva.
7. Ninguna acción deja menos recibido que devuelto (E7). La guarda R3 frena con su mensaje (E14). Anular una factura con NC frena (E18).
8. Los 4 caminos de la UI funcionan: el detalle del pedido, la factura, la diferencia y "Cargar nota de crédito" después. Hay anular devolución y anular NC, cada una con su impacto antes de confirmar.
9. Pestaña de motivos con los 3 efectos; borrar un motivo usado da el mensaje de "desactivalo".
10. La Cuenta del proveedor y Gasto por proveedor cuadran: Pagado + Pendiente + Sin gasto + A favor = Facturado (neto de NC).
11. Permisos según E15, probados con `qa-squad`. Ni la tabla de eventos ni las vistas exponen montos a quien no es admin.
12. Historial con los 4 eventos nuevos. La NC anulada no aparece como "factura anulada".
13. Protocolo de diseño de §6.0 cumplido, con la mini-spec en las notas. 375 px y tema claro sin scroll horizontal. `tsc`, lint de lo tocado y build limpios.
14. No se tocó ningún archivo de "Fuera de alcance".

## 12. Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, **una vez mergeado B4 a `qa`**. El Ejecutor la completa con los datos reales que deje en dev.

1. **Proveedores › Motivos de devolución.**
   - Hay 6 motivos: 4 "Sale del stock", "Facturado y no entregado" y "Precio mal facturado".
   - Crear uno, cambiarle "Qué pasa" y desactivarlo.
   - Intentar borrar "Mercadería en mal estado" después de usarlo → "desactivalo".
2. **Mercadería mal, el proveedor repone (D1).**
   - Crear un pedido a GLOBAL con 2 Queso Barra y 3 Fécula, enviarlo y cargar el remito con 33 kg.
   - En el pedido: Registrar devolución › Mercadería en mal estado › 1 Caja, 16,4 kg › "Sí, repone".
   - → El confirm dice cuánto resta del stock y que el pedido vuelve a "Parcialmente recibido".
   - → Aparece la sección Devoluciones con D-xxxx-01, y el historial dice "Devolvió mercadería…".
   - Cargar un remito con 1 Caja → Recibido.
3. **Con factura y nota de crédito (D2).**
   - Facturar ese pedido y confirmar (gasto pendiente).
   - En la factura: Registrar devolución › Mal estado › 1 Caja, 16,4 kg › "No repone" › "Ya llegó la nota de crédito", con número y fecha.
   - → El total sale 16,4 × $/kg + IVA, y el pie dice "El gasto pendiente baja de $ X a $ Y".
   - → En Gastos › Pendientes, el gasto tiene el monto nuevo.
   - → En Facturas aparece la NC con "−" y el chip; al abrirla, linkea a la factura y a la devolución.
4. **La NC llega después (D3).**
   - Otra devolución sin NC en un pedido facturado. → "Qué sigue: Falta la nota de crédito", y la diferencia dice "Esperando la nota de crédito de D-…".
   - Cargar la NC desde la devolución. → La diferencia desaparece y el gasto baja.
5. **Desde una diferencia.** P-0019 tiene 1 diferencia: Resolver › Reclamo al proveedor › "Registrar devolución". → Viene prellenado ("Facturado y no entregado", 1 Caja, con NC). Al registrar, la diferencia se cierra.
6. **Precio mal facturado.** En una factura con Queso Barra por kg: Registrar devolución › Precio mal facturado › precio correcto 50 menos. → La NC dice "Diferencia de precio · Queso Barra…" y el stock no se mueve.
7. **Anular (D4).**
   - Anular la devolución del punto 3. → El confirm dice que vuelve a sumar stock y que el gasto vuelve a su monto. Después de anular: el stock, el gasto y el estado del pedido quedan como antes, y el historial dice "Anuló la devolución…".
   - Anular solo una NC → la devolución queda "esperando nota de crédito".
8. **Gasto ya pagado (D5).** Pagar un gasto en Gastos › Pendientes y después cargar una NC sobre su factura. → Aviso "estos $ X quedan a favor"; en Proveedores › GLOBAL › Cuenta aparece "A favor".
9. **Devuelto.** Un pedido recibido completo, sin facturar: devolver todo, sin reposición. → Badge "Devuelto"; aparece en la pestaña Devueltos de Pedidos.
10. **Lo que no se puede (cada uno dice qué hacer).**
    - Devolver más de lo que llegó.
    - Editar el remito por debajo de lo devuelto.
    - Anular una factura con NC.
    - "Repone" en un pedido cerrado a mano.
    - Una NC más grande que lo que queda de la factura.
11. **Con `qa-squad`.** Ve las devoluciones sin montos, puede registrar "Mercadería en mal estado" sin NC, y no ve "Corrige la factura" ni "Cargar nota de crédito".
12. **Reportes › Gasto por proveedor y Proveedores › Cuenta.** Pagado + Pendiente + Sin gasto + A favor = Facturado (ya neto de NC).
13. **Celular (375 px) y tema claro.** El modal de devolución ocupa la pantalla, con el botón abajo siempre visible; se lee sin scroll horizontal y los campos de kg se tocan bien.

## 13. Decisiones que necesitan al usuario

| # | Pregunta | Recomendación (la que asume esta spec) | Alternativa |
|---|---|---|---|
| **D1** | ¿Los motivos tienen un tercer comportamiento, "Facturado y no entregado" (no mueve stock y la NC baja la cantidad facturada), además de "sale mercadería" y "corrige el precio"? | **Sí:** dos flags (`devuelve_mercaderia` + `corrige_precio`) y el seed con "Facturado y no entregado". En la pantalla es un solo select de 3 opciones. | Solo el flag de F6. Pero entonces la diferencia +2 de F5 ("facturaron 2 que no llegaron") no tiene cómo cerrarse con una NC, que es justamente el camino D2 "desde Reclamo al proveedor". |
| **D2** | La NC por **corrección de precio** ¿va como una línea **sin insumo** ("Diferencia de precio · Queso Barra")? | **Sí.** No toca las diferencias ni la cantidad comprada de A2c. **Costo:** en la ficha del insumo y en "Por insumo", esos pesos no se le restan al insumo (sí al proveedor y al total). Se anota para A4. | Línea con insumo + una marca `solo_precio`, y redefinir `compras_trazabilidad_insumo` de A2c para que no reste cantidad. Es más preciso, pero B4 invade A2c/A4. |
| **D3** | Una devolución **con reposición** ¿puede traer nota de crédito? | **No.** Con 1 factura = 1 pedido, la reposición ya está facturada: la NC acreditaría dos veces. Si el proveedor no repone al final, se cierra el pedido a mano y la NC va en una devolución nueva sin reposición. | Permitirlo. Pero entonces hay que decidir si la reposición se vuelve a facturar, y eso choca con F1. |
| **D4** | Si la NC deja el gasto pendiente en **$ 0** (se devolvió todo), ¿qué pasa con el gasto? | **Queda en $ 0 y "Pagado"**, con forma de pago "Nota de crédito" y la fecha de la NC; anular la NC lo devuelve a Pendiente con su monto. No aparece en Pendientes de pago. | (a) Que quede "Pendiente" en $ 0: aparece en Pendientes y alguien lo puede "pagar". (b) Borrarlo: anular la NC tendría que recrearlo. |
| **D5** | ¿La NC se **comparte** (imagen y mensaje de B2)? | **No en B4.** La NC se ve en la factura, en la devolución y en Facturas. La administración se entera por el gasto, que ya baja solo. `cargarComprobante` sigue con el 409. Si hace falta, es una tanda chica después (título "NOTA DE CRÉDITO", plantilla tipo `factura` con "corrige la factura N°"). | Sumarlo ahora: toca los 4 archivos de B2 y la plantilla. |
| **D6** | ¿Quién registra devoluciones? | **Cualquiera con Compras** registra y anula devoluciones **con mercadería y sin NC** (es quien recibe). Todo lo que corrige la factura y todo lo de NC, **solo admin**. Quien no es admin no ve montos. | Todo solo admin: es más simple, pero quien recibe no puede dejar asentado que devolvió mercadería. |
| **D7** | Una devolución registrada **sin kg** de un insumo que se factura por kg: ¿se le puede cargar la NC después? | **No:** hay que anularla y registrarla de nuevo con los kg. El modal avisa de antemano que los kg son necesarios para la NC. | Pedir los kg en el modal de la NC y guardarlos en la devolución después. Es una escritura más sobre una devolución ya registrada, y en el historial queda menos claro. |

## 14. Para el coordinador

- **Tabla de dueños** (B4 toma estos objetos; el siguiente parte de su cuerpo):

  | Objeto | Antes | Después |
  |---|---|---|
  | `compras_mover_stock` | A1 → A4 | **B4** (`p_devolucion_id`) → A4 |
  | `compras_recalcular_estado_pedido` | — | **B4** |
  | `compras_diferencias_calculadas`, `v_compras_factura_diferencias` | A2b | **B4** |
  | `compras_anular_factura` | A2b | **B4** |
  | `v_compras_pedido_pendiente` | A2b | **B4** |
  | `v_compras_facturas` | F5 | **B4** |
  | `v_compras_pedido_eventos`, `compras_pedido_eventos_tipo_check` | B1 | **B4** |
  | `lib/compras/reportes.ts` (`estadoPago`, `resumirPagos`) | B3 | **B4** |
  | `compras_devolucion*`, `compras_registrar_devolucion`, `compras_cargar_nota_credito`, `compras_anular_nota_credito`, `compras_anular_devolucion` | — | **B4** (nuevos) |

- **No los toca:** `compras_guardar_remito`, `compras_eliminar_remito`, `compras_guardar_factura`, `compras_confirmar_factura`, `compras_trazabilidad_insumo` ni `v_compras_stock_movimientos`.
- **Para A4 (o una tanda chica):**
  - `devolucion_id` al final de `v_compras_stock_movimientos` y el chip "Devolución" en `PanelMovimientos`;
  - si se elige la alternativa de D2, la marca `solo_precio` en la trazabilidad.
- **Para F9:** la consulta de devoluciones del pedido está acotada por pedido, pero la lista de pedidos sigue sin límite (lo de B3).
- **Para la release** (cuando el usuario la pida): antes de aplicar `20261006150000` en prod, contar las NC de prod (0 esperado; si hay, `compras_facturas_nc_con_origen` puede fallar) y los tipos de `compras_pedido_eventos`.
