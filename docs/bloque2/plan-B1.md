# B1 — Historial real de pedidos + solicitud ↔ pedido (especificación ejecutable)

> Planificador: agente `00da9940`, 2026-10-05. Rama `bloque2/pedidos`, rebaseada sobre `origin/qa` (`f247bc8`, con B0).
> Plan maestro: `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md` (fase B1, "Conexión del circuito", tabla de dueños).
> El Ejecutor implementa **esto** sin improvisar. Si la realidad no encaja, frena y avisa al coordinador.

**Reglas que no se negocian:**
- Solo dev (`fafckqysyvtlslfnpzrh`) y QA. **Prod no se toca, ni para leer.** Nunca `supabase link`. Siempre `--project-ref` explícito.
- Cero triggers. La tabla de eventos la escriben solo las RPC.
- **La migración no se pushea hasta que A1 esté mergeado en `qa`** (si no, el CLI rechaza la versión). Mientras tanto se prueba entera en una transacción que se revierte (§9.2). Antes del push: `git fetch && git rebase origin/qa`, OK del coordinador, un solo push a la vez.

---

## 0. Qué cambia, en una línea

Cada cosa que se le hace a un pedido (crearlo, editar sus ítems, cambiarle proveedor o local, generar el mensaje, enviarlo, **reenviarlo**, cerrarlo y reabrirlo **cada vez**) queda como una fila en `compras_pedido_eventos`, con un diff en `jsonb`. El detalle del pedido muestra ese historial en texto legible ("Editó ítems: Queso 40 → 45 kg; agregó Sal 2 Bolsa"), agrupado por usuario cada 5 minutos y con links. Además, los pedidos que salen de una solicitud recuerdan de qué línea de la solicitud vino cada ítem y nacen con su local de facturación.

## 1. Relevamiento del código vigente

| Objeto | Cuerpo vigente | Qué hace hoy | Qué le falta |
|---|---|---|---|
| `compras_guardar_pedido(uuid, uuid, uuid, jsonb) → jsonb` | `20260924200000:215-337` (no se redefinió después) | Alta o edición. Actualiza líneas por id, borra las que no vienen, inserta las nuevas. Bloquea facturado, cerrado/devuelto y cambio de proveedor después de enviado. **Siempre** pone `mensaje = null` y **siempre** pisa `local_facturacion_id` con el parámetro | No registra nada. Borra el mensaje aunque no haya cambios |
| `compras_marcar_pedido_enviado(uuid)` | `20260924200000:339-370` | Pone `enviado_en/por`. Si ya estaba enviado, `return` silencioso (doble clic) | No hay reenvío en la base: "Reenviar mensaje" (`PedidoDetalle.tsx:149`) abre `PedidoEnvio`, que para un pedido ya enviado solo ofrece Copiar / WhatsApp / "Listo" sin llamar a nada |
| `compras_cerrar_pedido_manual(uuid, text)` | `20260924200000:372-409` | Pone `cerrado_manual`, motivo, `cerrado_manual_por/en` | Solo queda el último cierre |
| `compras_reabrir_pedido(uuid)` | `20260924200000:411-441` | Vuelve a `enviado` + recálculo, pone `reabierto_por/en`. No borra el cierre | Solo queda la última reapertura |
| `convertir_solicitud_a_pedidos(uuid) → integer` | `20260903120000:169-215` | Un pedido por proveedor, líneas con el orden de la solicitud | No guarda `solicitud_item_id`, no completa `local_facturacion_id`, **no tiene `set search_path`** |
| `guardarMensaje` | `app/admin/compras/pedidos/acciones.ts:58-79` | `update` directo de `mensaje` y `local_facturacion_id` desde la server action, con la sesión del usuario | Sin auditoría, y deja cambiar el local de un pedido facturado |
| `v_compras_pedido_eventos` | `20260929120000:1101-1145` | Union de columnas "última vez": creado, enviado, remito (de `compras_remitos`), cerrado, reabierto + factura, factura_anulada, diferencia (solo admin). `detalle` es `text` (`'<resolucion>\|<insumo>'` en diferencias) | Todo lo de arriba |
| RLS `compras_pedidos`, `compras_pedido_items` | `20260804150000:36-42` | `for all using (tiene_acceso_compras())`: cualquiera con acceso a compras (incluye el módulo `fabrica-conteos`) puede hacer `update` directo por PostgREST | Hace que cualquier bloqueo en RPC sea esquivable |
| `compras_eliminar_pedido` | `20260928120000:64-110` | Solo sin enviar; guarda líneas en `compras_pedidos_eliminados` | (no se toca) |

**Consumidores de la vista:** `page.tsx:41` (`select('*').order('fecha')`, todos los pedidos), `datos.ts:58` (tipo `EventoPedido`), `modelo.ts` (agrupa por pedido), `PedidoDetalle.tsx:28-59,137-138,374-398` (render), `lib/compras/diferencias.ts:158` (`leerEventoDiferencia`, parsea el texto `res|insumo`) y su chequeo `lib/compras/_check_diferencias.ts`. Ninguna otra vista ni función SQL depende de ella.

**Patrones que se reusan:**
- `compras_pedidos_eliminados` (`20260928120000`): tabla con RLS de **solo lectura** y escritura únicamente desde una RPC `security definer`. Es exactamente el patrón de la tabla nueva.
- Ledger de stock: append-only, con quién y cuándo, sin update ni delete.
- `tarea_historial`: campo / valor anterior / valor nuevo. Acá el "anterior/nuevo" va dentro del `jsonb` (`de`/`a`, `antes`).
- Chequeos puros en TS: `npx tsx lib/compras/_check_*.ts`.

**Datos en dev hoy** (consulta de solo lectura del 2026-10-05): 24 pedidos, 18 enviados, 4 cerrados a mano (1 sin autor: el cierre de la migración F2), 2 reabiertos (los dos después de su cierre), 17 de solicitud con 80 líneas: **las 80 tienen un único candidato** en la solicitud (mismo proveedor e insumo). 11 pedidos de solicitud sin local. La tabla nueva no existe.

**A1 no choca:** su migración (`20261005120000`) redefine `cerrar_conteo_fabrica`, `descartar_solicitud` y otras de conteo, ninguna de pedidos. El Ejecutor lo vuelve a confirmar después del rebase con `grep -n "pedido" supabase/migrations/20261005*.sql`.

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §12)

| # | Decisión | Por qué |
|---|---|---|
| E1 | Un **helper interno** `compras_registrar_evento_pedido` es el único que inserta en la tabla y, en la misma pasada, pone `actualizado_en/por` en el pedido. Sin `execute` para `authenticated`: solo lo llaman otras funciones `security definer` (B1 hoy, A2b después) | Un solo lugar para el formato, la hora y la autoría |
| E2 | Hora del evento = `clock_timestamp()`, no `now()` | Varias filas de la misma RPC (ej.: ítems + proveedor) quedan ordenadas y no empatadas |
| E3 | Un evento **por tipo** (no un "editado" gigante): `items_editados`, `proveedor_cambiado`, `local_cambiado`, `mensaje`… La UI los agrupa | Consultable por tipo (B3, reportes) y simple de renderizar |
| E4 | Diff de líneas **por `pedido_item_id`**, calculado en SQL con una foto antes y después (`compras_lineas_pedido_snapshot` + `compras_diff_lineas`). El cambio de **orden** solo no es evento | La RPC ya actualiza por id; la foto sale gratis y el diff es una función pura y testeable |
| E5 | Si `compras_guardar_pedido` no cambia nada: **no hay evento, no se borra el mensaje** y devuelve `cambios: false` | Hoy guardar sin cambios borra el mensaje y obliga a regenerarlo |
| E6 | En una **edición**, `compras_guardar_pedido` ignora `p_local_facturacion_id`: el local de un pedido existente solo cambia por la RPC del mensaje | Un solo camino con un solo bloqueo (facturado). El editor ya manda el local actual sin cambiarlo (`PedidoEditor.tsx:157`) |
| E7 | **Reenvío = `compras_marcar_pedido_enviado(p_pedido_id, p_reenvio => true)`**, que escribe `reenviado` sin tocar `enviado_en`. En `PedidoEnvio`, el botón "Listo" de un pedido ya enviado pasa a **"Marcar como reenviado"** (igual que el primer envío: se habilita después de copiar o abrir WhatsApp) | Hoy el reenvío no deja rastro en ningún lado. Sin una acción explícita la base no se entera |
| E8 | El mensaje enviado/reenviado se **guarda en el evento** (`detalle.mensaje`) y se puede ver desde el historial | Trazabilidad real: qué le llegó al proveedor en cada envío. El evento `mensaje` (generar/regenerar) no repite el texto |
| E9 | Remitos: la vista **sigue leyendo `compras_remitos`** para el evento `remito_creado`, salvo que ya exista una fila `remito_creado` en la tabla para ese remito. A2b solo tiene que escribir sus filas: no redefine la vista | Contrato limpio con A2b (dueña de las RPC de remito). Hasta A2b, un remito borrado sigue desapareciendo del historial (limitación conocida, ya está en el diagnóstico) |
| E10 | Factura, factura anulada y diferencia **siguen saliendo de sus tablas** (solo admin), pero con `detalle jsonb` e ids para linkear | Son de A2b/F5; B1 solo cambia el formato |
| E11 | La vista se **borra y se recrea** (`detalle` pasa de `text` a `jsonb`, se suman `id` y `persona_id`, sale `remito_id`) | `create or replace view` no puede cambiar tipos de columnas |
| E12 | FK del evento al pedido con `on delete cascade` | Solo se borra un pedido sin enviar, y `compras_pedidos_eliminados` ya guarda sus líneas. Es la única excepción al append-only |
| E13 | Backfill: una fila por cada columna "última vez" (creado, enviado, cerrado, reabierto) con `detalle.backfill = true`. Los ciclos anteriores no se pueden recuperar | Es lo único que se sabe |
| E14 | Local al convertir = `proveedores.local_facturacion_id` (puede ser null). **No** se rellenan los pedidos viejos | `PedidoEnvio` ya cae al local del proveedor cuando el pedido no tiene (`PedidoEnvio.tsx:31`); tocar pedidos ya enviados cambiaría la historia |
| E15 | `solicitud_item_id`: columna nueva con `on delete set null` + backfill por candidato único (solicitud, proveedor, insumo), `raise notice` de los que no se pueden | En dev matchean 80/80. B3 lo usa para "Sugerido vs. recibido" |
| E16 | **RLS de `compras_pedidos` y `compras_pedido_items` pasa a solo lectura** (ver §12, D1) | Sin esto el bloqueo de local y el historial se esquivan con un `PATCH` directo. Después de B1 no queda ningún escritor directo |

