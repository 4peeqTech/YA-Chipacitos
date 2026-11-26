// Chequeo del fetch de solo lectura de "Ver como" (épica roles, T7).
// Correr con: npx tsx lib/permisos/_check_verComo.ts
import { fetchSoloLectura } from './verComo'

let fallos = 0
function igual(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`${ok ? 'OK ' : 'MAL'} ${nombre}${ok ? '' : ` → ${JSON.stringify(real)} (esperado ${JSON.stringify(esperado)})`}`)
}

const B = 'https://x.supabase.co'
let llamadas: string[] = []
let listaFalla = false
const base: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const metodo = (init?.method ?? 'GET').toUpperCase()
  llamadas.push(`${metodo} ${url.replace(B, '')}`)
  if (url.endsWith('/rest/v1/rpc/rpc_de_lectura')) {
    return listaFalla ? new Response('x', { status: 500 }) : Response.json(['mi_acceso', 'gastos_listar'])
  }
  return Response.json({ ok: true })
}

let activo = false
const f = fetchSoloLectura(base, () => activo)
const estado = async (url: string, metodo = 'POST') => (await f(B + url, { method: metodo, headers: { apikey: 'k', Authorization: 'Bearer t' } })).status

async function main() {
  igual('sin ver como: escribe', await estado('/rest/v1/gastos'), 200)
  activo = true
  igual('GET a una tabla: pasa', await estado('/rest/v1/gastos?select=*', 'GET'), 200)
  igual('POST a una tabla: no', await estado('/rest/v1/gastos'), 403)
  igual('PATCH a una tabla: no', await estado('/rest/v1/gastos?id=eq.1', 'PATCH'), 403)
  igual('DELETE a una tabla: no', await estado('/rest/v1/gastos?id=eq.1', 'DELETE'), 403)
  igual('RPC de lectura: pasa', await estado('/rest/v1/rpc/gastos_listar'), 200)
  igual('RPC que escribe: no', await estado('/rest/v1/rpc/gastos_guardar'), 403)
  igual('la lista se pide una sola vez', llamadas.filter(l => l.includes('rpc_de_lectura')).length, 1)
  igual('refrescar la sesión: pasa', await estado('/auth/v1/token?grant_type=refresh_token'), 200)
  igual('cerrar sesión: pasa', await estado('/auth/v1/logout'), 200)
  igual('cambiar email o contraseña: no', await estado('/auth/v1/user', 'PUT'), 403)
  igual('subir a storage: no', await estado('/storage/v1/object/adjuntos/a.pdf'), 403)
  igual('link firmado para ver un adjunto: pasa', await estado('/storage/v1/object/sign/adjuntos/a.pdf'), 200)
  igual('edge functions: no', await estado('/functions/v1/algo'), 403)
  const r = await f(B + '/rest/v1/rpc/gastos_guardar', { method: 'POST' })
  igual('el error trae el mensaje para mostrar', ((await r.json()) as { message: string }).message.startsWith('Estás viendo como'), true)

  // Si la lista no se puede leer, no deja pasar ninguna RPC y la vuelve a pedir después.
  llamadas = []; listaFalla = true
  const g = fetchSoloLectura(base, () => true)
  igual('sin lista: RPC bloqueada', (await g(B + '/rest/v1/rpc/mi_acceso', { method: 'POST' })).status, 403)
  listaFalla = false
  igual('reintenta la lista y pasa', (await g(B + '/rest/v1/rpc/mi_acceso', { method: 'POST' })).status, 200)
  igual('la pidió dos veces', llamadas.filter(l => l.includes('rpc_de_lectura')).length, 2)

  if (fallos) { console.error(`\n${fallos} fallos`); process.exit(1) }
  console.log('\nTodos los casos OK')
}
main()
