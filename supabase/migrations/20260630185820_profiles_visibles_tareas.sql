CREATE POLICY "ver perfiles con acceso a tareas" ON profiles
  FOR SELECT
  USING (rol = 'admin' OR 'tareas' = ANY(modulos_permitidos));
