# B2 — Compartir factura (especificación ejecutable)

Rama `bloque2/pedidos`, que sale de `qa` @ `878f31d` (con B0, A1 y B1 adentro). Plan maestro: `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md`, fase B2 y "Diagnóstico › Compartir factura".

**Reglas de la fase:**
- Se trabaja solo en dev (`fafckqysyvtlslfnpzrh`) y QA. **Prod no se toca:** ni lecturas, ni migraciones, ni merges a `main`.
- Nunca `supabase link`. Siempre `--project-ref` explícito.
- El `db push` se hace con el OK del coordinador.

**Quién hace qué:**
- El Ejecutor (Opus, esfuerzo medio, `traycer-implement`) hace todo, en el orden de §12.
- Si algo de acá no encaja con el código, frena y avisa: no improvisa.

## 0. Qué cambia, en una línea

Una factura confirmada suma el botón **Compartir**. Abre un modal con dos pestañas:
- **Imagen:** un PNG "comprobante interno, no válido como factura", que se genera en el servidor con `next/og`.
- **Mensaje:** el mensaje de facturación para la administración, armado con una plantilla de tipo `factura`.

Además:
- Las plantillas pasan a tener tipo (`pedido` | `factura`), y Proveedores › Plantillas las filtra por tipo.
- Copiar y WhatsApp salen de `PedidoEnvio` a un componente reutilizable, `CompartirMensaje`.

## 1. Relevamiento del código vigente (2026-10-05, `qa` @ `878f31d`)

**Factura**
- `app/admin/compras/pedidos/facturas/FacturaForm.tsx` (895 líneas):
  - Pie de acciones en `:824-851`. Con una factura `confirmada` muestra "Anular factura" (izquierda, `sm:mr-auto`) y "Cerrar" (derecha, `botonSecundario`).
  - `soloLectura = estado !== 'borrador'` (`:248`).
  - Las líneas son `:562-695`, y son de **A2b**: B2 no las toca.
  - Los totales (`:697-754`) tampoco se tocan.
  - Ya hay un modal encima de otro (`AnularFacturaModal`, `ConfirmarFacturaModal`). `Modal` soporta la pila: Escape cierra solo el de arriba.
- `facturas/page.tsx`:
  - Solo admin: si `profiles.rol !== 'admin'`, redirige.
  - `v_compras_facturas` filtra con `where es_admin()`.
  - Las tablas de factura tienen RLS `es_admin()`.
- `facturas/modelo.ts:330` `FacturaVista` **no** tiene `tipoComprobante`. `compras_facturas.tipo_comprobante` ya existe, con `'factura' | 'nota_credito'`; la NC llega en B4.
- `compras_facturas` tiene `numero` (texto libre, el número impreso del proveedor), `fecha`, `fecha_vencimiento`, `subtotal`, `iva`, `total`, `confirmada_en/por`, `gasto_id`. `compras_factura_items` tiene `descripcion`, `unidad`, `cantidad`, `precio_unitario`, `alicuota_iva`, `subtotal` e `iva`.
- `proveedores.cuit` existe. `compras_pedidos.local_facturacion_id` apunta a `locales_facturacion` (`razon_social`, `cuit`, `sucursal`).
- `lib/compras/totalesFactura.ts`: `calcularTotales(lineas)` devuelve el subtotal, `porAlicuota[]` y el total. `etiquetaAlicuota()`.
- `lib/compras/codigos.ts`: `codigoPedido(n)` y `codigoRemito(nPedido, secuencia)`.
- Validación: no se puede confirmar sin líneas (`modelo.ts:223`, `sin_lineas`).

**Mensajes y plantillas**
- `lib/compras/pedidoMensaje.ts`:
  - `renderPlantilla` usa la sintaxis **`{{variable}}`**. Por eso B2 usa `{{numero_factura}}` y no `{Número}`, como decía el plan maestro.
  - `interpolar` es privada.
  - `linkWhatsApp(tel, msg)`: con número arma `wa.me/<n>`; sin número, `api.whatsapp.com/send` (se elige el contacto).
- `PedidoEnvio.tsx:67-83` (`copiar` / `whatsapp`) y `:175-191` (los dos botones):
  - estado `copiado` por 2 s;
  - `setCompartido(true)` habilita "Marcar como enviado/reenviado";
  - deshabilitados con `!hayMensaje || mensajeDesactualizado`.
- `compras_plantillas_mensaje` (`20260825150000`):
  - `nombre unique`;
  - índice `idx_plantilla_default_unica on (es_default) where es_default` (**una sola default en toda la tabla**);
  - RLS: lectura `tiene_acceso_compras()`, escritura `es_admin()`.
- `PlantillasClient.tsx` escribe directo desde el navegador. `marcarDefault` (`:235`) primero saca la default de **todas** las plantillas y después marca la nueva: son dos pasos sin transacción.
- Pedidos lee las plantillas en `app/admin/compras/pedidos/page.tsx:41-45` (activas, sin filtrar por tipo).
- `compras_config` (clave → jsonb): escritura `es_admin()`. No tiene una pantalla general de edición.

