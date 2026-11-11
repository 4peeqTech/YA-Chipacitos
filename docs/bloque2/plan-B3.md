# B3 — Proveedor y reportes conectados (especificación ejecutable)

Rama `bloque2/pedidos`, que sale de `qa` @ `1c80707` (con B0, A1, B1, A2a y B2 adentro). Plan maestro: `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md`, fase B3, decisiones C1 y C2, y "Conexión del circuito".

**Reglas de la fase:**
- Se trabaja solo en dev (`fafckqysyvtlslfnpzrh`) y QA. **Prod no se toca:** ni lecturas, ni migraciones, ni merges a `main`.
- Nunca `supabase link`. Siempre `--project-ref` explícito.
- El `db push` se hace con el OK del coordinador.

**Precondición (bloqueante para el push, no para arrancar):** la migración de A2b (`20261005180000_compras_unidades_medida.sql`) **ya está aplicada en dev** pero todavía no está en `qa`. El CLI rechaza un push si dev tiene una versión que la rama no tiene, y la vista de §3.10 lee columnas de A2b (`cobra_por`, `precio_por`, `unidad_base`). Antes del lote de escenarios (§10.2) y del push, `qa` tiene que tener los commits de migración de A2b (`abde579` + `6395ee6`). Si no están, se arranca por la UI que no depende de SQL (§6.6 y §6.7) y se avisa al coordinador.

**Quién hace qué:**
- El Ejecutor (Opus, esfuerzo medio, `traycer-implement`) hace todo, en el orden de §11.
- Si algo de acá no encaja con el código, frena y avisa: no improvisa.

## 0. Qué cambia, en una línea

La ficha del proveedor deja de ser un modal con datos viejos y pasa a ser **la puerta a todo lo de ese proveedor**: sus pedidos con el estado de verdad, sus remitos y facturas, cuánto se le facturó, pagó y debe (solo lectura) y a qué precio vende cada insumo. El proveedor **se archiva en vez de borrarse** (solo se borra uno sin historia), el ABM pasa a RPC, y sale `proveedores.local` (después de pasar su dato a `local_facturacion_id`). En Reportes, el historial y el KPI usan el estado visible, el gasto por proveedor separa pagado de pendiente, "Sugerido vs. comprado" pasa a comparar contra **lo recibido**, y el aviso de "pedidos sin factura" abre Pedidos ya filtrado. Al terminar, `compras_pedidos.estado` no tiene lectores.

## 1. Relevamiento del código vigente (`qa` @ `1c80707`; dev consultado en solo lectura el 2026-10-05)

### 1.1 Proveedores: la pantalla y sus escrituras

- `app/admin/proveedores/page.tsx` lee `proveedores.select('*')` (trae `local` sin usarla), los pares activos y los locales de facturación.
- `ProveedoresClient.tsx` (562 líneas, estilo viejo con hex):
  - **escribe desde el navegador**: `insert` (`:220`), `update` (`:228`, manda `...form` entero, `local` incluida), cambio de `estado` (`:243`) y `delete` (`:264`);
  - la ficha (`:488-559`) muestra contacto, insumos asociados (con link a Stock, B0) y los últimos 10 pedidos con el **estado viejo** (`estado: 'borrador' | 'enviado' | 'cerrado'`, `:30`, `:152`, `:271-275`);
  - `?proveedor=` ya abre la ficha y se limpia al cerrar (B0).
- El módulo `proveedores` es `soloAdmin` (`lib/modulos.tsx:53`): solo un admin entra a la pantalla.
- RLS de `proveedores` en dev: `proveedores_escritura` (`ALL`, `es_admin()`) y `proveedores_lectura_compras_fabrica` (`select`, compras o fábrica). Sin triggers.
- `proveedores.estado` ya existe con `check (estado in ('activo','archivado'))`. En dev: 18 activos, 0 archivados, ningún nombre repetido.
- **Nadie más escribe `proveedores`** en la app (grep de `from('proveedores')` con insert/update/delete: solo `ProveedoresClient`).

### 1.2 Las FK que apuntan a `proveedores` (dev)

| FK | `on delete` hoy | Qué pasa al borrar |
|---|---|---|
| `gastos.proveedor_id` | `SET NULL` | **El gasto queda sin proveedor** (C1) |
| `compras_item_proveedores.proveedor_id` | `CASCADE` | **Se borran los pares** (hallazgo de A2a) |
| `compras_items_historial.proveedor_id` | `SET NULL` | El historial del insumo pierde a quién se refería |
| `compras_pedidos.proveedor_id` | `NO ACTION` | Bloquea |
| `compras_facturas.proveedor_id` | `NO ACTION` | Bloquea |
| `compras_solicitud_items.proveedor_id` | `NO ACTION` | Bloquea |
| `compras_plantilla_base.proveedor_id` | `NO ACTION` | Bloquea |

`compras_pedidos_eliminados.proveedor_id` no tiene FK: guarda el id y el nombre como texto.

### 1.3 `proveedores.local`: **no está muerta en dev**

- Ningún archivo de la app la lee (grep de `.local` y de embeds de `proveedores(...)`: el único `p.local` es de un gasto de Fudo, `PendientesClient.tsx:189`). Ninguna vista ni función depende de la columna (`pg_depend` vacío).
- **Pero tiene el dato:** 17 de 18 proveedores de dev tienen `local = 'Paraguay 388'` o `'Gdor. Lagraña 388'`, y **los 18 tienen `local_facturacion_id` en null**.
- Causa: el backfill de `20260903150000:34-36` comparaba `p.local = lf.slug` (`'paraguay'`, `'lagrana'`), pero `local` guarda el **nombre** del local. No matcheó nada.
- Consecuencia: si se borra la columna sin más, se pierde a qué local factura cada proveedor (y por eso B1 encontró "ningún proveedor tiene local cargado"). Ver §3.1 y **D1**.

### 1.4 Reportes (`app/admin/compras/reportes/*`, `lib/compras/reportes.ts`)

- `page.tsx:31-33` lee `compras_pedidos.select('*', …)`: así llegan `estado` y `cerrado_en`.
- **Estado viejo:**
  - `PedidoReporte.estado` y `HistorialPedido.estado` (`reportes.ts:54`, `:134`);
  - `HistorialPedidos.tsx:13-29` (badges, colores y etiquetas de borrador / enviado / cerrado), `:65-69` (gráfico) y `:116` (badge);
  - la columna "Cerrado" lee `cerrado_en` (`:120`), que solo escribe `compras_recalcular_estado_pedido` junto con el `estado` viejo;
  - KPI "Pedidos del período": `N cerrados` con `p.estado === 'cerrado'` (`ReportesClient.tsx:121`).
- **Gasto por proveedor** (`GastoPorProveedor.tsx`, `calcularGastoPorProveedor`): suma facturas confirmadas, no separa pagado de pendiente. `v_compras_facturas` ya trae `gasto_id` y `gasto_estado` (`'Pendiente de pago' | 'Parcial' | 'Pagado'`).
- **Aviso "N pedidos sin factura"** (`GastoPorProveedor.tsx:63-74`): `<Link href="/admin/compras/pedidos">` sin filtro. `recibidoSinFacturar` (`reportes.ts:66-69`) reimplementa a mano lo que `filtroDelPedido` llama `por_facturar`.
- **Sugerido vs. comprado** (`reportes.ts:292-324`): cruza por `(solicitud_id, item_id)` contra la **cantidad pedida**. B1 ya dejó `compras_pedido_items.solicitud_item_id` (80/80 líneas con match en dev). `compras_remito_items.pedido_item_id` tiene FK a `compras_pedido_items` (`ON DELETE SET NULL`), así que se puede embeber.
- `page.tsx:68-69` pasa `solicitudItems` y `pedidoItems` con `as any`.

### 1.5 Datos de la cuenta en dev

- `gastos`: 4 filas (3 "Pendiente de pago", 1 "Pagado"); 2 con proveedor.
- `compras_facturas`: 4 confirmadas (**3 sin `gasto_id`**, 1 con gasto) y 4 anuladas. Una factura confirmada puede no tener gasto (se borró el gasto: `compras_facturas.gasto_id` queda en null).
- No existen pagos parciales con monto: "Parcial" es un estado que nadie genera (plan maestro, "Lo que es de Gastos").

### 1.6 Selectores de proveedor

| Lugar | Consulta | Si el valor actual está archivado |
|---|---|---|
| Pedidos (crear / editar) | `consultarProveedores`, `estado = 'activo'` (`pedidos/datos.ts:31-38`) | El select queda vacío (archivo de A2b) |
| Solicitudes (proveedor por línea) | `solicitudes/page.tsx:25`, activos | Queda vacío |
| Pedido base | `pedidos/base/page.tsx:18`, activos | Queda vacío |
| Gastos (`GastoForm`) | `gastos/page.tsx:25`, activos | Muestra "Sin proveedor" aunque el gasto tenga uno |
| Insumos | `insumos/page.tsx:30`, todos con estado | Ya muestra "(archivado)" (A2a) |
| Facturas y remitos | el proveedor sale del pedido | No hay selector |

Además, A2a ya hizo que `compras_guardar_insumo` rechace **agregar o reactivar** un par con un proveedor archivado (`20261005150000:353-384`). Los pares que ya existen no se tocan.

**Quién elige proveedor sin selector:**
- `cerrar_conteo_fabrica` asigna el **principal** del insumo a cada línea de la solicitud (`20261005130000:209`), sin mirar si está archivado;
- `generar_solicitud_base` copia el `proveedor_id` del pedido base;
- `convertir_solicitud_a_pedidos` (`20261005140000:546-609`) crea un pedido por proveedor de las líneas incluidas, sin mirar el estado.

En dev, cada proveedor con insumos es principal de casi todos ellos (FABIMP 12/12, GLOBAL 8/8, BOLSAPLAST 7/7…).

### 1.7 Lectores de `compras_pedidos.estado` (antes de B3)

