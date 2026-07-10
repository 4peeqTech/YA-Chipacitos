-- ================================================
-- Soft delete de usuarios
-- ================================================
-- En vez de borrar el usuario de verdad (auth.users + profiles),
-- "Eliminar" ahora lo desactiva: se banea su acceso y su perfil
-- pasa a estado 'eliminado', por lo que deja de aparecer en el
-- listado de administración pero sigue existiendo en la base para
-- no perder el historial que referencia su profiles.id (pedidos,
-- ventas, gastos, tareas, etc. — ver 015_permitir_eliminar_usuarios).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','eliminado'));
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON profiles(estado);

-- No mostrar perfiles eliminados a quienes asignan tareas (los admins
-- igual los ven vía la policy "usuarios ven su propio perfil").
DROP POLICY IF EXISTS "ver perfiles con acceso a tareas" ON profiles;
CREATE POLICY "ver perfiles con acceso a tareas" ON profiles
  FOR SELECT
  USING (estado = 'activo' AND (rol = 'admin' OR 'tareas' = ANY(modulos_permitidos)));
