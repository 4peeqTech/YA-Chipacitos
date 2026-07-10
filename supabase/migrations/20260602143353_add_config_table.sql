CREATE TABLE IF NOT EXISTS config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin gestiona config" ON config
  FOR ALL USING (get_user_rol() = 'admin');

INSERT INTO config (key, value) VALUES ('apps_script_url', '') ON CONFLICT (key) DO NOTHING;