**Infra**
- Next 16.2.7, React 19.2.4, Tailwind 4.
- `next/og` (`ImageResponse`, Satori + Resvg) viene incluido en `next`: `node_modules/next/dist/compiled/@vercel/og`. Doc: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`.
- Fuentes de la app: Syne (400–800) y DM Sans (300–500), desde Google Fonts por `<link>` (`app/layout.tsx:28`). No hay archivos TTF en el repo.
- `proxy.ts`:
  - el `matcher` excluye las rutas que terminan en `.png`, así que la ruta de la imagen **no** puede terminar en `.png`;
  - `/api/*` pasa sin chequear el módulo, así que el handler valida solo.
- Logo: `public/chipacitos-logo.png` (11 KB).

**Datos de dev**, consultados en solo lectura el 2026-10-05:
- 4 facturas confirmadas (P-0006, P-0011, P-0016 y P-0027; solo P-0027 tiene local de facturación) y 3 anuladas.
- Ninguna nota de crédito, ninguna sin líneas y ninguna sin IVA. El máximo es de 8 líneas.
- Una sola plantilla ("Pedido estándar", default).
- `compras_config` no tiene ninguna clave `factura.*`.

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §14)

| # | Decisión | Por qué |
|---|---|---|
| E1 | **La imagen se genera en el servidor con `next/og`** (ver §3). | No suma ninguna dependencia, sale igual en todos los dispositivos y temas, y la valida el servidor (solo admin). |
| E2 | Los datos del comprobante salen de **una sola función de servidor**, `cargarComprobante()`. La usan la ruta de la imagen y la server action del mensaje. | La imagen y el mensaje no pueden decir cosas distintas. No se tocan las consultas de `facturas/page.tsx` ni las props de `FacturasClient`. |
| E3 | El modal **pide los datos al abrirse** (server action) y la imagen por `fetch` a la ruta. | Es el mismo patrón que el arreglo de B1 (`878f31d`): el historial se pide al abrir. |
| E4 | El mensaje **no se guarda ni registra eventos**. Se arma en el cliente con la plantilla, se puede retocar en el textarea y se copia o se manda. | No hay a quién atribuir "enviado": la factura no tiene un circuito de envío. Si hace falta, lo suma B5 (ver D4). |
| E5 | El comprobante usa los **totales confirmados** (`compras_facturas.subtotal/iva/total`, que son el monto del gasto). El desglose por alícuota se calcula de las líneas con `calcularTotales`. El "total según el papel" **no** sale. | La administración paga el gasto. El papel es solo una referencia de carga. |
| E6 | Las **observaciones no salen** ni en la imagen ni en el mensaje. | Son notas internas de carga. |
| E7 | Solo se comparte una factura **confirmada** de tipo **`factura`**. La ruta y la action rechazan el resto (409). La NC la decide B4. | Ver §9. |
| E8 | La plantilla default es **una por tipo**. Marcarla pasa por una RPC atómica que exige que la plantilla esté activa. | Hoy son dos `update` sueltos. Con dos tipos, el índice global impediría tener una default de pedido y otra de factura. |
| E9 | El resto del ABM de plantillas (crear, editar, activar, borrar) **sigue escribiendo desde el navegador**. La única novedad es que manda el `tipo`. | Pasarlo a server action es F9 (está en su lista). B2 no lo amplía. |
| E10 | El **tipo no se cambia** después de crear una plantilla. | Las variables de un tipo no existen en el otro. |
| E11 | El número de WhatsApp de la administración vive en `compras_config` (`factura.whatsapp_admin`) y se edita en Proveedores › Plantillas, filtro Factura. Se guarda con una server action que normaliza y valida. | Es el único lugar donde se configuran mensajes. Si está vacío, WhatsApp se abre sin número y se elige el contacto. |
| E12 | `linkWhatsApp` se muda a `lib/compartir.ts`, junto con los helpers de imagen. `pedidoMensaje.ts` exporta `interpolar`. | `components/ui` no tiene que importar de `lib/compras`. |
| E13 | Las pestañas del modal son un componente nuevo, chico: `components/ui/Pestanas.tsx` (`role="tablist"`, flechas ←/→). El filtro de Plantillas lo reutiliza. | `components/ui/Tabs.tsx` es de navegación por ruta (`<Link>`), no de estado. |

## 3. Librería de imagen: `next/og` (decisión E1)

| Opción | Peso en el cliente | Next 16 / React 19 | Fidelidad | Problemas conocidos |
|---|---|---|---|---|
| **`next/og` `ImageResponse`** (Satori → SVG → Resvg → PNG, en el servidor) | **0 KB.** Ya viene en `next@16.2.7`. | Es la API oficial de Next 16, documentada en el `node_modules` del repo. Corre en una Route Handler con runtime Node. | Determinística: el mismo PNG en Chrome, Safari iOS y Android, con tema claro u oscuro. | Solo flexbox y un subconjunto de CSS (sin grid). Las fuentes tienen que ir como TTF/OTF. Hay que pasar el alto (§8.3). |
| `html-to-image` 1.11 (DOM → SVG `foreignObject` → canvas, en el cliente) | ~12 KB gz | Sin problemas con React 19 (es DOM puro). | Usa los estilos reales de la app. | **Safari iOS:** la primera captura sale a veces sin fuentes ni imágenes (se suele llamar dos veces). Incrusta las webfonts bajando el CSS de Google Fonts en cada captura. El tema oscuro de la app se cuela si no se aísla el nodo. Mantenimiento lento. |
| `modern-screenshot` (fork de html-to-image) | ~15 KB gz | OK | Igual que html-to-image | Arregla parte de los problemas de Safari, pero sigue dependiendo del dispositivo. |
| `html2canvas` 1.4 | ~45 KB gz | OK | Re-implementa el CSS | **No entiende `oklch()`**, que Tailwind 4 usa en sus colores: falla o pinta mal. Sin releases desde 2022. **Descartada.** |

**Elegida: `next/og`.**
- El comprobante es un documento, no una captura de la pantalla: tiene que verse igual en el celular de Marcos y en la PC.
- No suma dependencias.
- La seguridad queda en el servidor: un no admin no puede generarlo, aunque arme la URL a mano.
- La vista previa del modal **es** el PNG final: lo que se ve es exactamente lo que se manda.

**Si en la QA `next/og` no da** (por ejemplo, la ruta no encuentra las fuentes en Vercel y no se arregla con §6.4):
- el plan B es `html-to-image` sobre un nodo oculto con tema claro forzado, con el mismo diseño (§8);
- se avisa al coordinador antes de cambiar.

## 4. Migración `supabase/migrations/20261005170000_compras_plantillas_tipo.sql`

El timestamp tiene que ser mayor que `20261005160000` (A2a usa `150000` y `160000`). **Antes del push**, `ls` de `origin/qa` y de `origin/bloque2/stock`. Si alguien ya usó `170000`, subir al siguiente libre.

```sql
-- B2: plantillas de mensaje por tipo (pedido | factura), una default por tipo,
-- y el número de WhatsApp de la administración para el mensaje de factura.

-- 1. Tipo ---------------------------------------------------------------------
alter table public.compras_plantillas_mensaje
  add column if not exists tipo text not null default 'pedido';
alter table public.compras_plantillas_mensaje
  drop constraint if exists compras_plantillas_mensaje_tipo_check;
alter table public.compras_plantillas_mensaje
  add constraint compras_plantillas_mensaje_tipo_check check (tipo in ('pedido', 'factura'));

-- 2. Una default por tipo (antes: una en toda la tabla) -------------------------
drop index if exists public.idx_plantilla_default_unica;
create unique index if not exists idx_plantilla_default_por_tipo
  on public.compras_plantillas_mensaje (tipo) where es_default;

-- 3. Seed de la plantilla de factura -------------------------------------------
-- Reproduce CUERPO_FACTURA_FALLBACK de lib/compras/facturaMensaje.ts: el día 1
-- la plantilla y el formato estándar dan el mismo texto.
insert into public.compras_plantillas_mensaje (nombre, cuerpo, tipo, es_default, activo, orden)
values (
  'Factura estándar',
  E'🧾 *FACTURA {{numero_factura}}* · {{proveedor}}\n📅 {{fecha}} · Vence: {{vencimiento}}\n📦 Pedido {{pedido}}{{facturado_a}}\n\n*Detalle:*\n{{detalle}}\n\nSubtotal: {{subtotal}}{{iva_detalle}}\n*TOTAL: {{total}}*',
  'factura', true, true, 0
)
on conflict (nombre) do nothing;

-- 4. Marcar la default, atómico y por tipo -------------------------------------
create or replace function public.compras_marcar_plantilla_default(p_plantilla_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_activo boolean;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select tipo, activo into v_tipo, v_activo
  from compras_plantillas_mensaje where id = p_plantilla_id for update;
  if not found then
    raise exception 'La plantilla no existe';
  end if;
  if not v_activo then
    raise exception 'Activá la plantilla antes de marcarla como predeterminada.';
  end if;

  update compras_plantillas_mensaje
     set es_default = false, updated_at = now()
   where tipo = v_tipo and es_default and id <> p_plantilla_id;
  update compras_plantillas_mensaje
     set es_default = true, updated_at = now()
   where id = p_plantilla_id;
end;
$$;

revoke execute on function public.compras_marcar_plantilla_default(uuid) from public, anon;
grant execute on function public.compras_marcar_plantilla_default(uuid) to authenticated;

-- 5. WhatsApp de la administración ----------------------------------------------
insert into public.compras_config (clave, valor, descripcion) values
  ('factura.whatsapp_admin', '""'::jsonb,
   'WhatsApp de la administración para el mensaje de una factura (con código de país, solo dígitos). Vacío: se elige el contacto en WhatsApp.')
on conflict (clave) do nothing;
```

Notas:
- La RLS de `compras_plantillas_mensaje` no cambia: lectura con `tiene_acceso_compras()` (un no admin con Compras puede **leer** la plantilla de factura, que no tiene datos) y escritura con `es_admin()`.
- Después del push: `npm run types` (suma `tipo`, la RPC y nada más; si trae otros cambios, frenar y avisar).

## 5. Lógica pura (sin I/O; se chequea con `npx tsx`)

### 5.1 `lib/compras/comprobanteFactura.ts` (nuevo)

```ts
export interface LineaComprobante {
  descripcion: string
  cantidad: number
  unidad: string | null
  precioUnitario: number
  alicuota: number
  subtotal: number           // sin IVA, el de la base
}

export interface DatosComprobante {
  facturaId: string
  numero: string             // compras_facturas.numero, tal cual (= "código de facturación")
  proveedor: { nombre: string; cuit: string | null }
  fecha: string              // YYYY-MM-DD
  vencimiento: string | null
  pedido: string             // P-0016
  remitos: string[]          // ['R-0016-01', …], por secuencia
  facturadoA: { razonSocial: string; cuit: string; sucursal: string } | null
  lineas: LineaComprobante[]
  subtotal: number           // compras_facturas.subtotal (E5)
  iva: number
  total: number
  porAlicuota: { alicuota: number; base: number; iva: number }[]  // calcularTotales(lineas), sin las de IVA 0
  estadoPago: string | null  // gastos.estado ('Pendiente', 'Pagado', 'Parcial'…) o null
  confirmada: { en: string | null; por: string | null }
  generado: { en: string; por: string }   // ISO + nombre de quien lo genera
}
```

Funciones:
- `armarComprobante(filas): DatosComprobante`:
  - recibe las filas ya consultadas (factura de la vista, ítems por `orden`, remitos, local, proveedor, nombre de quien genera, `ahora`);
  - no consulta nada;
  - ordena los remitos por secuencia;
  - `porAlicuota` sale de `calcularTotales` y filtra `iva === 0`.
- `fechaNumerica(iso: 'YYYY-MM-DD'): string`:
  - devuelve `'05/10/2026'`, partiendo el string;
  - **sin `Date`**, para no correr un día por la zona horaria.
- `fechaHoraNumerica(isoTimestamp): string`: `'05/10/2026 14:32'`, en hora de Argentina (`Intl` con `timeZone: 'America/Argentina/Buenos_Aires'`). La ruta corre en UTC en Vercel.
- `nombreArchivoComprobante(d)`:
  - formato `Factura-<numero>-<PROVEEDOR>.png`;
  - todo lo que no sea `[A-Za-z0-9-]` pasa a `-`, sin guiones repetidos;
  - el proveedor en mayúsculas y recortado a 30 caracteres.
  - Ejemplo: `Factura-0001-00000777-MONTECARLO.png`.
- `altoComprobante(d): number`: el alto en px del PNG (§8.3). Es determinístico y se chequea.
- `TOPE_LINEAS = 120`:
  - por encima, la imagen muestra las primeras 120 y una fila "y N líneas más (ver la factura en el sistema)";
  - el mensaje las lista todas.

### 5.2 `lib/compras/facturaMensaje.ts` (nuevo)

`renderPlantillaFactura(cuerpo: string, d: DatosComprobante): string` usa `interpolar` (que pasa a ser exportada de `pedidoMensaje.ts`). Una variable que no existe queda vacía, igual que en pedido.

| Variable | Valor | Ejemplo |
|---|---|---|
| `{{numero_factura}}` | `d.numero` tal cual (**el código de facturación**) | `0001-00000777` |
| `{{proveedor}}` | nombre, en mayúsculas | `MONTECARLO` |
| `{{fecha}}` | fecha **de la factura** (en la plantilla de pedido, `{{fecha}}` es hoy) | `05/10/2026` |
| `{{vencimiento}}` | fecha, o `sin vencimiento` | `20/10/2026` |
| `{{pedido}}` | código del pedido | `P-0016` |
| `{{remitos}}` | códigos separados por coma, o `sin remitos` | `R-0016-01, R-0016-02` |
| `{{detalle}}` | una línea por ítem: `   — {cant} {UNIDAD} {DESCRIPCIÓN}: {subtotal}` (mayúsculas, como el pedido) | `   — 2 CAJA QUESO BARRA: $ 120.000,00` |
| `{{subtotal}}` | `formatearMonedaExacta(d.subtotal)` | `$ 16.000,00` |
| `{{iva}}` | monto total de IVA (sale aunque sea 0) | `$ 3.360,00` |
| `{{iva_detalle}}` | **bloque:** `\nIVA 21 %: $ 3.360,00` por alícuota con IVA. **Vacío si la factura no suma IVA** ("si suma, el IVA") | |
| `{{total}}` | total | `$ 19.360,00` |
| `{{facturado_a}}` | **bloque:** `\n🏷 Facturado a: {razón social} · CUIT {cuit}`, o vacío si el pedido no tiene local | |
| `{{estado_pago}}` | `Pendiente de pago` / `Pagado` / `Pagado en parte`, o vacío | |

Exporta además:
- `CUERPO_FACTURA_FALLBACK`: idéntico al seed de §4. Se usa si no hay ninguna plantilla de factura activa.
- `VARIABLES_FACTURA`: `{ key, label, desc, icon }[]`, para el editor de Plantillas. Los íconos lucide, en el orden de la tabla, son: `Hash`, `Truck`, `CalendarDays`, `CalendarClock`, `Package`, `PackageCheck`, `ListOrdered`, `Calculator`, `Percent`, `Percent`, `Receipt`, `Building2` y `Wallet`.
- `EJEMPLO_FACTURA: DatosComprobante`: datos de ejemplo para la vista previa (proveedor "Distribuidora Ejemplo", 2 líneas al 21 % y 1 flete al 0 %, con local).

### 5.3 `lib/compartir.ts` (nuevo, solo cliente)

- `linkWhatsApp(telefono, mensaje)`: se **muda** sin cambios desde `pedidoMensaje.ts`.
- `normalizarTelefono(s): string`: solo dígitos.
- `telefonoValido(s)`: vacío, o entre 10 y 15 dígitos.
- `puedeCompartirArchivos(file: File): boolean`: `typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] })`.
- `puedeCopiarImagen(): boolean`: `'ClipboardItem' in window && !!navigator.clipboard?.write`.
- `copiarImagen(blob: Blob): Promise<void>`: `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`.
- `descargar(blob, nombre)`: `<a download>` con un `objectURL` que se revoca después.

### 5.4 `lib/compras/_check_comprobante.ts` (nuevo, como `_check_historial.ts`)

Casos mínimos (todos con `assert` y un `OK n/n` al final):
1. `fechaNumerica('2026-10-05') === '05/10/2026'`. `fechaHoraNumerica` de `2026-10-05T02:30:00Z` da `04/10/2026 23:30`.
2. `nombreArchivoComprobante` con `"0001-00000777"` y `"Montecarlo S.A."` da `Factura-0001-00000777-MONTECARLO-S-A.png`. Con barras y espacios en el número, no hay caracteres inválidos.
3. `armarComprobante` ordena los remitos `[2, 1]` como `R-…-01, R-…-02`. `porAlicuota` no incluye el 0 %.
4. `renderPlantillaFactura(CUERPO_FACTURA_FALLBACK, EJEMPLO_FACTURA)` contiene el número, `*TOTAL: $ …*`, `IVA 21 %` y "Facturado a".
5. Sin IVA (todas las líneas al 0 %): `{{iva_detalle}}` vacío. El texto **no** contiene "IVA".
6. Sin vencimiento: `Vence: sin vencimiento`. Sin local: no aparece "Facturado a".
7. Línea libre (flete, `unidad` null): `   — 1 FLETE: $ …`, sin doble espacio.
8. Variable desconocida `{{xyz}}`: queda vacía.
9. `altoComprobante`: 1 línea corta < 10 líneas cortas < 10 líneas con descripción larga (> 34 caracteres). 130 líneas da lo mismo que 120 + la fila "y N más".
10. `CUERPO_FACTURA_FALLBACK` es **idéntico** al cuerpo del seed de la migración: se lee el `.sql` con `fs` y se compara el literal, desescapando `\n`.

## 6. Servidor

### 6.1 `lib/compras/cargarComprobante.ts` (nuevo, solo servidor)

`cargarComprobante(supabase, facturaId): Promise<{ ok: true; data: DatosComprobante } | { ok: false; status: 401 | 403 | 404 | 409; error: string }>`

1. `auth.getUser()`. Si no hay usuario: 401 "Iniciá sesión".
2. `profiles` (`rol`, `nombre`) del usuario. Si no es `admin`: 403 "Solo un administrador puede compartir facturas".
3. `v_compras_facturas` por id (ya filtra con `es_admin()`). Si no existe: 404 "La factura no existe".
4. Si `tipo_comprobante !== 'factura'`: 409 "Por ahora solo se comparten facturas" (B4 decide la NC).
5. Si `estado === 'anulada'`: 409 "La factura está anulada: no se comparte". Si es `borrador`: 409 "Confirmá la factura antes de compartirla".
6. En paralelo:
   - `compras_factura_items` por `factura_id`, ordenados por `orden`;
   - `compras_pedidos` con `numero, local_facturacion_id, locales_facturacion(razon_social, cuit, sucursal), compras_remitos(secuencia)`;
   - `proveedores(nombre, cuit)`.
7. `armarComprobante(...)` con `generado = { en: now, por: perfil.nombre }`.

Usa `createClientTipado` de `@/lib/supabase/server`, con la sesión del usuario: **nada de service role**.

### 6.2 Ruta de la imagen: `app/api/compras/facturas/[id]/comprobante/route.tsx` (nueva)

- `GET`. Antes de escribirla, leer `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, para la firma de Next 16 (`params` es una `Promise`; tipo `RouteContext`).
- `export const runtime = 'nodejs'` y `export const dynamic = 'force-dynamic'`.
- `cargarComprobante`. Si da error: `new Response(error, { status })` en texto plano.
- Fuentes y logo con `readFile(join(process.cwd(), 'assets/fonts/…'))` y `public/chipacitos-logo.png`. Se cachean en una variable del módulo (se leen una vez por instancia). El logo va como `data:image/png;base64,…`.
- `new ImageResponse(<ComprobanteImagen d={d} logo={logo} />, { width: 1080, height: altoComprobante(d), fonts: [...] })`.
- Headers:
  - `Cache-Control: private, no-store`;
  - `Content-Disposition: inline; filename="<nombreArchivoComprobante>"`.
- `try/catch` alrededor del render. Si falla: `console.error` y 500 "No se pudo generar la imagen".
- El nombre **no termina en `.png`**, por el `matcher` de `proxy.ts`.

### 6.3 `lib/compras/ComprobanteImagen.tsx` (nuevo)

Es JSX para Satori, con **estilos inline** (sin Tailwind ni clases). Todo `div` con más de un hijo lleva `display: 'flex'`. Diseño en §8.

### 6.4 Fuentes y empaquetado

- Archivos estáticos (Satori no maneja bien las fuentes variables):
  - `assets/fonts/DMSans-Regular.ttf` (400);
  - `assets/fonts/DMSans-SemiBold.ttf` (600);
  - `assets/fonts/Syne-Bold.ttf` (700);
  - `assets/fonts/Syne-ExtraBold.ttf` (800);
  - `assets/fonts/OFL.txt` (las dos fuentes son SIL OFL 1.1).
- Cómo bajarlas, una sola vez: pedir `https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Syne:wght@700;800` **sin header `User-Agent`**. Google devuelve el CSS con URLs `.ttf` estáticas por peso. Esas se bajan y se commitean. Tienen que pesar menos de 300 KB entre todas.
- En `next.config.ts`, sumar:
  ```ts
  outputFileTracingIncludes: {
    '/api/compras/facturas/[id]/comprobante': ['./assets/fonts/*.ttf', './public/chipacitos-logo.png'],
  },
  ```
- **Verificación:**
  - después de `npm run build`, `.next/server/app/api/compras/facturas/[id]/comprobante/route.js.nft.json` lista las 4 TTF y el logo;
  - en el preview de QA (Vercel), la imagen carga (§11.6).

### 6.5 Server action `app/admin/compras/pedidos/facturas/compartir.ts` (nuevo, `'use server'`)

Es un archivo aparte de `acciones.ts`, que es de A2b, para no chocar.

`datosCompartirFactura(facturaId: string)` devuelve `Resultado<{ comprobante: DatosComprobante; plantillas: { id, nombre, cuerpo, es_default }[]; whatsappAdmin: string | null }>`.
- Usa `cargarComprobante` (mismos errores, como `{ ok: false, error }`).
- Plantillas: `tipo = 'factura'` y `activo`, ordenadas por `orden`.
- `whatsappAdmin` sale de `compras_config` `factura.whatsapp_admin`, normalizado. Si queda vacío, es `null`.

### 6.6 Server action `app/admin/proveedores/plantillas/acciones.ts` (nuevo, `'use server'`)

- `marcarPlantillaDefault(id)`:
  - `rpc('compras_marcar_plantilla_default')`;
  - devuelve el error de la RPC con `mensajeError`;
  - `revalidatePath('/admin/proveedores/plantillas')` y `revalidatePath('/admin/compras/pedidos')`.
- `guardarWhatsappAdministracion(numero: string)`:
  - chequea que sea admin;
  - normaliza;
  - si no es válido, devuelve "Poné el número con código de país, solo dígitos (ej.: 5493511234567)";
  - hace `upsert` de `compras_config` (`clave`, `valor: to_jsonb(text)`, `updated_at`);
  - si queda vacío, guarda `""`.

## 7. UI

Protocolo de UX:
- `Modal` propio, íconos lucide y tokens semánticos (`bg-surface`, `text-muted`, `border-border`, `bg-accent`…);
- toast de `useToast` (en Facturas) o `useToasts` (en Plantillas, como ya está);
- nunca `confirm()`/`alert()`;
- objetivos táctiles de `min-h-11`.

### 7.1 `components/ui/Pestanas.tsx` (nuevo)

`<Pestanas items={[{ id, label, icon?, contador? }]} activa={id} onCambiar={fn} etiqueta="…" />`
- Un `div role="tablist"` con `aria-label`.
- Cada pestaña es un `button role="tab"` con `aria-selected`, `aria-controls` y `tabIndex` roving. ←/→ cambian de pestaña.
- Estilo de segmentos: `bg-surface2`. La activa es `bg-accent text-black`, igual que en `Tabs.tsx`, para que se vea de la misma familia.
- El panel lo pone quien lo usa (`role="tabpanel"`, `id`).

### 7.2 `components/ui/CompartirMensaje.tsx` (nuevo; se extrae de `PedidoEnvio`)

```ts
{
  mensaje: string | null
  deshabilitado?: boolean           // PedidoEnvio: !hayMensaje || mensajeDesactualizado
  telefono?: string | null          // pedido: el del proveedor; factura: whatsappAdmin
  etiquetaWhatsApp?: string         // default 'Enviar por WhatsApp'
  /** Con teléfono, suma "Elegir otro contacto" (WhatsApp sin número). */
  ofrecerSinNumero?: boolean
  onCompartido?: () => void         // PedidoEnvio: setCompartido(true)
}
```
- Renderiza `<div className="flex flex-col gap-2 sm:flex-row">` con:
  - **Copiar mensaje** (Copy → Check "Copiado" por 2 s; si falla, toast "No se pudo copiar. Seleccioná el texto y copialo a mano.");
  - **WhatsApp** (`bg-success text-black`, `MessageCircle`), con `window.open(linkWhatsApp(telefono, mensaje), '_blank')`.
- Con `ofrecerSinNumero` y teléfono: un tercer botón de texto, "Elegir otro contacto", que abre WhatsApp sin número.
- Los textos, clases e íconos son **los mismos** que hoy en `PedidoEnvio.tsx:175-191`.

**`PedidoEnvio.tsx`:**
- Se borran `copiar`, `whatsapp` y el estado `copiado`.
- La fila de `:175` queda así: `<CompartirMensaje mensaje={fila.mensaje} deshabilitado={!hayMensaje || mensajeDesactualizado} telefono={fila.proveedores?.contacto_telefono ?? null} onCompartido={() => setCompartido(true)} />` + el `div sm:ml-auto` de "Marcar como enviado/reenviado", **sin cambios**.
- El comportamiento tiene que ser idéntico; se verifica en §11.6.

### 7.3 `app/admin/compras/pedidos/page.tsx`

A la consulta de plantillas (`:41-45`) se le suma `.eq('tipo', 'pedido')`. Si no, "Factura estándar" aparece en el select del pedido.

### 7.4 `FacturaForm.tsx`: solo el pie y el montaje del modal

- `modelo.ts` `FacturaVista` suma `tipoComprobante: 'factura' | 'nota_credito'`, que `armarVistas` llena desde `f.tipo_comprobante`. Son 2 líneas; A2b no toca `armarVistas`.
- Estado nuevo: `const [compartirAbierto, setCompartirAbierto] = useState(false)`.
- En el pie (`:836`), dentro del grupo de la derecha, **después** de "Cerrar", y solo si `factura && estadoFactura === 'confirmada' && factura.tipoComprobante === 'factura'`:
  ```tsx
  <button type="button" onClick={() => setCompartirAbierto(true)} disabled={isPending} className={botonPrimario}>
    <Share2 size={16} /> Compartir
  </button>
  ```
  En celular (`flex-col-reverse`) queda arriba de todo; en desktop, a la derecha de "Cerrar".
- Al lado de `<AnularFacturaModal …>` se monta `{factura && compartirAbierto && <CompartirFacturaModal facturaId={factura.id} numero={factura.numero} onCerrar={() => setCompartirAbierto(false)} />}`.
- **Nada más** cambia en el archivo: ni las líneas, ni los totales, ni la confirmación.

### 7.5 `facturas/CompartirFacturaModal.tsx` (nuevo)

`Modal`:
- `title="Compartir factura"`;
- `encabezado`: "Compartir · " + el número en mono;
- `size="lg"` y `pantallaCompletaMobile`.

**Al abrirse** dispara en paralelo:
- `datosCompartirFactura(facturaId)`;
- `fetch('/api/compras/facturas/<id>/comprobante')` → `blob` → `File([blob], nombre, { type: 'image/png' })` + `objectURL` para la vista previa. El nombre sale del header `Content-Disposition`, o de `nombreArchivoComprobante` cuando llegan los datos.

Con un `useRef` de "vigente" (como `busqueda` en `FacturaForm`), una respuesta vieja no pisa a una nueva. El `objectURL` se revoca al desmontar.

**La imagen se pide antes del clic** para que "Compartir" y "Copiar" corran **sincrónicos en el gesto del usuario**. Safari iOS pierde la activación si hay un `await fetch` en el medio.

```
┌ Compartir · 0001-00000777 ───────────────────────────── ✕ ┐
│ [ 🖼 Imagen ] [ 💬 Mensaje ]                               │
│ ┌──────────────────────────────────────────────────────┐ │
│ │      (vista previa del PNG, ancho completo,          │ │
│ │       max-h 60vh con scroll, borde y sombra suave)   │ │
│ └──────────────────────────────────────────────────────┘ │
│ ⓘ Comprobante interno: dice que no es una factura oficial.│
│ [ ⤴ Compartir ]  [ ⬇ Descargar ]  [ ⧉ Copiar imagen ]     │
└──────────────────────────────────────────────────────────┘
```

**Pestaña Imagen**
- **Cargando:** `Skeleton` con la proporción aproximada (1080 × `altoComprobante`, si ya llegaron los datos).
- **Error:** `rounded-xl border border-warning bg-warning-bg` con el texto del servidor (por ejemplo, "La factura está anulada: no se comparte") y el botón **Reintentar**.
- **Vista previa:**
  - `<img src={objectURL} alt="Comprobante interno de la factura <n> de <proveedor>. No válido como factura." className="w-full rounded-xl border border-border shadow-sm" />`;
  - va en un contenedor `max-h-[60vh] overflow-y-auto` en desktop; en celular, a lo largo completo.
- **Acciones** (`flex flex-col gap-2 sm:flex-row`):
  - **Compartir** (`Share2`, primario): solo si `puedeCompartirArchivos(file)`. Llama a `navigator.share({ files: [file], title: 'Factura <n> · <proveedor>' })`.
    - `AbortError` (el usuario canceló): no avisa.
    - Otro error: toast "No se pudo compartir. Descargala y mandala a mano".
  - **Descargar** (`Download`): `descargar(blob, nombre)`, con toast "Imagen descargada". Es primario cuando "Compartir" no está.
  - **Copiar imagen** (`Copy` → `Check` "Copiada" por 2 s): solo si `puedeCopiarImagen()`. Si falla, toast "Tu navegador no deja copiar imágenes: descargala".
- Abajo, `text-xs text-muted` con `Info`: "Es un comprobante interno para compartir: la imagen dice que no es una factura oficial."

**Pestaña Mensaje**
- **Plantilla:** un select, solo si hay más de una activa. Arranca en la `es_default` o la primera. Si no hay ninguna, se usa `CUERPO_FACTURA_FALLBACK` con la ayuda "Sin plantillas de factura: formato estándar".
- **Texto:**
  - un `textarea` (`controlClass`, `rows={12}`, fuente sans) con `renderPlantillaFactura(cuerpo, comprobante)`;
  - se puede retocar antes de mandar;
  - si se editó, aparece **"Volver al texto de la plantilla"** (`RotateCcw`);
  - cambiar de plantilla regenera el texto (si estaba editado, primero un `ConfirmDialog` propio: "Se pierde lo que cambiaste").
- **Acciones:** `<CompartirMensaje mensaje={texto} deshabilitado={!texto.trim()} telefono={whatsappAdmin} etiquetaWhatsApp={whatsappAdmin ? 'Enviar a la administración' : 'Enviar por WhatsApp'} ofrecerSinNumero />`.
- **Aviso:** si el texto pasa los 3.500 caracteres, `text-xs text-warning`: "Mensaje largo: si WhatsApp lo corta, usá Copiar".
- **Pie:** link "Editar plantillas de factura" → `/admin/proveedores/plantillas?tipo=factura` (un `<Link>` con permiso garantizado: es admin), con `text-xs`.
- Sin `whatsappAdmin`: `text-xs text-muted`, "WhatsApp se abre para que elijas el contacto. Podés fijar el número de la administración en Plantillas".

**Cerrar** el modal vuelve a la factura: es un modal apilado, y Escape cierra solo este.

### 7.6 Proveedores › Plantillas

`page.tsx`:
- lee `searchParams.tipo` (`'pedido' | 'factura'`, default `'pedido'`);
- suma la consulta de `compras_config` `factura.whatsapp_admin`;
- pasa `tipoInicial` y `whatsappAdmin`.

`PlantillasClient.tsx`:
- **Filtro** arriba de la tabla: `<Pestanas>` con **Pedido (n)** y **Factura (n)**.
  - El título queda igual.
  - La bajada cambia: "Formato del mensaje de WhatsApp al proveedor" / "Formato del mensaje de facturación para la administración".
  - El tipo elegido se refleja en la URL con `router.replace('?tipo=…', { scroll: false })`.
- **Lista:** solo las del tipo. El vacío dice "Todavía no hay plantillas de factura".
- **Nueva plantilla:** se crea con el tipo del filtro (`insert` con `tipo`). El título del modal es "Nueva plantilla de factura" / "de pedido".
- **Editor:**
  - las variables del tipo (`VARIABLES` actual para pedido, `VARIABLES_FACTURA` para factura);
  - los botones "Expandir bloque…" solo en pedido;
  - la vista previa usa `renderPlantillaFactura(form.cuerpo, EJEMPLO_FACTURA)` en factura;
  - el select "Ver como" (local) solo en pedido.
- **Default:** `marcarDefault` pasa a `marcarPlantillaDefault(p.id)` (server action). Si sale bien, en el estado local se saca la default de las del **mismo tipo**. Un error se muestra con toast (por ejemplo, "Activá la plantilla antes…").
- **Tarjeta de WhatsApp** (solo con el filtro Factura), arriba de la tabla, con tokens semánticos:
  - título "WhatsApp de la administración" (`Phone`);
  - input `inputMode="tel"`, placeholder `5493511234567`;
  - ayuda: "Con código de país y sin espacios. Si lo dejás vacío, WhatsApp se abre para que elijas el contacto";
  - botón **Guardar** (con `Loader2` mientras guarda) y toast "Número guardado" / "Número borrado".
- **No** se rediseña el resto de la tabla vieja (colores hex): queda para F9/B3. Lo nuevo usa tokens.

## 8. Diseño del comprobante

Hacer una pasada con las skills de diseño del protocolo: `frontend-design` para la dirección, `ux-copy` para los textos y `ui-review` sobre el PNG y el modal, en celular y desktop. Las conclusiones van a `notas-B2.md`.

### 8.1 Dirección

**"Ticket de mostrador":**
- un ticket de papel claro, de la casa;
- borde inferior troquelado;
- números grandes y tabulados;
- un **sello de goma rojo, inclinado: "NO VÁLIDO COMO FACTURA"**.

El sello es el ancla visual y, a la vez, el descargo legal: nadie puede leer el total sin ver el sello. Siempre en tema claro (es un papel), sin importar el tema de la app.

### 8.2 Sistema

- **Lienzo:** 1080 px de ancho, padding lateral de 64 px, ritmo de 8 px.
- **Paleta fija** (inline; no son tokens de la app):

  | Uso | Color |
  |---|---|
  | Papel | `#FFFDF8` |
  | Tinta | `#1A1A1A` |
  | Tinta suave | `#6B6658` |
  | Líneas | `#E7E0CF` |
  | Banda y acento | `#E8C547` (oro de la marca; nunca texto sobre blanco) |
  | Fondo del total | `#FBF3D0` |
  | Sello | `#C62828` |

