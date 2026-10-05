# A2b — Unidades de medida (especificación ejecutable)

> Planificador: agente `ea3b75d4`, 2026-10-05. Rama `bloque2/stock`, reseteada a `origin/qa` @ `b11d729` (B0, A1, B1 y A2a adentro).
> Plan maestro: `C:\Users\spruy\.claude\plans\bloque2-stock-unidades-historial.md`: fase A2b, decisiones **U1–U3** (confirmadas), "Diagnóstico › Unidades de medida" y la tabla de dueños.
> Contratos que se respetan: `plan-B1.md` §3.1 y `notas-B1.md` ("Para A2b"); `notas-A2a.md` ("Para otras fases").
> El Ejecutor implementa **esto**, sin improvisar. Si la realidad no encaja, frena y avisa al coordinador.

**Reglas que no se negocian:**
- Solo dev (`fafckqysyvtlslfnpzrh`) y QA. **Prod no se toca, ni para leer.** Nunca `supabase link`. Siempre `--linked --project-ref fafckqysyvtlslfnpzrh`.
- Cero triggers. El stock se mueve **solo** con `compras_mover_stock`, siempre en unidad de compra. Los kg **nunca** entran al ledger.
- **Prerrequisito para arrancar el código:** B2 mergeada en `qa`. A2b toca las líneas de `FacturaForm` y adapta el comprobante y el mensaje de factura que crea B2 (orden del plan maestro: B0 → B2 → A2b). El SQL y los escenarios (§3, §9.2) se pueden preparar antes.
- Migración `supabase/migrations/20261005180000_compras_unidades_medida.sql`. El timestamp tiene que ser **mayor que `20261005170000`** (B2) y que el último de `qa` al momento del push. Si al rebasear hay uno mayor, se renombra.
- Antes del push: `git fetch && git rebase origin/qa`, el OK del coordinador y un solo push a la vez.

---

## 0. Qué cambia, en una línea

El insumo dice explícitamente en qué se compra y se cuenta ("Caja"), cuánto trae cada una ("16,5 kg" nominal), en qué unidad base se mide (kg / unidades / litros) y, **por proveedor**, si cobra por caja o por kg. El stock sigue en cajas, con decimales (U3). El remito suma cajas y guarda aparte los **kg reales**. La factura carga cajas y kg y, cuando el proveedor cobra por kg, el subtotal sale de **kg × $/kg**. Las diferencias comparan cajas y muestran los kg como información. Los remitos dejan rastro en el historial del pedido (creado, editado con diff, eliminado), con el contrato de B1.

## 1. Relevamiento del código vigente (`qa` @ `b11d729`)

### 1.1 Funciones que A2b redefine (cuerpo vigente)

| Objeto | Cuerpo vigente | Qué hace hoy | Qué le falta |
|---|---|---|---|
| `compras_guardar_remito(uuid, uuid, date, jsonb, text) → jsonb` | `20260930180000:13-211` | Alta y edición. Reconcilia el stock por diferencia por insumo, recalcula el pedido y las diferencias de la factura | Kg reales; eventos `remito_creado` y `remito_editado` |
| `compras_eliminar_remito(uuid) → jsonb` | `20260928190000:249-314` | Contra-movimientos, borrado y recálculo. Frena si el pedido está facturado | Evento `remito_eliminado` |
| `compras_guardar_factura(…9 args) → jsonb` | `20260928190000:322-525` | Borrador: líneas con `cantidad × precio_unitario` | `cantidad_base` y `precio_por` |
| `compras_confirmar_factura(uuid, boolean, boolean, uuid, text) → jsonb` | `20260929120000:752-934` | Remito "desde factura" con `fi.cantidad`; `precio_ref = precio_unitario` sin saber en qué unidad; gasto | Kg en el remito automático; `precio_ref` con su `cobra_por` y en el historial del insumo (`origen = 'factura'`); evento `remito_creado` |
| `compras_anular_factura(uuid, text) → jsonb` | `20260929120000:937-1050` | Si hay remito "desde factura", lo borra y revierte el stock | Evento `remito_eliminado` (**no tiene dueño en el plan maestro**: lo toma A2b, ver §2 E14) |
| `compras_diferencias_calculadas(uuid) → table` | `20260929120000:164-214` | Facturado vs. recibido por insumo, en la cantidad cruda | Kg como información |
| `compras_guardar_insumo(uuid, jsonb, jsonb) → jsonb` | `20261005150000:128-407` (A2a; `160500` no la tocó) | Campos del insumo + pares con proveedor, con historial | `unidad_base`, `cobra_por_default`, `cobra_por` por par |
| `v_compras_pedido_pendiente` | `20260924200000` | Pedido / recibido / pendiente por línea del pedido | Unidad base, contenido, `cobra_por` del par, kg recibidos |
| `v_compras_factura_diferencias` | `20260929120000:1087-1097` | Diferencias con nombres | Kg |
| `v_compras_insumos_resumen` | `20261005150000:597-652` | Stock, pedido abierto y precios | `cobra_por` del principal y `precio_por` del último precio |

**Los que no se tocan:** `compras_recalcular_diferencias_factura` (plpgsql: lee `compras_diferencias_calculadas` por nombre de columna, sin dependencia fuerte), `compras_resolver_diferencia` (ajusta por `d.diferencia`, que pasa a estar en cajas por construcción), `compras_mover_stock` y `compras_recalcular_estado_pedido`. Tampoco se toca `compras_guardar_pedido`, que es de B1 (ver E12).

### 1.2 Tablas

- `compras_items`: `unidad` (texto libre: unidad de compra **y** de stock), `cantidad_por_unidad` (default 1), `cantidad_por_masa`, … No hay unidad base.
- `compras_item_proveedores`: `unique (item_id, proveedor_id)`, `precio_ref numeric`, `activo`, `es_principal`. RLS solo lectura (A2a).
- `compras_remito_items`: `cantidad`, `precio` (legacy, sin uso). **RLS `for all using (tiene_acceso_compras())`** (`20260804150000:45-50`). Nadie escribe directo desde la app (grep: 0 `insert/update/delete` sobre remitos).
- `compras_factura_items`: `unidad`, `cantidad`, `precio_unitario numeric(14,4)`, `subtotal` e `iva` **generadas** (`round(cantidad * precio_unitario, 2)`). RLS `for all using (es_admin())`, sin escritores directos.
- `compras_factura_discrepancias`: `cantidad_recibida`, `cantidad_facturada`, `diferencia` generada. Solo lectura.
- `compras_pedido_eventos` (B1): el único escritor es `compras_registrar_evento_pedido(pedido, tipo, detalle)`, sin `execute` para `authenticated`. Los tipos `remito_creado`, `remito_editado` y `remito_eliminado` ya están en el check.
- Ledger: `compras_stock_movimientos` y `compras_stock_actual`, de solo lectura por RLS (A1).

### 1.3 Contrato de B1 para remitos: **lo que de verdad parsea la app**

`plan-B1.md` §3.1 dice que `remito_editado` lleva `lineas?: <diff>`, pero el parser implementado es `remito_editado: Diff.extend({ remito_id, secuencia })` (`lib/compras/historialPedido.ts:68`). O sea, `agregados`, `quitados` y `cambiados` van **en el primer nivel** del `detalle`. **A2b escribe lo que parsea el código**, no lo que dice el plan. Los esquemas son `z.object` sin `.strict()`: las claves extra que suma A2b no rompen nada.

La vista `v_compras_pedido_eventos` (B1) inventa `remito_creado` desde `compras_remitos` solo si no existe la fila en la tabla. No hace falta redefinirla.

### 1.4 Consumidores en la app

- **Remito:** `remitos/modelo.ts` (estado, envío, impacto), `RemitoForm.tsx:338-376` (líneas del pedido: `InputNumero` de cantidad + `l.unidad`) y `:380-430` (libres), `remitos/acciones.ts` (zod `Linea` → `p_items`), `remitos/datos.ts` (selects).
- **Factura:** `facturas/modelo.ts` (`LineaFactura`, `lineaDePedido`, `estadoInicial`, `validar`, `armarEnvio`), `FacturaForm.tsx:562-695` (líneas; **son de A2b**) y `:744-752` (checkbox "Actualizar los precios de referencia…"; el conteo está en `:305-307`), `ConfirmarFacturaModal.tsx:56,106-111` (resumen "Se actualiza el precio…"), `DiferenciasPanel.tsx:26-31,157,229`, `facturas/acciones.ts:104,130`, `facturas/datos.ts:20-70`.
- **Totales:** `lib/compras/totalesFactura.ts:25-63` (`LineaTotalizable`, `subtotalLinea`, que replica la columna generada).
- **Insumo:** `InsumoModal.tsx:128-140` (estado), `:204-227` (`datosCambiados` y validación), `:414-483` (filas de proveedor: estrella, nombre, tachito, código, precio ref.), `:523-531` ("Unidad de compra *" y "Cantidad por unidad"); `insumos/acciones.ts:18-95` (zod `Datos` `.partial().strict()`, `COLUMNA`, `p_proveedores`).
- **Pedido:** `PedidoEditor.tsx:108-110` (`lineaDeItem` copia `item.unidad`), `:253-260` (la unidad es un input libre **en todas las líneas**), `:154-165` (payload); `pedidos/acciones.ts:13-47`.
- **Mensaje de WhatsApp:** `lib/compras/pedidoMensaje.ts:3-7,31-38` (`ItemMensaje = {descripcion, unidad, cantidad}`; línea `— {cant} {unidad} {desc}` en mayúsculas). Lo usan `PedidoEnvio.tsx:40-53` y `PlantillasClient.tsx:52` (vista previa).
- **Stock con unidad:** `StockClient.tsx:147,153-156`, `StockFicha.tsx:137,141`, `InsumosClient.tsx:242,301-325` (`otraUnidad` / "Facturado en X").
- **B2** (en `origin/bloque2/pedidos`, todavía sin mergear): `lib/compras/comprobanteFactura.ts`, `facturaMensaje.ts:24-25` (`lineaDetalle`: `— {cant} {unidad} {desc}: {subtotal}`), `cargarComprobante.ts:38` (select de ítems) y `ComprobanteImagen.tsx`. Usan `calcularTotales(lineas)` para el desglose por alícuota: **con una línea en kg daría mal** si no se le pasan `cantidadBase` y `precioPor` (§7.4).
- **Fábrica:** `lib/fabrica/calculoSugerido.ts:40-60,109-110` ya convierte la receta (unidad base implícita) a unidad de compra con `cantidad_por_unidad`. **No cambia en A2b:** A3 va a leer `unidad_base`.

### 1.5 Datos de dev (consultas de solo lectura, 2026-10-05)

- PostgreSQL **17.6**, así que `ALTER COLUMN … SET EXPRESSION` está disponible.
- **59 insumos.** 10 en "Materia prima" (Fécula Bolsa/25, Huevos Cajón/360, Leche en Polvo Bolsa/20, Margarina Caja/10, Polvo de Hornear Pote/4, Queso Barra Caja/16,5, Queso Pategrás Caja/9 (archivado), Queso Sardo "Sardo"/3, Sal Bolsa/20) + "Prueba 1" (kg, Limpieza). **Los otros 48 son descartables, limpieza y reventa** (bolsas, bobinas, guantes, vasos, medialunas…), sin categoría, con `cantidad_por_unidad = 1` y **36 con la unidad vacía**. Hay nombres con la unidad adentro: "Ananá (kg)", "Frutilla (kg)", "Mango (kg)", "Frutos Rojos (kg)".
- **Facturas: 4 confirmadas (31 líneas en total, contando las anuladas). Todas las líneas tienen la misma unidad que su insumo.** No hay ninguna factura en kg sobre un insumo en cajas. Hay 1 diferencia pendiente (Huevos, 14 vs. 16 Cajón).
- 11 remitos (1 "desde factura"), 40 líneas. 0 eventos de remito en `compras_pedido_eventos`.
- 14 pares con `precio_ref`: todos se cobran por unidad de compra (Queso Barra $ 2.000 por Caja, dato de prueba).
- 111 líneas de pedido: 106 con la unidad del insumo, 2 distintas (Crema Pastelera "kg" con el insumo sin unidad) y 1 sin unidad.
- Invariante del ledger: **0** desfasados.

## 2. Decisiones de diseño (tomadas acá; las que necesitan al usuario están en §13)

