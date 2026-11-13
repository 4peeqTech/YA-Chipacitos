-- ============================================================================
-- Conexiones de Fudo (2026-11-13): las claves de la API se cargan desde la app.
--
-- Hasta ahora vivían solo en variables de Vercel (FUDO_API_KEY_<SLUG> /
-- FUDO_API_SECRET_<SLUG>): la app no podía cambiarlas y cada cambio pedía un
-- redeploy. Ahora:
--   - fudo_conexiones guarda el API Key de cada local y la referencia a su
--     API Secret, que vive cifrado en Supabase Vault;
--   - fudo_conexion_guardar (admin) lo crea o lo reemplaza: el secret nunca se
--     devuelve, solo se pisa;
--   - fudo_conexion_leer devuelve el par para usarlo contra Fudo y solo la
--     puede llamar el servidor (service role), nunca un usuario;
--   - fudo_conexion_desconectar deja de usar Fudo en un local (los gastos que
--     ya se trajeron quedan);
--   - locales_agregar da de alta un local (antes solo por migración).
-- Las variables de Vercel siguen como respaldo mientras un local no tenga
-- conexión cargada acá.
-- ============================================================================

create table if not exists public.fudo_conexiones (
  local            text primary key references public.locales_config(sucursal) on update cascade on delete cascade,
  api_key          text not null,
  secret_id        uuid not null,
  -- Resultado de la última prueba contra Fudo (al guardar).
  probada_en       timestamptz,
  probada_ok       boolean,
  probada_error    text,
  actualizado_por  uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table public.fudo_conexiones enable row level security;
drop policy if exists fudo_conexiones_admin_lee on public.fudo_conexiones;
create policy fudo_conexiones_admin_lee on public.fudo_conexiones for select using (es_admin());
revoke insert, update, delete, truncate on public.fudo_conexiones from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Guardar (o reemplazar) las claves de un local. Admin, o el servidor (script).
-- ----------------------------------------------------------------------------
create or replace function public.fudo_conexion_guardar(
  p_local text default null,
  p_api_key text default null,
  p_api_secret text default null,
  p_probada_ok boolean default null,
  p_probada_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local  text := btrim(p_local);
  v_key    text := btrim(p_api_key);
  v_secret text := btrim(p_api_secret);
  v_id     uuid;
begin
  if not _gastos_puede_sistema() then
    raise exception 'Solo un administrador puede cargar las claves de Fudo.';
  end if;
  if not exists (select 1 from locales_config where sucursal = v_local) then
    raise exception 'No encontramos el local %. Recargá la página.', coalesce(v_local, '');
  end if;
  if coalesce(v_key, '') = '' or coalesce(v_secret, '') = '' then
    raise exception 'Cargá el API Key y el API Secret.';
  end if;

  select secret_id into v_id from fudo_conexiones where local = v_local;
  if v_id is null then
    v_id := vault.create_secret(v_secret, 'fudo:' || v_local || ':' || gen_random_uuid(), 'API Secret de Fudo de ' || v_local);
  else
    perform vault.update_secret(v_id, v_secret);
  end if;

  insert into fudo_conexiones (local, api_key, secret_id, probada_en, probada_ok, probada_error, actualizado_por, updated_at)
  values (v_local, v_key, v_id, case when p_probada_ok is not null then now() end, p_probada_ok, p_probada_error, auth.uid(), now())
  on conflict (local) do update
    set api_key = excluded.api_key, secret_id = excluded.secret_id, probada_en = excluded.probada_en,
        probada_ok = excluded.probada_ok, probada_error = excluded.probada_error,
        actualizado_por = excluded.actualizado_por, updated_at = now();

  update locales_config set tiene_fudo = true where sucursal = v_local and not tiene_fudo;
end;
$$;

revoke execute on function public.fudo_conexion_guardar(text, text, text, boolean, text) from public, anon;
grant execute on function public.fudo_conexion_guardar(text, text, text, boolean, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Leer el par para hablar con Fudo: solo el servidor.
-- ----------------------------------------------------------------------------
create or replace function public.fudo_conexion_leer(p_local text default null)
returns table (api_key text, api_secret text)
language sql
stable
security definer
set search_path = public
as $$
  select c.api_key, s.decrypted_secret
  from fudo_conexiones c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.local = btrim(p_local);
$$;

revoke execute on function public.fudo_conexion_leer(text) from public, anon, authenticated;
grant execute on function public.fudo_conexion_leer(text) to service_role;

-- ----------------------------------------------------------------------------
-- Dejar de usar Fudo en un local: se borran sus claves; lo ya traído queda.
-- ----------------------------------------------------------------------------
create or replace function public.fudo_conexion_desconectar(p_local text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede desconectar Fudo.';
  end if;
  delete from fudo_conexiones where local = btrim(p_local) returning secret_id into v_id;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;
  update locales_config set tiene_fudo = false where sucursal = btrim(p_local);
  if not found then
    raise exception 'No encontramos el local. Recargá la página.';
  end if;
end;
$$;

revoke execute on function public.fudo_conexion_desconectar(text) from public, anon;
grant execute on function public.fudo_conexion_desconectar(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Estado de cada local para la pantalla (sin el secret, claro).
-- ----------------------------------------------------------------------------
create or replace function public.fudo_conexiones_estado()
returns table (
  sucursal text, activo boolean, tiene_fudo boolean, orden integer, caja text,
  con_claves boolean, api_key_fin text, probada_en timestamptz, probada_ok boolean, probada_error text,
  ultimo_ok timestamptz, ultimo_error text, ultimo_error_en timestamptz, gastos bigint
)
language sql
stable
set search_path = public
as $$
  select l.sucursal, l.activo, l.tiene_fudo, l.orden, l.caja_default,
         c.local is not null, right(c.api_key, 4), c.probada_en, c.probada_ok, c.probada_error,
         (select max(s.creado_en) from gastos_fudo_sync s where s.local = l.sucursal and s.ok),
         case when u.ok then null else u.error end, case when u.ok then null else u.creado_en end,
         (select count(*) from gastos g where g.local = l.sucursal and g.origen = 'fudo')
  from locales_config l
  left join fudo_conexiones c on c.local = l.sucursal
  -- El último intento: si falló, su error (si después anduvo, no hay nada que mostrar).
  left join lateral (
    select s.error, s.creado_en, s.ok from gastos_fudo_sync s where s.local = l.sucursal order by s.creado_en desc limit 1
  ) u on true
  where es_admin()
  order by l.orden, l.sucursal;
$$;

revoke execute on function public.fudo_conexiones_estado() from public, anon;
grant execute on function public.fudo_conexiones_estado() to authenticated;

-- ----------------------------------------------------------------------------
-- Agregar un local (con su caja). El nombre va en mayúsculas, como los demás.
-- ----------------------------------------------------------------------------
create or replace function public.locales_agregar(p_sucursal text default null, p_caja text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := upper(regexp_replace(btrim(p_sucursal), '\s+', ' ', 'g'));
  v_caja   text := regexp_replace(btrim(p_caja), '\s+', ' ', 'g');
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede agregar locales.';
  end if;
  if coalesce(v_nombre, '') = '' then
    raise exception 'Poné el nombre del local.';
  end if;
  if coalesce(v_caja, '') = '' then
    raise exception 'Poné la caja del local: de ahí sale lo que el local paga en efectivo.';
  end if;
  if exists (select 1 from locales_config where upper(sucursal) = v_nombre) then
    raise exception 'Ya hay un local que se llama %.', v_nombre;
  end if;

  insert into cajas (nombre) values (v_caja) on conflict (nombre) do nothing;
  insert into locales_config (sucursal, activo, tiene_fudo, caja_default, orden)
  values (v_nombre, true, false, v_caja, coalesce((select max(orden) from locales_config), 0) + 1);
  return v_nombre;
end;
$$;

revoke execute on function public.locales_agregar(text, text) from public, anon;
grant execute on function public.locales_agregar(text, text) to authenticated;