- **Tipografía:**
  - Syne 800 para el número de factura y el total;
  - Syne 700 para la marca y el sello;
  - DM Sans 400/600 para todo lo demás.
  - Tamaños: cuerpo 24, etiquetas 18 en mayúsculas con `letterSpacing: 2`, número 56, total 52.

### 8.3 Estructura (de arriba abajo) y alto

```
████████████████████████ banda oro 16px ███████████████████████████
 [logo 72] YA! Chipacitos                        COMPROBANTE INTERNO
           Compras · Fábrica              ╱ NO VÁLIDO COMO FACTURA ╱  ← sello -6°, borde 4px rojo
 FACTURA DEL PROVEEDOR
 0001-00000777                                      (Syne 800, 56)
 MONTECARLO · CUIT 30-71234567-8
 ─────────────────────────────────────────────────────────────────
 FECHA 05/10/2026   VENCE 20/10/2026   PEDIDO P-0016   REMITOS R-0016-01
 FACTURADO A  Chipacitos SRL · CUIT 30-… · Paraguay 388          (si hay local)
 ─────────────────────────────────────────────────────────────────
 DESCRIPCIÓN                         CANT.   P. UNIT.   IVA   SUBTOTAL
 Queso barra                       2 caja  $ 60.000   21 %  $ 120.000,00
 Flete                                  1  $ 5.000     0 %   $ 5.000,00
 ─────────────────────────────────────────────────────────────────
                                  Subtotal sin IVA     $ 125.000,00
                                  IVA 21 % s/ $120.000  $ 25.200,00
                               ┃ TOTAL                 $ 150.200,00   ← fondo #FBF3D0, barra oro
                                  Gasto: pendiente de pago            (si hay gasto)
 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
 Representación digital de la factura 0001-00000777 de MONTECARLO,
 cargada en el sistema de compras de YA! Chipacitos. No es un comprobante
 fiscal: no la emitió ARCA y no reemplaza la factura original del proveedor.
 Confirmada el 05/10/2026 14:10 por Marcos · Generado el 05/10/2026 14:32 por Santiago
 ◖◗◖◗◖◗◖◗◖◗◖◗◖◗◖◗◖◗◖◗ borde troquelado (círculos de 24px del color del fondo) ◖◗◖◗◖◗
```