- **App:** `lib/compras/reportes.ts` (`PedidoReporte`, `HistorialPedido`), `HistorialPedidos.tsx`, `ReportesClient.tsx:121` y `ProveedoresClient.tsx:30,152`. (Los `estado === 'enviado'` de `app/local/*` y `PedidosOperadorClient` son de la tabla `pedidos` de locales, no de compras.)
- **SQL (dev):** ninguna vista ni política la lee. Solo la **escriben** `compras_guardar_pedido` (`insert … 'borrador'`), `convertir_solicitud_a_pedidos` (`insert … 'borrador'`) y `compras_recalcular_estado_pedido` (`estado = v_legacy`, y `cerrado_en` según ese legacy). Además están `idx_compras_pedidos_estado` y el `check` de los tres valores.
- `cerrado_en` tiene un solo lector: la columna "Cerrado" del reporte.

### 1.8 Qué toca A2b (en curso en `bloque2/stock`) y cómo no chocar

A2b redefine `compras_guardar_insumo`, `compras_guardar_remito`, `compras_eliminar_remito`, `compras_guardar_factura`, `compras_confirmar_factura`, `compras_anular_factura`, `compras_diferencias_calculadas`, `v_compras_pedido_pendiente`, `v_compras_factura_diferencias` y `v_compras_insumos_resumen`. En la app: Insumos, `PedidoEditor`, `PedidoEnvio`, `PedidoDetalle` (`:194-215`), `pedidos/page.tsx` (consultas), `PedidosClient` (solo si hace falta una prop), remitos, facturas (`FacturaForm`, `modelo.ts`, `acciones.ts`, `datos.ts`), Stock y los archivos de B2.

| Pieza | B3 | Reparto |
|---|---|---|
| Esas funciones y vistas | **No las redefine ni las lee.** La pestaña Insumos usa una vista propia (§3.10). Sugerido vs. recibido embebe `compras_remito_items` en vez de leer `v_compras_pedido_pendiente`. | Sin choque |
| `pedidos/page.tsx` | **No se toca.** | — |
| `PedidosClient.tsx` | Un solo hunk: el `useState` del filtro (`:83`) y su `onChange` (`:360`), para leer `?estado=` (§6.7). | El que mergea segundo rebasea; es trivial. Avisar al coordinador si A2b toca el mismo archivo. |
| `lib/compras/reportes.ts`, `app/admin/compras/reportes/*` | Dueño único en la Ronda 3 (A2b no los toca). | A2c (Ronda 4) suma "Por insumo" **después** del merge de B3, en un archivo nuevo (`lib/compras/reportePorInsumo.ts`) y con una pestaña más en `ReportesClient`. |
| `lib/database.types.ts` | Se regenera después del push. | Regenerar **después** de rebasear sobre los tipos de A2b (`6395ee6`), así el diff solo trae B3. |
| `compras_item_proveedores` | Solo cambia la FK `proveedor_id` (no es una función de A2b; A2b solo suma `cobra_por`). | Sin choque |
| `compras_items_historial` | Solo cambia la FK `proveedor_id`. | Sin choque |

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §14)

| # | Decisión | Por qué |
|---|---|---|
| E1 | **Archivar = `proveedores.estado = 'archivado'`**, la columna que ya existe. Reactivar la vuelve a `activo`. No se tocan pares, pedido base ni solicitudes. | Es reversible y no reescribe historia. Lo que siga apuntando al archivado se avisa (E3) y se frena en el último paso (E4). |
| E2 | **No se archiva un proveedor con pedidos abiertos** (D2). "Abierto" = sin enviar, enviado, parcial (facturado o no), recibido sin factura, o cerrado a mano con mercadería y sin factura. El mensaje lista los P-xxxx. | Un pedido abierto todavía necesita el selector, el envío o la factura del proveedor. Así ningún pedido abierto apunta a un archivado, y no hay que tocar `PedidoEditor` (A2b). |
| E3 | Archivar **avisa, no bloquea**, si el proveedor es principal de insumos activos, está en el pedido base o tiene líneas en solicitudes abiertas. El aviso lista los insumos con link. | Cambiar el principal es una decisión de Insumos (A2a/A2b). Bloquear obligaría a tocar 12 insumos para archivar FABIMP. |
| E4 | **Guardas en el último paso**, todas lane B: `convertir_solicitud_a_pedidos`, `compras_guardar_pedido` (alta o cambio de proveedor) y `compras_reabrir_pedido` rechazan un proveedor archivado con un mensaje que dice qué hacer. | Es donde un archivado se volvería un pedido nuevo. Las tres funciones son de B1, que ya terminó. |
| E5 | **Eliminar solo sin referencias:** pedidos (también eliminados), facturas, gastos, pares de insumo (activos o no), líneas de solicitud, pedido base e historial de insumos. Si tiene algo, el mensaje cuenta qué y propone archivar. | C1. Las FK `RESTRICT` son el respaldo, no el mensaje. |
| E6 | FK a `RESTRICT`: `gastos.proveedor_id`, `compras_item_proveedores.proveedor_id` **y `compras_items_historial.proveedor_id`**. Las 4 `NO ACTION` quedan como están (ya bloquean). | El historial de un insumo que nombra a un proveedor es auditoría: no se tiene que vaciar en silencio. Con E5, la regla de la RPC y la de la base coinciden. |
| E7 | **ABM por RPC** `security definer` (`proveedores_guardar`, `proveedores_impacto`, `proveedores_archivar`, `proveedores_eliminar`), con Server Actions delante. `proveedores` queda **de solo lectura por RLS** (se borra `proveedores_escritura`). Patrón A2a. | Escrituras desde el navegador sin control (plan maestro, "Datos"). |
| E8 | **Sin tabla de historial de proveedores** en esta fase. Se registra `updated_at`. | No lo pide el plan. Si hace falta, va con "Pagos a proveedores". |
| E9 | `proveedores_guardar` rechaza un **nombre repetido** (sin distinguir mayúsculas ni espacios), como `compras_guardar_insumo`. No es un `unique`: en prod puede haber repetidos y la migración no puede fallar. | Evita dos "GLOBAL" en los selectores. |
| E10 | **`proveedores.local` → `local_facturacion_id` antes de borrarla** (D1): match por slug, nombre o dirección del local, sin mayúsculas ni espacios. Solo donde `local_facturacion_id` es null. Lo que no matchea sale como `raise notice`. Los pedidos existentes no se tocan. | Ver §1.3. Cambiar el local de pedidos ya armados (o facturados) no corresponde. |
| E11 | **Cuenta (solo lectura)**: sale de `v_compras_facturas` confirmadas del proveedor, por fecha de factura. Cada factura cae en **una** columna según su gasto: `Pagado`, `Pendiente` (incluye "Parcial", marcado) o `Sin gasto` (`gasto_id` null). Las notas de crédito restan. Arriba, además, el **pendiente de todas las fechas** (D3). | No hay montos parciales ni una tabla de pagos: inventar un "pagado en parte" sería mentir. "Sin gasto" no se puede dar por pagado ni por debido. |
| E12 | "Gasto por proveedor" usa **la misma función** de E11 (`resumirPagos`). Cuenta y reporte nunca dan números distintos. | Una sola fuente. |
| E13 | **"Abierto" tiene una sola definición** en `lib/compras/estadoPedido.ts` (`pedidoAbierto`), con chequeo. La RPC de E2 la replica en SQL con el mismo caso de prueba. | La ficha, la RPC y los mensajes tienen que coincidir. |
| E14 | El aviso "N pedidos sin factura" lleva a `/admin/compras/pedidos?estado=por_facturar`. `recibidoSinFacturar` pasa a ser `filtroDelPedido(…) === 'por_facturar'`, así el número del aviso es el de la pestaña. | Hoy son dos reglas escritas a mano que pueden divergir. |
| E15 | **"Sugerido vs. recibido"**: por línea de solicitud, lo **recibido** (remitos de las líneas de pedido con ese `solicitud_item_id`). Se muestran también lo pedido y un chip "en camino" si el pedido sigue abierto. Diferencia = recibido − sugerido (D4). | Plan maestro. Lo pedido queda como dato: sin eso no se distingue "pedí de más" de "no llegó". |
| E16 | Historial de pedidos: la columna "Cerrado" (que leía `cerrado_en`, legacy) pasa a ser **"Último remito"** (fecha del remito más reciente). El gráfico cuenta los 7 estados visibles. | `cerrado_en` solo existe por el estado viejo. La fecha de recepción es la que importa. |
| E17 | Ficha: **pestañas** Pedidos · Remitos y facturas · Cuenta · Insumos, con `?pestana=` opcional (`pedidos` por defecto). Los datos de contacto van en la cabecera. Cuenta y las columnas de factura solo con `esAdmin` (el módulo es `soloAdmin`, pero el gating se deja igual). | El reporte de gasto puede llevar directo a la Cuenta del proveedor. |
| E18 | **Lista de proveedores**: la fila abre la ficha (sin lápiz); Editar, Archivar y Eliminar van en el pie de la ficha. Se suman las columnas Insumos y Pedidos abiertos. | Feedback del usuario: fila clickeable sin ícono de editar; `Modal` + íconos + tokens. |
| E19 | **Ningún selector esconde el valor actual**: en Gastos, Solicitudes y Pedido base, si el valor guardado es un proveedor archivado, aparece en la lista como "Nombre (archivado)". Los nuevos solo ofrecen activos. | Hoy un gasto de un proveedor archivado se ve como "Sin proveedor". |
| E20 | Concurrencia: archivar toma `FOR NO KEY UPDATE` del proveedor; las guardas de E4 toman `FOR SHARE`. Eliminar toma `FOR UPDATE`. | `FOR SHARE` choca con `NO KEY UPDATE`: un archivado y un pedido nuevo no pueden cruzarse. `NO KEY UPDATE` **no** choca con el `KEY SHARE` de las FK (como en el arreglo de A2a contra `cerrar_conteo_fabrica`). |

## 3. Migración `supabase/migrations/20261005190000_proveedores_archivar.sql`

El timestamp tiene que ser **mayor que `20261005180000`** (A2b) y que el último de `qa` al momento del push. Si al rebasear hay uno mayor, se renombra.

Encabezado con el resumen (como las de B1/A2a) y la nota de release de §12.

### 3.1 Datos: `local` → `local_facturacion_id` (E10)

