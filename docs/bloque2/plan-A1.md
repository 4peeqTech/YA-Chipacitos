# A1 — El conteo controla, no pisa (especificación ejecutable)

> **Para el Ejecutor del carril A** (rama `bloque2/stock`). Es la F7 del Bloque 1, actualizada contra el código de `qa` @ `6584b99` (2026-10-05). Ya existen F3 (ledger), F4/F5 (facturas y diferencias) y F8 (sobrestock), así que esta versión **reemplaza** a la de `bueno-tenemos-todo-septiembre-nifty-meteor.md:858-896`.
>
> **Regla vigente:** se trabaja **solo en dev (`fafckqysyvtlslfnpzrh`) y en QA (rama `qa`)**. En esta fase no se toca prod de ninguna forma: ni migraciones, ni lecturas, ni merges a `main`, ni pasos de release. La release la decide solo el usuario.
>
> Si la realidad no coincide con esta especificación (por ejemplo, otra migración redefinió una de estas funciones), **frená y avisale al coordinador**. No improvises.

---

## 0. Qué cambia, en una línea

Hoy el conteo de Fábrica **escribe el stock desde el navegador** (`ConteoDesplegable.tsx:136-153`). Upsertea `compras_stock_actual` y además inserta un movimiento con un delta calculado contra lo que tenía la pantalla, que puede estar viejo.

Desde A1:
- **el conteo guarda solo lo contado;**
- al cerrarlo, **se sella el stock teórico** y la diferencia;
- **Compras decide** qué hacer con cada diferencia: Aplicar (un movimiento `ajuste_conteo` por `compras_mover_stock`), Ignorar o Revertir.

Así se cierra la excepción del ledger anotada en `20260925120000_compras_stock_ledger.sql:15`. Es requisito de A3 y A4: mientras el conteo pise el stock, tapa el consumo por producción.

**El bug se ve hoy en dev.** El invariante del ledger da 1 fila: Leche en Polvo tiene caché 5 y ledger 13. El movimiento y el upsert del 02-10 21:36:42 son del mismo segundo: es la carrera del conteo que escribe desde el navegador.

## 1. Relevamiento del código vigente (lo que el Ejecutor tiene que saber)

| Lugar | Hoy | Consecuencia para A1 |
|---|---|---|
| `app/fabrica/stock/page.tsx:117-135` | Siembra `fabrica_conteo_items.cantidad` con `compras_stock_actual`: **Fábrica ve el teórico precargado** | Se siembra vacío (ver D1) |
| `ConteoDesplegable.tsx:136-153` | Upsert de `compras_stock_actual` + `insert` en `compras_stock_movimientos` + `update` de `fabrica_conteo_items`, todo desde el navegador | Pasa a una RPC que solo guarda lo contado |
| RLS `compras_stock_actual_acceso` y `compras_stock_movimientos_acceso` | `for ALL using (tiene_acceso_compras() or tiene_acceso_fabrica())`: **cualquiera de Fábrica puede escribir el stock** | Pasan a solo `select`. Las RPC son `security definer` |
| RLS `fabrica_conteo_items_modificacion` | `update` con `tiene_acceso_fabrica()`, **sin mirar el estado del conteo**: se puede editar un conteo cerrado | Se borra (escribe solo la RPC). El `insert` queda acotado a conteos en borrador |
| `cerrar_conteo_fabrica` | El cuerpo vigente es el de `20260924170000_insumos_a_demanda.sql:31-135` (F8 + "a demanda") | Se parte de ese cuerpo (§3.4) |
| `compras_mover_stock` | El cuerpo vigente es el de `20260929120000…:96-155` (9 parámetros, ya con `p_conteo_id`). Tiene la rama de "auto-curación" `conteo_fabrica` cuando la caché ≠ el ledger | **No se redefine en A1** (§3.9) |
| `compras_revertir_movimiento` | El cuerpo vigente es el de `20260929120000…:655-705`. Permite revertir `ajuste_conteo` | Se bloquea el `ajuste_conteo` que sale de un conteo (§3.6) |
| `eliminar_conteo_fabrica` | `20260806110000…:15-31`: borra el borrador. La FK `compras_stock_movimientos.conteo_id → fabrica_conteos` es `NO ACTION`, así que borrar un borrador con movimientos falla con un error crudo de FK | Mensaje claro; nunca se toca la FK (§3.7) |
| `descartar_solicitud` | `20260911100000…`: pasa el conteo a `descartado` | Se bloquea si hay diferencias aplicadas (§3.8) |
| `v_compras_conteos_historial` | `20260908130000…:19-37`: solo los `cerrado` | Suma estado, solicitud y pendientes (§3.10) |
| `lib/compras/movimientos.ts` | `TIPOS_REVERTIBLES = ['ajuste_manual','ajuste_conteo']`. La etiqueta "Ajuste por conteo" ya existe | Sale `ajuste_conteo` de los revertibles |
| `app/admin/compras/stock/historico/HistoricoInsumoClient.tsx` | Usa `fabrica_conteo_items.cantidad` de los conteos cerrados como "había" | Saltea los ítems no contados (`contado_en is null`) |
| `app/fabrica/stock/HistorialGlobal.tsx` | Muestra el detalle de un conteo cerrado desde `compras_solicitud_items.stock_actual` (= `fci.cantidad`) | En un ítem no contado esa cantidad sería el teórico: se muestra "Sin contar" (§5.1) |

**Datos de dev hoy** (lectura del 2026-10-05):
- 3 borradores: Global (8 ítems), Bolsaplast (7) y Huevos (1). Ninguno tiene movimientos con su `conteo_id`.
- 17 conteos cerrados con 9 movimientos y 2 descartados con 1 movimiento: son `conteo_fabrica` viejos.
- Ningún insumo está en dos listas a la vez, pero el modelo lo permite.

## 2. Decisiones de diseño

Las marcadas **(U)** necesitan el OK del usuario antes de arrancar. Las otras salen de la consigna o del código, y la recomendación es la que va.

| # | Pregunta | Decisión | Por qué |
|---|---|---|---|
| **D1 (U)** | ¿Fábrica cuenta "a ciegas"? | **Sí.** El borrador arranca vacío (`contado_en null`) y la tile muestra "Sin contar". **Cambio de hábito:** Bolsaplast y Huevos hoy arrancan con el valor anterior | "Fábrica no ve el teórico". Si se precarga, Fábrica tiende a dejar el número del sistema y el control no mide nada |
| **D2 (U)** | ¿Se puede cerrar con ítems sin contar? | **Sí, con aviso.** El modal de cierre dice "Quedan N sin contar (…): para esos se usa el stock del sistema". En esos ítems `cantidad := stock teórico` (con piso 0), `diferencia = null` y no se revisan | No traba el cierre semanal por un ítem que nadie contó. El sugerido y el sobrestock siguen funcionando igual |
| D3 | ¿Aplicar mueve por la diferencia sellada o lleva el stock a lo contado? | **Por la diferencia sellada** (`contado − teórico al cierre`) | Lo que pasó después del cierre (remitos, facturas) sigue valiendo. Llevar el stock a lo contado borraría esos movimientos |
| D4 | Un remito que se carga después del cierre pero que ya estaba en el depósito cuando se contó | La UI muestra **"Desde el cierre el stock se movió +N"**. Se calcula **sin fechas**: `stock_hoy − teórico − lo ya aplicado de este conteo`. El confirm de Aplicar avisa: "si esa mercadería ya estaba cuando se contó, la diferencia ya está explicada: ignorala" | Es el caso que duplica stock si se aplica a ciegas |
| D5 | Dos conteos cerrados con el mismo insumo y diferencias pendientes | **Solo se aplica la del conteo más nuevo** que lo contó. La vieja queda "Superada por Global 06/10": se puede ignorar, pero no aplicar. "Aplicar todas" las saltea y dice cuántas | Aplicar las dos corrige dos veces |
| D6 | ¿Qué pasa al descartar la solicitud de un conteo con diferencias aplicadas? | **Se bloquea**: "Revertí las diferencias aplicadas en Fábrica › Conteos antes de descartar". Las ignoradas no bloquean. En un conteo descartado nada se puede aplicar | Todo error tiene salida, y nunca queda stock movido por un conteo que se desconoció |
| D7 | ¿Borrar un conteo con movimientos? | `eliminar_conteo_fabrica` sigue borrando **solo borradores**. Desde A1 un borrador nunca tiene movimientos. Si tiene alguno del sistema viejo, **no se borra**: "Ya movió stock con el sistema anterior: cerralo y Compras revisa las diferencias". La FK `conteo_id` no se toca | El ledger es append-only y la FK protege la trazabilidad |
| D8 | ¿Quién resuelve? | `tiene_acceso_compras()`: admin o los módulos de Compras/`fabrica-conteos`. El rol `supervisor_fabrica` **no** | Es el control cruzado: Fábrica cuenta y Compras decide |
| D9 | ¿Desde dónde se revierte un `ajuste_conteo`? | **Solo desde el conteo** (como `ajuste_factura`, que se revierte desde la factura). Desde Stock se bloquea con un mensaje que dice dónde ir | Si se revierte desde Stock, la diferencia queda marcada "aplicada" sin movimiento vivo |
| D10 | ¿Se oculta el teórico a Fábrica en la base? | **Solo en la UI.** La vista nueva es solo para Compras; la tabla sigue legible para Fábrica (ya hoy lee `compras_stock_actual`). Esconderlo por columnas en la base queda para F9 | Ocultar columnas con privilegios en Supabase es frágil y no lo pide la consigna |
| D11 | Umbral "diferencia grande" (ámbar) | `compras_config.conteo.diferencia_resaltar_pct = 20`. Es ámbar si `abs(dif) > 20 % de abs(teórico)`, o si el teórico es 0 y la diferencia no | "Todo parametrizable" (pedido del usuario). Reemplaza al `// TODO(config)` de F7 |
| D12 | Lo que hoy está fuera del invariante (Leche en Polvo en dev) | La migración lo registra una vez como `conteo_fabrica` ("Diferencia del conteo de fábrica sin registrar (antes de A1)") y **aborta si el invariante no queda en 0** | Mismo patrón que la apertura de F3. El stock que se ve no cambia |