- **Tabla:**
  - columnas flex con anchos fijos: descripción `flex: 1`, cantidad 150, precio unitario 170, IVA 90 y subtotal 200, alineadas a la derecha;
  - la descripción tiene `lineClamp: 2`;
  - las filas alternan con un `#FBF8F0` muy suave;
  - unidad en minúscula.
- **Sello:**
  - `position: 'absolute'`, arriba a la derecha;
  - `transform: 'rotate(-6deg)'`, `border: '4px solid #C62828'`, `borderRadius: 12`, padding de 10 × 20;
  - Syne 700, 28, `letterSpacing: 1`, color `#C62828`, `opacity: 0.92`.
- **Alto** (`altoComprobante`):
  - base = 900 (cabecera, metadatos, totales y pie) + 64 si hay "Facturado a" + 40 si hay estado de pago;
  - más 56 por línea, o 88 si la descripción pasa los 34 caracteres (dos renglones);
  - con un mínimo de 1.200;
  - el valor de 34 se calibra en la QA con una descripción de 60 caracteres (§11.6).
- **Copy fijo** (pasarlo por `ux-copy`; no se cambia el sentido): "COMPROBANTE INTERNO", "NO VÁLIDO COMO FACTURA", "FACTURA DEL PROVEEDOR" y el párrafo del pie.