```sql
update proveedores p
  set local_facturacion_id = lf.id
  from locales_facturacion lf
  where p.local_facturacion_id is null
    and nullif(btrim(p.local), '') is not null
    and lower(btrim(p.local)) in (lower(btrim(lf.slug)), lower(btrim(lf.nombre)), lower(btrim(lf.direccion)));

do $$
declare r record;
begin
  for r in select nombre, local from proveedores
           where local_facturacion_id is null and nullif(btrim(local), '') is not null loop
    raise notice 'LOCAL SIN MATCH: % → "%" (cargalo a mano en Proveedores)', r.nombre, r.local;
  end loop;
  for r in select lower(btrim(nombre)) n, count(*) c from proveedores group by 1 having count(*) > 1 loop
    raise notice 'NOMBRE REPETIDO: "%" (% proveedores)', r.n, r.c;
  end loop;
end $$;
```

En dev se esperan 17 proveedores con local y 0 avisos. Si un local matchea con dos filas de `locales_facturacion` (no pasa en dev), el `update … from` toma una cualquiera: el lote de escenarios lo verifica (S1).

### 3.2 Se borra `proveedores.local` (C2)

```sql
alter table proveedores drop column local;
```

Antes, en el lote de escenarios: `pg_depend` vacío (§1.3).

### 3.3 FK a `RESTRICT` (C1, E6)

```sql
alter table gastos
  drop constraint gastos_proveedor_id_fkey,
  add constraint gastos_proveedor_id_fkey
    foreign key (proveedor_id) references proveedores(id) on delete restrict;

alter table compras_item_proveedores
  drop constraint compras_item_proveedores_proveedor_id_fkey,
  add constraint compras_item_proveedores_proveedor_id_fkey
    foreign key (proveedor_id) references proveedores(id) on delete restrict;

alter table compras_items_historial
  drop constraint compras_items_historial_proveedor_id_fkey,
  add constraint compras_items_historial_proveedor_id_fkey
    foreign key (proveedor_id) references proveedores(id) on delete restrict;
```

Los nombres se confirman en el lote (consulta de §10.1). Comentario en la migración: las FK de `compras_pedidos`, `compras_facturas`, `compras_solicitud_items` y `compras_plantilla_base` ya son `NO ACTION`.

### 3.4 RLS de solo lectura (E7)

```sql
drop policy if exists proveedores_escritura on public.proveedores;
-- proveedores_lectura_compras_fabrica queda como está.
```

### 3.5 Helper `_compras_exigir_proveedor_activo` (E4, E20)

```sql
create or replace function public._compras_exigir_proveedor_activo(p_proveedor_id uuid, p_para text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_nombre text;
begin
  select estado, nombre into v_estado, v_nombre from proveedores where id = p_proveedor_id for share;
  if not found then
    raise exception 'Ese proveedor no existe. Recargá la página.';
  end if;
  if v_estado <> 'activo' then
    raise exception 'El proveedor % está archivado: reactivalo en Proveedores %.', v_nombre, p_para;
  end if;
end;
$$;
revoke execute on function public._compras_exigir_proveedor_activo(uuid, text) from public, anon, authenticated;
```

### 3.6 Helper `_compras_pedidos_abiertos_de(p_proveedor_id) returns table(id uuid, numero int)` (E2, E13)

`stable`, `security definer`, `set search_path = public`, revocado para `public`, `anon` y `authenticated`. Replica `pedidoAbierto` (§5.1):

```sql
select p.id, p.numero from compras_pedidos p
where p.proveedor_id = p_proveedor_id
  and (
    p.estado_recepcion in ('sin_enviar', 'enviado', 'parcial')
    or (p.estado_facturacion = 'sin_facturar' and p.estado_recepcion = 'recibido')
    or (p.estado_facturacion = 'sin_facturar' and p.estado_recepcion = 'cerrado_manual'
        and exists (select 1 from compras_remitos r where r.pedido_id = p.id))
  )
order by p.numero;
```

`devuelto` nunca es abierto. `recibioAlgo` en la app es "alguna línea con recibido > 0 **o** algún remito" (`pedidos/modelo.ts:75`): un recibido siempre tiene remito, así que en SQL alcanza con `exists remitos`. El caso S6 lo verifica.

### 3.7 RPC `proveedores_guardar(p_id uuid, p_datos jsonb) returns jsonb` (E7, E9)

`security definer`, `set search_path = public`.

1. `if not es_admin() then raise exception 'No autorizado'; end if;`
2. `p_datos` tiene que ser un objeto. Claves permitidas: `nombre`, `categoria`, `cuit`, `contacto_nombre`, `contacto_telefono`, `contacto_email`, `direccion`, `tiempo_entrega`, `periodicidad_compra`, `financiacion`, `condiciones_pago`, `notas`, `maneja_stock`, `local_facturacion_id`. Otra clave (incluidas `estado`, `local` e `id`): `'Campo no permitido: %'`.
3. Textos: `nullif(btrim(x), '')`. `nombre`: obligatorio en el alta y si viene; ≤ 120 caracteres.
4. Nombre repetido en **otro** id (`lower(btrim(nombre))`): `'Ya existe un proveedor llamado "%".'`, y si ese está archivado, `'Ya existe un proveedor llamado "%" (archivado): reactivalo en lugar de crear otro.'`.
5. `local_facturacion_id`, si viene no nulo: tiene que existir en `locales_facturacion` (`'Ese local de facturación no existe. Recargá la página.'`).
6. **Alta** (`p_id is null`): `insert` con `estado = 'activo'`, `maneja_stock = coalesce(…, false)`. Devuelve `{"id": …, "cambios": true}`.
7. **Edición:** `select … for no key update`. Si no existe: `'No encontramos el proveedor. Recargá la página.'`. Se actualizan **solo las claves presentes** (`case when p_datos ? 'x' then … else x end`, como `compras_guardar_insumo`). Si ninguna cambió (`is distinct from`), no hace `update` y devuelve `cambios: false`. Si cambió algo: `updated_at = now()`.
8. Editar un archivado está permitido (por ejemplo, corregir el CUIT de un proveedor viejo).

### 3.8 RPC `proveedores_impacto(p_id uuid) returns jsonb` (E2, E3, E5)

`stable`, `security definer`, `es_admin()`. Solo lectura. Lo usa la UI para armar los diálogos **antes** de confirmar:

```json
{
  "estado": "activo",
  "abiertos": [{ "id": "…", "numero": 12 }],
  "principal_de": [{ "id": "…", "nombre": "Queso Barra" }],
  "pedido_base": 3,
  "solicitudes_abiertas": 1,
  "referencias": { "pedidos": 14, "pedidos_eliminados": 0, "facturas": 4, "gastos": 2,
                   "insumos": 8, "solicitudes": 16, "pedido_base": 3, "historial": 5 },
  "puede_eliminar": false
}
```

- `abiertos`: `_compras_pedidos_abiertos_de`.
- `principal_de`: insumos **activos** con un par **activo** y `es_principal` de este proveedor, por nombre.
- `pedido_base`: líneas de `compras_plantilla_base` con este proveedor.
- `solicitudes_abiertas`: solicitudes distintas en estado `abierta` con alguna línea `incluir` de este proveedor.
- `referencias`: conteos de filas (pedidos y facturas, distintos; insumos = pares, activos o no; solicitudes = solicitudes distintas). `puede_eliminar` = todas en 0.

### 3.9 RPC `proveedores_archivar(p_id uuid, p_archivar boolean) returns jsonb` (E1, E2, E20)

1. `es_admin()`.
2. `select * into v_prov from proveedores where id = p_id for no key update`. Si no existe: el mensaje de §3.7.
3. Si ya está en el estado pedido: devuelve `{"cambio": false}` (doble clic).
4. **Archivar:** si `_compras_pedidos_abiertos_de` devuelve algo:
   `'% tiene % pedido(s) abierto(s): %. Recibilos, facturalos o cerralos a mano antes de archivarlo.'`
   con el nombre, la cantidad y hasta 5 códigos (`'P-' || lpad(numero::text, 4, '0')`), y `'y N más'`.
5. `update proveedores set estado = …, updated_at = now() where id = p_id`.
6. Devuelve `{"cambio": true, "estado": "archivado" | "activo"}`.

Reactivar no tiene condiciones.

### 3.10 RPC `proveedores_eliminar(p_id uuid) returns void` (E5)

1. `es_admin()`.
2. `select … for update` (si no existe: el mensaje de §3.7).
3. Los mismos conteos de `referencias` (§3.8). Si alguno es > 0:
   `'No se puede eliminar % porque tiene %. Archivalo: deja de aparecer para pedidos nuevos y conserva su historia.'`
   con la lista armada así: "14 pedidos, 4 facturas, 2 gastos y 8 insumos asociados" (solo los que no son 0, con singular y plural).
4. `delete from proveedores where id = p_id`.

### 3.11 Guardas en las funciones de pedido (E4)

Cada una parte **del cuerpo vigente en `qa`**: `20261005140000` (ninguna migración posterior las redefine; confirmarlo con `grep` al arrancar). Se cambia **solo** lo indicado; el resto, letra por letra.

| Función | Cuerpo vigente | Cambio |
|---|---|---|
| `compras_guardar_pedido(uuid, uuid, uuid, jsonb)` | `:171-327` | **Alta** (`if v_nuevo`, después de `'Elegí un proveedor.'`): `perform _compras_exigir_proveedor_activo(p_proveedor_id, 'para pedirle');`. **Edición**: donde hoy se valida el cambio de proveedor (`:228`), si `p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id`: la misma guarda. Editar un pedido sin cambiar el proveedor no se frena. |
| `compras_reabrir_pedido(uuid)` | `:451-486` | Después del chequeo de `cerrado_manual`: `perform _compras_exigir_proveedor_activo(v_pedido.proveedor_id, 'para reabrir el pedido');`. |
| `convertir_solicitud_a_pedidos(uuid)` | `:546-609` | Después del `select … for update` de la solicitud y **antes** del loop: `perform 1 from proveedores where id in (<proveedores de las líneas incluidas con cantidad > 0>) for share;` y, si alguno está archivado: `'Hay líneas para % (archivado): cambiales el proveedor o reactivalo en Proveedores.'` con los nombres separados por coma. |

Los `revoke`/`grant` de `140000:684-696` se repiten para las tres.

### 3.12 Vista `v_compras_proveedor_insumos` (pestaña Insumos)

