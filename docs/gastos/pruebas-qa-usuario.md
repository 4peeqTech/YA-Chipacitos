# Gastos: pruebas en QA antes de mostrarle a Marcos

Todo esto está en **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev). **Nada está en producción.**

## Antes de empezar

- **Cuenta:** `qa-admin@chipacitos.test`, con la contraseña de `docs/qa-credenciales-dev.md`.
- **Fudo solo se lee.** La app nunca escribe en Fudo: lo que pagues o clasifiques acá queda en la base de dev, que es una copia que podemos tocar.
- **Fudo hoy:** solo **YA! UNIDAD** conecta. San Lorenzo, Irigoyen y Córdoba dan error de credenciales y Paraguay no está conectada; se ven con el aviso "no se pudo actualizar". Cuando lleguen las credenciales nuevas, se cargan en Vercel y entran solas.
- **Si algo falla:** anotá la sección y el número de paso, y pasámelo. Lo corrijo en una tanda antes de que lo vea Marcos.
- **Lo que no entra todavía:** el plan de cuentas de Nico (rubros y categorías siguen siendo los de siempre) y los KPIs o gráficos nuevos.

---

## 1. La lista de Gastos

1. Entrá a **Gastos**. Arriba tienen que verse los tres números de siempre (pendiente de pago, pagado y gastado en el período) y abajo la lista del **mes actual**.
2. Cambiá el período, elegí **Pendientes de pago** y un local. Copiá la URL, abrila en otra pestaña: tiene que mostrar exactamente lo mismo.
3. Buscá **cordoba** (sin tilde): tiene que encontrar lo de **Córdoba**. Buscá el código de un pedido (por ejemplo **P-0103**): tiene que aparecer el gasto de su factura.
4. Elegí **Todo el período**. Si hay más de 50 gastos, abajo aparecen **Anterior / Siguiente** y el total de lo filtrado.
5. En el celular, la tabla tiene que entrar entera: monto y estado a la derecha, local y fecha debajo del concepto.

## 2. Cargar un gasto

1. **Nuevo gasto**: cargalo con un **Vence** de una fecha ya pasada y adjuntá una foto en **Factura o ticket**. Guardá.
2. Tiene que aparecer en la lista con "venció el …" debajo del estado.
3. Abrilo: tiene que estar la foto. Abrila (se abre en otra pestaña) y quitala.
4. Cargá otro tildando **Ya está pagado**, con caja y comprobante: tiene que quedar **Pagado** y el comprobante abrirse desde el historial de pagos.
5. Intentá poner un vencimiento anterior a la fecha del gasto: no tiene que dejarte.

## 3. Pagos parciales e historial

1. Abrí un gasto pendiente y tocá **Registrar pago**. Cambiá el monto a una parte.
2. Tiene que quedar **Parcial**, con "falta $ …" en la lista y en Pendientes.
3. En el gasto, el pago aparece en el historial. Tocá **Anular**, poné un motivo y confirmá.
4. El pago tiene que quedar tachado, con quién lo anuló, cuándo y el motivo; el gasto vuelve a **Pendiente de pago**.
5. Pagá todo lo que falta (sin cambiar el monto): tiene que quedar **Pagado**.
6. Con un pago vigente, **Eliminar gasto** no tiene que aparecer: primero se anulan los pagos.

## 4. Gastos de Fudo

1. En **Gastos**, elegí origen **De los locales (Fudo)** y local **YA! UNIDAD**. Tienen que verse los gastos de Fudo con la marca **Fudo** y "Sin clasificar".
2. Debajo de los filtros: "Gastos de los locales (Fudo) actualizados hace …". Tocá **Actualizar**: tiene que avisar "Fudo: todo al día" (o cuántos cambios trajo).
3. Abrí uno pendiente: arriba dice "Cargado en Fudo de YA! UNIDAD" con su descripción. Fecha, monto, local y proveedor tienen candado; no hay **Eliminar**.
4. Clasificalo (rubro y categoría) y guardá. Después dejalo otra vez sin clasificar.
5. Pagá una parte: el modal aclara que en Fudo sigue figurando impago. Anulá ese pago.
6. Los totales de La Unidad tienen que coincidir con Fudo: **90 pendientes por $ 13.353.535,98** (en Cta. Cte.) y **127 pagados por $ 1.289.599,78** (a la fecha de esta prueba; si en Fudo cargan más, cambia).

## 5. Pendientes de pago

1. Entrá a **Pendientes de pago**: una sola lista, local por local, lo más viejo arriba. Los de Fudo, con su marca; ya no hay pestañas de Fudo.
2. Arriba: el total pendiente y cuántos están vencidos.
3. Filtrá por local, fecha y texto; cambiá a **Más nuevos primero**.
4. En un local con más de 15, tocá **Ver más**.
5. Registrá un pago desde acá: el local tiene que actualizarse solo.

## 6. Gastos que se repiten

1. **Gastos › Que se repiten** (también desde el botón en el encabezado de Gastos). **Nuevo**: un alquiler con el **día de hoy**. Guardá.
2. En **Gastos** tiene que aparecer ya, como pendiente, con el nombre que le pusiste.
3. Cargá una luz con **El monto cambia todos los meses**: en Gastos dice "monto a confirmar". Abrila y tocá **Confirmar monto**.
4. Eliminá el gasto de este mes del alquiler: queda **Anulado** (no borrado) y no vuelve a aparecer.
5. Volvé a la plantilla: **Pausar**. En la lista dice "Pausado". No ofrece **Eliminar** porque ya generó un gasto.
6. Una plantilla nueva que todavía no generó nada sí se puede eliminar.

## 7. Facturas de Compras (lo que toca Gastos)

1. En **Compras › Facturas**, confirmá una factura: la lista de locales del gasto tiene que ser la de la base (los 9).
2. El gasto que nace aparece en **Gastos** con el chip de la factura; monto y proveedor con candado; no se elimina desde Gastos.

## 8. Manual

1. Desde el **?** de Gastos, abrí la ayuda: la sección **Gastos** tiene que explicar Fudo, pagos parciales, vencimientos, adjuntos y los que se repiten.