## 9. Casos borde

| Caso | Qué pasa |
|---|---|
| **Factura anulada** | "Compartir" no aparece: el pie solo lo muestra en `confirmada`. La ruta y la action devuelven 409 "La factura está anulada: no se comparte" (por si alguien guardó la URL). Una imagen que ya se bajó antes de anular sigue circulando: por eso el pie dice cuándo y por quién se generó. |
| **Borrador** | El botón no aparece. La ruta da 409 "Confirmá la factura antes de compartirla". |
| **Factura sin líneas** | La UI no deja confirmarla (`sin_lineas`) y en dev no hay ninguna. Si llegara una (dato viejo o una RPC futura): la imagen muestra la fila "Sin líneas cargadas" y los totales de la base. `{{detalle}}` da `   — (sin detalle)`. Lo cubre el chequeo puro. |
| **Nota de crédito** (B4) | Hoy no existe. El botón exige `tipoComprobante === 'factura'`, y la ruta y la action dan 409 "Por ahora solo se comparten facturas". B4 decide si la NC se comparte (título "NOTA DE CRÉDITO", importes en negativo) y lo suma en `cargarComprobante`, `ComprobanteImagen` y la plantilla. **B2 no lo prepara más allá de esto.** |
| **Celular sin `navigator.share` de archivos** (Firefox Android, navegadores viejos, WebView) | No se muestra "Compartir". Quedan **Descargar** (primario) y **Copiar imagen** si hay `ClipboardItem`. Desktop Chrome/Edge en Windows sí suele tener `canShare` con archivos (abre el panel de Windows), y eso está bien. |
| **Sin `ClipboardItem`** (Firefox < 127) | No se muestra "Copiar imagen". |
| **`navigator.share` cancelado** | `AbortError`: silencio, sin toast. |
| **La imagen tarda o falla** (500) | Skeleton, y después el error con "Reintentar". La pestaña Mensaje funciona igual (la action va por separado). |
| **Sin IVA** (todo al 0 %) | El comprobante no muestra filas de IVA. `{{iva_detalle}}` vacío. `{{iva}}` = `$ 0,00`. |
| **Sin vencimiento** | Imagen: "VENCE —". Mensaje: "sin vencimiento". |
| **Sin local de facturación** (3 de las 4 facturas de dev) | Sin "Facturado a" en la imagen ni en el mensaje. |
| **Sin remitos** (factura "llega después") | Imagen: "REMITOS —". Mensaje: "sin remitos". |
| **Sin gasto vinculado** (facturas viejas) | Sin la línea de estado de pago. `{{estado_pago}}` vacío. |
| **Más de 120 líneas** | La imagen corta en 120, con la fila "y N líneas más". El mensaje va completo, con el aviso de largo. |
| **Descripción muy larga** | Se corta en 2 renglones con "…" (`lineClamp`). El mensaje va completo. |
| **No admin que arma la URL** | 403 desde la ruta. La action devuelve el error. La pantalla de Facturas ya lo redirige. |
| **Número de factura con barras o espacios** | El nombre del archivo se sanea. En la imagen y el mensaje va tal cual. |
| **Plantilla de factura desactivada o borrada** | Sin activas: `CUERPO_FACTURA_FALLBACK`. La default inactiva no se puede marcar (RPC). |
| **WhatsApp admin mal cargado** | La action lo rechaza al guardar. Un valor viejo inválido en la base se ignora: `whatsappAdmin = null`. |