## 3. Migración `supabase/migrations/20261005140000_compras_pedido_eventos.sql`

> El timestamp tiene que ser **mayor que el último de `qa`** al momento del push. Hoy el último esperado es `20261005130000` (A1, vuelta 1). Si al rebasear hay uno mayor, se renombra.
> Cabecera de comentario como las otras (qué es B1, cero triggers, quién escribe la tabla). Orden de las secciones: el de abajo.

### 3.1 Tabla `compras_pedido_eventos`

```sql
create table if not exists compras_pedido_eventos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references compras_pedidos(id) on delete cascade,   -- E12
  tipo        text not null check (tipo in (
                'creado', 'items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje',
                'enviado', 'reenviado', 'cerrado', 'reabierto',
                'remito_creado', 'remito_editado', 'remito_eliminado'   -- los escribe A2b (E9)
              )),
  detalle     jsonb not null default '{}'::jsonb check (jsonb_typeof(detalle) = 'object'),
  creado_por  uuid references profiles(id) on delete set null,
  creado_en   timestamptz not null default clock_timestamp()
);

create index if not exists idx_compras_pedido_eventos_pedido on compras_pedido_eventos (pedido_id, creado_en);
create index if not exists idx_compras_pedido_eventos_remito on compras_pedido_eventos ((detalle->>'remito_id'))
  where tipo like 'remito_%';

alter table compras_pedido_eventos enable row level security;

-- Solo lectura desde la app; se escribe únicamente desde compras_registrar_evento_pedido (E1).
drop policy if exists compras_pedido_eventos_lectura on compras_pedido_eventos;
create policy compras_pedido_eventos_lectura on compras_pedido_eventos
  for select using (tiene_acceso_compras());

revoke insert, update, delete, truncate on compras_pedido_eventos from anon, authenticated;
```

**Forma de `detalle` por tipo** (contrato; A2b respeta los de remito):

| tipo | escribe | `detalle` |
|---|---|---|
| `creado` | `compras_guardar_pedido` (alta), `convertir_solicitud_a_pedidos`, backfill | Manual: `{origen:'manual', lineas:[Linea]}`. Solicitud: `{origen:'solicitud', solicitud_id, solicitud_tipo:'base'\|'complementario', solicitud_fecha, conteo_id, lineas:[Linea]}`. Backfill: `{origen, solicitud_id?, solicitud_tipo?, backfill:true}` (sin `lineas`) |
| `items_editados` | `compras_guardar_pedido` | `{agregados?:[Linea], quitados?:[Linea], cambiados?:[Linea & {antes:{cantidad, unidad, descripcion, item_id}}]}`. Solo están las listas no vacías |
| `proveedor_cambiado` | `compras_guardar_pedido` | `{de:{id, nombre}, a:{id, nombre}}` |
| `local_cambiado` | `compras_guardar_mensaje_pedido` | `{de:{id, nombre}\|null, a:{id, nombre}\|null}` |
| `mensaje` | `compras_guardar_mensaje_pedido` | `{accion:'generado'\|'regenerado'}` |
| `enviado` | `compras_marcar_pedido_enviado`, backfill | `{mensaje, local_facturacion_id}`. Backfill: `{backfill:true}` |
| `reenviado` | `compras_marcar_pedido_enviado(…, true)` | `{mensaje, local_facturacion_id}` |
| `cerrado` | `compras_cerrar_pedido_manual`, backfill | `{motivo, estado_recepcion_anterior}`. Backfill: `{motivo, backfill:true}` |
| `reabierto` | `compras_reabrir_pedido`, backfill | `{estado_recepcion, motivo_cierre}` (el estado en el que quedó después del recálculo). Backfill: `{backfill:true}` |
| `remito_creado` | **A2b** | `{remito_id, secuencia, fecha}` |
| `remito_editado` | **A2b** | `{remito_id, secuencia, fecha?:{de,a}, lineas?: <mismo formato que items_editados>}` |
| `remito_eliminado` | **A2b** | `{remito_id, secuencia, fecha, motivo?, lineas:[{item_id, descripcion, cantidad}]}` |

`Linea` = `{id, item_id, descripcion, unidad, cantidad}` (lo que devuelve `compras_lineas_pedido_snapshot`; `item_id` y `unidad` pueden ser `null`).

### 3.2 Columnas nuevas

```sql
alter table compras_pedidos
  add column if not exists actualizado_en  timestamptz,
  add column if not exists actualizado_por uuid references profiles(id) on delete set null;

alter table compras_pedido_items
  add column if not exists solicitud_item_id uuid references compras_solicitud_items(id) on delete set null;

create index if not exists idx_compras_pedido_items_solicitud_item on compras_pedido_items (solicitud_item_id)
  where solicitud_item_id is not null;
```

`actualizado_en/por` = el último evento del pedido (lo pone el helper). No tienen default: el alta las llena con el evento `creado`.

### 3.3 Helpers

```sql
-- E1. Único escritor de compras_pedido_eventos. Lo llaman RPCs security definer.
create or replace function public.compras_registrar_evento_pedido(
  p_pedido_id uuid,
  p_tipo      text,
  p_detalle   jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_fecha timestamptz := clock_timestamp();
begin
  insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
  values (p_pedido_id, p_tipo, coalesce(p_detalle, '{}'::jsonb), auth.uid(), v_fecha)
  returning id into v_id;

  update compras_pedidos
    set actualizado_en = v_fecha,
        actualizado_por = auth.uid()
    where id = p_pedido_id;

  return v_id;
end;
$$;

revoke execute on function public.compras_registrar_evento_pedido(uuid, text, jsonb) from public, anon, authenticated;

-- Foto de las líneas de un pedido (para el diff y para "creado").
create or replace function public.compras_lineas_pedido_snapshot(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pi.id, 'item_id', pi.item_id, 'descripcion', pi.descripcion,
           'unidad', pi.unidad, 'cantidad', pi.cantidad
         ) order by pi.orden, pi.id), '[]'::jsonb)
  from compras_pedido_items pi
  where pi.pedido_id = p_pedido_id;
$$;

revoke execute on function public.compras_lineas_pedido_snapshot(uuid) from public, anon, authenticated;

-- E4. Diff puro entre dos fotos. '{}' = sin cambios. El orden no cuenta.
create or replace function public.compras_diff_lineas(p_antes jsonb, p_despues jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_agregados jsonb;
  v_quitados  jsonb;
  v_cambiados jsonb;
  v_res       jsonb := '{}'::jsonb;
begin
  select jsonb_agg(d.x order by d.ord) into v_agregados
  from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) with ordinality d(x, ord)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) a(x) where a.x->>'id' = d.x->>'id'
  );

  select jsonb_agg(a.x order by a.ord) into v_quitados
  from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) with ordinality a(x, ord)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) d(x) where d.x->>'id' = a.x->>'id'
  );

  select jsonb_agg(d.x || jsonb_build_object('antes', jsonb_build_object(
           'cantidad', a.x->'cantidad', 'unidad', a.x->'unidad',
           'descripcion', a.x->'descripcion', 'item_id', a.x->'item_id'
         )) order by d.ord)
    into v_cambiados
  from jsonb_array_elements(coalesce(p_despues, '[]'::jsonb)) with ordinality d(x, ord)
  join jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) a(x) on a.x->>'id' = d.x->>'id'
  where (a.x->>'cantidad')::numeric is distinct from (d.x->>'cantidad')::numeric
     or a.x->>'unidad'      is distinct from d.x->>'unidad'
     or a.x->>'descripcion' is distinct from d.x->>'descripcion'
     or a.x->>'item_id'     is distinct from d.x->>'item_id';

  if v_agregados is not null then v_res := v_res || jsonb_build_object('agregados', v_agregados); end if;
  if v_quitados  is not null then v_res := v_res || jsonb_build_object('quitados',  v_quitados);  end if;
  if v_cambiados is not null then v_res := v_res || jsonb_build_object('cambiados', v_cambiados); end if;
  return v_res;
end;
$$;

revoke execute on function public.compras_diff_lineas(jsonb, jsonb) from public, anon;
grant execute on function public.compras_diff_lineas(jsonb, jsonb) to authenticated;  -- pura, sin datos
```

