-- ================================================
-- Vista calendario de tareas: fecha en subtareas + informes diarios
-- ================================================

-- ── Subtareas con fecha propia (para ubicarlas en el calendario) ────
ALTER TABLE tarea_subtareas ADD COLUMN IF NOT EXISTS fecha DATE;

CREATE INDEX IF NOT EXISTS idx_tarea_subtareas_fecha ON tarea_subtareas(fecha);

-- ── Informes diarios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS informes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id UUID NOT NULL REFERENCES profiles(id),
  destinatarios UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  fecha DATE NOT NULL,
  tareas_completadas JSONB NOT NULL DEFAULT '[]',
  comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_informes_diarios_fecha ON informes_diarios(fecha);
CREATE INDEX IF NOT EXISTS idx_informes_diarios_autor_id ON informes_diarios(autor_id);
CREATE INDEX IF NOT EXISTS idx_informes_diarios_destinatarios ON informes_diarios USING gin(destinatarios);

-- ── Realtime ─────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE informes_diarios;

-- ── Row Level Security ───────────────────────────────────────────────
ALTER TABLE informes_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autor y destinatarios ven el informe" ON informes_diarios
  FOR SELECT USING (auth.uid() = autor_id OR auth.uid() = ANY(destinatarios));

CREATE POLICY "usuario crea informes propios" ON informes_diarios
  FOR INSERT WITH CHECK (auth.uid() = autor_id);

CREATE POLICY "autor elimina su informe" ON informes_diarios
  FOR DELETE USING (auth.uid() = autor_id);
