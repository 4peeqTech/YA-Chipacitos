# Embolsado sin stock de catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/fabrica/embolsado` deja de intentar mover stock de catálogo al guardar (rol `fabrica` no tiene acceso a Catálogo para cargar los productos faltantes) y oculta de la lista los pools cuya masa ya fue 100% repartida.

**Architecture:** Un cambio en la RPC `guardar_embolsado_fabrica` (Postgres/Supabase) que deja de resolver `producto_id` contra `productos` y de llamar a `mover_stock_terminado`, y un cambio en `EmbolsadoClient.tsx` que deja de mostrar el aviso de "líneas sin producto" y filtra los pools completos de la lista renderizada.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase (Postgres/PL-pgSQL, RPC vía `supabase-js`). Sin librería de testing instalada en el repo — la verificación de cada tarea es manual (SQL directo / dev server + navegador), siguiendo el mismo patrón que el resto de `/fabrica`.

## Global Constraints

- Rama de trabajo: `dev`. Nunca tocar `main` (proyecto Supabase de producción real).
- Antes de aplicar la migración, confirmar que el CLI de Supabase está linkeado al proyecto de **dev**, no al de prod (`npx supabase projects list` o revisar `supabase/.temp/project-ref` si existe) — no hay `supabase/config.toml` versionado en este repo.
- Spec de referencia: `docs/superpowers/specs/2026-08-07-embolsado-sin-stock-catalogo-design.md`.
- No agregar validación, manejo de errores ni refactors fuera de lo descrito acá (p. ej. no tocar `lib/fabrica/pools.ts`, `app/fabrica/embolsado/page.tsx`, Fase 5/6).

---

### Task 1: Migración — `guardar_embolsado_fabrica` deja de mover stock

**Files:**
- Create: `supabase/migrations/20260807150000_fabrica_embolsado_sin_stock.sql`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: RPC `public.guardar_embolsado_fabrica(p_fecha date, p_tamanio_id uuid, p_sabor_id uuid, p_lineas jsonb) returns void` — Task 2 deja de leer un valor de retorno de esta RPC (antes devolvía `integer`).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260807150000_fabrica_embolsado_sin_stock.sql` con este contenido exacto:

```sql
-- Embolsado deja de intentar mover stock: desde bb1fdaa el rol fabrica no
-- tiene acceso a Catálogo, así que no puede cargar los productos que le
-- faltan — el aviso "N líneas no mueven stock" dejó de ser accionable y
-- pasó a ser ruido constante. Cada línea ahora se guarda siempre con
-- producto_id = null, sin buscar match en `productos` ni llamar a
-- mover_stock_terminado. El registro (masa, sabor, tamaño, presentación,
-- kg) se sigue guardando igual — es el dato que más adelante se va a
-- mostrar en el administrador del ERP (fuera de alcance de este cambio).
--
-- La reversa por NETO de movimientos previos (loop que suma
-- fabrica_stock_terminado_mov por embolsado_id y revierte antes del
-- delete) se mantiene sin cambios: sigue siendo necesaria para deshacer
-- movimientos reales que hayan quedado de guardados anteriores a este
-- cambio, cuando el producto sí existía en el catálogo en ese momento.
--
-- El retorno pasa de integer (conteo de líneas sin producto) a void,
-- porque ya no hay nada que contar. create or replace no permite cambiar
-- el tipo de retorno, así que hay que dropear la firma vieja primero —
-- mismo cuidado que la migración anterior documentó para
-- guardar_produccion_fabrica: sin el drop, PostgREST podría seguir
-- resolviendo por una sobrecarga vieja cacheada.
drop function if exists public.guardar_embolsado_fabrica(date, uuid, uuid, jsonb);