> Ojo con `jsonb_strip_nulls`: **no** usarlo. Borraría `antes.unidad = null` y no se podría saber que la unidad pasó de vacía a "kg".

### 3.4 `compras_guardar_pedido`: cuerpo de `20260924200000:215-337` + eventos

Misma firma `(uuid, uuid, uuid, jsonb) returns jsonb` → `create or replace` alcanza. Cambios, marcados con `-- B1`:

```sql
create or replace function public.compras_guardar_pedido(
  p_pedido_id uuid default null,
  p_proveedor_id uuid default null,
  p_local_facturacion_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido    compras_pedidos%rowtype;
  v_id        uuid;
  v_linea     record;
  v_ids       uuid[];
  v_bloqueada text;
  v_nuevo     boolean := p_pedido_id is null;      -- B1
  v_antes     jsonb;                               -- B1
  v_despues   jsonb;                               -- B1
  v_diff      jsonb;                               -- B1
  v_cambios   boolean := false;                    -- B1
begin
  -- (validaciones iguales: acceso, p_items array, descripción y cantidad > 0)

  if v_nuevo then
    if p_proveedor_id is null then
      raise exception 'Elegí un proveedor.';
    end if;
    insert into compras_pedidos (proveedor_id, local_facturacion_id, estado, creado_por)
    values (p_proveedor_id, p_local_facturacion_id, 'borrador', auth.uid())
    returning * into v_pedido;
  else
    select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
    -- (not found, facturado, cerrado/devuelto y proveedor después de enviado: iguales)
    v_antes := compras_lineas_pedido_snapshot(v_pedido.id);   -- B1: foto con el pedido ya bloqueado
    -- B1: el update de cabecera se mueve abajo, después del diff (E5, E6).
  end if;
  v_id := v_pedido.id;

  -- (ids conservados, línea con remitos, delete y loop de update/insert: iguales)

  v_despues := compras_lineas_pedido_snapshot(v_id);          -- B1

  if v_nuevo then
    perform compras_registrar_evento_pedido(v_id, 'creado',
      jsonb_build_object('origen', 'manual', 'lineas', v_despues));
    v_cambios := true;
  else
    v_diff := compras_diff_lineas(v_antes, v_despues);
    if v_diff <> '{}'::jsonb then
      perform compras_registrar_evento_pedido(v_id, 'items_editados', v_diff);
      v_cambios := true;
    end if;

    if p_proveedor_id is not null and p_proveedor_id <> v_pedido.proveedor_id then
      perform compras_registrar_evento_pedido(v_id, 'proveedor_cambiado', jsonb_build_object(
        'de', jsonb_build_object('id', v_pedido.proveedor_id,
                                 'nombre', (select nombre from proveedores where id = v_pedido.proveedor_id)),
        'a',  jsonb_build_object('id', p_proveedor_id,
                                 'nombre', (select nombre from proveedores where id = p_proveedor_id))
      ));
      v_cambios := true;
    end if;

    -- E5: el mensaje se arma con las líneas; solo queda viejo si algo cambió.
    -- E6: el local de un pedido existente no se toca acá.
    if v_cambios then
      update compras_pedidos
        set proveedor_id = coalesce(p_proveedor_id, proveedor_id),
            mensaje = null
        where id = v_id;
    end if;
  end if;

  perform compras_recalcular_estado_pedido(v_id);

  return jsonb_build_object('id', v_id, 'numero', v_pedido.numero, 'cambios', v_cambios);  -- B1: + cambios
end;
$$;
```

Grants: no cambian (la firma es la misma), pero se repiten al final de la migración por claridad.

### 3.5 `compras_marcar_pedido_enviado`: firma nueva con reenvío (E7)

Sumar un parámetro con default a una función existente crea **otra sobrecarga** y las llamadas con un solo argumento pasan a ser ambiguas. Por eso:

```sql
drop function if exists public.compras_marcar_pedido_enviado(uuid);

create function public.compras_marcar_pedido_enviado(p_pedido_id uuid, p_reenvio boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido compras_pedidos%rowtype;
  v_codigo text;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Recargá la página.';
  end if;
  v_codigo := 'P-' || lpad(v_pedido.numero::text, 4, '0');

  if not coalesce(p_reenvio, false) then
    if v_pedido.enviado_en is not null then
      return;  -- doble clic u otra persona: no es error y no duplica el evento
    end if;
    if not exists (select 1 from compras_pedido_items where pedido_id = p_pedido_id) then
      raise exception 'Agregá al menos un ítem antes de enviar el pedido.';
    end if;

    update compras_pedidos
      set enviado_en = now(), enviado_por = auth.uid()
      where id = p_pedido_id;

    perform compras_registrar_evento_pedido(p_pedido_id, 'enviado', jsonb_build_object(
      'mensaje', v_pedido.mensaje, 'local_facturacion_id', v_pedido.local_facturacion_id));

    perform compras_recalcular_estado_pedido(p_pedido_id);
    return;
  end if;

  -- Reenvío
  if v_pedido.enviado_en is null then
    raise exception 'El pedido % todavía no se envió: marcalo como enviado.', v_codigo;
  end if;
  if v_pedido.estado_facturacion = 'facturado' or v_pedido.estado_recepcion not in ('enviado', 'parcial') then
    raise exception 'El pedido % ya no está esperando mercadería: no hace falta reenviarlo.', v_codigo;
  end if;
  if v_pedido.mensaje is null then
    raise exception 'Generá el mensaje antes de reenviar el pedido.';
  end if;

  -- Doble clic: el mismo reenvío de la misma persona en el último minuto no se repite.
  if exists (
    select 1 from compras_pedido_eventos e
    where e.pedido_id = p_pedido_id
      and e.tipo = 'reenviado'
      and e.creado_por is not distinct from auth.uid()
      and e.creado_en > clock_timestamp() - interval '60 seconds'
      and e.detalle->>'mensaje' = v_pedido.mensaje
  ) then
    return;
  end if;

  perform compras_registrar_evento_pedido(p_pedido_id, 'reenviado', jsonb_build_object(
    'mensaje', v_pedido.mensaje, 'local_facturacion_id', v_pedido.local_facturacion_id));
end;
$$;

revoke execute on function public.compras_marcar_pedido_enviado(uuid, boolean) from public, anon;
grant execute on function public.compras_marcar_pedido_enviado(uuid, boolean) to authenticated;
```

### 3.6 `compras_cerrar_pedido_manual` y `compras_reabrir_pedido`: cuerpo vigente + un evento cada vez

- **Cerrar** (`20260924200000:372-409`): después del `update … cerrado_manual` y **antes** del recálculo:
  ```sql
  perform compras_registrar_evento_pedido(p_pedido_id, 'cerrado', jsonb_build_object(
    'motivo', btrim(p_motivo), 'estado_recepcion_anterior', v_pedido.estado_recepcion));
  ```
- **Reabrir** (`20260924200000:411-441`): después del recálculo (para saber en qué estado quedó):
  ```sql
  perform compras_registrar_evento_pedido(p_pedido_id, 'reabierto', jsonb_build_object(
    'estado_recepcion', (select estado_recepcion from compras_pedidos where id = p_pedido_id),
    'motivo_cierre', v_pedido.cierre_motivo));
  ```
