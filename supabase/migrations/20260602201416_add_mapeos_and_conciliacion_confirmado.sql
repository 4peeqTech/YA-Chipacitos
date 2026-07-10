-- Tabla de mapeos: nombre Posberry → producto del sistema
CREATE TABLE IF NOT EXISTS producto_mapeos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_posberry TEXT UNIQUE NOT NULL,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE producto_mapeos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON producto_mapeos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Confirmación en conciliaciones
ALTER TABLE conciliaciones
  ADD COLUMN IF NOT EXISTS confirmado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmado_por TEXT;