## 3. Migración `supabase/migrations/<YYYYMMDDHHMMSS>_fabrica_conteo_controla.sql`

**Timestamp:** usá la fecha real del día. Antes de crear el archivo hacé `git fetch && git rebase origin/qa`, y que el timestamp sea **mayor que la última migración de `qa`** (hoy es `20260930180000`; B1 puede haber sumado una). Antes de cada `create or replace`, `grep -n "function public.<nombre>" supabase/migrations/*.sql` para confirmar que partís del cuerpo vigente.

Va en un único archivo, en este orden. Lo que sigue es "casi completo": el Ejecutor completa las firmas de los `revoke`/`grant` y los comentarios.

### 3.1 Config

```sql
insert into public.compras_config (clave, valor, descripcion) values
  ('conteo.diferencia_resaltar_pct', '20'::jsonb,
   'Una diferencia de conteo se resalta en ámbar si supera este % del stock esperado.')
on conflict (clave) do nothing;
```

### 3.2 Columnas nuevas en `fabrica_conteo_items`

```sql
alter table public.fabrica_conteo_items
  add column if not exists contado_en              timestamptz,
  add column if not exists stock_teorico           numeric,
  add column if not exists diferencia_estado       text,
  add column if not exists diferencia_mov_id       uuid references public.compras_stock_movimientos(id),
  add column if not exists diferencia_nota         text,
  add column if not exists diferencia_resuelta_por uuid references public.profiles(id),
  add column if not exists diferencia_resuelta_en  timestamptz;

-- Solo hay diferencia si el ítem se contó y el cierre selló el teórico.
alter table public.fabrica_conteo_items
  add column if not exists diferencia numeric
  generated always as (
    case when contado_en is not null and stock_teorico is not null then cantidad - stock_teorico end
  ) stored;

alter table public.fabrica_conteo_items
  drop constraint if exists fabrica_conteo_items_diferencia_estado_check,
  add  constraint fabrica_conteo_items_diferencia_estado_check
    check (diferencia_estado is null or diferencia_estado in ('pendiente', 'aplicada', 'ignorada')),
  drop constraint if exists fabrica_conteo_items_aplicada_con_movimiento,
  add  constraint fabrica_conteo_items_aplicada_con_movimiento
    check (diferencia_estado is distinct from 'aplicada' or diferencia_mov_id is not null);

create index if not exists idx_fabrica_conteo_items_dif_pendiente
  on public.fabrica_conteo_items (item_id) where diferencia_estado = 'pendiente';

comment on column public.fabrica_conteo_items.contado_en is
  'Cuándo Fábrica cargó la cantidad. Null = sin contar (al cerrar toma el stock del sistema y no genera diferencia).';
comment on column public.fabrica_conteo_items.stock_teorico is
  'Stock del sistema (compras_stock_actual) sellado al cerrar el conteo. Fábrica no lo ve.';
```

**Backfill de `contado_en`** (antes de tocar policies):

```sql
-- Conteos viejos (cerrados o descartados): se toman como contados. stock_teorico
-- queda null, así que no generan diferencias (ya pisaron el stock en su momento).
update public.fabrica_conteo_items fci
  set contado_en = coalesce(c.cerrado_en, c.descartado_en, c.created_at)
  from public.fabrica_conteos c
  where c.id = fci.conteo_id and c.estado in ('cerrado', 'descartado') and fci.contado_en is null;

-- Borradores en curso: cuentan como contados solo los ítems que el sistema viejo
-- ya movió (tienen movimiento con este conteo). El resto queda "sin contar".
update public.fabrica_conteo_items fci
  set contado_en = now()
  from public.fabrica_conteos c
  where c.id = fci.conteo_id and c.estado = 'borrador' and fci.contado_en is null
    and exists (select 1 from public.compras_stock_movimientos m
                where m.conteo_id = fci.conteo_id and m.item_id = fci.item_id);
```

> En dev ningún borrador tiene movimientos: los 3 borradores quedan enteros "sin contar". Es lo esperado.

### 3.3 RPC nueva `fabrica_guardar_cantidad_conteo` (reemplaza las escrituras del navegador)

```sql
create or replace function public.fabrica_guardar_cantidad_conteo(
  p_conteo_item_id uuid default null,
  p_cantidad numeric default null   -- null = "lo borré, queda sin contar"
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo_id uuid;
  v_estado    text;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;
  if p_cantidad is not null and p_cantidad < 0 then
    raise exception 'La cantidad no puede ser negativa.';
  end if;

  select conteo_id into v_conteo_id from fabrica_conteo_items where id = p_conteo_item_id;
  if not found then
    raise exception 'No encontramos ese ítem del conteo. Recargá la página.';
  end if;

  -- Orden de bloqueo: conteo → ítem (igual que cerrar_conteo_fabrica).
  select estado into v_estado from fabrica_conteos where id = v_conteo_id for update;
  if v_estado <> 'borrador' then
    raise exception 'Este conteo ya se cerró: no se puede cambiar lo contado. Recargá la página.';
  end if;

  update fabrica_conteo_items
    set cantidad   = coalesce(p_cantidad, 0),
        contado_en = case when p_cantidad is null then null else now() end
    where id = p_conteo_item_id;
end;
$$;

revoke execute on function public.fabrica_guardar_cantidad_conteo(uuid, numeric) from public, anon;
grant  execute on function public.fabrica_guardar_cantidad_conteo(uuid, numeric) to authenticated;
```

### 3.4 `cerrar_conteo_fabrica`: el cuerpo de `20260924170000` más el sellado

Copiá el cuerpo **entero** de `20260924170000_insumos_a_demanda.sql:31-135`. Hay tres agregados, y el resto queda igual (incluido el cálculo de sobrestock de F8: los dos `update` con `necesidad`/`sugerido` y con `exceso`/`sobrestock`/`descuento_base_sugerido`, y el insert de la solicitud):

**(a) Después del `select … for update` del conteo y del umbral, antes del primer `update`:**

```sql
  -- A1: el conteo controla, no pisa. Se bloquea el stock de los insumos del
  -- conteo (for share, ordenado) para que un remito en vuelo termine antes del
  -- sellado o espere a que termine el cierre.
  perform 1
    from compras_stock_actual a
    where a.item_id in (select item_id from fabrica_conteo_items where conteo_id = p_conteo_id)
    order by a.item_id
    for share;

  -- Se sella el teórico. Lo no contado toma el stock del sistema (con piso 0)
  -- para que el sugerido y el sobrestock se calculen igual que siempre, y no
  -- genera diferencia (diferencia es null porque contado_en es null).
  update fabrica_conteo_items fci set
    stock_teorico = coalesce(a.cantidad, 0),
    cantidad      = case when fci.contado_en is null then greatest(coalesce(a.cantidad, 0), 0) else fci.cantidad end
  from fabrica_conteo_items f
  left join compras_stock_actual a on a.item_id = f.item_id
  where f.id = fci.id and fci.conteo_id = p_conteo_id;
```

