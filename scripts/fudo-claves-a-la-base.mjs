// Pasa las claves de Fudo de .env.local (FUDO_API_KEY_<SLUG> / FUDO_API_SECRET_<SLUG>)
// a Conexión Fudo: las prueba contra Fudo (solo pide un token) y las guarda
// cifradas con fudo_conexion_guardar. No muestra ningún valor.
//
//   node scripts/fudo-claves-a-la-base.mjs           → base de .env.local, solo si es DEV
//   node scripts/fudo-claves-a-la-base.mjs --prod    → con las variables de prod en el entorno
//
// Las claves que Fudo rechaza no se guardan.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const REF_DEV = 'fafckqysyvtlslfnpzrh'
const prod = process.argv.includes('--prod')

const env = { ...process.env }
if (fs.existsSync('.env.local')) {
  for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1) }
if (!prod && !url.includes(REF_DEV)) { console.error('La base no es la de DEV: para prod, correlo con --prod.'); process.exit(1) }

const slug = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: locales, error } = await db.from('locales_config').select('sucursal').order('orden')
if (error) { console.error(error.message); process.exit(1) }

for (const { sucursal } of locales) {
  const apiKey = env[`FUDO_API_KEY_${slug(sucursal)}`]?.trim(), apiSecret = env[`FUDO_API_SECRET_${slug(sucursal)}`]?.trim()
  if (!apiKey || !apiSecret) { console.log(sucursal.padEnd(16), 'sin claves en el entorno: se saltea'); continue }
  const res = await fetch('https://auth.fu.do/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
  })
  if (res.status === 401 || res.status === 403) { console.log(sucursal.padEnd(16), 'RECHAZADA por Fudo: no se guarda'); continue }
  const ok = res.ok
  const { error: e } = await db.rpc('fudo_conexion_guardar', {
    p_local: sucursal, p_api_key: apiKey, p_api_secret: apiSecret,
    p_probada_ok: ok ? true : null,
    p_probada_error: ok ? null : `Fudo respondió ${res.status}: se prueban en la próxima actualización.`,
  })
  console.log(sucursal.padEnd(16), e ? `ERROR al guardar: ${e.message}` : ok ? 'guardada (probada)' : `guardada (Fudo respondió ${res.status})`)
  await new Promise(r => setTimeout(r, 1500))
}
