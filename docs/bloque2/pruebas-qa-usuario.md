# Pruebas en QA antes de mostrarle a Marcos

Todo esto está en **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev). **Nada está en producción.**

## Antes de empezar

- **Cuentas:** las `qa-*@chipacitos.test`, con la contraseña de `docs/qa-credenciales-dev.md`.
  - La mayoría de las pruebas usan `qa-admin`.
  - Para los permisos se usan `qa-squad` (Compras sin admin), `qa-coordinador` y `qa-fabrica`.
- **Orden:** seguí las secciones en orden. Recorren el circuito de punta a punta: conteo → solicitud → pedido → remito → factura → diferencias → devolución → avisos.
- **Datos de prueba que ya están en dev:**
  - P-0016 y P-0027: facturas.
  - P-0019: una diferencia.
  - P-0036 y P-0037: historial y unidades.
  - P-0079 y P-0080: devoluciones y notas de crédito.
  - P-0103 y P-0104: avisos.
  - Queso Barra configurado por kg a $ 1.250.
  - Los conteos Global y Bolsaplast del 05/10, con diferencias pendientes.
- **Si algo falla:** anotá la sección y el número de paso, y pasámelo. Lo corrijo en una tanda antes de que lo vea Marcos.
- **Qué se le muestra a Marcos:**
  - Las secciones 0 a 10, después de que las pruebes vos.
  - La 11 (Gastos) es solo para vos: Gastos sigue "a definir" con él.

---

## 0. Del Bloque 1 (sin probar todavía): facturas y diferencias

### 0a. Facturas (F4)

Con `qa-admin`. Para el punto 11, `qa-squad`.

1. **Factura de un pedido que ya recibió mercadería** — Facturas › "Cargar factura" → P-0014 o P-0027. Las líneas vienen con lo que llegó por remitos. Número + precios → Confirmar. *Esperado:* no pregunta nada, el pedido pasa a Facturado y el stock **no** se mueve.
2. **FA1 — factura sin remito, con la mercadería** — elegir un pedido sin remitos → Confirmar → **"¿Ya llegó la mercadería?" → Sí**. *Esperado:* el confirm muestra el impacto ("había 30 → queda 46"), se crea `R-xxxx-NN` que en el pedido dice "desde la factura", y el pedido queda Recibido + Facturado.
3. **FA2 — la factura llega antes** — igual, pero **No, llega después**. *Esperado:* sin remito, stock igual, pedido "Facturado · falta recibir" y el "Qué sigue" pide Cargar remito.
4. **FA3 — número repetido** — mismo proveedor, mismo número escrito distinto (`0003 / 00012345` vs `0003-00012345`). *Esperado:* aviso ámbar **mientras se tipea**, con el pedido de la otra factura. No deja guardar.
5. **FA5 + FA7 — dos alícuotas y un cargo** — una línea al 21 % y un "Flete" al 10,5 % con "Agregar una línea". *Esperado:* el pie desglosa el IVA por alícuota; el flete dice "No mueve stock" y no entra al remito.
6. **FA6 — total del papel** — cargar un total que difiera en más de $1. *Esperado:* aviso ámbar con la diferencia, pero deja confirmar igual.
7. **FA4 — precios de referencia** — tildar "Actualizar los precios de referencia…" y confirmar; después cargar otra factura del mismo proveedor. *Esperado:* el precio viene prellenado y, si se cambia, la línea muestra "↑ N % vs. el último precio".
8. **FA11 — borrador** — guardar a medias (se lista como Borrador con total $0 y el pedido sale del banner), reabrir, completar y confirmar. Probar también "Descartar borrador".
9. **FA8 — anular** — abrir una confirmada → "Anular factura" → **tiene que exigir motivo**. *Esperado:* si generó remito, se borra y el stock vuelve; el pedido queda sin facturar; la factura queda **tachada** en la pestaña Anuladas, con el motivo adentro.
10. **R2 — no se borra un remito de un pedido facturado** — Remitos › abrir el remito → Eliminar. *Esperado:* "El pedido P-00xx está facturado. Anulá la factura primero" y el remito sigue ahí.
11. **C6 — permisos** — con `qa-squad`, pegar la URL `…/admin/compras/pedidos/facturas`. *Esperado:* rebota a su primer módulo con el toast "No tenés acceso a Facturas…"; no ve la pestaña, ni el ítem del menú, ni la columna Factura.
12. **IVA del insumo** — Compras › Insumos → editar el campo IVA, guardar y reabrir. *Esperado:* queda guardado y esa alícuota viene por defecto en la línea de la factura.
13. **Celular (375px) y tema claro** — repetir el punto 1: el formulario ocupa toda la pantalla y los botones quedan pegados abajo.
14. **Variantes** — en una factura, editá la descripción de una línea (por ejemplo, otra marca del mismo insumo). No tiene que renombrar el insumo del catálogo.