## 10. Archivos

**En alcance (nuevos)**
- `supabase/migrations/20261005170000_compras_plantillas_tipo.sql`
- `lib/compras/comprobanteFactura.ts`, `lib/compras/facturaMensaje.ts`, `lib/compras/_check_comprobante.ts`
- `lib/compras/cargarComprobante.ts`, `lib/compras/ComprobanteImagen.tsx`
- `lib/compartir.ts`
- `app/api/compras/facturas/[id]/comprobante/route.tsx`
- `assets/fonts/DMSans-Regular.ttf`, `DMSans-SemiBold.ttf`, `Syne-Bold.ttf`, `Syne-ExtraBold.ttf`, `OFL.txt`
- `components/ui/Pestanas.tsx`, `components/ui/CompartirMensaje.tsx`
- `app/admin/compras/pedidos/facturas/CompartirFacturaModal.tsx`, `app/admin/compras/pedidos/facturas/compartir.ts`
- `app/admin/proveedores/plantillas/acciones.ts`
- `docs/bloque2/notas-B2.md`

**En alcance (modificados)**
- `next.config.ts`: solo `outputFileTracingIncludes`.
- `lib/compras/pedidoMensaje.ts`: `export function interpolar`; sale `linkWhatsApp` (se muda).
- `app/admin/compras/pedidos/PedidoEnvio.tsx`: usa `CompartirMensaje`.
- `app/admin/compras/pedidos/page.tsx`: `.eq('tipo', 'pedido')`.
- `app/admin/compras/pedidos/facturas/FacturaForm.tsx`: **solo** imports, el estado `compartirAbierto`, el botón del pie (`:836-850`) y el montaje del modal. Las líneas (`:562-695`) y los totales **no**: son de A2b.
- `app/admin/compras/pedidos/facturas/modelo.ts`: `FacturaVista.tipoComprobante` en `armarVistas`.
- `app/admin/proveedores/plantillas/page.tsx` y `PlantillasClient.tsx`.
- `lib/database.types.ts`: regenerado.