**(b) Después del `update` de exceso/sobrestock y antes de pasar el conteo a `cerrado`:**

```sql
  update fabrica_conteo_items
    set diferencia_estado = 'pendiente'
    where conteo_id = p_conteo_id and diferencia is not null and diferencia <> 0;
```

**(c)** Arriba de la función, el comentario de cabecera: "Cuerpo de 20260924170000 + sellado de A1". `returns uuid` (el id de la solicitud) no cambia.

> Orden de bloqueo en todo el sistema: remitos y facturas hacen pedido → remito → stock. El cierre hace conteo → stock (for share). Resolver hace conteo → ítem → stock (for update, dentro de `compras_mover_stock`). No hay ciclos.

### 3.5 RPC nueva `compras_resolver_diferencias_conteo`

```sql
create or replace function public.compras_resolver_diferencias_conteo(
  p_conteo_id uuid default null,
  p_item_ids  uuid[] default null,   -- ids de fabrica_conteo_items; null = todas las pendientes (no vale para revertir)
  p_accion    text default null,     -- 'aplicar' | 'ignorar' | 'revertir'
  p_nota      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo   fabrica_conteos%rowtype;
  v_lista    text;
  v_etiqueta text;
  v_fci      fabrica_conteo_items%rowtype;
  v_nombre   text;
  v_mov      compras_stock_movimientos%rowtype;
  v_mov_id   uuid;
  v_superado text;
  v_hechas   int := 0;
  v_omitidas int := 0;
  v_detalle  jsonb := '[]'::jsonb;
begin
  if not tiene_acceso_compras() then
    raise exception 'No autorizado';
  end if;
  if p_accion is null or p_accion not in ('aplicar', 'ignorar', 'revertir') then
    raise exception 'Elegí qué hacer con la diferencia.';
  end if;
  if p_accion = 'revertir' and (p_item_ids is null or cardinality(p_item_ids) = 0) then
    raise exception 'Elegí qué diferencia revertir.';
  end if;

  select * into v_conteo from fabrica_conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'No encontramos ese conteo. Recargá la página.';
  end if;
  if v_conteo.estado = 'descartado' then
    raise exception 'Este conteo se descartó: sus diferencias ya no se aplican. Fábrica lo vuelve a contar.';
  elsif v_conteo.estado <> 'cerrado' then
    raise exception 'Este conteo todavía no se cerró.';
  end if;

  select nombre into v_lista from fabrica_conteo_definiciones where id = v_conteo.definicion_id;
  v_etiqueta := 'Conteo ' || v_lista || ' ' || to_char(v_conteo.fecha, 'DD/MM');

  if p_item_ids is not null and (
       select count(*) from fabrica_conteo_items where conteo_id = p_conteo_id and id = any(p_item_ids)
     ) <> cardinality(p_item_ids) then
    raise exception 'Alguna de esas diferencias ya no está en el conteo. Recargá la página.';
  end if;

  for v_fci in
    select * from fabrica_conteo_items
    where conteo_id = p_conteo_id
      and (case when p_item_ids is null then diferencia_estado = 'pendiente' else id = any(p_item_ids) end)
    order by item_id
    for update
  loop
    select nombre into v_nombre from compras_items where id = v_fci.item_id;

    -- ¿Hay un conteo cerrado más nuevo que contó este insumo? (D5)
    select d.nombre || ' ' || to_char(c2.fecha, 'DD/MM') into v_superado
      from fabrica_conteo_items f2
      join fabrica_conteos c2 on c2.id = f2.conteo_id
      join fabrica_conteo_definiciones d on d.id = c2.definicion_id
      where f2.item_id = v_fci.item_id and c2.estado = 'cerrado'
        and c2.cerrado_en > v_conteo.cerrado_en and f2.contado_en is not null
      order by c2.cerrado_en limit 1;

    if p_accion = 'aplicar' then
      if v_fci.diferencia_estado is distinct from 'pendiente' then
        raise exception '%: esa diferencia ya se resolvió. Recargá la página para ver cómo quedó.', v_nombre;
      end if;
      if v_superado is not null then
        if p_item_ids is null then v_omitidas := v_omitidas + 1; continue; end if;
        raise exception '%: hay un conteo más nuevo (%). Aplicá la diferencia de ese conteo; esta quedó vieja.', v_nombre, v_superado;
      end if;
      v_mov_id := compras_mover_stock(
        v_fci.item_id, v_fci.diferencia, 'ajuste_conteo',
        v_etiqueta || coalesce(': ' || nullif(btrim(p_nota), ''), ''),
        null, p_conteo_id
      );
      update fabrica_conteo_items set
        diferencia_estado = 'aplicada', diferencia_mov_id = v_mov_id,
        diferencia_nota = nullif(btrim(p_nota), ''),
        diferencia_resuelta_por = auth.uid(), diferencia_resuelta_en = now()
        where id = v_fci.id;

    elsif p_accion = 'ignorar' then
      if v_fci.diferencia_estado is distinct from 'pendiente' then
        raise exception '%: esa diferencia ya se resolvió. Recargá la página.', v_nombre;
      end if;
      update fabrica_conteo_items set
        diferencia_estado = 'ignorada', diferencia_nota = nullif(btrim(p_nota), ''),
        diferencia_resuelta_por = auth.uid(), diferencia_resuelta_en = now()
        where id = v_fci.id;

    else -- revertir
      if v_fci.diferencia_estado not in ('aplicada', 'ignorada') then
        raise exception '%: esa diferencia ya está pendiente. Recargá la página.', v_nombre;
      end if;
      if v_fci.diferencia_estado = 'aplicada' then
        select * into v_mov from compras_stock_movimientos where id = v_fci.diferencia_mov_id;
        perform compras_mover_stock(
          v_mov.item_id, -v_mov.delta, 'reversion',
          'Se revirtió el ajuste del ' || v_etiqueta || coalesce(': ' || nullif(btrim(p_nota), ''), ''),
          null, p_conteo_id, v_mov.id
        );
      end if;
      update fabrica_conteo_items set
        diferencia_estado = 'pendiente', diferencia_mov_id = null, diferencia_nota = null,
        diferencia_resuelta_por = null, diferencia_resuelta_en = null
        where id = v_fci.id;
    end if;

    v_hechas := v_hechas + 1;
    v_detalle := v_detalle || jsonb_build_object(
      'item_id', v_fci.item_id, 'nombre', v_nombre,
      'cantidad_despues', (select cantidad from compras_stock_actual where item_id = v_fci.item_id)
    );
  end loop;

  return jsonb_build_object('accion', p_accion, 'hechas', v_hechas, 'omitidas_superadas', v_omitidas, 'items', v_detalle);
end;
$$;

revoke execute on function public.compras_resolver_diferencias_conteo(uuid, uuid[], text, text) from public, anon;
grant  execute on function public.compras_resolver_diferencias_conteo(uuid, uuid[], text, text) to authenticated;
```

### 3.6 `compras_revertir_movimiento`: el cuerpo de `20260929120000:655-705` más un bloqueo

Después del bloqueo de `discrepancia_id`:

```sql
  if v_mov.tipo = 'ajuste_conteo' and v_mov.conteo_id is not null then
    raise exception 'Ese ajuste salió de un conteo de fábrica: revertilo desde el conteo, en Fábrica › Conteos.';
  end if;
```

### 3.7 `eliminar_conteo_fabrica`: el cuerpo de `20260806110000:15-31` más D7

```sql
  if exists (select 1 from compras_stock_movimientos where conteo_id = p_id) then
    raise exception 'Este conteo ya movió stock con el sistema anterior y no se puede borrar: cerralo y Compras revisa las diferencias.';
  end if;
```

Va antes del `delete`. Se mantiene `estado = 'borrador'` en el `delete`.

### 3.8 `descartar_solicitud`: el cuerpo de `20260911100000` más D6

Va después de leer `v_conteo_id` y antes del `update fabrica_conteos`. El `raise` deshace también el `update` de la solicitud:

```sql
  if v_conteo_id is not null and exists (
       select 1 from fabrica_conteo_items where conteo_id = v_conteo_id and diferencia_estado = 'aplicada') then
    raise exception 'Este conteo tiene diferencias aplicadas al stock. Revertilas en Fábrica › Conteos antes de descartar la solicitud.';
  end if;
```

