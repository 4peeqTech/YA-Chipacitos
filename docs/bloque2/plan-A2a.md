# A2a — Insumos: arreglos de base (especificación ejecutable)

> Rama `bloque2/stock`, sale de `qa` @ `dbc8eb2` (A1 y B0 adentro). Plan maestro: `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md` (fase A2a, decisiones **C1** y **C2**). Relevamiento hecho contra el código de `qa` y contra **dev** (`fafckqysyvtlslfnpzrh`) el 2026-10-05. Prod no se leyó.
>
> Valen el "Protocolo para agentes" del plan maestro y los principios del Bloque 1: Server Actions con `Resultado<T>`, cero triggers, migraciones solo a dev, `useConfirm` propio (nunca `confirm()`), toast, `Modal`, íconos lucide, tokens semánticos.

## 0. Qué cambia, en una línea

Insumos deja de escribir desde el navegador: crear, editar, archivar y eliminar pasan por RPCs con auditoría. Los proveedores del insumo se actualizan sin borrarse, un insumo con historia se archiva (nunca se borra) y la tabla muestra **stock**, **pedido abierto**, **precio de referencia** y **último precio facturado** en lugar del precio viejo.

## 1. Relevamiento (lo que el Ejecutor tiene que saber)

### 1.1 Esquema vigente en dev

- **`compras_items`**: `id, nombre, unidad, stock_minimo, estado ('activo'|'archivado'), created_at, categoria_id, precio (legacy), cantidad_por_unidad, cantidad_por_masa, redondeo, stock_maximo, a_demanda, alicuota_iva`. No tiene `updated_at`.
- **`compras_item_proveedores`**: `id, item_id, proveedor_id, es_principal, precio_ref, codigo_proveedor, activo (default true), created_at`. `unique (item_id, proveedor_id)`. FK a `compras_items` y a `proveedores`, las dos `ON DELETE CASCADE`.
- **FK hacia `compras_items`:**

  | Tabla | `ON DELETE` hoy | Después de A2a |
  |---|---|---|
  | `compras_stock_movimientos` | **CASCADE** | **RESTRICT** (C1) |
  | `compras_stock_actual` | CASCADE | igual (es caché del ledger; si no hay movimientos vale 0) |
  | `compras_item_proveedores` | CASCADE | igual (es configuración; la RPC de eliminar la borra explícitamente) |
  | `compras_pedido_items`, `compras_remito_items`, `compras_factura_items`, `compras_factura_discrepancias`, `compras_solicitud_items`, `fabrica_conteo_items`, `fabrica_conteo_definicion_items`, `compras_plantilla_base` | NO ACTION (ya bloquea) | igual |

- **RLS:**
  - `compras_items_acceso` es **`ALL`** con `tiene_acceso_compras() or tiene_acceso_fabrica()`: hoy **Fábrica puede escribir el catálogo de insumos** desde el navegador.
  - `compras_item_proveedores_escritura` es `ALL` con `tiene_acceso_compras()`.
- **Escrituras desde el navegador:** la única es `InsumosClient.tsx` (crear/editar `:192-218`, archivar `:232-243`, eliminar `:245-254`). Nadie más escribe esas dos tablas desde el front. En SQL, solo `compras_confirmar_factura` toca `compras_item_proveedores` (actualiza `precio_ref` de los pares `activo`).
- **Datos de dev:** 58 insumos (1 archivado, que **tiene stock ≠ 0, está en una lista de conteo y en el pedido base**: sirve para QA). 58 pares, todos `activo`. Ningún insumo con dos principales, ni sin principal, ni sin proveedor. Sin nombres duplicados. **Ningún insumo con `precio` cargado.** 16 insumos con movimientos y 41 sin ningún uso. 4 facturas confirmadas. 10 pedidos `enviado`/`parcial`.
- **`maneja_stock`:** en dev los 18 proveedores lo tienen en `true` (el "solo huevos y GLOBAL" es de prod).

### 1.2 Quién filtra hoy los archivados

| Lugar | ¿Filtra `estado = 'activo'`? |
|---|---|
| Catálogo del pedido (`pedidos/datos.ts:24`), remitos (`remitos/datos.ts:27`), facturas (`facturas/datos.ts:65`), Pedido base (`base/page.tsx:20`), Listas de conteo (`listas-conteo/page.tsx:15`) | Sí |
| Stock (`stock/page.tsx:19`) y Stock › Histórico (`historico/page.tsx:19`) | Sí, y por eso un archivado con stock o con historia **desaparece de Stock** y su `?insumo=` no abre nada |
| Siembra del borrador de conteo en Fábrica (`app/fabrica/stock/page.tsx:96-123`) | **No**: un insumo archivado se sigue contando |
| `generar_solicitud_base()` (cuerpo vigente en `20260924150000_solicitud_base_stock.sql`) | **No**: un archivado sigue entrando al pedido base |

### 1.3 Lectores de `compras_items.precio` (para borrarla en F9)

- `InsumosClient.tsx` (columna `:399` y campo `:579-582`): **A2a los saca**.
- `v_compras_items` (`20260901150000:97`, columna `i.precio`). Su único consumidor (`reportes/page.tsx:47`) no la selecciona.
- `lib/database.types.ts` (generado).
- Ninguna función SQL la lee (consultado en dev: 0 funciones).

**Para F9:** antes del `drop column`, recrear `v_compras_items` sin `precio` y copiar los valores no nulos a `compras_items_historial` (`campo = 'precio_legacy'`, `origen = 'migracion'`), por si prod tiene alguno.

### 1.4 `tiene_acceso_compras()` (para el ítem opcional §8)

Definición vigente (`20260914120000`): `rol = 'admin'` o `modulos_permitidos && {compras-insumos, compras-stock, compras-pedidos, compras-reportes, fabrica-conteos}`. La sumó esa migración para que la vista del historial de conteos siguiera pasando el gate cuando la pantalla se mudó a Fábrica. El efecto colateral: **con solo `fabrica-conteos` se pasan todos los RPCs de Compras.** El detalle está en §8.

## 2. Decisiones de diseño

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| E1 | Cómo viaja la edición | El cliente manda **solo los campos que cambió** (diff contra lo que cargó). La RPC actualiza solo las claves presentes y rechaza claves desconocidas (`precio`, `estado`, `id`…). | Dos personas que editan campos distintos no se pisan, y el historial registra exactamente lo que se tocó. |
| E2 | `precio_ref` | Cada proveedor viaja con `precio_ref` y `precio_ref_anterior` (lo que vio el form). Si son iguales, **no se toca**. Si cambió y la base ya no tiene `precio_ref_anterior` (lo actualizó una factura mientras se editaba), la RPC **rechaza** con un mensaje que dice el valor nuevo. | Es el bug de hoy: guardar el insumo pisaba el precio que dejó la factura. |
| E3 | `activo` del par | Nunca se resetea. El par desactivado se muestra en el form como "Proveedores anteriores" con "Volver a usar". | Hoy no hay UI para `activo`, pero `PedidoEditor` y las facturas lo leen. |
| E4 | Quitar un proveedor del insumo | Si el par **tiene historia** (pedidos, facturas, solicitudes o pedido base con ese proveedor e insumo) → `activo = false`. Si no tiene → se borra. | Conserva el `precio_ref` y la trazabilidad, y no deja basura cuando fue un error de carga. **(D3 para el usuario)** |
| E5 | Un solo principal | Índice único parcial `(item_id) where es_principal`. La RPC exige exactamente un principal y que esté activo. | Hoy lo garantiza solo el front. |
| E6 | Archivar (C1) | **Se esconde, no se borra la configuración.** El archivado no se cuenta, no entra al pedido base ni a pedidos/remitos/facturas nuevos, pero conserva su lugar en las listas de conteo y en la plantilla base: si se reactiva, vuelve solo. Al archivar se sacan sus filas de los **borradores** de conteo. | Desactivar la membresía de la lista tiene una trampa: la pantalla de listas no muestra las inactivas y volver a agregarla choca con `unique (definicion_id, item_id)`. |
| E7 | Archivar con stock ≠ 0 o con pedido abierto | **Se avisa, no se bloquea.** El confirm lo dice con números. | El remito de un pedido abierto se carga igual (las líneas traen su `item_id`). **(D2 para el usuario)** |
| E8 | Eliminar | Solo si el insumo **no tiene historia**: movimientos, ítems de pedido, remito, factura, diferencias de factura, solicitudes o conteos no-borrador. La configuración (listas, plantilla base, borradores, proveedores) se borra con él, y el confirm la enumera. El botón solo aparece si se puede. | C1. El `RESTRICT` del ledger queda como red de seguridad. |
| E9 | Escrituras | Se borran las policies de escritura de `compras_items` y `compras_item_proveedores`. Quedan solo de lectura. Todo se escribe por RPC `security definer`. | Cierra el "Fábrica puede editar el catálogo" y el "update directo sin auditoría". |
| E10 | Último precio facturado | Solo lo ve **admin** (la vista devuelve `null` para el resto). | `compras_facturas` y sus ítems son `es_admin()`, igual que las ramas de factura de `v_compras_pedido_eventos`. **(D1 para el usuario)** |
| E11 | Pedido abierto | Pedidos con `estado_recepcion in ('enviado','parcial')` y algo **pendiente** del insumo (pedido − recibido > 0). Los `sin_enviar` no cuentan. | Es "pendiente de recibir". |
| E12 | Link a la ficha de Stock | Pasa del nombre a la celda **Stock**. La fila entera abre el form de edición (sin ícono de lápiz). | Regla de la app: fila clickeable sin ícono de editar. Así no hay dos links al mismo destino. Cambia el paso 7 de la lista de pruebas de B0. |
| E13 | `maneja_stock` (C2) | Insumos lo deja de leer. En Proveedores el checkbox pasa a llamarse **"Sugerir cantidades al pedir"**. La columna y su único uso real (`PedidoEditor.tsx:104,118`) no cambian. `proveedores.local` no se toca (es de B3). | Ver C2. |

