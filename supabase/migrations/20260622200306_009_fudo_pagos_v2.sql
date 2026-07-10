CREATE TABLE IF NOT EXISTS fudo_pagos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fudo_expense_id text NOT NULL,
  sucursal text NOT NULL,
  descripcion text,
  monto numeric(12,2),
  fecha_gasto date,
  fecha_pago date,
  comprobante_url text,
  pagado_por uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(fudo_expense_id, sucursal)
);

ALTER TABLE fudo_pagos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='fudo_pagos' AND policyname='Admins gestionan fudo_pagos'
  ) THEN
    CREATE POLICY "Admins gestionan fudo_pagos"
      ON fudo_pagos FOR ALL
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin'));
  END IF;
END $$;
