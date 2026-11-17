-- ============================================================================
-- Tokens de Fudo compartidos (2026-11-17).
--
-- Fudo da un token por API Key que dura 24 h y limita cuántas veces se pide
-- (429). Hasta ahora el token se guardaba en la memoria de cada proceso: en
-- Vercel cada pedido puede caer en un proceso distinto, se pedía token una y
-- otra vez y Fudo cortaba (pasó al traer las ventas de 8 locales). Acá se
-- guarda el último token de cada API Key para que lo compartan todos.
--
-- Sin políticas: con RLS prendida, solo el servidor (service role) la lee y la
-- escribe. Un token sirve para leer Fudo: no lo ve ningún usuario.
-- ============================================================================

create table if not exists public.fudo_tokens (
  api_key  text primary key,
  token    text not null,
  vence    timestamptz not null
);

alter table public.fudo_tokens enable row level security;
revoke all on public.fudo_tokens from anon, authenticated;
grant select, insert, update, delete on public.fudo_tokens to service_role;