## 3. Migración `supabase/migrations/20261005150000_compras_insumos_base.sql`

Timestamp posterior al último de `qa` (`20261005130000`) y al de B1 (`20261005140000`). **Antes del `db push`:** `git fetch && git rebase origin/qa`. Si B1 todavía no entró a `qa`, avisale al coordinador: el CLI rechaza versiones remotas que no tiene localmente. Si hace falta, se renombra a un timestamp mayor.

Todo en una transacción. El orden importa.

### 3.1 Historial

```sql
create table public.compras_items_historial (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references compras_items(id) on delete cascade,
  lote           uuid not null,                 -- una guardada = un lote
  campo          text not null,
  proveedor_id   uuid references proveedores(id) on delete set null,
  valor_anterior text,
  valor_nuevo    text,
  origen         text not null default 'insumos' check (origen in ('insumos', 'factura', 'migracion')),
  creado_por     uuid references profiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index compras_items_historial_item_idx on public.compras_items_historial (item_id, creado_en desc);
alter table public.compras_items_historial enable row level security;
create policy compras_items_historial_lectura on public.compras_items_historial
  for select using (tiene_acceso_compras());
-- Sin policies de escritura: solo la escriben las RPCs.
```

**Vocabulario de `campo`** (texto legible en `valor_*`, nunca uuids):

| `campo` | `valor_anterior` → `valor_nuevo` |
|---|---|
| `creado` | — → nombre |
| `nombre`, `unidad`, `redondeo` | texto |
| `categoria` | nombre de la categoría (o `null`) |
| `cantidad_por_unidad`, `cantidad_por_masa`, `stock_minimo`, `stock_maximo`, `alicuota_iva` | número como texto |
| `a_demanda` | `sí` / `no` |
| `estado` | `activo` / `archivado` |
| `proveedor` | `null` → nombre (agregado) · nombre → `null` (quitado, sin historia) |
| `proveedor.activo` | `sí` / `no` (desactivado o vuelto a usar) |
| `proveedor.principal` | `sí` / `no` |
| `proveedor.precio_ref`, `proveedor.codigo` | texto |

`on delete cascade` del historial: un insumo solo se elimina si no tiene historia (E8), así que no se pierde nada que importe.

**Para A2b:** `compras_confirmar_factura` (es suya) debería registrar `proveedor.precio_ref` con `origen = 'factura'`. A2a deja la columna lista y no toca esa función.

### 3.2 Normalización previa y unicidad del principal

```sql
-- Prod puede tener datos que dev no tiene. Se normaliza antes del índice y se avisa.
do $$
declare r record;
begin
  -- Más de un principal: queda el más viejo.
  for r in
    select item_id, array_agg(id order by created_at, id) ids
    from compras_item_proveedores where es_principal group by item_id having count(*) > 1
  loop
    update compras_item_proveedores set es_principal = false where id = any(r.ids[2:]);
    raise notice 'Insumo % tenía % principales: quedó el más viejo.', r.item_id, array_length(r.ids, 1);
  end loop;
  -- Un principal inactivo: se activa (si estaba inactivo, el pedido nunca lo ofrecía igual).
  for r in select id, item_id from compras_item_proveedores where es_principal and not activo loop
    update compras_item_proveedores set activo = true where id = r.id;
    raise notice 'Insumo %: el principal estaba inactivo, se reactivó.', r.item_id;
  end loop;
  -- Duplicados de nombre: no se tocan, solo se listan (la RPC los rechaza de acá en adelante).
  for r in select lower(btrim(nombre)) n, count(*) c from compras_items group by 1 having count(*) > 1 loop
    raise notice 'Nombre de insumo repetido: "%" (% veces). Revisalo a mano.', r.n, r.c;
  end loop;
end $$;

create unique index compras_item_proveedores_un_principal
  on public.compras_item_proveedores (item_id) where es_principal;
```

No se crea un índice único por nombre: no sabemos qué hay en prod. La unicidad la controla la RPC.

### 3.3 FK del ledger (C1)

```sql
alter table public.compras_stock_movimientos
  drop constraint compras_stock_movimientos_item_id_fkey,
  add  constraint compras_stock_movimientos_item_id_fkey
       foreign key (item_id) references compras_items(id) on delete restrict;
```

### 3.4 RLS: solo lectura desde el navegador (E9)

```sql
drop policy compras_items_acceso on public.compras_items;
create policy compras_items_lectura on public.compras_items
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy compras_item_proveedores_escritura on public.compras_item_proveedores;
-- compras_item_proveedores_lectura queda como está.
```

### 3.5 Helper interno de auditoría

```sql
create or replace function public._compras_item_hist(
  p_item uuid, p_lote uuid, p_campo text, p_prov uuid, p_ant text, p_nue text
) returns void language sql security definer set search_path = public as $$
  insert into compras_items_historial (item_id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, creado_por)
  select p_item, p_lote, p_campo, p_prov, p_ant, p_nue, auth.uid()
  where p_ant is distinct from p_nue;
$$;
revoke execute on function public._compras_item_hist(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
```

### 3.6 RPC `compras_guardar_insumo`

