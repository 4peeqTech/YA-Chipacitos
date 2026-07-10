CREATE TABLE locales_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sucursal text NOT NULL UNIQUE,
  fudo_api_key text,
  fudo_api_secret text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE locales_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo admins pueden ver locales_config"
  ON locales_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'
    )
  );

CREATE POLICY "Solo admins pueden modificar locales_config"
  ON locales_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'
    )
  );

INSERT INTO locales_config (sucursal, fudo_api_key, fudo_api_secret) VALUES
  ('YA! PARAGUAY',    'MUAzNDE2NjA=',  'eGDr8sAACEGcKHzRYWrzm7M59VSzVMtC'),
  ('YA! CORDOBA',     'MUAzNDE2NTg=',  'WkWwBLKo3FKVRF8t9cDvCTP1kcB9HYPu'),
  ('YA! IRIGOYEN',    'MUAzNDE2NTk=',  '1So3Gq1DbkDEinJI8hAMoW2EWEQMxBTJ'),
  ('YA! SAN LORENZO', 'MUAzNDE2NjM=',  'DK8doKEdTyw1d6HK4ND84RP6nwncQRzD'),
  ('YA! UNIDAD',      'MUAzMjYyNTg=',  '1CWSKJ0v2eX0exmpsZ1TkHuE5J0FIuKg');