**Fuera de alcance**
- Las líneas y los totales de `FacturaForm`; `facturas/acciones.ts`; las RPCs de factura (`compras_guardar_factura`, `compras_confirmar_factura`): todo eso es de A2b.
- `facturas/datos.ts`, `facturas/page.tsx` y `FacturasClient.tsx`: no hace falta tocarlos (E3).
- `v_compras_facturas`, remitos, gastos.
- La nota de crédito (B4).
- Los eventos o el historial del envío de la factura (D4).
- Pasar a server action el resto del ABM de plantillas (F9).
- Rediseñar la tabla vieja de Plantillas.
- El manual o la guía de Marcos (van todos juntos al final, cuando lo pida el usuario).
- El plan maestro (lo actualiza el coordinador).

## 11. Verificación

### 11.1 Antes de empezar

```bash
git fetch && git reset --hard origin/qa     # qa @ 878f31d o posterior
cat supabase/.temp/project-ref              # tiene que dar fafckqysyvtlslfnpzrh
ls supabase/migrations | tail -3
git ls-tree --name-only origin/bloque2/stock supabase/migrations/ | tail -3   # A2a: 150000/160000
```

Copiar `.env.local` desde `C:\Dev\Trabajo\4peeq\YA!Chipacitos\.env.local` si falta. `npm install` **no** suma ninguna dependencia: si `package.json` cambia, algo está mal.

### 11.2 SQL de escenarios (dev, **sin pushear**; todo se revierte)

Es un archivo en el scratchpad, que no se commitea. Lleva **la migración completa** + un `do $$ … $$` que termina con `raise exception 'RESULTADO: %', <jsonb>`. El `raise` aborta el lote entero.

```bash
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <scratchpad>/b2_escenarios.sql
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select count(*) = 0 as limpio from information_schema.columns where table_name = 'compras_plantillas_mensaje' and column_name = 'tipo'"
```

La sesión se simula como en B1 (`set_config('request.jwt.claims', …)` + `set_config('role', 'authenticated', true)`). Los uuid salen de `auth.users where email like 'qa-%'`.

| # | Escenario | Esperado |
|---|---|---|
| T1 | Después de la migración | Las plantillas que ya existían tienen `tipo = 'pedido'`. Existe "Factura estándar" con `tipo = 'factura'`, default y activa. No existe `idx_plantilla_default_unica` y sí `idx_plantilla_default_por_tipo`. |
| T2 | Defaults | Exactamente 2 `es_default` (una por tipo). |
| T3 | `insert` de una segunda default `factura` (como postgres) | `unique_violation`, atrapada con `begin … exception`. |
| T4 | `qa-admin`: crear "Factura 2" (activa) y `compras_marcar_plantilla_default` | "Factura 2" queda default y "Factura estándar" no. "Pedido estándar" **sigue** siendo default. |
| T5 | La RPC sobre una plantilla inactiva | Error "Activá la plantilla…". La default no cambió. |
| T6 | La RPC con un id inexistente | "La plantilla no existe". |
| T7 | La RPC como `qa-squad` (Compras, no admin) | "No autorizado". Ese usuario puede hacer `select` de las de factura (lectura de compras); un `update` afecta 0 filas. |
| T8 | La RPC como `anon` | Permiso denegado (`has_function_privilege('anon', …) = false`). |
| T9 | `insert` con `tipo = 'otro'` | `check_violation`. |
| T10 | `compras_config` | Existe `factura.whatsapp_admin` con valor `""`. |

### 11.3 Chequeos puros, tipos, lint y build

```bash
npx tsx lib/compras/_check_comprobante.ts      # §5.4, todos OK
npx tsx lib/compras/_check_historial.ts        # sigue OK (B1)
npm run types        # solo DESPUÉS del push a dev
npx tsc --noEmit && npx eslint <archivos tocados> && npm run build
```

Después del build, revisar `.next/server/app/api/compras/facturas/[id]/comprobante/route.js.nft.json`: tiene que listar las 4 TTF y el logo.

### 11.4 Push a dev (con OK del coordinador)

1. Avisar al coordinador y esperar el OK. Un solo push a la vez: confirmar que A2a no esté pusheando.
2. `git fetch && git rebase origin/qa`. Confirmar que el timestamp sea mayor que el último de `qa`.
3. `npx supabase db push --dry-run --project-ref fafckqysyvtlslfnpzrh`. Tiene que aparecer **solo** `20261005170000`.
4. `npx supabase db push --project-ref fafckqysyvtlslfnpzrh`.
5. T1, T2 y T10 contra la base real (sin rollback).
6. `npm run types`. Avisar al coordinador para el merge a `qa`.

### 11.5 Ruta de la imagen, sin navegador

Con el dev server en el 3006 (desde **PowerShell**: `npm run dev -- -p 3006`):
- sin cookie, `curl -i` da **401**;
- con la cookie de `qa-squad`, da **403**.

La cookie se toma de una sesión de Playwright.

### 11.6 QA en el navegador (local :3006 contra dev)

- **Cuentas:** `qa-admin@chipacitos.test` y `qa-squad`. Las contraseñas están en `C:\Dev\Trabajo\4peeq\YA!Chipacitos\docs\qa-credenciales-dev.md`: no se copian a ningún doc.
- **Herramienta:** el navegador de Traycer o un script de Playwright, como en B1 (en B1, la pestaña aislada de Traycer no daba layout).
- **Recorrido:**

**Imagen**
1. Facturas › P-0016 (confirmada, 0001-00000777). En el pie aparece **Compartir** a la derecha de "Cerrar". Abrirlo: la pestaña Imagen muestra la vista previa.
2. **Descargar.** En Playwright, con `page.waitForEvent('download')` y `download.saveAs(<scratchpad>/comprobante-P0016.png)`.
   - **Verificar la imagen descargada**, abriéndola con la herramienta de lectura de imágenes. Tiene que tener:
     - el sello "NO VÁLIDO COMO FACTURA";
     - "COMPROBANTE INTERNO";
     - el número 0001-00000777, MONTECARLO (o el proveedor real), P-0016;
     - las líneas;
     - IVA $ 3.360,00 y total $ 19.360,00 (los valores de la base);
     - el pie entero, sin cortes abajo.
   - Medir: ancho 1080 y un alto igual a `altoComprobante` (leer el IHDR con un script de node).
   - Nombre del archivo: `Factura-0001-00000777-<PROVEEDOR>.png`.
3. **Copiar imagen** → "Copiada". Pegarla en un editor o en el portapapeles de Playwright (`navigator.clipboard.read()`) y confirmar `image/png`.
4. Viewport 375 × 812, emulando un celular con `navigator.canShare`: aparece **Compartir**. Simular `navigator.share` con un stub y verificar que lo llama con 1 `File` `image/png`. Sin `canShare` (un stub que lo borra): no aparece, y "Descargar" pasa a primario.
5. P-0027 (con local): la imagen tiene "FACTURADO A".