```sql
create or replace function public.compras_guardar_insumo(
  p_item_id     uuid  default null,   -- null = crear
  p_datos       jsonb default '{}'::jsonb,
  p_proveedores jsonb default null    -- null = no tocar proveedores
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campos constant text[] := array['nombre','unidad','categoria_id','cantidad_por_unidad','cantidad_por_masa',
                                    'stock_minimo','redondeo','stock_maximo','a_demanda','alicuota_iva'];
  v_lote uuid := gen_random_uuid();
  v_id   uuid := p_item_id;
  v_old  compras_items%rowtype;
  v_new  compras_items%rowtype;
  ...
begin
  if not tiene_acceso_compras() then raise exception 'No autorizado'; end if;
  -- 1. Claves: solo v_campos. Cualquier otra → 'El campo "%" no se edita desde Insumos.'
  -- 2. Valores presentes:
  --    nombre/unidad no vacíos; cantidad_por_unidad > 0; cantidad_por_masa >= 0; stock_minimo >= 0;
  --    stock_maximo null o > 0 (ya hay check); redondeo y alicuota_iva los validan sus checks
  --    (dejá que salten: mensajeError ya los traduce, o tradúcelos acá si el texto queda feo).
  -- 3. Crear: exige nombre, unidad y p_proveedores con al menos un elemento.
  --    Editar: select ... for update; si no existe → 'No encontramos el insumo. Recargá la página.'
  --    Se puede editar un archivado.
  -- 4. Nombre único: lower(btrim(nombre)) contra los demás (id is distinct from v_id). Mensaje:
  --    'Ya existe un insumo llamado "X".' y, si el otro está archivado,
  --    'Ya existe un insumo llamado "X" (archivado): reactivalo en lugar de crear otro.'
  -- 5. Crear: insert con coalesce a los defaults de la tabla; historial 'creado'.
  --    Editar: un solo update con case when p_datos ? '<campo>' then ... else <campo> end
  --    (returning * into v_new) y después un insert al historial desde
  --      (values ('nombre', v_old.nombre is distinct from v_new.nombre, v_old.nombre, v_new.nombre), ...)
  --    comparando con el tipo real (numeric con numeric, no '16.5' con '16.50') y filtrando por el booleano.
  --    categoria: nombre de compras_categorias; a_demanda: 'sí'/'no'.
  -- 6. Proveedores (si p_proveedores no es null), ver abajo.
  -- 7. return jsonb_build_object('item_id', v_id, 'cambios', (select count(*) from compras_items_historial where lote = v_lote));
end $$;
revoke execute on function public.compras_guardar_insumo(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.compras_guardar_insumo(uuid, jsonb, jsonb) to authenticated;
```

**Forma de cada elemento de `p_proveedores`:**
`{ proveedor_id, es_principal, activo, codigo_proveedor, precio_ref, precio_ref_anterior }`. Viajan **todos** los pares que el form conoce, activos e inactivos.

**Proveedores, en este orden:**
1. **Validar el conjunto:** es un array; no hay `proveedor_id` repetido (`'Hay un proveedor repetido.'`); al menos uno activo (`'El insumo necesita al menos un proveedor activo.'`); exactamente un principal (`'Marcá un solo proveedor principal (la estrella).'`) y el principal está activo (`'El proveedor principal tiene que estar activo.'`).
2. **Quitados** (están en la base y no vienen en el array), con `for update`:
   - con historia (E4) → `activo = false, es_principal = false`, historial `proveedor.activo` `sí → no`;
   - sin historia → `delete`, historial `proveedor` `nombre → null`.

   "Historia del par" = existe alguno de: `compras_pedido_items` de un pedido de ese proveedor con ese `item_id`; `compras_factura_items` de una factura de ese proveedor; `compras_solicitud_items` o `compras_plantilla_base` con ese `item_id` y `proveedor_id`.
3. **Apagar estrellas** que dejan de ser principales **antes** de prender la nueva (si no, choca con el índice parcial):
   `update compras_item_proveedores set es_principal = false where item_id = v_id and es_principal and proveedor_id <> <el principal del array>`.
4. **Por cada elemento:**
   - **No existe el par:** el proveedor tiene que existir y estar `estado = 'activo'` (`'Ese proveedor no existe o está archivado.'`). Insert con `precio_ref`, `codigo_proveedor` (vacío → null), `es_principal`, `activo`. Historial `proveedor` `null → nombre` (y `proveedor.precio_ref` si vino con precio).
   - **Existe:** `for update`, y por campo:
     - `precio_ref`: solo si `precio_ref is distinct from precio_ref_anterior` (el usuario lo tocó). Si además `actual.precio_ref is distinct from precio_ref_anterior` → `raise exception 'El precio de referencia de % cambió mientras editabas (ahora %). Recargá la página y volvé a intentar.'`. Si no, update + historial.
     - `codigo_proveedor`, `es_principal`, `activo`: update si cambian, con historial. Volver a usar (`activo false → true`) exige que el proveedor esté activo.

Una guardada sin cambios devuelve `cambios = 0` y no escribe nada.

### 3.7 RPC `compras_archivar_insumo`

```sql
create or replace function public.compras_archivar_insumo(
  p_item_id uuid default null, p_archivar boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
-- 1. tiene_acceso_compras(); select ... for update; si no existe → error.
-- 2. Si ya está en ese estado → 'Ya está archivado.' / 'Ya está activo.'
-- 3. update estado; historial 'estado'.
-- 4. Si archiva: delete from fabrica_conteo_items fci using fabrica_conteos c
--      where c.id = fci.conteo_id and c.estado = 'borrador' and fci.item_id = p_item_id;
--    (las listas y la plantilla base NO se tocan, E6)
-- 5. return jsonb_build_object(
--      'estado', <nuevo>,
--      'borradores_quitados', <row_count>,
--      'listas', <jsonb_agg de los nombres de las listas activas donde está>,
--      'pedido_base', <cantidad de líneas activas de la plantilla con ese item>,
--      'stock', coalesce(<compras_stock_actual.cantidad>, 0));
$$;
```

Con `revoke`/`grant` como §3.6. Si Fábrica estaba guardando una cantidad de ese insumo, su `fabrica_guardar_cantidad_conteo` da "No encontramos ese ítem del conteo. Recargá la página." y al recargar el insumo ya no aparece. Es el comportamiento buscado.

### 3.8 RPC `compras_eliminar_insumo`

```sql
create or replace function public.compras_eliminar_insumo(p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
-- 1. tiene_acceso_compras(); lock; si no existe → error.
-- 2. Contar historia: movimientos, ítems de pedido, de remito, de factura, diferencias de factura,
--    ítems de solicitud y ítems de conteos que no son borrador.
--    Si hay alguno → raise exception
--      'No se puede eliminar: tiene 12 movimientos de stock y 3 pedidos. Archivalo: deja de aparecer y no pierde su historia.'
--    (solo las partes > 0, unidas con comas y "y").
-- 3. Si compras_stock_actual.cantidad <> 0 → error (no debería pasar sin movimientos: avisa del desvío).
-- 4. Borrar, en este orden: fabrica_conteo_items de borradores, fabrica_conteo_definicion_items,
--    compras_plantilla_base, compras_item_proveedores, compras_stock_actual, compras_items
--    (el historial cae por cascade).
-- 5. return jsonb_build_object('nombre', <nombre>);
$$;
```

### 3.9 `generar_solicitud_base`: el archivado no entra

Copiá el cuerpo vigente (`20260924150000_solicitud_base_stock.sql`, que coincide con dev) y sumá solo esto al `where` del insert:

```sql
  where pb.activo
    and (pb.item_id is null
         or exists (select 1 from compras_items ci where ci.id = pb.item_id and ci.estado = 'activo'))
```

La función no tiene dueño en la tabla del plan maestro. A2a la toma para este cambio y avisa en las notas.

### 3.10 Vista `v_compras_insumos_resumen`

Una fila por insumo. La lee `insumos/page.tsx`. Corre como dueño (igual que las demás `v_compras_*`): el gate va en el `where`.

