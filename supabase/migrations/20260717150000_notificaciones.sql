-- Historial de notificaciones in-app (panel de campana), separado de
-- push_subscriptions (que solo registra dispositivos para Web Push).
-- Se inserta desde enviarPush() con el cliente de service role, así
-- que no hace falta política de INSERT para el rol authenticated.
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  cuerpo TEXT,
  url TEXT,
  tipo TEXT,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_user_id ON notificaciones(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario ve sus notificaciones" ON notificaciones
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usuario marca sus notificaciones leídas" ON notificaciones
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
