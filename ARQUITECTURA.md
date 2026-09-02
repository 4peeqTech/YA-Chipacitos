# YA! Chipacitos — Arquitectura, módulos y base de datos

> Documento de referencia técnica. Describe **qué hace cada módulo**, **cómo fluye cada
> proceso de negocio**, **dónde vive cada tabla** y **qué conviene optimizar** para que el
> sistema escale.
>
> Última revisión: 2026-08-04 · rama `dev` · Next.js 16.2.7 / React 19.2.4 / Supabase

---

## Índice

1. [Panorama general](#1-panorama-general)
2. [Stack y convenciones](#2-stack-y-convenciones)
3. [Autenticación, roles y autorización](#3-autenticación-roles-y-autorización)
4. [Mapa de rutas](#4-mapa-de-rutas)
5. [Módulos y flujos](#5-módulos-y-flujos)
   - [5.1 Pedidos internos (Mayorista)](#51-pedidos-internos-mayorista)
   - [5.2 Ventas Posberry + Conciliación](#52-ventas-posberry--conciliación)
   - [5.3 Gastos y Pagos](#53-gastos-y-pagos)
   - [5.4 Integración Fudo](#54-integración-fudo)
   - [5.5 Compras a proveedores](#55-compras-a-proveedores)
   - [5.6 Tareas / Squad](#56-tareas--squad)
   - [5.7 Notificaciones y PWA](#57-notificaciones-y-pwa)
   - [5.8 Parámetros y maestros](#58-parámetros-y-maestros)
   - [5.9 Módulo Fábrica](#59-módulo-fábrica)
6. [Base de datos — inventario completo](#6-base-de-datos--inventario-completo)
7. [Funciones, RLS, Realtime y Storage](#7-funciones-rls-realtime-y-storage)
8. [API interna](#8-api-interna)
9. [Integraciones externas y variables de entorno](#9-integraciones-externas-y-variables-de-entorno)
10. [Diagnóstico: deuda técnica y bugs detectados](#10-diagnóstico-deuda-técnica-y-bugs-detectados)
11. [Plan de optimización y escalabilidad](#11-plan-de-optimización-y-escalabilidad)

---

## 1. Panorama general

YA! Chipacitos es un **ERP interno monolítico** para una cadena de locales de comida
(chipá / churros) en Corrientes, Argentina. Cubre cinco dominios que hoy están
acoplados en una sola app Next.js sobre una sola base Postgres (Supabase):

| Dominio | Qué resuelve | Actores |
|---|---|---|
| **Pedidos internos** | Cada sucursal pide mercadería a Fábrica o Depósito; el operador prepara/envía; la sucursal recibe y confirma con remito | `local`, `fabrica`, `deposito` |
| **Ventas + Conciliación** | Importa ventas reales (Posberry vía Google Sheets) y las cruza contra lo remitido, para detectar faltantes/sobrantes | `admin` |
| **Gastos** | Registro de gastos por local/rubro/categoría, estado de pago, comprobantes | `admin` |
| **Compras a proveedores** | Catálogo de insumos, stock, pedidos por WhatsApp, remitos de recepción, reportes | `admin`, `squad` |
| **Tareas** | Gestión de tareas del equipo administrativo, con subtareas, informes diarios, voz→tarea vía IA | todos los que tengan el módulo |

Todo corre en **Vercel** (SSR + API Routes + 1 cron) contra **Supabase**
(Postgres + Auth + Realtime + Storage).

```
┌───────────────────────────────────────────────────────────────┐
│  Navegador (PWA instalable · Service Worker · Web Push)       │
└───────┬───────────────────────────────────────────┬───────────┘
        │ Server Components (SSR)                   │ supabase-js (browser)
        │ + API Routes                              │ lectura/escritura directa vía RLS
        ▼                                           ▼
┌───────────────────────────────┐        ┌──────────────────────────┐
│  Next.js 16 en Vercel         │        │  Supabase                │
│  · proxy.ts (middleware auth) │───────▶│  · Postgres + RLS        │
│  · /api/* (25 handlers)       │        │  · Auth (email+password) │
│  · Vercel Cron 11:00 UTC      │        │  · Realtime (WebSocket)  │
└───────┬───────────────────────┘        │  · Storage (2 buckets)   │
        │                                └──────────────────────────┘
        │ fetch externo
        ▼
  Google Sheets API v4 · Fudo API (auth.fu.do / api.fu.do) · Groq (Whisper + Llama) · tickets.4peeq.com
```

**Nota clave sobre el patrón de acceso a datos:** la app usa **dos caminos en paralelo**
hacia la base y esto es la decisión arquitectónica más importante a entender:

- **Camino A — Supabase directo desde el cliente/servidor con la anon key.** La
  autorización la hace **RLS en Postgres**. Lo usan casi todos los módulos
  (pedidos, tareas, compras, catálogo, conciliación, gastos).
- **Camino B — API Routes con `SUPABASE_SERVICE_ROLE_KEY`.** Saltan RLS y validan el
  rol a mano (`requireAdmin()`). Se usa donde RLS no alcanza: crear/banear usuarios,
  leer suscripciones push de terceros, insertar notificaciones, sincronizar el Sheet,
  hablar con Fudo (para no exponer credenciales al browser).

Cualquier cambio de permisos hay que hacerlo **en los dos lados**.

---

## 2. Stack y convenciones

| Pieza | Versión / detalle |
|---|---|
| Framework | Next.js **16.2.7**, App Router, React 19.2.4 |
| Middleware | **`proxy.ts` en la raíz** — en Next 16 el archivo `middleware.ts` pasó a llamarse `proxy.ts` y exporta `proxy()` en vez de `middleware()` |
| Estilos | Tailwind CSS v4 (`@tailwindcss/postcss`), sin `tailwind.config` — configuración inline en `app/globals.css` |
| Tipos | TypeScript strict, tipos de dominio centralizados en [lib/types.ts](lib/types.ts) |
| Validación | Zod v4 — **solo** en `/api/usuarios`. El resto de endpoints no valida input |
| Fuentes | Syne (títulos) + DM Sans (cuerpo), cargadas por `<link>` a Google Fonts en [app/layout.tsx](app/layout.tsx) |
| Tema | Dark por defecto; toggle claro persistido en cookie `theme`, leída en el Root Layout para evitar flash |
| Idioma | **Todo el código, comentarios, tablas y columnas están en español** (`es-AR`) |
| Zona horaria | `America/Argentina/Buenos_Aires` (UTC-3), manejada a mano — ver [§10.4](#104-manejo-de-zona-horaria) |
| Deploy | Vercel; 1 cron en [vercel.json](vercel.json) |
| Tests | **No hay.** Ni unitarios, ni E2E, ni CI |

> ⚠️ **[AGENTS.md](AGENTS.md) advierte que esta versión de Next.js tiene breaking changes
> respecto del conocimiento entrenado.** Antes de escribir código, leer la guía relevante
> en `node_modules/next/dist/docs/`.

### Estructura de carpetas

```
app/
├─ admin/          Panel administrativo (el 70% de la app)
│  ├─ compras/     Módulo Compras: insumos, stock, pedidos, remitos, reportes
│  ├─ gastos/      Gastos + pendientes de pago
│  ├─ integraciones/  Cruces Fudo ↔ Posberry
│  └─ ...          catalogo, conciliacion, mapeos, usuarios, roles, plan-cuentas, etc.
├─ local/          Portal sucursal: pedir + historial + ventas
├─ fabrica/        Portal operador Fábrica: pedidos + catálogo
├─ deposito/       Portal operador Depósito: pedidos + catálogo
├─ tareas/         Módulo Tareas (transversal a todos los roles)
├─ api/            25 route handlers
├─ ayuda/          Documentación in-app por rol
└─ login/

components/
├─ pedidos/        Compartidos entre local/fabrica/deposito
└─ ui/             Card, Badge, Header, Sidebar, BottomNav, TablaMaestra, SelectBuscador,
                   NotificationBell, PushToggle, SWRegister, InstallPrompt

lib/
├─ supabase/       client.ts (browser) · server.ts (SSR con cookies)
├─ compras/        matchRemito · pedidoMensaje · rangoFechas · reportes  ← lógica pura, testeable
├─ push/           sendPush.ts (web-push + registro in-app)
├─ groq/           transcribir.ts (Whisper)
├─ modulos.ts      ★ Registro único de módulos + reglas de rol
├─ types.ts        Tipos de dominio
├─ fudo.ts         Cliente Fudo + normalizador JSON:API
├─ csvParser.ts    Parser CSV/números formato es-AR
└─ gastos-constants.ts   Constantes hardcodeadas (ver §10.3)

supabase/
├─ migrations/                    43 migraciones aplicadas
└─ migrations_archive_pre_sync/   Historial previo al tracking (solo referencia)
```

### El archivo más importante: `lib/modulos.ts`

[lib/modulos.ts](lib/modulos.ts) es el **registro único de módulos**. Un solo array
`MODULOS[]` alimenta tres consumidores:

1. El **Sidebar** (navegación agrupada por `section`).
2. El **guard de `/admin/*`** en [proxy.ts](proxy.ts) (qué puede ver un rol no-admin).
3. El **editor de permisos** en Usuarios.

Agregar un módulo nuevo = agregar una entrada acá + crear la ruta. No hay que tocar
navegación ni permisos por separado.

---

## 3. Autenticación, roles y autorización

### 3.1 Login

[app/login/page.tsx](app/login/page.tsx) → `supabase.auth.signInWithPassword()` →
lee `profiles.rol` → `router.push(getRoleHome(rol))`.

No hay registro público, ni recuperación de contraseña, ni OAuth. **Los usuarios los
crea el admin** desde `/admin/usuarios` (vía `/api/usuarios` con service role).

### 3.2 Los roles

Los roles viven en la tabla **`roles`** (dinámicos) y `profiles.rol` es FK a
`roles.key`. Hay cinco de fábrica:

| Rol | `es_sistema` | Home | Árbol de rutas | Permisos |
|---|---|---|---|---|
| `local` | ✔ | `/local/pedidos` | `/local`, `/ayuda` | Solo sus propios pedidos |
| `deposito` | ✔ | `/deposito/pedidos` | `/deposito`, `/ayuda` | Pedidos con `destino='deposito'` + catálogo de insumos |
| `fabrica` | ✔ | `/fabrica/pedidos` | `/fabrica`, `/ayuda` | Pedidos con `destino='fabrica'` + catálogo de productos |
| `admin` | ✔ | `/admin/dashboard` | todo | Todo, sin mirar `modulos_permitidos` |
| `squad` | ✗ | primer módulo asignado | `/admin`, `/ayuda` | Solo módulos en `profiles.modulos_permitidos[]` |

**Roles personalizados:** el admin puede crear roles nuevos desde `/admin/roles`. Se
comportan igual que `squad` — la función `esRolConModulos(rol)` en
[lib/modulos.ts](lib/modulos.ts) devuelve `true` para cualquier rol que no sea `admin`
ni uno de los tres operativos (`ROLES_OPERATIVOS`).

### 3.3 Las tres capas de autorización

```
Capa 1 — proxy.ts (middleware, corre en el edge en cada request)
   · Sin sesión → /login
   · /  → redirige al home del rol
   · Valida que el pathname esté en el árbol permitido para el rol
   · Para squad/roles custom en /admin/*: getModuloPorPath(pathname) debe
     estar en modulos_permitidos, si no redirige al primer módulo o /ayuda
   · /api/* SIEMPRE pasa (cada handler valida por su cuenta)
   · /tareas es transversal: pasa si rol='admin' o 'tareas' ∈ modulos_permitidos

Capa 2 — Layouts (Server Components)
   · app/admin/layout.tsx  → redirect('/login') si no es admin ni rol-con-módulos
   · app/local|fabrica|deposito/layout.tsx → exige rol exacto (o admin)
   · app/tareas/layout.tsx → exige 'tareas' ∈ modulos_permitidos

Capa 3 — RLS en Postgres (la única que un atacante no puede saltar)
   · Helper get_user_rol() SECURITY DEFINER STABLE
   · Ver el inventario completo de policies en §7.2
```

**Importante:** las capas 1 y 2 son UX (que nadie vea una pantalla vacía). La única
frontera de seguridad real es **RLS**, porque el navegador tiene la anon key y puede
llamar a Supabase directo.

### 3.4 Módulos asignables

Los `key` de módulo que se guardan en `profiles.modulos_permitidos[]`:

```
dashboard
gastos · gastos_pendientes · resumen · fudo                      (sección Gastos)
importar · posberry · conciliacion                                (sección Mayorista)
integraciones_ventas · integraciones_cajas                        (sección Integraciones)
catalogo · mapeos · usuarios · roles · plan_cuentas ·
  proveedores · cajas · formas_pago                                (sección Parámetros)
compras-insumos · compras-stock · compras-pedidos ·
  compras-remitos · compras-reportes                              (sección Compras)
tareas
```

---

## 4. Mapa de rutas

### Páginas

| Ruta | Tipo | Datos que carga | Módulo |
|---|---|---|---|
| `/login` | Client | — | — |
| `/` | Server | redirige a `/login` (el proxy intercepta antes) | — |
| `/ayuda` | Server + Client | `profiles` | Documentación por rol |
| **Local** | | | |
| `/local/pedidos` | Server | `profiles`, `productos` (activos), últimos 50 `pedidos` | Pedidos |
| `/local/historial` | Server | últimos 100 `pedidos` del local | Pedidos |
| `/local/ventas` | Server | `ventas_posberry` de hoy | Ventas |
| **Operadores** | | | |
| `/fabrica/pedidos` | Server | `productos` (tipo=producto, destino=fabrica), últimos 100 `pedidos` | Pedidos |
| `/fabrica/catalogo` | Server | `productos` de fábrica | Catálogo |
| `/deposito/pedidos` | Server | `productos` (tipo=insumo, destino=deposito), últimos 100 `pedidos` | Pedidos |
| `/deposito/catalogo` | Server | `productos` de depósito | Catálogo |
| **Admin — Gastos** | | | |
| `/admin/dashboard` | Server | 4 métricas del día (ventas, pedidos pend./enviados, alertas) | Dashboard |
| `/admin/gastos` | Client | fetch de `gastos` + `proveedores` en el cliente | Gastos |
| `/admin/gastos/pendientes` | Server + Client | `gastos` estado Pendiente/Parcial + `/api/fudo/pendientes` | Gastos |
| `/admin/resumen` | Client | `/api/resumen` | Gastos |
| `/admin/fudo` | Client | `/api/locales` + `/api/fudo` | Gastos |
| **Admin — Mayorista** | | | |
| `/admin/importar` | Server + Client | `config.apps_script_url`; dispara `/api/sync-sheets` | Ventas |
| `/admin/posberry` | Client | `/api/posberry-raw` (lee el Sheet en vivo) | Ventas |
| `/admin/conciliacion` | Server + Client | `conciliaciones` de hoy + locales + ventas | Conciliación |
| **Admin — Integraciones** | | | |
| `/admin/integraciones/ventas` | Client | `/api/integraciones/ventas` (Posberry vs Fudo) | Integraciones |
| `/admin/integraciones/cajas` | Client | `/api/integraciones/cajas` | Integraciones |
| **Admin — Parámetros** | | | |
| `/admin/catalogo` | Server + Client | `productos` + `producto_mapeos` | Catálogo |
| `/admin/mapeos` | Server + Client | nombres distintos de `ventas_posberry` (limit 5000) + mapeos + productos | Catálogo |
| `/admin/usuarios` | Server + Client | `profiles` (limit 500) + `roles` + emails vía **service role** | Usuarios |
| `/admin/roles` | Server + Client | `roles` + conteo de usuarios por rol | Usuarios |
| `/admin/proveedores` | Server + Client | `proveedores` | Compras |
| `/admin/plan-cuentas` | Client | `/api/plan-cuentas` | Gastos |
| `/admin/cajas` | Client | `TablaMaestra` → `/api/cajas` | Gastos |
| `/admin/formas-pago` | Client | `TablaMaestra` → `/api/formas-pago` | Gastos |
| **Admin — Compras** | | | |
| `/admin/compras/insumos` | Server + Client | `compras_items` + proveedores con `maneja_stock` | Compras |
| `/admin/compras/stock` | Server + Client | `compras_items` activos + `compras_stock_actual` | Compras |
| `/admin/compras/pedidos` | Server + Client | proveedores + catálogo + stock + pedidos con remitos anidados | Compras |
| `/admin/compras/remitos` | Server + Client | `compras_remitos` con pedido/proveedor/ítems | Compras |
| `/admin/compras/reportes` | Server + Client | remitos + pedidos + movimientos + stock (4 queries) | Compras |
| **Tareas** | | | |
| `/tareas` | Server + Client | `tareas` propias/asignadas + `perfiles` con acceso | Tareas |
| `/tareas/todas` | Server + Client | **todas** las tareas vía service role — solo 1 usuario hardcodeado | Tareas |
| `/tareas/agente` | Server + Client | `perfiles`; chat contra `/api/tareas/agente` | Tareas |

**Error boundaries:** `app/global-error.tsx` + uno por segmento
(`admin`, `local`, `fabrica`, `deposito`, `tareas`).

---

## 5. Módulos y flujos

### 5.1 Pedidos internos (Mayorista)

El flujo original del sistema y el más maduro. **Sucursal → Fábrica/Depósito → recepción.**

#### Máquina de estados

```
                  ┌──────────────┐
   Sucursal ─────▶│  pendiente   │  created_at
   crea pedido    └──────┬───────┘
                         │ Operador toma el pedido
                         ▼
                  ┌──────────────┐
                  │  preparando  │  preparando_at
                  └──────┬───────┘
                         │ Operador despacha
                         ▼
                  ┌──────────────┐
                  │   enviado    │  enviado_at
                  └──────┬───────┘
                         │ Sucursal confirma recepción (carga el remito)
                         ▼
                  ┌──────────────┐
                  │   recibido   │  recibido_at  ← dispara la conciliación
                  └──────────────┘
```

#### Paso a paso

**1 · La sucursal arma el pedido** — [app/local/pedidos/LocalPedidosClient.tsx](app/local/pedidos/LocalPedidosClient.tsx)

- Ve el catálogo completo de `productos` activos, separado en dos tabs:
  `destino='fabrica'` y `destino='deposito'`.
- Arma un carrito en memoria (`CarritoItem[]`).
- Al confirmar, si el carrito tiene productos de **ambos** destinos, se crean **dos
  pedidos** ligados por un `grupo_id` (UUID generado en el cliente) — así el operador
  de Fábrica solo ve lo suyo y el de Depósito lo suyo, pero el historial los muestra
  juntos.
- Inserta en `pedidos` (uno por destino) + `pedido_items` en batch.
- Llama a `POST /api/notificaciones/pedidos` con `{ destino }` → push a todos los
  operadores de ese rol.

**2 · El operador procesa** — [components/pedidos/PedidosOperadorClient.tsx](components/pedidos/PedidosOperadorClient.tsx)

Componente compartido por Fábrica y Depósito (se parametriza con `tipo` + `destino`).

- Lista los pedidos de su destino (últimos 100), agrupados por estado.
- `cambiarEstado(pedido, nuevoEstado)` hace un `update` sobre `pedidos` y estampa el
  timestamp correspondiente (`preparando_at` / `enviado_at`).
- Suscripción **Realtime** a `pedidos` → ve pedidos nuevos sin recargar.
- Al pasar a `enviado`, notifica al local dueño vía
  `POST /api/notificaciones/pedidos` con `{ pedidoId }` (el server resuelve el
  destinatario — el cliente nunca elige a quién avisar).
- Chat por pedido: `pedido_mensajes` ([components/pedidos/PedidoMensajes.tsx](components/pedidos/PedidoMensajes.tsx)).

**3 · La sucursal recibe y carga el remito** — `LocalPedidosClient` / [HistorialClient](app/local/historial/HistorialClient.tsx)

Este es el paso que alimenta toda la contabilidad:

- Se abre el formulario de remito, precargado con `cantidad_recibida = cantidad` pedida.
- La sucursal corrige cantidades si llegó de menos, y carga `valor_total` por ítem.
- Puede **agregar ítems que no estaban en el pedido** (llegaron de más) — se insertan
  como `pedido_items` nuevos.
- Se hace `update pedido_items` (uno por ítem) + `update pedidos SET estado='recibido',
  recibido_at=now()`.
- Desde ese momento, `recalcular_conciliacion()` toma esas cantidades y montos.

#### Tablas involucradas

`pedidos` · `pedido_items` · `pedido_mensajes` · `productos` · `profiles`

#### Puntos frágiles

- La carga del remito son **N+2 llamadas independientes** desde el navegador (una por
  ítem, más el update del pedido). Si se corta a la mitad, el pedido queda `enviado`
  con ítems ya modificados. **No hay transacción.**
- El `grupo_id` se genera en el cliente y no tiene FK ni índice.
- `estado` no tiene guardas: nada impide pasar de `pendiente` directo a `recibido`
  vía un `update` manual, ni volver atrás.

---

### 5.2 Ventas Posberry + Conciliación

El corazón del control de gestión: **¿lo que la sucursal vendió coincide con lo que
recibió de Fábrica?**

#### Origen del dato

Posberry (el sistema de ventas de terceros) escribe a un **Google Sheet**; la app lo
lee con la Google Sheets API v4.

- Sheet ID hardcodeado: `1oJiwMbjnrG6vUdtVFt19OjMFLFyTzCSu0y9aEKwdehQ`, hoja `BD`
  (repetido en [/api/sync-sheets](app/api/sync-sheets/route.ts) y
  [/api/posberry-raw](app/api/posberry-raw/route.ts)).
- Hay también un [supabase/google-apps-script.js](supabase/google-apps-script.js) y una
  `config.apps_script_url` — camino **legacy**, hoy la sincronización va por la API v4.

#### Flujo de sincronización — `POST /api/sync-sheets`

```
1. Auth: sesión + profiles.rol = 'admin'
2. GET a Sheets API → trae la hoja BD COMPLETA (no acepta rango)
3. Detecta columnas por encabezado: idventa, fecha, cliente, producto,
   unidades, "monto bruto"
4. Filtra filas:  cliente empieza con "Suc." o "Facultad"  ∧  unidades > 0
                  ∧  fecha ∈ [fechaDesde, fechaHasta]
5. matchLocal(cliente) → profiles con rol='local', por prioridad:
      a) profiles.nombre_posberry === cliente     (match exacto configurado)
      b) profiles.local_nombre === cliente
      c) contención en cualquier sentido (includes)
      → si no matchea: se acumula en `noMapeados` y se descarta la fila
6. Deduplica por (id_externo + producto_nombre)  ← una orden trae varios productos
7. DELETE de ventas_posberry del rango  (filtrado por archivo_origen='Google Sheets (live)')
8. INSERT de los registros únicos
9. rpc('recalcular_conciliacion') por CADA (local × fecha) del rango,
   incluyendo locales que solo tienen pedidos y ninguna venta
```

El paso 9 es un `Promise.all` de `locales × fechas` llamadas RPC — con un rango de un
mes y 5 locales son **150 llamadas concurrentes**.

#### La función `recalcular_conciliacion(p_fecha, p_local_id)`

Reescrita **6 veces** a lo largo del historial. La versión vigente es
[20260619145358_conciliacion_agregar_montos.sql](supabase/migrations/20260619145358_conciliacion_agregar_montos.sql):

```sql
DELETE FROM conciliaciones WHERE fecha = p_fecha AND local_id = p_local_id;

INSERT INTO conciliaciones (..., vendido, pedido, monto_vendido, monto_remito)
SELECT ... FROM (
  -- Lado VENDIDO: ventas_posberry del día, con el nombre normalizado
  -- vía producto_mapeos → productos.nombre
  SELECT COALESCE(pr.nombre, vp.producto_nombre), vp.cantidad,
         COALESCE(vp.importe,0), 'venta'
  FROM ventas_posberry vp
  LEFT JOIN producto_mapeos pm ON pm.nombre_posberry = vp.producto_nombre
  LEFT JOIN productos pr       ON pr.id = pm.producto_id
  WHERE vp.fecha = p_fecha AND vp.local_id = p_local_id

  UNION ALL

  -- Lado REMITO: solo pedidos ya RECIBIDOS, por fecha de recepción
  -- en hora Argentina, usando cantidad_recibida (no cantidad pedida)
  SELECT pi.producto_nombre,
         COALESCE(pi.cantidad_recibida, pi.cantidad),
         COALESCE(pi.valor_total, 0), 'remito'
  FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
  WHERE (p.recibido_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = p_fecha
    AND p.local_id = p_local_id AND p.estado = 'recibido'
) combined
GROUP BY producto_nombre;
```

La evolución de esta función cuenta la historia del negocio:

| Migración | Cambio | Por qué |
|---|---|---|
| `initial_schema` | `pedido_items` sin filtro | Primera versión |
| `..._full_outer` | Normaliza nombres vía `producto_mapeos`; solo estados ≠ pendiente | Los nombres de Posberry no coinciden con el catálogo |
| `..._timezone_y_estados` | `AT TIME ZONE 'America/Argentina/Buenos_Aires'` | Los pedidos de la noche caían en el día siguiente |
| `..._generated_columns` | Quita `diferencia`/`tiene_alerta` del INSERT | Son columnas **GENERATED**, no se pueden insertar |
| `..._usar_remito` | Pasa de `created_at` a `recibido_at` y de `cantidad` a `cantidad_recibida` | Lo que importa es lo que **llegó**, no lo que se pidió |
| `..._agregar_montos` | Suma `monto_vendido` / `monto_remito` | Control por plata, no solo por unidades |

#### Columnas derivadas de `conciliaciones`

```sql
diferencia   GENERATED ALWAYS AS (vendido - pedido) STORED
tiene_alerta GENERATED ALWAYS AS (vendido > pedido) STORED
```

`tiene_alerta = vendido > pedido` significa: **vendió más de lo que recibió** → hay
mercadería sin trazabilidad. (Ojo: una de las versiones intermedias de la función usaba
`ABS(diferencia) > 0`, criterio distinto; la columna generada tiene la última palabra.)

#### Pantalla de conciliación — [ConciliacionClient.tsx](app/admin/conciliacion/ConciliacionClient.tsx)

- Rango de fechas + filtro por local + "solo alertas" + "solo sin confirmar".
- Botón **Recalcular**: busca los pares `(local, fecha)` que tengan ventas o pedidos en
  el rango y llama la RPC para cada uno.
- **Confirmación:** el admin marca filas como `confirmado` (+ `confirmado_at`,
  `confirmado_por`) — es el visto bueno humano sobre la diferencia.
- Usa `useDeferredValue` en los filtros para no bloquear el render con muchas filas.

#### Mapeo de productos — [/admin/mapeos](app/admin/mapeos/MapeosClient.tsx)

Posberry usa nombres libres ("CHIPA X 12", "Chipacito grande"). La tabla
`producto_mapeos` traduce `nombre_posberry → productos.id`. Un mapeo con
`ignorado = true` saca ese nombre de la lista de pendientes sin asociarlo a nada.

La página junta los nombres desde dos fuentes: los distintos que aparecen en
`ventas_posberry` (**con `limit 5000`**, no un `DISTINCT` real) más los ya mapeados.

#### Tablas involucradas

`ventas_posberry` · `conciliaciones` · `producto_mapeos` · `productos` · `pedidos` ·
`pedido_items` · `profiles` · `config`

---

### 5.3 Gastos y Pagos

Registro contable de egresos, con dos fuentes: **carga manual** y **gastos traídos de Fudo**.

#### Plan de cuentas

La clasificación es de dos niveles, **rubro → categoría**, en la tabla `plan_cuentas`:

```
MATERIA PRIMA          → MATERIA PRIMA · LACTEOS/QUESO · HUEVOS · HARINA/ALMIDON ·
                          SAL/CONDIMENTOS · FRUTAS · MERCADERIA DE REVENTA
INSUMOS Y EMBALAJE     → INSUMOS · EMBALAJE/BOLSAS · ETIQUETAS · INSUMOS DE LIMPIEZA ·
                          LIBRERIA/PAPELERIA
PERSONAL               → SUELDOS PRODUCCION · SUELDOS SUCURSAL · SUELDOS ADMIN ·
                          CARGAS SOCIALES/SINDICATO · ART/COBERTURA MEDICA
IMPUESTOS Y CARGAS     → IMPUESTO NACIONAL · IMPUESTO PROVINCIAL · PLAN DE PAGO
SERVICIOS Y ESTRUCTURA → ALQUILER · ELECTRICIDAD · AGUA · INTERNET/TELEFONIA · SISTEMA
HONORARIOS             → CONTADOR · DISEÑO · LEGAL · CONSULTORIA
LOGISTICA Y RODADOS    → COMBUSTIBLE · MANTENIMIENTO VEHICULO · FLETE/CORREO · SEGURO VEHICULO
MOVIMIENTO INTERNO     → (sin categorías)
```

Cada línea además tiene `variabilidad` (`VARIABLE` | `FIJO`) y `flujo`
(`INGRESO` | `EGRESO`) para armar el estado de resultados. Editable desde
`/admin/plan-cuentas`.

> ⚠️ **Esta jerarquía está duplicada** en [lib/gastos-constants.ts](lib/gastos-constants.ts)
> (`RUBROS_CATEGORIAS`). Si se edita `plan_cuentas` desde la UI, la constante queda
> desfasada. Ver [§10.3](#103-datos-duplicados-entre-código-y-base).

#### Flujo de un gasto manual — [GastosClient.tsx](app/admin/gastos/GastosClient.tsx)

```
1. Se carga: fecha · local · rubro · categoría · proveedor_id · monto ·
             forma_pago · caja · estado · observaciones
2. estado ∈ { 'Pendiente de pago', 'Pagado', 'Parcial' }
3. Si queda pendiente → aparece en /admin/gastos/pendientes
4. Al pagarlo: se sube comprobante al bucket `comprobantes` y se
   registran fecha_pago + pagado_por + comprobante_url
```

#### Pendientes de pago — [PendientesClient.tsx](app/admin/gastos/pendientes/PendientesClient.tsx)

Pantalla unificada que mezcla **dos orígenes** en una sola lista:

- `gastos` con estado `Pendiente de pago` o `Parcial` (marcados `_source: 'manual'`).
- Gastos `UNPAID` traídos en vivo de la API de Fudo vía
  [/api/fudo/pendientes](app/api/fudo/pendientes/route.ts) (marcados `_source: 'fudo'`).

Para no volver a mostrar un gasto de Fudo ya pagado desde acá, se lleva la tabla
**`fudo_pagos`** con clave `UNIQUE(fudo_expense_id, sucursal)`. `/api/fudo/pendientes`
arma un `Set` de esos IDs y los filtra del resultado. Es un **libro de pagos propio
sobre datos ajenos** — no se escribe nada en Fudo.

#### Resumen por local — `/admin/resumen` → [/api/resumen](app/api/resumen/route.ts)

Cruza gastos y ventas por local en un rango:

```
Por cada local:
  gastos[]  = [{ categoria, total }]  ordenado desc
  ventas[]  = [{ producto, cantidad, importe }]  ordenado desc
  totalGastos · totalVendido · totalMontoVendido
```

La agregación se hace **en JavaScript** después de traer todas las filas del rango.

#### Tablas involucradas

`gastos` · `plan_cuentas` · `proveedores` · `formas_pago` · `cajas` ·
`fudo_pagos` · Storage `comprobantes`

---

### 5.4 Integración Fudo

Fudo es el POS de las sucursales. La integración es de **solo lectura** y por sucursal.

#### Credenciales

Viven en **variables de entorno**, una por sucursal:
`FUDO_API_KEY_<SLUG>` / `FUDO_API_SECRET_<SLUG>` (`<SLUG>` = nombre de la sucursal en
mayúsculas con no-alfanuméricos → `_`, ver `slugSucursal()` en
[lib/fudo.ts](lib/fudo.ts)). `locales_config` (`id`, `sucursal`, `activo`) solo guarda
metadata — qué sucursales existen y si están activas. No tiene UI de administración:
`GET /api/locales` solo alimenta el selector de sucursal de `/admin/fudo`; alta/baja/
edición se hacen directo en la base. Las 5 sucursales activas y sus variables:
`YA! PARAGUAY` → `FUDO_API_KEY_YA_PARAGUAY` / `FUDO_API_SECRET_YA_PARAGUAY`,
`YA! CORDOBA` → `..._YA_CORDOBA`, `YA! IRIGOYEN` → `..._YA_IRIGOYEN`,
`YA! SAN LORENZO` → `..._YA_SAN_LORENZO`, `YA! UNIDAD` → `..._YA_UNIDAD`.

> ✅ **Resuelto 2026-08-04** (ver [§10.1](#101-seguridad), S1/S2): las credenciales ya
> no viven en la base ni se seedean en migraciones. La migración histórica
> [20260622193133_007_locales_config.sql](supabase/migrations/20260622193133_007_locales_config.sql)
> sigue commiteada con los valores viejos (ya rotados en Fudo, por lo tanto inertes);
> [20260804140000_fudo_credenciales_a_env.sql](supabase/migrations/20260804140000_fudo_credenciales_a_env.sql)
> dropea esas columnas de la tabla real. `GET /api/locales` ya no devuelve secretos ni
> tiene UI de edición (`/admin/locales` se eliminó): solo lista `{ sucursal, activo }`
> para el selector de `/admin/fudo`.

#### Cliente Fudo — [lib/fudo.ts](lib/fudo.ts)

```
getFudoToken(apiKey, apiSecret)   POST https://auth.fu.do/api      → { token }
fudoGet(token, path)              GET  https://api.fu.do/v1alpha1  Bearer token
normalizeJsonApi(data)            Aplana JSON:API: resuelve `included` en un Map
                                  por `${type}:${id}` y expande relationships inline
```

No hay caché de token (se pide uno nuevo en cada request) ni paginación
(todos los endpoints usan `page[size]=500` fijo).

#### Los cuatro endpoints que la consumen

| Endpoint | Recurso Fudo | Qué produce |
|---|---|---|
| [/api/fudo](app/api/fudo/route.ts) | `/expenses`, `/sales`, `/payments` de **una** sucursal | Explorador crudo para `/admin/fudo` |
| [/api/fudo/pendientes](app/api/fudo/pendientes/route.ts) | `/expenses?filter[status]=eq.UNPAID` de **todas** | Gastos por pagar, menos los ya registrados en `fudo_pagos` |
| [/api/integraciones/ventas](app/api/integraciones/ventas/route.ts) | `/sales` (CLOSED) de todas + `ventas_posberry` | Cruce **Posberry vs Fudo** por sucursal |
| [/api/integraciones/cajas](app/api/integraciones/cajas/route.ts) | `/sales` agrupado por `cashRegister` + intento a `/cashRegisters` | Ventas y saldo por caja |

**Cruce de nombres de sucursal:** Fudo dice `YA! CORDOBA`, Posberry dice `Suc. Cordoba`.
`normalizarNombre()` en `/api/integraciones/ventas` saca el prefijo con
`/^\s*(ya!|suc\.?)\s*/i` y compara en mayúsculas. Es un criterio **paralelo pero
distinto** al `matchLocal()` de `/api/sync-sheets`.

**Sobre `/api/integraciones/cajas`:** el recurso `/cashRegisters` no está documentado
públicamente por Fudo. El código lo intenta, y si falla o no trae campos reconocibles
de saldo/estado (busca por regex `/balance|amount|saldo/i` y `/status|state|abiert|open/i`),
cae de vuelta a agrupar `/sales` por caja. Defensivo pero frágil ante cambios de la API.

#### El modelo `fudo_*` sin uso

La migración [20260622174059_fudo_sync_model.sql](supabase/migrations/20260622174059_fudo_sync_model.sql)
creó **13 tablas** para espejar Fudo localmente (`fudo_productos`, `fudo_ventas`,
`fudo_pagos`, `fudo_ingredientes`, `fudo_clientes`, `fudo_sync_log`, etc.), cada una
con columnas tipadas + `raw jsonb` + `synced_at`.

**Ninguna de esas 13 tablas se escribe ni se lee desde el código.** No existe el job de
sincronización que las llenaría. Es un modelo planificado y no implementado.

> ⚠️ Hay una **colisión de nombres**: `fudo_pagos` se crea dos veces con esquemas
> distintos — en `20260622174059` (PK `fudo_id text`, espejo de la API) y en
> `20260622200306_009_fudo_pagos_v2.sql` (PK `uuid`, libro de pagos propio). La segunda
> usa `CREATE TABLE IF NOT EXISTS`, así que **no se aplicó** — la tabla que quedó en
> producción es la del espejo, y el código de Pendientes inserta contra columnas
> (`fudo_expense_id`, `sucursal`, `comprobante_url`…) que pertenecen a la v2. Verificar
> el esquema real en producción antes de tocar esto.

---

### 5.5 Compras a proveedores

El módulo más nuevo (agosto 2026), construido en 4 fases con especificación y plan
escritos en [docs/superpowers/](docs/superpowers/). Reemplaza un HTML legacy
("Ya!ModuloCompra").

#### El flujo completo

```
┌─── Fase 1: catálogo y stock ─────────────────────────────────────┐
│                                                                  │
│  proveedores.maneja_stock = true                                 │
│         │                                                        │
│         ▼                                                        │
│  compras_items   (nombre, unidad, categoria_id, meta_semanal,    │
│                   precio)                                        │
│         │                                                        │
│         ▼                                                        │
│  compras_stock_actual  (item_id → cantidad)                      │
│         · Se carga a mano en /admin/compras/stock                │
│         · Se marca en ROJO si cantidad < meta_semanal            │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 2: pedido al proveedor ─────────────────────────────────┐
│                                                                  │
│  compras_pedidos  estado: borrador → enviado → cerrado           │
│  compras_pedido_items  (descripcion, unidad, cantidad, orden)    │
│         │                                                        │
│         │  construirMensajePedido() arma el texto WhatsApp:      │
│         │    🧾 *PEDIDO {PROVEEDOR}* — {día} {dd/mm}             │
│         │    📍 *Entrega:* {dirección del local}                 │
│         │    *Detalle del pedido:*                               │
│         │       — 5 KG HARINA 000                                │
│         │    🏷 *Datos de facturación* + CUIT                    │
│         ▼                                                        │
│  linkWhatsApp(telefono, mensaje) → wa.me/... o api.whatsapp.com  │
│  Al abrirlo: estado='enviado', enviado_en=now(), mensaje guardado │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 3: remito de recepción ─────────────────────────────────┐
│                                                                  │
│  compras_remitos       (numero, fecha)  UNIQUE(pedido_id, numero)│
│  compras_remito_items  (descripcion, cantidad, precio)           │
│         │                                                        │
│         │  sugerirPedidoItem() sugiere a qué línea del pedido    │
│         │  corresponde cada línea tipeada del remito:            │
│         │    · normaliza (sin acentos, sin puntuación)           │
│         │    · palabras de 4+ letras                             │
│         │    · match por contención bidireccional (caja/cajas)   │
│         │    · gana el mayor score; 0 → "sin corresponder"       │
│         ▼                                                        │
│  Al guardar, si el ítem está ligado a un compras_items:          │
│    · compras_stock_actual.cantidad += cantidad recibida          │
│    · compras_stock_movimientos INSERT (tipo='entrada_remito')    │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 4: reportes ────────────────────────────────────────────┐
│                                                                  │
│  Gasto por proveedor    Σ cantidad × precio, agrupado            │
│  Historial de pedidos   pedidos + sus remitos + gasto            │
│  Movimiento de stock    entradas vs ajustes vs balance por insumo│
└──────────────────────────────────────────────────────────────────┘
```

> **Corrección de agosto 2026:** `compras_items` pasó a ser exclusivamente el
> catálogo de **insumos de depósito** (Bolsaplast y el resto de los proveedores
> importados — bolsas, papel, limpieza). La materia prima real de producción
> (proveedor Global: fécula, quesos, margarina, leche, sal, polvo de hornear)
> tiene su propio catálogo, `fabrica_materia_prima` — ver [§5.9](#59-módulo-fábrica).
> `compras_items` perdió `orden`/`base_calculo`/`coeficiente`/`incluir_en_conteo`
> (específicos del motor de cálculo genérico que reemplazó `calculoSugerido.ts`) y
> ganó `precio`. La pantalla `/admin/compras/pedidos` — la más vieja del módulo —
> también pasó de "+ Agregar ítem" fila por fila a un modal de creación que
> precarga todo el catálogo del proveedor elegido (insumos + materia prima) con
> checkbox de inclusión y cantidad por fila.

#### La lógica pura vive en `lib/compras/`

Este módulo es el mejor estructurado del proyecto: la lógica de negocio está separada
de la UI en cuatro archivos sin dependencias de React ni de Supabase, **testeables con
`npx tsx`**:

| Archivo | Responsabilidad |
|---|---|
| [matchRemito.ts](lib/compras/matchRemito.ts) | `sugerirPedidoItem()` — matching difuso remito ↔ pedido |
| [pedidoMensaje.ts](lib/compras/pedidoMensaje.ts) | `construirMensajePedido()`, `linkWhatsApp()`, datos de facturación por local |
| [rangoFechas.ts](lib/compras/rangoFechas.ts) | Presets `mes_actual`/`mes_anterior`; recibe `ahora` por parámetro para ser determinístico |
| [reportes.ts](lib/compras/reportes.ts) | `calcularGastoPorProveedor()`, `calcularHistorialPedidos()`, `calcularMovimientoPorInsumo()` |

**Decisión de diseño explícita en `reportes.ts`:** las líneas de remito **sin precio**
se cuentan en `lineasSinPrecio` pero **no** entran en `gastoTotal`, para que el total no
se lea como exacto cuando es parcial. Buen criterio, mantenerlo.

#### Trazabilidad de stock — `compras_stock_movimientos`

Dos tipos de movimiento:

- `entrada_remito` — al guardar un remito (`delta = +cantidad`, con `remito_id`).
- `ajuste_manual` — al corregir el stock a mano en `/admin/compras/stock`
  (`delta = nuevo - anterior`).

Borrar un remito hace `revertirYBorrar()`: inserta movimientos con `delta` negativo por
cada ítem y después borra el remito. **El movimiento de reversión queda con
`remito_id` apuntando a un remito que se está por borrar** (la FK es
`ON DELETE SET NULL`, así que queda en `null` y se pierde la referencia).

La tabla **arranca vacía** — no hubo reconstrucción retroactiva, porque
`compras_stock_actual` nunca guardó historial.

> ⚠️ `compras_stock_actual` + `compras_stock_movimientos` se actualizan con **dos
> llamadas separadas desde el navegador**, sin transacción y con un patrón
> *read-then-write*. Dos usuarios cargando remitos del mismo insumo a la vez pierden
> uno de los dos incrementos. Ver [§11](#11-plan-de-optimización-y-escalabilidad).

#### Tablas involucradas

`proveedores` · `compras_items` · `compras_stock_actual` · `compras_stock_movimientos` ·
`compras_pedidos` · `compras_pedido_items` · `compras_remitos` · `compras_remito_items`

---

### 5.6 Tareas / Squad

Gestor de tareas del equipo administrativo. Es el módulo con más features de UI y el
único con integración de IA.

#### Modelo

```
tareas
 ├─ titulo · descripcion · prioridad(alta|media|baja) · estado(pendiente|en_progreso|completada)
 ├─ fecha_limite · turno(manana|tarde)
 ├─ asignado_a UUID[]        ← array, no tabla puente
 ├─ creado_por
 ├─ colabora_tipo(area|persona) · colabora_area · colabora_persona_id
 ├─ recordatorio_enviado_at   ← dedup del cron
 │
 ├── tarea_subtareas    (texto, completada, orden, fecha, turno)
 ├── tarea_comentarios  (autor_id, texto)
 ├── tarea_historial    (campo, valor_anterior, valor_nuevo, autor_id)  ← audit log
 └── tarea_adjuntos     (nombre, storage_path, size_bytes) → bucket `tarea-adjuntos`

informes_diarios
 ├─ autor_id · destinatarios UUID[] · fecha
 ├─ tareas_completadas JSONB · actividades JSONB
 └─ horario_inicio · horario_fin · comentario
```

#### Las cuatro vistas

| Vista | Componente | Qué hace |
|---|---|---|
| **Board** | [TareasClient.tsx](app/tareas/TareasClient.tsx) (892 líneas) | Kanban con drag & drop (`@dnd-kit`) por estado |
| **Calendario** | [VistaCalendario.tsx](app/tareas/VistaCalendario.tsx) (562 líneas) | Tareas y subtareas ubicadas por `fecha` + `turno` |
| **Lista** | dentro de `TareasClient` | Historial completo, incluidas las completadas viejas |
| **Todas** | [TodasTareasClient.tsx](app/tareas/todas/TodasTareasClient.tsx) | Todo el sistema, vía service role — **1 solo usuario** |

**Retención:** `esCompletadaVieja()` en [app/tareas/helpers.ts](app/tareas/helpers.ts)
saca del Board y del Calendario las tareas completadas hace más de **7 días**; siguen
visibles en Lista.

#### Realtime

Tres canales suscriptos: `tareas`, `tarea_comentarios`, `tarea_subtareas`
(+ `informes_diarios` y `notificaciones` en sus propios componentes). El equipo ve los
cambios sin recargar.

#### Las tres funciones de IA (todas vía **Groq**)

**1 · Voz → tarea estructurada** — [POST /api/tareas/audio](app/api/tareas/audio/route.ts)

```
FormData(audio, perfiles)
  → Whisper large-v3-turbo (es) → transcripción
  → llama-3.3-70b-versatile con la lista de perfiles [id: uuid]
  → JSON { titulo, prioridad, fecha_limite, asignado_a[], descripcion }
  → si el JSON no parsea: fallback a { titulo: transcripcion[:80], prioridad:'media' }
```

El prompt le enseña heurísticas de negocio: `prioridad='alta'` si dice
"urgente/prioritario/inmediato", `'baja'` si dice "cuando puedas/sin apuro"; e
interpreta fechas relativas ("el viernes", "la semana que viene") contra la fecha de hoy.

**2 · Transcripción simple** — [POST /api/tareas/transcribir](app/api/tareas/transcribir/route.ts)

Solo Whisper, sin extracción. Para dictar texto libre en un campo (ej. el comentario de
un informe). Lo usa [GrabadorTexto.tsx](app/tareas/GrabadorTexto.tsx).

**3 · Agente conversacional** — [POST /api/tareas/agente](app/api/tareas/agente/route.ts)

Un agente con **tool calling** real, hasta `MAX_TURNOS = 4` iteraciones:

| Tool | Qué hace |
|---|---|
| `listar_tareas` | Filtra por estado/prioridad, limit 30 |
| `crear_tarea` | Inserta + notifica push a los asignados |
| `actualizar_estado_tarea` | Cambia estado + notifica a creador y asignados |
| `marcar_completada` | Atajo de la anterior |

**Detalle de seguridad bien resuelto:** las tools ejecutan con el cliente Supabase de la
**sesión del usuario**, no con service role. Así **RLS es la que limita** qué tareas
puede ver o modificar el agente — el LLM no puede escalar privilegios ni si alucina un
`tarea_id` ajeno (el `update` devuelve `null` y el agente informa "no tenés permiso").

#### El cron de recordatorios

[GET /api/cron/recordatorios-tareas](app/api/cron/recordatorios-tareas/route.ts),
disparado por Vercel a las **11:00 UTC (08:00 ART)** — [vercel.json](vercel.json).

```
Auth: header Authorization: Bearer ${CRON_SECRET}
Busca: tareas con fecha_limite = mañana
        ∧ estado ≠ 'completada'
        ∧ recordatorio_enviado_at IS NULL     ← dedup
Envía push "⏰ Vence mañana" a creador + asignados
Marca recordatorio_enviado_at = now()
```

#### Dos hardcodeos a revisar

En [app/tareas/helpers.ts](app/tareas/helpers.ts):

```ts
export const DESTINATARIO_DEFAULT_INFORME_ID = '2957d327-77af-4116-a991-adac12a43c92'
```

Ese UUID (Ricardo Cabrera, Gerencia) hace dos cosas:
1. Viene precargado como destinatario de todo informe diario.
2. Es el **único** que puede entrar a `/tareas/todas`, donde se usa service role para
   saltear RLS y ver todas las tareas del sistema.

Si esa persona cambia de cuenta o de rol, hay que editar código y redeployar. Debería
ser un permiso (`modulos_permitidos` o una columna en `roles`), no un UUID literal.

---

### 5.7 Notificaciones y PWA

Está documentado en detalle en [docs/notificaciones-push.md](docs/notificaciones-push.md)
(guía portable). Resumen:

#### Estrategia de dos capas

| Capa | Cómo | Cuándo falla |
|---|---|---|
| **Realtime en pestaña** (WebSocket Supabase) | Corre JS en la página, muestra sonido/banner | Se cae **en silencio** tras horas (suspensión, cambio de red, throttling) |
| **Web Push** (Service Worker + VAPID) | El servidor empuja; el SW la muestra con la pestaña cerrada | Requiere permiso explícito del usuario |

Se usan **las dos juntas**: realtime para lo instantáneo, push como red de seguridad.

#### Piezas

```
public/sw.js                          Service Worker: escucha 'push', muestra notificación
components/ui/SWRegister.tsx          Registra el SW (montado en el Root Layout)
components/ui/PushToggle.tsx          Pide permiso, se suscribe, guarda/borra la suscripción
components/ui/NotificationBell.tsx    Panel in-app (campana) + realtime de `notificaciones`
components/ui/InstallPrompt.tsx       Prompt de instalación PWA
app/manifest.ts                       Manifest dinámico + 2 shortcuts (Tareas / Grabar)
lib/push/sendPush.ts                  ★ Función central de envío
lib/push.ts                           urlBase64ToUint8Array para la VAPID pública
```

#### `enviarPush()` — [lib/push/sendPush.ts](lib/push/sendPush.ts)

```
1. Inserta N filas en `notificaciones` (una por destinatario) → panel in-app.
   Esto pasa SIEMPRE, tenga o no push activado el destinatario.
2. Si faltan las claves VAPID → termina acá (degrada, no falla).
3. Lee push_subscriptions de los destinatarios ← con SERVICE ROLE
   (RLS solo deja a cada uno leer la propia).
4. webpush.sendNotification() en Promise.allSettled → { sent, failed }
```

Se llama **in-process** (no por HTTP) para poder usarse tanto desde rutas con sesión
como desde el cron, que no tiene cookies.

#### Los tres endpoints

| Endpoint | Quién decide los destinatarios |
|---|---|
| [/api/notificaciones/pedidos](app/api/notificaciones/pedidos/route.ts) | **El servidor.** Acepta `{destino}` (→ todos los operadores de ese rol) o `{pedidoId}` (→ el local dueño, resuelto con service role). **No acepta `userIds` arbitrario.** |
| [/api/notificaciones/tareas](app/api/notificaciones/tareas/route.ts) | **El cliente.** Acepta `userIds[]` de cualquiera. ⚠️ Ver [§10.1](#101-seguridad) |
| [/api/push/subscribe](app/api/push/subscribe/route.ts) | POST hace `upsert onConflict:'endpoint'` con service role — reasigna el dispositivo al usuario logueado (dos personas compartiendo un celular). DELETE filtra por `endpoint` **y** `user_id`, así no afecta otras cuentas del mismo dispositivo. |

#### Configuración PWA

- [app/manifest.ts](app/manifest.ts): standalone, tema `#111111`, iconos 192/512/maskable.
- El **matcher de [proxy.ts](proxy.ts) excluye explícitamente `sw.js` y
  `manifest.webmanifest`**: el navegador los pide **sin sesión** para evaluar
  instalabilidad, y si se redirigen a `/login` recibe HTML en vez del manifest real y
  nunca ofrece instalar. Esa exclusión es intencional, no borrarla.

---

### 5.8 Parámetros y maestros

Tablas de configuración administradas desde `/admin/*`.

| Pantalla | Tabla | Patrón | Notas |
|---|---|---|---|
| Catálogo | `productos` | Server + Client, Supabase directo | Tipo (producto/insumo) × destino (fabrica/deposito) |
| Mapeo productos | `producto_mapeos` | Server + Client, Supabase directo | Traduce nombres Posberry |
| Usuarios | `profiles` + `auth.users` | **API + service role** | Crear/editar/rol/password/módulos/soft-delete |
| Roles | `roles` | API `/api/roles` | No se puede borrar un rol con usuarios asignados (409) ni `es_sistema` |
| Proveedores | `proveedores` | Supabase directo | ~180 seedeados; `maneja_stock` los habilita en Compras |
| Plan de cuentas | `plan_cuentas` | API `/api/plan-cuentas` | Rubro/categoría/variabilidad/flujo |
| Cajas | `cajas` | `TablaMaestra` genérico | CRUD nombre + activo |
| Formas de pago | `formas_pago` | `TablaMaestra` genérico | idem |

**`TablaMaestra`** ([components/ui/TablaMaestra.tsx](components/ui/TablaMaestra.tsx)) es
un componente reutilizable de CRUD simple: recibe `titulo`, `descripcion` y `apiPath`, y
habla contra un endpoint que expone GET/POST/PATCH/DELETE con la forma
`{id, nombre, activo}`. Buen patrón para replicar en otros maestros.

#### Ciclo de vida de un usuario

```
CREAR    POST /api/usuarios
         → auth.admin.createUser({ email_confirm: true })
         → insert profiles (squad arranca con modulos_permitidos = ['tareas'])
         → si falla el profile: rollback del auth user

EDITAR   PATCH /api/usuarios
         → 5 variantes discriminadas por Zod union: rol | password |
           whatsapp | nombre_posberry | modulos_permitidos
         → + un schema aparte para nombre/local/email/nueva_password
         → guarda: no podés cambiar tu propio rol

BORRAR   DELETE /api/usuarios   ← SOFT DELETE
         → auth.admin.updateUserById(id, { ban_duration: '876000h' })  (100 años)
         → profiles.estado = 'eliminado'
         → NO se borra nada: se conserva todo el historial que lo referencia
         → guarda: no podés eliminarte a vos mismo
```

> 💡 El comentario en el `PatchSchema` de [/api/usuarios](app/api/usuarios/route.ts)
> documenta un gotcha real de **Zod v4**: usar `z.undefined()` para "marcar como
> ausente" los campos de las otras variantes de un union **no funciona** — una key
> realmente ausente del body no satisface `z.undefined()`, así que se reporta inválida
> en todas las variantes y el union entero falla con "Invalid input". La solución fue
> que cada variante declare **solo** su campo discriminante y confíe en que `z.object`
> no es estricto por default.

---

### 5.9 Módulo Fábrica

Construido en 6 fases (agosto 2026), plan escrito en
`docs/superpowers/planifiquemos-el-modulo-de-fabrica.md`. Digitaliza dos procesos que
Fábrica llevaba en planillas de Google Sheets: el **conteo semanal de materia prima +
proyección de masa** (con recomendación de compra automática) y la **carga de
producción por turno**. Reusa por completo el módulo Compras existente
(`compras_stock_actual`, el flujo `compras_pedidos → WhatsApp → compras_remitos`) en vez
de duplicarlo.

> **Correcciones de agosto 2026** (dos pasadas seguidas, sobre el mismo hallazgo):
> el cliente adjuntó [docs/analisis-motor-calculo-legacy.md](docs/analisis-motor-calculo-legacy.md),
> extraído de la mini-app legacy, con los **5 "calculadores" reales** que corren sobre
> 3 grupos de ítems — no solo materia prima, como asumió la primera pasada:
>
> - **Bolsaplast** (depósito, 7 ítems): `faltante = max(0, meta_semanal − stock)`.
> - **Global** (materia prima, proveedor real de fécula/quesos/margarina/leche/sal/
>   polvo de hornear — separado de `compras_items`, que quedó como catálogo de
>   depósito puro, en su propio catálogo `fabrica_materia_prima`): la proyección real
>   es **número de masas** (batches de producción), no kg continuos, y no todos los
>   8 ítems redondean igual al calcular cuánto pedir.
> - **Huevos** (Huevo Campo): sin catálogo propio, 2 campos de planificación.
>
> La primera pasada separó materia prima de insumos pero asumió mal la unidad de
> proyección (kg continuos en vez de masas) y dejó Bolsaplast/Huevos afuera del
> conteo; la segunda alineó todo al documento real. De paso se arregló el bug de
> duplicate key en `fabrica_conteos` (dos borradores simultáneos violaban el índice
> único de conteo cerrado) y se **ocultaron de la navegación** las Fases 5 y 6 (stock
> terminado y reportes), todavía no pedidas — el código y las migraciones siguen ahí,
> accesibles solo por URL directa. El foco actual del módulo es Fases 1-3: conteo
> semanal → solicitud → pedido.

---

> **Corrección de ventana horaria y split de embolsado (07/08/2026):** tres pedidos de
> planta sobre este módulo. (1) El conteo semanal decía arrancar "hoy" y cortar el
> viernes — con el ancla real en **martes a la mañana**, la ventana pasa a ser fija:
> **martes tarde → viernes mañana**, sin importar qué día se abre la pantalla.
> (2) Producción gana selector **hoy/ayer** — es común dejar la masa hecha y editarla
> al día siguiente. (3) El embolsado **deja de ser hijo de una producción**: la
> presentación (1/2, 2, 5, 10 Kg) del congelado se decide después de juntar masa de
> varios lotes, momento en el que el lote de origen ya no es recuperable — imposible
> atribuir una presentación a una fila de `fabrica_producciones`, que es justo lo que
> exigía el esquema viejo (`fabrica_embolsados.produccion_id NOT NULL`). Pasa a ser un
> **pool del día** (`fecha` × `tamanio_id` × `sabor_id`, `fecha` = día de la MASA, no
> de la bolsa) en su propio módulo `/fabrica/embolsado`. De paso se corrigió que
> `calcularSemanaConteo()`/`fabrica_producciones.fecha` corrían sobre UTC del server
> (Vercel) — entre las 21:00 y las 00:00 ART el server ya creía que era el día
> siguiente — con `dia_fabrica()` (SQL) y `lib/fabrica/diaFabrica.ts` (cliente) sobre
> hora Argentina real.

#### El flujo completo

```
┌─── Fase 1: parámetros + materia prima ──────────────────────────┐
│                                                                  │
│  fabrica_sabores · fabrica_presentaciones · fabrica_tamanios     │
│  compras_categorias                                              │
│         │                                                        │
│         ▼                                                        │
│  fabrica_materia_prima (proveedor_id → Global, unidad_compra,    │
│                          kg_por_unidad, kg_por_masa, redondeo,    │
│                          precio)                                  │
│         · kg_por_masa = kg de esta materia prima por MASA        │
│           (batch de producción) — valor crudo del legacy, sin    │
│           convertir a kg continuos                                │
│         · redondeo ∈ (estandar | siempre_arriba | sin_calculo) — │
│           no todos los 8 ítems calculan igual cuánto pedir        │
│         · compras_items (Bolsaplast, depósito) recuperó           │
│           `incluir_en_conteo` — son los 7 ítems reales del         │
│           calculador Bolsaplast del legacy                        │
│         · /admin/compras/materia-prima — mismo patrón que        │
│           Insumos, con Archivar/Reactivar y Eliminar real         │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 2: conteo semanal + cierre ─────────────────────────────┐
│                                                                  │
│  Martes AM: fabrica_conteos (borrador) — 3 secciones:             │
│    · Bolsaplast: stock actual por ítem (compras_stock_actual,     │
│      el rol fabrica ahora también escribe esta tabla)             │
│    · Global: materia prima en UNIDADES DE COMPRA (no kg)          │
│    · Huevos: cajones disponibles (fabrica_conteos.                │
│      huevos_cajones_disponibles, sin catálogo propio)             │
│  + "Masas proyectadas esta semana" (fabrica_conteos.               │
│    masas_proyectadas) — batches de producción, compartida por     │
│    Global y Huevos.                                                │
│         │                                                        │
│         │  Vivo en el cliente (lib/fabrica/calculoSugerido.ts):   │
│         │    Bolsaplast:  faltante = max(0, meta − stock)         │
│         │    Global:      necesidadKg = kgPorMasa × masas         │
│         │                 kgFaltante = max(0, necesidadKg −       │
│         │                              cantidadUnid × kgPorUnid)  │
│         │                 sugerido = round | ceil | 0 según        │
│         │                            `redondeo` del ítem           │
│         │    Huevos:       cajonesNecesarios = ceil(masas×90/360) │
│         │                 cajonesFaltantes = max(0, necesarios −   │
│         │                                    disponibles)          │
│         ▼                                                        │
│  "Cerrar conteo" → RPC cerrar_conteo_fabrica() (transaccional):  │
│    · snapshotea kg_por_masa/kg_por_unidad/unidad_compra por        │
│      línea de materia prima (si Compras edita el coeficiente       │
│      después, el conteo cerrado no cambia de número)               │
│    · calcula necesidad/sugerido de las 3 fuentes, marca             │
│      estado='cerrado', crea UNA compras_solicitudes                │
│      (tipo='complementario') con líneas de las 3                   │
│         ▼                                                        │
│  POST /api/fabrica/solicitudes/notificar (service role) →        │
│  enviarPush() a los destinatarios de compras-solicitudes          │
│                                                                  │
│  Bug fix (ago. 2026): índice único parcial garantiza como mucho   │
│  UN borrador vivo en todo el sistema — dos borradores simultáneos │
│  (dos pestañas) eran la causa real del 23505 al cerrar. El        │
│  insert() ciego del borrador del día se cambió por insert-y-si-   │
│  -hay-conflicto-recuperar. RPC eliminar_conteo_fabrica() +        │
│  botón "Eliminar conteo" cubren "cargué mal, quiero borrarlo",    │
│  solo mientras el conteo sigue en borrador.                        │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 3: bandeja de Compras + pedido base ────────────────────┐
│                                                                  │
│  /admin/compras/solicitudes — Modal por solicitud (abiertas del  │
│  conteo o del pedido base), con las masas proyectadas destacadas  │
│  arriba si es complementaria; líneas editables (cantidad,          │
│  incluir, proveedor) → "Generar pedidos"                          │
│         │                                                        │
│         ▼  RPC convertir_solicitud_a_pedidos() (transaccional)   │
│  Un compras_pedidos en borrador por proveedor + sus               │
│  compras_pedido_items → sigue el flujo de WhatsApp ya existente  │
│                                                                  │
│  /admin/compras/pedido-base — CRUD de compras_plantilla_base,     │
│  el selector de catálogo agrupa materia prima e insumos en        │
│  optgroups separados → "Generar pedido base" → RPC                │
│  generar_solicitud_base() crea una solicitud tipo='base' que      │
│  pasa por la misma bandeja                                        │
│                                                                  │
│  compras_solicitud_items / compras_plantilla_base /               │
│  compras_pedido_items tienen `materia_prima_id` en paralelo a      │
│  `item_id` (mutuamente excluyentes; las líneas de Huevos no        │
│  tienen ninguno de los dos, solo descripción/unidad/cantidad) —    │
│  las tres RPC de arriba copian materia_prima_id junto con item_id  │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 4: producción por turno ─────────────────────────────────┐
│                                                                  │
│  /fabrica/produccion — selector Hoy/Ayer (diaFabrica.ts) + turno, │
│  un registro por turno: fécula → masa precargada (fecula_kg ×     │
│  config.fabrica_rendimiento_masa, editable —                     │
│  lib/fabrica/rendimiento.ts) · sabor · destino                    │
│         │                                                        │
│         ├─ destino='masa_locales' → nada más                     │
│         └─ destino='congelado_embolsado' → solo elige tamaño      │
│              (chico/medio, vive en fabrica_producciones). La      │
│              presentación NO se carga acá — se decide después,    │
│              por lote, en /fabrica/embolsado (Fase 7); un link     │
│              discreto aparece cuando la carga es congelado         │
│         ▼                                                        │
│  "Guardar" → RPC guardar_produccion_fabrica(8 args, sin           │
│  p_embolsados) — valida fabrica_puede_editar_fecha() (hoy/ayer,   │
│  admin sin límite) contra la fecha guardada, no solo la nueva      │
│         │                                                        │
│  "Repetir última carga" duplica el registro más reciente del      │
│  turno en el formulario (sin guardar) — en la planilla la misma   │
│  fila se repite 3-4 veces seguidas, es donde está la mayor parte   │
│  del tipeo manual                                                 │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 7: embolsado como pool del día ──────────────────────────┐
│                                                                  │
│  /fabrica/embolsado — módulo aparte (07/08/2026): la masa de       │
│  congelado del día ya no es hija de una producción, es un POOL     │
│  (fecha × tamanio_id × sabor_id — fecha = día de la MASA, no de    │
│  la bolsa). lib/fabrica/pools.ts: agruparPoolCongelado() suma       │
│  mañana+tarde en un solo pool por tamaño×sabor, con el desglose     │
│  por turno como referencia                                         │
│         │                                                        │
│         ▼  selector Hoy/Ayer, una card por pool: masa disponible   │
│  del día + N líneas presentación×kg editables (dedup por           │
│  presentación al guardar)                                          │
│         ▼                                                        │
│  "Guardar" → RPC guardar_embolsado_fabrica(p_fecha, p_tamanio_id,  │
│  p_sabor_id, p_lineas) reemplaza el pool entero de forma atómica:   │
│    · revierte por el NETO de fabrica_stock_terminado_mov del pool   │
│      (no por cantidad_kg de cada fila — una fila puede no haber     │
│      movido stock si el producto no existía al cargarla)            │
│    · pg_advisory_xact_lock sobre la clave del pool (ya no hay fila  │
│      ancla que lockear como antes lo era la producción)             │
│    · resuelve producto por la terna presentación×sabor×tamaño y     │
│      devuelve cuántas líneas no encontraron producto (no mueven     │
│      stock, mismo criterio que Fase 5)                              │
│                                                                  │
│  Delta producido-vs-embolsado se MUESTRA, no bloquea — mismo        │
│  criterio que el "difiere" de Fase 4: si se edita/borra una         │
│  producción de congelado después, el pool puede declarar más kg     │
│  que la masa del día y no hay constraint que lo impida              │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ⌄ Fases 5 y 6 — construidas, ocultas de la navegación (ago. 2026) ⌄
┌─── Fase 5: stock de producto terminado ──────────────────────────┐
│                                                                  │
│  productos + presentacion_id · sabor_id · tamanio_id (nullable)  │
│  unique(presentacion_id, sabor_id, tamanio_id) where presentacion│
│  _id is not null — un producto sin terna nunca toca este stock,  │
│  sigue siendo "masa a granel". Se asigna en /admin/catalogo.      │
│         │                                                        │
│         ▼  motor único: mover_stock_terminado() (no expuesto      │
│            directo — ver permisos) hace el upsert atómico          │
│            insert ... on conflict do update set cantidad_kg =      │
│            cantidad_kg + delta, para no reproducir la carrera      │
│            read-then-write de compras_stock_actual                 │
│         │                                                        │
│         ├─ guardar_embolsado_fabrica() (Fase 7): cada línea del    │
│         │  pool resuelve su producto por la terna y suma stock      │
│         │  ('produccion_embolsado'). Al reemplazar el pool,         │
│         │  revierte primero por el neto de sus movimientos          │
│         ├─ fabrica_marcar_pedido_enviado(): pedido interno          │
│         │  destino='fabrica' → 'enviado' resta cantidad×peso_kg     │
│         │  de cada línea con terna ('salida_pedido')                │
│         ├─ fabrica_confirmar_recepcion_pedido(): remito recibido    │
│         │  ajusta por la diferencia pedido vs. recibido, incluidos  │
│         │  ítems agregados en el momento ('ajuste_pedido')          │
│         └─ ajustar_stock_terminado_manual(): corrección a mano      │
│            desde /fabrica/stock-terminado ('ajuste_manual')         │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─── Fase 6: reportes ──────────────────────────────────────────────┐
│                                                                  │
│  /fabrica/reportes — solo lectura, sin migración (lee lo que las  │
│  fases 2-5 ya escriben). lib/fabrica/reportes.ts agrupa            │
│  fabrica_producciones/fabrica_embolsados por la dimensión elegida: │
│    · Producción: kg de masa por día/turno/operario/sabor           │
│    · Embolsado: kg por presentación                                │
│    · Rendimiento: masa/fécula real por operario — reusa            │
│      rendimientoFeculaMasa() (Fase 4), sobre el total acumulado     │
│      del operario, no el promedio de sus cargas individuales       │
│    · Cumplimiento: cruza cada fabrica_conteos cerrado con lo        │
│      realmente producido dentro de su ventana semana_desde–hasta   │
│      (no hay FK, el cruce es por rango de fecha + turno —           │
│      dentroDeVentana() cuenta el martes tarde y el viernes mañana,  │
│      no el martes mañana ni el viernes tarde)                       │
│         │                                                        │
│  /admin/compras/reportes ganó una pestaña "Sugerido vs. comprado": │
│  calcularSugeridoVsComprado() (lib/compras/reportes.ts) cruza       │
│  compras_solicitud_items.cantidad_sugerida contra lo que          │
│  realmente terminó en compras_pedido_items, por semana (vía         │
│  compras_solicitudes.conteo_id → fabrica_conteos) o "Pedido base"   │
│  — para calibrar compras_items.coeficiente con datos reales         │
└──────────────────────────────────────────────────────────────────┘
```

#### Permisos

`tiene_acceso_fabrica()` (rol `fabrica` + `admin`) gobierna `fabrica_conteos`,
`fabrica_conteo_items`, `fabrica_producciones` y `fabrica_embolsados`, y exige la RPC
`eliminar_conteo_fabrica()` (solo borra si `estado='borrador'`).
`tiene_acceso_compras()` gobierna también `fabrica_materia_prima` — mismo criterio no
granular que las tablas de Compras (ver §5.5) —, `compras_solicitudes`,
`compras_solicitud_items` y `compras_plantilla_base` — Compras revisa y ajusta,
pero nunca escribe un conteo ni una producción. Ambos helpers conviven en la
tabla `config`, que hasta este módulo solo leía `admin` (ver §6.1): se agregó una
policy de SELECT para `tiene_acceso_fabrica()` porque el formulario de producción
necesita leer `fabrica_rendimiento_masa`.

**Corrección de agosto 2026:** el conteo de Bolsaplast vive en `compras_items` /
`compras_stock_actual` / `compras_stock_movimientos` — tablas de Compras — pero ahora
las edita directo el rol `fabrica` desde `/fabrica/stock`. Las tres policies pasan a
`tiene_acceso_compras() or tiene_acceso_fabrica()`. De paso se corrigió `proveedores`:
tenía una policy `admin`-only desde su creación, nunca actualizada cuando
`tiene_acceso_compras()` se introdujo para el resto de Compras — cualquier squad con
módulos de compras (o ahora fábrica) se quedaba sin filas en los joins a proveedor.
Se agregó una policy de SELECT adicional con el mismo criterio; alta/edición/baja de
proveedores sigue siendo admin-only.

`fabrica_producciones` y `fabrica_embolsados` **no tienen policy de INSERT/UPDATE/DELETE
directa** — solo SELECT. Escritura de producción pasa por `guardar_produccion_fabrica()` /
`eliminar_produccion_fabrica()`; escritura de embolsado por `guardar_embolsado_fabrica()`
(Fase 7) — las tres `SECURITY DEFINER`. Desde el split, ya no son la misma transacción:
antes una carga era producción + N líneas de embolsado en un solo commit, ahora cada RPC
reemplaza su propio recurso (una producción, o un pool entero).

**Guard de fecha (07/08/2026):** `fabrica_puede_editar_fecha(p_fecha)` compone con
`tiene_acceso_fabrica()` en `guardar_produccion_fabrica()` y `eliminar_produccion_fabrica()` —
admin sin límite, rol `fabrica` solo hoy o ayer (`dia_fabrica() - 1` a `dia_fabrica()`). Al
editar valida la fecha **guardada** de la fila, no la que llega en el parámetro — si no,
el id de una producción vieja se podría "traer al presente" mandando `p_fecha = hoy` en el
update. `guardar_embolsado_fabrica()` no tiene este guard: el pool que edita ya está acotado
a las fechas que el cliente puede ver (hoy/ayer).

`fabrica_stock_terminado` y `fabrica_stock_terminado_mov` (Fase 5) tampoco tienen policy
de escritura: todo pasa por `mover_stock_terminado()`. Esa función **no se expone
directo** (`revoke execute ... from public, anon, authenticated`) porque la llaman
funciones con contextos de permiso distintos — fábrica al producir o marcar un pedido
enviado, el local al confirmar su propia recepción — y cada una ya valida lo que
corresponde a su contexto antes de llamarla. El único movimiento expuesto directo es
`ajuste_manual`, a través de `ajustar_stock_terminado_manual()` (exige
`tiene_acceso_fabrica()`).

`profiles` (Fase 6): el desglose de rendimiento por operario necesita leer el `nombre`
de operarios que no son el usuario en sesión — hasta esta fase, `profiles` solo se podía
leer a sí mismo (o siendo admin, o con el módulo `tareas`). Se agregó una policy de
SELECT más para `tiene_acceso_fabrica()`, mismo criterio que la de `config` en la Fase 4.

#### La lógica pura

| Archivo | Responsabilidad |
|---|---|
| [calculoSugerido.ts](lib/fabrica/calculoSugerido.ts) | `calcularNecesidadYSugerido()` (materia prima, redondeo variable por ítem) · `faltanteBolsaplast()` · `calcularHuevos()` — mismas 3 fórmulas que `cerrar_conteo_fabrica()`, duplicadas a propósito para la previsualización en vivo del cliente |
| [diaFabrica.ts](lib/fabrica/diaFabrica.ts) | `diaFabrica()` — "hoy" en hora Argentina real (`Intl` con `en-CA`, no `new Date()` crudo del server en UTC); `sumarDias()` / `diaAnterior()` |
| [semanaConteo.ts](lib/fabrica/semanaConteo.ts) | `calcularSemanaConteo()` — ventana fija martes tarde → viernes mañana, ancla en el martes de `diaFabrica()`, determinístico (recibe `ahora`) |
| [rendimiento.ts](lib/fabrica/rendimiento.ts) | `masaDesdeFecula()` precarga masa desde fécula; `rendimientoFeculaMasa()` para reportes de Fase 6 |
| [reportes.ts](lib/fabrica/reportes.ts) | `agruparProduccion()`, `agruparEmbolsadoPorPresentacion()`, `calcularRendimientoPorOperario()`, `calcularCumplimientoProyeccion()` (con `dentroDeVentana()`, turno-aware) — alimentan las 4 pestañas de `/fabrica/reportes` |
| [pools.ts](lib/fabrica/pools.ts) | `agruparPoolCongelado()` (Fase 7) — suma producción de congelado por tamaño×sabor del día (mañana+tarde) y le adjunta las líneas de embolsado ya cargadas |

#### Snapshot deliberado

Igual que `compras_solicitud_items` (Fase 2), `fabrica_conteo_items` guarda
`kg_por_masa`/`kg_por_unidad`/`unidad_compra` **al momento del cierre**, no una
referencia viva a `fabrica_materia_prima`. Es la misma decisión de diseño que evita que
editar un coeficiente hoy reescriba la historia de conteos ya cerrados. Bolsaplast y
Huevos no tienen un snapshot equivalente — su faltante se calcula y se escribe directo
en `compras_solicitud_items` al cerrar, sin pasar por una tabla intermedia propia.

#### Tablas involucradas

`fabrica_sabores` · `fabrica_presentaciones` · `fabrica_tamanios` · `compras_categorias` ·
`fabrica_materia_prima` · `fabrica_conteos` · `fabrica_conteo_items` · `compras_items` ·
`compras_stock_actual` · `compras_stock_movimientos` · `compras_solicitudes` ·
`compras_solicitud_items` · `compras_plantilla_base` · `fabrica_producciones` ·
`fabrica_embolsados`

---

## 6. Base de datos — inventario completo

**43 migraciones** en [supabase/migrations/](supabase/migrations/), nombradas
`YYYYMMDDHHMMSS_descripcion.sql`. La primera
(`20260601000000_initial_schema.sql`) está **fechada antes que el resto a propósito**:
es un bootstrap reconstruido desde el estado real de producción, porque se aplicó antes
de que existiera tracking de migraciones.

[supabase/migrations_archive_pre_sync/](supabase/migrations_archive_pre_sync/) tiene el
historial numerado viejo (`001_`…`016_`) — **solo referencia, no se aplica.**

### 6.1 Núcleo — usuarios y catálogo

#### `profiles` — extiende `auth.users`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | FK → `auth.users(id)` **ON DELETE CASCADE** |
| `nombre` | text NOT NULL | |
| `rol` | text NOT NULL | FK → `roles(key)` (antes era un CHECK) |
| `local_nombre` | text | Nombre de la sucursal |
| `nombre_posberry` | text | Match exacto con el "cliente" del Sheet |
| `whatsapp_phone` / `whatsapp_apikey` | text | Integración WhatsApp (no se usa hoy) |
| `modulos_permitidos` | text[] NOT NULL DEFAULT '{}' | Keys de `MODULOS` |
| `estado` | text NOT NULL DEFAULT 'activo' | `activo` \| `eliminado` — soft delete |
| `created_at` | timestamptz | |

Índices: `idx_profiles_estado`

#### `roles`

`key` (PK) · `nombre` · `color` (hex, para badges) · `es_sistema` (bool) · `created_at`

Seed: `local` #a78bfa · `deposito` #38bdf8 · `fabrica` #f0a849 · `admin` #e8c547 ·
`squad` #e84210 (el único con `es_sistema=false`).

#### `productos` — catálogo interno

`id` · `nombre` · `descripcion` · `unidad` (default 'unidad') ·
`tipo` (`producto`\|`insumo`) · `destino` (`fabrica`\|`deposito`) · `activo` ·
`categoria` · `precio` numeric(10,2) · `codigo` integer · `created_at`

Índice: `productos_codigo_destino_unique` UNIQUE `(codigo, destino) WHERE codigo IS NOT NULL`
→ el código se repite entre destinos, es único dentro de cada uno.

#### `config`

`key` (PK) · `value` · `updated_at`. Hoy solo `apps_script_url` (legacy).

### 6.2 Pedidos internos

#### `pedidos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `numero` | **serial UNIQUE** | Correlativo legible para el usuario |
| `local_id` | uuid | FK → `profiles(id)` **ON DELETE SET NULL** (conserva historial) |
| `local_nombre` | text NOT NULL | Desnormalizado: sobrevive al borrado del perfil |
| `destino` | text | `fabrica` \| `deposito` |
| `estado` | text DEFAULT 'pendiente' | `pendiente`\|`preparando`\|`enviado`\|`recibido` |
| `notas` | text | |
| `grupo_id` | uuid | Liga los 2 pedidos de un carrito mixto. **Sin FK ni índice** |
| `created_at` / `preparando_at` / `enviado_at` / `recibido_at` | timestamptz | Timeline |

**Realtime habilitado.**

#### `pedido_items`

`id` · `pedido_id` (FK **ON DELETE CASCADE**) · `producto_id` (FK) ·
`producto_nombre` NOT NULL (desnormalizado) · `cantidad` integer `CHECK (> 0)` ·
`cantidad_recibida` integer · `valor_total` numeric(10,2) · `created_at`

`cantidad_recibida` y `valor_total` se cargan **en la recepción** y son la entrada de la
conciliación. `NULL` = todavía no se recibió.

#### `pedido_mensajes`

`id` · `pedido_id` (FK CASCADE) · `autor_rol` · `autor_nombre` · `texto` · `created_at`

⚠️ RLS: `FOR ALL TO authenticated USING(true) WITH CHECK(true)` — **cualquier usuario
autenticado lee y escribe los mensajes de cualquier pedido.**

### 6.3 Ventas y conciliación

#### `ventas_posberry`

`id` · `local_id` (FK SET NULL) · `local_nombre` · `fecha` date NOT NULL ·
`producto_nombre` NOT NULL · `cantidad` integer NOT NULL · `importe` numeric(10,2) ·
`archivo_origen` · `id_externo` · `created_at`

Índice: `ventas_posberry_id_externo_idx` UNIQUE `(id_externo) WHERE NOT NULL`

> ⚠️ Ese índice es **UNIQUE sobre `id_externo` solo**, pero el código deduplica por
> `(id_externo + producto_nombre)` porque una orden trae varios productos. La sincronización
> funciona porque **borra el rango antes de insertar** (paso 7 del flujo), no porque el
> índice lo garantice. Un `INSERT` fuera de ese camino chocaría con el índice.
> El índice debería ser `(id_externo, producto_nombre)`.

#### `conciliaciones`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `fecha` | date NOT NULL | |
| `local_id` | uuid | FK → `profiles` SET NULL |
| `producto_nombre` | text NOT NULL | Ya normalizado vía `producto_mapeos` |
| `vendido` | integer DEFAULT 0 | Unidades vendidas (Posberry) |
| `pedido` | integer DEFAULT 0 | Unidades recibidas (remito) — el nombre engaña |
| `monto_vendido` | numeric(12,2) | |
| `monto_remito` | numeric(12,2) | |
| `diferencia` | **GENERATED** `(vendido - pedido)` STORED | |
| `tiene_alerta` | **GENERATED** `(vendido > pedido)` STORED | |
| `confirmado` / `confirmado_at` / `confirmado_por` | bool / tz / text | Visto bueno del admin |

**No hay UNIQUE en `(fecha, local_id, producto_nombre)`** — la unicidad depende de que
`recalcular_conciliacion()` haga `DELETE` antes del `INSERT`. Dos ejecuciones
concurrentes para el mismo par duplican filas.

#### `producto_mapeos`

`id` · `nombre_posberry` **UNIQUE** NOT NULL · `producto_id` (FK SET NULL) ·
`ignorado` bool NOT NULL DEFAULT false · `created_at`

⚠️ RLS `authenticated_all` — cualquier autenticado lee y escribe.

### 6.4 Gastos

#### `gastos`

`id` · `fecha` date DEFAULT current_date · `local` text NOT NULL (**string libre**, no FK) ·
`rubro` NOT NULL · `categoria` NOT NULL (**strings libres**, no FK a `plan_cuentas`) ·
`proveedor_id` (FK SET NULL) · `monto` numeric(12,2) NOT NULL · `forma_pago` NOT NULL ·
`caja` text · `estado` (`Pendiente de pago`\|`Pagado`\|`Parcial`) · `observaciones` ·
`comprobante_url` · `fecha_pago` date · `pagado_por` (FK SET NULL) ·
`created_by` (FK SET NULL) · `created_at`

**Sin índices.** Se consulta por `fecha` y `local` en `/api/resumen` y en Pendientes.

#### `plan_cuentas`

`id` · `rubro` NOT NULL · `categoria` · `activo` · `orden` integer ·
`variabilidad` (`VARIABLE`\|`FIJO`) · `flujo` (`INGRESO`\|`EGRESO`) · `created_at`

RLS: `read_all` para todo autenticado (SELECT), `admin_all` para escritura.

#### `proveedores`

`id` · `nombre` NOT NULL · `categoria` · `contacto_nombre` · `contacto_telefono` ·
`contacto_email` · `direccion` · `tiempo_entrega` · `periodicidad_compra` ·
`financiacion` · `condiciones_pago` · `notas` · `estado` (`activo`\|`archivado`) ·
`maneja_stock` bool NOT NULL DEFAULT false · `local` text · `created_at`

~180 filas seedeadas desde la planilla original.

RLS: escritura admin-only (`admin maneja proveedores`) + una policy de SELECT agregada
en agosto 2026 para `tiene_acceso_compras() or tiene_acceso_fabrica()` — hasta entonces
la tabla era admin-only también para lectura, y cualquier squad/fábrica se quedaba sin
filas en los joins a proveedor (ver [§5.9](#59-módulo-fábrica)).

#### `formas_pago` / `cajas`

Ambas: `id` · `nombre` UNIQUE NOT NULL · `activo` · `created_at`

Seed `formas_pago`: Transferencia · Efectivo · Cheque · E-Cheq · Debito automatico ·
Tarjeta de credito · Mixto

#### `locales_config`

`id` · `sucursal` **UNIQUE** NOT NULL · `activo` · `created_at` · `updated_at`

✅ Ya no guarda credenciales — `fudo_api_key`/`fudo_api_secret` se dropearon en
[20260804140000_fudo_credenciales_a_env.sql](supabase/migrations/20260804140000_fudo_credenciales_a_env.sql).
Las credenciales viven en variables de entorno (ver §5.4 y §9).

### 6.5 Compras (5 tablas + 3, + `fabrica_materia_prima` de Fábrica)

| Tabla | Columnas clave | Índices |
|---|---|---|
| `compras_items` | `proveedor_id` FK (⚠️ 1:N legacy, en desuso — ver `compras_item_proveedores`) · `categoria_id` FK · `nombre` · `unidad` · `meta_semanal` numeric · `precio` numeric · `estado` (activo\|archivado) | `idx_compras_items_proveedor_id` |
| `compras_item_proveedores` | `item_id` FK CASCADE · `proveedor_id` FK CASCADE · `es_principal` bool (único por item) · `precio_ref`/`codigo_proveedor` · `activo` · **UNIQUE `(item_id, proveedor_id)`** — M:N insumo↔proveedor | `idx_cip_item_id`, `idx_cip_proveedor_id`, `idx_cip_principal_unico` |
| `fabrica_materia_prima` | `proveedor_id` FK (Global) · `nombre` · `unidad_compra` · `kg_por_unidad` numeric > 0 · `coeficiente` numeric (kg/kg masa) · `precio` numeric · `estado` (activo\|archivado) | — |
| `compras_stock_actual` | `item_id` **PK** FK CASCADE · `cantidad` numeric · `actualizado_en` · `actualizado_por` | PK |
| `compras_stock_movimientos` | `item_id` FK CASCADE · `delta` numeric NOT NULL · `tipo` (`entrada_remito`\|`ajuste_manual`) · `remito_id` FK SET NULL · `creado_por` · `created_at` | `idx_..._item_id` |
| `compras_pedidos` | `proveedor_id` FK · `estado` (borrador\|enviado\|cerrado) · `mensaje` · `creado_por` · `created_at`/`enviado_en`/`cerrado_en` | `idx_..._proveedor_id`, `idx_..._estado` |
| `compras_pedido_items` | `pedido_id` FK CASCADE · `item_id` FK · `materia_prima_id` FK · `descripcion` NOT NULL · `unidad` · `cantidad` numeric · `orden` | `idx_..._pedido_id` |
| `compras_remitos` | `pedido_id` FK CASCADE · `numero` NOT NULL · `fecha` date NOT NULL · `creado_por` | `idx_..._pedido_id`, **UNIQUE `(pedido_id, numero)`** |
| `compras_remito_items` | `remito_id` FK CASCADE · `pedido_item_id` FK SET NULL · `item_id` FK · `descripcion` · `cantidad` numeric · `precio` numeric | `idx_..._remito_id`, `idx_..._pedido_item_id` |

RLS uniforme vía `tiene_acceso_compras()` (rol `admin` o algún módulo `compras-*`
en `modulos_permitidos` — ver [§5.5](#55-compras-a-proveedores) y
[20260804150000_compras_rls_modulos.sql](supabase/migrations/20260804150000_compras_rls_modulos.sql)),
no el rol hardcodeado `admin`/`squad` original. `fabrica_materia_prima` vive en el
esquema de Fábrica pero comparte el mismo helper, sin granularidad por tabla.

> ⚠️ Esa policy **hardcodea `'squad'`**. Un rol personalizado con el módulo
> `compras-*` asignado pasa el proxy y ve la pantalla, pero **RLS le devuelve cero
> filas**. Debería ser un check contra `modulos_permitidos`.

### 6.6 Tareas (6 tablas)

| Tabla | Columnas clave | Índices |
|---|---|---|
| `tareas` | `titulo` · `descripcion` · `prioridad` · `estado` · `fecha_limite` · `turno` · `asignado_a` **UUID[]** · `creado_por` FK SET NULL · `colabora_tipo`/`colabora_area`/`colabora_persona_id` · `recordatorio_enviado_at` · `created_at`/`updated_at` | `creado_por`, `estado`, `fecha_limite`, `turno`, **GIN(`asignado_a`)** |
| `tarea_subtareas` | `tarea_id` FK CASCADE · `texto` · `completada` · `orden` · `fecha` date · `turno` | `tarea_id`, `fecha`, `turno` |
| `tarea_comentarios` | `tarea_id` FK CASCADE · `autor_id` FK SET NULL · `texto` | `tarea_id` |
| `tarea_historial` | `tarea_id` FK CASCADE · `campo` · `valor_anterior` · `valor_nuevo` · `autor_id` | `tarea_id` |
| `tarea_adjuntos` | `tarea_id` FK CASCADE · `nombre` · `storage_path` · `size_bytes` · `autor_id` | `tarea_id` |
| `informes_diarios` | `autor_id` FK SET NULL · `destinatarios` **UUID[]** · `fecha` · `tareas_completadas` JSONB · `actividades` JSONB · `horario_inicio`/`horario_fin` · `comentario` | `fecha`, `autor_id`, **GIN(`destinatarios`)** |

**Realtime:** `tareas`, `tarea_comentarios`, `tarea_subtareas`, `informes_diarios`.

> `asignado_a UUID[]` en vez de una tabla puente `tarea_asignados` es la decisión de
> modelado más discutible. Funciona con el índice GIN y simplifica el cliente, pero:
> no hay FK (un asignado borrado queda como UUID huérfano), no se puede agregar
> metadata por asignación (fecha, estado individual), y las policies de las 4 tablas
> hijas repiten `auth.uid() = ANY(tareas.asignado_a)` en un subquery por fila.

### 6.7 Notificaciones

#### `push_subscriptions`

`id` · `user_id` FK CASCADE · `endpoint` **UNIQUE** NOT NULL · `p256dh` NOT NULL ·
`auth` NOT NULL · `created_at`. Índice: `user_id`.

`endpoint` identifica **dispositivo+navegador**, no usuario — de ahí el `upsert
onConflict:'endpoint'`.

#### `notificaciones`

`id` · `user_id` FK CASCADE · `titulo` NOT NULL · `cuerpo` · `url` · `tipo` ·
`leida` bool NOT NULL DEFAULT false · `created_at`

Índice compuesto bien pensado: `idx_notificaciones_user_id (user_id, created_at DESC)`.
**Realtime habilitado.** Se inserta solo con service role (no hay policy de INSERT).

### 6.8 Modelo espejo Fudo — **13 tablas sin uso**

`fudo_categorias_producto` · `fudo_categorias_ingrediente` · `fudo_categorias_gasto` ·
`fudo_metodos_pago` · `fudo_proveedores` · `fudo_clientes` · `fudo_productos` ·
`fudo_ingredientes` · `fudo_gastos` · `fudo_ventas` · `fudo_venta_items` ·
`fudo_pagos` · `fudo_sync_log`

Todas con el patrón `fudo_id text PK` + columnas tipadas + `raw jsonb` + `synced_at`,
FKs entre sí, y RLS `admin_select`. **Nunca se escriben ni se leen.**

Más `fudo_pagos` **v2** (`20260622200306`) — el libro de pagos propio, en colisión de
nombre con la del espejo. Ver [§5.4](#54-integración-fudo).

### 6.9 Resumen: 39 tablas

```
Núcleo (4)        profiles · roles · productos · config
Pedidos (3)       pedidos · pedido_items · pedido_mensajes
Ventas (3)        ventas_posberry · conciliaciones · producto_mapeos
Gastos (6)        gastos · plan_cuentas · proveedores · formas_pago · cajas · locales_config
Compras (7)       compras_items · compras_stock_actual · compras_stock_movimientos ·
                  compras_pedidos · compras_pedido_items · compras_remitos · compras_remito_items
Tareas (6)        tareas · tarea_subtareas · tarea_comentarios · tarea_historial ·
                  tarea_adjuntos · informes_diarios
Notificaciones(2) push_subscriptions · notificaciones
Fudo (13)         ← ninguna en uso
────────────────────────────────────────────────────
                  26 en uso  +  13 muertas
```

---

## 7. Funciones, RLS, Realtime y Storage

### 7.1 Funciones Postgres

| Función | Firma | Uso |
|---|---|---|
| `get_user_rol()` | `→ text`, `SQL SECURITY DEFINER STABLE` | Helper de RLS: `SELECT rol FROM profiles WHERE id = auth.uid()` |
| `recalcular_conciliacion(p_fecha, p_local_id)` | `→ void`, `plpgsql SECURITY DEFINER` | Reconstruye `conciliaciones` para un (local, día). Ver [§5.2](#52-ventas-posberry--conciliación) |
| `dia_fabrica()` | `→ date`, `SQL STABLE` | `(now() at time zone 'America/Argentina/Buenos_Aires')::date` — reemplaza a `current_date` en Fábrica, el server corre en UTC. Ver [§5.9](#59-módulo-fábrica) |
| `fabrica_puede_editar_fecha(p_fecha)` | `→ boolean`, `SQL SECURITY DEFINER STABLE` | Guard de ventana hoy/ayer para producción y embolsado (admin sin restricción). Compone con `tiene_acceso_fabrica()` |
| `guardar_embolsado_fabrica(p_fecha, p_tamanio_id, p_sabor_id, p_lineas)` | `→ integer`, `plpgsql SECURITY DEFINER` | Reemplazo atómico de un pool de embolsado; devuelve cuántas líneas no movieron stock por falta de producto en catálogo |

Esta tabla no es un inventario exhaustivo — Compras y Fábrica agregaron bastantes
helpers/RPC más (`tiene_acceso_compras()`, `tiene_acceso_fabrica()`, `es_admin()`,
`cerrar_conteo_fabrica()`, `guardar_produccion_fabrica()`, `mover_stock_terminado()`,
etc.) que no siempre se reflejaron acá. No hay triggers; toda la lógica derivada
de UI vive en TypeScript.

**Única vista del proyecto**: `v_compras_items` (`20260825140000_compras_items_proveedores_mn.sql`)
— `compras_items` + su proveedor principal (`compras_item_proveedores.es_principal`),
como `proveedor_principal_id`/`proveedor_principal_nombre`. Se introdujo al pasar
insumo↔proveedor de 1:N a M:N (ver [§6.5](#65-compras-5-tablas--3--fabrica_materia_prima-de-fábrica))
para no reescribir cada consumidor que solo necesita "el proveedor de este insumo".

### 7.2 Row Level Security

RLS está habilitado en **todas** las tablas. Tres patrones convivien:

| Patrón | Ejemplo | Tablas | Evaluación |
|---|---|---|---|
| **A · Helper STABLE** | `get_user_rol() = 'admin'` | `profiles`, `productos`, `pedidos`, `pedido_items`, `ventas_posberry`, `conciliaciones`, `config` | ✅ La mejor — `STABLE` permite cachear |
| **B · Subquery inline** | `(SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin'` | `proveedores`, `gastos`, `plan_cuentas`, `roles`, todas las `compras_*` | ⚠️ Subquery **por fila** |
| **C · EXISTS** | `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')` | `locales_config`, `formas_pago`, `cajas`, todas las `fudo_*` | ⚠️ idem |
| **D · Ownership** | `auth.uid() = creado_por OR auth.uid() = ANY(asignado_a)` | `tareas` + 4 hijas, `informes_diarios`, `notificaciones`, `push_subscriptions` | Correcto, pero las hijas hacen `EXISTS` sobre `tareas` por fila |
| **E · Abierto** 🔴 | `FOR ALL TO authenticated USING(true) WITH CHECK(true)` | `pedido_mensajes`, `producto_mapeos` | **Sin restricción real** |

#### Policies por tabla (las relevantes)

```
profiles      SELECT  id = auth.uid() OR get_user_rol() = 'admin'
              SELECT  estado='activo' AND (rol='admin' OR 'tareas' = ANY(modulos_permitidos))
                      ← ésta permite a cualquiera ver a los del módulo Tareas (para asignar)
              INSERT/UPDATE  get_user_rol() = 'admin'

productos     SELECT  auth.uid() IS NOT NULL   (todos los autenticados)
              ALL     admin, o fabrica sobre destino='fabrica', o deposito sobre 'deposito'

pedidos       SELECT  local_id = auth.uid() OR get_user_rol() ∈ (admin,fabrica,deposito)
              INSERT  local_id = auth.uid() AND get_user_rol() = 'local'
              UPDATE  get_user_rol() ∈ (admin,fabrica,deposito) OR (dueño ∧ rol='local')

pedido_items  SELECT  auth.uid() IS NOT NULL    ← TODOS ven TODOS los ítems
              INSERT  EXISTS(pedido del usuario)
              UPDATE  EXISTS(pedido del usuario)

compras_*     ALL     rol ∈ ('admin','squad')   ← hardcodea 'squad'

tareas        SELECT/UPDATE  creado_por = auth.uid() OR auth.uid() = ANY(asignado_a)
              INSERT  creado_por = auth.uid()
              DELETE  creado_por = auth.uid()

notificaciones  SELECT/UPDATE  user_id = auth.uid()   (INSERT solo service role)
```

### 7.3 Realtime

`ALTER PUBLICATION supabase_realtime ADD TABLE`:

```
pedidos              → PedidosOperadorClient, LocalPedidosClient
tareas               → TareasClient, VistaCalendario
tarea_comentarios    → TareasClient, ModalTarea
tarea_subtareas      → ModalTarea, VistaCalendario
informes_diarios     → VistaCalendario
notificaciones       → NotificationBell
```

### 7.4 Storage

| Bucket | Público | Límite | MIME | Uso |
|---|---|---|---|---|
| `comprobantes` | ✗ | 10 MB | jpeg, png, webp, pdf | Comprobantes de pago de gastos |
| `tarea-adjuntos` | ✗ | 20 MB | (libre) | Adjuntos de tareas |

`tarea-adjuntos` tiene una policy elegante: usa
`(storage.foldername(name))[1]` como `tarea_id` y valida participación en esa tarea,
o sea que **la ruta del archivo es la autorización**. Convención obligatoria:
`{tarea_id}/{nombre}`.

---

## 8. API interna

25 route handlers. **Ninguno tiene rate limiting.** La validación de input con Zod
existe solo en `/api/usuarios`.

| Ruta | Métodos | Auth | Service role | Notas |
|---|---|---|---|---|
| `/api/usuarios` | POST PATCH DELETE | admin | ✔ | Zod. Soft delete + ban 100 años |
| `/api/roles` | GET POST PATCH DELETE | admin | ✗ | `slugify` de key; no borra `es_sistema` ni roles con usuarios (409) |
| `/api/locales` | GET | admin | ✗ | Solo lectura: `{ sucursal, activo }` para el selector de `/admin/fudo` |
| `/api/cajas` | GET POST PATCH DELETE | admin | ✗ | `requireAdmin()` |
| `/api/formas-pago` | GET POST PATCH DELETE | admin | ✗ | `requireAdmin()` |
| `/api/plan-cuentas` | GET POST PATCH DELETE | ⚠️ **ninguna** | ✗ | Solo RLS. Ver [§10.1](#101-seguridad) |
| `/api/resumen` | GET | ⚠️ **ninguna** | ✗ | Solo RLS |
| `/api/sync-sheets` | POST GET | admin | ✔ | Sincroniza el Sheet + recalcula conciliación |
| `/api/posberry-raw` | GET | admin | ✗ | Lee el Sheet en vivo, sin persistir |
| `/api/fudo` | GET | admin | ✗ | Explorador de expenses/sales/payments |
| `/api/fudo/pendientes` | GET | admin | ✗ | UNPAID de todas las sucursales |
| `/api/integraciones/ventas` | GET | admin | ✗ | Cruce Posberry ↔ Fudo |
| `/api/integraciones/cajas` | GET | admin | ✗ | Ventas por caja |
| `/api/notificaciones/pedidos` | POST | sesión | ✔ | Destinatarios resueltos **server-side** ✅ |
| `/api/notificaciones/tareas` | POST | sesión | ✔ (indirecto) | ⚠️ Acepta `userIds[]` del cliente |
| `/api/push/subscribe` | POST DELETE | sesión | ✔ | Upsert por endpoint |
| `/api/tareas/audio` | POST | sesión | ✗ | Whisper + Llama → JSON de tarea |
| `/api/tareas/transcribir` | POST | sesión | ✗ | Solo Whisper |
| `/api/tareas/agente` | POST | sesión | ✗ | Tool calling, 4 tools, RLS como frontera ✅ |
| `/api/cron/recordatorios-tareas` | GET | `Bearer CRON_SECRET` | ✔ | Vercel Cron 11:00 UTC |

### El patrón `requireAdmin()`

Copiado literalmente en 3 archivos (`/api/roles`, `/api/cajas`,
`/api/formas-pago`) y escrito inline en otros 7 (incluido `/api/locales`):

```ts
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { supabase, error: null }
}
```

**Cada request hace 2 round-trips a Supabase antes de tocar el negocio**
(`getUser()` + `select profiles`). Candidato #1 a extraer a `lib/auth/requireRol.ts`.

---

## 9. Integraciones externas y variables de entorno

### Servicios

| Servicio | Endpoint | Auth | Usado por |
|---|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` | anon key (RLS) / service role | Todo |
| **Google Sheets v4** | `sheets.googleapis.com/v4` | `GOOGLE_SHEETS_API_KEY` | `/api/sync-sheets`, `/api/posberry-raw` |
| **Fudo** | `auth.fu.do/api` + `api.fu.do/v1alpha1` | key+secret por sucursal, `FUDO_API_KEY_<SLUG>`/`FUDO_API_SECRET_<SLUG>` | 4 endpoints |
| **Groq** | `api.groq.com/openai/v1` | `GROQ_API_KEY` | Whisper `large-v3-turbo` + `llama-3.3-70b-versatile` |
| **Web Push** | servicios del navegador | VAPID | `lib/push/sendPush.ts` |
| **4peeq Tickets** | `tickets.4peeq.com/api/tickets` | — | `@4peeqtech/ticket-widget` en Sidebar y Ayuda |

### Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL          Público
NEXT_PUBLIC_SUPABASE_ANON_KEY     Público
SUPABASE_SERVICE_ROLE_KEY         🔴 SECRETO — saltea RLS por completo
GOOGLE_SHEETS_API_KEY             Secreto
GROQ_API_KEY                      Secreto
NEXT_PUBLIC_VAPID_PUBLIC_KEY      Público (por diseño)
VAPID_PRIVATE_KEY                 Secreto
CRON_SECRET                       Secreto — protege el endpoint de cron
FUDO_API_KEY_<SLUG>               Secreto — una por sucursal, ver §5.4
FUDO_API_SECRET_<SLUG>            Secreto — idem
```

`.env.local` está en `.gitignore`. ✅

**Proyectos de Supabase** (ref hardcodeado en [lib/entorno.ts](lib/entorno.ts), única
fuente de verdad — ver postmortem del incidente 2026-09-01 en S7 más abajo):

| Ref | Entorno |
|---|---|
| `ahlpthzsjipdpcnjbfdk` | **Producción** — Vercel Production únicamente |
| `fafckqysyvtlslfnpzrh` | Dev/test ("YA! mayorista") — Vercel Preview (`qa`) y desarrollo local |

`lib/entorno.ts` expone `verificarEntorno(...)`, que cruza `NEXT_PUBLIC_SUPABASE_URL`
contra la anon key y la service role key (son JWT con claim `ref`) y, si
`VERCEL_ENV === 'production'`, exige que el ref sea el de prod. Se llama en tres
capas independientes:

- **Build** ([next.config.ts](next.config.ts)): `throw` si no verifica — aborta el build.
- **Middleware** ([proxy.ts](proxy.ts)): `503` fail-closed si no verifica — cubre
  promote/rollback a un deployment viejo, que el guard de build no puede ver.
- **Runtime del servidor** ([lib/supabase/server.ts](lib/supabase/server.ts)):
  `verificarEntornoServidor()` cruza los `NEXT_PUBLIC_*` (inlineados en build)
  contra `SUPABASE_SERVICE_ROLE_KEY` (leída en runtime) — detecta env vars
  cambiadas sin redeploy.

Además hay un badge visible ("DATOS DE DEV") en el Header y en `/login` cuando el
bundle no apunta a prod, y `GET /api/entorno` para verificar un deploy sin grepear
el JS.

**Runbook — cómo saber a qué base apunta un deploy:**

1. `curl https://app.yachipacitos.com.ar/api/entorno` → `refCliente` tiene que ser
   `ahlpthzsjipdpcnjbfdk`.
2. O mirar el badge: si dice "DATOS DE DEV" en el Header o en `/login`, no es prod.
3. O buscar `✅ Supabase: proyecto …` (o `❌ Supabase: …`) en el log de build de
   Vercel — lo imprime `next.config.ts` en cada build.

---

## 10. Diagnóstico: deuda técnica y bugs detectados

### 10.1 Seguridad

| # | Severidad | Hallazgo | Dónde |
|---|---|---|---|
| S1 | ✅ Resuelto 2026-08-04 | ~~Credenciales Fudo de las 5 sucursales en texto plano en el repo.~~ Rotadas en Fudo y movidas a variables de entorno (`FUDO_API_KEY_<SLUG>` / `FUDO_API_SECRET_<SLUG>`); la migración vieja sigue commiteada pero con valores ya inválidos, y [20260804140000_fudo_credenciales_a_env.sql](supabase/migrations/20260804140000_fudo_credenciales_a_env.sql) dropeó las columnas de la tabla real. | [lib/fudo.ts](lib/fudo.ts) |
| S2 | ✅ Resuelto 2026-08-04 | ~~`GET /api/locales` devuelve `fudo_api_secret` al navegador.~~ Ya no selecciona esas columnas (no existen más); expone `credencialesConfiguradas: boolean` calculado server-side. | [/api/locales](app/api/locales/route.ts) |
| S3 | 🟠 Media | **`/api/plan-cuentas` y `/api/resumen` no validan sesión ni rol.** Dependen 100% de RLS. Funciona (RLS filtra), pero un cambio de policy los abre en silencio. Agregar `requireAdmin()`. | [/api/plan-cuentas](app/api/plan-cuentas/route.ts), [/api/resumen](app/api/resumen/route.ts) |
| S4 | 🟠 Media | **`/api/notificaciones/tareas` acepta `userIds[]` arbitrario.** Cualquier usuario logueado puede pushear cualquier título/cuerpo a cualquier usuario del sistema. `/api/notificaciones/pedidos` ya resuelve esto bien (destinatarios server-side) — replicar ese patrón. | [/api/notificaciones/tareas](app/api/notificaciones/tareas/route.ts) |
| S5 | 🟠 Media | **RLS abierta en `pedido_mensajes` y `producto_mapeos`:** `USING(true) WITH CHECK(true)` para todo `authenticated`. El chat de pedidos de una sucursal lo lee y escribe cualquiera. | migraciones `..._create_pedido_mensajes`, `..._add_mapeos_...` |
| S6 | 🟡 Baja | **`pedido_items` SELECT abierto:** `auth.uid() IS NOT NULL`. Toda sucursal ve los ítems, cantidades y `valor_total` de las demás. | `initial_schema:169` |
| S7 | ✅ Resuelto 2026-09-02 | ~~Sin env vars, `proxy.ts` deja pasar todo sin autenticar; combinado con los placeholders de `next.config.ts`, un deploy mal configurado queda abierto.~~ Se concretó el 2026-09-01: las env vars de Production en Vercel quedaron apuntando al proyecto dev por ~16h (sin escrituras en prod durante la ventana; 1 pedido recuperado a mano). `lib/entorno.ts` ahora valida URL/anon key/service role key contra el ref esperado en build (`next.config.ts`, aborta), middleware (`proxy.ts`, 503 fail-closed) y runtime (`lib/supabase/server.ts`), más badge visible y `GET /api/entorno`. | [lib/entorno.ts](lib/entorno.ts), [proxy.ts](proxy.ts), [next.config.ts](next.config.ts) |
| S8 | 🟡 Baja | **Sin rate limiting en ninguna ruta.** Las de IA (`/api/tareas/audio`, `/agente`) queman cuota de Groq; `/api/sync-sheets` es costosa. | todo `app/api/` |
| S9 | 🟡 Baja | **UUID de usuario hardcodeado como permiso.** `DESTINATARIO_DEFAULT_INFORME_ID` habilita `/tareas/todas` (service role, todas las tareas del sistema). Debería ser un permiso en datos. | [app/tareas/helpers.ts:79](app/tareas/helpers.ts) |

### 10.2 Bugs funcionales

| # | Severidad | Bug | Dónde |
|---|---|---|---|
| B1 | ✅ Resuelto 2026-08-04 | ~~Query a una tabla que no existe: `supabase.from('mapeos')` en vez de `producto_mapeos`.~~ Corregido. Impacto real confirmado: era **cosmético**, no numérico — `recalcular_conciliacion()` hace su propio JOIN correcto en SQL, así que vendido/remito/diferencia siempre fueron exactos. Lo único roto era la columna "Sistema" de la tabla, que mostraba "sin mapear" en todas las filas. | [app/admin/conciliacion/page.tsx:18](app/admin/conciliacion/page.tsx) |
| B2 | 🟠 Media | **Colisión de esquema en `fudo_pagos`.** Creada dos veces con esquemas incompatibles; la segunda usa `IF NOT EXISTS`, así que no se aplicó. El código de Pendientes inserta contra columnas de la v2 (`fudo_expense_id`, `sucursal`, `comprobante_url`) que probablemente no existen en la tabla real. **Verificar en producción.** | [20260622174059](supabase/migrations/20260622174059_fudo_sync_model.sql) vs [20260622200306](supabase/migrations/20260622200306_009_fudo_pagos_v2.sql) |
| B3 | ✅ Migración lista, pendiente de `db push` | ~~Los roles personalizados no podían usar Compras.~~ La RLS de las 7 tablas `compras_*` hardcodeaba `rol IN ('admin','squad')`. Reemplazado por `tiene_acceso_compras()`: da acceso a las 7 tablas si el usuario es admin o tiene **al menos uno** de los 5 módulos `compras-*` en `modulos_permitidos` — mismo alcance que antes (todo o nada dentro de Compras, no granular por tabla, porque insumos/stock se leen desde pantallas cruzadas), pero ya no depende del nombre literal `'squad'`. | [20260804150000_compras_rls_modulos.sql](supabase/migrations/20260804150000_compras_rls_modulos.sql) |
| B4 | 🟠 Media | **Race condition en stock.** `sumarStock()` lee `compras_stock_actual`, calcula y hace `upsert` — desde el navegador, sin transacción ni `atomic increment`. Dos remitos simultáneos del mismo insumo pierden un incremento. Además `compras_stock_actual` y `compras_stock_movimientos` se escriben en dos llamadas: si falla la segunda, el stock cambió sin rastro. | [RemitosPedido.tsx:142-148](app/admin/compras/pedidos/RemitosPedido.tsx), [StockClient.tsx:60-71](app/admin/compras/stock/StockClient.tsx) |
| B5 | 🟠 Media | **Recepción de pedido sin transacción.** N `update pedido_items` + 1 `update pedidos` desde el cliente. Si se corta a la mitad, el pedido queda `enviado` con ítems parcialmente modificados y la conciliación toma datos incompletos. | [LocalPedidosClient.tsx:170-198](app/local/pedidos/LocalPedidosClient.tsx) |
| B6 | 🟡 Baja | **Índice UNIQUE incorrecto en `ventas_posberry`.** Es `(id_externo)` pero el dominio es `(id_externo, producto_nombre)`. Hoy no explota porque la sincronización borra antes de insertar. | [20260602143003](supabase/migrations/20260602143003_add_id_externo_to_ventas.sql) |
| B7 | 🟡 Baja | **`conciliaciones` sin UNIQUE en `(fecha, local_id, producto_nombre)`.** Dos `recalcular_conciliacion()` concurrentes para el mismo par duplican filas. `/api/sync-sheets` lanza hasta 150 RPC en paralelo. | `initial_schema` |
| B8 | 🟡 Baja | **`revertirYBorrar()` pierde la traza.** Inserta el movimiento negativo con `remito_id` del remito que borra a continuación; la FK `ON DELETE SET NULL` lo deja en `null`. | [RemitosPedido.tsx:151-158](app/admin/compras/pedidos/RemitosPedido.tsx) |
| B9 | 🟡 Baja | **`/ayuda` redirige a una ruta inexistente.** Para `deposito`/`fabrica` el `backHref` es `/operador/pedidos`, que no existe (son `/deposito/pedidos` y `/fabrica/pedidos`). | [app/ayuda/page.tsx:22](app/ayuda/page.tsx) |
| B10 | 🟡 Baja | **`Sidebar` con dependencia incompleta.** El `useEffect` que abre la sección activa depende solo de `[pathname]`, pero usa `sections`. Funciona por accidente. | [Sidebar.tsx:76](components/ui/Sidebar.tsx) |
| B11 | 🟡 Baja | **Migraciones duplicadas.** `20260625143606_fix_fk_delete_rules...` y `20260708203345_permitir_eliminar_usuarios` hacen el mismo cambio de FKs. La segunda usa `DROP CONSTRAINT` sin `IF EXISTS` y rompería en una base limpia. | ambas migraciones |

### 10.3 Datos duplicados entre código y base

Cuatro conjuntos de datos viven **a la vez** en una tabla editable por UI y en una
constante de TypeScript. Editar la UI no actualiza la constante:

| Dato | Tabla (editable) | Constante (hardcodeada) |
|---|---|---|
| Rubros y categorías | `plan_cuentas` | `RUBROS_CATEGORIAS` en [lib/gastos-constants.ts](lib/gastos-constants.ts) |
| Formas de pago | `formas_pago` | `FORMAS_PAGO` idem |
| Locales | (no existe tabla) | `LOCALES` idem — 9 locales, distintos de los 5 de `locales_config` |
| Datos de facturación | (no existe tabla) | `LOCALES` en [lib/compras/pedidoMensaje.ts](lib/compras/pedidoMensaje.ts) — CUIT y direcciones de 2 sucursales |

Además, `gastos.local`, `gastos.rubro` y `gastos.categoria` son **texto libre sin FK** a
sus maestros — nada garantiza que un gasto tenga un rubro que exista en `plan_cuentas`.

### 10.4 Manejo de zona horaria

Argentina es UTC-3 y el manejo es **manual y de tres formas distintas**:

```sql
-- SQL: correcto
(p.recibido_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = p_fecha
```

```ts
// /api/sync-sheets: offset fijo en el string
.gte('created_at', `${fechaDesde}T03:00:00`)

// /api/sync-sheets y ConciliacionClient: resta de horas sobre el Date
dt.setHours(dt.getHours() - 3)
```

Los dos caminos JS **ignoran el horario de verano** (Argentina no lo aplica hoy, así que
funciona — pero es una suposición no declarada) y están duplicados. Y muchas pantallas
usan `new Date().toISOString().split('T')[0]` para "hoy", que en Vercel (UTC) devuelve el
día siguiente **entre las 21:00 y las 00:00 hora argentina**.

### 10.5 Performance y escalabilidad

| # | Problema | Impacto |
|---|---|---|
| P1 | **Sin índices en las tablas más consultadas.** `pedidos` (nada: ni `local_id`, ni `destino`, ni `estado`, ni `created_at`), `pedido_items(pedido_id)`, `ventas_posberry(fecha, local_id)`, `conciliaciones(fecha, local_id)`, `gastos(fecha, local, estado)`, `proveedores(estado)`, `pedido_mensajes(pedido_id)` | Todas las pantallas hacen **seq scan**. Con decenas de miles de filas se degrada linealmente |
| P2 | **`/api/sync-sheets` trae la hoja `BD` completa** en cada sincronización y filtra en JS. La API de Sheets no acepta filtro por valor, pero **sí acepta rangos** (`BD!A1:H5000`) | El tiempo crece con el histórico total, no con el rango pedido. Riesgo de timeout de función serverless |
| P3 | **`/api/sync-sheets` lanza `locales × fechas` RPC en paralelo** (`Promise.all`) | Un mes × 5 locales = 150 conexiones concurrentes. Puede agotar el pool de Supabase |
| P4 | **`/admin/mapeos` trae 5000 filas de `ventas_posberry`** solo para sacar los nombres distintos | Debería ser una vista materializada o `SELECT DISTINCT` |
| P5 | **`/admin/compras/reportes` trae TODO el histórico** — 4 queries sin filtro de fecha, con joins anidados de 3 niveles; el filtro de rango se aplica **en el cliente** | Crece sin techo. Mover el rango al `.gte()/.lte()` de la query |
| P6 | **`/api/resumen` agrega en JavaScript** todas las filas de `gastos` + `ventas_posberry` del rango | Debería ser un `GROUP BY` en SQL o una vista |
| P7 | **RLS con subquery por fila** (patrones B y C, ~20 tablas) y `auth.uid()` sin envolver en `(SELECT auth.uid())` | Postgres re-evalúa el subquery por cada fila del resultado |
| P8 | **Fudo sin paginación y sin caché de token.** `page[size]=500` fijo; se pide token nuevo en cada request | Truncamiento **silencioso** cuando una sucursal supera 500 registros en el rango |
| P9 | **Clientes gigantes.** `TareasClient` 892 líneas, `ModalTarea` 714, `VistaCalendario` 562, `LocalPedidosClient` 523. Todo el estado en `useState` local | Bundle grande, re-renders costosos, difícil de testear |
| P10 | **`/admin/usuarios` llama `auth.admin.listUsers({perPage:500})`** en cada render de página | Se rompe (en silencio, por truncamiento) pasados 500 usuarios |
| P11 | **`export const dynamic = 'force-dynamic'`** en la mayoría de las páginas → cero caché | Correcto para datos que cambian, pero no se evaluó `revalidate` para lo que no |

### 10.6 Calidad y mantenibilidad

| # | Observación |
|---|---|
| Q1 | **No hay tests.** Ni unitarios, ni de integración, ni E2E. Ni CI. Los módulos de `lib/compras/` y `lib/csvParser.ts` son lógica pura y estarían testeados en una tarde |
| Q2 | **Errores de Supabase ignorados sistemáticamente.** El patrón `const { data } = await supabase...` sin mirar `error` está en casi todas las páginas — es exactamente lo que oculta el bug B1 |
| Q3 | **Validación de input solo en `/api/usuarios`.** Los otros 24 handlers hacen `await req.json()` y confían |
| Q4 | **`requireAdmin()` copiado en 10 lugares** (4 idéntico + 6 inline) |
| Q5 | **13 tablas `fudo_*` muertas** más el modelo de sincronización que nunca se implementó |
| Q6 | **README es el de `create-next-app`.** Cero documentación de setup, env vars o arquitectura (este archivo lo cubre) |
| Q7 | **`lib/types.ts` no cubre los módulos nuevos.** Compras y Tareas-parcial definen sus interfaces inline en cada cliente, duplicadas |
| Q8 | **`Rol` es `string`.** Correcto porque los roles son dinámicos, pero se perdió todo el type-safety; los literales `'admin'`/`'squad'` se comparan a mano en decenas de lugares |
| Q9 | **`console.error` como único logging.** Sin Sentry ni structured logs — los fallos del cron y de las sincronizaciones son invisibles |
| Q10 | **Sin `types` generados de Supabase.** `supabase gen types typescript` daría tipado real de tablas y RPCs |

---

## 11. Plan de optimización y escalabilidad

Ordenado por **impacto / esfuerzo**. Cada bloque es independiente.

### Fase 0 — Antes de cualquier otra cosa (horas)

| Acción | Por qué |
|---|---|
| ~~Rotar las credenciales Fudo y quitarlas del seed de la migración~~ ✅ 2026-08-04 | S1 |
| ~~Dejar de devolver `fudo_api_secret` en `GET /api/locales`~~ ✅ 2026-08-04 | S2 |
| ~~Arreglar B1: `from('mapeos')` → `from('producto_mapeos')`~~ ✅ 2026-08-04 | B1 |
| ~~RLS de Compras basada en módulos, no en `rol='squad'` hardcodeado~~ ✅ migración escrita 2026-08-04, falta `npx supabase db push` | B3 |
| **Verificar el esquema real de `fudo_pagos`** en producción y unificarlo con una migración explícita | B2 — riesgo de fallo silencioso en Pendientes |
| **Agregar `requireAdmin()`** a `/api/plan-cuentas` y `/api/resumen` | S3 |
| **Cerrar `/api/notificaciones/tareas`**: resolver destinatarios server-side desde `tarea_id`, como ya hace `/pedidos` | S4 |

### Fase 1 — Índices (1 hora, el mejor ROI del documento)

```sql
-- Pedidos: hoy sin ningún índice más allá del PK
CREATE INDEX idx_pedidos_local_created   ON pedidos(local_id, created_at DESC);
CREATE INDEX idx_pedidos_destino_estado  ON pedidos(destino, estado);
CREATE INDEX idx_pedidos_recibido_at     ON pedidos(recibido_at) WHERE estado = 'recibido';
CREATE INDEX idx_pedidos_grupo_id        ON pedidos(grupo_id) WHERE grupo_id IS NOT NULL;
CREATE INDEX idx_pedido_items_pedido_id  ON pedido_items(pedido_id);
CREATE INDEX idx_pedido_mensajes_pedido  ON pedido_mensajes(pedido_id, created_at);

-- Ventas y conciliación
CREATE INDEX idx_ventas_fecha_local      ON ventas_posberry(fecha, local_id);
CREATE INDEX idx_ventas_producto         ON ventas_posberry(producto_nombre);
CREATE INDEX idx_conc_fecha_local        ON conciliaciones(fecha, local_id);
CREATE INDEX idx_conc_alerta             ON conciliaciones(fecha) WHERE tiene_alerta;

-- Gastos
CREATE INDEX idx_gastos_fecha            ON gastos(fecha DESC);
CREATE INDEX idx_gastos_local_fecha      ON gastos(local, fecha DESC);
CREATE INDEX idx_gastos_estado           ON gastos(estado) WHERE estado <> 'Pagado';

-- Maestros
CREATE INDEX idx_proveedores_estado      ON proveedores(estado, nombre);
CREATE INDEX idx_productos_tipo_destino  ON productos(tipo, destino) WHERE activo;

-- Compras
CREATE INDEX idx_compras_remitos_fecha   ON compras_remitos(fecha DESC);
CREATE INDEX idx_compras_mov_created     ON compras_stock_movimientos(created_at DESC);
```

Y corregir las claves de unicidad:

```sql
DROP INDEX ventas_posberry_id_externo_idx;
CREATE UNIQUE INDEX ventas_posberry_dedup_idx
  ON ventas_posberry(id_externo, producto_nombre) WHERE id_externo IS NOT NULL;

-- Requiere limpiar duplicados existentes primero
CREATE UNIQUE INDEX conciliaciones_unica_idx
  ON conciliaciones(fecha, local_id, producto_nombre);
```

### Fase 2 — Integridad transaccional (2-3 días)

Las escrituras multi-tabla se hacen hoy desde el navegador, en llamadas separadas.
La solución correcta es **mover cada operación a una función Postgres** y llamarla con
un solo `rpc()` — atómica por definición:

```sql
-- Reemplaza N updates + 1 update desde el cliente (B5)
CREATE FUNCTION recibir_pedido(
  p_pedido_id uuid,
  p_items jsonb,        -- [{ item_id, cantidad_recibida, valor_total }]
  p_items_nuevos jsonb  -- [{ producto_id, producto_nombre, cantidad, valor_total }]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;

-- Reemplaza read-then-write + insert separado (B4)
CREATE FUNCTION registrar_movimiento_stock(
  p_item_id uuid, p_delta numeric, p_tipo text, p_remito_id uuid
) RETURNS numeric LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO compras_stock_actual (item_id, cantidad, actualizado_en, actualizado_por)
  VALUES (p_item_id, p_delta, now(), auth.uid())
  ON CONFLICT (item_id) DO UPDATE
    SET cantidad = compras_stock_actual.cantidad + p_delta,  -- ← incremento ATÓMICO
        actualizado_en = now(), actualizado_por = auth.uid();
  INSERT INTO compras_stock_movimientos (item_id, delta, tipo, remito_id, creado_por)
  VALUES (p_item_id, p_delta, p_tipo, p_remito_id, auth.uid());
  RETURN (SELECT cantidad FROM compras_stock_actual WHERE item_id = p_item_id);
END $$;

-- Y una para guardar el remito completo con todas sus líneas + los movimientos
CREATE FUNCTION guardar_remito(p_pedido_id uuid, p_numero text, p_fecha date, p_lineas jsonb)
  RETURNS uuid LANGUAGE plpgsql AS $$ ... $$;
```

Bonus: también resuelve las **guardas de estado** (validar la transición dentro de la
función) y **elimina el round-trip** por ítem.

### Fase 3 — Consolidar permisos en un solo lugar (2-3 días)

El problema de fondo (B3): hay **tres definiciones paralelas** de "quién puede qué"
— `MODULOS[]` en TS, el guard de `proxy.ts`, y las policies RLS que hardcodean roles.

```sql
-- Helper único, STABLE para que Postgres lo cachee
CREATE OR REPLACE FUNCTION tiene_modulo(p_modulo text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
      AND estado = 'activo'
      AND (rol = 'admin' OR p_modulo = ANY(modulos_permitidos))
  );
$$;
```

Y reescribir las policies del patrón B/C para que usen esto en vez de nombrar roles:

```sql
-- Antes: rol IN ('admin','squad')   ← rompe con roles personalizados
-- Después:
DROP POLICY "admin y squad manejan compras_items" ON compras_items;
CREATE POLICY compras_items_acceso ON compras_items
  FOR ALL USING (tiene_modulo('compras-insumos'));
```

Aplicar a las 7 tablas `compras_*`, `gastos`, `proveedores`, `plan_cuentas`,
`locales_config`, `formas_pago`, `cajas`. Además:

- Cerrar `pedido_mensajes` y `producto_mapeos` (S5) con policies reales.
- Acotar `pedido_items` SELECT al dueño del pedido o los operadores del destino (S6).
- Reemplazar `DESTINATARIO_DEFAULT_INFORME_ID` por un módulo `tareas_todas` (S9).

### Fase 4 — Fuente única de verdad para los maestros (2 días)

```sql
-- El maestro que falta: locales como entidad de primera clase
CREATE TABLE locales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,       -- 'YA! PARAGUAY'
  nombre_posberry text,              -- 'Suc. Paraguay'  → reemplaza normalizarNombre()
  nombre_fudo text,                  -- 'YA! PARAGUAY'   → reemplaza matchLocal()
  cuit text, direccion text,         -- ← desde lib/compras/pedidoMensaje.ts
  fudo_api_key text, fudo_api_secret text,   -- absorbe locales_config
  activo boolean NOT NULL DEFAULT true
);
```

Con eso:
- `gastos.local` pasa a `local_id uuid REFERENCES locales(id)`.
- `gastos.rubro/categoria` pasan a `plan_cuenta_id uuid REFERENCES plan_cuentas(id)`.
- Se borran `RUBROS_CATEGORIAS`, `FORMAS_PAGO` y `LOCALES` de
  [lib/gastos-constants.ts](lib/gastos-constants.ts), y `LOCALES` de
  [lib/compras/pedidoMensaje.ts](lib/compras/pedidoMensaje.ts).
- `matchLocal()` y `normalizarNombre()` dejan de ser heurísticas de strings y pasan a ser
  un lookup por columna. **Esto elimina toda una clase de bugs de "no mapeado".**

### Fase 5 — Zona horaria de una sola manera (1 día)

```ts
// lib/fechas.ts — el único lugar donde se habla de husos
export const TZ = 'America/Argentina/Buenos_Aires'

/** "Hoy" en Argentina, sin importar en qué huso corre el servidor. */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())  // YYYY-MM-DD
}

/** Límites UTC de un día argentino, para filtrar columnas timestamptz. */
export function rangoUTCDeDiaArgentino(fecha: string): { desde: string; hasta: string } { ... }
```

Reemplazar **todas** las apariciones de `new Date().toISOString().split('T')[0]`
(hay ~10) y de `setHours(h - 3)` (2). Del lado SQL ya está bien: mantener
`AT TIME ZONE`.

### Fase 6 — Mover la agregación a la base (3-4 días)

```sql
-- Reemplaza el JS de /api/resumen (P6)
CREATE VIEW v_resumen_local_mes AS
SELECT l.nombre AS local, date_trunc('month', g.fecha)::date AS mes,
       pc.rubro, pc.categoria, sum(g.monto) AS total, count(*) AS movimientos
FROM gastos g JOIN locales l ON l.id = g.local_id
              JOIN plan_cuentas pc ON pc.id = g.plan_cuenta_id
GROUP BY 1,2,3,4;

-- Reemplaza el limit-5000 de /admin/mapeos (P4)
CREATE MATERIALIZED VIEW mv_nombres_posberry AS
SELECT DISTINCT producto_nombre, count(*) AS ocurrencias, max(fecha) AS ultima_venta
FROM ventas_posberry GROUP BY producto_nombre;
CREATE UNIQUE INDEX ON mv_nombres_posberry(producto_nombre);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY al final de /api/sync-sheets

-- Reemplaza calcularGastoPorProveedor() sobre todo el histórico (P5)
CREATE VIEW v_gasto_proveedor AS
SELECT p.id, p.nombre, r.fecha,
       sum(ri.cantidad * ri.precio) FILTER (WHERE ri.precio IS NOT NULL) AS gasto,
       count(*) FILTER (WHERE ri.precio IS NULL) AS lineas_sin_precio
FROM compras_remito_items ri
  JOIN compras_remitos r  ON r.id = ri.remito_id
  JOIN compras_pedidos cp ON cp.id = r.pedido_id
  JOIN proveedores p      ON p.id = cp.proveedor_id
GROUP BY 1,2,3;
```

**Antes de borrar código:** las funciones de [lib/compras/reportes.ts](lib/compras/reportes.ts)
son lógica pura y bien pensada (el criterio de `lineasSinPrecio` hay que replicarlo en
SQL con el `FILTER`). Escribir los tests primero, migrar después, comparar resultados.

### Fase 7 — Robustecer la sincronización (2-3 días)

```
· /api/sync-sheets: pedir RANGO al Sheet ('BD!A1:H5000') en vez de la hoja entera (P2)
· Batchear las RPC de conciliación: una función recalcular_conciliacion_rango(desde, hasta, local_ids[])
  que itere en el servidor, en vez de 150 llamadas HTTP paralelas (P3)
· lib/fudo.ts: paginar de verdad (seguir `links.next`) y avisar si truncó (P8)
· lib/fudo.ts: cachear el token por sucursal con TTL (P8)
· Tabla `sync_log` (o reusar la fudo_sync_log ya creada): registrar cada
  sincronización con inicio/fin/registros/errores → hoy los fallos son invisibles (Q9)
· Chequear `error` en TODAS las respuestas de Supabase (Q2) — un lint rule custom
  o un wrapper `mustQuery()` que lance
```

### Fase 8 — Calidad de código (continuo)

```
· npx supabase gen types typescript --linked > lib/database.types.ts
  y tipar createClient<Database>()  → adiós a los `as` y los tipos inline (Q10, Q7)

· Extraer lib/auth/requireRol.ts  →  requireRol(['admin']) / requireModulo('gastos')
  reemplaza las 10 copias de requireAdmin() (Q4)

· Schemas Zod por endpoint en lib/schemas/  → los 24 handlers sin validar (Q3)

· Tests: arrancar por la lógica pura, que ya está aislada (Q1)
    lib/compras/matchRemito.ts      · sugerirPedidoItem
    lib/compras/reportes.ts         · las 3 funciones de cálculo
    lib/compras/rangoFechas.ts      · ya recibe `ahora` por parámetro, diseñado para test
    lib/csvParser.ts                · parseNumero con formato es-AR es puro terreno de bugs
    lib/modulos.ts                  · getModuloPorPath, esRolConModulos, getRoleHome
  Vitest + un GitHub Action con `tsc --noEmit`, `eslint` y `vitest run`

· Partir los clientes gigantes (P9): TareasClient 892 líneas → hooks
  (useTareas, useTareasRealtime) + componentes de vista. Evaluar un store
  (Zustand) para el estado compartido entre Board/Calendario/Lista

· Rate limiting (S8): @upstash/ratelimit en /api/tareas/* y /api/sync-sheets

· Borrar las 13 tablas fudo_* muertas o implementar el job que las llene (Q5).
  Decidir, no dejarlas en el limbo

· Sentry o equivalente (Q9)
```

### Hacia dónde escalar la arquitectura

Si el sistema sigue creciendo, la línea de corte natural es **por dominio**, y el
código ya insinúa dónde:

```
Compras   ← el mejor candidato: lógica pura ya aislada en lib/compras/,
              tablas con prefijo propio, RLS uniforme, cero acoplamiento con Pedidos
Tareas    ← segundo candidato: tablas propias, realtime propio, IA propia,
              transversal a roles (ya vive fuera de /admin)
Gastos + Ventas + Conciliación  ← el núcleo contable, difícil de separar:
              conciliaciones depende de pedidos, ventas_posberry y productos a la vez
```

**No conviene separarlos todavía.** El monolito está bien para el tamaño actual; lo que
falta no es descomponer sino **consolidar**: una fuente de verdad por dato (Fase 4), una
capa de permisos (Fase 3), transacciones donde corresponde (Fase 2) y tests (Fase 8).
Recién con eso hecho, extraer un dominio es un refactor y no una cirugía.

---

## Apéndice — Cheatsheet

```bash
npm run dev        # Next dev server
npm run build      # Build de producción
npm run lint       # ESLint

npx supabase db push                      # Aplicar migraciones pendientes
npx supabase migration new <nombre>       # Nueva migración
npx supabase gen types typescript --linked # Generar tipos (recomendado, hoy no se usa)
npx tsx <archivo>                          # Probar lógica pura de lib/ a mano
```

**Puntos de entrada por tarea:**

| Quiero… | Empezar por |
|---|---|
| Agregar un módulo al panel | [lib/modulos.ts](lib/modulos.ts) → agregar a `MODULOS[]` |
| Cambiar permisos de un rol | [lib/modulos.ts](lib/modulos.ts) + [proxy.ts](proxy.ts) + la policy RLS de la tabla |
| Tocar el cálculo de conciliación | nueva migración con `CREATE OR REPLACE FUNCTION recalcular_conciliacion` |
| Cambiar la máquina de estados de pedidos | [PedidosOperadorClient.tsx](components/pedidos/PedidosOperadorClient.tsx) + `LocalPedidosClient` + el CHECK de `pedidos.estado` |
| Agregar un maestro CRUD simple | copiar `/admin/cajas` + `/api/cajas` + [TablaMaestra](components/ui/TablaMaestra.tsx) |
| Cambiar el mensaje de WhatsApp a proveedores | [lib/compras/pedidoMensaje.ts](lib/compras/pedidoMensaje.ts) |
| Sumar un tool al agente de tareas | [/api/tareas/agente](app/api/tareas/agente/route.ts) → `TOOLS[]` + `ejecutarTool()` |
| Mandar una notificación nueva | [lib/push/sendPush.ts](lib/push/sendPush.ts) → `enviarPush()` |