```sql
create view public.v_compras_insumos_resumen as
select
  i.id                                   as item_id,
  coalesce(sa.cantidad, 0)               as stock,
  pp.proveedor_id                        as proveedor_principal_id,
  pp.precio_ref                          as precio_ref_principal,
  case when es_admin() then uf.precio_unitario end as ultimo_precio,
  case when es_admin() then uf.unidad          end as ultimo_precio_unidad,
  case when es_admin() then uf.fecha           end as ultimo_precio_fecha,
  case when es_admin() then uf.factura_id      end as ultimo_precio_factura_id,
  case when es_admin() then uf.proveedor_id    end as ultimo_precio_proveedor_id,
  coalesce(pa.pedidos, '[]'::jsonb)      as pedidos_abiertos,  -- [{pedido_id, numero, pendiente, enviado_en}]
  u.movimientos, u.pedidos, u.remitos, u.facturas, u.solicitudes, u.conteos,
  (u.movimientos + u.pedidos + u.remitos + u.facturas + u.discrepancias + u.solicitudes + u.conteos) = 0
                                         as puede_eliminar
from compras_items i
left join compras_stock_actual sa on sa.item_id = i.id
left join compras_item_proveedores pp on pp.item_id = i.id and pp.es_principal and pp.activo
left join lateral (
  select fi.precio_unitario, fi.unidad, f.fecha, f.id as factura_id, f.proveedor_id
  from compras_factura_items fi
  join compras_facturas f on f.id = fi.factura_id
  where fi.item_id = i.id and f.estado = 'confirmada' and f.tipo_comprobante = 'factura'
    and fi.precio_unitario > 0
  order by f.fecha desc, f.confirmada_en desc, fi.orden desc, fi.id desc
  limit 1
) uf on true
left join lateral (
  select jsonb_agg(jsonb_build_object('pedido_id', x.pedido_id, 'numero', x.numero,
                                      'pendiente', x.pendiente, 'enviado_en', x.enviado_en)
                   order by x.enviado_en) as pedidos
  from (
    select p.id as pedido_id, p.numero, p.enviado_en,
           sum(greatest(pi.cantidad - coalesce((select sum(ri.cantidad) from compras_remito_items ri
                                                where ri.pedido_item_id = pi.id), 0), 0)) as pendiente
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where pi.item_id = i.id and p.estado_recepcion in ('enviado', 'parcial')
    group by p.id, p.numero, p.enviado_en
  ) x
  where x.pendiente > 0
) pa on true
cross join lateral (
  select
    (select count(*) from compras_stock_movimientos     where item_id = i.id) as movimientos,
    (select count(distinct pedido_id) from compras_pedido_items where item_id = i.id) as pedidos,
    (select count(*) from compras_remito_items          where item_id = i.id) as remitos,
    (select count(*) from compras_factura_items         where item_id = i.id) as facturas,
    (select count(*) from compras_factura_discrepancias where item_id = i.id) as discrepancias,
    (select count(*) from compras_solicitud_items       where item_id = i.id) as solicitudes,
    (select count(*) from fabrica_conteo_items fci join fabrica_conteos c on c.id = fci.conteo_id
       where fci.item_id = i.id and c.estado <> 'borrador')                  as conteos
) u
where tiene_acceso_compras();
```

- No lee `compras_items.precio` (§1.3).
- No usa `v_compras_pedido_pendiente`: el cálculo va inline para no depender de una vista que puede cambiar en B1.
- Con 58 insumos, las subconsultas sobran. Si en prod tarda, se cambia a agregados con `group by` y se anota.
- `precio_unitario` está en la unidad de la línea de factura (puede ser kg sobre un insumo en cajas hasta A2b). Por eso la vista trae `ultimo_precio_unidad` y la UI la muestra.

### 3.11 Después de la migración

```bash
npm run types   # regenera lib/database.types.ts (solo agregados + las policies no cambian tipos)
```

## 4. Server Actions — `app/admin/compras/insumos/acciones.ts` (nuevo)

Patrón de `lib/acciones.ts`: `'use server'`, `zod`, `createClientTipado`, `refresh()` y `Resultado<T>`. La autorización la hace la RPC.

```ts
guardarInsumo({
  itemId: uuid | null,
  datos: Partial<{ nombre, unidad, categoriaId, cantidadPorUnidad, cantidadPorMasa, stockMinimo,
                   redondeo, stockMaximo, aDemanda, alicuotaIva }>,   // solo lo que cambió
  proveedores: { proveedorId, esPrincipal, activo, codigo, precioRef, precioRefAnterior }[] | null,
}): Promise<Resultado<{ itemId: string; cambios: number }>>

archivarInsumo({ itemId, archivar: boolean }):
  Promise<Resultado<{ estado: 'activo'|'archivado'; borradoresQuitados: number; listas: string[]; pedidoBase: number; stock: number }>>

eliminarInsumo({ itemId }): Promise<Resultado<{ nombre: string }>>
```

- La acción traduce de camelCase a las claves de la RPC (`categoria_id`, …) y solo manda las presentes.
- Valida con zod lo mismo que la RPC (rápido, en español) y además `nombre.trim().max(120)`, números finitos y `codigo.trim().max(60)`. La RPC sigue siendo la fuente de verdad.
- Se llama a `refresh()` también si la RPC rechaza: casi siempre es que otra persona cambió algo (igual que `resolverDiferenciasConteo`).
- El historial del insumo se lee **desde el cliente** (`select` a `compras_items_historial` con `profiles(nombre)` por `creado_por`, últimos 30, `order by creado_en desc`), al abrir el form. Es solo lectura y la RLS alcanza.

## 5. UI

### 5.0 Protocolo de diseño (es parte del DoD, A1 lo dejó como deuda)

1. **Antes de codear:** `impeccable` en modo *shape* con esta sección como insumo. La mini-spec va a `notas-A2a.md`.
2. **Construir** con `PageHeader`, `DataTable`, `EmptyState`, `Modal`, `useConfirm`, `useToasts`/`ToastStack`, `LinkEntidad`, `SegmentedControl` y `Chip` (de `components/ui/Chip`, como en `ConteosFabricaClient`), `SelectBuscador`, `InputNumero`, `HelpTooltip`, lucide y **tokens semánticos** (`bg-surface`, `text-muted`, `border-border`, `text-warning`…). Cero hex: sumá `"app/admin/compras/insumos/*.tsx"` a la regla de hex de `eslint.config.mjs`.
3. **Endurecer:** `impeccable` *harden* (doble clic, errores, textos largos, vacíos, permisos) y `emil-design-eng` (feedback inmediato, foco, números alineados con `tabular-nums`).
4. **Mirarlo:** Playwright, capturas en desktop y 375px, oscuro y claro, revisadas contra `ui-ux-pro-max` (contraste, ≥ 44px, jerarquía). Si no se corre alguna skill, se anota por qué en las notas (no se omite en silencio).

### 5.1 `insumos/page.tsx`

- `compras_items` con `compras_item_proveedores(proveedor_id, es_principal, activo, precio_ref, codigo_proveedor)` (**suma `activo`**).
- `proveedores`: **sin `.eq('maneja_stock', true)`**. Trae `id, nombre, estado` de todos. Las **opciones** del selector son solo los `activo`. Todos sirven para mostrar nombres, así un par con un proveedor archivado no queda como "—".
- `v_compras_insumos_resumen` completa, indexada por `item_id`.
- Lo de `fabrica_conteo_definicion_items` sigue igual.
- `esAdmin` (del perfil) para el texto de la columna de precio.

### 5.2 `InsumosClient.tsx` (reescritura) + `InsumoModal.tsx` (nuevo)

Renderiza desde props, sin copia local en `useState`: después de cada acción, `refresh()` trae los datos. Los filtros sí son estado local.

```
┌─ [Package] Insumos ────────────────────────────── [+ Nuevo insumo] ┐
│ 57 activos · 1 archivado                                           │
├────────────────────────────────────────────────────────────────────┤
│ ⚠ 2 insumos sin unidad de compra… (avisos que ya existen, igual)    │
│ [🔍 Buscar insumo…]  (Activos|Archivados|Todos)  [A demanda]  [✕]   │
│ (Todas) (Lácteos) (Harinas) …                                      │
├──────────────┬───────────┬─────────────┬──────────────┬───────────┬────────────────────┤
│ Insumo       │ Proveedor │ Stock       │ Pedido abierto│ Precio ref│ Última factura     │
├──────────────┼───────────┼─────────────┼──────────────┼───────────┼────────────────────┤
│ Queso barra  │ Lácteos SA│ 3,4 Caja ↗  │ P-0031 · 2   │ $54.000   │ $55.200/Caja       │
│ A demanda    │ +1        │ ⚠ bajo mín. │ +1           │           │ 28/09 · Lácteos SA │
│ Sal (gris)   │ Salinas   │ 0 Bolsa ↗   │ —            │ —         │ —                  │
│ Archivado    │           │             │              │           │                    │
└──────────────┴───────────┴─────────────┴──────────────┴───────────┴────────────────────┘
   columnas xl: Cant./masa · Stock mín. · Redondeo · Listas de conteo
```