create function public.guardar_embolsado_fabrica(
  p_fecha date,
  p_tamanio_id uuid,
  p_sabor_id uuid,
  p_lineas jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  r record;
  v_embolsado_id uuid;
begin
  if not tiene_acceso_fabrica() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) e
    where (e->>'cantidad_kg')::numeric < 0
  ) then
    raise exception 'No se aceptan cantidades negativas';
  end if;

  -- Mismo advisory lock que la versión anterior: evita que dos guardados
  -- concurrentes del mismo pool lean el mismo neto de reversa.
  perform pg_advisory_xact_lock(hashtextextended(p_fecha::text || '|' || p_tamanio_id::text || '|' || p_sabor_id::text, 0));

  for r in
    select producto_id, sum(delta_kg) as neto
    from fabrica_stock_terminado_mov
    where tipo = 'produccion_embolsado'
      and embolsado_id in (
        select id from fabrica_embolsados
        where fecha = p_fecha and tamanio_id = p_tamanio_id and sabor_id = p_sabor_id
      )
    group by producto_id
  loop
    if r.neto <> 0 then
      perform mover_stock_terminado(r.producto_id, -r.neto, 'produccion_embolsado', null, null);
    end if;
  end loop;

  delete from fabrica_embolsados
    where fecha = p_fecha and tamanio_id = p_tamanio_id and sabor_id = p_sabor_id;

  -- group by + having > 0: mismo criterio que la versión anterior para
  -- permitir dos líneas con la misma presentación en la UI sin pisar el
  -- unique index, descartando ceros.
  for r in
    select presentacion_id, sum(cantidad_kg) as cantidad_kg
    from jsonb_to_recordset(coalesce(p_lineas, '[]'::jsonb)) as x(presentacion_id uuid, cantidad_kg numeric)
    group by presentacion_id
    having sum(cantidad_kg) > 0
  loop
    insert into fabrica_embolsados (fecha, tamanio_id, sabor_id, presentacion_id, cantidad_kg, producto_id, cargado_por, updated_at)
    values (p_fecha, p_tamanio_id, p_sabor_id, r.presentacion_id, r.cantidad_kg, null, auth.uid(), now())
    returning id into v_embolsado_id;
  end loop;
end;
$$;
```

- [ ] **Step 2: Aplicar la migración al proyecto de dev**

Confirmar primero a qué proyecto está linkeado el CLI:

Run: `npx supabase projects list`
Expected: la fila marcada como enlazada (●) corresponde al proyecto de **dev/test**, no al de producción ("YA! mayorista"). Si no está claro cuál es cuál, preguntar antes de continuar — no hacer push a ciegas.

Una vez confirmado:

Run: `npx supabase db push`
Expected: salida incluye `Applying migration 20260807150000_fabrica_embolsado_sin_stock.sql...` y termina sin error.

- [ ] **Step 3: Verificar manualmente en SQL que la RPC ya no mueve stock**

Contra la base de dev (SQL editor de Supabase o `psql`), con una terna `tamanio_id`/`sabor_id`/`presentacion_id` que sepas que **no** tiene producto en `productos`:

```sql
select public.guardar_embolsado_fabrica(
  current_date,
  '<tamanio_id de prueba>'::uuid,
  '<sabor_id de prueba>'::uuid,
  '[{"presentacion_id": "<presentacion_id de prueba>", "cantidad_kg": 10}]'::jsonb
);

select producto_id, cantidad_kg from fabrica_embolsados
where fecha = current_date and tamanio_id = '<tamanio_id de prueba>'::uuid;
```

Expected: la primera consulta no lanza excepción y no devuelve ninguna columna de conteo (retorno `void`). La segunda muestra la fila insertada con `producto_id = null` y `cantidad_kg = 10`. Confirmar además que no se insertó ninguna fila nueva en `fabrica_stock_terminado_mov` para ese `embolsado_id`.

Borrar la fila de prueba antes de seguir: `delete from fabrica_embolsados where fecha = current_date and tamanio_id = '<tamanio_id de prueba>'::uuid;`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260807150000_fabrica_embolsado_sin_stock.sql
git commit -m "feat: embolsado deja de intentar mover stock de catálogo"
```

---

### Task 2: Frontend — sin aviso de error, pools completos ocultos

**Files:**
- Modify: `app/fabrica/embolsado/EmbolsadoClient.tsx`

**Interfaces:**
- Consumes: RPC `guardar_embolsado_fabrica` de Task 1 (ya no devuelve conteo, solo `{ error }`).
- Produces: ninguna otra task consume esto — es la última.

- [ ] **Step 1: Agregar `poolsVisibles` derivado de `pools`**

En `app/fabrica/embolsado/EmbolsadoClient.tsx`, el `useMemo` de `pools` termina así (líneas 72-81):

