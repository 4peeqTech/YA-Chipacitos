CREATE TABLE IF NOT EXISTS pedido_mensajes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE NOT NULL,
  autor_rol TEXT NOT NULL,
  autor_nombre TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pedido_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON pedido_mensajes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