**Columnas** (`DataTable`, `filaKey = id`, `onFilaClick` → abre el form):

| Columna | Contenido | Orden | Breakpoint |
|---|---|---|---|
| **Insumo** | Nombre (texto, **ya no es link**, E12) + chips "A demanda · tope N" (como hoy) y "Archivado" (gris). En mobile, debajo, la categoría en `text-muted`. | nombre | siempre |
| Categoría | nombre | sí | `xl` |
| **Proveedor** | principal + "+N" (solo activos) | nombre | `md` |
| **Stock** | `LinkEntidad tipo insumo variante texto` con "3,4 Caja" (`formatearNumero` + unidad, `tabular-nums`). Si `stock < stock_minimo` y `stock_minimo > 0`: ícono `TriangleAlert` + "bajo mín." en `text-warning`. Sin permiso de `compras-stock`, `LinkEntidad` lo muestra como texto. | stock | siempre |
| **Pedido abierto** | `LinkEntidad tipo pedido variante codigo` con `P-0031` y al lado "faltan 2" en `text-muted`. Si hay más, "+N" con `title` que lista los otros códigos. "—" si no hay. | cantidad de pedidos | `lg` |
| **Precio ref.** | `precio_ref_principal` con `formatearMoneda` y `HelpTooltip` en el header: "Precio de referencia del proveedor principal. Lo actualiza la factura al confirmarla, o lo cargás en el insumo." | valor | `md` |
| **Última factura** | Admin: "$55.200 / Caja" y abajo "28/09 · Lácteos SA" (`text-muted`, link a la factura con `LinkEntidad tipo factura`). Si la unidad de la factura es distinta de la del insumo, la unidad va resaltada (`text-warning`, `title`: "Facturado en kg: el insumo se cuenta en Caja"). No admin: la columna no se muestra. | fecha | `lg` |
| Cant./masa, Stock mín. (con su `HelpTooltip`), Redondeo, Listas de conteo | como hoy | — | `xl` |

- **Sin columna Acciones**: archivar, reactivar y eliminar están en el pie del form (E12).
- **Filtros:** búsqueda (`SearchInput`), `SegmentedControl` Activos / Archivados / Todos, el toggle "A demanda", chips de categoría y `ClearFiltersButton`. Igual que hoy, con tokens.
- **Vacíos** (`EmptyState`): "Todavía no hay insumos" con la acción "Nuevo insumo"; "Ningún insumo coincide con la búsqueda" con "Limpiar filtros".
- **Fila archivada:** `opacity-60`, chip "Archivado".

**Form (`InsumoModal`, `Modal size="xl"`, `pantallaCompletaMobile`)**

```
┌ Editar — Queso barra ─────────────────────────────── [✕] ┐
│ Nombre *                                                 │
│ Proveedores *                                    (?)     │
│  ★ [Lácteos SA        ▾] [Cód. ] [$ 54.000] [🗑]          │
│  ☆ [Quesera Norte     ▾] [Cód. ] [$      ] [🗑]          │
│  + Agregar proveedor                                     │
│  ▸ Proveedores anteriores (1): Lácteos Viejos · Volver a usar │
│ Categoría · Unidad de compra · Cantidad por unidad      │
│ Cantidad por masa · Stock mínimo · IVA · Redondeo        │
│ [ ] Se pide a demanda  (+ stock máximo)                  │
│ ▸ Cambios (12) — Admin QA, 05/10 18:42: Stock mínimo 4 → 6 │
├──────────────────────────────────────────────────────────┤
│ [Archivar]  [Eliminar]                [Cancelar] [Guardar]│
└──────────────────────────────────────────────────────────┘
```

- **Sale el campo Precio** (legacy). Nada lo reemplaza en el form: el precio vive en cada proveedor (`precio_ref`) y en las facturas.
- **Proveedores:** la estrella marca el principal (`aria-pressed`, ≥ 44px). El tachito (ícono `Trash2`, no "✕") quita la línea del form; al guardar, la RPC decide si desactiva o borra (E4). Si la línea era un par existente con historia, el tachito tiene `title`: "Se va a desactivar: tiene pedidos o facturas con este proveedor".
- **"Proveedores anteriores"** (`Collapsible`, solo si hay pares inactivos): nombre, último `precio_ref` y "Volver a usar" (pasa la línea a la lista activa).
- **Precio ref.:** el input guarda el valor con el que se abrió el form (`precioRefAnterior`). Si la RPC rechaza por conflicto (E2), toast con el mensaje y `refresh()`. El form queda abierto para que el usuario vea el valor nuevo después de reabrirlo.
- **"Cambios"** (`Collapsible`, cerrado por default, solo al editar): últimos 30 cambios agrupados por `lote`. Cada lote es "Quién · dd/mm hh:mm" con sus líneas: "Stock mínimo: 4 → 6", "Precio ref. de Lácteos SA: $50.000 → $54.000", "Agregó a Quesera Norte", "Archivó el insumo". Si no hay filas (insumos anteriores a A2a): "Sin cambios registrados todavía (el historial empieza el 05/10)".
- **Guardar:** arma el diff contra lo cargado. Si no cambió nada, cierra con el toast "No había cambios" sin llamar a la acción. `useTransition`, botón deshabilitado con spinner mientras guarda (sin doble envío). Éxito → toast "Insumo creado" / "Cambios guardados" y cierra.
- **Pie, a la izquierda** (solo al editar):
  - **Archivar** (secundario, ícono `Archive`) o **Reactivar** (`ArchiveRestore`).
  - **Eliminar** (peligro, ícono `Trash2`), **solo si `puede_eliminar`**.
- **Confirm de Archivar** (`useConfirm`, no peligroso). Arma el mensaje con lo que ya trae la página y solo incluye lo que aplica:
  > Queso barra deja de aparecer en pedidos, remitos, facturas y conteos nuevos. No se borra nada: sus movimientos, pedidos y facturas quedan.
  > · No se va a contar en Global (queda guardado en la lista: si lo reactivás, vuelve).
  > · No entra en el pedido base.
  > · Tiene **3,4 Caja** en stock. Si ya no hay, ajustalo a 0 en Stock.
  > · **P-0031** todavía espera 2 Caja: ese remito se va a poder cargar igual.

  Éxito: toast "Insumo archivado" (y ", se sacó de 1 conteo en curso" si `borradoresQuitados > 0`).
- **Reactivar:** sin confirm. Toast "Insumo reactivado: vuelve a sus listas de conteo y al pedido base".
- **Confirm de Eliminar** (peligroso): "¿Eliminar Sal fina? No tiene movimientos, pedidos ni facturas. También sale de: Global y el pedido base. No se puede deshacer." Si la RPC rechaza (alguien lo usó mientras tanto), toast con su mensaje y `refresh()`.
- **`?insumo=` en Insumos:** no se agrega (la ficha conectada es de A2c).

### 5.3 Listas de conteo y Pedido base (mínimo)

- `listas-conteo/page.tsx`: trae también los insumos archivados (para resolver el nombre). En `ConteosClient`, una membresía de un archivado se muestra con el chip "Archivado · no se cuenta". El selector para **agregar** insumos sigue mostrando solo activos.
- `pedidos/base/page.tsx`: lo mismo. En `PedidoBaseClient`, una línea de un archivado lleva el chip "Insumo archivado · no entra al pedido base". No cambia nada más del archivo (el ABM sigue en el navegador hasta F9).

### 5.4 Fábrica y Stock

- `app/fabrica/stock/page.tsx`: la siembra del borrador toma solo insumos activos. Usá `compras_items!inner(...)` con `.eq('compras_items.estado', 'activo')`, o filtrá en JS por un `estado` traído en el embed.
- `stock/page.tsx` + `StockClient.tsx`: traen activos y archivados. La lista muestra los archivados **solo si `stock ≠ 0`**, con el chip "Archivado". El deep link `?insumo=` abre la ficha de cualquiera.
- `stock/historico/page.tsx`: trae también los archivados, así el `?insumo=` de uno archivado entra. El selector los muestra al final con "(archivado)".

### 5.5 Proveedores (C2, solo el texto)

