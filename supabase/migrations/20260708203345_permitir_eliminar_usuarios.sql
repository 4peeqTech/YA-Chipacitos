-- profiles → auth.users: cascada
ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- pedidos.local_id
ALTER TABLE pedidos DROP CONSTRAINT pedidos_local_id_fkey;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_local_id_fkey
  FOREIGN KEY (local_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ventas_posberry.local_id
ALTER TABLE ventas_posberry DROP CONSTRAINT ventas_posberry_local_id_fkey;
ALTER TABLE ventas_posberry ADD CONSTRAINT ventas_posberry_local_id_fkey
  FOREIGN KEY (local_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- conciliaciones.local_id
ALTER TABLE conciliaciones DROP CONSTRAINT conciliaciones_local_id_fkey;
ALTER TABLE conciliaciones ADD CONSTRAINT conciliaciones_local_id_fkey
  FOREIGN KEY (local_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- gastos.pagado_por
ALTER TABLE gastos DROP CONSTRAINT gastos_pagado_por_fkey;
ALTER TABLE gastos ADD CONSTRAINT gastos_pagado_por_fkey
  FOREIGN KEY (pagado_por) REFERENCES profiles(id) ON DELETE SET NULL;

-- gastos.created_by (ya era set null; se recrea para dejarlo explícito)
ALTER TABLE gastos DROP CONSTRAINT gastos_created_by_fkey;
ALTER TABLE gastos ADD CONSTRAINT gastos_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- tareas.creado_por (era NOT NULL; se permite null para desvincular al usuario eliminado)
ALTER TABLE tareas ALTER COLUMN creado_por DROP NOT NULL;
ALTER TABLE tareas DROP CONSTRAINT tareas_creado_por_fkey;
ALTER TABLE tareas ADD CONSTRAINT tareas_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES profiles(id) ON DELETE SET NULL;

-- tareas.colabora_persona_id
ALTER TABLE tareas DROP CONSTRAINT tareas_colabora_persona_id_fkey;
ALTER TABLE tareas ADD CONSTRAINT tareas_colabora_persona_id_fkey
  FOREIGN KEY (colabora_persona_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- tarea_comentarios.autor_id
ALTER TABLE tarea_comentarios ALTER COLUMN autor_id DROP NOT NULL;
ALTER TABLE tarea_comentarios DROP CONSTRAINT tarea_comentarios_autor_id_fkey;
ALTER TABLE tarea_comentarios ADD CONSTRAINT tarea_comentarios_autor_id_fkey
  FOREIGN KEY (autor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- tarea_historial.autor_id
ALTER TABLE tarea_historial ALTER COLUMN autor_id DROP NOT NULL;
ALTER TABLE tarea_historial DROP CONSTRAINT tarea_historial_autor_id_fkey;
ALTER TABLE tarea_historial ADD CONSTRAINT tarea_historial_autor_id_fkey
  FOREIGN KEY (autor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- tarea_adjuntos.autor_id
ALTER TABLE tarea_adjuntos ALTER COLUMN autor_id DROP NOT NULL;
ALTER TABLE tarea_adjuntos DROP CONSTRAINT tarea_adjuntos_autor_id_fkey;
ALTER TABLE tarea_adjuntos ADD CONSTRAINT tarea_adjuntos_autor_id_fkey
  FOREIGN KEY (autor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- informes_diarios.autor_id
ALTER TABLE informes_diarios ALTER COLUMN autor_id DROP NOT NULL;
ALTER TABLE informes_diarios DROP CONSTRAINT informes_diarios_autor_id_fkey;
ALTER TABLE informes_diarios ADD CONSTRAINT informes_diarios_autor_id_fkey
  FOREIGN KEY (autor_id) REFERENCES profiles(id) ON DELETE SET NULL;