### 0b. Diferencias entre la factura y lo recibido, y gasto automático (F5)

1. **Diferencia para resolver.**
   - Abrí la factura de **P-0016** (Huevo Campo). En "Diferencias con lo recibido" aparece Huevos +2.
   - Probá cada opción y revertila:
     - **Ajustar stock:** el stock cambia y queda en la ficha de Stock como "Ajuste por factura".
     - **Reclamo al proveedor:** queda anotado.
     - **Ignorar.**
   - **Revertir** deja todo como estaba.
2. **Pendiente de llegar.** En un pedido con la recepción incompleta, las diferencias aparecen como "Pendiente de llegar", en neutro y sin acciones.
3. **Gasto automático.** Al confirmar una factura se elige el local y se crea el gasto "Pendiente de pago". Desde la factura se llega al gasto, y desde el gasto, a la factura.
4. **"¿Es este gasto?"** Si ya había un gasto parecido cargado a mano, el confirm ofrece **Vincular** o **Crear nuevo**. Por ejemplo, P-0015 contra el gasto de $ 114.950 del 27-09.
5. **Anular una factura con gasto.**
   - Si el gasto está pendiente, se desvincula.
   - Si ya está pagado, no deja anular y dice "registrá una nota de crédito". La nota de crédito se prueba en la sección 9.

---

## 1. B0 — Navegación entre pantallas

En `https://qa.yachipacitos.com.ar`, con `qa-admin@chipacitos.test` (contraseña en `docs/qa-credenciales-dev.md`), cuando la rama esté en `qa`:

1. **Compras › Remitos.** Tocá el código P-xxxx de una fila. Tiene que abrir el pedido en Pedidos, no el remito.
2. **En ese pedido:**
   - Tocá "Complementario" (o "Pedido base") arriba. Tiene que abrir la solicitud que lo generó.
   - Más abajo dice "Pedidos que generó". Tocá el P-xxxx y tenés que volver al pedido.
3. **En el pedido:**
   - Tocá el nombre de un insumo de la tabla de ítems. Tiene que abrir su ficha en Stock.
   - En el Historial, tocá el código R-xxxx-xx de "Llegó un remito". Tiene que abrir ese remito.
4. **Compras › Facturas.**
   - Abrí una factura confirmada que tenga gasto (por ejemplo, la de P-0016).
   - Tocá "Gasto pendiente de pago…". Tiene que abrir **ese** gasto en Gastos, no la lista de pendientes.
   - En el gasto, tocá el N° de factura. Tenés que volver a la factura.
   - En el gasto, tocá el P-xxxx. Tiene que abrir el pedido.
5. **Gastos.** Elegí un período con gastos de facturas (septiembre) y tocá el chip "Factura N°" de una fila. Tiene que abrir la factura, no el gasto.
6. **Proveedores.**
   - Abrí la ficha de un proveedor de insumos. Los insumos y los últimos pedidos son links.
   - Copiá la URL con `?proveedor=`, cerrá la ficha y pegala en otra pestaña. Se tiene que abrir la misma ficha.
7. **Compras › Insumos.** Tocá el nombre de un insumo. Tiene que abrir su ficha en Stock.
8. **Compras › Stock › Histórico.** Entrá a `/admin/compras/stock/historico?insumo=<id>` (el id de la URL del paso 7). Tiene que entrar con ese insumo elegido.
9. **Reportes.** En "Historial de pedidos y remitos", tocá el P-xxxx de una fila. Tiene que ir al pedido, sin expandir la fila. La fila expandida tiene el remito como link. En "Movimiento de stock", el nombre del insumo lleva a Stock.
10. **Cierre y recarga.** Desde cualquiera de estos saltos, cerrá el modal y recargá la página (F5). El modal **no** tiene que volver a abrirse y la URL ya no tiene `?pedido=`, `?remito=`, etc.
11. **Push de Fábrica.** Cuando Fábrica cierre un conteo y llegue el aviso "Nueva solicitud de Fábrica", tocalo. Tiene que abrir esa solicitud, no la lista.
12. **Sin permiso.** Entrá con un usuario que no tenga el módulo Stock (por ejemplo, uno de rol personalizado sin "Stock") y abrí un pedido. Los insumos de los ítems se ven como texto, no como link. Lo mismo en Insumos. Con admin vuelven a ser links.

