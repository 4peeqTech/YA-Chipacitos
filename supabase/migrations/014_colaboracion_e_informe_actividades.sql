-- ================================================
-- Colaboración en tareas + actividades cronometradas en informes
-- ================================================

-- ── Colaboración (área o persona puntual) en tareas ──────────────────
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS colabora_tipo VARCHAR(10) CHECK (colabora_tipo IN ('area', 'persona'));
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS colabora_area TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS colabora_persona_id UUID REFERENCES profiles(id);

-- ── Informes: horario general del turno + actividades manuales ──────
ALTER TABLE informes_diarios ADD COLUMN IF NOT EXISTS horario_inicio TIME;
ALTER TABLE informes_diarios ADD COLUMN IF NOT EXISTS horario_fin TIME;
ALTER TABLE informes_diarios ADD COLUMN IF NOT EXISTS actividades JSONB NOT NULL DEFAULT '[]';
