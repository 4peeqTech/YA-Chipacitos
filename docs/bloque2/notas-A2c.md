# A2c — Ficha de insumo conectada (notas del Ejecutor)

> Rama `bloque2/stock`, rebaseada sobre `origin/qa` @ `852bd66` (B3 adentro). Plan: `plan-A2c.md`.
> Migración `20261006120000_compras_trazabilidad_insumo.sql` **aplicada en dev** (`fafckqysyvtlslfnpzrh`) el 2026-10-06. Prod no se tocó.

## Lo hecho

**SQL** (§3, copia literal del plan):
- `compras_trazabilidad_insumo(desde, hasta, insumo?)`;
- `v_compras_insumo_documentos`;
- `factura_id` y `discrepancia_id` al final de `v_compras_stock_movimientos`;
- 5 índices por fecha.

Es solo lectura: no hay triggers ni RPCs de escritura.

**Lógica pura:**
- `lib/compras/trazabilidad.ts` (27 casos OK);
- `lib/compras/reportePorInsumo.ts` (20 casos OK);
- `calcularRangoUltimos` en `rangoFechas.ts`.

**`rutas.ts`:**
- `PestanaInsumo` y `PESTANAS_INSUMO`;
- `rutaDe` acepta `pestana` para `insumo`;
- `rutaEditarInsumo`.

**Ficha del insumo** (`StockFicha.tsx` como contenedor + `app/admin/compras/stock/ficha/*`):
- **Encabezado fijo:** stock, ≈ kg, mínimo, chip "Archivado" y "Editar insumo" (solo con `compras-insumos`).
- **Stock:** "Ajustar stock" sin cambios, más "En camino" con los pedidos abiertos y el link "Histórico por conteo".
- **Compras:**
  - período 30 días / 3 meses / 12 meses;
  - 4 tarjetas (pedido, recibido, facturado y precio promedio);
  - puente de stock;
  - gráfico de precio de 12 meses (admin), con "por Caja | por kg" y la línea "Ref.";
  - últimas facturas (admin) y últimos remitos;
  - proveedores.
- **Movimientos:**
  - filtros Todos / Remitos / Conteos / Facturas / A mano, con "Ver 30 más";
  - chips con `LinkEntidad` a remito, factura ("Diferencia" si hay `discrepancia_id`) y conteo. **El chip del remito ya no está armado a mano.**
- **Carga y navegación:**
  - cada pestaña carga la primera vez que se abre y queda montada (oculta);
  - `?pestana=` abre en esa pestaña;
  - al cerrar se limpian `insumo` y `pestana`.

**Insumos:**
- la pestaña "Catálogo" se llama "Insumos";
- `?insumo=` abre el form del insumo, y si el id no existe avisa con un toast y limpia la URL;
- en el form, "Ver ficha": si hay cambios sin guardar, pide confirmar con `ConfirmDialog` antes de salir.

**Reportes:** pestaña "Por insumo", segunda (D3):
- búsqueda sin tildes, chips de categoría (solo si hay más de una), top 8 por neto (admin), tabla, pie con totales y "Exportar CSV" de lo filtrado;
- `ReportesClient.tsx`: solo los 5 hunks de §6.7.4;
- `page.tsx` de Reportes y `lib/compras/reportes.ts` no se tocaron.

**D2:** `lib/modulos.tsx`, el label del menú "Catálogo" pasa a "Catálogo de productos". **Es un archivo compartido**; solo cambió el `label` (la `key` y los permisos quedan igual).

**`eslint.config.mjs`:** la regla de hex ahora cubre `app/admin/compras/stock/**` y `reportes/PorInsumo.tsx`.

## Desvíos