- Las columnas `cerrado_manual_*`, `cierre_motivo` y `reabierto_*` **se siguen escribiendo** (las usan el estado, `PedidoDetalle` "Motivo:" y la regla de `cerrado_en`). La historia completa vive en la tabla.

### 3.7 RPC nueva `compras_guardar_mensaje_pedido` (reemplaza el `update` de `guardarMensaje`)

```sql
create or replace function public.compras_guardar_mensaje_pedido(
  p_pedido_id uuid,
  p_mensaje text,
  p_local_facturacion_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido compras_pedidos%rowtype;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if nullif(btrim(p_mensaje), '') is null then
    raise exception 'El mensaje está vacío.';
  end if;

  select * into v_pedido from compras_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'No encontramos el pedido. Puede que alguien lo haya borrado: recargá la página.';
  end if;

  if p_local_facturacion_id is distinct from v_pedido.local_facturacion_id then
    if v_pedido.estado_facturacion = 'facturado' then
      raise exception 'El pedido % ya está facturado: el local de facturación no se puede cambiar. Si está mal, anulá la factura primero.',
        'P-' || lpad(v_pedido.numero::text, 4, '0');
    end if;
    perform compras_registrar_evento_pedido(p_pedido_id, 'local_cambiado', jsonb_build_object(
      'de', (select jsonb_build_object('id', l.id, 'nombre', l.nombre) from locales_facturacion l where l.id = v_pedido.local_facturacion_id),
      'a',  (select jsonb_build_object('id', l.id, 'nombre', l.nombre) from locales_facturacion l where l.id = p_local_facturacion_id)
    ));
  end if;

  if p_mensaje is distinct from v_pedido.mensaje then
    perform compras_registrar_evento_pedido(p_pedido_id, 'mensaje', jsonb_build_object(
      'accion', case when v_pedido.mensaje is null then 'generado' else 'regenerado' end));
  end if;

  update compras_pedidos
    set mensaje = p_mensaje,
        local_facturacion_id = p_local_facturacion_id
    where id = p_pedido_id;
end;
$$;

revoke execute on function public.compras_guardar_mensaje_pedido(uuid, text, uuid) from public, anon;
grant execute on function public.compras_guardar_mensaje_pedido(uuid, text, uuid) to authenticated;
```

- Si `locales_facturacion` no tiene columna `nombre`, usar la que use `PedidoEnvio` para el `<option>` (hoy `l.nombre`).
- Una factura en **borrador** no bloquea (el pedido sigue `sin_facturar`). Una factura **anulada** devuelve el pedido a `sin_facturar` y vuelve a permitir el cambio.

### 3.8 `convertir_solicitud_a_pedidos`: cuerpo de `20260903120000:169-215` + datos + evento

```sql
create or replace function public.convertir_solicitud_a_pedidos(p_solicitud_id uuid)
returns integer
language plpgsql
security definer
set search_path = public                       -- B1: faltaba
as $$
declare
  v_solicitud    compras_solicitudes%rowtype;  -- B1
  v_proveedor_id uuid;
  v_pedido_id    uuid;
  v_creados      integer := 0;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;

  select * into v_solicitud from compras_solicitudes
  where id = p_solicitud_id and estado = 'abierta' for update;
  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;

  for v_proveedor_id in
    select distinct proveedor_id
    from compras_solicitud_items
    where solicitud_id = p_solicitud_id and incluir and cantidad_ajustada > 0
  loop
    insert into compras_pedidos (proveedor_id, local_facturacion_id, estado, creado_por, solicitud_id)
    values (
      v_proveedor_id,
      (select local_facturacion_id from proveedores where id = v_proveedor_id),   -- B1 (E14)
      'borrador', auth.uid(), p_solicitud_id
    )
    returning id into v_pedido_id;

    insert into compras_pedido_items (pedido_id, item_id, descripcion, unidad, cantidad, orden, solicitud_item_id)
    select v_pedido_id, csi.item_id, csi.descripcion, csi.unidad, csi.cantidad_ajustada,
           row_number() over (order by csi.orden, csi.descripcion) - 1,
           csi.id                                                                    -- B1
    from compras_solicitud_items csi
    where csi.solicitud_id = p_solicitud_id
      and csi.proveedor_id = v_proveedor_id
      and csi.incluir
      and csi.cantidad_ajustada > 0;

    perform compras_registrar_evento_pedido(v_pedido_id, 'creado', jsonb_build_object(   -- B1
      'origen', 'solicitud',
      'solicitud_id', p_solicitud_id,
      'solicitud_tipo', v_solicitud.tipo,
      'solicitud_fecha', v_solicitud.created_at,
      'conteo_id', v_solicitud.conteo_id,
      'lineas', compras_lineas_pedido_snapshot(v_pedido_id)
    ));

    v_creados := v_creados + 1;
  end loop;

  update compras_solicitudes
    set estado = 'convertida', convertida_por = auth.uid(), convertida_en = now()
    where id = p_solicitud_id;

  return v_creados;
end;
$$;
```

Grants iguales a los vigentes (verificar con `\df+` o `pg_proc`; si no hay `revoke … from anon`, sumarlo).

### 3.9 Vista `v_compras_pedido_eventos` (E9, E10, E11)

```sql
drop view if exists public.v_compras_pedido_eventos;

create view public.v_compras_pedido_eventos as
select * from (
  -- Todo lo que registran las RPC.
  select e.id, e.pedido_id, e.tipo, e.creado_en as fecha,
         e.creado_por as persona_id, pr.nombre as persona, e.detalle
  from compras_pedido_eventos e
  left join profiles pr on pr.id = e.creado_por
  union all
  -- Remitos que todavía no tienen su fila (todos, hasta que A2b escriba remito_creado).
  select r.id, r.pedido_id, 'remito_creado', r.created_at,
         r.creado_por, pr.nombre,
         jsonb_build_object('remito_id', r.id, 'secuencia', r.secuencia, 'fecha', r.fecha)
  from compras_remitos r
  left join profiles pr on pr.id = r.creado_por
  where not exists (
    select 1 from compras_pedido_eventos e
    where e.tipo = 'remito_creado' and e.detalle->>'remito_id' = r.id::text
  )
  union all
  select f.id, f.pedido_id, 'factura', f.confirmada_en, f.confirmada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero)
  from compras_facturas f
  left join profiles pr on pr.id = f.confirmada_por
  where f.confirmada_en is not null and f.tipo_comprobante = 'factura' and es_admin()
  union all
  select f.id, f.pedido_id, 'factura_anulada', f.anulada_en, f.anulada_por, pr.nombre,
         jsonb_build_object('factura_id', f.id, 'numero', f.numero)
  from compras_facturas f
  left join profiles pr on pr.id = f.anulada_por
  where f.anulada_en is not null and es_admin()
  union all
  select d.id, f.pedido_id, 'diferencia', d.resuelto_en, d.resuelto_por, pr.nombre,
         jsonb_build_object('resolucion', d.resolucion, 'insumo', d.descripcion,
                            'item_id', d.item_id, 'factura_id', f.id)
  from compras_factura_discrepancias d
  join compras_facturas f on f.id = d.factura_id
  left join profiles pr on pr.id = d.resuelto_por
  where d.resuelto_en is not null and es_admin()
) v
where tiene_acceso_compras();

grant select on public.v_compras_pedido_eventos to authenticated;
```

- La clave única en la UI es `tipo + id` (una factura aparece con su id en `factura` y en `factura_anulada`).
- Copiar el comentario de cabecera de la versión anterior y sumar: "B1: lee la tabla; remito vivo hasta A2b; factura y diferencia siguen saliendo de sus tablas, solo admin".

### 3.10 RLS de pedidos a solo lectura (E16, sujeto a D1)

```sql
drop policy if exists "compras_pedidos_acceso" on compras_pedidos;
create policy "compras_pedidos_lectura" on compras_pedidos
  for select using (tiene_acceso_compras());

drop policy if exists "compras_pedido_items_acceso" on compras_pedido_items;
create policy "compras_pedido_items_lectura" on compras_pedido_items
  for select using (tiene_acceso_compras());
```

**Antes de escribir esto**, el Ejecutor confirma que no queda escritor directo:
```bash
grep -rnE "from\('compras_pedido(s|_items)'\)" app lib components --include=*.ts* -A3 | grep -E "\.(update|insert|delete|upsert)\("
# Debe dar solo acciones.ts (guardarMensaje), que B1 elimina.
```
y en dev, que toda función que escribe pedidos sea `security definer`:
```sql
select p.proname, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ~* '(insert into|update|delete from)\s+compras_pedido(s|_items)\b'
  and not p.prosecdef;
-- Debe dar 0 filas.
```
Si algo de esto falla, **no** se aplica §3.10 y se avisa al coordinador.

