-- Las credenciales Fudo dejan de vivir en la base (texto plano, expuestas por
-- GET /api/locales) y pasan a variables de entorno por sucursal
-- (FUDO_API_KEY_<SLUG> / FUDO_API_SECRET_<SLUG>, ver lib/fudo.ts).
ALTER TABLE locales_config
  DROP COLUMN IF EXISTS fudo_api_key,
  DROP COLUMN IF EXISTS fudo_api_secret;
