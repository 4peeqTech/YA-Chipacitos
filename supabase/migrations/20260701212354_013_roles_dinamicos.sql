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

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_fkey FOREIGN KEY (rol) REFERENCES roles(key);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados leen roles" ON roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin gestiona roles" ON roles
  FOR ALL USING ((SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin');