```sql
create or replace view public.v_compras_proveedor_insumos as
select
  ip.proveedor_id, ip.item_id,
  i.nombre as item_nombre, i.unidad, i.estado as item_estado,
  i.unidad_base, i.cantidad_por_unidad as contenido,          -- A2b
  ip.activo, ip.es_principal, ip.codigo_proveedor, ip.precio_ref,
  ip.cobra_por,                                                -- A2b
  case when es_admin() then uf.precio_unitario end as ultimo_precio,
  case when es_admin() then uf.precio_por      end as ultimo_precio_por,   -- A2b
  case when es_admin() then uf.fecha           end as ultima_factura_fecha,
  case when es_admin() then uf.factura_id      end as ultima_factura_id
from compras_item_proveedores ip
join compras_items i on i.id = ip.item_id
left join lateral (
  select fi.precio_unitario, fi.precio_por, f.fecha, f.id as factura_id
  from compras_factura_items fi
  join compras_facturas f on f.id = fi.factura_id
  where fi.item_id = ip.item_id and f.proveedor_id = ip.proveedor_id
    and f.estado = 'confirmada' and f.tipo_comprobante = 'factura' and fi.precio_unitario > 0
  order by f.fecha desc, f.confirmada_en desc nulls last
  limit 1
) uf on true
where tiene_acceso_compras();

grant select on public.v_compras_proveedor_insumos to authenticated;
```

Corre como dueño, como las otras `v_compras_*`. Los nombres de columna (`codigo_proveedor`, `precio_por`, `confirmada_en`) se confirman contra dev en el lote.

### 3.13 Grants de las RPC nuevas

```sql
revoke execute on function public.proveedores_guardar(uuid, jsonb)      from public, anon;
grant  execute on function public.proveedores_guardar(uuid, jsonb)      to authenticated;
-- ídem proveedores_impacto(uuid), proveedores_archivar(uuid, boolean), proveedores_eliminar(uuid)
revoke execute on function public._compras_pedidos_abiertos_de(uuid) from public, anon, authenticated;
```

## 4. Server Actions: `app/admin/proveedores/acciones.ts` (nuevo, `'use server'`)

Mismo patrón que `insumos/acciones.ts`: zod con mensajes en español, `Resultado<T>` de `lib/acciones.ts`, `refresh()` de `next/cache` **también cuando la RPC rechaza** (casi siempre es que otra persona cambió algo). Antes de usar `refresh`, confirmar la API en `node_modules/next/dist/docs/` (AGENTS.md).

| Acción | Entrada | Qué hace |
|---|---|---|
| `guardarProveedor` | `{ id: uuid \| null, datos }`. `datos` = objeto `.partial().strict()` con los campos de §3.7 en camelCase. | Normaliza el teléfono con `normalizarTelefonoAR` (si no es válido: "El teléfono de contacto no parece un número argentino válido"); `contactoEmail` con `z.email()` opcional; mapea a columnas (`COLUMNA`, como Insumos); llama a `proveedores_guardar`. Devuelve `{ id, cambios }`. |
| `impactoProveedor` | `{ id }` | `proveedores_impacto`, parseado con zod. |
| `archivarProveedor` | `{ id, archivar: boolean }` | `proveedores_archivar`. |
| `eliminarProveedor` | `{ id }` | `proveedores_eliminar`. |

## 5. Lógica pura (sin I/O; se chequea con `npx tsx`)

### 5.1 `lib/compras/estadoPedido.ts`: `pedidoAbierto` (E13)

```ts
/** Todavía necesita algo del proveedor: envío, mercadería o factura. Devuelto nunca. */
export function pedidoAbierto(p: Pick<EstadoPedidoEntrada, 'estado_recepcion' | 'estado_facturacion'> & { recibioAlgo: boolean }): boolean
```

- `sin_enviar`, `enviado` y `parcial`: abierto (aunque esté facturado: "Facturado, falta recibir").
- `recibido` + `sin_facturar`: abierto.
- `cerrado_manual` + `sin_facturar` + `recibioAlgo`: abierto.
- El resto: no.

Casos nuevos en `_check_estado.ts`: los 7 estados de recepción × los 2 de facturación, y el cerrado a mano con y sin mercadería.

### 5.2 `lib/compras/reportes.ts`

- **`PedidoReporte`**: sale `estado` y `cerrado_en`. `estado_recepcion: EstadoRecepcion` y `estado_facturacion: EstadoFacturacion` (los tipos de `estadoPedido.ts`, ya no `string`).
- **`recibidoSinFacturar(p)`** = `filtroDelPedido({ ...p, recibioAlgo: p.compras_remitos.length > 0 }) === 'por_facturar'` (E14).
- **`contarPorEstado(pedidos): Record<EstadoVisible, number>`**, para el KPI y el gráfico.
- **`HistorialPedido`**: `estado: EstadoVisible` (con `estadoVisible`), sale `cerradoEn`, entra `ultimoRemito: string | null` (la fecha máxima de sus remitos).
- **Pagos (E11, E12):**

  ```ts
  export type EstadoPago = 'pagado' | 'pendiente' | 'parcial' | 'sin_gasto'
  export function estadoPago(f: { gasto_id: string | null; gasto_estado: string | null }): EstadoPago
  // gasto_id null → sin_gasto; 'Pagado' → pagado; 'Parcial' → parcial; otro → pendiente

  export interface ResumenPagos { facturado: number; pagado: number; pendiente: number; parcial: number; sinGasto: number; facturas: number }
  export function resumirPagos(facturas: FacturaReporte[]): ResumenPagos
  // con signo (las NC restan). pendiente INCLUYE parcial; parcial se informa aparte.
  // invariante: facturado = pagado + pendiente + sinGasto
  ```

  `FacturaReporte` suma `gasto_id` y `gasto_estado`. `DetalleFacturaGasto` suma `gastoId` y `pago: EstadoPago`.
- **`GastoProveedor`** suma `pagado`, `pendiente`, `parcial` y `sinGasto` (salen de `resumirPagos` sobre las facturas del proveedor).
- **Sugerido vs. recibido (E15)**: `calcularSugeridoVsComprado` se reemplaza por

  ```ts
  export interface SolicitudItemReporte { id: string; solicitud_id: string; item_id: string | null; descripcion: string; cantidad_sugerida: number; compras_solicitudes: … }
  export interface PedidoItemRecibidoReporte {
    solicitud_item_id: string | null
    cantidad: number
    compras_remito_items: { cantidad: number }[]
    compras_pedidos: { estado_recepcion: EstadoRecepcion; estado_facturacion: EstadoFacturacion; compras_remitos: { id: string }[] } | null
  }
  export interface SugeridoVsRecibido { clave: string; itemId: string; itemNombre: string; sugerido: number; pedido: number; recibido: number; diferencia: number; enCamino: boolean }
  export function calcularSugeridoVsRecibido(solicitudItems: SolicitudItemReporte[], pedidoItems: PedidoItemRecibidoReporte[]): SugeridoVsRecibido[]
  ```

  - El cruce es por `solicitud_item_id` (no por `(solicitud, item)`).
  - `recibido` = suma de las `compras_remito_items` de esas líneas; `pedido` = suma de `cantidad`.
  - `enCamino` = alguna de esas líneas es de un pedido con `pedidoAbierto` y recepción `enviado` o `parcial`.
  - `diferencia = recibido − sugerido`. El agrupado (semana o "Pedido base") y el orden no cambian.
  - Una línea de solicitud sin pedido da `pedido = 0` y `recibido = 0`.

### 5.3 `lib/compras/_check_reportes.ts` (nuevo, como `_check_historial.ts`)

Casos mínimos:
1. `estadoPago`: los 4 caminos.
2. `resumirPagos`: 1 pagada + 1 pendiente + 1 parcial + 1 sin gasto + 1 NC pagada → el invariante se cumple y la NC resta de `pagado`.
3. `recibidoSinFacturar` coincide con `filtroDelPedido === 'por_facturar'` en los 14 cruces de estado (y en el cerrado a mano con y sin remitos).
4. `contarPorEstado` en un set de los 7 estados.
5. `calcularHistorialPedidos`: `ultimoRemito` es la fecha más nueva; sin remitos, null.
6. `calcularSugeridoVsRecibido`: sugerido 10, pedido 12, recibido 9 → `diferencia −1`; con un pedido parcial, `enCamino`; una línea agregada a mano al pedido (sin `solicitud_item_id`) no suma; dos líneas de pedido para la misma línea de solicitud se suman.
7. `calcularGastoPorProveedor` y `resumirPagos` dan los mismos totales por proveedor (E12).

## 6. UI

### 6.0 Protocolo de diseño

- `Modal`, `Pestanas`, `DataTable`, `EstadoBadge`, `KpiCard`, `EmptyState`, `LinkEntidad`, `useConfirmar` y `useToast` (de `ProveedorUI`), íconos `lucide-react` y tokens semánticos (`text-text`, `text-muted`, `bg-surface`, `bg-surface2`, `border-border`, `text-accent`, `text-warning`, `bg-warning-bg`…). **Cero hex** en los archivos de `app/admin/proveedores/*.tsx` que se reescriben: sumarlos a la regla de hex de `eslint.config.mjs`, como hizo A2a con Insumos.
- Nunca `confirm()`/`alert()` ni `<input type="date">` (los períodos usan `DateRangePicker`).
- Después de una acción, toast; nunca `router.push`.
- Pasada con `impeccable` (shape → harden) o, como mínimo, la revisión manual que hizo A2a: doble clic, errores, vacíos, permisos, textos largos, `tabular-nums`, botones ≥ 44px en celular. Capturas a 375px y 1280px, en oscuro y en claro.

### 6.1 Proveedores: lista (`page.tsx` + `ProveedoresClient.tsx`)

`page.tsx`:
- `proveedores`: columnas explícitas (sin `'*'`, sin `local`).
- Pares activos por proveedor: `count` de insumos.
- Pedidos para el conteo de abiertos: `compras_pedidos(proveedor_id, estado_recepcion, estado_facturacion, compras_remitos(count))`, contados con `pedidoAbierto` en el servidor.
- Locales de facturación y `esAdmin` (para Cuenta y facturas).
- Lee `?proveedor=` y `?pestana=`.

```
┌ 🚚 Proveedores                                   [ + Nuevo proveedor ] ┐
│ 17 activos · 1 archivado                                               │
│ [🔍 Buscar proveedor…]  (Activos)(Archivados)(Todos)  [Sin insumos]    │
├────────────────────────────────────────────────────────────────────────┤
│ Proveedor            Categoría     Insumos  Abiertos  Estado      💬   │
│ GLOBAL               Lácteos           8        2     ● Activo    💬   │
│ FABIMP               Harinas          12        —     ● Activo         │
│ Caprice (archivado)  —                 —        —     ○ Archivado      │
└────────────────────────────────────────────────────────────────────────┘
```