### 3.11 Backfill (una sola vez, idempotente)

```sql
-- E13. Los eventos que hoy salen de columnas. Los ciclos anteriores no se conocen.
insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'creado',
       jsonb_build_object('origen', case when p.solicitud_id is null then 'manual' else 'solicitud' end,
                          'backfill', true)
         || case when p.solicitud_id is null then '{}'::jsonb
                 else jsonb_build_object('solicitud_id', p.solicitud_id, 'solicitud_tipo', s.tipo) end,
       p.creado_por, coalesce(p.created_at, now())
from compras_pedidos p
left join compras_solicitudes s on s.id = p.solicitud_id
where not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'creado');

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'enviado', jsonb_build_object('backfill', true), p.enviado_por, p.enviado_en
from compras_pedidos p
where p.enviado_en is not null
  and not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'enviado');

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'cerrado', jsonb_build_object('motivo', p.cierre_motivo, 'backfill', true),
       p.cerrado_manual_por, p.cerrado_manual_en
from compras_pedidos p
where p.cerrado_manual_en is not null
  and not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'cerrado');

insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select p.id, 'reabierto', jsonb_build_object('backfill', true), p.reabierto_por, p.reabierto_en
from compras_pedidos p
where p.reabierto_en is not null
  and not exists (select 1 from compras_pedido_eventos e where e.pedido_id = p.id and e.tipo = 'reabierto');

-- actualizado_en/por = el último evento de cada pedido.
update compras_pedidos p
  set actualizado_en = u.creado_en, actualizado_por = u.creado_por
  from (
    select distinct on (pedido_id) pedido_id, creado_en, creado_por
    from compras_pedido_eventos
    order by pedido_id, creado_en desc
  ) u
  where u.pedido_id = p.id and p.actualizado_en is null;

-- E15. solicitud_item_id por candidato único (misma solicitud, proveedor e insumo; o descripción si es línea libre).
do $$
declare
  r record;
  v_cand uuid[];
  v_sin  integer := 0;
begin
  for r in
    select pi.id, pi.item_id, pi.descripcion, p.solicitud_id, p.proveedor_id
    from compras_pedido_items pi
    join compras_pedidos p on p.id = pi.pedido_id
    where p.solicitud_id is not null and pi.solicitud_item_id is null
  loop
    select array_agg(csi.id) into v_cand
    from compras_solicitud_items csi
    where csi.solicitud_id = r.solicitud_id
      and csi.proveedor_id = r.proveedor_id
      and csi.incluir
      and (case when r.item_id is not null then csi.item_id = r.item_id
                else csi.item_id is null and csi.descripcion = r.descripcion end);

    if coalesce(array_length(v_cand, 1), 0) = 1 then
      update compras_pedido_items set solicitud_item_id = v_cand[1] where id = r.id;
    else
      v_sin := v_sin + 1;
      raise notice 'Línea de pedido % ("%") sin solicitud_item_id: % candidatos', r.id, r.descripcion, coalesce(array_length(v_cand, 1), 0);
    end if;
  end loop;
  raise notice 'B1: % líneas de pedidos de solicitud quedaron sin solicitud_item_id', v_sin;
end $$;
```

**Esperado en dev hoy:** 24 `creado` + 18 `enviado` + 4 `cerrado` + 2 `reabierto` = **48 filas**; 80 de 80 líneas con `solicitud_item_id` (0 sin match). Si los números de dev cambiaron, anotar los reales en las notas.

### 3.12 Después de la migración

- `npm run types` (regenera `lib/database.types.ts` contra dev). **Solo después del push autorizado.**
- Si después del push se corrige un cuerpo, se reaplica en dev con `db query -f` y el archivo queda como versión final (patrón F3/F4).

## 4. Server Actions (`app/admin/compras/pedidos/acciones.ts`)

| Acción | Cambio |
|---|---|
| `guardarPedido` | La respuesta pasa a `{ id, numero, cambios: boolean }` (zod: `cambios: z.boolean()`) |
| `guardarMensaje` | Llama `supabase.rpc('compras_guardar_mensaje_pedido', { p_pedido_id, p_mensaje, p_local_facturacion_id })`. Mismo `Resultado<null>`, mismo fallback, mismo `refresh()` en éxito y en error. **Desaparece el `.from('compras_pedidos').update`** |
| `marcarPedidoEnviado` | Sin cambios (la RPC nueva tiene `p_reenvio` con default) |
| `marcarPedidoReenviado` (nueva) | `rpc('compras_marcar_pedido_enviado', { p_pedido_id, p_reenvio: true })`, fallback `'No se pudo registrar el reenvío.'`. Generalizar `rpcSobrePedido` para aceptar parámetros extra, o escribirla aparte con el mismo patrón |

## 5. Lógica pura: `lib/compras/historialPedido.ts` (nuevo) + `lib/compras/_check_historial.ts`

Sin React y sin Supabase, como `diferencias.ts`. Todo lo que muestra el historial sale de acá.

**5.1 Lectura del `detalle`.** Esquemas zod por tipo (§3.1). `leerEvento(e: EventoPedido): EventoLeido` hace `safeParse` del `detalle`; si falla, el evento se muestra solo con su etiqueta (nunca rompe la pantalla).

**5.2 Textos de líneas.** Números con `toLocaleString('es-AR', { maximumFractionDigits: 2 })` (como `conUnidad`).

| Caso | Texto |
|---|---|
| Cambió cantidad | `Queso 40 → 45 kg` (la unidad, la actual, va al final; sin unidad: `Queso 40 → 45`) |
| Cambió unidad (y quizás cantidad) | `Queso 40 kg → 40 Caja` |
| Cambió descripción (línea libre) | `Bolsas chicas → Bolsas 20x30: 10 → 12` (si también cambió la cantidad) o `Bolsas chicas → Bolsas 20x30` |
| Cambió el insumo (`item_id`) | se trata como cambio de descripción |
| Agregó | `agregó Sal 2 Bolsa` |
| Quitó | `quitó Huevos 90 unidades` |

`partesDiff(diff): ParteDiff[]` devuelve una parte por línea `{ tipo: 'cambiado'|'agregado'|'quitado', itemId: string | null, nombre: string, texto: string }` (el `nombre` va aparte para poder linkearlo). `textoDiff(diff)` las une: `"Editó ítems: Queso 40 → 45 kg; agregó Sal 2 Bolsa"` (primera letra de la primera parte en minúscula después de "Editó ítems: "; la de cambio no lleva verbo).

**5.3 Etiquetas por tipo.**

| tipo | Etiqueta | Línea de detalle |
|---|---|---|
| `creado` manual | Pedido creado | `con N ítems` (si hay `lineas`) |
| `creado` solicitud | Creado desde una solicitud | link a la solicitud: `Pedido base del 03/10` / `Solicitud complementaria del 03/10` (`solicitud_fecha`; backfill sin fecha: `Pedido base` / `Solicitud complementaria`) · `con N ítems` |
| `items_editados` | Editó ítems | las partes de 5.2 |
| `proveedor_cambiado` | Cambió el proveedor | `A → B` (B con `LinkEntidad` proveedor) |
| `local_cambiado` | `de` null: Asignó el local de facturación · si no: Cambió el local de facturación | `X` / `X → Y` (`a` null: `X → sin asignar`) |
| `mensaje` | Generó el mensaje / Regeneró el mensaje | — |
| `enviado` | Enviado al proveedor | "Ver el mensaje" (si hay `mensaje`) |
| `reenviado` | Reenviado al proveedor | "Ver el mensaje" |
| `cerrado` | Cerrado a mano | `Motivo: …` |
| `reabierto` | Reabierto | `Volvió a {estado}` con la etiqueta de `EstadoBadge` para ese `estado_recepcion` (sin `estado_recepcion`, en backfill: nada) |
| `remito_creado` | Llegó un remito | `P-0012-R1` (link) · `llegó el dd/mm` |
| `remito_editado` | Editó el remito | `P-0012-R1` (link) · partes del diff |
| `remito_eliminado` | Eliminó el remito | `P-0012-R1` **sin link** · `Motivo: …` si hay |
| `factura` / `factura_anulada` | Factura confirmada / Factura anulada | `N° 0001-…` con link a la factura |
| `diferencia` | Diferencia con la factura resuelta | `Insumo: {RESOLUCION_PASADO}` (insumo con link) |

Íconos (lucide): creado `PencilLine`, items_editados `ListChecks`, proveedor_cambiado `Store`, local_cambiado `MapPin`, mensaje `MessageCircle`, enviado `Send`, reenviado `Repeat`, cerrado `Lock`, reabierto `RotateCcw`, remito_creado `Truck`, remito_editado `FilePen`, remito_eliminado `Trash2`, factura `ReceiptText`, factura_anulada `Ban`, diferencia `Scale`.