| # | Decisión | Por qué |
|---|---|---|
| E1 | `compras_items.unidad` **sigue siendo** la unidad de compra y de stock (texto: "Caja"). Se suman `unidad_base` (`kg` \| `unidades` \| `litros`, not null) y `cobra_por_default` (`unidad` \| `base`, default `unidad`). `cantidad_por_unidad` es el **contenido nominal** (cuánta unidad base trae 1 unidad de compra). | U3: el stock no se reescribe. Nada de lo que hoy lee `unidad` cambia de significado. |
| E2 | `compras_item_proveedores.cobra_por` es **not null** y se llena explícitamente. El default del insumo solo se usa para **prellenar** un par nuevo. | Una regla por par, sin herencia escondida: si cambia el default, no cambia en silencio cómo cobra un proveedor que ya existe. |
| E3 | `compras_remito_items.cantidad_base`: los kg reales, **opcionales** y > 0. Solo en líneas con insumo. No mueven stock. | U1: el remito carga el dato que cambia en cada entrega. |
| E4 | `compras_factura_items` suma `cantidad_base` (> 0, opcional) y `precio_por` (`unidad` \| `base`, default `unidad`). **Check: `precio_por = 'base'` exige `cantidad_base`.** `subtotal` = `round((case precio_por when 'base' then cantidad_base else cantidad end) × precio_unitario, 2)`, e `iva` igual. Cambian con `ALTER COLUMN … SET EXPRESSION` (§3.4). | No se pierde nada: las filas viejas quedan con `precio_por = 'unidad'` y dan el mismo número. El check hace innecesario el `coalesce` del plan maestro y evita cobrar cajas a precio de kilo. |
| E5 | Una línea de factura con `precio_por = 'base'` exige también `cantidad > 0` (cajas) y un insumo. | Sin cajas, el remito automático no suma stock y la diferencia sale sola. Un flete no se cobra por kg. |
| E6 | **Diferencias:** la comparación no cambia (`cantidad` contra `cantidad`): ahora las dos están en unidad de compra **por construcción**. `compras_diferencias_calculadas` devuelve además los kg facturados y recibidos. Cuando una línea no tiene kg reales, cae a nominal (`cantidad × contenido`), con una bandera `*_base_real = false`. | U1–U3: los kg son información. El fallback cubre las facturas y los remitos viejos. |
| E7 | **El precio de referencia viaja con su unidad.** Confirmar con "Actualizar precios" pone `precio_ref = precio_unitario` **y** `cobra_por = precio_por` de la última línea del insumo. Cada cambio queda en `compras_items_historial` con `origen = 'factura'`. | Un `precio_ref` sin su unidad es el bug de hoy ($/kg sobre un insumo en cajas). La última factura dice cómo cobra el proveedor. El pedido de `notas-A2a` §"Para otras fases" se cumple acá. |
| E8 | En Insumos, cambiar el `cobra_por` de un par con precio **convierte el precio en el formulario** (÷ o × contenido), con el valor convertido a la vista y editable. La RPC guarda lo que llega y registra los dos cambios. | Es visible y no hay magia en el servidor. |
| E9 | **Peso variable:** solo avisos, nunca bloquea ni genera una diferencia. (a) Kg reales contra nominal: aviso si el desvío es mayor a 10 %. (b) Kg de la factura contra kg del remito: aviso si el desvío es mayor a 1 %. Las constantes viven en `lib/compras/unidades.ts`. | El dato es real y el contenido nominal es aproximado. El aviso (a) agarra los errores de tipeo (330 en vez de 33). El (b) es plata. Ver D3. |
| E10 | **Eventos de remito**, con el contrato **del parser** (§1.3): `remito_creado` desde guardar remito y desde el remito automático de confirmar factura; `remito_editado` con el diff de líneas (incluye los kg), fecha y número; `remito_eliminado` desde eliminar remito y desde anular factura. Las líneas del evento llevan `cantidad_base`. **Backfill** de un `remito_creado` por remito existente, con su `created_at` y su autor. | Trazabilidad completa. Con el backfill, un remito viejo que se borra después de A2b no pierde su "Llegó un remito". |
| E11 | El diff de remito es una función propia, `compras_diff_lineas_remito`: el algoritmo de `compras_diff_lineas` (B1) **+ `cantidad_base`**. No se modifica la de B1. | La de B1 no ve un cambio que es solo de kg, y tocarla cambiaría el `detalle` de `items_editados`. |
| E12 | **Pedido:** la unidad de una línea con insumo sale del insumo. La pantalla la muestra fija. La server action `guardarPedido` normaliza `unidad = compras_items.unidad` (si el insumo no tiene, deja la de la línea). **No se redefine `compras_guardar_pedido` (B1).** Las líneas libres siguen con texto. | U1, sin reabrir una función de 120 líneas de otra fase. Desde la RLS de B1 el pedido solo se escribe por la server action, así que alcanza. |
| E13 | **RLS de solo lectura** en `compras_remitos`, `compras_remito_items`, `compras_facturas` y `compras_factura_items` (select con la misma condición de hoy). | Mismo criterio que B1 (E16, aprobado): sin esto, un `PATCH` directo esquiva el ledger, los kg y los eventos. No hay escritores directos (§1.2). |
| E14 | A2b redefine `compras_anular_factura` (solo para el evento). **El coordinador la suma a la tabla de dueños: A2b, después B4.** | Es la única otra función que borra un remito. |
| E15 | `compras_guardar_insumo` bloquea el insumo con `for no key update` (antes `for update`). | Confirmar factura ahora escribe `compras_items_historial`, que toma `KEY SHARE` sobre el insumo. Con `FOR UPDATE` en Insumos, una edición del insumo y una confirmación con "actualizar precios" podían bloquearse en cruz (el mismo patrón que se arregló en `160500`). `NO KEY UPDATE` no choca con `KEY SHARE` y sigue serializando dos ediciones del mismo insumo. |
| E16 | `unidad_base` inicial **por regla**: kg para la "Materia prima" menos los huevos, para las unidades tipo kg y para los nombres con "(kg)"; litros para las unidades tipo litro; unidades para el resto. Más una lista de revisión con `raise notice`. | Ver D1: "kg salvo huevos" (plan maestro) no sirve para los 48 descartables. |
| E17 | `cobra_por_default` y `cobra_por` arrancan en **`unidad` para todos**. La migración no cambia cómo se cobra nada. | Hasta hoy todo se facturó por unidad de compra. El queso por kg se configura a mano (D2). |

## 3. Migración `supabase/migrations/20261005180000_compras_unidades_medida.sql`

> Cabecera de comentario como las otras: qué es A2b (U1–U3), que el stock sigue en unidad de compra, que los kg no tocan el ledger, que hay cero triggers y que los eventos de remito siguen el contrato de B1.
> Secciones en este orden. Cada función redefinida dice "cuerpo de `<archivo>:<líneas>` + …" y marca sus cambios con `-- A2b`. **Se parte del cuerpo vigente en `qa` y se copia entero:** acá se especifican solo los cambios.

### 3.1 Columnas y restricciones

```sql
-- Insumo
alter table compras_items
  add column if not exists unidad_base text,
  add column if not exists cobra_por_default text not null default 'unidad';

comment on column compras_items.unidad is
  'Unidad de compra y de stock (Caja, Bolsa, Cajón…). El stock se cuenta en esta unidad, con decimales (U3).';
comment on column compras_items.cantidad_por_unidad is
  'Contenido nominal: cuánta unidad base trae 1 unidad de compra (1 Caja = 16,5 kg). Cada entrega real puede variar.';
comment on column compras_items.unidad_base is 'kg | unidades | litros. La unidad de la receta y de los kg reales.';
comment on column compras_items.cobra_por_default is
  'unidad | base. Con qué arranca un proveedor nuevo del insumo. La regla vigente es compras_item_proveedores.cobra_por.';

-- (§3.2 llena unidad_base y después:)
alter table compras_items
  alter column unidad_base set not null,
  alter column unidad_base set default 'unidades',
  add constraint compras_items_unidad_base_valida check (unidad_base in ('kg', 'unidades', 'litros')),
  add constraint compras_items_cobra_por_default_valido check (cobra_por_default in ('unidad', 'base'));

-- Par insumo–proveedor (U2)
alter table compras_item_proveedores add column if not exists cobra_por text;
update compras_item_proveedores ip set cobra_por = i.cobra_por_default
  from compras_items i where i.id = ip.item_id and ip.cobra_por is null;
alter table compras_item_proveedores
  alter column cobra_por set not null,
  alter column cobra_por set default 'unidad',
  add constraint compras_item_proveedores_cobra_por_valido check (cobra_por in ('unidad', 'base'));
comment on column compras_item_proveedores.cobra_por is
  'unidad = precio_ref por unidad de compra ($/Caja); base = por unidad base ($/kg).';

-- Remito: kg reales (U1)
alter table compras_remito_items
  add column if not exists cantidad_base numeric,
  add constraint compras_remito_items_cantidad_base_positiva check (cantidad_base is null or cantidad_base > 0);
comment on column compras_remito_items.cantidad_base is
  'Kg (o la unidad base) reales de esta entrega. Informativo: el stock se mueve con cantidad.';

-- Factura
alter table compras_factura_items
  add column if not exists cantidad_base numeric,
  add column if not exists precio_por text not null default 'unidad',
  add constraint compras_factura_items_precio_por_valido check (precio_por in ('unidad', 'base')),
  add constraint compras_factura_items_cantidad_base_positiva check (cantidad_base is null or cantidad_base > 0),
  add constraint compras_factura_items_base_con_cantidad check (precio_por = 'unidad' or cantidad_base is not null);
```

### 3.2 Datos: `unidad_base` inicial y lista de revisión (E16, E17)

Un solo `do $$ … $$`:

```sql
do $$
declare r record; v_mp boolean;
begin
  v_mp := exists (select 1 from compras_categorias where lower(btrim(nombre)) = 'materia prima');
  if not v_mp then
    raise notice 'A2b: no existe la categoría "Materia prima". Ningún insumo pasa a kg por categoría: revisá la lista.';
  end if;

  update compras_items i set unidad_base = case
      when i.unidad ~* '^\s*(kg|kgs|kilo|kilos|kilogramos?)\.?\s*$' or i.nombre ~* '\(\s*kg\s*\)' then 'kg'
      when i.unidad ~* '^\s*(l|lt|lts|litro|litros)\.?\s*$' then 'litros'
      when lower(btrim(c.nombre)) = 'materia prima' and i.nombre !~* 'huevo' then 'kg'
      else 'unidades'
    end
  from compras_items i2
  left join compras_categorias c on c.id = i2.categoria_id
  where i2.id = i.id and i.unidad_base is null;

  -- Lista de revisión manual.
  for r in select nombre, coalesce(unidad, '∅') u, cantidad_por_unidad cpu from compras_items
           where unidad_base = 'kg' order by nombre loop
    raise notice 'A2b revisar [kg]: % → 1 % = % kg', r.nombre, r.u, trim_scale(r.cpu);
  end loop;
  for r in select nombre, unidad_base from compras_items
           where nullif(btrim(unidad), '') is null order by nombre loop
    raise notice 'A2b revisar [sin unidad de compra]: % (base %)', r.nombre, r.unidad_base;
  end loop;
  for r in select nombre, unidad from compras_items
           where unidad_base <> 'unidades' and cantidad_por_unidad = 1
             and coalesce(unidad, '') !~* '^\s*(kg|kgs|kilo|kilos|l|lt|lts|litro|litros)\.?\s*$' order by nombre loop
    raise notice 'A2b revisar [contenido 1 con unidad que no es la base]: % (%)', r.nombre, coalesce(r.unidad, '∅');
  end loop;

  -- Chequeo pedido por el plan maestro: facturas confirmadas en kg sobre insumos en cajas.
  for r in
    select f.numero, f.estado, p.numero as pedido, i.nombre, fi.unidad as u_fact, i.unidad as u_item, fi.cantidad
    from compras_factura_items fi
    join compras_facturas f on f.id = fi.factura_id
    join compras_pedidos p on p.id = f.pedido_id
    join compras_items i on i.id = fi.item_id
    where f.estado <> 'anulada'
      and lower(btrim(coalesce(fi.unidad, ''))) is distinct from lower(btrim(coalesce(i.unidad, '')))
  loop
    raise notice 'A2b FACTURA EN OTRA UNIDAD: factura % (%; P-%) · % · facturado % % · el insumo se cuenta en %',
      r.numero, r.estado, lpad(r.pedido::text, 4, '0'), r.nombre, trim_scale(r.cantidad), coalesce(r.u_fact, '∅'), coalesce(r.u_item, '∅');
  end loop;
end $$;
```