- `DataTable`: la fila abre la ficha. Categoría `md+`, Insumos `lg+`, Abiertos siempre (en `text-warning` si > 0). El ícono de WhatsApp queda (link `wa.me`, con `stopPropagation`).
- El filtro "Sin insumos asociados" se mantiene.
- Vacíos: `EmptyState` distinto para "no hay proveedores" y "no hay resultados con estos filtros" (con `ClearFiltersButton`).

### 6.2 Formulario (`ProveedorForm.tsx`, nuevo)

`Modal` "Nuevo proveedor" / "Editar · {nombre}", `size="xl"`. Los mismos campos de hoy, con tokens y los íconos actuales, menos `local`. El checkbox queda como "Sugerir cantidades al pedir" con su descripción (A2a). Guardar → `guardarProveedor`:
- `cambios: false` → toast "No había cambios" y cierra;
- error → texto rojo en el pie y el form queda abierto;
- ok → toast "Proveedor creado" / "Cambios guardados". Si era un alta, se abre la ficha del nuevo.
- Botón deshabilitado con spinner mientras corre.

### 6.3 Ficha (`ProveedorFicha.tsx`, nuevo; reemplaza el modal de `ProveedoresClient:488-559`)

`Modal size="xl"` con `pantallaCompletaMobile`.

```
┌ GLOBAL  ● Activo · Lácteos ──────────────────────────────────────── ✕ ┐
│ 👤 Juan Pérez  📞 11 5555-5555 (WhatsApp)  ✉ —  🪪 30-…  📍 Av. …      │
│ Factura a: Paraguay 388 · Entrega 24 h · Paga a 30 días               │
│ [ 📋 Pedidos 2 ] [ 📦 Remitos y facturas ] [ 💰 Cuenta ] [ 🏷 Insumos 8 ]│
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ (panel de la pestaña)                                            │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│ [ ✏ Editar ]                          [ 🗄 Archivar ]  [ 🗑 Eliminar ]  │
└────────────────────────────────────────────────────────────────────────┘
```

- Cabecera: contacto en una línea que envuelve; los vacíos no se muestran (no "—" repetidos).
- `Pestanas` con `contador` en Pedidos (abiertos) e Insumos (activos). La pestaña inicial sale de `?pestana=`; al cambiarla **no** se toca la URL. Al cerrar, `useQuitarParams('proveedor', 'pestana')`.
- Cada pestaña carga **la primera vez que se abre** (con guarda de respuesta vieja, como hoy `cargarFicha`), desde el cliente de Supabase con RLS. Las consultas viven en `app/admin/proveedores/datos.ts` (nuevo, sin `'use server'`, patrón `pedidos/datos.ts`) con tipos `QueryData`.
- Pie:
  - **Editar** abre `ProveedorForm`;
  - **Archivar / Reactivar** (§6.4);
  - **Eliminar**: solo si `impacto.puede_eliminar` (el impacto se pide al abrir la ficha).

**Pestaña Pedidos**
- Consulta: `compras_pedidos(id, numero, created_at, enviado_en, estado_recepcion, estado_facturacion, compras_remitos(id))` del proveedor, `order created_at desc`, `limit 100`. Si es admin, además las facturas activas de esos pedidos (`consultarFacturasDePedidos` filtrado por esos ids).
- Segmentado **Abiertos | Todos** (`Abiertos` por defecto; si no hay abiertos, arranca en `Todos`).
- Filas: P-xxxx (`LinkEntidad` pedido), `EstadoBadge dominio="compras_pedido"` con `estadoVisible`, fecha de creación, "enviado hace N días" (en `text-warning` si `estaDemorado`), cantidad de remitos y, si es admin, el N° de factura (`LinkEntidad` factura) o "Sin facturar".
- Si hay 100, una nota: "Se muestran los últimos 100".
- Vacíos: "No tiene pedidos abiertos" / "Todavía no tiene pedidos".

**Pestaña Remitos y facturas**
- **Remitos:** `compras_remitos(id, secuencia, fecha, origen, compras_pedidos!inner(id, numero, proveedor_id), compras_remito_items(count))` filtrado por `compras_pedidos.proveedor_id`, `order fecha desc`, `limit 50`. Filas: R-xxxx-xx (`LinkEntidad` remito), fecha, P-xxxx (link), líneas, "desde factura" si `origen = 'factura'`.
- **Facturas (solo admin):** `v_compras_facturas` del proveedor (todas las no anuladas, y las anuladas tachadas con su motivo en `title`), `order fecha desc`, `limit 50`. Filas: N° (`LinkEntidad` factura), fecha, P-xxxx, total (`tabular-nums`), `EstadoBadge dominio="compras_factura"` y el pago (§6.3 Cuenta).
- En celular, cada sección pasa a lista apilada (código + fecha arriba, el resto abajo).

**Pestaña Cuenta (solo admin; E11)**

```
  (Mes actual)(Mes anterior)(Este año)(Todo)(Personalizado)
  ┌ Facturado ┐ ┌ Pagado ┐ ┌ Pendiente ┐ ┌ Sin gasto ┐   ← "Sin gasto" solo si > 0
  │ $ 412.000 │ │ $ 300k │ │ $ 112.000 │ │ $ 0       │
  └───────────┘ └────────┘ └───────────┘ └───────────┘
  Pendiente de todas las fechas: $ 140.000   (en text-warning si > 0)
  ⓘ No es una cuenta corriente: los pagos parciales y los pagos que no salen
    de una factura todavía no se registran.
  Factura        Fecha    Pedido   Total       Pago
  0001-00000777  03/10    P-0016   $ 112.000   [Pendiente de pago] → gasto
```

- Datos: `v_compras_facturas` del proveedor con `estado = 'confirmada'` (todas las fechas, para el pendiente total) y el filtro de período en el cliente (`fechaEnRango` de `rangoFechas.ts`). "Este año" y "Todo" se arman en la ficha; no se toca `PresetRango`.
- KPIs con `KpiCard`, desde `resumirPagos`. Si hay `parcial > 0`, el detalle de Pendiente dice "incluye $ X de gastos marcados Parcial".
- Tabla: N° (link a la factura), fecha, P-xxxx, total (NC en negativo, con "nota de crédito"), pago: `EstadoBadge dominio="gastos"` con link al gasto (`LinkEntidad` gasto), o "Sin gasto" en `text-muted` con `title` "La factura está confirmada pero no tiene gasto en Gastos (se borró o se vinculó a otro)".
- Para un no admin, la pestaña no aparece.

**Pestaña Insumos**
- Datos: `v_compras_proveedor_insumos` del proveedor, `order item_nombre`.
- Activos: insumo (`LinkEntidad` insumo → Stock), ★ si es principal, código del proveedor, precio ref. con su sufijo (`/Caja` o `/kg` según `cobra_por`; sin A2b mergeada en la UI, sin sufijo), y si es admin, el último precio facturado con su sufijo (`ultimo_precio_por`) y la fecha como link a la factura. Si el precio ref. y el último difieren más de 0,5 %, el último va en `text-warning` con `title` "Distinto del precio de referencia".
- Debajo, `<details>` "Insumos anteriores (N)" con los pares inactivos (texto en `text-muted`).
- Si el insumo está archivado: "(archivado)".
- Vacío: "Este proveedor no tiene insumos asociados. Se asocian desde Compras › Insumos."

### 6.4 Archivar, reactivar y eliminar

Al tocar **Archivar**, el diálogo usa el `impacto` ya cargado (se vuelve a pedir si pasaron más de 30 s):

- **Con abiertos** (`abiertos.length > 0`): no se ofrece archivar. `ConfirmDialog` solo informativo, "No se puede archivar todavía", con los P-xxxx como links y el texto "Recibilos, facturalos o cerralos a mano. Después lo vas a poder archivar." Un único botón, "Entendido".
- **Sin abiertos:** `ConfirmDialog` "Archivar {nombre}", con:
  - "Deja de aparecer para pedidos nuevos, gastos nuevos y solicitudes. Su historia (pedidos, facturas y gastos) queda igual.";
  - si `principal_de`: "Es el proveedor principal de: Queso Barra, Leche (+N). Las solicitudes de Fábrica lo van a seguir proponiendo hasta que cambies el principal en Insumos." Cada insumo es link a Insumos (`/admin/compras/insumos`, con `?insumo=` si A2b/A2c ya lo leen; si no, a Stock con `LinkEntidad`);
  - si `pedido_base > 0`: "Está en N líneas del pedido base.";
  - si `solicitudes_abiertas > 0`: "Tiene líneas en N solicitudes abiertas: antes de convertirlas, cambiá el proveedor.";
  - botón "Archivar". Ok → toast "{nombre} archivado". El estado de la ficha y la fila se actualizan con el `refresh()`.
- **Reactivar:** sin diálogo. Toast "{nombre} reactivado".
- **Eliminar** (solo si `puede_eliminar`): `ConfirmDialog` peligroso, "Eliminar {nombre}", con "No tiene pedidos, facturas, gastos ni insumos. Se borra para siempre." Si la RPC rechaza (alguien cargó algo mientras tanto), toast con su mensaje y se refresca el impacto.

### 6.5 Selectores (E19)

| Archivo | Cambio |
|---|---|
| `app/admin/gastos/page.tsx` | `proveedores` con `id, nombre, estado` (todos). |
| `app/admin/gastos/GastoForm.tsx` (`:163-164`) | Opciones = activos + el del gasto si está archivado, como "{nombre} (archivado)". El tipo de la prop suma `estado`. |
| `app/admin/gastos/GastosClient.tsx` | Solo el tipo de la prop. |
| `app/admin/compras/pedidos/solicitudes/page.tsx` (`:25`) + `SolicitudesClient.tsx` | Igual: el select de cada línea muestra el archivado actual con la etiqueta. |
| `app/admin/compras/pedidos/base/page.tsx` (`:18`) + `PedidoBaseClient.tsx` | Igual. |

Pedidos (`pedidos/datos.ts`, `PedidoEditor`) **no se tocan**: con E2 no hay pedidos abiertos de un archivado. Para un pedido cerrado, el editor no se abre (`editable` = false).