**5.4 Orden.** Por `fecha` ascendente (como hoy). Desempate por `ORDEN_EVENTO = ['creado', 'items_editados', 'proveedor_cambiado', 'local_cambiado', 'mensaje', 'enviado', 'reenviado', 'remito_creado', 'remito_editado', 'remito_eliminado', 'factura', 'diferencia', 'factura_anulada', 'cerrado', 'reabierto']`. Eventos con `fecha` null van al final.

**5.5 Agrupado (`agruparEventos(eventos): EntradaHistorial[]`).**
- **Agrupables:** `items_editados`, `proveedor_cambiado`, `local_cambiado`, `mensaje`. Los demás son siempre una entrada sola.
- Recorriendo en orden, un grupo arranca con un agrupable y suma los agrupables **seguidos** que cumplen: mismo `persona_id` (no null) y `fecha − fecha del primero del grupo ≤ 5 minutos`. Cualquier otro evento en el medio corta el grupo.
- Dentro de un grupo, los `items_editados` se **combinan** por `id` de línea (`combinarDiffs`):
  - cambiado + cambiado → un cambio con el `antes` del primero y el valor del último; si el final es igual al `antes` en los 4 campos, desaparece;
  - agregado + cambiado → agregado con los valores finales;
  - agregado + quitado → desaparecen los dos;
  - cambiado + quitado → quitado con los valores del `antes` original.
- La entrada del grupo lleva: persona, `desde`/`hasta`, y la lista de sub-eventos (con los `items_editados` ya combinados en uno). Si un grupo tiene un solo sub-evento, se ve igual que un evento suelto.
- **Etiqueta del grupo:** si todos los sub-eventos son del mismo tipo, la de ese tipo; si no, `Editó el pedido`, y cada sub-evento va como una línea propia (`Editó ítems: …`, `Regeneró el mensaje`).

**5.6 `_check_historial.ts`** (se corre con `npx tsx lib/compras/_check_historial.ts`, mismo formato que `_check_diferencias.ts`). Casos mínimos:
1. Cambio de cantidad con unidad → `Queso 40 → 45 kg`.
2. Cambio de unidad null → kg → `Queso 40 → 40 kg`; kg → Caja → `Queso 40 kg → 40 Caja`.
3. Agregado y quitado → `agregó Sal 2 Bolsa`, `quitó Huevos 90 unidades`.
4. `textoDiff` completo → `Editó ítems: Queso 40 → 45 kg; agregó Sal 2 Bolsa`.
5. Decimales → `1,5 → 2,25 kg`.
6. Dos `items_editados` del mismo usuario a 3 min → una entrada; 40→45 y 45→50 → `40 → 50`.
7. Mismo caso a 6 min del primero → dos entradas.
8. Mismo caso con otro usuario en el medio → dos entradas.
9. 40→45 y después 45→40 dentro del grupo → el cambio desaparece (si el grupo queda vacío, la entrada no se muestra).
10. Agregado y quitado dentro del grupo → desaparece.
11. `items_editados` + `mensaje` del mismo usuario → una entrada `Editó el pedido` con 2 líneas.
12. `enviado` entre dos ediciones → corta el grupo (3 entradas).
13. `detalle` mal formado → etiqueta sin detalle, no tira.
14. `local_cambiado` con `de` null → `Asignó el local de facturación`.
15. Empate de fecha `creado` / `enviado` → `creado` primero.

`lib/compras/diferencias.ts`: `leerEventoDiferencia` pasa a recibir el `detalle` jsonb (`{ resolucion, insumo }`), o se mueve a `historialPedido.ts` y se borra de `diferencias.ts`. Actualizar `_check_diferencias.ts` en consecuencia (su caso de `leerEventoDiferencia` pasa a un objeto).

## 6. UI

Protocolo de UX del Bloque 1 (skills de diseño, tokens semánticos, íconos lucide, `ConfirmDialog` propio, toast; nada de `confirm()`/`alert()`). Hacer la pasada de skills (`ui-review` o `baseline-ui`) **sobre el historial** antes de cerrar.

### 6.1 `PedidoDetalle.tsx` — sección Historial (`:374-398`)

- Reemplaza `EVENTO`, `ORDEN_EVENTO` y `detalleEvento` (`:28-59`) por `historialPedido.ts`.
- Mantiene la línea de tiempo actual (`ol` con borde, ícono en círculo). Título: `Historial` + `(N)` con la cantidad de entradas.
- Cada entrada:
  ```
  ( ícono )  Editó ítems                                   ← etiqueta (text-sm text-text)
             05/10 14:02–14:06 · Ana                       ← fecha (rango si es grupo) · persona (text-xs text-muted)
             • Queso 40 → 45 kg                            ← una línea por parte (text-xs text-muted),
             • agregó Sal 2 Bolsa                             el nombre del insumo con LinkEntidad variante="texto"
             Ver 3 cambios más                             ← si hay más de 5 partes (botón de texto, min-h-11)
  ```
- Rango: `formatearFechaHora(desde)` y, si `hasta` es otro minuto, `–HH:mm`.
- "Ver el mensaje" en `enviado`/`reenviado`: `<details>` nativo con `<summary>` (min-h-11, foco visible) y el texto en un `<pre>` como el de `PedidoEnvio` (`whitespace-pre-wrap`, `max-h-60`, `overflow-y-auto`).
- Links, todos con `LinkEntidad` (ya hace `stopPropagation` y respeta permisos de módulo):
  - insumo → `{ tipo: 'insumo', id: item_id }`;
  - solicitud → `{ tipo: 'solicitud', id }`;
  - proveedor → `{ tipo: 'proveedor', id }`;
  - remito → `{ tipo: 'remito', id: remito_id }` con `codigoRemito(fila.numero, secuencia)` (sale del `detalle`, ya no hace falta `codigoDe`);
  - factura → `{ tipo: 'factura', id: factura_id }` con `N° {numero}`.
- `key` del `li` = `` `${tipo}-${id}` `` (o la del primer sub-evento en un grupo).
- `persona` null → no se muestra el nombre (como hoy).
- Estado vacío no existe (siempre hay `creado` después del backfill).

### 6.2 `PedidoEnvio.tsx` — reenvío (E7)

- Pedido ya enviado (`!sinEnviar`): el botón "Listo" se reemplaza por **"Marcar como reenviado"** (`Repeat`, `bg-accent`, deshabilitado hasta `compartido`, spinner con `accion === 'reenviar'`). Llama `marcarPedidoReenviado`; en éxito: toast `` `${pedido.codigo} reenviado` `` y `onListo(false)`.
- Al lado, un botón secundario de texto **"Cerrar sin reenviar"** que hace lo que hacía "Listo" (`onListo(false)`).
- Texto de ayuda igual al del primer envío: `Copiá el mensaje o mandalo por WhatsApp para poder marcarlo como reenviado.`
- `generar()` sigue llamando `guardarMensaje` (ahora RPC). Si la RPC rechaza el cambio de local, el toast muestra el error (que ya dice qué hacer) y el `select` vuelve al valor del pedido después del `refresh()`: inicializar `localId` con `useState` no alcanza; resetearlo en el error (`setLocalId(fila.local_facturacion_id ?? '')`).
- Si el pedido está facturado, deshabilitar el `select` "Facturar a" con el texto de ayuda `El pedido ya está facturado: el local no se cambia.` (la RPC igual lo bloquea).

### 6.3 `PedidoEditor.tsx` / `PedidosClient.tsx` — guardar sin cambios (E5)

- `PedidoEditor.guardar`: `yaEnviado: !!pedido && pedido.entrada.estado_recepcion !== 'sin_enviar' && r.data.cambios`.
- `PedidosClient.alGuardar`: si no es nuevo y `cambios` es false → toast `Sin cambios` (info, o `success` si no hay variante info) y vuelve al detalle. Sumar `cambios` al tipo de `r`.

### 6.4 `page.tsx`, `datos.ts`, `modelo.ts`

- `page.tsx:41` sigue igual (`select('*').order('fecha')`). El tipo `EventoPedido` sale de `database.types.ts` regenerado (ahora con `id`, `persona_id` y `detalle: Json`).
- `modelo.ts`: sin cambios de lógica (sigue agrupando por `pedido_id`).

## 7. Casos borde (y cómo los resuelve B1)

