ALTER TABLE plan_cuentas
  ADD COLUMN IF NOT EXISTS variabilidad text CHECK (variabilidad IN ('VARIABLE', 'FIJO')),
  ADD COLUMN IF NOT EXISTS flujo text CHECK (flujo IN ('INGRESO', 'EGRESO'));
