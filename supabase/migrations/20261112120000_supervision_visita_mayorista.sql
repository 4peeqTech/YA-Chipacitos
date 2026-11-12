-- Supervisión v2, fase 4b (12-11): la visita a clientes mayoristas.
--
-- Spec v2, secciones "Checklist de clientes mayoristas" y "Control de equipos
-- en la visita". El foco es cómo el cliente conserva, cocina y exhibe el
-- producto, no su personal. Los ítems se activan según la ficha del cliente y
-- sus equipos de Ya! (condiciones evaluadas en la app): uno que solo vende
-- congelado ve entre 7 y 10 ítems; uno que cocina, entre 19 y 22. No llevan
-- los bloques comunes ni requerimientos.
--
-- - control_equipos: lo que el supervisor controla de cada equipo de Ya! en el
--   local, { idEquipo: { presente, coincide, estado, obs } }. De ahí sale solo
--   el ítem mq1 (No cumple si alguno no está, no coincide o está en mal estado).
-- - recomendaciones: lo que se le dejó al cliente, texto libre al cierre.

insert into public.supervision_bloques (id, titulo, referencia, orden, tipos) values
  ('b26', 'Conservación y cadena de frío',   '', 1, '{mayorista}'),
  ('b27', 'Exhibición y marca',              '', 2, '{mayorista}'),
  ('b28', 'Cocción',                         'Ficha técnica de cocción', 3, '{mayorista}'),
  ('b29', 'Producto cocido en exhibición',   '', 4, '{mayorista}'),
  ('b30', 'Horno',                           '', 5, '{mayorista}'),
  ('b31', 'Equipos de Ya! Chipacitos',       'Registro de equipos entregados', 6, '{mayorista}');

insert into public.supervision_items (id, bloque_id, texto, orden, condicion, parametro) values
  ('mc1', 'b26', 'El producto se conserva en freezer a −18 °C.', 10, null, null),
  ('mc2', 'b26', 'Al recibirlo, el producto se guarda en el freezer sin demora, sin cortar la cadena de frío.', 20, null, null),
  ('mc3', 'b26', 'Las bolsas están cerradas y sin signos de descongelamiento (escarcha, bollos pegados o deformados).', 30, null, null),
  ('mc4', 'b26', 'El producto está dentro de su fecha de vencimiento y se rota lo más antiguo primero.', 40, null, null),
  ('mc5', 'b26', 'El freezer de Ya! Chipacitos tiene solo productos de la marca.', 50, 'freezer_ya', null),
  ('mc6', 'b26', 'El freezer de Ya! Chipacitos está limpio y funciona correctamente.', 60, 'freezer_ya', null),
  ('me1', 'b27', 'El producto está visible y accesible para el cliente final.', 10, null, null),
  ('me2', 'b27', 'El producto está identificado con la marca Ya! Chipacitos (cartelería o señalización).', 20, null, null),
  ('me3', 'b27', 'No hay producto de otras marcas mezclado con el de Ya! Chipacitos.', 30, null, null),
  ('mk1', 'b28', 'Se cocina directo del freezer, sin descongelar.', 10, 'cocina', null),
  ('mk2', 'b28', 'El horno se precalienta de 10 a 15 minutos a 230 °C.', 20, 'cocina', null),
  ('mk3', 'b28', 'En la bandeja se deja una separación de 2 cm entre chipacitos.', 30, 'cocina', null),
  ('mk4', 'b28', 'Se hornea de 12 a 13 minutos, hasta que estén dorados por fuera.', 40, 'cocina', null),
  ('mk5', 'b28', 'El producto cocido tiene el punto correcto: ni crudo ni blanco, ni quemado ni recocido.', 50, 'cocina', null),
  ('mk6', 'b28', 'El personal que cocina tiene la ficha técnica a mano y conoce el procedimiento.', 60, 'cocina', null),
  ('mx1', 'b29', 'La exhibidora se usa para mantener el producto, no para seguir cocinándolo.', 10, 'cocina', null),
  ('mx2', 'b29', 'El producto cocido no supera el tiempo máximo en exhibidora.', 20, 'cocina', 'mx2_tiempo_max'),
  ('mx3', 'b29', 'No se vende producto cocido el día anterior.', 30, 'cocina', null),
  ('mx4', 'b29', 'Al probarlo, el producto está tierno y en condiciones (no duro ni seco).', 40, 'cocina', null),
  ('mh1', 'b30', 'El horno funciona y alcanza la temperatura de trabajo.', 10, 'cocina', null),
  ('mh2', 'b30', 'Si el horno del cliente presenta fallas, se le recomendó un técnico (dejar constancia en la observación).', 20, 'horno_cliente', null),
  ('mh3', 'b30', 'El horno de Ya! Chipacitos está limpio y en buen estado.', 30, 'horno_ya', null),
  ('mq1', 'b31', 'Los equipos entregados están en el local, coinciden con el registro y están en buen estado.', 10, 'con_equipos', null);

alter table public.supervision_visitas
  add column control_equipos jsonb not null default '{}'::jsonb check (jsonb_typeof(control_equipos) = 'object'),
  add column recomendaciones text not null default '';