`ProveedoresClient.tsx:368-378`: el label pasa a **"Sugerir cantidades al pedir"**, con la descripción "Al crear un pedido a este proveedor, arranca con lo que falta para llegar al stock mínimo de cada insumo." en `text-muted`. Sin cambios de lógica ni de estilo del resto (la pantalla es de B3).

## 6. Casos borde

| Caso | Qué pasa |
|---|---|
| Una factura actualiza `precio_ref` mientras alguien tiene el form abierto y no toca el precio | Se guarda todo lo demás. El precio de la factura queda (E2). |
| Lo mismo, pero el usuario **sí** cambió el precio | La RPC rechaza: "El precio de referencia de Lácteos SA cambió mientras editabas (ahora 55200)…". No se guarda nada (todo es una transacción). |
| Dos personas editan campos distintos del mismo insumo | Se guardan las dos (cada una manda su diff). Con el mismo campo, gana la última y el historial muestra las dos. |
| Se quita el único proveedor activo | "El insumo necesita al menos un proveedor activo." |
| Se quita el principal | El front pasa la estrella al primero que queda (como hoy). La RPC exige uno. |
| Proveedor archivado ya asociado | Aparece con su nombre y "(archivado)". Se puede dejar o quitar, pero no se lo puede elegir para una línea nueva ni "volver a usar". |
| Crear un insumo con el nombre de uno archivado | "…reactivalo en lugar de crear otro." |
| Archivar un insumo con diferencias de conteo pendientes | Se archiva igual. Las diferencias se siguen pudiendo aplicar desde Conteos (mueven stock de un archivado, que se ve en Stock porque queda ≠ 0). |
| Archivar mientras Fábrica cuenta ese insumo | Su guardado falla con "Recargá la página", y al recargar ya no está. Lo contado en el borrador se pierde (se avisa en el toast con `borradoresQuitados`). |
| Solicitud abierta con una línea del archivado | Se convierte igual (es de B1, no se toca). Queda en las notas. |
| Eliminar desde dos pestañas | La segunda: "No encontramos el insumo. Recargá la página." |
| `DELETE` directo a `compras_items` de un insumo con movimientos (SQL, como postgres) | Falla por la FK `RESTRICT`. |
| Usuario con un módulo de Compras pero sin `compras-insumos` (por ejemplo, solo `compras-reportes`) | No ve la pantalla, pero `tiene_acceso_compras()` lo deja llamar la RPC por POST. Es el modelo vigente para todo Compras (granularidad por módulo: F9). Se anota, no se arregla acá. |
| Precio facturado en kg sobre un insumo en cajas | Se muestra con su unidad resaltada. El arreglo de fondo es A2b. |

## 7. Archivos

**En alcance**
- `supabase/migrations/20261005150000_compras_insumos_base.sql` (nuevo)
- `supabase/migrations/20261005160000_compras_permisos_conteos.sql` (nuevo, **solo si el usuario aprueba §8**)
- `lib/database.types.ts` (regenerado)
- `app/admin/compras/insumos/page.tsx`, `InsumosClient.tsx`, `InsumoModal.tsx` (nuevo), `acciones.ts` (nuevo)
- `app/admin/compras/insumos/listas-conteo/page.tsx`, `ConteosClient.tsx` (chip y nombres de archivados)
- `app/admin/compras/pedidos/base/page.tsx`, `PedidoBaseClient.tsx` (chip)
- `app/fabrica/stock/page.tsx` (siembra)
- `app/admin/compras/stock/page.tsx`, `StockClient.tsx`, `historico/page.tsx` (archivados)
- `app/admin/proveedores/ProveedoresClient.tsx` (solo el label)
- `eslint.config.mjs` (regla de hex)
- `docs/bloque2/notas-A2a.md` (nuevo)
- Si se aprueba §8: `lib/modulos.tsx`, `app/api/fabrica/solicitudes/notificar/route.ts`, `app/admin/fabrica/conteos/page.tsx`, `ConteosFabricaClient.tsx` y `DiferenciasConteo.tsx`

**Fuera de alcance (no tocar)**
- Lo de B1: pedidos (`PedidoEditor`, `PedidoDetalle`, `pedidos/acciones.ts`, `pedidos/datos.ts`), `compras_guardar_pedido` y las demás funciones de pedido, `convertir_solicitud_a_pedidos`, `v_compras_pedido_eventos`, `v_compras_pedido_pendiente`.
- Lo de A2b: `compras_confirmar_factura` (ni para auditar `precio_ref`), `compras_guardar_remito`, remitos, facturas y unidades.
- Lo de A2c: `v_compras_stock_movimientos`, `StockFicha` (salvo lo que requiera el chip de archivado) y la ficha conectada.
- Lo de B3: `proveedores` (columnas, `local`, archivar, FK de gastos), el resto de `ProveedoresClient`, la FK `compras_item_proveedores.proveedor_id ON DELETE CASCADE` (borrar un proveedor se lleva sus pares: va con el archivar proveedores de B3).
- `compras_items.precio` y `v_compras_items`: no se borran (F9).
- El manual (`/ayuda`): se anotan los cambios en las notas.
- Los untracked que no son tuyos (`Excalidraw/`, `docs/roadmap-marcos.html`, `docs/avances-*`, `docs/entregas/2026-10-01-*`).

## 8. Opcional — PENDIENTE DE APROBACIÓN DEL USUARIO: `fabrica-conteos` fuera de `tiene_acceso_compras()`

> No se implementa hasta que el usuario lo apruebe. Va en su propia migración, para poder aplicarla o no sin tocar el resto de A2a.

### 8.1 El problema

`20260914120000` sumó `fabrica-conteos` a `tiene_acceso_compras()` para que la vista del historial siguiera pasando. Con eso, un perfil que **solo** tiene el módulo Conteos (sin ningún `compras-*`) puede ejecutar por POST todo esto:

- **17 RPCs `security definer`:**
  - stock: `compras_ajustar_stock`, `compras_revertir_movimiento`, `compras_resolver_diferencias_conteo`;
  - remitos: `compras_guardar_remito`, `compras_eliminar_remito`;
  - pedidos: `compras_guardar_pedido`, `compras_eliminar_pedido`, `compras_marcar_pedido_enviado`, `compras_cerrar_pedido_manual`, `compras_reabrir_pedido`, `compras_guardar_mensaje_pedido`, `compras_recalcular_estado_pedido`;
  - solicitudes: `convertir_solicitud_a_pedidos`, `descartar_solicitud`, `generar_solicitud_base`, `compras_sugerencias_sobrestock`, `reordenar_plantilla_base`;
  - y, desde A2a, `compras_guardar_insumo`, `compras_archivar_insumo` y `compras_eliminar_insumo`.
- **Escritura directa (RLS `ALL`)** en `compras_remitos`, `compras_remito_items`, `compras_categorias`, `compras_solicitudes`, `compras_solicitud_items`, `compras_plantilla_base`, más el alta, modificación y baja de `fabrica_conteo_definiciones` y `fabrica_conteo_definicion_items`.
- **Lectura** de `compras_pedidos`, `compras_pedido_items`, `compras_pedido_eventos`, `compras_pedidos_eliminados`, `compras_plantillas_mensaje`, `locales_facturacion`, `proveedores` y las vistas `v_compras_pedido_pendiente`, `v_compras_pedido_eventos`, `v_compras_pedidos_eliminados`, `v_compras_stock_actual` y `v_compras_stock_movimientos`.

### 8.2 El arreglo — `supabase/migrations/20261005160000_compras_permisos_conteos.sql`

1. **Función de lectura nueva:**

   ```sql
   create or replace function public.tiene_lectura_conteos() returns boolean
   language sql stable security definer set search_path = public as $$
     select tiene_acceso_compras() or tiene_acceso_fabrica() or exists (
       select 1 from profiles
       where id = auth.uid() and estado = 'activo' and 'fabrica-conteos' = any(modulos_permitidos)
     );
   $$;
   ```

