ALTER TABLE profiles ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','eliminado'));
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON profiles(estado);

-- No mostrar perfiles eliminados a quienes asignan tareas (los admins igual los ven vía su propia policy)
DROP POLICY IF EXISTS "ver perfiles con acceso a tareas" ON profiles;
CREATE POLICY "ver perfiles con acceso a tareas" ON profiles
  FOR SELECT
  USING (estado = 'activo' AND (rol = 'admin' OR 'tareas' = ANY(modulos_permitidos)));
