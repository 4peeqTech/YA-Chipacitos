ALTER TABLE tareas ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'manana'
  CHECK (turno IN ('manana', 'tarde'));

ALTER TABLE tarea_subtareas ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'manana'
  CHECK (turno IN ('manana', 'tarde'));

CREATE INDEX IF NOT EXISTS idx_tareas_turno ON tareas(turno);
CREATE INDEX IF NOT EXISTS idx_tarea_subtareas_turno ON tarea_subtareas(turno);
