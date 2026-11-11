# Gastos con el plan de cuentas: qué probar (para Nico)

Esto está en **QA** (`qa.yachipacitos.com.ar`), con datos de prueba: podés cargar, pagar y borrar sin miedo. Los gastos de Fudo que vas a ver son reales de **La Unidad** (copiados; en Fudo no se toca nada).

## Qué cambió

- El plan de cuentas que mandaste está cargado entero (216 filas, 141 cuentas), tal cual el Excel. **No se edita desde la app**: si hay que cambiarlo, nos mandás la versión nueva y la cargamos nosotros.
- Cada gasto se clasifica con **una cuenta**. Rubro y categoría salen solos del plan.
- Al cargar un gasto se ven 92 cuentas de gasto y 20 que **no son gasto** pero mueven plata (retiros del socio, bienes de uso, capital de préstamos, pago de IVA…). Esas se cargan igual pero no suman en "Gastado en el período": aparecen aparte.
- Los gastos de Fudo se clasifican por **lo que dice Fudo** (la categoría, o el proveedor si no tiene categoría): elegís la cuenta una vez y vale para los que ya están y los que vengan.

## Para probar

1. **Parámetros › Plan de cuentas.** Buscá "luz", "alquiler", "proegur", "5.3.01". Probá el botón **Las que se eligen en Gastos**. ¿Está todo como en el Excel?
2. **Gastos › Nuevo gasto.** En **Cuenta**, escribí lo que es (luz, nafta, sueldos, contador…). Mirá que abajo diga qué entra en la cuenta. Guardalo.
3. Cargá un **retiro del socio** (3.1.01.01). Fijate que no sume en "Gastado en el período" y aparezca aparte.
4. Abrí un gasto y **cambiale la cuenta**. Probá el filtro **Todas las cuentas** de la lista (por rubro, "No son gasto", "Sin clasificar").
5. **Gastos › Clasificar Fudo.** Elegí la cuenta para "Cubre franco", "Logistica", "Otros envíos", etc. Fijate que los gastos se clasifiquen solos y que en la lista ya no digan "Sin clasificar".
6. Clasificá **uno a mano** desde la lista y después cambiá la equivalencia de su categoría: el que clasificaste a mano no tiene que moverse.
7. **Gastos › Que se repiten.** Cargá uno (por ejemplo, alquiler de un local) con su cuenta.
8. **Resumen por local.** Lo que no es gasto no tiene que aparecer.

## Lo que necesitamos que nos confirmes

Mientras tanto usamos la propuesta; si algo no va, se cambia sin tocar código.

1. **¿Qué cuentas se ven al cargar un gasto?** Las 92 de gasto (todo el tipo 5 menos 5.1.04.01 y 5.9.02.01) y estas 20 que no son gasto: 1.1.03.01, 1.2.02.02, 1.2.03.\*, 1.3.01.\*, 1.4.01.\*, 2.3.01.01/03/04, 2.4.01.01 y 3.1.01.\*. ¿Falta o sobra alguna?
2. **"Mayorista Ya! Chipacitos" en Fudo.** 82 gastos de La Unidad, unos $ 12 M: es lo que el local le compra a la fábrica. Sería la 5.1.04.01, pero el plan dice que esa sale de PostBerry y no se carga a mano, así que hoy no se puede elegir. ¿La habilitamos para estos o van a otra cuenta?
3. **"Envíos de materia prima" en Fudo** (50 gastos de La Unidad): ¿es lo que el local compra a la fábrica (5.1.04.02) o el flete (5.4.03.01)?
4. **Administración central como unidad.** El plan la usa (tiene su línea en el Tablero), pero en el sistema no existe: hoy están Fábrica, los locales y Churros Tubo. ¿La agregamos?
5. **Factura de compras.** El gasto que crea una factura de proveedor entra en 5.1.01.01 (Ingredientes base) y se puede cambiar. ¿Está bien así por ahora?
6. **Monto mínimo de bienes de uso.** El Excel dice "propuesta: $ 500.000". Si está confirmado, el formulario puede avisar cuando un bien de uso es menor o un pequeño equipamiento es mayor.

## Lo que todavía no está (y el plan ya prevé)

Tablero de resultados por unidad, IVA neto (gasto sin IVA e IVA crédito), prorrateo del F.931 entre unidades, ingresos desde PostBerry y Fudo, cajas y bancos como cuentas y cierre de mes. Las cuentas ya quedan cargadas para eso.

Los gastos de Fudo de Córdoba, Irigoyen, San Lorenzo y Paraguay todavía no se traen: estamos consiguiendo las credenciales de la API.
