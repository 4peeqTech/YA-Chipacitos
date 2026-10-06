# B5 — Avisos y tablero de compras (especificación ejecutable)

> Fase B5 del plan `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md` (carril B, después de B4).
>
> - Rama `bloque2/pedidos`, que sale de `qa` @ `a327cd9` (todo el Bloque 2 menos A3 y A4).
> - Migración: **`supabase/migrations/20261006170000_compras_avisos_tablero.sql`**. Es mayor que `20261006160000` (B4, el último de `qa`). Si A3 entra antes con un timestamp mayor, se renombra antes del push (regla del plan).
> - **Solo dev (`fafckqysyvtlslfnpzrh`) y QA.** Prod no se toca de ninguna forma. Nunca `supabase link`: siempre `--linked --project-ref fafckqysyvtlslfnpzrh`.
> - El `db push` se hace **con el OK del coordinador**.
> - Push de la rama: `git -c credential.helper= push https://x-access-token:$(gh auth token -u 4peeqTech)@github.com/4peeqTech/YA-Chipacitos.git bloque2/pedidos`.
>
> **B5 no redefine ninguna función ni vista de otra fase.** Todo lo de la migración es nuevo. Donde hace falta una regla de otra fase (estado "por facturar", "esperando NC"), se **replica** con una cita a su origen, y los escenarios comparan contra la vista original.
>
> Las decisiones que necesitan al usuario están en **§13**. Cada una trae la recomendación que asume el resto de la spec.

## 0. Qué cambia, en una línea

Compras **avisa sola** cinco cosas: pedido listo para facturar, pedido demorado, diferencias sin resolver, nota de crédito que no llega y stock bajo el mínimo. Cada aviso lleva a su entidad, se manda **una sola vez por episodio** y se configura (prendido o apagado, días) desde una pantalla nueva, **Compras › Avisos**. Los chequeos corren en **un cron diario** (más un botón "Revisar ahora"). El **Dashboard** suma una franja de KPIs de compras: cada número es un link a la lista ya filtrada, y los montos los ve solo admin.

## 1. Relevamiento del código vigente (`qa` @ `a327cd9`, 2026-10-06)

### 1.1 Cómo funcionan hoy los avisos

| Pieza | Dónde | Qué hace |
|---|---|---|
| `enviarPush({ userIds, title, body, url, tipo, tag })` | `lib/push/sendPush.ts` | Con service role: inserta **una fila por usuario** en `notificaciones` (la campanita, `components/ui/NotificationBell.tsx`, por realtime) y manda Web Push a sus `push_subscriptions`. Sin VAPID solo queda la campanita. Es en proceso: sirve desde rutas con sesión y desde el cron. |
| Solicitud nueva + sobrestock | `app/api/fabrica/solicitudes/notificar/route.ts` | Destinatarios: `profiles` activos con `rol = admin` **o** `modulos_permitidos && MODULOS_COMPRAS`. URL con `rutaDe({ tipo: 'solicitud' })`. |
| Solicitud descartada | `…/descartada/route.ts` | A `supervisor_fabrica` y admin. |
| Pedidos de locales | `app/api/notificaciones/pedidos/route.ts` | Otro circuito (pedidos de locales), no se toca. |
| Cron de tareas | `app/api/cron/recordatorios-tareas/route.ts` + `vercel.json` (`0 11 * * *`) | Chequea `Authorization: Bearer ${CRON_SECRET}`. Dedup con una columna (`recordatorio_enviado_at`). **Bug latente:** si `CRON_SECRET` no está definido, el header `Bearer undefined` pasa. B5 no lo copia (ver §5.3). |
| `public/sw.js` | | Al tocar el push abre `data.url` (o enfoca una pestaña que ya la tiene). |

**Ninguno de los 5 avisos de B5 existe.** No hay ninguna tabla de "ya avisé" genérica.

### 1.2 Lo que B5 aprovecha

