ALTER TABLE gastos ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS fecha_pago date;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS pagado_por uuid REFERENCES profiles(id);

-- Bucket para comprobantes (creado via SQL storage API)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Politica: admins pueden subir y leer
CREATE POLICY "Admins upload comprobantes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comprobantes' AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin')
  );

CREATE POLICY "Admins read comprobantes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprobantes' AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin')
  );
