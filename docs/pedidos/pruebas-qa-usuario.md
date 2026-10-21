# Pedidos de locales y mayorista: qué probar en QA

En **qa.yachipacitos.com.ar**, con las cuentas de prueba (`docs/qa-credenciales-dev.md`). Son datos de prueba: podés tocar todo.

**Lo más cómodo:** dos ventanas lado a lado, una con `qa-local` y otra con `qa-mayorista` (una normal y otra en modo incógnito). Probá el local también desde el celular.

## 1. El local pide (`qa-local`, mejor en el celular)

1. Entrá a **Pedir**. Tiene que haber **solo productos del mayorista**: nada de depósito.
2. Cargá un producto con **+**, otro escribiendo **1,5** y otro con el buscador `código*2` + Enter.
3. Cerrá la página y volvé a entrar: **el carrito tiene que seguir ahí**.
4. Tocá la barra de abajo: revisá **Tu pedido** y escribí una observación.
5. **Enviar pedido**: aparece el resumen. Confirmá. Tiene que salir el número del pedido y el enlace **Ver en Mis pedidos**.
6. Volvé a **Pedir** y tocá **Repetir mi último pedido**: carga lo mismo.

## 2. El mayorista lo recibe (`qa-mayorista`)

1. **Sin recargar**, el pedido aparece en **Nuevos**, marcado como nuevo, con sonido y el título de la pestaña parpadeando.
2. Si activaste los avisos, **te llega la notificación al celular o a la compu**.
3. Abrilo: ves los productos y la observación del local. Escribí un mensaje.
4. **Empezar preparación**: en la ventana del local, el pedido cambia a "En preparación" **sin recargar**.
5. **Editar pedido**: bajá una cantidad, sacá un producto (0) y agregá otro. **Guardar**.
   - En el local tiene que aparecer **"Fábrica cambió el pedido"**.
   - En el detalle del local se ve lo pedido y lo que se manda.
6. **Hoja de preparación**: muestra el total por producto. Probá **Imprimir**.
7. **Marcar como enviado**: muestra lo que sale y pide confirmar. La tarjeta pasa a **En camino** y ya no se puede editar.

## 3. El local recibe (`qa-local`)

1. En el menú, **Pedidos** muestra un número (en camino sin confirmar).
2. Abrí el pedido y tocá **Llegó todo bien**: queda **Recibido**.
3. Hacé otro pedido completo (pasos 1 y 2) y, al recibirlo, elegí la opción de **diferencias**: corregí una cantidad, poné un $ y una nota, y agregá un producto que "llegó sin pedirse". **Guardar recepción**.
4. En el mayorista, en **Historial**, ese pedido figura **con diferencias** y se ve la nota.

## 4. Cancelar

1. El local hace un pedido y lo cancela desde **Pedidos** con un motivo: al mayorista le llega el aviso y la tarjeta desaparece del tablero.
2. Otro pedido: lo cancela el mayorista con motivo. El local ve el motivo.
3. Con un pedido **En camino**, el local **no** tiene el botón para cancelar.

## 5. Corte de versión (pedido de Marcos)

- En el historial del local, en el del mayorista y en **Conciliación** (admin) aparece el aviso **"Los pedidos anteriores al…"**.
- Los pedidos viejos llevan la marca **Versión anterior**, y los que se cerraron solos, **Cerrado automáticamente**.

## 6. Que no se haya roto nada

- `qa-deposito`: su pantalla funciona como antes. Al local ya no le aparece depósito.
- `qa-fabrica` (supervisor): Registro, Stock, etc., igual que antes.
- `qa-admin`, en **Catálogo**: intentá borrar un producto que ya tiene pedidos. Tiene que avisar que no se puede y que lo desactives.
- **Ayuda**: las secciones **Locales** y **Pedidos a fábrica** describen las pantallas nuevas.

Si algo no anda como dice acá, anotá el paso y la cuenta y lo corrijo.
