# Embolsado sin match de catálogo — diseño

## Contexto

`/fabrica/embolsado` reparte la masa de congelado del día en presentaciones (Kg). La RPC `guardar_embolsado_fabrica` (migración `20260807140000_fabrica_embolsado_por_dia.sql`) busca, por cada línea, un producto en `productos` con la terna `tamanio_id + sabor_id + presentacion_id`; si lo encuentra mueve stock terminado, si no, guarda la línea igual pero avisa con un toast rojo ("N líneas no mueven stock — falta el producto con esa combinación en el catálogo").

Desde `bb1fdaa` (`sacarle Pedidos y Catálogo al rol fabrica por el momento`) el rol `fabrica` no tiene acceso a Catálogo, así que no puede cargar los productos que le faltan — el aviso deja de ser una alerta accionable y pasa a ser ruido constante. La funcionalidad de stock de catálogo está deliberadamente fuera de servicio por ahora (consistente con Fase 5 "stock terminado" y Fase 6 "reportes", ya ocultas del nav desde `a75fbd8`).

Se decide desactivar el intento de mover stock desde Embolsado mientras dure esta pausa. El registro de qué se embolsó (masa, sabor, tamaño, presentación, kg) se sigue guardando igual — es el dato que más adelante se va a mostrar en el administrador del ERP, pero esa pantalla se planifica en otro momento y no es parte de este cambio.

Trabajo sobre rama `dev`.

## Alcance

1. **Backend** — `guardar_embolsado_fabrica` deja de buscar `producto_id` y de llamar a `mover_stock_terminado`. Inserta siempre con `producto_id = null`.
2. **Frontend** — `EmbolsadoClient.tsx` deja de mostrar el toast de "líneas sin producto"; guardar siempre confirma con éxito. Los pools cuya masa ya fue 100% repartida (`restanteKg ≈ 0`) desaparecen de la lista del día — ya no hace falta seguir viéndolos una vez completos, porque no hay reconciliación de stock pendiente sobre ellos.

Fuera de alcance: recrear la relación producto↔presentación en catálogo, la pantalla de administrador del ERP que va a mostrar este registro más adelante, y cualquier cambio a Fase 5/6 (siguen ocultas del nav, sin tocar).

## Backend

### `guardar_embolsado_fabrica` (nueva migración)

- Se elimina el `select id into v_producto_id from productos where ...` y el `perform mover_stock_terminado(...)` del loop de inserción. Cada línea inserta con `producto_id = null` sin excepción.
- Se mantiene sin cambios la reversa por neto de movimientos previos (loop que suma `fabrica_stock_terminado_mov` por `embolsado_id` y revierte antes del `delete`): es defensiva y auto-sanadora — si un pool tenía movimientos reales de antes de este cambio (porque el producto sí existía en ese momento), se siguen revirtiendo correctamente al re-guardar. No depende de que se generen movimientos nuevos.
- El retorno cambia de `integer` (conteo de líneas sin producto) a `void`, porque ya no hay nada que contar. Postgres no permite cambiar el tipo de retorno con `create or replace`, así que la migración hace `drop function if exists public.guardar_embolsado_fabrica(date, uuid, uuid, jsonb)` antes de recrearla — mismo cuidado que la Fase 5 documentó para `guardar_produccion_fabrica` (evitar dejar viva una sobrecarga vieja que un bundle cacheado siga llamando).

## Frontend

### `EmbolsadoClient.tsx`

- `guardarPool` deja de desestructurar `sinProducto` de la respuesta de la RPC. Si no hay `error`, siempre `toast.success('Embolsado guardado')`.
- La lista de pools a renderizar se filtra a los que tienen `Math.abs(pool.restanteKg) > 0.01` (tolerancia por redondeo, mismo orden de magnitud que el `difiereMucho` que ya usa el componente). Un pool con toda su masa ya repartida en presentaciones guardadas deja de listarse ese día.
- Estados vacíos:
  - Sin pools en absoluto (como hoy): "No hay masa de congelado cargada este día."
  - Hay pools pero todos están completos: mensaje nuevo, "Toda la masa de este día ya fue embolsada."

No se toca `lib/fabrica/pools.ts` (ya expone `restanteKg`), ni `app/fabrica/embolsado/page.tsx` (no lee `producto_id`, no requiere cambios).

## Testing / verificación

No hay suite de tests automatizados para `/fabrica`. Verificación manual sobre `dev`:

1. Cargar producción de congelado para un tamaño+sabor sin producto de catálogo asociado.
2. En Embolsado, repartir menos que el total de masa y guardar → el pool sigue visible, sin toast de error, con "Embolsado guardado".
3. Completar el resto de la masa y guardar → el pool desaparece de la lista; si era el único, aparece el mensaje "Toda la masa de este día ya fue embolsada."
4. Confirmar en Supabase que las filas de `fabrica_embolsados` quedaron con `producto_id = null` y que no se generaron filas en `fabrica_stock_terminado_mov`.
