-- Agregar id_externo para deduplicar importaciones del Google Sheet
ALTER TABLE ventas_posberry ADD COLUMN IF NOT EXISTS id_externo text;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_posberry_id_externo_idx
  ON ventas_posberry(id_externo) WHERE id_externo IS NOT NULL;