### 6.6 Reportes

`page.tsx`:
- pedidos con columnas explícitas: `id, numero, proveedor_id, created_at, enviado_en, estado_recepcion, estado_facturacion, proveedores(nombre), compras_remitos(id, secuencia, fecha, compras_remito_items(descripcion, cantidad))`;
- `v_compras_facturas` suma `gasto_id, gasto_estado`;
- solicitud items suma `id`;
- pedido items: `solicitud_item_id, cantidad, compras_remito_items(cantidad), compras_pedidos(estado_recepcion, estado_facturacion, compras_remitos(id))`, con `.not('solicitud_item_id', 'is', null)`;
- `createClientTipado` y **sin `as any`**.

`ReportesClient.tsx`:
- KPI "Pedidos del período": el detalle pasa a "N por recibir · M por facturar" (por recibir = visible `enviado` o `parcial`; por facturar = `filtroDelPedido === 'por_facturar'`), con `contarPorEstado`.
- La pestaña "Sugerido vs. comprado" pasa a llamarse **"Sugerido vs. recibido"**.

`HistorialPedidos.tsx`:
- Gráfico "Pedidos por estado": los 7 estados visibles en el orden del flujo (sin enviar → devuelto), con la etiqueta de `ESTADOS.compras_pedido` y colores por **token** del tono (`var(--color-muted)`, `--color-warning`, `--color-info`, `--color-success`, `--color-accent`, `--color-brand-red`; confirmar los nombres en `globals.css`). Los estados en 0 se muestran igual (la barra vacía también informa).
- Badge: `EstadoBadge dominio="compras_pedido"`.
- Columnas: N°, Proveedor (`LinkEntidad` proveedor → su ficha), Estado, Creado, Enviado, **Último remito**, Remitos y Facturado (admin).
- Se van los hex de este archivo.

`GastoPorProveedor.tsx`:
- Columnas: Proveedor (link a la ficha con `?pestana=cuenta`), Facturas, Sin IVA (`lg+`), IVA (`lg+`), Total, **Pagado**, **Pendiente** (en `text-warning` si > 0), **Sin gasto** (solo si alguna fila lo tiene), Recibidos sin facturar.
- Gráfico: barras apiladas **Pagado** (`--color-success`) + **Pendiente** (`--color-warning`) + **Sin gasto** (`--color-muted`), con leyenda y el mismo top 8.
- Detalle expandido: la columna "Pago" con el badge y el link al gasto (como en Cuenta).
- Pie: los totales de cada columna nueva.
- Aviso de sin factura: `href={rutaPedidos('por_facturar')}` (§6.8). El texto queda igual.

`SugeridoVsComprado.tsx` → se renombra a `SugeridoVsRecibido.tsx`:
- Columnas: Semana / pedido, Insumo (`LinkEntidad` insumo), Sugerido, Pedido, Recibido (+ chip "en camino" con `Truck`), Diferencia.
- Gráfico: Sugerido vs. Recibido (por tokens), top 8 por `|diferencia|`.
- Texto de arriba: "Cuánto sugirió el cierre del conteo contra cuánto llegó de verdad en los remitos. Lo pedido queda como referencia. Sirve para calibrar el coeficiente de cada insumo."

### 6.7 Pedidos: `?estado=` (E14)

Solo `PedidosClient.tsx` (§1.8):
- `const estadoParam = useSearchParams().get('estado')`. Si es un `FiltroPedidos` válido (de `FILTROS`), el `useState` del filtro arranca con él; si no, `'activos'`. Confirmar en `node_modules/next/dist/docs/` que `useSearchParams` en esta página dinámica no pide `Suspense`; si lo pide, se pasa por `page.tsx` como prop (avisando al coordinador, porque `page.tsx` es de A2b).
- `useAlCambiarParam(estadoParam, …)`: si llega otro `?estado=` sin desmontar, cambia la pestaña.
- Al elegir otra pestaña a mano: `useQuitarParams('estado')`, así recargar no vuelve al filtro del link.
- `?pedido=` y `?estado=` pueden convivir (el modal abre arriba de la lista filtrada).

### 6.8 `lib/compras/rutas.ts`

- `rutaPedidos(filtro: FiltroPedidos): string` → `/admin/compras/pedidos?estado=<filtro>`.
- `rutaDe` acepta un `pestana` opcional para `proveedor`: `rutaDe({ tipo: 'proveedor', id, pestana: 'cuenta' })` → `…?proveedor=<id>&pestana=cuenta`. `LinkEntidad` lo pasa tal cual (sin cambiar su API: la entidad ya es un objeto).

## 7. `compras_pedidos.estado` después de B3

Al cerrar la fase, el Ejecutor corre y pega en las notas:

```bash
rg -n "\bestado\b" app lib components --glob '!lib/database.types.ts' | rg -i "compras_pedidos|PedidoReporte|HistorialPedido|PedidoResumen|'borrador' \| 'enviado' \| 'cerrado'"
rg -n "cerrado_en" app lib components --glob '!lib/database.types.ts'
```

y en dev, en solo lectura, la consulta de §10.1 punto 4 (vistas y políticas que nombran `estado` de `compras_pedidos`).

**Esperado:** cero lectores en la app y en SQL. Quedan solo **escrituras** (`compras_guardar_pedido`, `convertir_solicitud_a_pedidos`, `compras_recalcular_estado_pedido`) y `lib/database.types.ts`.

**Para F9** (se anota en las notas, no se hace acá):
1. Sacar `estado` y `cerrado_en` de los `insert`/`update` de esas tres funciones, partiendo del cuerpo vigente en `qa` (después de B3: `compras_guardar_pedido` y `convertir_solicitud_a_pedidos` salen de `20261005190000`).
2. `drop index idx_compras_pedidos_estado`, el `check` de `estado` y las columnas `compras_pedidos.estado` y `compras_pedidos.cerrado_en`.
3. Regenerar tipos.

Si queda algún lector, la fase no cierra: se agrega a §6 o se anota con el motivo.

## 8. Casos borde

| # | Caso | Resultado |
|---|---|---|
| 1 | Archivar con un pedido sin enviar, enviado, parcial o recibido sin factura | Bloqueado, con los P-xxxx (E2). |
| 2 | Archivar con solo pedidos facturados, devueltos o cerrados sin mercadería | Se archiva. |
| 3 | Archivar el principal de insumos activos | Se archiva, con el aviso y la lista (E3). La próxima solicitud de Fábrica lo propone; convertir la frena (caso 5). |
| 4 | Doble clic en Archivar | El segundo devuelve `cambio: false`; un solo toast. |
| 5 | Convertir una solicitud con líneas de un archivado | Error con el nombre: "cambiales el proveedor o reactivalo". No se crea ningún pedido (todo o nada). |
| 6 | Pantalla de Pedidos vieja con un proveedor que se archivó recién | `compras_guardar_pedido` rechaza el alta: "reactivalo en Proveedores para pedirle". |
| 7 | Reabrir un pedido cerrado a mano de un archivado | Rechazado: "reactivalo … para reabrir el pedido". |
| 8 | Archivar mientras alguien crea un pedido para ese proveedor | `FOR SHARE` contra `FOR NO KEY UPDATE`: o el pedido entra primero y el archivado lo ve y frena, o el archivado entra primero y el pedido frena (E20). Sin deadlock con `cerrar_conteo_fabrica` (solo toma `KEY SHARE`). |
| 9 | Eliminar un proveedor con un solo gasto manual | Bloqueado por la RPC ("1 gasto"). La FK `RESTRICT` es el respaldo. |
| 10 | Eliminar un proveedor recién creado, sin nada | Se borra. |
| 11 | Eliminar uno que tuvo un par sin historia (A2a lo borró) pero dejó filas en `compras_items_historial` | Bloqueado ("N cambios en el historial de insumos"). Hay que archivarlo. |
| 12 | Editar un proveedor archivado | Permitido (CUIT, contacto…). |
| 13 | Crear "global" con "GLOBAL" existente | Rechazado por nombre repetido (E9). |
| 14 | Nombre repetido con uno archivado | El mensaje propone reactivarlo. |
| 15 | Guardar sin cambios | Toast "No había cambios"; `updated_at` no se mueve. |
| 16 | Teléfono inválido | El action lo frena con el mensaje de hoy. |
| 17 | `proveedores.local` sin match en un local (prod) | Queda null y sale en el `raise notice` de la migración; se carga a mano. |
| 18 | Factura confirmada sin gasto | Va a "Sin gasto"; no suma a pagado ni a pendiente. |
| 19 | Gasto "Parcial" | Cuenta como pendiente y se informa aparte (E11). |
| 20 | Nota de crédito (B4, cuando exista) | Resta en su columna de pago. |
| 21 | Un gasto que cubre dos facturas (vinculado con `p_gasto_existente_id`) | Las dos toman el estado de ese gasto. Se acepta: es la única información de pago que hay. |
| 22 | Línea de pedido agregada a mano a un pedido que vino de una solicitud | No tiene `solicitud_item_id`: no cuenta en "Sugerido vs. recibido". |
| 23 | Mercadería recibida como línea libre del remito (sin `pedido_item_id`) | No cuenta como recibido de la sugerencia. Se documenta en la nota del reporte. |
| 24 | Pedido devuelto (B4) | No es abierto; lo recibido igual cuenta (lo devuelto se resta cuando B4 lo modele). |
| 25 | `?estado=cualquiercosa` | Se ignora: arranca en Activos. |
| 26 | `?proveedor=<id inexistente>` o de otro estado | No abre nada (como hoy). Si el proveedor está archivado, se abre su ficha igual. |
| 27 | No admin (si algún día el módulo deja de ser `soloAdmin`) | No ve Cuenta, ni facturas, ni último precio (vista y RLS). Las RPCs dicen "No autorizado". |
| 28 | Ventana entre el push y el merge a `qa` | El QA viejo no puede editar proveedores (RLS de solo lectura y `local` borrada). El coordinador mergea enseguida, como en B1. |

## 9. Archivos