- En dev se esperan: 9 `[kg]` (Materia prima menos Huevos, más Ananá, Frutilla, Mango y Frutos Rojos), unos 36 `[sin unidad de compra]`, `[contenido 1…]` para los "(kg)" sin unidad y **0 `FACTURA EN OTRA UNIDAD`** (§1.5).
- **Qué hacer si aparece una `FACTURA EN OTRA UNIDAD`** (en dev no hay; en prod no se sabe hasta la release): la migración **no corrige nada**. Va a la lista de la release (§11.3) y se resuelve según D4.
- `compras_items.unidad` vacía **no se completa**: es un dato de negocio. Queda en la lista para el usuario (§12, paso 1).

### 3.3 `subtotal` e `iva`: nueva expresión sin perder datos (E4)

PG 17 permite cambiar la expresión de una columna generada. Reescribe la tabla y recalcula todas las filas desde `cantidad`, `cantidad_base`, `precio_por` y `precio_unitario`, que no cambian. **Se guarda un control antes y se compara después:**

```sql
create temp table _a2b_totales on commit drop as
  select factura_id, sum(subtotal) s, sum(iva) i from compras_factura_items group by factura_id;

alter table compras_factura_items
  alter column subtotal set expression as (
    round((case when precio_por = 'base' then cantidad_base else cantidad end) * precio_unitario, 2)),
  alter column iva set expression as (
    round(round((case when precio_por = 'base' then cantidad_base else cantidad end) * precio_unitario, 2) * alicuota_iva / 100, 2));

do $$
begin
  if exists (
    select 1 from _a2b_totales t
    join (select factura_id, sum(subtotal) s, sum(iva) i from compras_factura_items group by factura_id) n using (factura_id)
    where n.s <> t.s or n.i <> t.i
  ) then
    raise exception 'A2b: el recálculo de subtotal/iva cambió el total de alguna factura. No se aplica.';
  end if;
end $$;
```

- Ninguna vista depende de `compras_factura_items.subtotal` o `iva` (consultado en `pg_depend`: solo `v_compras_insumos_resumen` lee otras columnas de la tabla). Las funciones plpgsql leen `subtotal` por nombre, así que siguen andando.
- **Si prod no estuviera en PG ≥ 17** (no se puede mirar hasta la release), el `SET EXPRESSION` falla, la migración entera se revierte y no queda nada a medias. El plan B para ese caso es `drop column subtotal, drop column iva` + `add column … generated always as (…) stored` con el mismo control. Va anotado en la lista de la release (§11.3).

### 3.4 RLS de solo lectura (E13)

```sql
drop policy if exists compras_remitos_acceso on compras_remitos;
create policy compras_remitos_lectura on compras_remitos for select using (tiene_acceso_compras());
drop policy if exists compras_remito_items_acceso on compras_remito_items;
create policy compras_remito_items_lectura on compras_remito_items for select using (tiene_acceso_compras());
drop policy if exists compras_facturas_admin on compras_facturas;
create policy compras_facturas_lectura on compras_facturas for select using (es_admin());
drop policy if exists compras_factura_items_admin on compras_factura_items;
create policy compras_factura_items_lectura on compras_factura_items for select using (es_admin());
revoke insert, update, delete, truncate on compras_remitos, compras_remito_items, compras_facturas, compras_factura_items from anon, authenticated;
```

Antes de escribir esto, el Ejecutor confirma con `grep -rnE "from\('compras_(remitos|remito_items|facturas|factura_items)'\)" app lib components` que no queda ningún `.insert/.update/.delete/.upsert`. Hoy da 0.

### 3.5 Helpers

```sql
-- Foto de las líneas de un remito (para eventos). Mismo formato que las Linea de B1 + kg.
create or replace function public.compras_lineas_remito_snapshot(p_remito_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ri.id, 'item_id', ri.item_id, 'pedido_item_id', ri.pedido_item_id,
           'descripcion', ri.descripcion,
           'unidad', coalesce(pi.unidad, i.unidad),
           'cantidad', ri.cantidad,
           'cantidad_base', ri.cantidad_base,
           'unidad_base', i.unidad_base
         ) order by pi.orden nulls last, ri.descripcion, ri.id), '[]'::jsonb)
  from compras_remito_items ri
  left join compras_pedido_items pi on pi.id = ri.pedido_item_id
  left join compras_items i on i.id = ri.item_id
  where ri.remito_id = p_remito_id;
$$;
revoke execute on function public.compras_lineas_remito_snapshot(uuid) from public, anon, authenticated;
```

`compras_diff_lineas_remito(p_antes jsonb, p_despues jsonb) returns jsonb`, `immutable`, `set search_path = public`. Es **el cuerpo de `compras_diff_lineas` (`20261005140000:118-165`) con dos agregados:**
- en el `where` de `cambiados`: `or (a.x->>'cantidad_base')::numeric is distinct from (d.x->>'cantidad_base')::numeric`;
- en el objeto `antes`: `'cantidad_base', a.x->'cantidad_base'`.

`revoke … from public, anon, authenticated` (a diferencia de la de B1, no se expone).

```sql
-- Cómo cobra un proveedor un insumo: el par, o el default del insumo si no hay par.
create or replace function public._compras_cobra_por(p_item uuid, p_prov uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cobra_por from compras_item_proveedores where item_id = p_item and proveedor_id = p_prov),
    (select cobra_por_default from compras_items where id = p_item),
    'unidad');
$$;
revoke execute on function public._compras_cobra_por(uuid, uuid) from public, anon, authenticated;
```

### 3.6 `compras_guardar_insumo`: cuerpo de `20261005150000:128-407` + unidades

Misma firma, así que alcanza con `create or replace`. Cambios marcados con `-- A2b`:

1. `v_campos` suma `'unidad_base'` y `'cobra_por_default'`. Variables nuevas: `v_ub text`, `v_cpd text`, `v_cobra text`, `v_cobra_ant text`, `v_cpd_item text`.
2. Validación (después de `alicuota_iva`):
   ```sql
   if p_datos ? 'unidad_base' then
     v_ub := p_datos->>'unidad_base';
     if v_ub is null or v_ub not in ('kg', 'unidades', 'litros') then raise exception 'Elegí la unidad base: kg, unidades o litros.'; end if;
   end if;
   if p_datos ? 'cobra_por_default' then
     v_cpd := p_datos->>'cobra_por_default';
     if v_cpd is null or v_cpd not in ('unidad', 'base') then raise exception 'Elegí cómo se cobra por defecto.'; end if;
   end if;
   ```
   Al crear: `if v_ub is null then raise exception 'Elegí la unidad base del insumo.'; end if;`.
3. Bloqueo de la edición: `select * into v_old from compras_items where id = v_id for no key update;` (**E15**).
4. `insert` suma `unidad_base` (= `v_ub`) y `cobra_por_default` (= `coalesce(v_cpd, 'unidad')`). El `update` suma las dos columnas con el mismo patrón `case when p_datos ? … then … else … end`.
5. Historial del update: dos filas más en el `values`:
   ```sql
   ('unidad_base',       v_old.unidad_base is distinct from v_new.unidad_base,             v_old.unidad_base,       v_new.unidad_base),
   ('cobra_por_default', v_old.cobra_por_default is distinct from v_new.cobra_por_default, v_old.cobra_por_default, v_new.cobra_por_default)
   ```
   Los valores se guardan crudos (`unidad`/`base`, `kg`/`unidades`/`litros`). La pantalla los traduce (§7.1).
6. Proveedores. Cada elemento acepta `cobra_por` y `cobra_por_anterior` (opcionales). Antes del loop: `select cobra_por_default into v_cpd_item from compras_items where id = v_id;`. En el loop:
   ```sql
   v_cobra     := nullif(v_p->>'cobra_por', '');
   v_cobra_ant := nullif(v_p->>'cobra_por_anterior', '');
   if v_cobra is not null and v_cobra not in ('unidad', 'base') then raise exception 'Cobra por: elegí % o la unidad base.', 'la unidad de compra'; end if;
   ```
   - **Par nuevo:** `insert … cobra_por` = `coalesce(v_cobra, v_cpd_item)`, más `_compras_item_hist(v_id, v_lote, 'proveedor.cobra_por', v_prov_id, null, <ese valor>)`.
   - **Par existente:** si `v_cobra is not null and v_cobra is distinct from v_par.cobra_por`:
     - si `v_cobra_ant is distinct from v_par.cobra_por`, la excepción es `'Cómo cobra % cambió mientras editabas (lo cambió una factura). Recargá la página.'` con el nombre del proveedor;
     - si no, `update … set cobra_por = v_cobra` + `_compras_item_hist(…, 'proveedor.cobra_por', …, v_par.cobra_por, v_cobra)`.
   - **El orden importa:** el `cobra_por` se procesa **antes** que el `precio_ref`, así el historial queda "Cobra por: Caja → kg", y después "Precio ref.: 2000 → 121,2121".
7. Grants: sin cambios.

### 3.7 `compras_guardar_remito`: cuerpo de `20260930180000:13-211` + kg + eventos

Misma firma (`uuid, uuid, date, jsonb, text`). Cada línea de `p_items` acepta `cantidad_base` (opcional).

1. Validación general (junto a la de cantidad):
   ```sql
   if exists (select 1 from jsonb_array_elements(p_items) e
              where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
     raise exception 'Los kg reales tienen que ser mayores a 0 (o quedar vacíos).';
   end if;
   ```
2. Variables nuevas: `v_snap_antes jsonb`, `v_fecha_antes date`, `v_numero_antes text`, `v_det jsonb`, `v_base numeric`, `v_cambios boolean := true`.
3. En la rama de edición, **antes** del `update compras_remitos`: `v_fecha_antes := v_remito.fecha; v_numero_antes := v_remito.numero; v_snap_antes := compras_lineas_remito_snapshot(v_remito.id);`.
4. En el loop, después de resolver `v_item_id`:
   ```sql
   v_base := nullif(v_linea.e->>'cantidad_base', '')::numeric;
   if v_base is not null and v_item_id is null then
     raise exception 'Los kg reales van solo en líneas con insumo ("%").', btrim(v_linea.e->>'descripcion');
   end if;
   ```
   `update` e `insert` suman `cantidad_base = v_base`.
5. Reconciliación del stock: **sin cambios** (suma `cantidad`, nunca `cantidad_base`).
6. Eventos (después del `perform compras_recalcular_diferencias_factura…`, antes del `return`):
   ```sql
   if v_es_nuevo then
     perform compras_registrar_evento_pedido(v_pedido.id, 'remito_creado', jsonb_build_object(
       'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', p_fecha, 'origen', 'manual',
       'numero', nullif(btrim(p_numero), ''), 'lineas', compras_lineas_remito_snapshot(v_remito.id)));
   else
     v_det := compras_diff_lineas_remito(v_snap_antes, compras_lineas_remito_snapshot(v_remito.id));
     if v_fecha_antes is distinct from p_fecha then
       v_det := v_det || jsonb_build_object('fecha', jsonb_build_object('de', v_fecha_antes, 'a', p_fecha));
     end if;
     if v_numero_antes is distinct from nullif(btrim(p_numero), '') then
       v_det := v_det || jsonb_build_object('numero', jsonb_build_object('de', v_numero_antes, 'a', nullif(btrim(p_numero), '')));
     end if;
     v_cambios := v_det <> '{}'::jsonb;
     if v_cambios then
       perform compras_registrar_evento_pedido(v_pedido.id, 'remito_editado',
         v_det || jsonb_build_object('remito_id', v_remito.id, 'secuencia', v_remito.secuencia));
     end if;
   end if;
   ```
7. `return` suma `'cambios', v_cambios` (para el toast "Sin cambios", como B1).

### 3.8 `compras_eliminar_remito`: cuerpo de `20260928190000:249-314` + evento

Variable nueva `v_snap jsonb`. Antes del `delete from compras_remitos`: `v_snap := compras_lineas_remito_snapshot(v_remito.id);`. Después del `delete` y antes del recálculo:

```sql
perform compras_registrar_evento_pedido(v_pedido.id, 'remito_eliminado', jsonb_build_object(
  'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha,
  'numero', v_remito.numero, 'origen', v_remito.origen, 'motivo', null, 'lineas', v_snap));
```

La firma no cambia: no se pide motivo al eliminar a mano.

### 3.9 `compras_guardar_factura`: cuerpo de `20260928190000:322-520` + kg y `precio_por`

Misma firma. Cada línea acepta `cantidad_base` y `precio_por`.