Hay que mantener la firma `(p_solicitud_id uuid, p_motivo text default null)` tal cual, sin `drop`.

### 3.9 `compras_mover_stock`: **no se redefine**

La rama de auto-curación (caché ≠ ledger → `conteo_fabrica`) queda como red de seguridad: con las policies de §3.11 ya no hay escritores fuera de las RPC. Convertirla en `raise` queda anotado para A4, que es la próxima dueña.

### 3.10 Vistas

**Nueva `v_fabrica_conteo_diferencias`** (dueña A1, solo para Compras):

```sql
create or replace view public.v_fabrica_conteo_diferencias as
select
  fci.id,
  fci.conteo_id,
  fci.item_id,
  ci.nombre                as item_nombre,
  ci.unidad,
  fci.cantidad             as contado,
  fci.contado_en,
  fci.stock_teorico,
  fci.diferencia,
  fci.diferencia_estado,
  fci.diferencia_mov_id,
  fci.diferencia_nota,
  fci.diferencia_resuelta_en,
  rp.nombre                as diferencia_resuelta_por_nombre,
  c.estado                 as conteo_estado,
  c.fecha                  as conteo_fecha,
  c.cerrado_en             as conteo_cerrado_en,
  d.nombre                 as definicion_nombre,
  coalesce(sa.cantidad, 0) as stock_hoy,
  -- D4: lo que se movió desde el cierre, sin contar lo que este conteo aplicó o revirtió.
  case when fci.stock_teorico is not null then
    coalesce(sa.cantidad, 0) - fci.stock_teorico - coalesce((
      select sum(m.delta) from compras_stock_movimientos m
      where m.conteo_id = c.id and m.item_id = fci.item_id and m.tipo in ('ajuste_conteo', 'reversion')
    ), 0)
  end                      as movido_desde_cierre,
  sup.conteo_id            as superado_por_conteo_id,
  sup.etiqueta             as superado_por
from fabrica_conteo_items fci
join fabrica_conteos c on c.id = fci.conteo_id
join fabrica_conteo_definiciones d on d.id = c.definicion_id
join compras_items ci on ci.id = fci.item_id
left join compras_stock_actual sa on sa.item_id = fci.item_id
left join profiles rp on rp.id = fci.diferencia_resuelta_por
left join lateral (
  select c2.id as conteo_id, d2.nombre || ' ' || to_char(c2.fecha, 'DD/MM') as etiqueta
  from fabrica_conteo_items f2
  join fabrica_conteos c2 on c2.id = f2.conteo_id
  join fabrica_conteo_definiciones d2 on d2.id = c2.definicion_id
  where f2.item_id = fci.item_id and c2.estado = 'cerrado' and f2.contado_en is not null
    and c.cerrado_en is not null and c2.cerrado_en > c.cerrado_en
  order by c2.cerrado_en
  limit 1
) sup on true
where c.estado in ('cerrado', 'descartado')
  and tiene_acceso_compras();

grant select on public.v_fabrica_conteo_diferencias to authenticated;
```

**`v_compras_conteos_historial`**: `create or replace`, con las columnas viejas en el mismo orden y las nuevas **al final**. El `where` pasa a `c.estado in ('cerrado','descartado')`, porque un deep link a un conteo descartado tiene que abrir.

```sql
  -- … columnas actuales …,
  c.estado,
  (select s.id     from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_id,
  (select s.estado from compras_solicitudes s where s.conteo_id = c.id order by s.created_at desc limit 1) as solicitud_estado,
  case when tiene_acceso_compras() then (
    select count(*) from fabrica_conteo_items f
    where f.conteo_id = c.id and f.diferencia_estado = 'pendiente'
  )::int end as diferencias_pendientes
```

### 3.11 RLS: el stock solo se escribe por RPC

```sql
drop policy if exists compras_stock_actual_acceso on public.compras_stock_actual;
create policy compras_stock_actual_lectura on public.compras_stock_actual
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

drop policy if exists compras_stock_movimientos_acceso on public.compras_stock_movimientos;
create policy compras_stock_movimientos_lectura on public.compras_stock_movimientos
  for select using (tiene_acceso_compras() or tiene_acceso_fabrica());

-- Lo contado lo escribe solo fabrica_guardar_cantidad_conteo.
drop policy if exists fabrica_conteo_items_modificacion on public.fabrica_conteo_items;

-- El alta (siembra del borrador desde /fabrica/stock) queda acotada a borradores y sin datos del cierre.
drop policy if exists fabrica_conteo_items_alta on public.fabrica_conteo_items;
create policy fabrica_conteo_items_alta on public.fabrica_conteo_items
  for insert with check (
    tiene_acceso_fabrica()
    and contado_en is null and stock_teorico is null and diferencia_estado is null
    and exists (select 1 from fabrica_conteos c where c.id = conteo_id and c.estado = 'borrador')
  );
```

**Antes de escribir esto**, el Ejecutor tiene que confirmar que no hay otros escritores:

```bash
grep -rnE "from\('(compras_stock_actual|compras_stock_movimientos|fabrica_conteo_items)'\)" app lib components scripts
```

Hoy solo `ConteoDesplegable.tsx` escribe en las tablas de stock. `fabrica_conteo_items` lo escriben `ConteoDesplegable` (`update`) y `fabrica/stock/page.tsx` (`upsert ignoreDuplicates`, que pasa a ser solo `insert`). Si aparece otro escritor, frená y avisá.

> Las acciones referenciales de las FK (por ejemplo, el `ON DELETE CASCADE` de `item_id`, que arregla A2a) no pasan por RLS: borrar un insumo sigue funcionando como hoy.

### 3.12 Conciliación del ledger al final (D12)

```sql
do $$
declare v_fuera int;
begin
  insert into compras_stock_movimientos (item_id, delta, tipo, motivo, cantidad_antes, cantidad_despues)
  select a.item_id, a.cantidad - l.saldo, 'conteo_fabrica',
         'Diferencia del conteo de fábrica sin registrar (antes de A1)', l.saldo, a.cantidad
  from compras_stock_actual a
  cross join lateral (select coalesce(sum(m.delta), 0) as saldo from compras_stock_movimientos m where m.item_id = a.item_id) l
  where a.cantidad <> l.saldo;

  select count(*) into v_fuera from compras_stock_actual a
  where a.cantidad <> (select coalesce(sum(delta), 0) from compras_stock_movimientos m where m.item_id = a.item_id);
  if v_fuera <> 0 then
    raise exception 'A1: quedaron % insumos fuera del invariante del ledger', v_fuera;
  end if;
end $$;
```

En dev registra Leche en Polvo −8 (caché 5, ledger 13). El stock que se ve no cambia.

### 3.13 Después de la migración

- `npm run types` (regenera `lib/database.types.ts`).
- **Push a dev:** se le avisa al coordinador y se espera su OK (un solo `db push` a la vez). Después: `npx supabase db push --project-ref fafckqysyvtlslfnpzrh`. Nunca `supabase link`. Cuando termina, se le avisa al coordinador para que mergee `bloque2/stock` a `qa` enseguida.
- Si después del push corregís un cuerpo, reaplicalo en dev con `db query -f`, y que **el archivo quede como versión final** (patrón de F3/F4).

## 4. Server Actions

**`app/admin/fabrica/conteos/acciones.ts`** (nuevo, `'use server'`). Antes de escribirlo, leé `node_modules/next/dist/docs/` sobre Server Functions y `refresh` (AGENTS.md). El patrón es el de `app/admin/compras/stock/acciones.ts`: zod, `createClientTipado`, la RPC, `refresh()` y `Resultado<T>`, sin `throw` a través del borde.

```ts
resolverDiferenciasConteo({ conteoId: uuid, itemIds: uuid[] | null, accion: 'aplicar'|'ignorar'|'revertir', nota?: string })
  → Resultado<{ hechas: number; omitidasSuperadas: number; items: { item_id; nombre; cantidad_despues }[] }>
```

El autoguardado de Fábrica **no** es Server Action, porque `refresh()` en cada tecla re-renderiza la página. Queda `supabase.rpc('fabrica_guardar_cantidad_conteo', …)` desde el cliente, con debounce, como hoy.

## 5. UI, pantalla por pantalla

Vale el protocolo de UX del Bloque 1:
- `impeccable` en modo *shape* antes de codear (la mini-spec va en `docs/bloque2/notas-A1.md`);
- *harden* + `emil-design-eng` después;
- capturas a 375px y en desktop, en tema claro y oscuro, revisadas con `ui-ux-pro-max`;
- `code-review` medium antes del commit.