1. **T12b en `escenarios-A2c.sql`:** dev no tiene movimientos entre las 21:00 y las 24:00 de Argentina. Dentro del lote revertido, el ajuste de T10 se corre a ayer 22:30 AR: cuenta en ayer (+5) y no en hoy. Es un `update` de un movimiento de prueba, no un insert en el ledger. *(Aprobado.)*
2. **`calcularRangoUltimos(cantidad, ahora, 'dias' | 'meses')`:** con meses, "3 meses" al 06/10 arranca el 06/07, como en el wireframe. *(Aprobado.)*
3. **`PuntoPrecio`** suma `subtotal`, que lo usa el tooltip. *(Aprobado.)*
4. **Colores del gráfico:** salen del orden fijo (el principal primero y el resto por nombre). Si se saca un proveedor que va después, los anteriores no cambian de color. *(Aprobado.)*
5. **"(N sin pesar)" en el reporte:** solo se muestra si alguna línea trae kg, porque la función no sabe el `cobra_por`. En la ficha se sigue la regla del plan (algún par cobra por kg). *(Aprobado.)*
6. **CSV:** "Último precio por (unidad/base)" lleva el valor crudo (`unidad` o `base`). *(Aprobado.)*
7. **Paleta del gráfico** (`dataviz`, `validate_palette.js`):
   - **Serie 1:** `--color-accent-fg` en lugar de `--color-accent`. En oscuro es el mismo hex. En claro, `accent` da 1,68:1 sobre blanco y `accent-fg` (#7a5c00) pasa banda y contraste. La barra del top 8 también usa `accent-fg`.
   - **Resultados** con accent-fg, info, green y orange:
     - **claro:** CVD ΔE 8,8 PASS y visión normal 20,8 PASS. Falla la banda solo en green (L 0,786). Hay WARN de contraste en green y orange (1,85 y 2,15).
     - **oscuro:** falla la banda en los 4 (L 0,77 a 0,83). Todo lo demás pasa.
   - **Por qué no hay una paleta que pase todo:** el tema oscuro no tiene ningún token más oscuro, y en claro las variantes oscuras (`success`, `warning`) son colores de estado (reservados) o fallan en CVD.
   - **Compensación:** leyenda con nombres, tooltip con proveedor y factura, y la lista "Últimas facturas" como vista en tabla.
   - **En la práctica** casi todos los insumos tienen 1 o 2 proveedores. Las series 1 y 2 (accent-fg e info) pasan todo en claro.
8. **Tarjetas de Compras en 2×2 siempre:** el modal `xl` mide como mucho 768 px, y con 4 columnas "$ 175,58 /kg" se partía.
9. **El gráfico se dibuja solo con la pestaña Compras visible.** Oculto, recharts avisaba "width(0)". Los datos y el modo elegido se conservan.
10. **Fechas del período con año cuando cruza de año** (12 meses: "Del 06/10/25 al 06/10/26"). Si no, el puente decía "Stock el 06/10" dos veces.
11. **Ticks del eje X:** uno por fecha distinta y como mucho 6. Dos facturas del mismo día repetían la etiqueta y React se quejaba por claves duplicadas.
12. **`?insumo=` inexistente en Stock:** ahora también se limpia la URL. Antes no abría nada y dejaba el param.
13. **`InsumoModal` no tenía confirmación de cambios sin guardar.** Calculo `hayCambios` con `datosCambiados` y `proveedoresCambiados`, que ya existían. Con cambios, "Ver ficha" pide confirmar; sin cambios es un `LinkEntidad` directo.
14. **`useToast()` devuelve un objeto nuevo en cada render.** En `PorInsumo` va por ref, para no volver a pedir el reporte cada vez que aparece un toast.
15. **Rebase:** `rangoFechas.ts` tuvo conflicto con `rangoDeParams` y `diaSiguiente` de B3. Quedaron las tres funciones. `database.types.ts` se tomó de `qa` y se regeneró después del push.
16. **Skills de diseño:** no corrí `impeccable` ni `emil-design-eng` como skills. El "shape" ya estaba en los wireframes del plan. El "harden" lo hice a mano: vacíos, errores, permisos, 375 px, alto mínimo del panel y skeletons del mismo alto.

## Verificación

- **Escenarios** (lote revertido antes del push): T1–T14 + T12b OK.
  - T1 da exacto lo de §1.5.
  - T3, T4 y T14 dan 0.
  - T13 tarda 8,1 ms.
- **Push:**
  - el dry-run mostró solo `20261006120000`;
  - `db push` OK;
  - el diff de `npm run types` trae solo la vista nueva, las 2 columnas (+ sus relaciones) y la función;
  - el invariante del ledger da 0 después.
- **Checks:** `_check_trazabilidad` 27, `_check_reportePorInsumo` 20, `_check_unidades` 32 y `_check_reportes` 30, todos OK.
- `tsc --noEmit`, `eslint` (`app/admin/compras`, `lib/compras`, `lib/modulos.tsx`) y `npm run build`: limpios.
- **QA en el navegador:** local :3005 contra dev, con el Playwright de Chromium. El browser in-app no corre `requestAnimationFrame` y no hidrata el login (igual que en A2b).
  - **qa-admin:**
    - **Stock:** igual que antes. Ajusté +1 y lo revertí (queda 182). Cerrar con un ajuste a medio cargar pide confirmación.
    - **Compras (3 meses):** pedido 353/11, recibido 170 con 49,1 kg (6 sin pesar), facturado 84 Caja / 1.386,8 kg / $ 243.500, promedio $ 175,58/kg y $ 2.898,81/Caja, último $ 1.250/kg GLOBAL.
    - **Puente:** 0 + 170 + 38 − 26 = 182, con consumo "— (llega con la receta)".
    - **Gráfico:** "por Caja / por kg" cambia el promedio, el último precio y la línea Ref. El tooltip muestra el N° de factura.
    - **Links:** factura, remito, pedido y GLOBAL (pestaña Insumos).
    - **Movimientos:**
      - **Filtros:** Facturas 3, Remitos 8, A mano 10 y Conteos 4, con sus chips y links.
      - **"Ver 30 más":** en Fécula pasa de 30 a 36.
    - **Deep links:**
      - `&pestana=compras` y `&pestana=movimientos` abren en esa pestaña;
      - cerrar limpia la URL y F5 no reabre;
      - un id inexistente no abre nada y limpia la URL.
    - **Insumos:**
      - la pestaña se llama "Insumos";
      - `?insumo=QB` abre el form;
      - "Editar insumo" lleva al form y "Ver ficha" vuelve a la ficha;
      - con un cambio sin guardar, "Ver ficha" pide confirmar;
      - un id inexistente da el toast y limpia la URL.
    - **Reportes › Por insumo** (01/09–31/10):
      - 17 filas (igual que T2), primero Fécula y después Queso Barra;
      - aparece el top 8;
      - "fecula" encuentra Fécula;
      - el pie dice "17 insumos · Neto $ 1.039.542 · Total con IVA $ 1.257.846";
      - el CSV sale con BOM y 21 columnas;
      - el nombre del insumo lleva a la ficha con `pestana=compras`.
  - **qa-coordinador:**
    - En la ficha (Compras) no aparecen las tarjetas de facturado y precio: sale el aviso con candado. No hay gráfico ni últimas facturas.
    - En Network no hay **ninguna** consulta a facturas: solo la RPC, los remitos de `v_compras_insumo_documentos`, `v_compras_proveedor_insumos` y los movimientos.
    - En Movimientos, "Factura" queda como texto, sin link.
    - "Editar insumo" se ve: tiene `compras-insumos`.
  - **Reportes como no admin:** las cuentas QA no admin no tienen `compras-reportes` en dev.
    - A `qa-coordinador` se lo agregué para la prueba y **se lo saqué al terminar** (verificado).
    - Columnas: Insumo, Categoría, Pedido, Recibido y Stock al final.
    - Sin gráfico; aviso "Lo facturado y los precios los ve un administrador".
    - El CSV tiene 10 columnas, sin facturas ni "$".
  - **375 px, oscuro y claro:** la ficha (Compras y Movimientos) y el reporte, sin scroll horizontal (`scrollWidth = clientWidth`).
  - **Consola:** sin errores ni warnings después de los arreglos.
- **Capturas** (scratchpad del Ejecutor, no versionadas):
  - 1440 oscuro: Compras;
  - 375: Compras en oscuro y claro, Movimientos en oscuro, y el reporte en oscuro.

## Datos que quedan en dev

- La migración `20261006120000` aplicada.
- En Queso Barra, un `ajuste_manual` +1 y su `reversion` −1 ("QA A2c", 06/10 16:18). Netean 0 y el stock queda en 182.
- `qa-coordinador.modulos_permitidos`, sin cambios: le agregué `compras-reportes` y se lo saqué.

## Para otras fases

- **A4:**
  - el consumo aparece solo en el puente cuando exista el tipo `consumo_produccion` (E7);
  - hay que cambiar el texto "— (llega con la receta)" en `ficha/PuenteStock.tsx` (comentario `// A4:`);
  - `compras_trazabilidad_insumo` y `v_compras_insumo_documentos` pasan a A4 en la tabla de dueños;
  - `TIPOS_MOVIMIENTO` (`lib/compras/movimientos.ts`) va a necesitar el tipo nuevo para el label de Movimientos.
- **A3:** "Receta vs. conteo" puede ir como otra pestaña de la ficha: `PESTANAS_INSUMO` y el contenedor ya soportan sumarla.
- **B4:**
  - las NC ya restan en la función y en el reporte, y no entran al promedio ni al gráfico;
  - para ir de una diferencia a su movimiento, usar `compras_factura_discrepancias.movimiento_id`: en dev, el `ajuste_factura` de P-0015 tiene `discrepancia_id` en null.
- **Hallazgo de §14 (Reportes cargaba todo sin límite):** B3 ya lo resolvió (`?desde=&hasta=` en la base, `7d4f41d`).

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar** con `qa-admin@chipacitos.test`, **una vez mergeado a `qa`**:

1. **Compras › Stock › Queso Barra.** La ficha abre como siempre (stock y "Ajustar stock"), y arriba tiene tres pestañas: Stock, Compras y Movimientos. Abajo de "Ajustar stock" dice qué pedidos están en camino.
2. **Pestaña Compras.** Cuatro tarjetas: lo pedido, lo que llegó (cajas y kg pesados), lo facturado (cajas, kg y $) y el precio promedio y el último. Cambiá entre "30 días", "3 meses" y "12 meses": los números cambian.
3. **"Cómo se movió el stock".** Arranca en el stock del primer día y suma remitos, conteos, diferencias con facturas y ajustes, hasta el stock de hoy. "Consumo de producción" dice que llega con la receta.
4. **"Precio en los últimos 12 meses".** Hay un punto por factura. Pasá el mouse: dice la factura y el precio. Cambiá "por Caja / por kg" y fijate que la línea "Ref." acompañe.
5. **"Últimas facturas" y "Últimos remitos".** Tocá un número de factura, un R-xxxx y un P-xxxx: cada uno abre lo suyo.
6. **"Proveedores".** Muestra cómo cobra cada uno (Caja o kg), el precio de referencia y el último facturado. El nombre abre la ficha del proveedor.
7. **Pestaña Movimientos.** Es la lista de siempre. Probá los filtros (Remitos, Conteos, Facturas, A mano). Los movimientos de una factura tienen el chip "Factura", que la abre; los de un conteo abren el conteo.
8. **Compras › Insumos.** La pestaña se llama "Insumos" (antes "Catálogo"). Abrí Queso Barra y tocá "Ver ficha": te lleva a la ficha, y ahí "Editar insumo" te devuelve al form. Si cambiás algo sin guardar, "Ver ficha" te pregunta antes de salir.
9. **En el menú, Parámetros:** "Catálogo" ahora dice "Catálogo de productos".
10. **Compras › Reportes › Por insumo.** Lista lo comprado de cada insumo en el período, con pesos y precio promedio, y un gráfico con los 8 que más se pagaron. Buscá "fecula". Tocá "Exportar CSV" y abrilo en Excel. Tocá un insumo: abre su ficha en la pestaña Compras.
11. **Con `qa-coordinador@chipacitos.test`.** En la ficha no aparece nada de pesos ni de facturas: dice que eso lo ve un administrador. El resto, igual. Reportes no lo tiene habilitado en dev.
12. **Celular y tema claro.** La ficha y el reporte se leen sin scroll horizontal, y las pestañas se tocan bien.