1. Validación (después de la de descripción, cantidad y precio):
   ```sql
   if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
              where coalesce(nullif(e->>'precio_por', ''), 'unidad') not in ('unidad', 'base')) then
     raise exception 'Las líneas de la factura vienen mal armadas. Recargá la página.';
   end if;
   if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
              where nullif(e->>'cantidad_base', '') is not null and (e->>'cantidad_base')::numeric <= 0) then
     raise exception 'Los kg tienen que ser mayores a 0 (o quedar vacíos).';
   end if;
   ```
2. En el loop, después de resolver `v_item_id` (variables `v_precio_por text`, `v_base numeric`):
   ```sql
   v_precio_por := coalesce(nullif(v_linea.e->>'precio_por', ''), 'unidad');
   v_base := nullif(v_linea.e->>'cantidad_base', '')::numeric;
   if v_precio_por = 'base' then
     if v_item_id is null then
       raise exception '"%" no tiene insumo: no se puede cobrar por kg.', btrim(v_linea.e->>'descripcion');
     end if;
     if v_base is null then
       raise exception 'Cargá los kg de "%": ese proveedor lo cobra por kg.', btrim(v_linea.e->>'descripcion');
     end if;
     if (v_linea.e->>'cantidad')::numeric <= 0 then
       raise exception 'Cargá cuántas unidades llegaron de "%" (además de los kg).', btrim(v_linea.e->>'descripcion');
     end if;
   end if;
   if v_base is not null and v_item_id is null then
     raise exception 'Los kg van solo en líneas con insumo ("%").', btrim(v_linea.e->>'descripcion');
   end if;
   ```
   `update` e `insert` suman `cantidad_base = v_base` y `precio_por = v_precio_por`.
3. El recálculo de `subtotal`/`iva`/`total` de la cabecera no cambia: suma las columnas generadas, que ya usan la expresión nueva.

> La unidad base de los mensajes es siempre "kg" en los textos de error, aunque el insumo esté en litros. Si el Ejecutor quiere afinarlo, que use `compras_items.unidad_base` en el texto. No es obligatorio.

### 3.10 `compras_confirmar_factura`: cuerpo de `20260929120000:752-931` + unidades, precios y evento

Misma firma. Cambios:

1. **Remito automático:** el `insert into compras_remito_items` suma `cantidad_base`:
   ```sql
   insert into compras_remito_items (remito_id, pedido_item_id, item_id, descripcion, cantidad, cantidad_base)
   select v_remito.id, fi.pedido_item_id, fi.item_id, fi.descripcion, fi.cantidad,
          case when fi.item_id is not null then fi.cantidad_base end
   from compras_factura_items fi
   where fi.factura_id = v_factura.id and fi.cantidad > 0
     and (fi.item_id is not null or fi.pedido_item_id is not null);
   ```
   El stock se mueve con `cantidad` (cajas), como hoy. **Esto cierra el bug "el remito desde factura suma kg como cajas"**: `cantidad` ya no puede ser kg cuando se cobra por kg (§3.9).
   Al final del bloque del remito automático:
   ```sql
   perform compras_registrar_evento_pedido(v_pedido.id, 'remito_creado', jsonb_build_object(
     'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
     'factura_id', v_factura.id, 'factura_numero', v_factura.numero,
     'lineas', compras_lineas_remito_snapshot(v_remito.id)));
   ```
2. **Precios (E7).** Se reemplaza el `update compras_item_proveedores …` por un loop. Variables nuevas: `v_lote uuid := gen_random_uuid()`, `v_precio record`, `v_par compras_item_proveedores%rowtype`, `v_precios int := 0`.
   ```sql
   if coalesce(p_actualizar_precios, false) then
     for v_precio in
       select distinct on (fi.item_id) fi.item_id, fi.precio_unitario, fi.precio_por
       from compras_factura_items fi
       where fi.factura_id = v_factura.id and fi.item_id is not null and fi.precio_unitario > 0
       order by fi.item_id, fi.orden desc, fi.id desc
     loop
       select * into v_par from compras_item_proveedores
       where item_id = v_precio.item_id and proveedor_id = v_factura.proveedor_id and activo
       for update;
       continue when not found;
       continue when v_par.precio_ref is not distinct from v_precio.precio_unitario
                 and v_par.cobra_por = v_precio.precio_por;
       update compras_item_proveedores
         set precio_ref = v_precio.precio_unitario, cobra_por = v_precio.precio_por
         where id = v_par.id;
       insert into compras_items_historial (item_id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, origen, creado_por)
       select v_precio.item_id, v_lote, c.campo, v_factura.proveedor_id, c.ant, c.nue, 'factura', auth.uid()
       from (values
         ('proveedor.cobra_por',  v_par.cobra_por,                v_precio.precio_por),
         ('proveedor.precio_ref', _compras_num_txt(v_par.precio_ref), _compras_num_txt(v_precio.precio_unitario))
       ) c(campo, ant, nue)
       where c.ant is distinct from c.nue;
       v_precios := v_precios + 1;
     end loop;
   end if;
   ```
   El orden de bloqueo queda así: pedido → factura → stock (`compras_mover_stock`) → par (`FOR UPDATE`) → `KEY SHARE` del insumo (por el historial). Con E15 (`NO KEY UPDATE` en Insumos), no hay cruce con `compras_guardar_insumo` (insumo → pares de **ese** insumo).
3. El `return` suma `'precios_actualizados', v_precios`.

### 3.11 `compras_anular_factura`: cuerpo de `20260929120000:937-1047` + evento

En el loop de remitos "desde factura", antes del `delete from compras_remitos where id = v_remito.id`: `v_snap := compras_lineas_remito_snapshot(v_remito.id);`. Después del `delete`:

```sql
perform compras_registrar_evento_pedido(v_pedido.id, 'remito_eliminado', jsonb_build_object(
  'remito_id', v_remito.id, 'secuencia', v_remito.secuencia, 'fecha', v_remito.fecha, 'origen', 'factura',
  'factura_id', v_factura.id,
  'motivo', 'Se anuló la factura ' || v_factura.numero || ': ' || btrim(p_motivo),
  'lineas', v_snap));
```

Nada más cambia: el stock se revierte con `cantidad`, que está en cajas.

### 3.12 `compras_diferencias_calculadas`: misma comparación + kg como información (E6)

El tipo de retorno cambia, así que va `drop function if exists public.compras_diferencias_calculadas(uuid);` y después `create`. `compras_recalcular_diferencias_factura` no se toca: es plpgsql y lee `c.clave`, `c.recibida`, `c.facturada`, `c.pedido_item_id`, `c.descripcion`, `c.unidad` e `c.item_id`, que siguen ahí.

```sql
create function public.compras_diferencias_calculadas(p_factura_id uuid)
returns table (
  clave text, pedido_item_id uuid, item_id uuid, descripcion text, unidad text,
  recibida numeric, facturada numeric,
  -- A2b: información en unidad base. *_real = false → al menos una línea sin kg reales (cae a nominal).
  unidad_base text, contenido numeric,
  recibida_base numeric, recibida_base_real boolean,
  facturada_base numeric, facturada_base_real boolean
)
language sql stable security definer set search_path = public as $$
  with f as (select id, pedido_id from compras_facturas where id = p_factura_id),
  facturado as (
    select fi.item_id, sum(fi.cantidad) as cantidad,
           sum(coalesce(fi.cantidad_base, fi.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(fi.cantidad_base is not null) as base_real
    from compras_factura_items fi
    join f on f.id = fi.factura_id
    join compras_items i on i.id = fi.item_id
    where fi.item_id is not null
    group by fi.item_id
  ),
  recibido as (
    select ri.item_id, sum(ri.cantidad) as cantidad,
           sum(coalesce(ri.cantidad_base, ri.cantidad * i.cantidad_por_unidad)) as base,
           bool_and(ri.cantidad_base is not null) as base_real
    from compras_remito_items ri
    join compras_remitos r on r.id = ri.remito_id
    join f on f.pedido_id = r.pedido_id
    join compras_items i on i.id = ri.item_id
    where ri.item_id is not null
    group by ri.item_id
  ),
  lineas as ( /* igual que hoy */ )
  select 'item:' || coalesce(fa.item_id, re.item_id)::text, l.pedido_item_id, coalesce(fa.item_id, re.item_id),
         i.nombre, i.unidad, coalesce(re.cantidad, 0), coalesce(fa.cantidad, 0),
         i.unidad_base, i.cantidad_por_unidad,
         re.base, coalesce(re.base_real, false),
         fa.base, coalesce(fa.base_real, false)
  from facturado fa
  full join recibido re on re.item_id = fa.item_id
  join compras_items i on i.id = coalesce(fa.item_id, re.item_id)
  left join lineas l on l.item_id = coalesce(fa.item_id, re.item_id);
$$;
revoke execute on function public.compras_diferencias_calculadas(uuid) from public, anon, authenticated;
```

**No hace falta recalcular las diferencias existentes**: la comparación es la misma.

### 3.13 Vistas: columnas nuevas **al final** (`create or replace view`)

**`v_compras_pedido_pendiente`** (cuerpo de `20260924200000`, las mismas columnas en el mismo orden, y después):

```sql
  -- A2b
  i.unidad_base,
  i.cantidad_por_unidad as contenido,
  case when pi.item_id is null then null else coalesce(ip.cobra_por, i.cobra_por_default) end as cobra_por,
  r.recibido_base,
  coalesce(r.recibido_base_completo, false) as recibido_base_completo
from compras_pedido_items pi
join compras_pedidos p on p.id = pi.pedido_id
left join compras_items i on i.id = pi.item_id
left join compras_item_proveedores ip on ip.item_id = pi.item_id and ip.proveedor_id = p.proveedor_id
left join lateral (
  select sum(ri.cantidad) as recibido, count(distinct ri.remito_id) as remitos,
         sum(ri.cantidad_base) as recibido_base,
         bool_and(ri.cantidad_base is not null) as recibido_base_completo
  from compras_remito_items ri where ri.pedido_item_id = pi.id
) r on true
where tiene_acceso_compras();
```

**`v_compras_factura_diferencias`** (cuerpo de `20260929120000:1087-1095` + al final):

```sql
  , c.unidad_base, c.contenido, c.recibida_base, c.recibida_base_real, c.facturada_base, c.facturada_base_real
from compras_factura_discrepancias d
join compras_facturas f on f.id = d.factura_id
left join profiles pr on pr.id = d.resuelto_por
left join lateral (select * from compras_diferencias_calculadas(d.factura_id) x where x.clave = d.clave) c on true
where es_admin();
```

(La vista corre como dueño, así que puede llamar a la función aunque esté revocada para `authenticated`. Es el mismo patrón que las otras `v_compras_*`.)

**`v_compras_insumos_resumen`** (cuerpo de `20261005150000:597-650` + al final):
- `pp.cobra_por as cobra_por_principal`;
- `case when es_admin() then uf.precio_por end as ultimo_precio_por` (el lateral `uf` suma `fi.precio_por`);
- `i.unidad_base`;
- `i.cantidad_por_unidad as contenido`.

`grant select` de las tres: igual que hoy.

### 3.14 Backfill de `remito_creado` (E10)

```sql
insert into compras_pedido_eventos (pedido_id, tipo, detalle, creado_por, creado_en)
select r.pedido_id, 'remito_creado',
       jsonb_build_object('remito_id', r.id, 'secuencia', r.secuencia, 'fecha', r.fecha,
                          'origen', r.origen, 'factura_id', r.factura_id, 'numero', r.numero, 'backfill', true),
       (select p.id from profiles p where p.id = r.creado_por),
       r.created_at
from compras_remitos r
where not exists (
  select 1 from compras_pedido_eventos e
  where e.tipo = 'remito_creado' and e.detalle->>'remito_id' = r.id::text
);
```

- Es idempotente. No toca `actualizado_en` del pedido (es un insert directo, como el backfill de B1).
- En dev se esperan 11 filas.

### 3.15 Después de la migración

- `npm run types`. Tiene que traer **solo** los cambios de A2b (columnas, vistas y firma de retorno de `compras_diferencias_calculadas`). Si aparece algo de B2 o de otra fase, frenar: la base no coincide con `qa`.
- Invariante del ledger en 0 (§9.4).

## 4. Server Actions