Además:
- `Modal`, íconos de lucide, tokens semánticos, `useConfirmar()`/`useToast()` de `ProveedorUI`;
- nunca `confirm()`/`alert()` ni `<input type="date">`;
- la fila es clickeable y no hay columna de editar;
- botones ≥ 44px con `useTransition` y spinner.

### 5.1 Fábrica — `/fabrica/stock` (`page.tsx`, `ConteoDesplegable.tsx`, `HistorialGlobal.tsx`)

**`page.tsx`:**
- deja de leer `compras_stock_actual` (se borran las líneas 117-121);
- siembra con `insert` de `{ conteo_id, item_id }` ignorando duplicados (`upsert … ignoreDuplicates` sigue sirviendo), **sin `cantidad`**;
- selecciona `contado_en`;
- `ItemConteoUI` suma `contado: boolean`.

**`ConteoDesplegable.tsx`:**
- `actualizarCantidad(conteoItemId, valor: number | null)` llama a `fabrica_guardar_cantidad_conteo` con debounce de 500 ms. **Se van el upsert del stock y el insert del movimiento.**
- Si hay error: `toast.error(mensajeError(e, 'No se guardó lo contado'))` y el indicador pasa a "No se guardó" (rojo). No puede quedar "✓ Guardado".
- Se borra la prop `usuarioId` si ya nadie la usa.
- **Tile sin contar:**
  - input vacío con placeholder "—";
  - debajo, "Sin contar" en `text-muted`;
  - borde neutro, sin preview de sugerido ni sobrestock.
  
  Las tiles contadas se ven como hoy. Los avisos de "faltan" y "sobrestock" cuentan solo los ítems contados.
- **Encabezado del Collapsible:** suma el badge gris "N sin contar" cuando N > 0.
- **Modal "Cerrar control":**
  - texto nuevo: "Lo que contaste **no cambia el stock**: Compras compara con el sistema y decide.";
  - si N > 0, un recuadro neutro: "Quedan N sin contar (Sal, Leche…): para esos se usa el stock del sistema." Lista hasta 3 nombres y "…".
  
  No bloquea (D2). **Nunca muestra números del sistema.**
- **Eliminar conteo:** el error de §3.7 se muestra con `mensajeError` tal como llega.

**`HistorialGlobal.tsx`:** en el detalle, una línea cuyo ítem tiene `contado_en null` muestra "Sin contar" en vez de la cantidad. Para eso se lee `fabrica_conteo_items(item_id, contado_en)` del conteo, que ya se consulta para el exceso.

```wireframe
<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;background:#0b0b0b;color:#eee;margin:0;padding:12px;max-width:375px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.t{border:1px solid #2a2a2a;border-radius:12px;padding:10px;background:#111}
.n{font-size:11px;color:#999;text-transform:uppercase;font-weight:600}.i{border:1px solid #2a2a2a;border-radius:8px;padding:6px;text-align:center;font-weight:700;margin:6px 0;background:#1a1a1a}
.m{font-size:10px;color:#777}.f{border-color:#7f1d1d}.ok{color:#56d68a;font-size:10px}.hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.b{font-size:10px;border-radius:99px;padding:2px 6px;background:#222;color:#aaa}
</style></head><body>
<div class="hd"><b>Global</b><span><span class="b">3 sin contar</span> <span class="b" style="background:#3b0d0d;color:#f87171">1</span></span></div>
<div class="grid">
<div class="t f"><div class="n">Fécula</div><div class="i" style="color:#fca5a5">12</div><div class="m">Bolsa 25 kg · 30/masa</div><div style="color:#f87171;font-size:10px">⚠ sugerido 8</div></div>
<div class="t"><div class="n">Queso barra</div><div class="i">6</div><div class="m">Caja</div><div class="ok">✓ cubre con stock actual</div></div>
<div class="t"><div class="n">Sal</div><div class="i" style="color:#555">—</div><div class="m">Bolsa · Sin contar</div></div>
<div class="t"><div class="n">Leche en polvo</div><div class="i" style="color:#555">—</div><div class="m">Bolsa · Sin contar</div></div>
</div>
<div style="margin-top:12px;border:1px solid #333;border-radius:12px;padding:10px;font-size:13px">
<b>Cerrar control — Global</b><p style="color:#aaa">Lo que contaste <b style="color:#eee">no cambia el stock</b>: Compras compara con el sistema y decide.</p>
<p style="border:1px solid #333;border-radius:8px;padding:8px;color:#ccc">Quedan 3 sin contar (Sal, Leche en polvo, Pategrás): para esos se usa el stock del sistema.</p></div>
</body></html>
```

### 5.2 Admin › Fábrica › Conteos (`app/admin/fabrica/conteos/page.tsx`, `ConteosFabricaClient.tsx`)

**`page.tsx`:**
- lee `searchParams.conteo` y lo pasa como `conteoInicial`;
- lee `compras_config.conteo.diferencia_resaltar_pct`, con 20 por defecto.

**Lista** (se pasa a `PageHeader` con el ícono `ClipboardCheck` + `DataTable` + `EmptyState`, que es la dirección de diseño vigente):
- columnas Conteo · Ventana · Cerrado · Por · **Diferencias**:
  - `EstadoBadge`/chip "N pendientes" (warning);
  - "Revisado" (success) si tiene diferencias y ninguna pendiente;
  - "Sin diferencias" (muted);
  - "Descartado" (muted) si `estado = 'descartado'`.
- Filtro `Chip` "Con diferencias pendientes (N)", además de la búsqueda y las fechas que ya están.
- Descripción del header: "Lo que contó Fábrica comparado con el stock del sistema. Las diferencias no cambian el stock hasta que las aplicás."

**Deep link `?conteo=<id>`:**
- abre el modal al cargar;
- si el id no está en la lista, `toast.error('No encontramos ese conteo')`;
- al cerrar, `useQuitarParams('conteo')`;
- si el param cambia sin desmontar, `useAlCambiarParam`.

Los dos hooks son de B0 (`components/ui/useParamDeepLink.ts`). Si B0 no está mergeado, se usa `router.replace` inline con un `// TODO(B0): useQuitarParams`.

**Modal del conteo** (`size="xl"`, `pantallaCompletaMobile`):
- **Cabecera:**
  - ventana, quién lo cerró y cuándo, y masas;
  - **link a la solicitud**: `<LinkEntidad entidad={{tipo:'solicitud', id: solicitud_id}} variante="chip" onNavegar={cerrar}>Solicitud de compra · {estado}</LinkEntidad>`;
  - si `estado = 'descartado'`: un banner neutro "Compras descartó la solicitud de este conteo: las diferencias no se aplican".
- **`Tabs`: "Diferencias con el stock" (por defecto) | "Pedido sugerido"** (es la tabla de hoy, sin cambios, con el aviso de sobrestock).
- **Pestaña Diferencias:**
  - Texto fijo arriba: "El conteo no cambia el stock: compara lo contado con lo que decía el sistema al cerrar. Si la diferencia es real, aplicala. Si Fábrica contó mal, ignorala."
  - Barra: **"Aplicar todas las pendientes (N)"** (primario; deshabilitado si N = 0 o si el conteo está descartado).
  - Tabla, con datos de `v_fabrica_conteo_diferencias`:

    | Columna | Contenido |
    |---|---|
    | Insumo | `LinkEntidad {tipo:'insumo', id: item_id} variante="texto" onNavegar={cerrar}` |
    | Esperado (sistema) | `stock_teorico` + unidad; "—" si es null |
    | Contado | `contado` + unidad, o "Sin contar" (muted) |
    | Diferencia | Con signo (`+2`, `−28`), tabular, ámbar si supera el umbral (D11), con el % chico debajo |
    | Estado | Pendiente (warning) · Aplicada (success, "por X, dd/mm") · Ignorada (muted) · Coincide (muted, diferencia 0) · Superada por {superado_por} (muted, con link al otro conteo) · Sin contar |
    | Acción | Pendiente → **Aplicar** + **Ignorar**. Pendiente y superada → solo **Ignorar**. Aplicada o ignorada → **Revertir**. Descartado → nada |

  - Si `movido_desde_cierre ≠ 0` en una fila pendiente: línea chica en ámbar debajo del insumo, "Desde el cierre el stock se movió +3".
  - Mobile 375px: la tabla pasa a tarjetas (insumo arriba; esperado / contado / diferencia en una fila; acciones abajo a lo ancho).
