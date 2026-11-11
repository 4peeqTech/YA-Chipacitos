-- ============================================================================
-- Plan de cuentas (2026-11-11): descripción de cada rubro y categoría.
--
-- El Excel de Nico trae "qué se incluye" en todas las cuentas imputables, pero
-- no en 36 rubros y categorías. Al clasificar un gasto la app muestra qué
-- significa el rubro y la categoría en que cae la cuenta, así que esas 36 se
-- completan acá a partir de las cuentas que contienen. Quedan marcadas con
-- incluye_propuesto para que Nico las revise; si las cambia, entran con otra
-- migración.
-- ============================================================================

alter table public.plan_cuentas add column if not exists incluye_propuesto boolean not null default false;

create temporary table _descripciones (codigo text primary key, incluye text not null) on commit drop;
insert into _descripciones values
  ('1.2.03', 'Plata que la empresa adelantó y le tienen que devolver o compensar: anticipos a proveedores, adelantos al personal y saldos con las otras razones sociales del grupo.'),
  ('1.3.01', 'Compras de cosas que duran más de un año y superan el monto mínimo de capitalización: máquinas, equipos de frío, obras, vehículos, muebles y equipos puestos en cadenas. No es gasto del mes.'),
  ('1.4.01', 'Movimientos que todavía no se sabe a qué cuenta van, o que tiene que definir el contador. Tienen que quedar en cero antes de cerrar el mes.'),
  ('2.1', 'Lo que la empresa les debe a los proveedores y a las tarjetas de crédito.'),
  ('2.1.01', 'Facturas de proveedores sin pagar, cheques propios entregados que todavía no se debitaron y el saldo de las tarjetas de crédito.'),
  ('2.2', 'Lo que se le debe al personal y a los organismos por sueldos y cargas sociales.'),
  ('2.2.01', 'Sueldos, cargas sociales, sindicato, aguinaldo y vacaciones que ya corresponden pero todavía no se pagaron.'),
  ('2.3', 'Impuestos que la empresa debe: IVA, Ingresos Brutos, Ganancias y planes de pago.'),
  ('2.3.01', 'Saldos de impuestos a pagar y el capital de los planes de pago. El pago del IVA y de Ganancias se carga acá: no es gasto.'),
  ('2.4', 'Préstamos de bancos, de billeteras virtuales y del socio.'),
  ('2.4.01', 'El capital de los préstamos (bancos, Mercado Pago y socio). Los intereses de cada cuota van a 5.8.01.01.'),
  ('3.1.01', 'Plata del negocio que usan los dueños: retiros y gastos personales pagados por la empresa. No es gasto del negocio.'),
  ('3.2.01', 'Capital de cada razón social y resultados de años anteriores. Lo maneja el estudio contable.'),
  ('4.1', 'Lo que se vende: la fábrica (sale de PostBerry) y los locales (sale de FUDO). No se carga a mano.'),
  ('4.2', 'Ingresos que no son ventas: intereses, recuperos, venta de cosas usadas y reintegros.'),
  ('4.2.01', 'Intereses de saldos invertidos, recuperos, venta de bienes usados y reintegros.'),
  ('5.2.04', 'Lo que se gasta en la gente además del sueldo: comida, ropa de trabajo, capacitación, atenciones y exámenes médicos.'),
  ('5.3.01', 'Las facturas de servicios de la fábrica, los locales y la oficina: luz, agua, gas, internet, teléfonos y seguridad.'),
  ('5.3.02', 'Alquiler de los locales, la fábrica, los depósitos y las oficinas.'),
  ('5.3.04', 'Servicio de limpieza, productos de limpieza y control de plagas.'),
  ('5.4.01', 'Lo que cuesta moverse por trabajo: combustible, peajes, estacionamiento, viáticos, taxis y aplicaciones.'),
  ('5.4.02', 'Lo que cuesta mantener los vehículos del negocio: service, arreglos, repuestos, VTV y habilitaciones. El seguro va a 5.6.03.01.'),
  ('5.4.03', 'Transporte contratado a terceros: fletes, expresos, correo y cadetes.'),
  ('5.5.01', 'Lo que se gasta para hacer conocer la marca: publicidad, patrocinios, diseño y contenidos, y merchandising.'),
  ('5.5.03', 'Lo que cobran las apps de delivery y los medios de cobro (Mercado Pago, posnet, tarjetas) por cada venta.'),
  ('5.6.01', 'Profesionales externos: estudio contable, abogados, escribanos, gestores y otros.'),
  ('5.6.02', 'Abonos de los sistemas de gestión (PostBerry, FUDO, el sistema propio) y otras suscripciones y programas.'),
  ('5.6.03', 'Seguros de los vehículos, de responsabilidad civil y de bienes. La ART va en Cargas sociales.'),
  ('5.6.04', 'Librería, impresiones e insumos de computación de la oficina.'),
  ('5.7.01', 'Impuestos que se pagan según lo que se vende: Ingresos Brutos y el monotributo de una unidad. El IVA no va acá.'),
  ('5.7.02', 'Tasas municipales, patentes, sellos, inmobiliario y el IVA que no se puede usar como crédito fiscal.'),
  ('5.8.01', 'Intereses de préstamos y de planes de pago, y recargos por pagar fuera de término.'),
  ('5.8.02', 'Lo que cobran los bancos: mantenimiento de cuentas, comisiones, impuesto al cheque y descuento de cheques.'),
  ('5.9', 'Diferencias, pérdidas no habituales y el Impuesto a las Ganancias del año.'),
  ('5.9.01', 'Faltantes y sobrantes de caja, robos, siniestros y otras pérdidas no habituales.'),
  ('5.9.02', 'El cargo anual de Ganancias que determina el contador. No entra en el Tablero.');

-- Solo donde el plan no trae texto: lo de Nico no se pisa.
update public.plan_cuentas p
  set incluye = d.incluye, incluye_propuesto = true
  from _descripciones d
  where d.codigo = p.codigo and p.incluye is null;