**En alcance:**
- `supabase/migrations/20261005190000_proveedores_archivar.sql`
- `docs/bloque2/escenarios-B3.sql` (los escenarios de §10.2, como A2a/A2b) y `docs/bloque2/notas-B3.md`
- `app/admin/proveedores/{page.tsx, ProveedoresClient.tsx (reescrito), ProveedorForm.tsx (nuevo), ProveedorFicha.tsx (nuevo), acciones.ts (nuevo), datos.ts (nuevo)}`
- `lib/compras/estadoPedido.ts` (`pedidoAbierto`) y `lib/compras/_check_estado.ts`
- `lib/compras/reportes.ts`, `lib/compras/_check_reportes.ts` (nuevo)
- `lib/compras/rutas.ts`
- `app/admin/compras/reportes/{page.tsx, ReportesClient.tsx, HistorialPedidos.tsx, GastoPorProveedor.tsx, SugeridoVsRecibido.tsx (renombrado)}`
- `app/admin/compras/pedidos/PedidosClient.tsx` (solo §6.7)
- `app/admin/gastos/{page.tsx, GastoForm.tsx, GastosClient.tsx}` (solo §6.5)
- `app/admin/compras/pedidos/solicitudes/{page.tsx, SolicitudesClient.tsx}` y `pedidos/base/{page.tsx, PedidoBaseClient.tsx}` (solo §6.5)
- `eslint.config.mjs` (regla de hex para `app/admin/proveedores/*.tsx`)
- `lib/database.types.ts` (regenerado)

**Fuera de alcance:**
- Todo lo de A2b (§1.8): `pedidos/page.tsx`, `PedidoEditor`, `PedidoEnvio`, `PedidoDetalle`, remitos, facturas, Insumos, Stock, y sus funciones y vistas.
- Cambiar el principal de un insumo al archivar (es de Insumos).
- `cerrar_conteo_fabrica` y `generar_solicitud_base` (A1/A3 y A2a): no se tocan; la guarda está en convertir.
- Cuenta corriente, pagos parciales y gastos que no salen de una factura ("Pagos a proveedores").
- Historial de cambios del proveedor (E8).
- Borrar `compras_pedidos.estado` y `cerrado_en` (F9, §7).
- Renombrar la columna `maneja_stock` (C2 lo pide solo en la UI, y A2a ya lo hizo).
- `Datos de facturación` y `Plantillas WPP` (otras pestañas de Proveedores).
- El reporte "Por insumo" (A2c) y los KPIs del tablero (B5).
- El manual `/ayuda` (va con la guía, al final).
- El plan maestro (lo actualiza el coordinador).

## 10. Verificación

### 10.1 Antes de empezar

```bash
git fetch && git reset --hard origin/qa                 # qa @ 1c80707 o posterior
cat supabase/.temp/project-ref                          # fafckqysyvtlslfnpzrh
ls supabase/migrations | tail -3                        # ¿está 20261005180000 (A2b)?
grep -n "compras_guardar_pedido\|compras_reabrir_pedido\|convertir_solicitud_a_pedidos" supabase/migrations/2026100518*.sql   # vacío: A2b no las redefine
npx supabase migration list --linked --project-ref fafckqysyvtlslfnpzrh
```

Copiar `.env.local` desde `C:\Dev\Trabajo\4peeq\YA!Chipacitos\.env.local` si falta y correr `npm install` (**sin** dependencias nuevas).

Consulta de solo lectura en dev (resultado a las notas):
1. Nombres de las 3 FK de §3.3 y su `confdeltype` (`n`, `c`, `n`).
2. `pg_depend` sobre `proveedores.local` (vacío).
3. Proveedores con `local` y sin `local_facturacion_id` (17 en dev).
4. Vistas, funciones y políticas que nombran `estado` de `compras_pedidos` (solo las 3 escrituras de §1.7).
5. Columnas `compras_factura_items.precio_por`, `compras_item_proveedores.cobra_por` y `compras_items.unidad_base` (existen: A2b aplicada).

### 10.2 SQL de escenarios (dev, **sin pushear**; todo se revierte)

Un archivo en el scratchpad con **la migración completa** + un `do $$ … $$` que termina con `raise exception 'RESULTADO: %', <jsonb>` (el `raise` aborta el lote entero). La versión commiteable va a `docs/bloque2/escenarios-B3.sql`.

```bash
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <scratchpad>/b3_escenarios.sql
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select count(*) = 1 as limpio from information_schema.columns where table_name = 'proveedores' and column_name = 'local'"
```

La sesión se simula como en B1 (`set_config('request.jwt.claims', …)` + `set_config('role', 'authenticated', true)`). Los uuid salen de `auth.users where email like 'qa-%'`.

| # | Escenario | Esperado |
|---|---|---|
| S1 | Migración | 17 proveedores con `local_facturacion_id` (Paraguay o Lagraña según su `local`), 0 `LOCAL SIN MATCH`, 0 `NOMBRE REPETIDO`. `proveedores.local` no existe. Las 3 FK en `r` (`RESTRICT`). `proveedores_escritura` no existe. |
| S2 | `qa-admin`: `proveedores_guardar(null, {"nombre":"QA B3 Prov"})` | Crea, `estado = activo`, `cambios: true`. |
| S3 | Guardar el mismo con `{"nombre":"qa b3 prov "}` desde otro alta | "Ya existe un proveedor llamado…". |
| S4 | Editar solo `cuit`; después, lo mismo otra vez | 1.º `cambios: true` y `updated_at` se mueve; 2.º `cambios: false` y no se mueve. |
| S5 | `{"estado":"archivado"}` y `{"local":"x"}` | "Campo no permitido". |
| S6 | `_compras_pedidos_abiertos_de` sobre un set armado en el lote (un pedido por cada combinación de §5.1) | Coincide con `pedidoAbierto` caso por caso (la misma tabla que `_check_estado.ts`). |
| S7 | `proveedores_impacto` de GLOBAL | `abiertos` = sus pedidos abiertos reales; `principal_de` con 8 insumos; `puede_eliminar = false`. |
| S8 | Archivar GLOBAL (con abiertos) | Error con los P-xxxx; sigue activo. |
| S9 | Archivar "QA B3 Prov" | `cambio: true`; segunda llamada `cambio: false`. Reactivar → activo. |
| S10 | Archivado: `compras_guardar_pedido(null, <QA B3 Prov>, null, <1 línea>)` | "…está archivado: reactivalo en Proveedores para pedirle." |
| S11 | Un pedido sin enviar de un proveedor activo y sin otros abiertos: cambiarle el proveedor a uno archivado | Mismo error. Editar sus líneas sin cambiar el proveedor: OK. |
| S12 | Pedido cerrado a mano de un proveedor que después se archiva: `compras_reabrir_pedido` | "…para reabrir el pedido". |
| S13 | Solicitud abierta con una línea incluida de un proveedor archivado: `convertir_solicitud_a_pedidos` | Error con el nombre; 0 pedidos nuevos; la solicitud sigue abierta. |
| S14 | `proveedores_eliminar` de GLOBAL | "No se puede eliminar GLOBAL porque tiene N pedidos, …". |
| S15 | `proveedores_eliminar` de "QA B3 Prov" | Se borra. |
| S16 | `delete from proveedores` (como `postgres`) de uno con un gasto | `foreign_key_violation` (`RESTRICT`), atrapada con `begin … exception`. Ídem con un par de insumo y con una fila de historial. |
| S17 | `qa-squad` (Compras, no admin) | Las 4 RPC: "No autorizado". `update proveedores` directo: 0 filas. `select` de `v_compras_proveedor_insumos`: filas, pero `ultimo_precio` null. |
| S18 | `anon` | `has_function_privilege('anon', …)` = false para las 4 RPC y los 2 helpers. |
| S19 | `v_compras_proveedor_insumos` como admin | Para el par de Queso Barra con factura confirmada: `ultimo_precio`, `ultimo_precio_por` y `ultima_factura_fecha` = los de su última factura confirmada; `cobra_por` presente. |
| S20 | Concurrencia (dos sesiones, como A2a): A crea un pedido para "QA B3 Prov" y espera; B archiva | B espera a A y después falla por el pedido abierto. Al revés: A falla con "archivado". Ninguna da `40P01`. (Se corre aparte, con `pg_sleep`, y se revierte.) |

### 10.3 Chequeos puros, tipos, lint y build

```bash
npx tsx lib/compras/_check_estado.ts        # con los casos de pedidoAbierto
npx tsx lib/compras/_check_reportes.ts      # §5.3
npx tsx lib/compras/_check_historial.ts     # sigue OK (B1)
npm run types        # solo DESPUÉS del push a dev, y rebaseado sobre los tipos de A2b
npx tsc --noEmit && npx eslint <archivos tocados> && npm run build
```

Cero `as any` nuevos y cero hex en `app/admin/proveedores/*.tsx` y en los reportes tocados.

### 10.4 Push a dev (con OK del coordinador)

1. Avisar al coordinador y esperar el OK. Un solo push a la vez: confirmar que A2b no esté pusheando.
2. `git fetch && git rebase origin/qa`. El timestamp tiene que ser mayor que el último de `qa`, y `qa` tiene que tener `20261005180000`.
3. `npx supabase db push --dry-run --linked --project-ref fafckqysyvtlslfnpzrh`: tiene que aparecer **solo** `20261005190000`.
4. `npx supabase db push --linked --project-ref fafckqysyvtlslfnpzrh`. Guardar los `raise notice` en las notas.
5. S1 y S19 contra la base real (sin rollback).
6. `npm run types`. Avisar al coordinador para el merge a `qa`.

### 10.5 QA en el navegador (local :3006 contra dev)

- Dev server desde **PowerShell**: `npm run dev -- -p 3006` (desde Git Bash, `/admin` da 404 por el `!`).
- Cuentas: `qa-admin@chipacitos.test` y `qa-squad`. Contraseñas en `C:\Dev\Trabajo\4peeq\YA!Chipacitos\docs\qa-credenciales-dev.md` (no se copian a ningún doc).
- Herramienta: el navegador de Traycer o Playwright local, como B1/A2a.

**Recorrido:**
1. Proveedores: lista con Insumos y Abiertos; la fila abre la ficha; no hay lápiz.
2. Crear "QA B3 Prov": toast, se abre su ficha. Editar sin cambios: "No había cambios".
3. Ficha de GLOBAL:
   - Pedidos en "Abiertos" con el estado nuevo (badge) y links; "Todos" incluye los facturados;
   - Remitos y facturas con links que abren cada entidad;
   - Cuenta: con P-0016 (gasto pendiente) en el período, Pendiente = su total; "Sin gasto" aparece si hay confirmadas sin gasto; el link del gasto abre ese gasto;
   - Insumos: precio ref., último precio y la fecha que abre la factura.