- **Orden:** pendientes primero (por `abs(diferencia)` descendente), después aplicadas e ignoradas, después coincide y sin contar.

**Confirmaciones** (`useConfirmar`, con números concretos; principio "mostrar el impacto"):
- **Aplicar (una):**
  - título "Aplicar diferencia de conteo";
  - cuerpo: "El stock de **Fécula** pasa de **40** a **12** (−28 Bolsa 25 kg).";
  - si `stock_hoy + diferencia < 0`, en ámbar: "Queda en negativo." No bloquea;
  - si `movido_desde_cierre ≠ 0`, en ámbar: "Desde el cierre el stock se movió +3 (remitos, facturas o ajustes). La diferencia se calculó al cerrar: si esa mercadería ya estaba cuando se contó, ya está explicada y conviene ignorarla."
- **Aplicar todas (C2):** "Vas a aplicar **N** diferencias. Las más grandes:" + las 3 de mayor `abs`, con "pasa de X a Y". Si hay superadas: "M quedaron viejas (hay un conteo más nuevo) y no se aplican". Si alguna queda negativa, una línea en ámbar.
- **Revertir aplicada:** "El stock de Fécula vuelve de 12 a 40 (+28). La diferencia queda pendiente otra vez."
- **Ignorar** y **Revertir una ignorada** van sin confirm, porque no mueven stock y se deshacen. Solo toast.

**Después de cada acción:**
- toast ("Diferencia aplicada: Fécula queda en 12", "3 diferencias aplicadas", "Diferencia ignorada");
- se recarga el detalle (con una clave de versión, como en `StockFicha`) y `refresh()` actualiza los badges de la lista;
- si la RPC rechaza, toast con el mensaje y se recarga igual.

```wireframe
<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;background:#0b0b0b;color:#eee;margin:0;padding:16px}
.c{max-width:860px;border:1px solid #2a2a2a;border-radius:16px;padding:16px;background:#111}
.tabs{display:flex;gap:16px;border-bottom:1px solid #2a2a2a;margin:12px 0}.tabs span{padding:8px 0}.on{border-bottom:2px solid #e8c547;color:#e8c547}
table{width:100%;border-collapse:collapse;font-size:13px}th{color:#888;font-size:11px;text-transform:uppercase;text-align:right;padding:8px}th:first-child{text-align:left}
td{padding:10px 8px;border-top:1px solid #222;text-align:right}td:first-child{text-align:left}
.w{color:#f59e0b}.mu{color:#777}.s{color:#56d68a}.bt{border:1px solid #333;border-radius:10px;padding:6px 10px;background:#1a1a1a;color:#eee;margin-left:4px}
.p{background:#e8c547;color:#000;border:0;border-radius:12px;padding:10px 14px;font-weight:700}.chip{background:#222;border-radius:99px;padding:3px 8px;font-size:12px;color:#bbb}
</style></head><body><div class="c">
<b>Global</b> <span class="mu" style="font-size:12px">· ventana 06/10 → 12/10 · cerrado 06/10 18:02 por Fábrica QA · 20 masas</span>
<div style="margin-top:8px"><span class="chip">📄 Solicitud de compra · Abierta</span></div>
<div class="tabs"><span class="on">Diferencias con el stock (3)</span><span class="mu">Pedido sugerido</span></div>
<p class="mu" style="font-size:13px">El conteo no cambia el stock: compara lo contado con lo que decía el sistema al cerrar. Si la diferencia es real, aplicala. Si Fábrica contó mal, ignorala.</p>
<div style="text-align:right;margin:8px 0"><button class="p">Aplicar todas las pendientes (2)</button></div>
<table><tr><th>Insumo</th><th>Esperado (sistema)</th><th>Contado</th><th>Diferencia</th><th>Estado</th><th></th></tr>
<tr><td><u>Fécula</u><div class="w" style="font-size:11px">Desde el cierre el stock se movió +3</div></td><td>40 Bolsa</td><td>12 Bolsa</td><td class="w">−28<div style="font-size:11px">−70 %</div></td><td class="w">Pendiente</td><td><button class="bt">Aplicar</button><button class="bt">Ignorar</button></td></tr>
<tr><td><u>Queso barra</u></td><td>6 Caja</td><td>7 Caja</td><td>+1<div class="mu" style="font-size:11px">+17 %</div></td><td class="w">Pendiente</td><td><button class="bt">Aplicar</button><button class="bt">Ignorar</button></td></tr>
<tr><td><u>Margarina</u></td><td>10 Caja</td><td>9 Caja</td><td>−1</td><td class="s">Aplicada · Admin QA 06/10</td><td><button class="bt">Revertir</button></td></tr>
<tr><td><u>Sal</u></td><td>4 Bolsa</td><td class="mu">Sin contar</td><td class="mu">—</td><td class="mu">Sin contar</td><td></td></tr>
<tr><td><u>Huevos</u></td><td>90 u</td><td>90 u</td><td class="mu">0</td><td class="mu">Coincide</td><td></td></tr>
</table></div></body></html>
```

### 5.3 Compras › Stock (`app/admin/compras/stock/page.tsx`, `StockClient.tsx`, `StockFicha.tsx`)

**`page.tsx`:** suma la consulta a `v_fabrica_conteo_diferencias` con `diferencia_estado = 'pendiente'`, `conteo_estado = 'cerrado'` y `superado_por_conteo_id is null`, agrupada por conteo en `{ conteoId, etiqueta: 'Global 06/10', pendientes }[]`.

**`StockClient.tsx`:**
- **Banner** arriba de los filtros, cuando hay pendientes: tono warning, ícono `ClipboardCheck`, "Hay **N diferencias de conteo** sin aplicar." + un chip por conteo, `<LinkEntidad entidad={{tipo:'conteo', id}} variante="chip">Global 06/10 · 5</LinkEntidad>`.
- **Texto explicativo:** la descripción del `PageHeader` pasa a "Cuánto hay de cada insumo. Lo mueven los remitos, las facturas y los ajustes. **El conteo de fábrica no lo pisa: lo controla.** Si hay diferencias, se aplican desde Fábrica › Conteos." Al lado, un `HelpTooltip` con el porqué ("Antes el conteo reemplazaba el stock y tapaba los errores de carga. Ahora queda la diferencia a la vista y vos decidís.").

  Es importante porque cambia algo que Marcos ya conoce.

**`StockFicha.tsx`** (solo la parte de conteo: B0 no la toca):
- un movimiento con `conteo_id` muestra un chip `<LinkEntidad entidad={{tipo:'conteo', id: m.conteo_id}} variante="chip" onNavegar={onCerrar}><ClipboardCheck/> Conteo</LinkEntidad>`, al lado del chip del remito (mismo `min-h-11`). Vale para `conteo_fabrica`, `ajuste_conteo` y las `reversion` de conteo;
- `ajuste_conteo` deja de mostrar "Revertir" (sale de `TIPOS_REVERTIBLES`) y muestra "Se revierte desde el conteo" en `text-muted text-xs`.

**`lib/compras/movimientos.ts`:** `TIPOS_REVERTIBLES = ['ajuste_manual']`, con el comentario actualizado (los ajustes por factura y por conteo se revierten desde su origen).

### 5.4 Compras › Solicitudes (`SolicitudesClient.tsx`)

El origen "Conteo dd → dd" (`origenSolicitud`, línea ~92, en la lista y en el modal) pasa a ser `<LinkEntidad entidad={{tipo:'conteo', id: s.conteo_id}} variante="texto" onNavegar={…}>`. Es un cambio chico. **B0 también toca este archivo** (`?solicitud=` y la lista de pedidos generados): si B0 ya entró, rebaseá y aplicá encima; si no, hacé el cambio mínimo y avisá en las notas.

El bloqueo de §3.8 llega al toast de "Descartar" a través de `mensajeError`, sin cambios de UI.

### 5.5 Si B0 no está mergeado cuando arranques

`lib/compras/rutas.ts` y `components/ui/LinkEntidad.tsx` viven hoy en `bloque2-pedidos`, sin commitear.

Si al arrancar no están en `origin/qa`:
- usá `<Link href={\`/admin/fabrica/conteos?conteo=${id}\`} onClick={e => { e.stopPropagation(); onNavegar?.() }}>` (y lo análogo para solicitud e insumo), con `// TODO(B0): LinkEntidad`;
- **no crees** tu propia copia de `rutas.ts`.