2. **`tiene_acceso_compras()`** vuelve a `{compras-insumos, compras-stock, compras-pedidos, compras-reportes}` (sin `fabrica-conteos`).
3. **Lo que necesita la pantalla de Conteos pasa a `tiene_lectura_conteos()`:**
   - `v_compras_conteos_historial`: el `where` y los dos `case` de `diferencias_pendientes` y `diferencias_resueltas`. Partí del cuerpo de `20261005130000`, con las mismas columnas en el mismo orden.
   - `v_fabrica_conteo_diferencias`: el `where`. Partí del cuerpo de `20261005130000`.
   - Policies `fabrica_conteos_lectura` y `fabrica_conteo_items_lectura` (hoy `fabrica or compras`).
   - Policy `compras_items_lectura` (la de §3.4): la pantalla embebe `compras_items(nombre, unidad)` en `fabrica_conteo_items`.
   - Policy `compras_config_lectura`: se lee el umbral `conteo.diferencia_resaltar_pct`.
4. **Front:**
   - `MODULOS_COMPRAS` (hoy en `notificar/route.ts:11`) se mueve a `lib/modulos.tsx` junto con `tieneAccesoCompras(rol, modulos)`, que replica la función SQL. `notificar/route.ts` lo importa.
   - `admin/fabrica/conteos/page.tsx` calcula `puedeResolver` con el perfil y lo pasa a `ConteosFabricaClient` → `DiferenciasConteo`. Sin permiso, la pestaña "Diferencias con el stock" se ve igual, pero sin Aplicar / Ignorar / Revertir / Aplicar todas, y con la nota "Las diferencias las aplica Compras."

### 8.3 Quién pierde qué

| Perfil | Antes | Después |
|---|---|---|
| `admin` | todo | igual |
| Con algún `compras-*` (con o sin `fabrica-conteos`) | todo Compras | igual |
| `supervisor_fabrica` | lo de `tiene_acceso_fabrica()` | igual (no tiene `fabrica-conteos` y no usa la pantalla de admin) |
| **Solo `fabrica-conteos`** (sin ningún `compras-*`) | todo lo de §8.1 | Ve los conteos, sus diferencias y su historial. **Pierde** todo §8.1, incluido **Aplicar / Ignorar / Revertir** diferencias (que mueven stock). |

- **En dev nadie pierde nada:** todos los perfiles con `fabrica-conteos` tienen también `compras-insumos`, `compras-pedidos` y `compras-stock` (consultado el 2026-10-05).
- **Prod no se leyó.** El día de la release, el usuario puede correr esto para saber a quién afecta:

  ```sql
  select email, rol, modulos_permitidos from profiles
  where estado = 'activo' and rol <> 'admin' and 'fabrica-conteos' = any(modulos_permitidos)
    and not modulos_permitidos && array['compras-insumos','compras-stock','compras-pedidos','compras-reportes'];
  ```

### 8.4 Escenarios extra (si se aprueba)

Dentro de la transacción revertida, se le dejan a `qa-coordinador` solo `{fabrica-conteos}`:
- **P1:** la pantalla lee `v_compras_conteos_historial` (con los contadores), `v_fabrica_conteo_diferencias` (filas) y `fabrica_conteo_items` con `compras_items(nombre)` no nulo.
- **P2:** `compras_resolver_diferencias_conteo`, `compras_ajustar_stock` y `compras_guardar_insumo` dan "No autorizado". `v_compras_pedido_pendiente` devuelve 0 filas.
- **P3:** `qa-admin` y un perfil con `compras-stock` siguen resolviendo. `qa-fabrica` sigue guardando cantidades y cerrando.

## 9. Criterios de aceptación

1. En Insumos, el selector de proveedor ofrece **todos los proveedores activos**, tengan o no "Sugerir cantidades al pedir".
2. Guardar un insumo **no borra ni reinserta** sus pares: los `id` y `created_at` de `compras_item_proveedores` se conservan, `activo` no se resetea y un `precio_ref` que cambió una factura no se pisa.
3. Toda creación, edición, archivado y reactivación deja filas en `compras_items_historial` con campo, anterior, nuevo, quién y cuándo, y el form las muestra en "Cambios".
4. Desde el navegador no se puede escribir `compras_items` ni `compras_item_proveedores` (ni como admin ni como Fábrica).
5. Un insumo con historia no se puede eliminar (ni por la UI ni por la RPC), y el `DELETE` directo choca con la FK `RESTRICT`. Uno sin historia se elimina con su configuración.
6. Un archivado no se siembra en conteos nuevos, no entra al pedido base generado, no se ofrece en pedidos, remitos ni facturas nuevos, y vuelve a todo eso al reactivarlo. Su stock y su historial se siguen viendo en Stock.
7. La tabla muestra Stock (con link a la ficha y aviso de bajo mínimo), Pedido abierto (con link), Precio ref. del principal y, para admin, Última factura con fecha y unidad. Ya no hay columna ni campo Precio.
8. Proveedores muestra "Sugerir cantidades al pedir", y la autosugerencia de `PedidoEditor` se comporta igual que antes.
9. La migración corre limpia en dev, con los `raise notice` revisados, y el invariante del ledger queda en 0.
10. `npm run build` sin errores, lint limpio en los archivos tocados, cero hex en `insumos/*.tsx` y cero `as any` nuevos.
11. Pantallas revisadas a 375px y en desktop, en oscuro y claro, con el protocolo de §5.0.
12. (Si se aprueba §8) Los escenarios P1–P3 dan OK.

## 10. Verificación

### 10.1 Antes de la migración

```bash
cat supabase/.temp/project-ref   # tiene que dar fafckqysyvtlslfnpzrh
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select count(*) from compras_stock_actual a where a.cantidad <> (select coalesce(sum(delta),0) from compras_stock_movimientos m where m.item_id = a.item_id)"
# Tiene que dar 0 (A1 lo dejó en 0).
```

### 10.2 Escenarios SQL (dev, transacción que se revierte sola)

Es el patrón de A1 (`plan-A1.md` §9.2): un archivo con la migración entera y después un `do $$ … $$` que termina con `raise exception 'RESULTADO: %', <jsonb>`. El `raise` deshace todo. Se corre con:

```bash
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <archivo>
```

Para simular la sesión se usa `set_config('request.jwt.claims', …)` + `set_config('role', 'authenticated', true)`. Los uuid salen de `select id, email from auth.users where email like 'qa-%'`.

| # | Como | Caso | Esperado |
|---|---|---|---|
| S1 | qa-admin | Crear "QA A2a Insumo" con 2 proveedores (uno principal, con `precio_ref` 100) | 1 insumo, 2 pares, historial `creado` + 2 `proveedor` + 1 `proveedor.precio_ref`. `cambios = 4`. |
| S2 | qa-admin | Editar mandando solo `{stock_minimo: 6}` | Solo cambia `stock_minimo`, 1 fila de historial, pares intactos (mismos `id`). |
| S3 | postgres → qa-admin | Simular la factura (`update … set precio_ref = 120`) y guardar el insumo con `precio_ref = precio_ref_anterior = 100` | Queda 120 y no hay historial de precio. |
| S4 | qa-admin | Igual que S3, pero con `precio_ref = 130, precio_ref_anterior = 100` | Error "cambió mientras editabas (ahora 120)". Nada guardado. |
| S5 | postgres → qa-admin | Par con `activo = false` y guardar el insumo enviándolo así | Sigue `false`, con el mismo `id` y `created_at`. |
| S6 | qa-admin | Quitar un proveedor **con** historia (un insumo real con pedidos) y uno **sin** historia (el de S1) | El primero queda `activo = false` (`proveedor.activo`) y el segundo se borra (`proveedor` → null). |
| S7 | qa-admin | Errores: dos principales; principal inactivo; cero activos; repetido; clave `precio`; nombre duplicado en otra caja | Los 6 mensajes de §3.6. |
| S8 | qa-admin | Archivar un insumo de Global con un borrador de Global abierto | `estado = archivado`; sin fila en el borrador; `fabrica_conteo_definicion_items` intacto; la respuesta trae `listas` y `stock`. |
| S9 | qa-admin | Con S8 hecho (y la solicitud base abierta descartada como postgres, si la hay), `generar_solicitud_base()` | La solicitud no tiene línea de ese insumo. |
| S10 | qa-admin | Reactivar | `estado = activo` e historial `estado`. |
| S11 | qa-admin | `compras_eliminar_insumo` sobre uno con movimientos | Error con los conteos ("tiene N movimientos de stock y …"). Sobre el de S1: se borra sin dejar filas en ninguna tabla. |
| S12 | postgres | `delete from compras_items where id = <con movimientos>` | `foreign_key_violation`. |
| S13 | qa-admin y qa-fabrica | `update compras_items set nombre = 'x'` / `insert into compras_item_proveedores` / `select` de las dos tablas | 0 filas / error de RLS / el `select` funciona. |
| S14 | qa-admin y qa-coordinador | `v_compras_insumos_resumen` de un insumo con factura confirmada y pedido enviado | `stock` = `compras_stock_actual`; `pedidos_abiertos` coincide con `v_compras_pedido_pendiente` sumado por pedido; `ultimo_precio` presente para admin y `null` para coordinador. |
| S15 | un perfil sin Compras (por ejemplo, `qa-local`) | Las tres RPCs y la vista | "No autorizado" y 0 filas. |
| S16 | — | Invariante del ledger al final | 0. |