4. `?proveedor=<GLOBAL>&pestana=cuenta` abre directo en Cuenta; cerrar limpia los dos params.
5. Archivar GLOBAL → diálogo "No se puede archivar todavía" con sus P-xxxx.
6. Archivar "QA B3 Prov" → diálogo con los avisos; toast; queda en "Archivados". Pedidos › Crear pedido: no aparece. Reactivar → vuelve.
7. Eliminar "QA B3 Prov" → desaparece. Eliminar no aparece en GLOBAL.
8. Gastos: un gasto con proveedor archivado (preparado archivando un proveedor sin pedidos abiertos que tenga un gasto, y reactivándolo al final) muestra "Nombre (archivado)".
9. Reportes:
   - KPI "Pedidos del período" con "por recibir · por facturar";
   - Historial: gráfico de 7 estados, badges nuevos, "Último remito", proveedor con link a la ficha;
   - Gasto por proveedor: Pagado / Pendiente / Sin gasto que suman el Total; el nombre abre la Cuenta del proveedor;
   - el aviso "N pedidos… sin factura" abre Pedidos en **Por facturar**, con el mismo N;
   - Sugerido vs. recibido: Pedido y Recibido, "en camino" en un pedido parcial.
10. En Pedidos, con `?estado=por_facturar`, cambiar a "Activos" a mano y recargar: queda en Activos.
11. `qa-squad`: no ve Proveedores en el menú; en Reportes, Gasto por proveedor dice que lo ve un admin y el Historial no muestra Facturado.
12. 375px y 1280px, oscuro y claro: la ficha y sus pestañas sin scroll horizontal; botones ≥ 44px. Sin errores de consola.

### 10.6 Datos de dev

Lo que quede (proveedor de prueba si no se borró, el archivado y reactivado del paso 8) se anota en las notas. Los 17 `local_facturacion_id` cargados por la migración quedan (son el dato real).

## 11. Commits y cierre (rama `bloque2/pedidos`)

### 11.1 Orden y commits

1. `feat(proveedores): archivar en vez de borrar, ABM por RPC, FK RESTRICT y local → local de facturación (B3)`: migración + `escenarios-B3.sql` (después del lote revertido, antes del push).
2. `chore(tipos): regenerar database.types tras aplicar B3 en dev` (después del push).
3. `feat(proveedores): ficha conectada con pedidos, remitos y facturas, cuenta e insumos (B3)`: §4, §5.1, §6.1–6.5.
4. `feat(compras): reportes con el estado nuevo, pagado vs. pendiente, sugerido vs. recibido y aviso que filtra Pedidos (B3)`: §5.2–5.3, §6.6–6.8.
5. `docs(bloque2): notas de B3`.

Si el lote de §10.2 tiene que esperar a A2b en `qa`, los commits 3 y 4 pueden ir antes (todo lo que no lee columnas nuevas compila sin la migración; la ficha se termina después del push).

Push de la rama después de cada paso verificado, con el token de 4peeqTech solo en ese comando:

```bash
git -c credential.helper= push https://x-access-token:$(gh auth token -u 4peeqTech)@github.com/4peeqTech/YA-Chipacitos.git bloque2/pedidos
```

### 11.2 Notas (`docs/bloque2/notas-B3.md`)

Lo hecho; los desvíos; la verificación (S1–S20, la concurrencia y la QA); los `raise notice` de dev; el resultado de §7 (lectores de `compras_pedidos.estado`) y lo que queda para F9; los datos de dev; "Para otras fases" (A2c: "Por insumo" en archivo nuevo; B4: NC en la Cuenta; B5: el KPI de deuda puede salir de `resumirPagos`); el manual (`/ayuda`) para la guía; y la lista de pruebas.

## 12. Criterios de aceptación

1. Ninguna escritura a `proveedores` desde el navegador: la RLS no lo permite y la app usa las 4 RPC por Server Actions.
2. Un proveedor con pedidos, facturas, gastos, insumos, solicitudes, pedido base o historial **no se puede borrar**, ni por la app ni por SQL directo (las 3 FK nuevas en `RESTRICT`).
3. No se puede archivar con pedidos abiertos; archivar avisa principal, pedido base y solicitudes; un archivado no entra a un pedido nuevo, a una conversión ni a una reapertura.
4. `proveedores.local` no existe, y su dato quedó en `local_facturacion_id` (17/17 en dev).
5. La ficha muestra las 4 pestañas con links; `?proveedor=` y `?pestana=` funcionan y se limpian al cerrar.
6. Cuenta y "Gasto por proveedor" dan los mismos números (misma función) y cumplen facturado = pagado + pendiente + sin gasto.
7. Historial y KPI con el estado visible; ningún lector de `compras_pedidos.estado` ni de `cerrado_en` en la app ni en SQL (§7).
8. "Sugerido vs. recibido" cruza por `solicitud_item_id` y compara contra remitos.
9. El aviso de sin factura abre Pedidos › Por facturar con el mismo número.
10. Los selectores de Gastos, Solicitudes y Pedido base no esconden un valor archivado.
11. Ningún archivo de A2b tocado salvo el hunk de `PedidosClient` (§6.7).
12. `tsc`, `eslint` de lo tocado y `npm run build` limpios; chequeos puros OK; QA de §10.5 hecha y con capturas.

## 13. Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, **una vez mergeado a `qa`**:

1. **Proveedores.** → La lista tiene las columnas Insumos y Abiertos. Tocar la fila abre la ficha (no hay lápiz).
2. **Abrir GLOBAL.** → Arriba, contacto y "Factura a: …" (ahora cargado para los proveedores que tenían local). Pestañas Pedidos, Remitos y facturas, Cuenta e Insumos.
   - **Pedidos:** el estado es el mismo que en Compras › Pedidos (Enviado, Parcialmente recibido, Facturado…). "Abiertos" / "Todos". El P-xxxx abre el pedido.
   - **Remitos y facturas:** cada código abre su remito o su factura.
   - **Cuenta:** Facturado, Pagado y Pendiente del período, y el pendiente de todas las fechas. El estado de pago de cada factura lleva a su gasto. Marcar un gasto como pagado en Gastos y volver: pasa de Pendiente a Pagado.
   - **Insumos:** precio de referencia, último precio facturado y la fecha, que abre la factura.
3. **Nuevo proveedor** "Prueba B3". → Se abre su ficha. Crear otro "prueba b3" → avisa que ya existe.
4. **Archivar GLOBAL.** → No deja: muestra sus pedidos abiertos con links.
5. **Archivar "Prueba B3".** → Explica qué deja de pasar. Queda en Archivados. En Compras › Pedidos › Crear pedido, ya no aparece. Reactivarlo → vuelve.
6. **Eliminar "Prueba B3".** → Se borra. En GLOBAL no está el botón Eliminar (tiene historia).
7. **Archivar un proveedor que sea principal de algún insumo y no tenga pedidos abiertos.** → El aviso nombra esos insumos. Después, en Solicitudes, convertir una solicitud con una línea para él → avisa que está archivado y no crea nada. Reactivarlo al terminar.
8. **Gastos.** Abrir un gasto de un proveedor archivado (con el del paso 7, antes de reactivarlo). → Dice "Nombre (archivado)", no "Sin proveedor".
9. **Compras › Reportes.**
   - KPI "Pedidos del período": "N por recibir · M por facturar".
   - **Historial de pedidos y remitos:** el gráfico tiene los estados nuevos; la tabla, el badge nuevo y "Último remito". El proveedor abre su ficha.
   - **Gasto por proveedor:** columnas Pagado y Pendiente (y Sin gasto si hay). Pagado + Pendiente + Sin gasto = Total. El nombre abre la Cuenta de ese proveedor.
   - El aviso amarillo "N pedidos ya recibieron mercadería y no tienen factura" abre Pedidos **en la pestaña Por facturar**, con esos N.
   - **Sugerido vs. recibido:** Sugerido, Pedido y Recibido; "en camino" en lo que todavía no llegó.
10. **Pedidos con el link del aviso.** Cambiar a "Activos" y recargar (F5) → se queda en Activos.
11. **Con `qa-squad`:** Proveedores no está en el menú. En Reportes, "Gasto por proveedor" dice que lo ve un administrador.
12. **Celular (375px) y tema claro.** → La ficha y sus pestañas se leen sin scroll horizontal y los botones se tocan sin zoom.

## 14. Decisiones que necesitan al usuario

| # | Pregunta | Recomendación | Por qué |
|---|---|---|---|
| **D1** | `proveedores.local` tiene el local de 17 proveedores en dev, pero `local_facturacion_id` está vacío en los 18 (el backfill de septiembre comparaba contra el slug). ¿Se pasa el dato antes de borrar la columna? | **Sí.** La migración completa `local_facturacion_id` por slug, nombre o dirección, solo donde está vacío, y avisa lo que no matchea. Los pedidos ya armados no se tocan. | Si no, se pierde a qué local factura cada proveedor, y cada pedido nuevo arranca sin "Facturar a". |
| **D2** | ¿Se puede archivar un proveedor con pedidos abiertos? | **No:** primero se reciben, facturan o cierran a mano (el diálogo los lista con links). | Un pedido abierto todavía necesita al proveedor en el selector, el envío y la factura. Así no hay pedidos abiertos de un archivado y no se toca el editor de pedidos (que está cambiando A2b). |
| **D3** | En la Cuenta, ¿cómo se cuentan los gastos "Parcial" y las facturas confirmadas sin gasto? ¿Por qué período? | **Parcial = pendiente**, marcado aparte. **Sin gasto = columna propia** (no es pagado ni deuda). Facturado / Pagado / Pendiente **del período por fecha de factura**, y arriba el **pendiente de todas las fechas**. | No hay montos de pago parcial: cualquier otro número sería inventado. En dev hay 3 facturas confirmadas sin gasto. Lo que importa para pagar es la deuda total, no solo la del mes. |
| **D4** | "Sugerido vs. comprado" pasa a comparar contra lo recibido. ¿Se sigue mostrando lo pedido? | **Sí, como columna informativa**, más un "en camino" para lo que todavía no llegó. La diferencia es recibido − sugerido. | Sin lo pedido no se distingue "pedí de más" de "no llegó". |