---

## 2. A1 — El conteo controla el stock (no lo pisa)

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

**Agregados de la vuelta de revisión:**

Va cuando el coordinador mergee a `qa`, en **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev). Vale la lista de [`plan-A1.md` §11](plan-A1.md#11-lista-de-pruebas-para-el-usuario) (pasos 1–17), con estas precisiones:
- **Paso 4:** con `qa-fabrica`, el detalle del historial sigue sin mostrar líneas (es un problema de RLS anterior a A1). El "Sin contar" se ve entrando con una cuenta que tenga Compras.
- **Paso 13:** el chip "Solicitud de compra" abre el modal de la solicitud (B0 ya entró). Dentro del modal, "Ver el conteo" vuelve al conteo.
- **Paso nuevo (vuelta 1):** en el conteo de Bolsaplast del 05/10, la fila de Bolsa Consorcio 60x90 dice "Se movió +2 mientras se contaba", y los confirms de Aplicar y "Aplicar todas" lo mencionan.
- **Paso nuevo (vuelta 1):** con `qa-fabrica`, cargar un número y tocar enseguida "Cerrar control". → El botón dice "Guardando lo contado…" hasta que termina el guardado, y lo cargado entra al cierre.
- **Paso 3:** como Global ya está cerrado hoy en dev, usá Bolsaplast o Huevos para cerrar un conteo nuevo, o revisá el Global 05/10 que ya tiene 4 diferencias pendientes.

---

## 3. B1 — Historial real de pedidos

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev) **después de mergear B1 a `qa`**, con `qa-admin`.
**Hasta ese merge, en QA no se puede guardar el mensaje ni el local:** la base ya tiene la RLS de solo lectura y el `guardarMensaje` viejo hace un `update` directo.

**Circuito 1 — Editar queda registrado**
1. Compras › Pedidos › Crear pedido, un proveedor y 2 ítems. Guardar. → En el detalle, Historial: "Pedido creado · con 2 ítems", con tu nombre y la hora.
2. Más acciones › Editar ítems: cambiar la cantidad de uno, agregar otro y quitar el tercero. Guardar. → "Editó ítems" con tres líneas (por ejemplo, "Queso 40 → 45 kg", "agregó Sal 2 Bolsa", "quitó Huevos 90 unidades"). El nombre del insumo es un link a su stock.
3. Volver a editar la misma cantidad enseguida (45 → 50). → Sigue habiendo **una sola** entrada, que ahora dice "40 → 50".
4. Abrir el editor y guardar sin tocar nada. → Toast "Sin cambios" y el historial no suma nada.

**Circuito 2 — Envío y reenvío**
5. Enviar: elegir "Facturar a", generar el mensaje, copiarlo y "Marcar como enviado". → "Editó el pedido" con "Asignó el local de facturación" y "Generó el mensaje", y después "Enviado al proveedor". "Ver el mensaje" muestra lo que se mandó.
6. Más acciones › Reenviar mensaje → copiar → "Marcar como reenviado". → Toast "P-xxxx reenviado" y en el historial "Reenviado al proveedor". "Cerrar sin reenviar" sale sin registrar nada.
7. Reenviar de nuevo tocando el botón dos veces rápido. → Aparece un solo reenvío.

**Circuito 3 — Cerrar y reabrir, todas las veces**
8. Cerrar a mano con un motivo, reabrir, cerrar con otro motivo y reabrir. → Cuatro entradas, cada una con su motivo; la última reapertura dice a qué estado volvió.

**Circuito 4 — Solicitud → pedido**
9. Antes, cargarle un local de facturación a un proveedor que tenga ítems en una solicitud abierta. Después, en Solicitudes, convertir esa solicitud. → El pedido nuevo ya tiene ese local en "Facturar a" y su historial dice "Creado desde una solicitud" con un link que lleva a la solicitud.

**Circuito 5 — Facturado**
10. En un pedido facturado: no aparece "Reenviar mensaje" y no se puede cambiar el local de facturación.

**Circuito 6 — Lo viejo y los permisos**
11. Abrir un pedido viejo (de antes de esta versión). → Ve "Pedido creado", "Enviado" y, si tuvo, "Cerrado a mano"/"Reabierto", en orden.
12. Con una cuenta sin rol admin y con Compras (`qa-squad`): el historial no muestra la factura ni las diferencias.
13. En el celular (375px): el historial se lee sin cortar, y "Ver el mensaje" y "Ver N cambios más" se tocan bien.