| Qué | Dónde |
|---|---|
| `rutaDe` (pedido, insumo, devolución con `pedidoId`), `rutaPedidos(filtro)` (`?estado=`) | `lib/compras/rutas.ts` |
| `?estado=` en Pedidos (B3), `useQuitarParams`, `useAlCambiarParam` | `PedidosClient.tsx:94-100`, `components/ui/useParamDeepLink.ts` |
| `estaDemorado`, `DIAS_DEMORA = 3` con `TODO(config): compras_config 'pedidos.dias_demora'` | `lib/compras/estadoPedido.ts:48-83` |
| `filtroDelPedido` / `recibidoSinFacturar` ("Por facturar", E14 de B3) | `estadoPedido.ts:200-211`, `lib/compras/reportes.ts:145` |
| `recepcionCompleta` (recibido, cerrado a mano o devuelto) y `hayDiferencias` | `lib/compras/diferencias.ts:101`, `pedidos/modelo.ts:96` |
| `espera_nota_credito` (regla de `20261006153000`) y `devolucionEsperaNc` | `v_compras_devoluciones`, `modelo.ts:86` |
| `resumirPagos` y su invariante `facturado = pagado + pendiente + sinGasto + aFavor` | `lib/compras/reportes.ts:80` |
| Stock "bajo" = insumo activo y `cantidad < stock_minimo` (sin fila de stock = 0); toggle `soloBajo` | `app/admin/compras/stock/StockClient.tsx:78-110` |
| `compras_config` (clave `text`, valor `jsonb`): lectura `tiene_lectura_conteos()`, escritura `es_admin()` | `20260924120000`, `20261005160000:156` |
| Patrón de server action que escribe `compras_config` | `app/admin/proveedores/plantillas/acciones.ts` (`guardarWhatsappAdministracion`) |
| `after()` de `next/server` (corre después de responder; válido en Server Functions) | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` |
| `verificarEntornoServidor()` (cruza URL y keys de Supabase) | `lib/entorno.ts:96` |

### 1.3 Lo que condiciona el diseño

1. **Las vistas de compras no sirven desde el cron.** `v_compras_pedido_pendiente`, `v_compras_devoluciones` y `v_compras_facturas` filtran con `tiene_acceso_compras()` / `es_admin()`, que miran `auth.uid()`. Con service role, `auth.uid()` es `null` y las vistas devuelven **0 filas**. Por eso los candidatos salen de una función `security definer` que lee las tablas base y que **solo puede ejecutar `service_role`** (§3.5).
2. **Las diferencias no se recrean:** `compras_recalcular_diferencias_factura` actualiza la fila y, cuando cambian las cantidades, la devuelve a `pendiente` con `updated_at = now()`. **"Pendiente desde" = `updated_at`** de la fila pendiente. Al anular la factura se borran.
3. **Los pedidos de Pedidos se cargan enteros** (`pedidos/page.tsx`, deuda de F9). El filtro nuevo `?alerta=` filtra en el cliente sobre lo que ya se carga: no agrega consultas.
4. **El Dashboard** (`app/admin/dashboard/page.tsx`) no es `soloAdmin`: un squad con el módulo `dashboard` también entra. Hoy usa clases con hex; la franja nueva va con tokens semánticos.
5. **No hay pantalla de parámetros de Compras.** `compras_config` solo se edita para `factura.whatsapp_admin` (desde Plantillas).

### 1.4 Vercel Cron: lo que se verificó

`node_modules/next/dist/docs/` no habla de Vercel Cron (solo de `after()` y de self-hosting). Se verificó en la documentación de Vercel ([Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing), [changelog de 100 por proyecto](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan), [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)):

- **Hobby:** hasta 100 crons por proyecto, pero **cada uno como mucho una vez por día**. Una expresión más frecuente hace fallar el deploy.
- **Precisión de una hora:** `0 10 * * *` corre en cualquier momento entre 10:00 y 10:59 UTC.
- **Los crons solo se invocan en el deployment de producción.** Los previews no los corren.
- Vercel manda `Authorization: Bearer <CRON_SECRET>` si la variable existe en el proyecto.

Consecuencias para B5:

- **Un solo cron diario nuevo** (`/api/cron/avisos-compras`) que corre **todos** los chequeos. El de tareas queda como está (no se mezclan: si uno falla, el otro sigue).
- **En QA no corre ningún cron:** `qa.yachipacitos.com.ar` es el preview de la rama `qa`. Mientras B5 no llegue a `main`, **el cron tampoco corre en prod**: no se toca prod. En QA, los avisos del cron se disparan con el botón **"Revisar ahora"** de Compras › Avisos, que corre el mismo código. El aviso de "listo para facturar" sí funciona en QA, porque sale al guardar el remito, no del cron.
- El día de la release (lo decide el usuario), el cron empieza a correr en prod contra prod: es el entorno donde corre. Ver §14.

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §13)

| # | Decisión | Por qué |
|---|---|---|
| **E1** | Una tabla `compras_avisos_enviados` con `unique (tipo, entidad_id)` es el **"ya avisé"**. Mientras la entidad sigue en falta, no se repite. Cuando deja de estar en falta, la fila se borra y el próximo episodio vuelve a avisar. | Sin spam, y se rearma solo: un insumo que vuelve a bajar del mínimo el mes que viene se avisa de nuevo. |
| **E2** | `huella` en la fila: si cambia, es otro episodio aunque la entidad siga en falta. Solo la usa "demorado" (`enviado_en`): un **reenvío** al proveedor reinicia la cuenta. | Un pedido reenviado que sigue sin llegar es un problema nuevo. |
| **E3** | **Tomar antes de mandar**, en una sola función SQL con `pg_advisory_xact_lock`: calcula candidatos, borra los resueltos, inserta los nuevos y devuelve **solo lo que hay que avisar**. El TS manda eso y nada más. | El cron, el botón y el remito pueden correr a la vez sin mandar dos veces. Si el push falla, no se reintenta (a lo sumo una vez): la campanita igual lo tiene y el tablero lo muestra. |
| **E4** | **Agrupado por tipo y destinatario:** un candidato → aviso con su entidad (`rutaDe`). Varios → **un** aviso "3 pedidos demorados: P-0075, P-0077 y P-0081" que lleva a la lista ya filtrada. `tag` fijo por tipo (`compras_<tipo>`): en el celular, el de mañana pisa al de hoy. | La primera corrida en dev (y en prod el día de la release) encuentra todo el atraso acumulado: con agrupado son como mucho 5 avisos, no 40. Ver §13 D1. |
| **E5** | "Listo para facturar" sale **al guardar el remito** (`after()` en `guardarRemito`), y el cron lo repite como red por si `after()` falló. Solo avisa si el pedido **quedó** en "Por facturar". No se le avisa a quien cargó el remito. | Es el único aviso que tiene que llegar en el momento. Un remito parcial no está "listo para facturar". |
| **E6** | Los **candidatos** salen de helpers SQL compartidos entre el cron y el tablero (§3.4). El número del KPI y el conjunto que avisa el cron salen de la misma consulta. | El KPI y el aviso no pueden decir cosas distintas. |
| **E7** | Las reglas de otras fases se **replican** en SQL con cita (no se redefine nada): "Por facturar" (`filtroDelPedido`), "demorado" (`estaDemorado`), "diferencias" (`hayDiferencias`), "espera NC" (`v_compras_devoluciones.espera_nota_credito` de `20261006153000`), "bajo" (`StockClient`). Los escenarios comparan la réplica contra la vista o contra los conteos de la pantalla. | La consigna: no redefinir funciones de otras fases sin necesidad. |
| **E8** | `pedidos.dias_demora` (la clave que ya anunciaba el `TODO(config)`) pasa a `compras_config` y la leen **todos**: el aviso, el KPI, la lista de Pedidos, el detalle ("conviene llamar al proveedor") y la ficha del proveedor. | Si el usuario pone 5 días, "demorado" tiene que significar lo mismo en todas las pantallas. |
| **E9** | **Destinatarios fijos por tipo**, resueltos en el servidor (nunca los elige el cliente), solo `profiles.estado = 'activo'`: ver tabla §4.2. | La factura, las diferencias y la NC son de admin (P1, F5, B4 D6). El pedido y el stock son de quien compra. |
| **E10** | El tablero sale de **una RPC** `compras_tablero_resumen()` que devuelve agregados (jsonb): **cero filas** viajan al navegador. Los montos vienen en `null` si no es admin, **en la base**, no solo en la pantalla. | "Consultas acotadas, sin traer tablas enteras" y "solo admin ve los montos". |
| **E11** | Las listas filtradas: `?alerta=por_recibir|demorados|diferencias|nc` en Pedidos (nuevo), `?estado=por_facturar` (ya existe) y `?bajo=1` en Stock (nuevo). | Cada KPI y cada aviso agrupado llevan a una lista que muestra **exactamente** esos N. |
| **E12** | El cron se protege con `CRON_SECRET` comparado en tiempo constante, rechaza si el secret **falta o es corto** (< 16), y responde 503 si `verificarEntornoServidor()` no da OK. | Arregla en la ruta nueva el agujero del cron de tareas y no corre contra un entorno mal configurado. |
| **E13** | Cada corrida queda en `compras_avisos_corridas` (origen, cuándo, cuántos de cada tipo, error). Compras › Avisos muestra la última y el historial reciente. | Es la única forma de saber, el día de la release, si el cron de prod corrió. |

## 3. Migración `supabase/migrations/20261006170000_compras_avisos_tablero.sql`

Todo es nuevo. No redefine ninguna función, vista ni política existente.

### 3.1 Configuración (seed en `compras_config`, `on conflict (clave) do nothing`)

| Clave | Valor inicial | Descripción (va a la columna `descripcion`) |
|---|---|---|
| `pedidos.dias_demora` | `3` | Días desde el envío para considerar demorado un pedido que no llegó completo. |
| `avisos.remito_listo.activo` | `true` | Avisar a admin cuando un pedido queda listo para facturar. |
| `avisos.pedido_demorado.activo` | `true` | Avisar los pedidos demorados (usa `pedidos.dias_demora`). |
| `avisos.diferencias.activo` | `true` | Avisar diferencias de factura sin resolver. |
| `avisos.diferencias.dias` | `3` | Días que una diferencia puede quedar pendiente antes de avisar. |
| `avisos.nc_pendiente.activo` | `true` | Avisar devoluciones que esperan la nota de crédito. |
| `avisos.nc_pendiente.dias` | `7` | Días esperando la nota de crédito antes de avisar. |
| `avisos.stock_bajo.activo` | `true` | Avisar insumos bajo el mínimo que no tienen un pedido abierto. |
| `avisos.repetir_dias` | `0` | Cada cuántos días repetir un aviso que sigue sin resolverse (0 = no repetir). |

Valores escalares en `jsonb`, como `sobrestock.umbral_unidades`. Se leen con dos helpers internos:

```sql
create function public._compras_config_num(p_clave text, p_default numeric) returns numeric
  language sql stable security definer set search_path = public