### 10.3 Build y lint

```bash
npm run types && npx tsc --noEmit && npx eslint <archivos tocados> && npm run build
```

### 10.4 QA en el navegador (local contra dev)

- `npm run dev -- -p 3005` **desde PowerShell**. Las cuentas son `qa-admin` y `qa-coordinador` (sin `es_admin`), y la contraseña está en `C:\Dev\Trabajo\4peeq\YA!Chipacitos\docs\qa-credenciales-dev.md` (no se copia).
- **Recorrido:**
  1. Insumos carga con las columnas nuevas y Precio ya no está. Con coordinador, no hay columna Última factura.
  2. Nuevo insumo con un proveedor que en prod no tendría `maneja_stock`. Guardar y ver "Cambios".
  3. Editar solo el stock mínimo. En la base, los pares tienen el mismo `id`.
  4. Conflicto de precio: abrir el form, cambiar `precio_ref` en dev por SQL y guardar otro precio → toast de conflicto.
  5. Quitar un proveedor con historia: aparece en "Proveedores anteriores" y "Volver a usar" funciona.
  6. Archivar el insumo del paso 2 desde el form: confirm con lo que aplica, toast, y la fila queda gris con "Archivados".
  7. Archivar un insumo de Global: Fábrica (`qa-fabrica`, 375px) ya no lo ve en el borrador, y Listas de conteo lo muestra con "Archivado · no se cuenta". Reactivar → vuelve.
  8. Eliminar: el botón aparece solo en el insumo sin historia.
  9. Links: Stock → ficha; P-xxxx → pedido; fecha de la última factura → factura.
  10. Proveedores: el checkbox dice "Sugerir cantidades al pedir".
  11. Capturas a 375px y en desktop, oscuro y claro, de Insumos y del form.
- Al terminar: insumos de QA archivados o eliminados, invariante en 0 y lo que queda en dev anotado en `notas-A2a.md`.

## 11. Commits y cierre

1. `feat(compras): insumos por RPC con historial, archivar en vez de borrar (A2a)`: la migración y los tipos. La rama se pushea **después** del `db push` autorizado por el coordinador.
2. `feat(compras): tabla de insumos con stock, pedido abierto y precios (A2a)`: la UI.
3. (Si se aprueba) `fix(seguridad): fabrica-conteos solo lee conteos (A2a)`: la migración `160000` y el front de §8.2.

Notas en `docs/bloque2/notas-A2a.md`: lo hecho, desvíos, los `raise notice` de la migración, los datos que quedan en dev, lo que cambiaría en el manual (`compras-insumos`: archivar/eliminar, precios, "Cambios"; `proveedores`: el nuevo nombre del checkbox) y la lista de pruebas.

## 12. Lista de pruebas para el usuario

Se pasa recién **cuando el coordinador haya mergeado a `qa`**. En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`:

1. **Compras › Insumos.** → La tabla tiene Stock, Pedido abierto, Precio ref. y Última factura. Ya no está la columna Precio.
2. **Nuevo insumo.** → El selector de proveedor lista todos los proveedores activos, no solo algunos. Crear uno de prueba con dos proveedores y la estrella en uno.
3. **Tocar la fila del insumo** (no hay lápiz). → Se abre el form. Abajo, en "Cambios", figura que lo creaste.
4. **Cambiar solo el stock mínimo y guardar.** → Toast "Cambios guardados", y en "Cambios" aparece "Stock mínimo: 0 → N".
5. **Abrir un insumo que tenga facturas** (por ejemplo, el de una factura confirmada de septiembre), cambiar algo que no sea el precio y guardar. → El Precio ref. sigue siendo el de la última factura.
6. **En la fila de ese insumo.** → "Última factura" muestra el precio con su unidad y la fecha. La fecha lleva a la factura.
7. **Tocar el stock de un insumo.** → Abre su ficha en Stock. Si está por debajo del mínimo, dice "bajo mín." en ámbar.
8. **Un insumo con un pedido enviado y sin recibir.** → "Pedido abierto" muestra P-xxxx y cuánto falta. El código abre el pedido.
9. **En el form, quitar (tachito) un proveedor que ya tuvo pedidos y guardar.** → Pasa a "Proveedores anteriores". "Volver a usar" lo trae de nuevo.
10. **Archivar el insumo de prueba.** → El aviso dice qué deja de pasar. La fila queda gris y sale de "Activos".
11. **Archivar un insumo que esté en la lista Global.** → El aviso dice que no se va a contar. Con `qa-fabrica`, en Fábrica › Stock, ese insumo ya no está en Global. En Insumos › Listas de conteo sigue, con "Archivado · no se cuenta". Reactivarlo → vuelve a aparecer en Fábrica.
12. **Eliminar.** → Solo el insumo de prueba (sin historia) tiene el botón Eliminar. Los que tienen movimientos, pedidos o facturas solo se pueden archivar.
13. **Proveedores › editar un proveedor.** → El checkbox se llama "Sugerir cantidades al pedir".
14. **Con `qa-coordinador@chipacitos.test`.** → En Insumos no aparece "Última factura" (las facturas son solo de admin). Lo demás, igual.
15. **Celular (375px) y tema claro.** → La tabla se lee, el form entra en pantalla y los botones se tocan sin zoom.

## 13. Decisiones que necesitan al usuario

| # | Pregunta | Recomendación |
|---|---|---|
| **D1** | El **último precio facturado** en Insumos, ¿lo ve solo admin (como las facturas) o todos los que entran a Insumos? | **Solo admin.** Es coherente con que Facturas es solo admin. Los demás siguen viendo el precio de referencia. |
| **D2** | Archivar un insumo que todavía **tiene stock o un pedido sin recibir**: ¿se avisa o se bloquea? | **Se avisa y se deja.** El remito se carga igual, y el stock se ajusta a 0 a mano si ya no hay. |
| **D3** | Al **quitar un proveedor** de un insumo: si ya tuvo pedidos o facturas con ese proveedor, ¿se desactiva (queda en "Proveedores anteriores" con su precio) o se borra? | **Se desactiva** si tiene historia y se borra si no tiene. Así no se pierde el precio ni la trazabilidad. |
| **D4** | **Seguridad (§8, opcional):** ¿se saca `fabrica-conteos` de `tiene_acceso_compras()`? Quien tenga **solo** Conteos va a ver las diferencias, pero no va a poder aplicarlas, y pierde el acceso por la puerta de atrás a todo Compras. | **Sí, en esta fase.** Es una migración chica y separada, y en dev no le saca nada a nadie. Antes de la release, correr la consulta de §8.3 en prod. |

Decisiones locales que se tomaron sin preguntar (se pueden revertir fácil): el link a Stock pasa del nombre a la celda Stock y la fila abre el form (E12); archivar no borra la configuración de listas ni de pedido base (E6); la vista nueva calcula el pedido abierto inline (§3.10).