| Archivo | Cambio |
|---|---|
| `insumos/acciones.ts` | `Datos` suma `unidadBase: z.enum(['kg','unidades','litros'])` y `cobraPorDefault: z.enum(['unidad','base'])` (sigue `.partial().strict()`). `COLUMNA` suma `unidadBase: 'unidad_base'` y `cobraPorDefault: 'cobra_por_default'`. `Proveedor` suma `cobraPor` y `cobraPorAnterior` (enum, opcionales y nullable). `p_proveedores` manda `cobra_por` y `cobra_por_anterior`. |
| `remitos/acciones.ts` | `Linea` suma `cantidadBase: z.number().positive().nullable().optional()`. `p_items` manda `cantidad_base`. La respuesta suma `cambios: z.boolean().optional()`. |
| `facturas/acciones.ts` | La línea suma `cantidadBase` (positivo, nullable) y `precioPor: z.enum(['unidad','base'])`. `p_items` manda `cantidad_base` y `precio_por`. La respuesta de confirmar suma `precios_actualizados: z.number().optional()`. |
| `pedidos/acciones.ts` (`guardarPedido`) | **E12:** antes de la RPC, `select id, unidad from compras_items where id in (<item_ids>)`. Para cada línea con `item_id`, `unidad = item.unidad ?? línea.unidad`. Las líneas libres no se tocan. |

## 5. Lógica pura: `lib/compras/unidades.ts` (nuevo) + `lib/compras/_check_unidades.ts`

```ts
export type UnidadBase = 'kg' | 'unidades' | 'litros'
export type CobraPor = 'unidad' | 'base'
export const UNIDADES_BASE: { valor: UnidadBase; label: string; corto: string }[]
  // [{kg, 'Kilos', 'kg'}, {unidades, 'Unidades', 'u.'}, {litros, 'Litros', 'l'}]
export const TOLERANCIA_NOMINAL_PCT = 10   // E9 (a)
export const TOLERANCIA_REMITO_PCT = 1     // E9 (b)

export interface UnidadesInsumo { unidad: string | null; unidadBase: UnidadBase; contenido: number }

/** Hay conversión que mostrar: el contenido no es 1, o la unidad de compra no es la base ("Caja" vs. "kg"). */
export function tieneConversion(u: UnidadesInsumo): boolean
/** 'Caja' para 'unidad'; 'kg' para 'base'. Sin unidad de compra: 'unidad'. */
export function etiquetaCobraPor(c: CobraPor, u: UnidadesInsumo): string
export function equivalenteBase(cantidad: number, u: UnidadesInsumo): number          // cantidad × contenido
/** '3,4 Caja ≈ 56,1 kg'. null si no hay conversión. Hasta 1 decimal, coma decimal. */
export function textoEquivalencia(cantidad: number, u: UnidadesInsumo): string | null
/** Líneas del ejemplo vivo de la ficha (§7.1). */
export function ejemploUnidades(u: UnidadesInsumo, cobraPor: CobraPor, stock: number | null): string[]
/** Precio de una unidad a otra: base→unidad × contenido; unidad→base ÷ contenido. 4 decimales. */
export function convertirPrecio(precio: number, de: CobraPor, a: CobraPor, contenido: number): number
/** Lo que se multiplica por el precio en una línea de factura. */
export function cantidadCobrada(l: { cantidad: number | null; cantidadBase?: number | null; precioPor?: CobraPor }): number
/** Desvío en %, redondeado (positivo = más). null si falta un dato o la referencia es 0. */
export function desvioPct(real: number | null, referencia: number | null): number | null
/** 'Pesó 12 % menos que lo nominal (33 kg).' si supera TOLERANCIA_NOMINAL_PCT; si no, null. */
export function avisoNominal(cantidadBase: number | null, cantidad: number | null, u: UnidadesInsumo): string | null
/** 'La factura cobra 0,5 kg más que el remito (32,9 kg).' si supera TOLERANCIA_REMITO_PCT; si no, null. */
export function avisoRemito(baseFactura: number | null, baseRemito: number | null, u: UnidadesInsumo): string | null
/** Plural simple de la unidad de compra: Caja→Cajas, Bolsa→Bolsas, Cajón→Cajones, Pote→Potes, Unid.→Unid., kg→kg. 1 → singular. */
export function unidadPlural(unidad: string, cantidad: number): string
/** Cantidad para el mensaje al proveedor: '2 CAJAS (~33 KG)'. El (~…) va solo si cobraPor = 'base' y hay conversión. */
export function cantidadMensaje(cantidad: number, unidad: string | null, u: UnidadesInsumo | null, cobraPor: CobraPor | null): string
```

`lib/compras/totalesFactura.ts`: `LineaTotalizable` suma `cantidadBase?: number | null` y `precioPor?: CobraPor`. `subtotalLinea` pasa a `redondear2(cantidadCobrada(l) * (l.precioUnitario ?? 0))`. El comentario de cabecera cita la expresión nueva de la columna generada. **Los llamadores que no pasan los campos nuevos siguen dando lo mismo.**

**`_check_unidades.ts`** (con `assert` y `OK n/n` al final):
1. `textoEquivalencia(3.4, {Caja, kg, 16.5})` da `'3,4 Caja ≈ 56,1 kg'`. Con `{Unid., unidades, 1}` da `null`. Con `{null, kg, 1}` ("Ananá (kg)") da `null`.
2. `convertirPrecio(2000, 'unidad', 'base', 16.5)` da `121.2121`, y la vuelta da `2000` (±0,01).
3. `cantidadCobrada({cantidad: 2, cantidadBase: 33.4, precioPor: 'base'})` da `33.4`. Sin `precioPor` da `2`.
4. `subtotalLinea({cantidad: 2, cantidadBase: 33.4, precioPor: 'base', precioUnitario: 1250, alicuotaIva: 21})` da `41750`. Es el mismo número que la columna generada en el escenario S9.
5. `avisoNominal(29, 2, queso)` (nominal 33; −12 %) da un texto. Con 32,9 kg da `null`.
6. `avisoRemito(33.4, 32.9, queso)` (+1,5 %) da un texto. Con `33.4` vs. `33.3` da `null`.
7. `unidadPlural`: `('Caja', 2)` da `'Cajas'`, `('Cajón', 3)` da `'Cajones'`, `('Unid.', 5)` da `'Unid.'`, `('kg', 2)` da `'kg'` y `('Caja', 1)` da `'Caja'`.
8. `cantidadMensaje(2, 'Caja', queso, 'base')` da `'2 CAJAS (~33 KG)'`. Con `'unidad'` da `'2 CAJAS'`. Una línea libre (`u = null`) con `'Bolsa'` da `'2 BOLSAS'`.
9. `desvioPct(0, 0)` da `null`.

Además: `npx tsx lib/compras/_check_totales.ts`, `_check_historial.ts`, `_check_diferencias.ts`, `app/admin/compras/pedidos/remitos/_check_modelo.ts`, `facturas/_check_modelo.ts` y, si B2 ya está, `_check_comprobante.ts`. Todos con sus casos actuales **más** los de §6 y §7.

## 6. Historial del pedido (B1): leer y mostrar los eventos de remito con kg

`lib/compras/historialPedido.ts`:
- `Linea` y `Antes` suman `cantidad_base: z.coerce.number().nullable().optional().transform(v => v ?? null)` y `unidad_base` (string, nullable y opcional).
- `remito_creado` suma `origen`, `numero`, `factura_id`, `factura_numero`, `backfill` y `lineas: z.array(Linea).optional()`, todos opcionales.
- `remito_editado` suma `fecha: {de, a}` y `numero: {de, a}`, opcionales.
- `remito_eliminado` suma `fecha`, `numero`, `origen`, `factura_id` y `lineas`, opcionales.
- **`igualAntes` (`:253-256`) suma `l.antes.cantidad_base === l.cantidad_base`.** Si no, `combinarDiffs` descarta un cambio que fue solo de kg.
- `parteCantidad` (`:137-141`): si solo cambiaron los kg, da `'2 Caja · 32,9 → 33,4 kg'`. Si cambiaron las cajas y había kg: `'2 → 3 Caja (33,4 → 49,9 kg)'`. Agregado o quitado con kg: `agregó Queso Barra 2 Caja (33,4 kg)`.
- Textos de remito: `remito_creado` con `origen = 'factura'` da "Llegó un remito · generado al confirmar la factura {factura_numero}". Con `lineas`, se pueden ver como en "Ver N cambios más" de B1 (mismo componente).
- `remito_editado` suma "Fecha: 03/10 → 04/10" y "N° del proveedor: 0001-123 → 0001-124" cuando vienen.
- `remito_eliminado` muestra el motivo, si hay, y "Se descontó: Queso Barra 2 Caja; …".

`PedidoDetalle.tsx:194-215`: solo lo necesario para las piezas nuevas (sin rediseño).

`lib/compras/_check_historial.ts`, casos nuevos:
1. `remito_editado` solo con kg da un `cambiado` con el texto `'2 Caja · 32,9 → 33,4 kg'`.
2. Dos ediciones seguidas de kg (32,9 → 33,4 → 33,0) dan **una** entrada `32,9 → 33`.
3. `remito_creado` de origen factura da el texto con el número.
4. Un `remito_creado` sin las claves nuevas (backfill o formato viejo) **sigue parseando**.

## 7. UI

> **Protocolo de UX del Bloque 1:** `Modal`, íconos lucide, tokens semánticos, `ConfirmDialog` propio y toast. Nunca `confirm()`/`alert()`. Botones ≥ 44px en el celular. `tabular-nums` en los números.
> Pasada de diseño en el cierre: la skill `impeccable` (shape/harden) sobre los 3 formularios (insumo, remito, factura), en 375px y 1280px, claro y oscuro.

### 7.1 Ficha del insumo (`InsumoModal.tsx`): bloque "Unidades"

Reemplaza los dos campos de `:523-531` por una sección propia, con su título y el ícono `Ruler`:

```wireframe
<!doctype html><html><head><style>
body{font-family:system-ui;background:#111;color:#eee;padding:16px;max-width:640px}
.sec{border:1px solid #333;border-radius:12px;padding:12px;margin-bottom:12px}
.row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}
label{font-size:12px;color:#aaa;min-width:170px}
.in{background:#1d1d1d;border:1px solid #444;border-radius:10px;padding:8px 10px;min-height:28px}
.seg{display:inline-flex;border:1px solid #444;border-radius:10px;overflow:hidden}.seg span{padding:8px 12px}.on{background:#2a4;color:#fff}
.ej{background:#1a2230;border-radius:10px;padding:10px;font-size:13px;line-height:1.6}
.muted{color:#999;font-size:12px}
.grid{display:grid;grid-template-columns:auto 1fr 7rem 7rem 8rem auto;gap:6px;align-items:center;font-size:13px}
</style></head><body>
<div class="sec"><b>📏 Unidades</b>
 <div class="row"><label>Se compra y se cuenta en *</label><span class="in">Caja</span></div>
 <div class="row"><label>Cada Caja trae (nominal)</label><span class="in">16,5</span><span class="in">kg ▾</span></div>
 <div class="row"><label>Por defecto se cobra por</label><span class="seg"><span>Caja</span><span class="on">kg</span></span></div>
 <div class="ej">1 Caja = 16,5 kg<br>El stock se cuenta en Cajas: hoy 3,4 Cajas ≈ 56,1 kg<br>Se cobra por kg: el remito pide los kg reales y la factura cobra kg × $/kg.</div>
</div>
<div class="sec"><b>Proveedores</b>
 <div class="grid muted"><span>★</span><span>Proveedor</span><span>Código</span><span>Cobra por</span><span>Precio ref.</span><span></span></div>
 <div class="grid"><span>★</span><span>GLOBAL</span><span class="in">QB-01</span><span class="in">kg ▾</span><span class="in">$ 121,21 /kg</span><span>🗑</span></div>
 <div class="muted">Convertido de $ 2.000 /Caja (÷ 16,5). Revisalo antes de guardar.</div>
 <div class="grid"><span>☆</span><span>AL SA</span><span class="in"></span><span class="in">Caja ▾</span><span class="in">$ 2.100 /Caja</span><span>🗑</span></div>
</div>
</body></html>
```

