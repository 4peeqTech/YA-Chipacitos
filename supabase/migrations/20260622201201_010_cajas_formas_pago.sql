-- Formas de pago
CREATE TABLE IF NOT EXISTS formas_pago (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE formas_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gestionan formas_pago" ON formas_pago FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'));

INSERT INTO formas_pago (nombre) VALUES
  ('Transferencia'),('Efectivo'),('Cheque'),('E-Cheq'),
  ('Debito automatico'),('Tarjeta de credito'),('Mixto')
ON CONFLICT (nombre) DO NOTHING;

-- Cajas
CREATE TABLE IF NOT EXISTS cajas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gestionan cajas" ON cajas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'));

-- Agregar caja a gastos y fudo_pagos
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS caja text;
ALTER TABLE fudo_pagos ADD COLUMN IF NOT EXISTS caja text;
ALTER TABLE fudo_pagos ADD COLUMN IF NOT EXISTS forma_pago text;