Cuando B0 entre, se reemplazan en un commit chico.

## 6. Escenarios y casos borde (cómo los resuelve A1)

| # | Escenario | Resultado esperado |
|---|---|---|
| C1 | Fábrica contó mal | Compras **Ignora** la diferencia. O descarta la solicitud (si no hay aplicadas) y Fábrica recuenta en un borrador nuevo, vacío |
| C2 | Diferencia enorme | Ámbar en la tabla. El confirm dice "pasa de 40 a 12" |
| C3 | Se aplicó por error | **Revertir** → contra-movimiento `reversion` con `anula_movimiento_id` y `conteo_id`. La diferencia vuelve a pendiente |
| E1 | Dos conteos cerrados con el mismo insumo | Solo se aplica el más nuevo. El viejo dice "Superada por …" y solo se puede ignorar. "Aplicar todas" lo saltea y lo dice (D5) |
| E2 | Dos borradores abiertos (Global y Bolsaplast el mismo día) | Son independientes. Cada uno sella su teórico al cerrar. Si comparten un insumo, aplica E1 |
| E3 | Entra un remito **mientras** se cierra | El `for share` del cierre lo ordena: o queda dentro del teórico o espera al cierre. Nunca a medias |
| E4 | Entra un remito **después del cierre** con mercadería que ya estaba al contar | "Desde el cierre el stock se movió +N" en la fila y en el confirm, con la sugerencia de ignorar (D4). La diferencia aplicada es la sellada (D3) |
| E5 | Insumos a demanda (Sal, Leche, Pategrás) | Se cuentan y generan diferencias igual que el resto. `a_demanda` solo afecta el sobrestock (F8), que no cambia |
| E6 | Stock teórico negativo (remito borrado después de consumido; en A4, consumo) | Diferencia = contado − (negativo). Aplicar deja lo contado. El confirm avisa si el resultado actual queda negativo, sin bloquear |
| E7 | Ítem sin contar | `cantidad := max(teórico, 0)`, sin diferencia y sin estado. Se ve "Sin contar" en Fábrica y en Compras |
| E8 | Conteo descartado con diferencias aplicadas | `descartar_solicitud` falla con "Revertí las diferencias aplicadas…" (D6) |
| E9 | Aplicar en un conteo descartado | La RPC lo rechaza. La UI no muestra acciones |
| E10 | Borrar un borrador con movimientos del sistema viejo | Mensaje claro (D7). La FK no se toca |
| E11 | Revertir un `ajuste_conteo` desde Stock | Bloqueado: "revertilo desde el conteo" (D9) |
| E12 | Doble clic / dos personas aplican a la vez | `for update` sobre el conteo y el ítem. La segunda recibe "ya se resolvió. Recargá" |
| E13 | Fábrica edita un conteo ya cerrado (pestaña vieja abierta) | La RPC lo rechaza: "Este conteo ya se cerró". No hay policy de `update` |
| E14 | Diferencia 0 | No queda pendiente. Se ve "Coincide" |
| E15 | Insumo sin fila en `compras_stock_actual` | Teórico 0. Aplicar crea la fila (lo hace `compras_mover_stock`) |
| E16 | Conteos viejos (antes de A1) | `stock_teorico` null → sin diferencias ni acciones. Muestran "Sin diferencias" y siguen viéndose como antes |

## 7. Archivos

**En alcance:**
- `supabase/migrations/<ts>_fabrica_conteo_controla.sql` (nuevo)
- `lib/database.types.ts` (regenerado)
- `app/fabrica/stock/page.tsx`, `ConteoDesplegable.tsx`, `HistorialGlobal.tsx`
- `app/admin/fabrica/conteos/page.tsx`, `ConteosFabricaClient.tsx`, `acciones.ts` (nuevo); si el modal crece, un `DiferenciasConteo.tsx` aparte
- `app/admin/compras/stock/page.tsx`, `StockClient.tsx`, `StockFicha.tsx` (solo la parte de conteo)
- `app/admin/compras/stock/historico/HistoricoInsumoClient.tsx` (saltea los ítems con `contado_en null`)
- `app/admin/compras/pedidos/solicitudes/SolicitudesClient.tsx` (solo el link del origen)
- `lib/compras/movimientos.ts` (`TIPOS_REVERTIBLES`)
- `lib/errores.ts` (solo si algún constraint nuevo se puede disparar desde la UI; en principio, no)
- `eslint.config.mjs` (sumar `app/admin/fabrica/conteos/*.tsx` a la regla de hex si queda limpio)
- `docs/bloque2/notas-A1.md` (nuevo: mini-spec, desvíos, verificación, datos de dev, qué va al manual)

**Fuera de alcance** (no tocar):
- `compras_mover_stock` (§3.9), `v_compras_stock_movimientos` (dueña A2c) y los tipos del ledger (no hay tipo nuevo)
- `lib/compras/rutas.ts` y `components/ui/LinkEntidad.tsx` (son de B0)
- Remitos, facturas y diferencias de factura (A2b), pedidos (B1), Insumos (A2a)
- La escritura directa de `fabrica_conteos.masas_proyectadas` y el `update` libre de `fabrica_conteos` desde el navegador: quedan para F9 (anotarlo en las notas)
- Avisos push nuevos (por ejemplo, "N diferencias para revisar"): es B5
- Manual `/ayuda`, guía y presentación: **no se arman por fase** (decisión del usuario del 2026-09-28). En las notas va qué cambiaría en `lib/manual/secciones/{fabrica-conteos,fabrica,compras-stock,compras-solicitudes}.ts`
- **Producción:** nada

## 8. Criterios de aceptación

1. Grep: ningún archivo de `app/`, `lib/`, `components/` ni `scripts/` escribe `compras_stock_actual` ni `compras_stock_movimientos`, y `fabrica_conteo_items` solo se inserta desde `fabrica/stock/page.tsx`.
2. Como `qa-fabrica`, un `insert` directo en `compras_stock_movimientos` o un `update` en `compras_stock_actual` falla por RLS.
3. Cargar un conteo **no cambia** `compras_stock_actual`, y no crea movimientos.
4. Al cerrar: `stock_teorico` = el stock al cerrar; `diferencia` = contado − teórico en los contados; `null` en los no contados; `pendiente` donde la diferencia ≠ 0. El sugerido, el exceso, el sobrestock y la solicitud salen iguales que con F8 para los mismos números contados.
5. Aplicar → un movimiento `ajuste_conteo` con `conteo_id` y motivo "Conteo {lista} dd/mm", y el stock pasa a `stock_antes + diferencia`. Sin movimientos posteriores al cierre, queda igual a lo contado.
6. Revertir → un movimiento `reversion` con `anula_movimiento_id` y `conteo_id`. El stock vuelve y la diferencia queda pendiente. Revertir de nuevo da error.
7. Ignorar → el stock no se mueve. Revertir lo ignorado → pendiente.
8. Un conteo descartado no se puede aplicar. Descartar con diferencias aplicadas da error con salida.
9. Superada: aplicar la vieja da error; "Aplicar todas" la saltea y lo informa.
10. Desde Stock, revertir un `ajuste_conteo` de conteo da error con el mensaje de D9, y la UI no ofrece el botón.
11. Fábrica nunca ve el stock del sistema en `/fabrica/stock`: ni tiles precargadas, ni historial de ítems no contados, ni el modal de cierre.
12. `?conteo=<id>` abre el conteo y el param se limpia al cerrar.
13. La solicitud linkea al conteo y el conteo a la solicitud. El chip de la ficha de Stock lleva al conteo.
14. El banner de Stock cuenta solo las pendientes no superadas de conteos cerrados, y cada chip abre su conteo.
15. **Invariante del ledger en 0 filas** después de la migración y después de toda la QA.
16. `npx tsc --noEmit`, lint de los archivos tocados y `npm run build` sin errores. Cero `as any` nuevos.

## 9. Verificación

### 9.1 Antes de la migración

```bash
cat supabase/.temp/project-ref   # tiene que dar fafckqysyvtlslfnpzrh
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select a.item_id from compras_stock_actual a where a.cantidad <> (select coalesce(sum(delta),0) from compras_stock_movimientos m where m.item_id = a.item_id)"
# Hoy: 1 fila (Leche en Polvo). Después de la migración: 0.
```

### 9.2 SQL de escenarios (dev, en una transacción que se revierte sola)

