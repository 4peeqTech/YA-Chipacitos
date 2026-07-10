# Archivo — migraciones pre-sincronización (2026-07-10)

Estos 16 archivos (`001`–`016`) eran el historial de migraciones tal como
vivía en este repo hasta el 2026-07-10. Se descubrió que no coincidían con
el historial real aplicado en producción (`supabase_migrations.schema_migrations`
en el proyecto `fafckqysyvtlslfnpzrh`): a producción le faltaban ~19
migraciones que solo existían ahí (fudo, cajas, plan de cuentas, fixes de
conciliación, RLS de `pedido_items`, etc.), y algunos de estos archivos
locales (notablemente `005_mapeo_conciliacion.sql`) tenían contenido que
**nunca se aplicó tal cual** — quedaron como borrador desactualizado.

Se reconstruyó `supabase/migrations/` desde la fuente de verdad real
(`schema_migrations.statements`, más introspección en vivo para el bootstrap
que predata el tracking), con nombres de archivo `<version>_<nombre>.sql`
al estilo Supabase CLI.

Estos archivos se conservan acá solo como referencia histórica. No deben
aplicarse — dejarían el esquema en un estado duplicado o (en el caso de
`005`) incorrecto.
