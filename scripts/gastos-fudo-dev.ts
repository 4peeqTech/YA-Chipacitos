// Gastos de Fudo en la base de DEV: sincronizar o empezar de cero.
//
//   npx tsx scripts/gastos-fudo-dev.ts sincronizar
//   npx tsx scripts/gastos-fudo-dev.ts reiniciar     (borra los gastos de origen fudo y su registro)
//
// Solo lee Fudo. Se niega a correr si .env.local no apunta a dev.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

const REF_DEV = 'fafckqysyvtlslfnpzrh'

for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes(REF_DEV)) {
  console.error(`No es dev (${url}). No hago nada.`)
  process.exit(1)
}
process.env.GASTOS_FUDO_SYNC = 'on'

const supabase = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const accion = process.argv[2]
  if (accion === 'reiniciar') {
    const { count, error } = await supabase.from('gastos').delete({ count: 'exact' }).eq('origen', 'fudo')
    if (error) throw error
    const s = await supabase.from('gastos_fudo_sync').delete({ count: 'exact' }).not('id', 'is', null)
    if (s.error) throw s.error
    console.log(`Borrados ${count} gastos de Fudo y ${s.count} registros de sincronización.`)
    return
  }
  if (accion === 'sincronizar') {
    // Import tardío: lib/fudo lee las credenciales de process.env, ya cargado.
    const { sincronizarFudo } = await import('../lib/gastos/fudoSync')
    const t0 = Date.now()
    const r = await sincronizarFudo(supabase, { origen: 'script' })
    for (const l of r.locales) console.log(`${l.local}: ${l.ok ? JSON.stringify(l.resumen) : `ERROR ${l.error}`}`)
    console.log(`(${Date.now() - t0} ms)`)
    return
  }
  console.log('Uso: npx tsx scripts/gastos-fudo-dev.ts sincronizar | reiniciar')
}

main().catch(e => { console.error(e); process.exit(1) })
