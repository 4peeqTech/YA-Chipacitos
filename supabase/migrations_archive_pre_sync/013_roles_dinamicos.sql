-- ================================================
-- Roles dinámicos: crear/editar/eliminar roles personalizados
-- ================================================
-- local/deposito/fabrica/admin quedan protegidos (es_sistema) porque
-- tienen árboles de rutas o RLS ligados a su key literal. squad y
-- cualquier rol nuevo se comportan igual: entran a /admin/* y su
-- visibilidad de módulos depende de profiles.modulos_permitidos.

CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  es_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (key, nombre, color, es_sistema) VALUES
  ('local',    'Local',    '#a78bfa', true),
  ('deposito', 'Depósito', '#38bdf8', true),
  ('fabrica',  'Fábrica',  '#f0a849', true),
  ('admin',    'Admin',    '#e8c547', true),
  ('squad',    'Squad',    '#e84210', false)
ON CONFLICT (key) DO NOTHING;

-- Reemplaza el CHECK fijo por una FK a la tabla roles: permite agregar
-- roles nuevos y, a la vez, actúa como red de seguridad (no se puede
-- borrar un rol mientras haya perfiles que lo usen).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_fkey FOREIGN KEY (rol) REFERENCES roles(key);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados leen roles" ON roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin gestiona roles" ON roles
  FOR ALL USING ((SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin');