Patrón de F3/F8: un `do $$ … $$` que corre todo como el usuario simulado y termina con `raise exception 'RESULTADO: %', <jsonb>`. El `raise` deshace todo. Se corre con `npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <archivo>`.

Para simular la sesión:

```sql
perform set_config('request.jwt.claims', json_build_object('sub', '<uuid qa-admin>', 'role', 'authenticated')::text, true);
perform set_config('role', 'authenticated', true);
```

Hay que cambiar a `qa-fabrica` para los pasos de Fábrica. Los uuid salen de `select id, email from auth.users where email like 'qa-%'`.

Casos (cada uno con su `assert` o su comparación dentro del jsonb del resultado):
1. **S1** Borrador de Global: guardar Fécula = teórico − 5 con `fabrica_guardar_cantidad_conteo` → `compras_stock_actual` no cambia y no hay movimientos nuevos.
2. **S2** Cerrar → `stock_teorico` sellado, `diferencia = −5`, `pendiente`. Los ítems sin contar quedan con `diferencia null`. El sugerido y el exceso salen iguales a calcularlos a mano con F8.
3. **S3** Aplicar → stock = teórico − 5 y hay un `ajuste_conteo` con `conteo_id`.
4. **S4** Revertir → stock = teórico y la diferencia queda `pendiente`. Revertir otra vez → error.
5. **S5** Ignorar → sin movimiento. Revertir → pendiente.
6. **S6** Aplicar y después `descartar_solicitud` → error. Revertir → descartar OK. Después, aplicar → error "se descartó".
7. **S7** Después del cierre, `compras_mover_stock(+3, 'entrada_remito')` como postgres → `movido_desde_cierre = 3`. Aplicar → stock = teórico − 5 + 3.
8. **S8** Insertar a mano (como postgres) un segundo conteo cerrado más nuevo de otra lista con el mismo insumo y contado → la vista marca `superado_por`. Aplicar el viejo → error. "Aplicar todas" → `omitidas_superadas = 1`.
9. **S9** Teórico negativo (mover −2 sobre un insumo en 0 antes de cerrar), contar 3 → diferencia +5. Aplicar → 3.
10. **S10** `compras_revertir_movimiento` sobre el `ajuste_conteo` → error D9.
11. **S11** Como `qa-fabrica`: `fabrica_guardar_cantidad_conteo` sobre un conteo cerrado → error. `insert into compras_stock_movimientos` → RLS. `compras_resolver_diferencias_conteo` → "No autorizado".
12. **S12** `eliminar_conteo_fabrica` sobre un borrador con un movimiento insertado a mano → error D7. Sin movimientos → se borra.
13. **Invariante** al final del bloque → 0.

### 9.3 Build y lint

```bash
npm run types && npx tsc --noEmit && npx eslint <archivos tocados> && npm run build
```

### 9.4 QA en el navegador (local contra dev)

- **Dev server:** `npm run dev -- -p 3005` **desde PowerShell** (desde Git Bash, `/admin` da 404 por el `!` de la ruta). Va contra Supabase dev.
- **Cuentas** `qa-fabrica@chipacitos.test` y `qa-admin@chipacitos.test`. La contraseña está en `C:\Dev\Trabajo\4peeq\YA!Chipacitos\docs\qa-credenciales-dev.md` (no se copia a ningún doc ni commit). Se pueden resetear en dev sin preguntar; nunca en prod.
- **Herramientas:** Playwright MCP o `playwright-cli`. Capturas a 375px y en desktop, en tema oscuro y claro, de las cuatro pantallas tocadas.
- **Recorrido:**
  1. `qa-fabrica`: el borrador de Global vacío, con "Sin contar"; contar algunos; recargar (persiste); cerrar con 2 sin contar (aviso).
  2. `qa-admin`: Stock → banner → chip → conteo con diferencias.
  3. Aplicar (confirm con números), Ignorar, Revertir y Aplicar todas.
  4. Ficha de Stock: chip "Conteo" → vuelve al conteo; sin "Revertir" en `ajuste_conteo`.
  5. Solicitudes: el link del origen → conteo, y del conteo → solicitud.
  6. Descartar con una aplicada → toast de error con salida.
  7. Invariante en 0.

### 9.5 Datos de dev

- **Global solo se puede cerrar una vez por día** (índice único de un cerrado por lista y día). Si ese día ya está tomado, usá Bolsaplast o Huevos para el cierre real. Si no queda otra, descartá la solicitud (sin diferencias aplicadas) para liberar el día.
- Anotá en `notas-A1.md` qué conteos y movimientos quedan en dev.

## 10. Commits y cierre

1. `feat(fabrica): el conteo controla y no pisa el stock — migración y RPCs (A1)`: SQL + tipos. Se pushea la rama **después** del `db push` autorizado.
2. `feat(fabrica): diferencias de conteo en Conteos, Stock y Fábrica (A1)`: la UI.
3. Si B0 entra después, `refactor: LinkEntidad en los links de conteo`.

**No commitear** lo que no es tuyo (`Excalidraw/`, `docs/roadmap-marcos.html`, `docs/avances-*`, `docs/entregas/2026-10-01-*`). No editar el plan maestro: las notas van en `docs/bloque2/notas-A1.md`.

## 11. Lista de pruebas para el usuario

Se pasa recién **cuando el coordinador haya mergeado a `qa`**. En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev).

**Circuito 1 — Fábrica cuenta sin ver el sistema** (`qa-fabrica`)
1. Fábrica › Stock → abrir Global. → Las tiles están vacías y dicen "Sin contar". El encabezado dice "N sin contar".
2. Cargar 3 insumos y recargar la página. → Los 3 siguen cargados y el resto "Sin contar".
3. "Cerrar control y pedir a Compras". → El modal dice que lo contado no cambia el stock y lista los que quedan sin contar, sin números del sistema.
4. Cerrar. → Toast "Conteo cerrado". En el historial, los no contados dicen "Sin contar".

**Circuito 2 — Compras revisa** (`qa-admin`)
5. Compras › Stock. → El banner dice "Hay N diferencias de conteo sin aplicar", con un chip "Global dd/mm". El texto del encabezado explica que el conteo no pisa.
6. Abrir un insumo del conteo **antes de aplicar**. → Su stock **no cambió** con el conteo.
7. Tocar el chip del banner. → Se abre Fábrica › Conteos con ese conteo en "Diferencias con el stock": Esperado / Contado / Diferencia, en ámbar las grandes.
8. Aplicar una. → El confirm dice "pasa de X a Y". Toast, y la fila queda "Aplicada · por vos".
9. En Stock, ese insumo. → Hay un movimiento "Ajuste por conteo" con un chip "Conteo" que vuelve al conteo, y sin botón Revertir ("Se revierte desde el conteo").
10. Volver al conteo y Revertir. → El stock vuelve y la diferencia queda pendiente.
11. Ignorar otra. → El stock no se mueve. Revertir la ignorada → vuelve a pendiente.
12. "Aplicar todas las pendientes". → El confirm muestra cuántas y las 3 más grandes. Toast con el total.

**Circuito 3 — Links y casos de error** (`qa-admin`)
13. En el conteo, el chip "Solicitud de compra". → Abre la solicitud. En Solicitudes, el origen "Conteo dd → dd" vuelve al conteo.
14. Recargar con `?conteo=` en la URL y cerrar el modal. → La URL queda limpia y recargar no lo reabre.
15. Con una diferencia aplicada, descartar la solicitud de ese conteo. → Error "Revertí las diferencias aplicadas en Fábrica › Conteos antes de descartar". Revertir y descartar → OK. El conteo queda "Descartado", sin acciones.
16. Mirar en celular (375px) Fábrica › Stock y el conteo en admin. → Las tarjetas se leen, y los botones se tocan sin zoom.
17. Tema claro en las mismas pantallas. → Ámbar y verde legibles.

**Datos de prueba que quedan en dev:** los lista el Ejecutor en `notas-A1.md`.

## 12. Decisiones que necesitan al usuario

- **D1 — Conteo a ciegas:** Fábrica deja de ver el número precargado. Bolsaplast y Huevos, que hoy arrancan con el valor anterior, pasan a arrancar vacíos. ¿OK? Recomendado: sí.
- **D2 — Cerrar con ítems sin contar:** se permite con aviso, y esos ítems toman el stock del sistema sin generar diferencia. ¿OK, o preferís obligar a contar todo antes de cerrar?
- **D6 — Descartar una solicitud con diferencias aplicadas:** se bloquea hasta revertirlas (no se revierte sola). ¿OK?