- **"Se compra y se cuenta en \*"** es el `unidad` de hoy. Ayuda: "El stock, el pedido y el remito se cuentan en esta unidad."
- **"Cada {unidad} trae (nominal)"** es `cantidad_por_unidad` + el select de `unidad_base`. Ayuda: "Lo que trae en teoría. Cada entrega puede pesar distinto: los kg reales se cargan en el remito."
- **"Por defecto se cobra por"** es un control segmentado `{unidad} | {base}`. Ayuda: "Con esto arranca cada proveedor nuevo. Cada proveedor puede cobrar distinto."
- **Ejemplo vivo** (`ejemploUnidades`): se recalcula mientras se tipea. Toma el stock actual si se está editando (`resumen.stock`) o 2 si es un insumo nuevo. Sin conversión (contenido 1 y la misma unidad), una sola línea: "Se cuenta y se cobra por {unidad}."
- **Filas de proveedor:** columna nueva **"Cobra por"** (select `{unidad}` / `{base}`), visible solo si `tieneConversion`. El precio muestra el sufijo `/Caja` o `/kg`. Al cambiar "Cobra por" con un precio cargado, el precio se convierte (`convertirPrecio`) y aparece la nota "Convertido de $ X /Caja (÷ 16,5). Revisalo antes de guardar." (E8). Un par nuevo arranca con `cobra_por_default`.
- **Estado:** `unidadBase` (default `'unidades'` en un insumo nuevo) y `cobraPorDefault`. `Linea` suma `cobraPor` y `cobraPorAnterior`. `firmaLineas` suma `cobraPor`. `datosCambiados` suma las dos claves con el mismo patrón.
- **Historial ("Cambios"):**
  - etiquetas: `unidad_base` es "Unidad base", `cobra_por_default` es "Se cobra por (por defecto)" y `proveedor.cobra_por` es "Cobra por";
  - valores: `unidad`/`base` se muestran con la unidad de compra y la base **actuales** del insumo; `kg`/`unidades`/`litros` con su label;
  - los de `origen = 'factura'` ya salen "(por factura)" (A2a).
- **Etiquetas:** "Cantidad por unidad" ya no aparece en ningún lado. En `lib/manual/…` no se toca (se hace con la guía, al final).

### 7.2 Insumos (lista) y Stock: la equivalencia (U3)

- `InsumosClient.tsx`:
  - columna Stock (`:242`): debajo del número, en `text-2xs text-muted`, `≈ 56,1 kg` si `tieneConversion`;
  - "Precio ref." con el sufijo de `cobra_por_principal`: `$ 121,21 /kg` o `$ 2.000 /Caja`;
  - "Última factura" con el sufijo de `ultimo_precio_por`. El aviso `otraUnidad` (`:305`) queda solo para `ultimo_precio_por = 'unidad'` con una `ultimo_precio_unidad` distinta (facturas viejas).
- `insumos/page.tsx`: lee las columnas nuevas de la vista resumen y de `compras_items` (`unidad_base`, `cobra_por_default`) y de `compras_item_proveedores` (`cobra_por`).
- `StockClient.tsx:147` y `StockFicha.tsx:137`: el mismo `≈ 56,1 kg` debajo o al lado del stock. Las consultas suman `unidad_base` y `cantidad_por_unidad`. **No se toca nada más de Stock** (el resto es A2c).

### 7.3 Pedido: la unidad sale del insumo; el mensaje dice los kg

- `PedidoEditor.tsx:253-260`:
  - una línea **con insumo** muestra la unidad como texto fijo (`text-sm text-muted`, el mismo ancho del input) o "sin unidad" en `text-warning` con el `title` "Cargale la unidad de compra en Insumos";
  - una línea **libre** sigue con el input de texto;
  - `lineaDeItem` no cambia (ya copia `item.unidad`);
  - si el par del proveedor del pedido cobra por kg y hay conversión, debajo de la cantidad va `≈ 33 kg`.
  - Datos: la consulta de insumos del editor suma `unidad_base` y `cantidad_por_unidad`, y los pares suman `cobra_por`.
- `lib/compras/pedidoMensaje.ts`:
  - `ItemMensaje` suma `contenido?: number | null`, `unidadBase?: UnidadBase | null` y `cobraPor?: CobraPor | null`, todos opcionales para que la vista previa de Plantillas siga andando;
  - la línea pasa a `   — ${cantidadMensaje(...)} ${descripcion}` en mayúsculas. Por ejemplo, `   — 2 CAJAS (~33 KG) QUESO BARRA`;
  - **el plural de la unidad aplica a todas las líneas** ("2 CAJA" pasa a "2 CAJAS").
- `PedidoEnvio.tsx:40-53`: enriquece cada `compras_pedido_items` con `unidad_base`, `contenido` y `cobra_por` desde las filas de `v_compras_pedido_pendiente` del pedido, por `pedido_item_id`. La página ya las carga (`pedidos/page.tsx:37`); si `PedidoEnvio` no las recibe, `PedidosClient` se las pasa como prop.

### 7.4 Remito: "kg reales" solo donde se cobra por peso

`RemitoForm.tsx`, línea del pedido (`:360-372`). Si `l.cobra_por === 'base'` y hay conversión:

```wireframe
<!doctype html><html><head><style>
body{font-family:system-ui;background:#111;color:#eee;padding:16px;max-width:640px}
li{list-style:none;border:1px solid #333;border-radius:12px;padding:12px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.d{flex:1 1 13rem}.m{font-size:12px;color:#999}.w{color:#e8a33d;font-size:12px}
.in{background:#1d1d1d;border:1px solid #444;border-radius:10px;padding:8px 10px;width:5.5rem;text-align:right}
</style></head><body>
<li><div class="d"><b>Queso Barra</b><div class="m">Pedido 2 Caja · falta 2 Caja</div></div>
<div style="display:flex;gap:8px;align-items:center"><span class="in">2</span><span class="m">Caja</span><span class="in" style="color:#777">33</span><span class="m">kg reales</span></div>
<div class="m" style="flex-basis:100%">Nominal 33 kg · cobra por kg: con los kg reales, la factura sale prellenada.</div>
<div class="w" style="flex-basis:100%">⚠ Pesó 12 % menos que lo nominal (33 kg). Revisá el número.</div></li>
</body></html>
```

- **Segundo `InputNumero`:** `w-24`, `aria-label` "Kg reales de {descripción}" y placeholder = nominal (`equivalenteBase(cantidad)`, gris). Es opcional: si queda vacío, no se manda.
- **Línea de ayuda:** "Nominal 33 kg · cobra por kg…". Si `avisoNominal` da un texto, se muestra en `text-warning` y **no bloquea**.
- **Línea libre que corresponde a una línea del pedido:** usa el `cobra_por` de esa línea. Libre con insumo (`corresponde = 'nada'`): usa `cobraPorDe(itemId)`, que sale de los pares del proveedor del pedido o del default del insumo. Libre sin insumo: nunca lleva kg.
- **Modelo (`remitos/modelo.ts`):**
  - `CantidadLinea`, `LineaLibre` y `LineaEnvio` suman `cantidadBase: number | null`;
  - `estadoInicial` lee `ri.cantidad_base`;
  - `armarEnvio` la pasa, solo si hay insumo y es > 0;
  - **`calcularImpacto` no cambia** (cajas).
  - `_check_modelo.ts`: casos nuevos para kg en la edición (kg solo cambiado → impacto vacío; envío con kg).
- **Datos (`remitos/datos.ts`):**
  - `consultarRemitos` suma `cantidad_base` en `compras_remito_items(…)`;
  - `consultarInsumos` suma `unidad_base`, `cantidad_por_unidad` y `cobra_por_default`;
  - consulta nueva de pares: `compras_item_proveedores(item_id, proveedor_id, cobra_por)`;
  - `LineaPedido` ya trae `cobra_por`, `contenido`, `unidad_base` y `recibido_base` por la vista.
- **Toast:** si la RPC devuelve `cambios: false`, "Sin cambios", como B1.

### 7.5 Factura: cajas + kg + $/kg (`FacturaForm.tsx:562-695` y modelo)

**No se toca el pie** (`:697` en adelante, donde B2 sumó Compartir) ni los totales. Solo las líneas, el checkbox de precios y el conteo de `:305-307`.

```wireframe
<!doctype html><html><head><style>
body{font-family:system-ui;background:#111;color:#eee;padding:16px;max-width:760px}
li{list-style:none;border:1px solid #333;border-radius:12px;padding:12px;margin-bottom:8px}
.r{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.c{display:flex;flex-direction:column;font-size:11px;color:#999;gap:4px}
.in{background:#1d1d1d;border:1px solid #444;border-radius:10px;padding:8px 10px;color:#eee;font-size:14px;min-width:4.5rem;text-align:right}
.seg{display:inline-flex;border:1px solid #444;border-radius:10px;overflow:hidden;font-size:13px}.seg span{padding:8px 10px}.on{background:#2a4;color:#fff}
.m{font-size:12px;color:#999;margin-top:6px}.w{font-size:12px;color:#e8a33d}.up{color:#e8a33d;font-weight:600}
</style></head><body>
<li><div class="in" style="text-align:left">QUESO BARRA</div>
<div class="r" style="margin-top:8px">
 <div class="c">Cantidad<span class="in">2</span></div><div class="c">&nbsp;<span style="padding:10px 0;color:#bbb">Caja</span></div>
 <div class="c">Cobra por<span class="seg"><span>Caja</span><span class="on">kg</span></span></div>
 <div class="c">Kg<span class="in">33,4</span></div>
 <div class="c">Precio por kg<span class="in">1.250</span></div>
 <div class="c">IVA<span class="in">21 %</span></div>
 <div class="c" style="margin-left:auto;text-align:right">Subtotal<b style="font-size:14px;color:#eee;padding-top:10px">$ 41.750,00</b></div>
</div>
<div class="m">Pedido 2 Caja · llegó 2 Caja · 32,9 kg (remito) · ≈ $ 20.625 por Caja nominal · <span class="up">↑ 3 % vs. el último precio ($ 1.212 /kg)</span></div>
<div class="w">⚠ La factura cobra 0,5 kg más que el remito (32,9 kg).</div></li>
<li><div class="in" style="text-align:left">FÉCULA DE MANDIOCA</div>
<div class="r" style="margin-top:8px"><div class="c">Cantidad<span class="in">50</span></div><div class="c">&nbsp;<span style="padding:10px 0;color:#bbb">Bolsa</span></div>
<div class="c">Cobra por<span class="seg"><span class="on">Bolsa</span><span>kg</span></span></div>
<div class="c">Precio por Bolsa<span class="in">2.450</span></div><div class="c">IVA<span class="in">21 %</span></div>
<div class="c" style="margin-left:auto;text-align:right">Subtotal<b style="font-size:14px;color:#eee;padding-top:10px">$ 122.500,00</b></div></div>
<div class="m">Pedido 50 Bolsa · llegó 50 Bolsa</div></li>
</body></html>
```

- **"Cantidad"** lleva la unidad de compra al lado (texto). Para una línea libre, sin unidad (como hoy).
- **"Cobra por"** (segmentado `{unidad}|{base}`): solo en líneas con insumo y `tieneConversion`. Arranca con el `cobra_por` del par (`LineaPendiente.cobra_por`, o el del par o el default para las libres con insumo). Al cambiarlo, el precio se convierte con `convertirPrecio`, igual que en Insumos.
- **"Kg"** (`InputNumero`, `w-24`): solo si `precioPor === 'base'`, y obligatorio. Prellenado (`lineaDePedido`): si la factura sale de remitos y `recibido_base_completo` y la cantidad prellenada es igual a `recibido`, toma `recibido_base`; si no, queda vacío. **Nunca se prellena el nominal**: pagar lo nominal sin mirarlo es justamente el error que hay que evitar.
- **"Precio por {unidad|kg}"**: cambia la etiqueta y el `aria-label`.
- **Subtotal** con `subtotalLinea` (ya usa `cantidadCobrada`).
- **Línea de contexto:**
  - "llegó 2 Caja · 32,9 kg (remito)" si hay kg en el remito; "≈ 33 kg nominal" si no;
  - "≈ $ 20.625 por Caja nominal" en las líneas por kg;
  - la variación contra el último precio compara **en la misma unidad**: el `precioRef` se convierte al `precioPor` de la línea si el par cobra distinto.
- **Avisos** (`text-warning`, no bloquean): `avisoRemito(kg factura, recibido_base)`, solo si `recibido_base_completo`, y `avisoNominal(kg, cantidad)`.
- **Modelo (`facturas/modelo.ts`):**
  - `LineaFactura` suma `cantidadBase`, `precioPor` y el contexto `cobraPorRef`, `unidades: UnidadesInsumo | null`, `recibidoBase` y `recibidoBaseCompleto`;
  - `ContextoPedido.precios` pasa a `Map<itemId, { precio: number; cobraPor: CobraPor }>` (`consultarPreciosRef` suma `cobra_por`);
  - `consultarInsumosFactura` suma `unidad_base`, `cantidad_por_unidad` y `cobra_por_default`;
  - `consultarFacturaItems` suma `cantidad_base` y `precio_por`;
  - `consultarPedidosFactura` suma `cantidad_base` en los ítems de remito;
  - `estadoInicial` lee los campos nuevos;
  - `validar` suma `{ tipo: 'falta_kg'; clave }` ("Cargá los kg de {desc}: se cobra por kg.") y `{ tipo: 'base_sin_cantidad'; clave }`;
  - `armarEnvio` manda `cantidadBase` (solo con insumo) y `precioPor`.