| # | Caso | Resultado |
|---|---|---|
| C1 | Guardar el editor sin tocar nada | Sin evento, el mensaje se conserva, `cambios: false`, toast "Sin cambios" |
| C2 | Solo se reordenan líneas | Sin evento (el orden no es parte del diff) |
| C3 | Cantidad `40` → `40.0` | Sin evento (`numeric` compara igual) |
| C4 | Unidad `''` → `null` | No pasa: la RPC ya normaliza con `nullif(btrim)` y el snapshot es posterior |
| C5 | Línea libre (sin `item_id`) cambia de descripción | `cambiados` con `antes.descripcion`; texto `A → B` |
| C6 | Dos personas editan a la vez | La segunda espera el `for update`; su foto `antes` ya incluye lo de la primera, así que cada evento tiene su propio diff correcto. Si la segunda trae ids viejos → el error de siempre ("Alguien cambió este pedido…") y nada se registra |
| C7 | Doble clic en "Marcar como enviado" | El segundo hace `return` antes de escribir: un solo evento |
| C8 | Doble clic en "Marcar como reenviado" | El segundo encuentra el mismo `reenviado` del mismo usuario en < 60 s: no duplica |
| C9 | Reenvío del mismo mensaje un día después | Evento nuevo (pasó el minuto) |
| C10 | Cerrar → reabrir → cerrar → reabrir | 4 eventos; las columnas guardan solo el último de cada uno |
| C11 | Cambiar el local de un pedido facturado | Error en la RPC; nada cambia ni se registra. Con la factura anulada, se puede |
| C12 | Regenerar con el mismo texto y el mismo local | Sin eventos (el `update` corre igual, sin efecto) |
| C13 | Primera generación del mensaje en un pedido sin local que toma el del proveedor | `local_cambiado` (`de` null → "Asignó el local de facturación") + `mensaje` (generado): quedan en el mismo grupo |
| C14 | Eliminar un pedido sin enviar | Sus eventos se borran en cascada (E12); `compras_pedidos_eliminados` guarda las líneas |
| C15 | Borrar un remito (antes de A2b) | Su evento desaparece, como hoy. A2b lo arregla escribiendo `remito_creado` + `remito_eliminado` |
| C16 | Pedido viejo cerrado por la migración F2 | Backfill `cerrado` con `creado_por` null → se ve sin nombre |
| C17 | Pedido viejo cerrado, reabierto y vuelto a cerrar | El backfill solo conoce el último cierre y la última reapertura (E13) |
| C18 | Solicitud con un ítem de proveedor sin local | El pedido nace con local null; `PedidoEnvio` cae al del proveedor como hoy |
| C19 | Se borra una línea de la solicitud después de convertir | `solicitud_item_id` → null (`on delete set null`) |
| C20 | Colaborador sin rol admin abre el historial | Ve todo menos factura, factura anulada y diferencia (como hoy) |
| C21 | Usuario con acceso a compras hace `PATCH /compras_pedidos` o `insert` en `compras_pedido_eventos` por PostgREST | Rechazado por RLS (con D1) |
| C22 | Usuario sin acceso a compras llama a las RPC | `No autorizado`. `compras_registrar_evento_pedido` ni siquiera es ejecutable |
| C23 | `detalle` de un evento con forma inesperada | La UI muestra la etiqueta sola (5.1) |
| C24 | Pedido con muchas ediciones | Las ediciones seguidas del mismo usuario se agrupan; más de 5 partes se colapsan con "Ver N cambios más" |

## 8. Archivos

**En alcance:**
- `supabase/migrations/20261005140000_compras_pedido_eventos.sql` (nuevo)
- `lib/database.types.ts` (regenerado)
- `lib/compras/historialPedido.ts` (nuevo), `lib/compras/_check_historial.ts` (nuevo)
- `lib/compras/diferencias.ts`, `lib/compras/_check_diferencias.ts` (`leerEventoDiferencia` a jsonb)
- `app/admin/compras/pedidos/acciones.ts`
- `app/admin/compras/pedidos/PedidoDetalle.tsx` (solo la sección Historial y sus helpers)
- `app/admin/compras/pedidos/PedidoEnvio.tsx`
- `app/admin/compras/pedidos/PedidoEditor.tsx`, `app/admin/compras/pedidos/PedidosClient.tsx` (solo `cambios`)
- `docs/bloque2/notas-B1.md` (nuevo)

**Fuera de alcance (no tocar):**
- RPC de remitos y facturas (`compras_guardar_remito`, `compras_eliminar_remito`, `compras_guardar_factura`, `compras_confirmar_factura`…): son de A2b. B1 solo deja el tipo y el render.
- `compras_eliminar_pedido`, `compras_recalcular_estado_pedido`.
- `SolicitudesClient.tsx`, `ProveedoresClient.tsx`, reportes (B3 usa `solicitud_item_id`), tablero.
- `gastos.local` y el local en la factura (reunión de Gastos).
- Pantallas de Fábrica, conteo y stock (A1/A2).
- Rellenar el local de pedidos viejos (E14).
- `compras_pedidos.estado` (se borra en F9).
- El plan maestro (lo actualiza el coordinador).

## 9. Verificación

### 9.1 Antes de empezar

```bash
git fetch && git rebase origin/qa
cat supabase/.temp/project-ref          # tiene que dar fafckqysyvtlslfnpzrh
ls supabase/migrations | tail -3        # el último de qa; el de B1 tiene que ser mayor
grep -n "pedido" supabase/migrations/20261005*.sql | grep -i "function\|view"   # A1 no toca pedidos
```

### 9.2 SQL de escenarios (dev, **sin pushear la migración**, todo se revierte)

Se arma un archivo en el scratchpad (no se commitea): **el contenido completo de la migración** + un bloque `do $$ … $$` con los escenarios que termina con `raise exception 'RESULTADO: %', <jsonb>`. El `raise` aborta el lote entero, migración incluida. Se corre con:

```bash
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <scratchpad>/b1_escenarios.sql
```

y después se confirma que no quedó nada:

```bash
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select to_regclass('public.compras_pedido_eventos') is null as limpio"
```

Sesión simulada (como en A1): `perform set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true);`. Los uuid: `select id, email from auth.users where email like 'qa-%'`. Los fixtures que no se pueden crear por RPC se insertan **antes** de cambiar de rol.

Escenarios (cada uno deja su valor en el jsonb del resultado y se compara con el esperado):
1. **S1 Backfill:** cantidad de filas por tipo = `{creado: 24, enviado: 18, cerrado: 4, reabierto: 2}` (o los números reales de dev, consistentes con las columnas); 0 pedidos con `actualizado_en` null; 0 líneas de solicitud sin `solicitud_item_id`.
2. **S2 Alta manual** (`qa-admin`) con 2 líneas → 1 `creado` con `origen = manual` y 2 `lineas`; `cambios = true`; `actualizado_por` = qa-admin.
3. **S3 Guardar sin cambios** con las mismas líneas → `cambios = false`, sin evento nuevo, `mensaje` intacto (ponerle uno antes con la RPC del mensaje).
4. **S4 Editar:** cantidad 40 → 45, agregar Sal, quitar otra → 1 `items_editados` con `cambiados[0].antes.cantidad = 40`, `cantidad = 45`, 1 agregado, 1 quitado; `mensaje` null.
5. **S5 Solo reordenar** → sin evento.
6. **S6 Cambiar proveedor** sin enviar → `proveedor_cambiado` con nombres. Después de enviado → error de siempre, sin evento.
7. **S7 Mensaje:** primera vez con local del proveedor → `local_cambiado` (`de` null) + `mensaje` (`generado`). Mismo texto → nada. Texto nuevo → `mensaje` (`regenerado`).
8. **S8 Enviar** → `enviado` con `detalle.mensaje` igual al del pedido. Enviar otra vez → sin evento nuevo.
9. **S9 Reenviar** → `reenviado`; otra vez enseguida → sin evento nuevo. Reenviar un pedido sin enviar → error. Reenviar con `mensaje` null → error.
10. **S10 Cerrar → reabrir → cerrar → reabrir** → 2 `cerrado` + 2 `reabierto`, el último con `estado_recepcion = 'enviado'`.
11. **S11 Local facturado:** sobre un pedido con `estado_facturacion = 'facturado'` (uno de los 4 de dev, o forzarlo como postgres antes de cambiar de rol), cambiar el local → error con "ya está facturado"; mismo local + mensaje nuevo → OK.
12. **S12 Convertir:** una solicitud `abierta` armada como fixture (2 proveedores, 3 líneas) → 2 pedidos con `local_facturacion_id` = el del proveedor, todas las líneas con `solicitud_item_id`, un `creado` por pedido con `origen = solicitud` y sus `lineas`.
13. **S13 Vista:** como `qa-admin`, los eventos de un pedido facturado incluyen `factura` con `detalle.factura_id`; como un usuario no admin con acceso a compras (`qa-squad` si lo tiene; si no, el que tenga `compras-pedidos`), no. Los remitos aparecen como `remito_creado` con `secuencia`.
14. **S14 Seguridad:** como usuario con acceso a compras: `insert into compras_pedido_eventos` → error; `update compras_pedidos set mensaje = 'x'` → 0 filas o error (D1); `select compras_registrar_evento_pedido(...)` → permiso denegado. Como `qa-local` (sin compras): las RPC → `No autorizado`; la vista → 0 filas.
15. **S15 Eliminar** un pedido sin enviar con eventos → los eventos se van con él.
16. **S16 Diff puro:** `compras_diff_lineas` con unidad null → 'kg' devuelve `cambiados[0].antes.unidad = null` (no se pierde la clave).