```tsx
  const pools: PoolCongelado[] = useMemo(() => {
    return agruparPoolCongelado(produccionesIniciales, embolsados, dia).map(pool => ({
      ...pool,
      // Un pool que existe solo por embolsados (sin producción del día) no
      // trae nombre legible desde agruparPoolCongelado — se completa acá
      // con el catálogo, que sí lo tiene siempre.
      tamanioNombre: pool.tamanioNombre === '—' ? (nombreTamanio.get(pool.tamanioId) ?? '—') : pool.tamanioNombre,
      saborNombre: pool.saborNombre === '—' ? (nombreSabor.get(pool.saborId) ?? '—') : pool.saborNombre,
    }))
  }, [produccionesIniciales, embolsados, dia, nombreTamanio, nombreSabor])
```

Justo debajo de ese bloque (antes del `useEffect` que sigue en la línea 83), agregar:

```tsx

  // Un pool con toda su masa ya repartida en presentaciones guardadas deja
  // de listarse: sin stock de catálogo no hay nada más que reconciliar
  // sobre él. Tolerancia de 0.01 kg por redondeo, mismo orden de magnitud
  // que `difiereMucho` más abajo.
  const poolsVisibles = useMemo(
    () => pools.filter(pool => Math.abs(pool.restanteKg) > 0.01),
    [pools]
  )
```

- [ ] **Step 2: Simplificar `guardarPool` — sin toast de "sin producto"**

Ubicar en el mismo archivo la función `guardarPool` (contiene la llamada `supabase.rpc('guardar_embolsado_fabrica', ...)`). Reemplazar:

```tsx
    const { data: sinProducto, error } = await supabase.rpc('guardar_embolsado_fabrica', {
      p_fecha: dia,
      p_tamanio_id: pool.tamanioId,
      p_sabor_id: pool.saborId,
      p_lineas: lineas.map(l => ({ presentacion_id: l.presentacionId, cantidad_kg: l.cantidadKg })),
    })
```

por:

```tsx
    const { error } = await supabase.rpc('guardar_embolsado_fabrica', {
      p_fecha: dia,
      p_tamanio_id: pool.tamanioId,
      p_sabor_id: pool.saborId,
      p_lineas: lineas.map(l => ({ presentacion_id: l.presentacionId, cantidad_kg: l.cantidadKg })),
    })
```

Y más abajo, reemplazar el bloque final de la misma función:

```tsx
    if (sinProducto > 0) {
      toast.error(`${sinProducto} línea${sinProducto > 1 ? 's' : ''} no mueven stock — falta el producto con esa combinación en el catálogo`)
    } else {
      toast.success('Embolsado guardado')
    }
  }
```

por:

```tsx
    toast.success('Embolsado guardado')
  }
```

- [ ] **Step 3: Usar `poolsVisibles` en el render + nuevo estado vacío**

Reemplazar el bloque de render (líneas 187-191 originales):

```tsx
      {pools.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">No hay masa de congelado cargada este día.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pools.map(pool => {
```

por:

```tsx
      {pools.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">No hay masa de congelado cargada este día.</p>
        </Card>
      ) : poolsVisibles.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#888]">Toda la masa de este día ya fue embolsada.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {poolsVisibles.map(pool => {
```

El resto del `.map` (cálculo de `key`, `lineas`, `sumaLineas`, `restante`, `difiereMucho`, y el JSX de la `Card`) queda exactamente igual — no depende de si viene de `pools` o `poolsVisibles`, solo cambia la fuente del `.map`.

- [ ] **Step 4: Verificar manualmente en el navegador**

Run: `npm run dev`

En `http://localhost:3000/fabrica/embolsado` (con un usuario rol `fabrica` o `admin`):

1. Elegir un pool cuyo tamaño+sabor no tenga producto en catálogo, cargar una cantidad **menor** al total de masa disponible y guardar.
   Expected: toast verde "Embolsado guardado" (ya no aparece el toast rojo de "líneas no mueven stock"), el pool sigue visible con el "restante" actualizado.
2. Completar el resto de la masa de ese mismo pool (que "restante" llegue a 0) y guardar.
   Expected: el pool desaparece de la lista. Si era el único pool del día, aparece la tarjeta "Toda la masa de este día ya fue embolsada."
3. Cambiar entre los chips "Hoy"/"Ayer" y confirmar que el filtro de completos aplica en ambos días de forma independiente.

- [ ] **Step 5: Commit**

```bash
git add app/fabrica/embolsado/EmbolsadoClient.tsx
git commit -m "feat: embolsado oculta pools completos y deja de avisar por stock sin mover"
```
