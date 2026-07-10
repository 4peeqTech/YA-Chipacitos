ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS productos_codigo_destino_unique ON productos (codigo, destino) WHERE codigo IS NOT NULL;