---

## 4. A2a — Insumos: arreglos de base

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, una vez mergeado a `qa`:

1. **Compras › Insumos.** → La tabla tiene Stock, Pedido abierto, Precio ref. y Última factura. Ya no está la columna Precio.
2. **Nuevo insumo.** → El selector de proveedor lista todos los proveedores activos, no solo algunos. Crear uno de prueba con dos proveedores y la estrella en uno.
3. **Tocar la fila del insumo** (no hay lápiz). → Se abre el form. Abajo, en "Cambios", figura que lo creaste.
4. **Cambiar solo el stock mínimo y guardar.** → Toast "Cambios guardados", y en "Cambios" aparece "Stock mínimo: 0 → N".
5. **Abrir un insumo que tenga facturas** (por ejemplo, Queso Barra), cambiar algo que no sea el precio y guardar. → El Precio ref. sigue siendo el de la última factura.
6. **En la fila de ese insumo.** → "Última factura" muestra el precio con su unidad y la fecha. La fecha lleva a la factura.
7. **Tocar el stock de un insumo.** → Abre su ficha en Stock. Si está por debajo del mínimo, dice "bajo mín." en ámbar.
8. **Un insumo con un pedido enviado y sin recibir.** → "Pedido abierto" muestra P-xxxx y cuánto falta. El código abre el pedido.
9. **En el form, quitar (tachito) un proveedor que ya tuvo pedidos y guardar.** Hay que agregar otro antes, porque el insumo necesita al menos uno. → Pasa a "Proveedores anteriores". "Volver a usar" lo trae de nuevo.
10. **Archivar el insumo de prueba.** → El aviso dice qué deja de pasar. La fila queda gris y sale de "Activos".
11. **Archivar un insumo que esté en la lista Global.** → El aviso dice que no se va a contar.
    - Con `qa-fabrica`, en Fábrica › Stock, abrir Global: ese insumo ya no está.
    - En Insumos › Listas de conteo sigue, con "Archivado · no se cuenta".
    - Reactivarlo → vuelve a aparecer en Fábrica.
12. **Eliminar.** → Solo el insumo de prueba (sin historia) tiene el botón Eliminar. Los que tienen movimientos, pedidos o facturas solo se pueden archivar.
13. **Proveedores › editar un proveedor.** → El checkbox se llama "Sugerir cantidades al pedir".
14. **Con `qa-coordinador@chipacitos.test`.** → En Insumos no aparece "Última factura" (las facturas son solo de admin). Lo demás, igual.
15. **Celular (375px) y tema claro.** → La tabla se lee, el form entra en pantalla y los botones se tocan sin zoom.

---

