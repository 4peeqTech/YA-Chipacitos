-- F1 del Bloque 1: el mensaje de WhatsApp lleva el número del pedido (decisión N1).
-- Suma {{numero}} al encabezado de las plantillas que siguen con el formato del
-- seed (20260825150000). Las que alguien ya reescribió a mano no se tocan: la
-- variable queda disponible en el editor de plantillas.
update public.compras_plantillas_mensaje
set cuerpo = replace(cuerpo, '*PEDIDO {{proveedor}}*', '*PEDIDO {{numero}} · {{proveedor}}*')
where cuerpo like '%*PEDIDO {{proveedor}}*%'
  and cuerpo not like '%{{numero}}%';
