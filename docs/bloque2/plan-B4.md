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