- **"Actualizar precios"** (`:305-307`): cuenta las líneas donde `precioUnitario !== ref.precio || precioPor !== ref.cobraPor`. `ConfirmarFacturaModal.tsx:106-111` suma, si hay algún cambio de `cobra_por`, "{Insumo} pasa a cobrarse por {kg|Caja}." (uno por renglón, hasta 3, y "y N más").
- `facturas/_check_modelo.ts`, casos nuevos: prellenado de kg desde remitos completos e incompletos; `falta_kg`; envío con `precio_por`; conteo de precios a cambiar con un cambio de `cobra_por`.

### 7.6 Diferencias: los kg como información

- `lib/compras/diferencias.ts`: `DiferenciaVista` suma `unidadBase`, `contenido`, `facturadaBase`, `facturadaBaseReal`, `recibidaBase` y `recibidaBaseReal` (desde la vista). Helper nuevo `textoKg(base, real, unidadBase)` que da `'33,4 kg'` o `'≈ 33 kg'`.
- `DiferenciasPanel.tsx:26-31` muestra "Facturado 2 Caja (33,4 kg) · llegó 1 Caja (≈ 16,5 kg)". Los kg van solo si `tieneConversion`. El `textoDiferencia` y la resolución **no cambian**: hablan en cajas.
- `_check_diferencias.ts`: un caso con kg reales y otro con nominal.

### 7.7 Comprobante y mensaje de factura (archivos de B2, una vez mergeada)

- `lib/compras/comprobanteFactura.ts`: `LineaComprobante` suma `cantidadBase: number | null`, `precioPor: CobraPor` y `unidadBase: string | null`. `armarComprobante` los pasa a `calcularTotales`, y así el desglose por alícuota da bien.
- `lib/compras/cargarComprobante.ts`: el select de ítems suma `cantidad_base, precio_por, compras_items(unidad_base)`.
- `lib/compras/facturaMensaje.ts` (`lineaDetalle`): en una línea por kg, `   — 2 CAJA (33,4 KG) QUESO BARRA: $ 41.750,00`.
- `lib/compras/ComprobanteImagen.tsx`: cantidad "2 caja · 33,4 kg" y precio "$ 1.250 /kg".
- `_check_comprobante.ts`: un caso con una línea por kg (el total por alícuota sale de kg × precio).

## 8. Casos borde (y cómo los resuelve A2b)

| # | Caso | Resultado |
|---|---|---|
| 1 | Insumo sin conversión (bolsa de consorcio: Unid., 1, unidades) | Ningún campo nuevo en remito ni factura. Sin `≈` en Stock. "Cobra por" no aparece. |
| 2 | "Ananá (kg)": unidad vacía, base kg, contenido 1 | `tieneConversion` = false: no hay kg aparte (la cantidad ya son kg). Está en la lista de revisión: hay que cargarle "kg" como unidad de compra. |
| 3 | Queso Barra cobrado por kg, remito sin kg | El remito guarda las cajas. La factura no prellena los kg y los exige. Las diferencias muestran los recibidos "≈ nominal". |
| 4 | Remito con kg y factura con otros kg | Sin diferencia (las cajas coinciden). Aviso en la línea de la factura si > 1 %. |
| 5 | Kg tipeados ×10 (330 en vez de 33) | Aviso "pesó 900 % más que lo nominal" en remito o factura. No bloquea. |
| 6 | Editar un remito cambiando solo los kg | No hay movimiento de stock. Un `remito_editado` con `cambiados[].antes.cantidad_base`. |
| 7 | Editar un remito sin tocar nada | No hay evento. `cambios: false` y el toast "Sin cambios". |
| 8 | El proveedor cambia de "por caja" a "por kg" en la factura | La línea cambia a kg, el precio se convierte y se exigen los kg. Con "Actualizar precios", el par pasa a `base` y queda en el historial "(por factura)". Sin el check, el par no cambia. |
| 9 | Dos líneas del mismo insumo, una por caja y otra por kg | Las dos se guardan. El remito automático suma las cajas de las dos. "Actualizar precios" toma la última (`orden desc`), como hoy. |
| 10 | Línea libre (flete) con `precio_por = base` | Error de la RPC. La UI ni siquiera muestra el control. |
| 11 | Factura vieja (anterior a A2b), confirmada | `precio_por = 'unidad'`: el mismo subtotal. Las diferencias muestran los kg "≈ nominal". |
| 12 | Factura vieja en kg sobre insumo en cajas (prod) | La migración no la toca: `raise notice` + D4. En dev no hay. |
| 13 | Anular una factura con remito automático | Stock revertido en cajas. `remito_eliminado` con el motivo "Se anuló la factura …". |
| 14 | Remito borrado antes de A2b | Su evento ya no existe (limitación conocida de B1). El backfill solo cubre los remitos vivos. |
| 15 | Insumo editado en Insumos mientras una factura actualiza su precio | El form da el conflicto "cambió mientras editabas" (precio o `cobra_por`). No hay deadlock (E15). |
| 16 | Proveedor quitado del insumo (par inactivo) y factura con "Actualizar precios" | No se actualiza (`and activo`, como hoy). |
| 17 | Insumo en litros | Funciona igual, con "l" donde dice "kg". Los textos de error de la RPC dicen "kg" (§3.9, nota). |
| 18 | Pedido viejo con una unidad distinta a la del insumo (Crema Pastelera "kg", insumo vacío) | Se mantiene, porque el insumo no tiene unidad. Si se carga la unidad del insumo, la próxima edición del pedido la pisa y B1 lo registra como cambio de unidad. |
| 19 | B4 (devoluciones y nota de crédito) | Hereda el modelo: una NC es `compras_facturas` con las mismas líneas (`cantidad_base`, `precio_por`). La devolución mueve stock en cajas. **B4 necesita A2b mergeada.** |

## 9. Verificación

### 9.1 Antes de empezar

1. `git fetch && git reset --hard origin/qa`. **B2 tiene que estar adentro** (`ls supabase/migrations | grep 20261005170000` y `lib/compras/comprobanteFactura.ts` presentes). Si no está, se arranca por §3 y §9.2 y se avisa al coordinador.
2. Copiar `.env.local` desde `C:\Dev\Trabajo\4peeq\YA!Chipacitos\.env.local`, `npm install` y el dev server **desde PowerShell** en el puerto 3005.
3. Releer los cuerpos vigentes de las funciones de §1.1 **en `qa`**. Si alguna se redefinió después de `b11d729`, partir de esa.
4. `npx supabase migration list --linked --project-ref fafckqysyvtlslfnpzrh`: dev tiene que coincidir con `qa` hasta `20261005170000`.

### 9.2 SQL de escenarios (dev, **sin pushear**; todo se revierte)

Archivo `docs/bloque2/escenarios-A2b.sql`, con el patrón de `escenarios-A2a.sql`: un `do $$ … $$` que corre como `qa-admin` (`set_config('request.jwt.claims', …)` + `set_config('role','authenticated', true)`) y termina con `raise exception 'RESULTADO: %', v_res`. Se corre **pegado detrás del texto de la migración**, en un solo archivo temporal:

```
npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh -f <tmp: migración + escenarios>
```

El `raise` deshace todo, migración incluida. Después: `select to_regclass(…)` / `select column_name … where column_name = 'unidad_base'` tiene que dar vacío.

| # | Escenario | Esperado |
|---|---|---|
| S1 | Migración | Columnas y checks. `unidad_base`: kg para las 9 de §3.2, unidades para Huevos y el resto. `cobra_por` = `unidad` en los 14 pares con precio. 11 `remito_creado` de backfill. 0 `FACTURA EN OTRA UNIDAD`. |
| S2 | Subtotales | La suma de `subtotal` e `iva` por factura es igual antes y después. Los totales de cabecera no cambian. |
| S3 | `compras_guardar_insumo` en Queso Barra | `unidad_base = kg`, `cobra_por_default = base`, y el par GLOBAL con `cobra_por = base` y `precio_ref = 121.2121`. Historial con `unidad_base`, `cobra_por_default`, `proveedor.cobra_por` y `proveedor.precio_ref`. `unidad_base = 'metros'` da error. Un `cobra_por_anterior` viejo da el error de conflicto. |
| S4 | Remito nuevo en un pedido enviado de GLOBAL: Queso Barra 2 + `cantidad_base` 33,4 | Stock +2 (no 33,4). `cantidad_base` guardada. `remito_creado` con `lineas[0].cantidad_base = 33.4`. `cambios = true`. |
| S5 | Editar el remito: solo kg 33,4 → 32,9 | Sin movimiento nuevo. `remito_editado` con `cambiados[0].antes.cantidad_base = 33.4`. |
| S6 | Editar: cajas 2 → 3 | Un movimiento de +1. `remito_editado` con `cantidad` 2 → 3. |
| S7 | Guardar el remito igual | Sin evento. `cambios = false`. |
| S8 | `cantidad_base` −1, y kg en una línea libre sin insumo | Error en los dos casos. |
| S9 | Factura borrador: Queso Barra 2 Caja, `precio_por = base`, 33,4 kg, $ 1.250 | `subtotal = 41750.00`, e `iva` y la cabecera coherentes. Sin `cantidad_base` da "Cargá los kg…". Base con `cantidad = 0` da error. Flete con base da error. |
| S10 | Confirmar sin remitos (`p_mercaderia_llego = true`) | Remito automático con `cantidad = 2` y `cantidad_base = 33.4`. Stock +2. `remito_creado` con `origen = 'factura'`. |
| S11 | Confirmar con `p_actualizar_precios = true` | El par queda en `precio_ref = 1250` y `cobra_por = 'base'`. 2 filas de historial con `origen = 'factura'`. `precios_actualizados = 1`. |
| S12 | Diferencias: factura 2 Caja / 33,4 kg contra un remito manual de 1 Caja / 16,2 kg | Una diferencia de 1 (cajas). En `v_compras_factura_diferencias`: `facturada_base 33.4` (real), `recibida_base 16.2` (real). Con un remito de 2 Caja, no hay diferencia. |
| S13 | Resolver S12 con `ajusta_stock` | El movimiento es +1 (cajas), no 17,2. |
| S14 | Anular la factura de S10 | El stock vuelve (−2). `remito_eliminado` con el motivo y las líneas con kg. |
| S15 | Factura vieja de dev (P-0027) | En la vista de diferencias: `*_base_real = false` y la base = cantidad × contenido. |
| S16 | Eliminar el remito de S4 | `remito_eliminado`. La vista de eventos sigue mostrando el `remito_creado` (ya está en la tabla). |
| S17 | RLS | Como `authenticated`, un `insert` directo en `compras_remito_items` y un `update` en `compras_factura_items` fallan (0 filas o `permission denied`). |
| S18 | `v_compras_pedido_pendiente` | Queso Barra de GLOBAL: `cobra_por` según el par, `contenido 16.5`, `recibido_base` y `recibido_base_completo` coherentes. |
| S19 | Invariante del ledger al final del lote | 0. |

**Concurrencia (E15)**, con dos sesiones como hizo A2a (las dos se revierten):
- A: `compras_guardar_insumo` en Queso Barra (bloquea el insumo y espera con `pg_sleep`).
- B: `compras_confirmar_factura` con "actualizar precios" sobre Queso Barra.
- Con `FOR UPDATE` puede aparecer `40P01`. Con `NO KEY UPDATE`, las dos terminan.

Si no se logra reproducir, se anota (como en A2a) y queda cubierto por construcción.

### 9.3 Build, lint y chequeos puros

- `npx tsx` de todos los `_check_*` de §5, §6 y §7.
- `npx tsc --noEmit`.
- `npx eslint` de los archivos tocados.
- `npm run build`.
- Cero hex y cero `as any` nuevos.

### 9.4 Push a dev (con OK del coordinador)