**Factura de prueba larga** (hace falta crearla):
6. En P-0036 (el pedido de prueba de B1, Enviado), cargar y confirmar una factura `B2-QA-0001` con 12 líneas:
   - una con una descripción de 60 caracteres;
   - un flete al 0 %;
   - una al 10,5 %.
   
   Descargar y verificar:
   - la descripción en 2 renglones con "…";
   - dos filas de IVA (21 y 10,5) y ninguna del 0 %;
   - sin cortes abajo.
   
   Si se corta o sobra mucho espacio, recalibrar el 34 de `altoComprobante`.

**Mensaje**
7. Pestaña Mensaje: el texto tiene "*FACTURA 0001-00000777*", el detalle, "Subtotal", "IVA 21 %" y "*TOTAL: $ 19.360,00*".
   - **Copiar** → "Copiado".
   - **Enviar por WhatsApp** → la pestaña nueva es `api.whatsapp.com/send?text=…` (**sin** número).
8. Plantillas › Factura: guardar el número `5493510000000` → toast. Volver al modal de la factura:
   - el botón dice "Enviar a la administración" y abre `wa.me/5493510000000?text=…`;
   - "Elegir otro contacto" abre sin número.
   
   Borrar el número al terminar.
9. Retocar el texto → aparece "Volver al texto de la plantilla", que lo restaura.

**Plantillas**
10. Filtro Pedido / Factura con sus contadores. `?tipo=factura` entra directo en Factura.
    - Crear "Factura corta" → aparece en Factura y **no** en Pedido.
    - Las variables son las de factura y la vista previa usa el ejemplo.
11. Marcar "Factura corta" como default → "Pedido estándar" sigue con su estrella. Desactivar "Factura corta" e intentar marcarla → toast "Activá la plantilla…".
12. En el modal de la factura aparece el select de plantilla (hay 2 activas): cambiar regenera el texto.

**Sin regresiones en Pedidos**
13. En un pedido sin enviar:
    - el select de plantilla **no** lista las de factura;
    - Generar → Copiar → se habilita "Marcar como enviado";
    - WhatsApp abre con el teléfono del proveedor (`wa.me/<n>` si tiene; si no, sin número).
    
    El comportamiento es idéntico al de antes.

**Bordes**
14. Anular `B2-QA-0001`: "Compartir" desaparece. La URL de la imagen da 409.
15. `qa-squad`: Facturas lo rebota (como antes). La URL de la imagen da 403.

**Capturas:** el modal (las dos pestañas) a 375 px y 1280 px, en oscuro y en claro, sin scroll horizontal. Hacer la pasada de `ui-review` sobre esas capturas y el PNG.

**En QA (Vercel), después del merge:** abrir el modal en una factura y verificar que la imagen carga. Así se confirma que las fuentes se empaquetaron (§6.4).

### 11.7 Datos de dev

Anotar en `notas-B2.md` lo que queda:
- la factura `B2-QA-0001` (anulada) en P-0036;
- las plantillas "Factura corta" / "Factura 2", si quedaron (mejor borrarlas);
- el número de WhatsApp vacío.

## 12. Commits y cierre (rama `bloque2/pedidos`)

1. `feat(compras): plantillas de mensaje por tipo y default por tipo (B2)`: migración + `database.types.ts` + `.eq('tipo','pedido')` en Pedidos. La rama se pushea **después** del `db push` autorizado.
2. `refactor(ui): CompartirMensaje reutilizable; Pedidos lo usa (B2)`: `lib/compartir.ts`, `CompartirMensaje`, `PedidoEnvio`, `pedidoMensaje`.
3. `feat(compras): comprobante de factura en PNG con next/og (B2)`: lógica pura + chequeo, loader, ruta, `ComprobanteImagen`, fuentes, `next.config.ts`.
4. `feat(compras): botón Compartir y modal Imagen/Mensaje en la factura (B2)`: `Pestanas`, modal, action `compartir.ts`, pie de `FacturaForm`, `modelo.ts`.
5. `feat(proveedores): filtro por tipo y WhatsApp de la administración en Plantillas (B2)`.
6. `docs(bloque2): notas de B2`, con desvíos, verificación, datos de dev y la lista de pruebas.

**No commitear** lo que no es tuyo (`Excalidraw/`, `docs/roadmap-marcos.html`, `docs/avances-*`, `docs/entregas/2026-10-01-*`). No editar el plan maestro.

## 13. Lista de pruebas para el usuario

Se pasa recién **cuando el coordinador haya mergeado a `qa`**. En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin`.

**Circuito 1 — La imagen**
1. Compras › Facturas → abrí una factura confirmada (por ejemplo, la de P-0016). Abajo aparece **Compartir**. → Se abre un modal con las pestañas Imagen y Mensaje.
2. En Imagen ves el comprobante. → Arriba a la derecha tiene el sello rojo "NO VÁLIDO COMO FACTURA", y abajo, el texto que aclara que no la emitió ARCA. El número, el proveedor, las líneas, el IVA y el total coinciden con la factura.
3. **Descargar.** → Baja un PNG llamado `Factura-<número>-<PROVEEDOR>.png`. Abrilo: se lee entero, sin cortes.
4. **Copiar imagen** y pegala en un chat de WhatsApp Web. → Se pega la imagen.
5. Desde el celular, en la misma factura → **Compartir** abre el menú del teléfono. Elegí WhatsApp y un contacto: llega la imagen.

**Circuito 2 — El mensaje para la administración**
6. Pestaña Mensaje. → Tiene el **N° de factura del proveedor** como código, el proveedor, la fecha, el vencimiento, el pedido P-xxxx, el detalle, el IVA (si tiene) y el total.
7. Cambiá una palabra del texto. → Aparece "Volver al texto de la plantilla"; tocalo y vuelve.
8. **Enviar por WhatsApp.** → WhatsApp se abre con el texto y te deja elegir el contacto.
9. Proveedores › Plantillas › **Factura** → cargá el WhatsApp de la administración y guardá. Volvé a la factura → el botón dice **"Enviar a la administración"** y abre directo ese chat. "Elegir otro contacto" sigue abriendo sin número.

**Circuito 3 — Plantillas**
10. Proveedores › Plantillas: arriba se elige **Pedido** o **Factura**. En Factura está "Factura estándar". Creá otra con las variables de factura → la vista previa la muestra con datos de ejemplo.
11. Marcala como predeterminada (estrella). → En Pedido, "Pedido estándar" sigue siendo la predeterminada.
12. En Pedidos, al generar el mensaje de un pedido, la lista de plantillas **no** muestra las de factura.

**Circuito 4 — Lo que no se comparte**
13. Una factura anulada o un borrador **no** tiene el botón Compartir.
14. En un pedido, el envío al proveedor (Copiar / WhatsApp / Marcar como enviado) funciona igual que antes.

**Datos de prueba que quedan en dev:** los lista el Ejecutor en `notas-B2.md`.

## 14. Decisiones que necesitan al usuario

- **D1 — Librería: `next/og` en el servidor en vez de `html-to-image`, como decía el plan.** No suma dependencia, sale igual en todos los celulares y temas, y la valida el servidor. El costo es escribir el comprobante con estilos inline (un diseño aparte del de la pantalla, que es lo que corresponde para un documento) y commitear 4 fuentes (< 300 KB). **Recomendado: `next/og`** (§3). `html-to-image` queda como plan B.
- **D2 — Cómo se marca que no es oficial.** Recomendado: **el sello rojo "NO VÁLIDO COMO FACTURA" en la cabecera + "COMPROBANTE INTERNO" + el párrafo del pie**, sin marca de agua sobre las líneas. Una marca de agua diagonal hace más difícil recortarlo, pero ensucia la lectura de los números. **Recomendado: sin marca de agua.**
- **D3 — Número de la administración en Plantillas.** Un campo opcional en Proveedores › Plantillas › Factura. Vacío, WhatsApp abre para elegir el contacto (lo que pidió el usuario). **Recomendado: sumarlo en B2** (es chico).
- **D4 — Registrar el envío.** Compartir no guarda el mensaje ni deja un evento ("Factura compartida con la administración"): no hay manera de saber si se mandó de verdad, y no hay un circuito que lo use. **Recomendado: no en B2.** Si se quiere el rastro, lo suma B5 junto con los avisos.
- **D5 — Qué no sale en el comprobante.** No salen las observaciones internas ni el "total según el papel". El total es el confirmado, que es el monto del gasto. **Recomendado: así.**
