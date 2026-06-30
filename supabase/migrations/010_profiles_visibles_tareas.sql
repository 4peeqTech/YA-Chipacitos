-- ================================================
-- Perfiles visibles para asignar tareas
-- ================================================
-- La policy de SELECT en profiles solo dejaba ver el propio perfil (o
-- todos si sos admin). Para asignar tareas hace falta poder ver a los
-- demás usuarios que también tienen el módulo de tareas habilitado.

CREATE POLICY "ver perfiles con acceso a tareas" ON profiles
  FOR SELECT
  USING (rol = 'admin' OR 'tareas' = ANY(modulos_permitidos));
