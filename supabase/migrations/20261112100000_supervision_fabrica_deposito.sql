-- Supervisión v2, fase 3 (12-11): checklists de fábrica y de depósito.
--
-- Spec v2, secciones "Checklist de fábrica" y "Checklist de depósito". Cada
-- uno es un lugar único con su catálogo propio; al final de los dos van los
-- bloques comunes de Limpieza de baño y Seguridad e higiene (b12 y b13, de la
-- fase 1a) y los requerimientos de la visita.
--
-- Depósito: insumos no comestibles y el freezer de chipacitos grandes. Las
-- planillas de ingresos, egresos y salidas a eventos siguen fuera del sistema
-- (las lleva el encargado del depósito); el supervisor controla que estén al
-- día. El módulo de Salidas a eventos de la spec no se hace (decisión 11-11).
--
-- Fábrica: la lista de máquinas (f19 a f25) está pendiente de validar con el
-- responsable. Si cambia una máquina, es un ítem nuevo con otro ID.

insert into public.supervision_lugares (id, nombre, tipo, orden) values
  ('fabrica',  'Fábrica',  'fabrica',  20),
  ('deposito', 'Depósito', 'deposito', 21);

insert into public.supervision_bloques (id, titulo, referencia, orden, tipos) values
  ('b14', 'Presentación del personal', '', 1, '{fabrica}'),
  ('b15', 'Masa y producción',         '', 2, '{fabrica}'),
  ('b16', 'Orden y limpieza',          '', 3, '{fabrica}'),
  ('b17', 'Frío',                      '', 4, '{fabrica}'),
  ('b18', 'Limpieza de maquinaria',    '', 5, '{fabrica}'),
  ('b19', 'Vestuario',                 '', 6, '{fabrica}'),
  ('b20', 'Equipos y mantenimiento',   '', 7, '{fabrica}'),
  ('b21', 'Control de ingresos y egresos', 'Planilla de control del depósito', 1, '{deposito}'),
  ('b22', 'Orden',                         '', 2, '{deposito}'),
  ('b23', 'Limpieza',                      '', 3, '{deposito}'),
  ('b24', 'Freezer de chipacitos grandes', '', 4, '{deposito}'),
  ('b25', 'Salidas a eventos',             'Planilla de salidas y devoluciones del depósito', 5, '{deposito}');

insert into public.supervision_items (id, bloque_id, texto, orden) values
  ('f1',  'b14', 'Usa el uniforme completo y limpio.', 10),
  ('f2',  'b14', 'Usa una cofia que cubre todo el cabello.', 20),
  ('f3',  'b14', 'Tiene la barba corta o cubierta.', 30),
  ('f4',  'b14', 'Usa guantes según la tarea, sin guardarlos en el bolsillo ni dejarlos a un costado para volver a usarlos.', 40),
  ('f5',  'b14', 'El celular queda guardado en el locker, fuera de la zona de producción.', 50),
  ('f6',  'b14', 'Usa el calzado de trabajo; el calzado de calle queda en el locker.', 60),
  ('f7',  'b15', 'La masa tiene la consistencia y la temperatura adecuadas para trabajarla.', 10),
  ('f8',  'b15', 'Las masas están en sus cajones o recipientes, identificadas.', 20),
  ('f9',  'b15', 'El producto embolsado queda bien sellado y rotulado.', 30),
  ('f10', 'b15', 'Las mesadas de trabajo están limpias y sin restos de masa.', 40),
  ('f11', 'b16', 'Durante el embolsado se barre con frecuencia (cada 20 a 30 minutos).', 10),
  ('f12', 'b16', 'La mercadería está elevada del piso, sobre estantes o tarimas.', 20),
  ('f13', 'b16', 'Cada producto está en su sector asignado.', 30),
  ('f14', 'b16', 'El piso y los pasillos están limpios y despejados.', 40),
  ('f15', 'b17', 'Freezers, cámara y abatidor están ordenados.', 10),
  ('f16', 'b17', 'Freezers, cámara y abatidor están limpios.', 20),
  ('f17', 'b17', 'Las heladeras de producción tienen solo insumos de fábrica, nada personal. Lo personal va en la heladera de la cocina.', 30),
  ('f18', 'b17', 'Los insumos están ordenados por sector (queso, salame, rallado) y se aplica PEPS.', 40),
  ('f19', 'b18', 'Cortadora y divisora limpias.', 10),
  ('f20', 'b18', 'Mezcladora limpia.', 20),
  ('f21', 'b18', 'Feteadora limpia.', 30),
  ('f22', 'b18', 'Ralladora de queso limpia.', 40),
  ('f23', 'b18', 'Batidora limpia.', 50),
  ('f24', 'b18', 'Selladora limpia.', 60),
  ('f25', 'b18', 'Bacha limpia y sin vajilla acumulada.', 70),
  ('f26', 'b19', 'Los lockers y el vestuario están ordenados.', 10),
  ('f27', 'b19', 'No hay pertenencias personales en la zona de producción.', 20),
  ('f28', 'b20', 'Las máquinas y los equipos de frío funcionan correctamente.', 10),
  ('f29', 'b20', 'Las fallas detectadas fueron reportadas y están en gestión.', 20),
  ('f30', 'b20', 'El abatidor congela en tiempo y temperatura adecuados.', 30),
  ('dp1',  'b21', 'Los ingresos de insumos están registrados en la planilla de control, con fecha, cantidad y responsable.', 10),
  ('dp2',  'b21', 'Los egresos de insumos están registrados, con fecha, cantidad, destino y responsable.', 20),
  ('dp3',  'b21', 'La planilla de control está al día.', 30),
  ('dp4',  'b21', 'En un conteo de 2 o 3 insumos elegidos al azar, el stock físico coincide con la planilla (anotar en la observación cuáles se contaron).', 40),
  ('dp5',  'b22', 'Cada insumo está en su lugar asignado y acomodado.', 10),
  ('dp6',  'b22', 'Los insumos están elevados del piso, sobre estantes o tarimas.', 20),
  ('dp7',  'b22', 'Los pasillos están despejados, sin cajas ni bultos en el paso.', 30),
  ('dp8',  'b23', 'El piso está barrido y limpio.', 10),
  ('dp9',  'b23', 'La limpieza profunda del depósito está al día según la frecuencia definida.', 20),
  ('dp10', 'b23', 'Los estantes están limpios, sin polvo ni restos.', 30),
  ('dp11', 'b24', 'El freezer funciona y mantiene −18 °C.', 10),
  ('dp12', 'b24', 'Los chipacitos están en condiciones: bolsas cerradas, sin escarcha, sin bollos pegados ni deformados.', 20),
  ('dp13', 'b24', 'El freezer está ordenado, con los productos rotulados con fecha, y se aplica PEPS.', 30),
  ('dp14', 'b24', 'El freezer está limpio.', 40),
  ('dp15', 'b25', 'Todas las salidas a eventos están registradas con el listado de lo que se llevó.', 10),
  ('dp16', 'b25', 'Los eventos ya realizados están cerrados, y los faltantes fueron informados.', 20);