## 5. A2b — Unidades de medida (cajas y kg)

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin@chipacitos.test`, **una vez mergeado a `qa`**:

1. **Compras › Insumos.** Recorrer la lista de revisión de arriba. Cargarle la unidad de compra a los que no tienen y confirmar que la unidad base (kg / unidades) de cada uno sea la correcta.
2. **Abrir Queso Barra.** → El bloque "Unidades" dice "1 Caja = 16,5 kg" y cuánto stock hay en cajas y en kg. Ya viene cobrando por kg. Probar en otro insumo con contenido (Margarina, Caja de 10 kg): cambiar "Por defecto se cobra por" a kg y, en la fila del proveedor, "Cobra por" a kg → el precio de referencia se convierte a $/kg con la nota "Convertido de…". Guardar: en "Cambios" figuran los cambios. Si no corresponde, volverlo a "Caja".
3. **Insumos (lista).** → Queso Barra muestra el stock con "≈ … kg" y el precio de referencia "/kg". Un insumo sin conversión (Bolsa Consorcio) muestra "/Unid." y no tiene "≈".
4. **Pedidos › Crear pedido a GLOBAL con 2 de Queso Barra.** → La unidad "Caja" no se puede editar y debajo de la cantidad dice "≈ 33 kg". Generar el mensaje → dice "2 CAJAS (~33 KG) QUESO BARRA". Enviarlo.
5. **Remitos › Cargar el remito de ese pedido.** → Solo Queso Barra tiene "kg reales". Poner 29: avisa que pesó 12 % menos. Corregir a 33,4 y guardar → el stock sube 2 cajas (no 33).
6. **Editar el remito y cambiar solo los kg a 32,9.** → "Con estos cambios el stock no se mueve". En el detalle del pedido, el historial dice "Editó el remito · Queso Barra 2 Caja · 33,4 → 32,9 kg".
7. **Facturas › Cargar la factura de ese pedido.** → La línea de Queso Barra viene "por kg" con 32,9 kg. Cambiar a 33,4 → avisa "0,5 kg más que el remito". Con un precio de 1.250, el subtotal es 33,4 × 1.250 = $ 41.750.
8. **Marcar "Actualizar los precios de referencia" y confirmar.** → En Insumos › Queso Barra › Cambios: "Precio ref. … (por factura)". Si cambiaste "Cobra por" en la línea, el modal avisa "pasa a cobrarse por…".
9. **Diferencias.** Si la factura dice 2 cajas y llegaron 2: no hay diferencia, aunque los kg no coincidan exacto. En otro pedido con un remito de 1 caja y una factura de 2: la diferencia es de 1 Caja y muestra los kg de cada lado (ya hay una en A2B-QA-0002, de P-0019).
10. **Compartir la factura** (imagen y mensaje). → La línea dice "2 CAJA (33,4 KG)", la imagen muestra "33,4 kg" debajo de la cantidad y "/kg" debajo del precio, y el IVA da bien.
11. **Anular una factura confirmada con "ya llegó la mercadería"** (sin remitos antes). → El stock vuelve y el historial del pedido dice "Eliminó el remito · Motivo: Se anuló la factura …" con lo que se descontó.
12. **Una factura vieja** (P-0027). → Se ve igual que antes, con los mismos totales.
13. **Un insumo que no se pesa** (Bolsa Consorcio). → En pedido, remito y factura no aparece nada nuevo.
14. **Celular (375 px) y tema claro.** → El remito y la factura se leen sin scroll horizontal y los campos de kg se tocan bien.

---

## 6. B2 — Compartir factura

En **https://qa.yachipacitos.com.ar** (rama `qa` + Supabase dev), con `qa-admin`, cuando el coordinador mergee a `qa`.

**Circuito 1 — La imagen**
1. Compras › Facturas → abrí la factura de P-0016 (0001-00000777, HUEVO CAMPO). Abajo aparece **Compartir**. → Se abre un modal con las pestañas Imagen y Mensaje.
2. En Imagen ves el comprobante. → Arriba a la derecha está el sello rojo "NO VÁLIDO COMO FACTURA" y abajo el texto que aclara que no la emitió ARCA. El número, el proveedor, la línea, el IVA ($ 3.360,00) y el total ($ 19.360,00) coinciden con la factura.
3. **Descargar.** → Baja `Factura-0001-00000777-HUEVO-CAMPO.png`. Abrilo: se lee entero, sin cortes.
4. **Copiar imagen** y pegala en un chat de WhatsApp Web. → Se pega la imagen.
5. Desde el celular, en la misma factura, tocá **Compartir**. → Se abre el menú del teléfono. Elegí WhatsApp y un contacto: llega la imagen.
6. Abrí la de P-0027. → Tiene "FACTURADO A" con la razón social y el CUIT del local.

**Circuito 2 — El mensaje para la administración**
7. Pestaña Mensaje. → Tiene el N° de factura del proveedor, el proveedor, la fecha, el vencimiento, el pedido, el detalle, el IVA y el total.
8. Cambiá una palabra del texto. → Aparece "Volver al texto de la plantilla"; tocalo y el texto vuelve.
9. **Enviar por WhatsApp.** → WhatsApp se abre con el texto y te deja elegir el contacto.
10. Proveedores › Plantillas › **Factura**: cargá el WhatsApp de la administración y guardá. Volvé a la factura. → El botón dice **"Enviar a la administración"** y abre directo ese chat; "Elegir otro contacto" sigue abriendo sin número. Al terminar, borrá el número.

**Circuito 3 — Plantillas**
11. Proveedores › Plantillas: arriba se elige **Pedido** o **Factura**. En Factura está "Factura estándar". Creá otra con las variables de factura. → La vista previa la muestra con datos de ejemplo.
12. Marcala como predeterminada (estrella). → En Pedido, "Pedido estándar" sigue siendo la predeterminada. En el modal de la factura aparece ahora un selector de plantilla.
13. En Pedidos, al generar el mensaje de un pedido, la lista de plantillas **no** muestra las de factura.
14. Borrá la plantilla de prueba (o volvé la estrella a "Factura estándar").

**Circuito 4 — Lo que no se comparte**
15. Una factura anulada (por ejemplo, `B2-QA-0001` en P-0036) o un borrador **no** tiene el botón Compartir.
16. En un pedido, el envío al proveedor (Copiar / WhatsApp / Marcar como enviado) funciona igual que antes.
17. Con la factura y el modal de compartir abiertos, **Escape** cierra solo el modal de compartir.

---

## 7. B3 — Proveedor y reportes conectados

En **https://qa.yachipacitos.com.ar** con `qa-admin@chipacitos.test`, una vez mergeado a `qa`:

1. **Proveedores.**
   - La lista tiene las columnas Insumos y Pedidos abiertos.
   - Tocar la fila abre la ficha (no hay lápiz).
2. **Abrir GLOBAL.** Arriba, "Factura a: Paraguay 388" y las pestañas.
   - **Pedidos:** el estado coincide con Compras › Pedidos. Están "Abiertos" y "Todos". El P-xxxx abre el pedido.
   - **Remitos y facturas:** cada código abre su remito o su factura. Las anuladas aparecen tachadas.
   - **Cuenta:** Facturado, Pagado y Pendiente del período, y el pendiente de todas las fechas. En "Todo" aparece "Sin gasto". Pagado + Pendiente + Sin gasto = Facturado. El estado de pago lleva al gasto.
   - **Insumos:** precio de referencia y último precio con su unidad (Queso Barra en /kg). La fecha abre la factura.
3. **Nuevo proveedor "Prueba B3".** Se abre su ficha. Crear otro "prueba b3" avisa que ya existe.
4. **Editar "Prueba B3" sin tocar nada.** Aparece el toast "No había cambios".
5. **Archivar GLOBAL.** No deja: muestra sus pedidos abiertos con links.
6. **Archivar "Prueba B3".**
   - Explica qué deja de pasar y queda en "Archivados".
   - En Compras › Pedidos › Crear pedido, ya no aparece.
   - Reactivarlo lo vuelve a la lista.
7. **Eliminar "Prueba B3".** Se borra. En GLOBAL no está el botón Eliminar.
8. **Archivar un proveedor que sea principal de algún insumo y no tenga pedidos abiertos** (por ejemplo, FABIMP).
   - El aviso nombra esos insumos.
   - En Solicitudes, convertir una solicitud con una línea para él avisa que está archivado y no crea nada.
   - Reactivarlo al terminar.
9. **Compras › Reportes.**
   - KPI "Pedidos del período": "N por recibir · M por facturar".
   - **Historial:** el gráfico tiene los 7 estados; la tabla, el badge nuevo y "Último remito"; el proveedor abre su ficha.
   - **Gasto por proveedor:** Pagado + Pendiente (+ Sin gasto) = Total. El nombre abre la Cuenta del proveedor.
   - El aviso amarillo "N pedidos ya recibieron mercadería…" abre Pedidos en **Por facturar** con esos N.
   - **Sugerido vs. recibido:** columnas Sugerido, Pedido y Recibido, y "en camino" en lo que todavía no llegó.
   - Elegir "Mes anterior": la URL cambia (`?desde=…&hasta=…`) y los números son los de ese mes.
10. **Pedidos con el link del aviso.** Cambiar a "Activos" y recargar con F5: queda en Activos.
11. **Con `qa-squad`.** Proveedores no abre (lo manda a Gastos).
12. **Celular (375 px) y tema claro.** La ficha y sus pestañas se leen sin scroll horizontal y los botones se tocan sin zoom.

---

## 8. A2c — Ficha de insumo conectada y reporte Por insumo

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

---

## 9. B4 — Devoluciones al proveedor y nota de crédito

En **https://qa.yachipacitos.com.ar**, una vez mergeado B4 a `qa`. Entrás con `qa-admin@chipacitos.test`, salvo donde se indica otra cuenta.

1. **Proveedores › Motivos de devolución.**
   - Hay 6: 4 "Sale del stock", "Facturado y no entregado" y "Precio mal facturado".
   - Creá uno, cambiale "Qué pasa" y desactivalo.
   - Intentá borrar "Mercadería en mal estado": ya se usó, así que tiene que decir "desactivalo".
2. **Mercadería mal, el proveedor repone.** Ya está en **P-0079**, o podés hacer uno nuevo.
   - Pedido a GLOBAL con 2 Queso Barra y 3 Fécula, enviado, con remito de 33 kg.
   - Registrar devolución › Mercadería en mal estado › 1 Caja, 16,4 kg › "Sí, repone".
   - El confirm dice cuánto resta del stock y que el pedido vuelve a "Parcialmente recibido".
   - Aparecen la sección Devoluciones y el historial.
   - Cargá un remito de 1 Caja: el pedido pasa a Recibido.
3. **Con factura y nota de crédito.**
   - En la factura de un pedido: Registrar devolución › Mal estado › 1 Caja, 16,4 kg › No repone › "Ya llegó la nota de crédito".
   - El total da 16,4 × $/kg + IVA, y el pie dice "El gasto pendiente baja de $ X a $ Y".
   - Revisá Gastos › Pendientes.
   - La NC aparece en Facturas con "−" y el chip; abrila.
   - Ya hecho en **P-0080**: NC 0001-B4QA0202.
4. **La NC llega después.**
   - Hacé otra devolución sin NC: "Qué sigue" dice "Falta la nota de crédito" y la diferencia dice "Esperando la nota de crédito de D-…".
   - Cargá la NC: la diferencia desaparece y el gasto baja.
5. **Desde una diferencia.** P-0019 tiene una.
   - Resolver › Reclamo al proveedor.
   - En la fila aparece "Registrar devolución", que viene prellenado: "Facturado y no entregado", 1 Caja, con NC.
   - Registrá: la diferencia se cierra.
6. **Precio mal facturado.** En P-0080 ya hay una corrección (D-0080-03).
   - Probá registrar otra sobre la misma línea: ya no se ofrece.
   - En otra factura con Queso Barra por kg: precio correcto $ 50 menos. La NC dice "Diferencia de precio · Queso Barra…" y el stock no se mueve.
7. **Anular.**
   - Anulá una devolución con NC: el modal dice cuánto vuelve al stock y a cuánto vuelve el gasto. Después todo queda como antes, y el historial dice "Anuló una devolución".
   - Anulá solo una NC: la devolución queda "Falta la nota de crédito".
8. **Gasto ya pagado.** Pagá en Gastos el gasto de una factura y después cargale una NC.
   - Aparece el aviso "quedan a favor".
   - En Proveedores › GLOBAL › Cuenta aparece la tarjeta "A favor".
   - En Reportes › Gasto por proveedor aparece la columna "A favor".
9. **Devuelto.** En un pedido recibido completo y sin facturar, devolvé todo sin reposición: badge "Devuelto" y pestaña Devueltos.
10. **Lo que no se puede** (cada caso dice qué hacer):
    - devolver más de lo que llegó;
    - bajar el remito por debajo de lo devuelto;
    - anular una factura con NC: P-0080 avisa antes;
    - "Repone" en un pedido cerrado a mano;
    - una NC más grande que lo que queda de la factura.
11. **Con `qa-squad`:**
    - ve las devoluciones sin montos;
    - registra "Mercadería en mal estado" sin NC;
    - no ve "Corrige la factura" ni "Cargar nota de crédito".
12. **La plata cuadra.** En Reportes › Gasto por proveedor y en Proveedores › Cuenta: Pagado + Pendiente + Sin gasto + A favor = Facturado.
13. **Celular (375 px) y tema claro:**
    - el modal de devolución ocupa la pantalla y el botón queda abajo, siempre visible;
    - no hay scroll horizontal;
    - los kg se tocan bien.

**Manual `/ayuda`:** cambian las secciones Pedidos (Devoluciones y "Qué sigue"), Facturas (notas de crédito), Proveedores (Motivos y "A favor" en Cuenta) y Reportes. Se arma en la entrega final.

---

## 10. B5 — Avisos y tablero de compras

En **https://qa.yachipacitos.com.ar**, una vez mergeado B5 a `qa`, con `qa-admin@chipacitos.test` salvo donde se indica.

> En QA el aviso automático diario **no corre** (Vercel solo corre los crons en producción). Para ver los avisos de demorados, diferencias, nota de crédito y stock, usá **Compras › Avisos › Revisar ahora**. "Listo para facturar" sí llega solo.

1. **Compras › Avisos** (menú Compras).
   - Ves 5 avisos, cada uno con su interruptor, los días donde corresponde y quién lo recibe.
   - Cambiá "Pedido demorado" a 5 días y tocá **Guardar**: aparece "Avisos guardados". Tocá Guardar sin cambiar nada: "No había cambios".
   - Poné 0 o 100 días: el campo marca "Entre 1 y 60" y no guarda.
2. **Revisar ahora.**
   - Esperado: un toast "Se avisaron …" y, en la campanita, avisos **agrupados** (por ejemplo "🚚 N pedidos demorados"). Tocá uno agrupado: abre Pedidos con un chip arriba ("Demorados · N") y la misma cantidad de filas. La ✕ del chip lo saca.
   - Tocá Revisar ahora otra vez: "No había nada nuevo para avisar".
3. **Listo para facturar.**
   - Con `qa-squad`, cargá el remito que completa un pedido enviado.
   - Con `qa-admin`, en la campanita aparece "📦 Listo para facturar · P-…". Tocalo: abre ese pedido.
   - Un remito parcial no avisa. Si lo cargás vos como admin, no te avisás a vos mismo.
4. **Demorado.** Volvé "Pedido demorado" a 3 días. En el Dashboard, "Demorados" y la lista que abre muestran el mismo número; en Pedidos esos pedidos tienen el relojito, y en la ficha del proveedor (pestaña Pedidos) el "enviado hace N días" en ámbar. Con un número de días más grande que la antigüedad de alguno, ese deja de contar en las tres pantallas.
5. **Diferencias y nota de crédito.** Poné los días de esos dos avisos en 1 y tocá Revisar ahora. Si hay pedidos con diferencias o devoluciones esperando NC desde hace más de 1 día, llegan "⚖️ Diferencias sin resolver" y "🧾 Falta la nota de crédito". El de la NC abre el pedido con la devolución resaltada. Volvelos a 3 y 7.
6. **Stock bajo el mínimo.** En Insumos, subile el mínimo a uno que no esté en ningún pedido abierto y tocá Revisar ahora: llega "📉 Stock bajo el mínimo", que abre su ficha en Stock. Volvé el mínimo a como estaba.
7. **Apagar.** Apagá "Stock bajo el mínimo", guardá, subí el mínimo de otro insumo y tocá Revisar ahora: no avisa. Prendelo de nuevo y volvé el mínimo.
8. **Dashboard.**
   - Arriba siguen las métricas de siempre; abajo, "Compras" con Por recibir, Demorados, Recibidos sin facturar (≈ $, a precio de referencia y sin IVA), Diferencias, Deuda con proveedores, NC pendientes y Bajo el mínimo.
   - Tocá cada una: la lista que abre tiene el mismo número (Bajo el mínimo abre Stock con "Bajo el mínimo" prendido; Deuda abre Gastos › Pendientes de pago).
   - Deuda (+ "A favor" si aparece) tiene que cuadrar con Reportes › Gasto por proveedor en "Todo" (Pendiente + A favor).
9. **Con `qa-squad`.** No ve Compras › Avisos en el menú (y la URL lo rebota). Si tiene el Dashboard, ve solo Por recibir, Demorados, Recibidos sin facturar (cantidad, sin $) y Bajo el mínimo.
10. **Avisos recientes.** Abajo en Compras › Avisos, la lista de lo avisado con links que abren el pedido, la devolución o el insumo. "Última revisión" dice cuándo y si fue manual.
11. **Celular (375 px) y tema claro.** Dashboard con las tarjetas de Compras en 2 columnas, sin scroll horizontal. En Avisos, el botón Guardar queda visible abajo mientras bajás.

---

## 11. Gastos (solo para vos: sigue "a definir" con Marcos)

La sección se rehízo el 30-09 con el sistema de diseño. Probala para saber cómo está, pero **no se la muestres a Marcos hasta definir Gastos con él**.

1. **Gastos.**
   - Editá un gasto cargado a mano y eliminá otro; te pide confirmar.
   - Un gasto que vino de una factura no deja cambiar el monto ni el proveedor, y no se borra desde acá.
2. **Pendientes de pago.**
   - Pagá un gasto y después **deshacé el pago**: tiene que volver a pendiente.
   - El link del gasto abre ese gasto.
3. **Fudo / Caja.** Marcá como pagado un gasto de Fudo: queda registrado y no vuelve a aparecer como pendiente.
4. **Resumen por local.** Los totales coinciden con la lista de Gastos del mismo período.

---

## Qué NO se puede probar todavía

- **Receta y consumo por producción (A3 y A4):** esperan las respuestas de Marcos y Ricardo a `docs/analisis-receta-consumo.md`.
- **El aviso diario automático:** en QA no corre, porque Vercel solo corre los crons en producción. Se prueba con "Revisar ahora" (sección 10).