as $$ select coalesce((select (valor #>> '{}')::numeric from compras_config where clave = p_clave), p_default) $$;

create function public._compras_config_bool(p_clave text, p_default boolean) returns boolean
  language sql stable security definer set search_path = public
as $$ select coalesce((select (valor #>> '{}')::boolean from compras_config where clave = p_clave), p_default) $$;
```

Un valor que no castea **no** tiene que romper el cron: el Ejecutor los envuelve para que un valor inválido caiga en el default (por ejemplo, con una regex antes del cast). La server action valida antes de escribir (§4.3), así que en la práctica no pasa.

### 3.2 `compras_avisos_enviados` (el "ya avisé")

```sql
create table public.compras_avisos_enviados (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('remito_listo','pedido_demorado','diferencias','nc_pendiente','stock_bajo')),
  entidad_id  uuid not null,          -- pedido, devolución o insumo según el tipo
  pedido_id   uuid,                   -- para el link y para acotar por pedido (null en stock_bajo)
  huella      text not null default '',
  primer_aviso_en timestamptz not null default now(),
  enviado_en  timestamptz not null default now(),   -- último envío (para repetir_dias)
  envios      int not null default 1,
  unique (tipo, entidad_id)
);
alter table public.compras_avisos_enviados enable row level security;
create policy compras_avisos_enviados_lectura on public.compras_avisos_enviados
  for select to authenticated using (es_admin());
-- Sin políticas de escritura: solo escribe compras_avisos_tomar (security definer).
```

Sin FK a la entidad, a propósito: un pedido eliminado deja su fila huérfana y la próxima corrida la borra (deja de ser candidato).

### 3.3 `compras_avisos_corridas` (E13)

```sql
create table public.compras_avisos_corridas (
  id         uuid primary key default gen_random_uuid(),
  origen     text not null check (origen in ('cron','manual','remito')),
  corrida_en timestamptz not null default now(),
  por        uuid references profiles(id) on delete set null,   -- quien tocó "Revisar ahora"
  resultado  jsonb not null default '{}'::jsonb,                -- { tipo: { candidatos, avisados, destinatarios } }
  error      text
);
create index on public.compras_avisos_corridas (corrida_en desc);
alter table public.compras_avisos_corridas enable row level security;
create policy compras_avisos_corridas_lectura on public.compras_avisos_corridas
  for select to authenticated using (es_admin());
```

La inserta el runner con service role (§5.1). No se purga (es una fila por día; F9 puede sumar una limpieza).

### 3.4 Helpers de candidatos (internos; `revoke execute … from public, anon, authenticated`)

Todos `stable security definer set search_path = public`, leen **tablas base** y devuelven las columnas que necesitan el aviso y el KPI. Cada uno lleva en el comentario la regla que replica.

**a. `_compras_pedidos_por_recibir()`** → `pedido_id, numero, proveedor_nombre, enviado_en`
`estado_recepcion in ('enviado','parcial')`. Incluye los facturados que todavía esperan mercadería (siguen "por recibir").

**b. `_compras_pedidos_demorados(p_dias int)`** → lo de (a) + `dias`
Replica `estaDemorado`: de (a), `enviado_en is not null and enviado_en <= now() - make_interval(days => p_dias)`. `floor((ahora − enviado)/día) ≥ N` es lo mismo que `enviado ≤ ahora − N días`.

**c. `_compras_pedidos_por_facturar()`** → `pedido_id, numero, proveedor_id, proveedor_nombre, desde`
Replica `filtroDelPedido = 'por_facturar'`: `estado_facturacion = 'sin_facturar'` y (`estado_recepcion = 'recibido'` o (`estado_recepcion = 'cerrado_manual'` y existe un `compras_remitos` del pedido)). `recibioAlgo` del modelo es "tiene remito". `desde` = fecha del último remito (para el texto).

**d. `_compras_pedidos_con_diferencias()`** → `pedido_id, numero, proveedor_nombre, factura_id, pendientes int, desde timestamptz`
Replica `hayDiferencias`: factura `tipo_comprobante = 'factura'` y `estado = 'confirmada'`, con alguna `compras_factura_discrepancias.resolucion = 'pendiente'`, y el pedido con `estado_recepcion in ('recibido','cerrado_manual','devuelto')` (`recepcionCompleta`). `desde = min(updated_at)` de sus pendientes (§1.3.2).

**e. `_compras_devoluciones_esperan_nc()`** → `devolucion_id, pedido_id, numero, secuencia, codigo, proveedor_nombre, desde`
Copia **textual** de la expresión `espera_nota_credito` de `v_compras_devoluciones` (`20261006153000`), con la cita. `codigo = _compras_codigo_devolucion(numero, secuencia)`. `desde = greatest(d.created_at, f.confirmada_en)` de la factura que la hace esperar: el reloj corre desde que **hay** una factura que la NC tiene que corregir.

**f. `_compras_insumos_bajo_minimo()`** → `item_id, nombre, unidad, cantidad, minimo, en_pedido boolean`
Replica `StockClient`: `compras_items.estado = 'activo'` y `coalesce(s.cantidad, 0) < i.stock_minimo` (left join `compras_stock_actual`). `en_pedido` = existe una línea `compras_pedido_items.item_id = i.id` en un pedido con `estado_recepcion in ('sin_enviar','enviado','parcial')`. Aproximación aceptada: un parcial donde esa línea ya llegó completa cuenta como "en pedido".

### 3.5 `compras_avisos_tomar(p_tipos text[] default null, p_pedido_id uuid default null)` (E1–E3)

`security definer`, `set search_path = public`. **`revoke execute … from public, anon, authenticated; grant execute … to service_role`.** La llaman solo el runner del cron, el botón y el remito, siempre con el cliente de service role.

```
returns table (
  tipo text, entidad_id uuid, pedido_id uuid,
  numero int, codigo text, proveedor_nombre text, insumo_nombre text, unidad text,
  cantidad numeric, minimo numeric, dias int, pendientes int, repetido boolean
)
```

Pasos, dentro de la transacción:

1. `perform pg_advisory_xact_lock(hashtext('compras_avisos'))`.
2. Lee la config (§3.1). Un tipo **apagado** no se toma. `p_tipos null` = los 5.
3. Arma los candidatos de cada tipo pedido (CTE por tipo):
   - `remito_listo` ← (c); `entidad_id = pedido_id`.
   - `pedido_demorado` ← (b) con `pedidos.dias_demora`; `huella = enviado_en::text`.
   - `diferencias` ← (d) con `desde <= now() - avisos.diferencias.dias`; `entidad_id = pedido_id`.
   - `nc_pendiente` ← (e) con `desde <= now() - avisos.nc_pendiente.dias`; `entidad_id = devolucion_id`.
   - `stock_bajo` ← (f) con `not en_pedido`; `entidad_id = item_id`.
   - Con `p_pedido_id`, todo se acota a ese pedido (no aplica a `stock_bajo`).
4. **Rearma:** borra de `compras_avisos_enviados` las filas de los tipos tomados que ya **no** son candidatas (con `p_pedido_id`, solo las de ese pedido). Un tipo apagado no se toca: si se vuelve a prender, no repite lo que ya avisó.
5. **Toma:** `insert … on conflict (tipo, entidad_id) do update set huella, enviado_en = now(), envios = envios + 1 where huella distinta or (repetir_dias > 0 and enviado_en <= now() - repetir_dias) returning …`. Lo que vuelve es lo que hay que avisar; `repetido = envios > 1`.
6. Devuelve esas filas con los datos del texto (join con lo que trajo el CTE).

Esta función **no** manda nada: no sabe de push.

### 3.6 `compras_tablero_resumen()` (E10)

`security definer`, `stable`, `set search_path = public`. `revoke … from public, anon; grant execute … to authenticated`.

- Sin `tiene_acceso_compras()` → `raise exception 'No autorizado'` (`42501`).
- Devuelve **un** `jsonb`:

| Campo | Para quién | Cálculo |
|---|---|---|
| `dias_demora` | todos | `pedidos.dias_demora` |
| `por_recibir` | todos | `count(*)` de (a) |
| `demorados` | todos | `count(*)` de (b) |
| `por_facturar` | todos | `count(*)` de (c) |
| `stock_bajo` | todos | `count(*)` de (f), **todos** (con y sin pedido): es lo que muestra Stock con `?bajo=1` |
| `stock_bajo_sin_pedido` | todos | los de (f) con `not en_pedido` (el subtexto "N sin pedido") |
| `por_facturar_estimado` | **admin** | ver abajo |
| `por_facturar_sin_precio` | **admin** | líneas de (c) sin `precio_ref` |
| `diferencias` | **admin** | `count(*)` de (d), sin umbral de días |
| `nc_pendientes` | **admin** | `count(distinct pedido_id)` de (e), sin umbral (la lista es de pedidos) |
| `deuda_pendiente` | **admin** | ver abajo |
| `deuda_a_favor` | **admin** | ver abajo |

Para quien no es admin, los campos de admin vienen en `null` (la RPC chequea `es_admin()` adentro).

**`por_facturar_estimado`** (D3): por cada línea de los pedidos de (c), con `pi.item_id` no nulo: neto = recibido − devuelto (`compras_remito_items` / `compras_devolucion_items` activas con mercadería, como `v_compras_pedido_pendiente`). Si `coalesce(ip.cobra_por, i.cobra_por_default) = 'base'`, se usa `recibido_base − devuelto_base`, y donde falta el dato real, `neto × i.cantidad_por_unidad`. Por `ip.precio_ref` del par (item, proveedor del pedido). Sin IVA. Las líneas sin `precio_ref` o sin `item_id` no suman y se cuentan en `por_facturar_sin_precio`.

**Deuda** (replica `estadoPago` + `resumirPagos` de `lib/compras/reportes.ts:49-96`, sobre facturas y NC `estado = 'confirmada'`, con signo −1 para NC):
- `deuda_a_favor` = Σ(−total) de NC con `nc_gasto = 'a_favor'`. Es negativo o 0.
- `deuda_pendiente` = Σ(signo × total) de los comprobantes que `estadoPago` da `pendiente` o `parcial`: no es NC `a_favor` ni NC `sin_gasto`, tiene gasto (propio o heredado de su factura origen, como `v_compras_facturas`) y ese gasto no está `Pagado`.
- Se filtra **en la base**: el `where` toma solo los confirmados con gasto no pagado o NC a favor, y agrega con `sum`. No se trae ninguna fila.

### 3.7 Grants y después

- `revoke` de los helpers de §3.4 y de `_compras_config_*` a `public, anon, authenticated`.
- `compras_avisos_tomar` solo a `service_role`. `compras_tablero_resumen` a `authenticated`.
- `npm run types` después del push (trae 2 tablas y 2 RPC).

## 4. Avisos

### 4.1 Textos (los arma `lib/compras/avisos.ts`, puro)

`P-xxxx` sale de `codigoPedido`. Montos: ninguno en los avisos (ni siquiera en los de admin: el push se ve en la pantalla bloqueada).

| Tipo | Uno solo: título / cuerpo / url | Varios: título / cuerpo / url |
|---|---|---|
| `remito_listo` | 📦 Listo para facturar / "P-0081 de GLOBAL: llegó todo. Cargá la factura cuando llegue." / `rutaDe(pedido)` | 📦 N pedidos listos para facturar / "P-0081, P-0082 y P-0090" (máx. 5 códigos + "y N más") / `rutaPedidos('por_facturar')` |
| `pedido_demorado` | 🚚 Pedido demorado / "P-0075 a GLOBAL se envió hace 5 días y no llegó completo." / `rutaDe(pedido)` | 🚚 N pedidos demorados / códigos / `rutaPedidosAlerta('demorados')` |
| `diferencias` | ⚖️ Diferencias sin resolver / "P-0080 (GLOBAL): 2 diferencias con la factura hace 4 días." / `rutaDe(pedido)` | ⚖️ N pedidos con diferencias / códigos / `rutaPedidosAlerta('diferencias')` |
| `nc_pendiente` | 🧾 Falta la nota de crédito / "D-0080-02 (GLOBAL) la espera hace 8 días." / `rutaDe({ tipo: 'devolucion', id, pedidoId })` | 🧾 N devoluciones esperan su NC / códigos D-… / `rutaPedidosAlerta('nc')` |
| `stock_bajo` | 📉 Stock bajo el mínimo / "Queso Barra: 1,5 Caja (mínimo 3). No hay pedido abierto." / `rutaDe(insumo)` | 📉 N insumos bajo el mínimo / nombres / `rutaStockBajo()` |

- Si es un **repetido** (`repetir_dias`), el título lleva "(sigue)".
- `tipo` de `notificaciones` = `compras_<tipo>`. `tag` = `compras_<tipo>`.

### 4.2 Destinatarios (E9)

| Tipo | Reciben |
|---|---|
| `remito_listo`, `diferencias`, `nc_pendiente` | `rol = 'admin'` |
| `pedido_demorado` | admin + `modulos_permitidos && {compras-pedidos}` |
| `stock_bajo` | admin + `modulos_permitidos && {compras-pedidos, compras-stock}` |

Siempre `estado = 'activo'`. Una sola consulta a `profiles` por corrida (`id, rol, modulos_permitidos`), y el reparto se hace en TS con una función pura (`destinatariosDe(tipo, perfiles)`, con su check). En `remito_listo` se excluye a quien guardó el remito (E5).

### 4.3 Pantalla Compras › Avisos (`/admin/compras/avisos`, solo admin)

- **Módulo nuevo** en `lib/modulos.tsx`: `{ key: 'compras-avisos', label: 'Avisos', icon: <BellRing size={16} />, href: '/admin/compras/avisos', section: 'Compras', soloAdmin: true }`. **Avisarle al coordinador** (archivo compartido). No entra en `MODULOS_COMPRAS` (es de admin).
- `page.tsx` (server): lee las 9 claves de §3.1, la última corrida y las 30 últimas filas de `compras_avisos_enviados` (con `order by enviado_en desc limit 30`). Para el link de cada fila: los números de pedido y los nombres de insumo de **esas** filas, en una consulta con `in (…)`.
- `AvisosClient.tsx`:
  - Una **tarjeta por aviso** (5): ícono lucide, nombre, qué lo dispara en una línea, **switch** prendido/apagado, días (input numérico chico, donde aplica; para "demorado" dice "Se usa también en Pedidos y en la ficha del proveedor") y "Lo reciben: …" (texto de la tabla §4.2).
  - **Repetir:** "Si sigue sin resolverse, volver a avisar cada [0] días (0 = una sola vez)".
  - **Guardar** (sticky en 375 px) → toast "Avisos guardados". Sin cambios → toast "No había cambios".
  - **Revisar ahora** (secundario) → corre todos los chequeos con origen `manual` → toast con el resumen ("Se avisaron 2 pedidos demorados y 1 insumo bajo el mínimo" / "No había nada nuevo para avisar").
  - **Última revisión:** "Hoy 07:12 · automática · 3 avisos" o "Todavía no corrió". Si la última automática tiene más de 26 h y hay alguna corrida automática anterior, aviso ámbar "El aviso automático no corrió ayer". En QA no hay corridas automáticas: dice "Las revisiones automáticas corren solo en producción. Acá usá Revisar ahora."
  - **Avisos recientes:** tabla compacta (fecha, tipo con chip, entidad con `LinkEntidad`, "repetido N"). Vacío: `EmptyState`.
- `acciones.ts` (`'use server'`, `Resultado<T>`):
  - `guardarConfigAvisos(entrada)`: zod (`activo: boolean`, días `int 1..60`, `repetir_dias int 0..30`, `pedidos.dias_demora int 1..60`). Chequea admin con el cliente del usuario (error claro) y hace `upsert` de las claves con `updated_at` (la RLS `es_admin()` es el respaldo). Devuelve `{ cambios }`. `revalidatePath` de Avisos, Pedidos, Proveedores y Dashboard.
  - `revisarAvisosAhora()`: chequea admin y llama `correrAvisos({ origen: 'manual', por: user.id })`. Devuelve el resumen.

### 4.4 "Listo para facturar" al guardar el remito (E5)

En `app/admin/compras/pedidos/remitos/acciones.ts` › `guardarRemito`, **después** del `ok` de la RPC y solo si `cambios`:

```ts
after(() => avisarRemitoListo(pedidoId, user.id))   // user.id del cliente de sesión
```

`avisarRemitoListo` (en `lib/compras/avisosServidor.ts`) = `correrAvisos({ origen: 'remito', tipos: ['remito_listo'], pedidoId, excluir: userId })`. Captura y loguea sus errores: **nunca** cambia el resultado del remito. `eliminarRemito` no avisa: el rearme lo hace la próxima toma (§3.5.4).

No se toca la RPC `compras_guardar_remito` (dueña A2b).

## 5. Cron y runner

### 5.1 `lib/compras/avisosServidor.ts` (nuevo, `import 'server-only'`)

```ts
export async function correrAvisos(op: {
  origen: 'cron' | 'manual' | 'remito'
  tipos?: TipoAviso[]          // default: los 5
  pedidoId?: string
  excluir?: string             // user id que no recibe
  por?: string                 // quien tocó "Revisar ahora"
}): Promise<ResumenCorrida>
```

1. Cliente de service role (como `sendPush.ts`).
2. `rpc('compras_avisos_tomar', { p_tipos, p_pedido_id })` → filas (zod).
3. Sin filas → registra la corrida y vuelve (salvo origen `remito`, que solo se registra si avisó, para no llenar la tabla con una fila por remito).
4. `perfiles` = una consulta a `profiles` (`estado = 'activo'`, admin o con algún módulo de compras).
5. `armarAvisos(filas)` (puro) → mensajes por tipo. Para cada uno: `destinatariosDe(tipo, perfiles)` menos `excluir` → `enviarPush(...)`.
6. Inserta `compras_avisos_corridas` con `{ tipo: { candidatos, avisados, destinatarios } }`, o `error` si algo tiró.
7. Devuelve el resumen (lo usan el cron, el toast y el log).

### 5.2 `lib/compras/avisos.ts` (nuevo, puro) + `lib/compras/_check_avisos.ts`

- `type TipoAviso = 'remito_listo' | 'pedido_demorado' | 'diferencias' | 'nc_pendiente' | 'stock_bajo'`
- `armarAvisos(filas: FilaAviso[]): MensajeAviso[]`: agrupa por tipo, uno vs. varios, máximo 5 códigos + "y N más", "(sigue)" en los repetidos, urls con `rutas.ts`.
- `destinatariosDe(tipo, perfiles)`: la tabla §4.2.
- `resumenCorrida(resultado)`: el texto del toast ("Se avisaron …" / "No había nada nuevo para avisar").
- `leerConfigAvisos(filas)`: de filas `{ clave, valor }` de `compras_config` a un objeto tipado con defaults (lo usan Avisos, Pedidos, Proveedores y Dashboard).
- Check: ≥ 25 casos (uno y varios por tipo, "y N más", plural, repetido, cada destinatario, excluir al autor, config con claves faltantes o inválidas → default).

### 5.3 `app/api/cron/avisos-compras/route.ts` (nuevo)

```ts
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return NextResponse.json({ error: 'Cron sin configurar' }, { status: 503 })
  if (!secretCoincide(request.headers.get('authorization'), `Bearer ${secret}`)) {   // timingSafeEqual con largo igualado
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const entorno = verificarEntornoServidor()
  if (!entorno.ok) return NextResponse.json({ error: mensajeEntorno(entorno) }, { status: 503 })
  const resumen = await correrAvisos({ origen: 'cron' })
  return NextResponse.json(resumen)
}
```

- `vercel.json` suma `{ "path": "/api/cron/avisos-compras", "schedule": "0 10 * * *" }` (07:00–07:59 en Argentina, antes del de tareas). El de tareas no se toca.
- Verificar que `proxy.ts` deja pasar `/api/cron/avisos-compras` sin sesión, igual que `/api/cron/recordatorios-tareas`.
- `ARQUITECTURA.md`: sumar la ruta en la tabla de endpoints (línea ~1739) y en la de crons.

## 6. Tablero y listas filtradas

### 6.1 Dashboard (`app/admin/dashboard/page.tsx`)

- Lee el perfil (`rol`, `modulos_permitidos`). Si `tieneAccesoCompras(rol, modulos)`, llama `rpc('compras_tablero_resumen')` en el mismo `Promise.all`. Si falla, la franja muestra "No se pudieron cargar los números de compras" (no rompe el dashboard).
- Componente nuevo `app/admin/dashboard/TableroCompras.tsx` (server, sin estado): título "Compras" + grilla `grid-cols-2 lg:grid-cols-4`. Cada tarjeta es un `Link` (si el usuario tiene el módulo destino; si no, texto, con la misma regla que `LinkEntidad`: `puedeEntrarAdmin`).

| Tarjeta | Ícono | Valor | Subtexto | Link | Quién |
|---|---|---|---|---|---|
| Por recibir | `Truck` | `por_recibir` | "N demorados" en ámbar si > 0 | `rutaPedidosAlerta('por_recibir')` | todos |
| Demorados | `Clock` (ámbar si > 0) | `demorados` | "Más de N días sin llegar" | `rutaPedidosAlerta('demorados')` | todos |
| Recibidos sin facturar | `ReceiptText` | admin: `≈ $ estimado`; otros: el conteo | admin: "N pedidos · a precio de referencia, sin IVA" (+ "· N líneas sin precio") | `rutaPedidos('por_facturar')` | todos (monto solo admin) |
| Diferencias | `Scale` | `diferencias` | "pedidos con diferencias por resolver" | `rutaPedidosAlerta('diferencias')` | admin |
| Deuda con proveedores | `Wallet` | `$ deuda_pendiente` | "A favor −$ X" si `deuda_a_favor < 0`, "Neto $ Y" | `/admin/gastos/pendientes` | admin |
| NC pendientes | `FileMinus` | `nc_pendientes` | "pedidos esperando nota de crédito" | `rutaPedidosAlerta('nc')` | admin |
| Bajo el mínimo | `PackageMinus` | `stock_bajo` | "N sin pedido abierto" | `rutaStockBajo()` | todos |

- Con 0 en todo: las tarjetas muestran 0 en tono neutro; no hay estado vacío especial.
- Tokens semánticos (`text-warning`, `bg-surface`, `text-muted`…), `tabular-nums`, `formatearMoneda` de `lib/formato`. Lo viejo del dashboard (hex) no se toca.

### 6.2 `?alerta=` en Pedidos (E11)

- `lib/compras/rutas.ts`: `export type AlertaPedidos = 'por_recibir' | 'demorados' | 'diferencias' | 'nc'`, `rutaPedidosAlerta(a)` → `/admin/compras/pedidos?alerta=a` y `rutaStockBajo()` → `/admin/compras/stock?bajo=1`.
- `lib/compras/estadoPedido.ts`: `coincideAlerta(v, a)` puro, sobre `{ estado_recepcion, demorado, hayDiferencias, devolucionEsperaNc }`:
  - `por_recibir`: `enviado | parcial`;
  - `demorados`: `demorado`;
  - `diferencias`: `hayDiferencias`;
  - `nc`: `devolucionEsperaNc != null`.
  
  Con casos en `_check_estado`.
- `PedidosClient.tsx`:
  - lee `alerta` como lee `estado`;
  - con `alerta` válida, el filtro de pestañas queda en **Todos** y la lista se filtra además por `coincideAlerta`;
  - arriba de la lista, un chip "Demorados · 3" con ✕. El ✕, elegir otra pestaña o la búsqueda limpia **no** lo sacan solo: el ✕ hace `useQuitarParams('alerta')`;
  - estado vacío propio por alerta ("No hay pedidos demorados").
  - `diferencias` y `nc` para no admin: la vista ya no trae esos datos, así que la alerta se ignora (lista normal).

### 6.3 `pedidos.dias_demora` en las pantallas (E8)

- `estadoPedido.ts`:
  - `estaDemorado(p, ahora = new Date(), dias = DIAS_DEMORA)`;
  - `proximaAccion(p, ahora, dias = DIAS_DEMORA)`.
  
  `DIAS_DEMORA` queda como default, y se borra el `TODO(config)`.
- `pedidos/page.tsx` lee `pedidos.dias_demora` (una fila) y lo pasa a `PedidosClient` → `armarVistas(…, diasDemora)` → `estaDemorado`. También al tooltip "Enviado hace N días o más…" y a `PedidoDetalle` → `proximaAccion`.
- `app/admin/proveedores` (la página que arma `FichaPaneles`): mismo dato, a `estaDemorado` de `FichaPaneles.tsx:97`.

### 6.4 `?bajo=1` en Stock

`app/admin/compras/stock/page.tsx` lee `bajo` y lo pasa a `StockClient` como `soloBajoInicial`. `useState(soloBajoInicial)`. Al apagar el toggle, `useQuitarParams('bajo')`.

## 7. Casos borde

1. **Primera corrida con atraso acumulado** (dev hoy; prod el día de la release): sale un aviso agrupado por tipo y por persona. Después, solo lo nuevo.
2. **Remito que completa un pedido ya facturado:** queda "Facturado", no "Por facturar": no avisa.
3. **Remito desde la factura** (`origen = 'factura'`): el pedido queda facturado. No pasa por `guardarRemito`, así que tampoco avisa.
4. **Remito parcial:** no avisa. El que completa, sí.
5. **Editar un remito sin cambios** (`cambios: false`): no llama a `after()`.
6. **Admin carga el remito:** no se avisa a sí mismo. Si es el único admin, no sale ningún push, pero la toma queda registrada (no la repite el cron).
7. **Se elimina el remito:** el pedido vuelve a "Recibiendo". En la próxima toma la fila se borra (rearme). Si después se completa de nuevo, avisa otra vez: es otro episodio.
8. **Pedido reenviado** al proveedor (B1): cambia `enviado_en` → cambia la huella → el demorado vuelve a contar desde el reenvío y se avisa de nuevo si vuelve a pasar los N días.
9. **Pedido cerrado a mano** con algo recibido: deja de ser demorado y pasa a "Por facturar" → `remito_listo` lo toma el **cron** (no hubo remito en ese momento). Es correcto: quedó listo para facturar.
10. **Diferencia que se resuelve y vuelve a pendiente** (otro remito cambia las cantidades): `updated_at` se renueva, así que el reloj de N días vuelve a empezar. Si ya se había avisado y la fila nunca dejó de estar pendiente en una toma, no se repite (salvo `repetir_dias`).
11. **Factura anulada:** sus diferencias se borran → el pedido deja de ser candidato → rearme.
12. **Devolución que repone o con NC cargada:** deja de esperar NC → rearme. Si se anula la NC, vuelve a esperar con `desde` de la devolución, que es vieja: puede avisar en la corrida siguiente. Aceptado: hace mucho que falta.
13. **Insumo bajo el mínimo con pedido abierto:** cuenta en el KPI (como en Stock) pero no avisa. Si el pedido se cierra sin que llegue, en la próxima corrida avisa.
14. **Insumo archivado:** no cuenta (la regla de Stock pide `activo`).
15. **`stock_minimo = 0`:** solo es "bajo" con stock negativo, igual que Stock.
16. **Aviso apagado y vuelto a prender:** las filas de "ya avisé" de ese tipo quedan como estaban. Lo que se resolvió mientras estaba apagado se borra en la primera toma con el tipo prendido.
17. **Cambiar `pedidos.dias_demora`:** cambia en todas las pantallas desde la próxima carga. Los avisos ya enviados siguen en el log hasta que el pedido deja de ser demorado con el valor nuevo.
18. **Dos corridas a la vez** (cron y "Revisar ahora", o dos remitos): el advisory lock las serializa. La segunda no encuentra nada nuevo.
19. **Usuario sin suscripción push:** igual le aparece en la campanita (`enviarPush` inserta siempre).
20. **Sin VAPID** (dev local sin claves): solo campanita. El cron igual responde 200 con el resumen.
21. **Squad con el módulo `dashboard` y sin compras:** no ve la franja (no llama a la RPC).
22. **Squad con compras y sin `compras-stock`:** la tarjeta "Bajo el mínimo" es texto, no link.
23. **QA preview:** sin cron. Si `CRON_SECRET` no está en las variables de Preview, el endpoint responde 503 "Cron sin configurar" y no corre nada.
24. **Pedido eliminado** con aviso registrado: deja de ser candidato → su fila se borra en la próxima toma.

## 8. Archivos

**En alcance**

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261006170000_compras_avisos_tablero.sql` | nuevo (§3) |
| `docs/bloque2/escenarios-B5.sql` | nuevo (§9.2) |
| `lib/compras/avisos.ts`, `lib/compras/_check_avisos.ts` | nuevos (§5.2) |
| `lib/compras/avisosServidor.ts` | nuevo (§5.1) |
| `app/api/cron/avisos-compras/route.ts` | nuevo (§5.3) |
| `vercel.json` | suma el cron |
| `app/admin/compras/avisos/page.tsx`, `AvisosClient.tsx`, `acciones.ts` | nuevos (§4.3) |
| `lib/modulos.tsx` | módulo `compras-avisos` (avisar al coordinador) |
| `app/admin/compras/pedidos/remitos/acciones.ts` | `after()` en `guardarRemito` (§4.4) |
| `app/admin/dashboard/page.tsx`, `TableroCompras.tsx` (nuevo) | §6.1 |
| `lib/compras/rutas.ts` | `AlertaPedidos`, `rutaPedidosAlerta`, `rutaStockBajo` |
| `lib/compras/estadoPedido.ts`, `_check_estado.ts` | `coincideAlerta`, `dias` en `estaDemorado` y `proximaAccion` |
| `app/admin/compras/pedidos/page.tsx`, `PedidosClient.tsx`, `modelo.ts`, `PedidoDetalle.tsx` | `?alerta=` y `diasDemora` |
| `app/admin/proveedores/page.tsx` (o donde se arma la ficha), `FichaPaneles.tsx` | `diasDemora` |
| `app/admin/compras/stock/page.tsx`, `StockClient.tsx` | `?bajo=1` |
| `lib/database.types.ts` | `npm run types` |
| `ARQUITECTURA.md` | ruta y cron nuevos |
| `docs/bloque2/notas-B5.md` | notas de la fase |

**Fuera de alcance**

- Las RPC y vistas de otras fases: `compras_guardar_remito`, `compras_recalcular_*`, `v_compras_*` (§1.3; E7).
- El cron de tareas (`recordatorios-tareas`) y su bug de `Bearer undefined`: se anota para F9.
- Gasto atrasado / vencimiento del gasto: el gasto no tiene vencimiento (es de la reunión de Gastos).
- Avisos de Fábrica (conteo, sobrestock): ya existen y no cambian.
- Mover a Compras › Avisos el resto de `compras_config` (WhatsApp, sobrestock, conteo, `gasto.*`): F9.
- Preferencias por usuario ("no quiero recibir este aviso").
- Purga de `compras_avisos_corridas` y `notificaciones`.
- La carga entera de pedidos en `pedidos/page.tsx` (F9).

## 9. Verificación

### 9.1 Antes de empezar

1. `git fetch && git reset --hard origin/qa` (o `rebase`), `.env.local` copiado y `npm install`. Dev server en **:3006**, desde PowerShell.
2. Confirmar que el último timestamp de `qa` sigue siendo `20261006160000`. Si A3 entró con uno mayor, renombrar la migración.
3. Releer los cuerpos que se replican (E7): `v_compras_devoluciones` de `20261006153000` y `estadoPago` / `resumirPagos` de `reportes.ts`.

### 9.2 Lote de escenarios (dev, **sin pushear**, todo se revierte)

`docs/bloque2/escenarios-B5.sql`, con el patrón de `escenarios-B4.sql`: un `do $$ … $$` que actúa como `qa-admin` o `qa-squad` (`set_config('request.jwt.claims', …)` + `set_config('role','authenticated')`), o como `service_role` para `compras_avisos_tomar`, y termina con `raise exception 'RESULTADO: %', v_res`, así revierte todo.

```bash
cat supabase/migrations/20261006170000_compras_avisos_tablero.sql docs/bloque2/escenarios-B5.sql > <scratchpad>/b5_escenarios.sql
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <scratchpad>/b5_escenarios.sql
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select to_regclass('public.compras_avisos_enviados') is null as limpio"   # true
```

**Datos del lote:** pedidos propios armados dentro del lote con las RPC reales (GLOBAL, Queso Barra y Fécula, como B4). Las fechas "hace N días" se fuerzan con `update` dentro del lote. No dependen de P-0079/P-0080 ni los cambian.

| # | Escenario | Esperado |
|---|---|---|
| S1 | Las 9 claves de config sembradas; `_compras_config_num` con una clave inexistente | default |
| S2 | Pedido de prueba enviado hace 4 días (`enviado_en` a mano) | `tomar(['pedido_demorado'])` lo devuelve; una 2.ª toma no |
| S3 | Al mismo pedido se le cambia `enviado_en` (reenvío) | la 3.ª toma lo devuelve otra vez (huella) |
| S4 | Se carga un remito que lo completa (`compras_guardar_remito`) | `tomar(['pedido_demorado'])` borra su fila; `tomar(['remito_listo'], pedido)` lo devuelve |
| S5 | `tomar(['remito_listo'], pedido)` dos veces seguidas | la 2.ª, vacía |
| S6 | Se elimina el remito (`compras_eliminar_remito`) y se vuelve a tomar `remito_listo` | la fila se borra (rearme) |
| S7 | `avisos.pedido_demorado.activo = false` | no se toma nada de ese tipo y no se borran sus filas |
| S8 | `avisos.repetir_dias = 1` + `enviado_en` de la fila a hace 2 días | la toma lo devuelve con `repetido = true` |
| S9 | Factura confirmada con una diferencia pendiente y `updated_at` de hace 4 días (con `dias = 3`) | `diferencias` lo devuelve; con `updated_at` de hoy, no |
| S10 | Devolución sin NC contra una factura (como S de B4), con `created_at` a hace 8 días | `nc_pendiente` la devuelve con su `codigo` |
| S11 | **Réplica de `espera_nota_credito`:** como `qa-admin`, el conjunto de `v_compras_devoluciones where espera_nota_credito` = `_compras_devoluciones_esperan_nc()` sobre **todas** las devoluciones de dev (incluidas P-0079 y P-0080) | iguales (`except` en los dos sentidos vacío) |
| S12 | **Réplica de "Por facturar" y "demorado":** como `qa-admin`, contra los conteos que da la pantalla de Pedidos (tomarlos antes del lote, desde la UI) | `por_facturar` y `demorados` iguales |
| S13 | Insumo con `stock_minimo` mayor que su stock y sin pedido | `stock_bajo` lo devuelve; con un pedido `enviado` que lo incluye, no |
| S14 | El insumo vuelve a superar el mínimo (ajuste) | la toma borra su fila |
| S15 | `compras_tablero_resumen()` como `qa-admin` | todos los campos con número; `deuda_pendiente + deuda_a_favor` = (pendiente + a favor) de Reportes › Gasto por proveedor en "Todo" |
| S16 | `compras_tablero_resumen()` como `qa-squad` | conteos con número; `por_facturar_estimado`, `diferencias`, `nc_pendientes`, `deuda_*` en `null` |
| S17 | `compras_tablero_resumen()` como un usuario sin compras | `42501` |
| S18 | `compras_avisos_tomar` como `authenticated` (admin) y como `anon` | *permission denied* en los dos |
| S19 | Helpers de §3.4 como `authenticated` | *permission denied* |
| S20 | `select` de `compras_avisos_enviados` y `compras_avisos_corridas` como `qa-squad` | 0 filas; como admin, las ve |
| S21 | Concurrencia: dos sesiones con `tomar` al mismo tiempo (después del push, con dos `psql`, todo revertido) | la 2.ª espera el lock y no devuelve nada repetido |

Antes del push, también la invariante del ledger (como en B4) y el `to_regclass` limpio.

### 9.3 Chequeos puros, tipos, lint y build

- `npx tsx lib/compras/_check_avisos.ts` y `_check_estado.ts` (casos nuevos), más el resto de `lib/compras/_check_*` sin cambios.
- `npx tsc --noEmit`, `eslint` de lo tocado y `npm run build`.

### 9.4 Push a dev (con OK del coordinador)

`git fetch && git rebase origin/qa`. `npx supabase db push --linked --project-ref fafckqysyvtlslfnpzrh` (con `--dry-run` primero: tiene que listar solo `20261006170000`). Después, `npm run types` y avisarle al coordinador para el merge.

### 9.5 Prueba del cron en local (con el secret)

Con `next dev -p 3006` y el `CRON_SECRET` de `.env.local` (sin imprimirlo; leerlo a una variable del shell):

1. Sin header → **401**. Con `Bearer otra-cosa` → **401**.
2. Con `CRON_SECRET` vacío en una corrida aparte (`CRON_SECRET= npm run dev` en otro puerto) → **503 "Cron sin configurar"**.
3. Con el secret correcto → **200** con el resumen. Aparece una fila en `compras_avisos_corridas` con `origen = 'cron'`, y la campanita de `qa-admin` tiene los avisos agrupados.
4. Repetirlo enseguida → **200** con todo en 0 avisados (dedup).
5. `GET /api/entorno` en el mismo server da `refCliente = fafckqysyvtlslfnpzrh`: el cron corrió contra dev.

### 9.6 QA en el navegador (local :3006 contra dev; `qa-admin` y `qa-squad`)

1. **Compras › Avisos** (admin): las 5 tarjetas, guardar, "No había cambios", valores fuera de rango con error en el campo, "Revisar ahora" con toast, la lista "Avisos recientes" con links.
2. **Remito:** en un pedido enviado, como `qa-squad`, cargar el remito que lo completa → `qa-admin` recibe "📦 Listo para facturar" en la campanita, y tocarlo abre el pedido. Cargar uno parcial en otro pedido: no avisa.
3. **Dashboard** como admin: las 7 tarjetas, y cada una abre la lista con **el mismo número**: Pedidos con el chip de la alerta, Por facturar, Stock con "Solo bajo el mínimo" prendido y Gastos › Pendientes.
4. **Dashboard** como `qa-squad`: sin montos ni las tarjetas de admin; "Bajo el mínimo" como link o texto según sus módulos.
5. **`pedidos.dias_demora` = 5:** cambia el conteo de Demorados en el dashboard, la marca en la lista de Pedidos, el texto de "Qué sigue" y la ficha del proveedor. Volverlo a 3.
6. **Chip de alerta:** ✕ limpia la URL; F5 con `?alerta=demorados` vuelve a filtrar.
7. **375 px y tema claro:** la franja del dashboard en 2 columnas, Avisos sin scroll horizontal y el Guardar sticky.

### 9.7 Datos de dev

Los avisos que manda la QA quedan en `notificaciones` de las cuentas `qa-*` y en `compras_avisos_enviados` / `compras_avisos_corridas`: son datos de prueba de dev y se pueden dejar. Anotar en las notas qué pedidos se tocaron.

## 10. Commits y cierre (rama `bloque2/pedidos`)

1. `feat(compras): avisos y tablero, SQL (B5)`: migración + escenarios.
2. `feat(compras): runner de avisos, cron y remito listo (B5)`: `avisos.ts`, `avisosServidor.ts`, ruta, `vercel.json`, `remitos/acciones.ts`.
3. `feat(compras): pantalla de Avisos (B5)`: página + módulo.
4. `feat(compras): KPIs de compras en el dashboard y listas filtradas (B5)`: dashboard, `?alerta=`, `?bajo=1`, `dias_demora`.
5. `docs(bloque2): notas de B5`.

Push de la rama después de cada paso verificado.

## 11. Criterios de aceptación

1. Los 5 avisos salen **una sola vez por episodio**, agrupados por tipo y destinatario, y cada uno lleva a su entidad (uno solo) o a la lista filtrada que muestra exactamente esos N (varios).
2. "Listo para facturar" llega al guardar el remito que deja el pedido en "Por facturar", no al autor, y nunca cambia el resultado del remito si el aviso falla.
3. Los 9 parámetros se editan desde Compras › Avisos (solo admin), con validación, y apagar un aviso lo apaga en el cron, el botón y el remito.
4. `pedidos.dias_demora` define "demorado" en el aviso, el KPI, Pedidos, "Qué sigue" y la ficha del proveedor.
5. El cron rechaza sin secret, con secret incorrecto y con el entorno mal configurado. Con el secret correcto corre todos los chequeos y deja la corrida registrada.
6. `vercel.json` tiene un solo cron nuevo, diario. El de tareas no cambió.
7. El dashboard muestra los KPIs de compras a quien tiene compras. Los montos (y diferencias, NC y deuda) vienen en `null` de la base para quien no es admin. Cada KPI linkea a su lista con el mismo número.
8. La RPC del tablero no devuelve filas, solo agregados. La página no hace ninguna consulta nueva sin límite.
9. S1–S21 `ok`. Las réplicas (S11, S12, S15) coinciden con sus originales.
10. Ninguna función, vista ni política de otra fase cambió (`git diff` de `supabase/migrations` = un archivo nuevo).
11. `tsc`, lint de lo tocado y `build` limpios. `_check_avisos` y `_check_estado` OK.
12. QA en el navegador de §9.6 OK, incluidos 375 px y tema claro.

## 12. Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar**, una vez mergeado B5 a `qa`. Con `qa-admin@chipacitos.test`, salvo donde se indica otra cuenta.

> En QA el aviso automático diario **no corre** (Vercel solo corre los crons en producción). Para ver los avisos de demorados, diferencias, NC y stock, usá **Compras › Avisos › Revisar ahora**. "Listo para facturar" sí llega solo.

1. **Compras › Avisos.**
   - Hay 5 avisos con su interruptor, los días donde corresponde y quién los recibe.
   - Cambiá "Pedido demorado" a 5 días y guardá: aparece un toast. Guardá sin tocar nada: "No había cambios".
   - Poné 0 o 100 días: tiene que marcar el error.
2. **Revisar ahora.**
   - La primera vez llegan, a la campanita, avisos **agrupados** ("N pedidos demorados…"). Tocá uno: abre Pedidos filtrado, con el chip arriba y el mismo número.
   - Tocalo otra vez: "No había nada nuevo para avisar".
3. **Listo para facturar.**
   - Con `qa-squad`, cargá el remito que completa un pedido enviado.
   - Con `qa-admin`, en la campanita aparece "📦 Listo para facturar · P-…". Tocalo: abre ese pedido.
   - Un remito parcial no avisa. Si lo cargás vos como admin, no te avisás a vos mismo.
4. **Demorado.** Volvé a 3 días. Un pedido enviado hace 3 días o más aparece en Demorados (dashboard), con la marca en la lista de Pedidos y en la ficha del proveedor. Con 5 días deja de estar.
5. **Diferencias y nota de crédito.** P-0080 y P-0019 tienen casos. Poné los días de los dos avisos en 1 (el mínimo) y tocá "Revisar ahora". Llegan "⚖️ Diferencias sin resolver" y "🧾 Falta la nota de crédito" si hace más de 1 día que están así. El de la NC abre el pedido con la devolución resaltada.
6. **Stock bajo el mínimo.** En Insumos, subile el mínimo a uno que no esté en ningún pedido abierto, y "Revisar ahora": llega "📉 Stock bajo el mínimo". Abre su ficha de Stock. Volvé el mínimo a como estaba.
7. **Apagar.** Apagá "Stock bajo el mínimo", bajá otro insumo y "Revisar ahora": no avisa.
8. **Dashboard.**
   - Arriba siguen las métricas de siempre. Abajo, "Compras" con: Por recibir, Demorados, Recibidos sin facturar (≈ $), Diferencias, Deuda con proveedores (y "A favor"), NC pendientes y Bajo el mínimo.
   - Tocá cada una: la lista que abre tiene el mismo número.
   - Deuda + A favor tiene que cuadrar con Reportes › Gasto por proveedor en "Todo" (Pendiente + A favor).
9. **Con `qa-squad`.** En el Dashboard no ve montos ni Diferencias, Deuda o NC. No ve Compras › Avisos.
10. **Avisos recientes.** En Compras › Avisos, abajo, la lista de lo que se avisó, con links. "Última revisión" dice cuándo y que fue manual.
11. **Celular (375 px) y tema claro.** El dashboard muestra las tarjetas en 2 columnas, sin scroll horizontal. En Avisos, el botón Guardar queda visible.

**Manual `/ayuda`:** cambian Dashboard (Compras), Compras › Avisos (nueva) y Pedidos (el chip de alerta). Se arma en la entrega final.

## 13. Decisiones que necesitan al usuario

| # | Pregunta | Recomendación (la que asume la spec) | Alternativa |
|---|---|---|---|
| **D1** | ¿Un aviso por entidad o agrupados? | **Agrupados por tipo:** si es uno solo, lleva a esa entidad; si son varios, uno solo "3 pedidos demorados: …" que abre la lista filtrada. | Uno por entidad: con el atraso de hoy, la primera corrida manda decenas de push. |
| **D2** | ¿Se repite un aviso que sigue sin resolverse? | **Una sola vez por episodio** (`avisos.repetir_dias = 0`), con el parámetro disponible por si Marcos lo quiere. El tablero muestra lo pendiente todos los días. | Repetir cada N días por defecto (por ejemplo, 3). |
| **D3** | "Recibidos sin facturar en pesos": no hay factura, así que el monto no existe. ¿Cómo se muestra? | **Estimado** a `precio_ref` del proveedor, sin IVA, marcado "≈ … a precio de referencia", y "N líneas sin precio" si falta alguno. Solo admin. | Solo la cantidad de pedidos, sin pesos. |
| **D4** | Stock bajo el mínimo: ¿se avisa aunque ya haya un pedido abierto con ese insumo? | **No:** solo los que **no** tienen pedido abierto (el aviso es "hay que pedir"). El KPI cuenta todos, como Stock. | Avisar todos, con "(hay P-… en camino)". |
| **D5** | ¿Quién recibe cada aviso? | Facturar, diferencias y NC: **admin**. Demorado: admin + `compras-pedidos`. Stock bajo: admin + `compras-pedidos` o `compras-stock` (§4.2). Fijo en el código. | Hacerlo configurable por aviso en la pantalla (más UI y más casos). |
| **D6** | ¿A qué hora corre el aviso diario? | **07:00–08:00 de Argentina** (`0 10 * * *` UTC). Hobby lo corre dentro de esa hora. | Otra hora. Hobby no permite más de una vez por día. |
| **D7** | Valores iniciales | Demorado **3** días (el acordado el 24-09), diferencias **3** días, NC **7** días, todo prendido. | Otros números: se cambian desde la pantalla sin código. |
| **D8** | ¿Dónde vive la pantalla de parámetros? | **Compras › Avisos** (nueva, solo admin). Lo demás de `compras_config` se muda ahí en F9. | Una pestaña "Avisos" en Proveedores, o en Fábrica › Parámetros. |

## 14. Para el coordinador

- **Dueños nuevos (B5):** `compras_avisos_enviados`, `compras_avisos_corridas`, `compras_avisos_tomar`, `compras_tablero_resumen`, `_compras_config_num` / `_compras_config_bool` y los 6 helpers `_compras_*` de §3.4. Las claves `avisos.*` y `pedidos.dias_demora` de `compras_config`.
- **Réplicas que hay que mantener** si alguien cambia el original:
  - `espera_nota_credito` (B4 → A4) ↔ `_compras_devoluciones_esperan_nc`;
  - `filtroDelPedido` / `estaDemorado` / `hayDiferencias` ↔ helpers (a)–(d);
  - `estadoPago` / `resumirPagos` ↔ la deuda de `compras_tablero_resumen`.
  
  Agregarlas a la tabla de dueños con esa nota. Si A4 toca la vista de devoluciones, tiene que actualizar el helper (e) y correr S11.
- **`lib/modulos.tsx`:** suma `compras-avisos` (soloAdmin).
- **Archivos compartidos:** `estadoPedido.ts` (firma de `estaDemorado` / `proximaAccion` con un parámetro **opcional**: no rompe a nadie), `PedidosClient.tsx`, `modelo.ts`, `FichaPaneles.tsx` y `StockClient.tsx` (un `useState` inicial: no choca con A3/A4 salvo que toquen el toggle).
- **QA / Vercel:** en el preview no hay cron. Si el coordinador quiere probar el endpoint en QA, hace falta `CRON_SECRET` en las variables de **Preview** del proyecto (hoy no se sabe si está). Sin eso responde 503 y no hace nada. No es necesario para la QA: "Revisar ahora" corre el mismo código.
- **Release (la decide el usuario):**
  - con la migración, el primer cron de prod manda a los admins reales un resumen agrupado del atraso acumulado. Si no se quiere, antes de mergear a `main` se apagan los avisos en prod desde la pantalla, o se siembran en `false`;
  - verificar que `CRON_SECRET` de Production tiene 16 caracteres o más (si no, la ruta nueva responde 503);
  - al día siguiente, mirar en Compras › Avisos que haya una corrida automática.
- **Para F9:**
  - el bug de `Bearer undefined` en `recordatorios-tareas`;
  - mover el resto de `compras_config` a la pantalla de Avisos (o a una de "Parámetros de compras");
  - una purga de `compras_avisos_corridas`.