### 9.3 Build, lint y chequeos puros

```bash
npx tsx lib/compras/_check_historial.ts
npx tsx lib/compras/_check_diferencias.ts
npm run types && npx tsc --noEmit && npx eslint <archivos tocados> && npm run build
```

`npm run types` solo **después** del push a dev. Antes, se puede avanzar con `historialPedido.ts` y sus chequeos tipando el `detalle` como `unknown`.

### 9.4 Push a dev (con OK del coordinador)

1. Avisar al coordinador y esperar el OK (A1 ya tiene que estar en `qa`).
2. `git fetch && git rebase origin/qa`, confirmar el timestamp.
3. `npx supabase db push --project-ref fafckqysyvtlslfnpzrh`.
4. S1 contra la base real (sin rollback): conteos de backfill y `solicitud_item_id`.
5. Avisar al coordinador para que mergee `bloque2/pedidos` a `qa`.

### 9.5 QA en el navegador (local contra dev)

- **Dev server:** `npm run dev -- -p 3006` **desde PowerShell** (desde Git Bash, `/admin` da 404 por el `!` de la ruta).
- **Cuentas:** `qa-admin@chipacitos.test` y una cuenta no admin con acceso a compras. La contraseña está en `C:\Dev\Trabajo\4peeq\YA!Chipacitos\docs\qa-credenciales-dev.md` (no se copia a ningún doc ni commit). Se pueden resetear en dev sin preguntar; nunca en prod.
- **Herramientas:** Playwright MCP o el navegador de Traycer. Capturas del historial a 375px y en desktop, tema oscuro y claro.
- **Recorrido:**
  1. Crear un pedido manual con 2 ítems → historial: "Pedido creado · con 2 ítems".
  2. Editar: cambiar una cantidad, agregar un ítem, quitar otro → "Editó ítems" con las 3 partes y el insumo linkeado.
  3. Editar otra vez la misma cantidad antes de 5 minutos → sigue siendo una entrada, con el valor combinado.
  4. Guardar sin cambios → toast "Sin cambios", el mensaje sigue ahí.
  5. Generar el mensaje y enviarlo → "Generó el mensaje" (o "Editó el pedido" con local + mensaje) y "Enviado al proveedor" con "Ver el mensaje".
  6. Más acciones › Reenviar mensaje → copiar → "Marcar como reenviado" → toast y "Reenviado al proveedor". Doble clic → un solo evento.
  7. Cerrar a mano, reabrir, cerrar y reabrir → los 4 eventos, el último "Volvió a Enviado".
  8. Convertir una solicitud → el pedido nace con "Facturar a" = el local del proveedor y el historial dice "Creado desde una solicitud" con link a la solicitud.
  9. Pedido facturado → "Reenviar" no aparece; en la pantalla de envío (si se llega) el select de local está deshabilitado.
  10. Un pedido viejo de dev → sus eventos de backfill en el orden correcto.
  11. Con la cuenta no admin → el historial no muestra factura ni diferencias.
  12. Clic en el link del insumo dentro del detalle → abre la ficha de Stock y el modal de origen se cierra solo si corresponde (comportamiento de B0).

### 9.6 Datos de dev

Anotar en `notas-B1.md` qué pedidos y solicitudes de prueba quedan en dev.

## 10. Commits y cierre

1. `feat(compras): historial de pedidos en tabla — migración y RPCs (B1)`: SQL + tipos. Se pushea la rama **después** del `db push` autorizado.
2. `feat(compras): historial legible y agrupado en el detalle del pedido (B1)`: `historialPedido.ts` + chequeos + `PedidoDetalle`.
3. `feat(compras): reenvío registrado y mensaje por RPC (B1)`: acciones, `PedidoEnvio`, `PedidoEditor`, `PedidosClient`.
4. `docs(bloque2): notas de B1`.

**No commitear** lo que no es tuyo (`Excalidraw/`, `docs/roadmap-marcos.html`, `docs/avances-*`, `docs/entregas/2026-10-01-*`). No editar el plan maestro.

## 11. Lista de pruebas para el usuario

Se pasa recién **cuando el coordinador haya mergeado a `qa`**. En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin`.

**Circuito 1 — Editar queda registrado**
1. Compras › Pedidos › Nuevo pedido, un proveedor y 2 ítems. Guardar. → En el detalle, Historial: "Pedido creado · con 2 ítems", con tu nombre y la hora.
2. Más acciones › Editar ítems: cambiar la cantidad de uno, agregar otro y quitar el tercero. Guardar. → "Editó ítems" con tres líneas, por ejemplo "Queso 40 → 45 kg", "agregó Sal 2 Bolsa", "quitó Huevos 90 unidades". El nombre del insumo es un link a su stock.
3. Volver a editar la misma cantidad enseguida (45 → 50). → Sigue habiendo **una sola** entrada, que ahora dice "40 → 50".
4. Abrir el editor y guardar sin tocar nada. → Toast "Sin cambios" y el historial no suma nada.

**Circuito 2 — Envío y reenvío**
5. Enviar: generar el mensaje, copiarlo y "Marcar como enviado". → "Enviado al proveedor"; "Ver el mensaje" muestra lo que se mandó.
6. Más acciones › Reenviar mensaje → copiar → "Marcar como reenviado". → Toast "P-xxxx reenviado" y en el historial "Reenviado al proveedor".
7. Reenviar de nuevo tocando el botón dos veces rápido. → Aparece un solo reenvío.

**Circuito 3 — Cerrar y reabrir, todas las veces**
8. Cerrar a mano con un motivo, reabrir, cerrar con otro motivo y reabrir. → Cuatro entradas, cada una con su motivo; la última reapertura dice a qué estado volvió.

**Circuito 4 — Solicitud → pedido**
9. Solicitudes: convertir una solicitud abierta. → El pedido nuevo ya tiene el local en "Facturar a" (el del proveedor) y su historial dice "Creado desde una solicitud" con un link que lleva a la solicitud.

**Circuito 5 — Facturado**
10. En un pedido facturado: no aparece "Reenviar mensaje" y no se puede cambiar el local de facturación.

**Circuito 6 — Lo viejo y los permisos**
11. Abrir un pedido viejo (de antes de esta versión). → Ve "Pedido creado", "Enviado" y, si tuvo, "Cerrado a mano"/"Reabierto", en orden.
12. Con una cuenta sin rol admin y con Compras: el historial no muestra la factura ni las diferencias.
13. En el celular (375px): el historial se lee sin cortar, y "Ver el mensaje" y "Ver N cambios más" se tocan bien.

**Datos de prueba que quedan en dev:** los lista el Ejecutor en `notas-B1.md`.

## 12. Decisiones que necesitan al usuario

- **D1 — Pedidos de solo lectura desde el navegador.** Con B1 nadie escribe `compras_pedidos` ni `compras_pedido_items` directo; pasarlos a `select` en la RLS cierra el hueco (hoy cualquiera con acceso a compras, incluido el módulo `fabrica-conteos`, puede cambiar estado, local o mensaje por PostgREST sin dejar rastro). **Recomendado: sí, en B1** (§3.10, con las dos verificaciones previas).
- **D2 — Reenvío explícito.** Para que el reenvío quede registrado, la pantalla de reenvío cambia "Listo" por "Marcar como reenviado" (se habilita después de copiar o abrir WhatsApp), con "Cerrar sin reenviar" al lado. **Recomendado: sí.** La alternativa (registrar el reenvío al tocar Copiar/WhatsApp) no distingue entre copiar y mandar de verdad.
- **D3 — Guardar el texto del mensaje en cada envío.** Cada "Enviado"/"Reenviado" guarda el mensaje que salió, y el historial lo deja ver. Ocupa poco (~1 KB por envío). **Recomendado: sí.**
- **D4 — Sin rellenar el local de los pedidos viejos de solicitud.** Los 11 pedidos de dev que salieron de una solicitud sin local se dejan como están (la pantalla de envío ya propone el del proveedor). **Recomendado: no rellenar.**
- **D5 — Eventos de un pedido eliminado.** Se borran con el pedido (solo se puede eliminar sin enviar, y `Eliminados` ya guarda sus líneas y el motivo). **Recomendado: OK así.**