1. `git fetch && git rebase origin/qa` y el timestamp mayor que el último de `qa`.
2. `npx supabase db push --dry-run --linked --project-ref fafckqysyvtlslfnpzrh`: tiene que aparecer **solo** `20261005180000`.
3. Con el OK, el push. Guardar los `raise notice` (la lista de revisión) para las notas.
4. `npm run types` y el commit del tipo regenerado.
5. Invariante:
   ```
   npx supabase db query --linked --project-ref fafckqysyvtlslfnpzrh "select count(*) from compras_stock_actual a where a.cantidad <> (select coalesce(sum(delta),0) from compras_stock_movimientos m where m.item_id = a.item_id)"
   ```
   Tiene que dar 0.

### 9.5 QA en el navegador (local :3005 contra dev, `qa-admin`)

1. **Insumos › Queso Barra:**
   - el bloque Unidades con el ejemplo vivo;
   - cambiar a "Por defecto se cobra por: kg" y el par GLOBAL a kg: ver el precio convertido;
   - guardar: "Cambios" muestra las 4 líneas.
2. **Insumos (lista):** Stock con `≈ kg` y "Precio ref." con `/kg`.
3. **Pedidos › nuevo pedido a GLOBAL con Queso Barra 2:**
   - la unidad fija;
   - el `≈ 33 kg`;
   - generar el mensaje: `2 CAJAS (~33 KG) QUESO BARRA`;
   - enviar.
4. **Remitos › cargar el remito del pedido:**
   - el campo "kg reales" solo en Queso Barra;
   - tipear 29: el aviso del 12 %;
   - poner 33,4 y guardar: el impacto dice +2 Caja.
5. **Editar el remito:** solo kg → 32,9. Guardar: "Sin movimiento". En el historial del pedido, "Editó el remito · Queso Barra 2 Caja · 33,4 → 32,9 kg".
6. **Facturas › nueva sobre ese pedido:**
   - la línea de Queso Barra en "kg" con 32,9 prellenado;
   - cambiar a 33,4: el aviso "0,5 kg más que el remito" (+1,5 %);
   - $ 1.250 /kg: el subtotal da $ 41.750;
   - marcar "Actualizar precios" y confirmar: el modal dice "pasa a cobrarse por kg" si correspondía.
7. **Diferencias:** sin diferencia en cajas. Forzar otra factura con un remito parcial (1 Caja): la diferencia muestra los kg.
8. **Compartir (B2):** el mensaje dice `2 CAJA (33,4 KG) QUESO BARRA`. La imagen sale con "$ 1.250 /kg" y el IVA correcto.
9. **Anular la factura de prueba:** el historial del pedido dice "Eliminó el remito · Se anuló la factura …" (si tenía remito automático).
10. **Un insumo sin conversión** (Bolsa Consorcio): nada nuevo en ningún lado.
11. **Celular (375px) y tema claro:** remito y factura sin scroll horizontal. Los inputs ≥ 44px.
12. **Consola sin errores.**

### 9.6 Datos de dev

Lo que quede de la QA (pedido, remito y factura de prueba de GLOBAL, y el cambio de Queso Barra a kg) se anota en las notas. **Queso Barra queda configurado por kg** a propósito, para la prueba del usuario. Si se prefiere, se vuelve atrás desde la ficha (y queda en el historial).

## 10. Archivos

**En alcance:**
- `supabase/migrations/20261005180000_compras_unidades_medida.sql`
- `docs/bloque2/escenarios-A2b.sql`, `docs/bloque2/notas-A2b.md`
- `lib/compras/unidades.ts` (nuevo), `lib/compras/_check_unidades.ts` (nuevo)
- `lib/compras/totalesFactura.ts`, `lib/compras/diferencias.ts`, `lib/compras/historialPedido.ts`, `lib/compras/pedidoMensaje.ts` y sus `_check_*`
- `app/admin/compras/insumos/{InsumoModal.tsx, InsumosClient.tsx, acciones.ts, page.tsx}`
- `app/admin/compras/pedidos/{PedidoEditor.tsx, PedidoEnvio.tsx, PedidoDetalle.tsx (solo :194-215), PedidosClient.tsx (si hace falta la prop), page.tsx (consultas), acciones.ts (guardarPedido)}`
- `app/admin/compras/pedidos/remitos/{RemitoForm.tsx, modelo.ts, acciones.ts, datos.ts, page.tsx, _check_modelo.ts}`
- `app/admin/compras/pedidos/facturas/{FacturaForm.tsx (líneas :562-695 y el conteo de precios), ConfirmarFacturaModal.tsx (:106-111), DiferenciasPanel.tsx, modelo.ts, acciones.ts, datos.ts, _check_modelo.ts}`
- B2, ya mergeada: `lib/compras/{comprobanteFactura.ts, cargarComprobante.ts, facturaMensaje.ts, ComprobanteImagen.tsx, _check_comprobante.ts}`
- `app/admin/compras/stock/{StockClient.tsx (:147), StockFicha.tsx (:137), page.tsx (consulta)}`
- `lib/database.types.ts` (regenerado)

**Fuera de alcance:**
- `compras_guardar_pedido` y la vista de eventos (B1; no se redefinen).
- El pie de `FacturaForm` (B2).
- La receta en unidad base, `calculoSugerido`, el conteo y Fábrica (A3).
- La ficha conectada, `v_compras_stock_movimientos` y el reporte por insumo (A2c).
- La NC y las devoluciones (B4).
- Proveedores y reportes (B3).
- `compras_items.precio` y `compras_remito_items.precio` (F9).
- El manual `/ayuda` (se hace con la guía, al final).
- La unidad vacía de los 36 insumos: es un dato que carga el usuario (§12).

**Archivos compartidos:** `FacturaForm.tsx` (B2 ya pasó: solo líneas), `PedidoDetalle.tsx` y `historialPedido.ts` (B1 terminó), `pedidos/acciones.ts` y `page.tsx` (B3 puede tocar `page.tsx` por `?estado=`: avisar al coordinador si B3 está en vuelo).

## 11. Commits y cierre (rama `bloque2/stock`)

### 11.1 Commits

1. `feat(compras): unidades de medida en la base — unidad base, cobra por, kg reales, subtotal por kg y eventos de remito (A2b)`: migración + escenarios.
2. `chore(tipos): regenerar database.types tras aplicar A2b en dev`.
3. `feat(compras): unidades en Insumos, Stock y Pedidos (ficha con ejemplo vivo, equivalencia, mensaje con kg) (A2b)`.
4. `feat(compras): kg reales en remitos y cajas + kg + $/kg en facturas; diferencias y comprobante con kg (A2b)`.
5. `docs(bloque2): notas de A2b`.

Push de la rama después de cada paso verificado.

### 11.2 Notas

`docs/bloque2/notas-A2b.md` con:
- lo hecho;
- los desvíos;
- la verificación (S1–S19, la concurrencia y la QA);
- **la lista de `raise notice` de dev**;
- los datos que quedan en dev;
- "Para otras fases": B3 (`cobra_por` en la pestaña Insumos del proveedor), B4 y A2c;
- la lista de pruebas.

### 11.3 Para la release (no se ejecuta ahora; lo decide el usuario)

1. Correr en prod, con autorización y en solo lectura, `select version()`. Si es menor a 17, aplicar el plan B de §3.3 antes del push.
2. Correr en prod, con autorización y en solo lectura, la consulta `FACTURA EN OTRA UNIDAD` de §3.2 (como `select`) y resolverla según D4 **antes** de aplicar la migración.
3. Al aplicar, guardar la lista de revisión (`raise notice`) y pasársela al usuario.

## 12. Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, **una vez mergeado a `qa`**:

1. **Compras › Insumos.** Revisar la lista de "revisar" de las notas: cargarle la unidad de compra a los insumos que no la tienen y confirmar que la unidad base (kg / unidades) de cada uno sea la correcta.
2. **Abrir Queso Barra.** → El bloque "Unidades" dice "1 Caja = 16,5 kg" y cuánto stock hay en cajas y en kg. Cambiar "Por defecto se cobra por" a kg y, en la fila de GLOBAL, "Cobra por" a kg. → El precio de referencia se convierte a $/kg. Guardar: en "Cambios" figuran los dos cambios.
3. **Insumos (lista).** → Queso Barra muestra el stock con "≈ … kg" y el precio de referencia "/kg".
4. **Pedidos › Crear pedido a GLOBAL con 2 de Queso Barra.** → La unidad "Caja" no se puede editar. Generar el mensaje → dice "2 CAJAS (~33 KG) QUESO BARRA". Enviarlo.
5. **Remitos › Cargar el remito de ese pedido.** → Solo Queso Barra tiene "kg reales". Poner 29: avisa que pesó 12 % menos. Corregir a 33,4 y guardar. → El stock sube 2 cajas (no 33).
6. **Editar el remito y cambiar solo los kg a 32,9.** → El stock no se mueve. En el detalle del pedido, el historial dice "Editó el remito · Queso Barra 2 Caja · 33,4 → 32,9 kg".
7. **Facturas › Cargar la factura de ese pedido.** → La línea de Queso Barra viene "por kg" con 32,9 kg. Cambiar a 33,4 → avisa "0,5 kg más que el remito". Precio 1.250 → el subtotal es 33,4 × 1.250 = $ 41.750.
8. **Marcar "Actualizar los precios de referencia" y confirmar.** → En Insumos › Queso Barra › Cambios: "Precio ref. … (por factura)".
9. **Diferencias.** Si la factura dice 2 cajas y llegaron 2: no hay diferencia, aunque los kg no coincidan exacto. En otro pedido con un remito de 1 caja y una factura de 2: la diferencia es de 1 Caja y muestra los kg de cada lado.
10. **Compartir la factura** (imagen y mensaje). → La línea dice "2 CAJA (33,4 KG)" y el IVA da bien.
11. **Una factura vieja** (P-0027). → Se ve igual que antes, con los mismos totales.
12. **Un insumo que no se pesa** (Bolsa Consorcio). → En pedido, remito y factura no aparece nada nuevo.
13. **Celular (375px) y tema claro.** → El remito y la factura se leen sin scroll horizontal y los campos de kg se tocan bien.

## 13. Decisiones que necesitan al usuario

| # | Pregunta | Recomendación | Por qué |
|---|---|---|---|
| **D1** | El plan dice "`unidad_base` = kg salvo huevos". En dev, 48 de los 59 insumos son descartables o reventa (bolsas, bobinas, guantes, vasos, medialunas). ¿Qué base llevan? | **Por regla:** kg para Materia prima (menos Huevos) y para los "(kg)"; **unidades para el resto**. Lista de revisión con `raise notice` (E16). | Ponerle "kg" a una bolsa de consorcio mostraría "≈ 1 kg" en todos lados. La regla deja bien los 59 de dev y avisa lo dudoso. |
| **D2** | ¿La migración configura los quesos "por kg" o se hace a mano? | **A mano.** La migración deja todo "por unidad" (como se facturó hasta hoy). El usuario (o Marcos) pasa Queso Barra, y lo que corresponda, a kg desde la ficha, y el precio de referencia se convierte solo. | Ningún proveedor real de dev cobra por kg hoy (Queso Barra $ 2.000 por Caja). Adivinar cambiaría precios de referencia sin que nadie lo vea. |
| **D3** | Peso variable: ¿cuánto se tolera y qué pasa si no coincide? | **Solo avisos, nunca diferencia ni bloqueo:** > 10 % contra lo nominal (agarra los errores de tipeo) y > 1 % entre los kg de la factura y los del remito. | U1–U3 dicen que los kg son información. Una "diferencia de kg" resoluble sería una nueva clase de diferencia: si hace falta, va con B4 (nota de crédito). |
| **D4** | Si en prod aparecen facturas confirmadas en kg sobre insumos en cajas, ¿qué se hace? (dev: 0; prod no se puede mirar hasta la release) | **No se recalculan solas.** Antes de la release se corre la consulta de §3.2 en solo lectura. Si el gasto no está pagado: anular y recargar (el circuito normal corrige stock y diferencias). Si está pagado: se deja y se corrige el stock con "Ajustar stock", con nota. | Recalcular una factura confirmada cambia montos que ya están en Gastos. Anular y recargar usa los caminos con ledger y auditoría. |
| **D5** | Confirmar una factura con "Actualizar precios" cuando el proveedor cobró distinto (por kg en vez de por caja): ¿cambia también el "cobra por" del proveedor? | **Sí**, con historial "(por factura)" y aviso en el modal de confirmación (E7). Sin el check, nada cambia. | Un precio de referencia sin su unidad es el bug de hoy. La última factura es la mejor evidencia de cómo cobra el proveedor. |
