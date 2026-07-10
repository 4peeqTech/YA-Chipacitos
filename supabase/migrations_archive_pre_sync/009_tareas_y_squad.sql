-- ================================================
-- Módulo de Tareas + rol Squad + permisos por módulo
-- ================================================

-- ── Rol "squad" + permisos por módulo ──────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('local','deposito','fabrica','admin','squad'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS modulos_permitidos text[] NOT NULL DEFAULT '{}';

-- ── Tablas del módulo de tareas ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  prioridad VARCHAR(10) CHECK (prioridad IN ('alta', 'media', 'baja')) DEFAULT 'media',
  estado VARCHAR(20) CHECK (estado IN ('pendiente', 'en_progreso', 'completada')) DEFAULT 'pendiente',
  fecha_limite DATE,
  asignado_a UUID[] DEFAULT ARRAY[]::UUID[],
  creado_por UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tarea_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL REFERENCES profiles(id),
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tarea_subtareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  completada BOOLEAN DEFAULT FALSE,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tarea_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  autor_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tarea_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER,
  autor_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tareas_creado_por ON tareas(creado_por);
CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(estado);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha_limite ON tareas(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado_a ON tareas USING gin(asignado_a);
CREATE INDEX IF NOT EXISTS idx_tarea_comentarios_tarea_id ON tarea_comentarios(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_subtareas_tarea_id ON tarea_subtareas(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_historial_tarea_id ON tarea_historial(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_adjuntos_tarea_id ON tarea_adjuntos(tarea_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ── Realtime ─────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE tareas;
ALTER PUBLICATION supabase_realtime ADD TABLE tarea_comentarios;
ALTER PUBLICATION supabase_realtime ADD TABLE tarea_subtareas;

-- ── Row Level Security ───────────────────────────────────────────────
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_subtareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- tareas
CREATE POLICY "participantes ven sus tareas" ON tareas
  FOR SELECT USING (auth.uid() = creado_por OR auth.uid() = ANY(asignado_a));

CREATE POLICY "usuario crea tareas propias" ON tareas
  FOR INSERT WITH CHECK (auth.uid() = creado_por);

CREATE POLICY "participantes actualizan sus tareas" ON tareas
  FOR UPDATE USING (auth.uid() = creado_por OR auth.uid() = ANY(asignado_a));

CREATE POLICY "creador elimina sus tareas" ON tareas
  FOR DELETE USING (auth.uid() = creado_por);

-- comentarios
CREATE POLICY "participantes ven comentarios" ON tarea_comentarios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_comentarios.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "participantes comentan" ON tarea_comentarios
  FOR INSERT WITH CHECK (
    auth.uid() = autor_id AND EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_comentarios.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

-- subtareas
CREATE POLICY "participantes ven subtareas" ON tarea_subtareas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_subtareas.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "participantes gestionan subtareas" ON tarea_subtareas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_subtareas.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

-- adjuntos
CREATE POLICY "participantes ven adjuntos" ON tarea_adjuntos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_adjuntos.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "participantes suben adjuntos" ON tarea_adjuntos
  FOR INSERT WITH CHECK (
    auth.uid() = autor_id AND EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_adjuntos.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "autor elimina su adjunto" ON tarea_adjuntos
  FOR DELETE USING (auth.uid() = autor_id);

-- historial
CREATE POLICY "participantes ven historial" ON tarea_historial
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_historial.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "participantes insertan historial" ON tarea_historial
  FOR INSERT WITH CHECK (
    auth.uid() = autor_id AND EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id = tarea_historial.tarea_id
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

-- push_subscriptions
CREATE POLICY "usuario gestiona sus suscripciones push" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Storage bucket para adjuntos ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tarea-adjuntos', 'tarea-adjuntos', false, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "participantes suben adjuntos a storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tarea-adjuntos' AND
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id::text = (storage.foldername(name))[1]
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "participantes leen adjuntos de storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tarea-adjuntos' AND
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id::text = (storage.foldername(name))[1]
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );

CREATE POLICY "participantes borran adjuntos de storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tarea-adjuntos' AND
    EXISTS (
      SELECT 1 FROM tareas
      WHERE tareas.id::text = (storage.foldername(name))[1]
      AND (auth.uid() = tareas.creado_por OR auth.uid() = ANY(tareas.asignado_a))
    )
  );
