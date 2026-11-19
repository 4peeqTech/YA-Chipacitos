// Compara, persona por persona, el acceso de antes (rol + modulos_permitidos)
// con el del modelo nuevo (épica roles y permisos, T1). Sale con código 1 si
// alguien gana o pierde un área o una pantalla.
//
//   npm run permisos:comparar                          base de dev (QA), tablas ya migradas
//   npm run permisos:comparar -- --remote <ref>        otra base (prod: ahlpthzsjipdpcnjbfdk)
//   npm run permisos:comparar -- --ensayo <migración>  corre la migración y deshace (begin … rollback):
//                                                      sirve contra prod antes de aplicarla
//
// Usa la CLI de Supabase (`supabase db query`, con la sesión de la máquina).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CATALOGO, esArea, type Area } from '../lib/permisos/catalogo'
import { resolverAcceso, type AjustePersona } from '../lib/permisos/resolver'
import { accesoSegunReglaVieja, comparable, diferencias } from '../lib/permisos/equivalencia'

const DEV = 'fafckqysyvtlslfnpzrh'
const args = process.argv.slice(2)
const valor = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const remote = valor('--remote') ?? DEV
const migracion = valor('--ensayo')

const CONSULTA = `
select json_build_object(
  'personas', (select json_agg(json_build_object('id', id, 'nombre', nombre, 'rol', rol, 'estado', estado, 'modulos', coalesce(modulos_permitidos, '{}'))) from profiles where rol is not null),
  'rol_areas', (select coalesce(json_agg(json_build_object('rol', rol_key, 'area', area)), '[]') from rol_areas),
  'rol_permisos', (select coalesce(json_agg(json_build_object('rol', rol_key, 'permiso', permiso)), '[]') from rol_permisos),
  'ajustes', (select coalesce(json_agg(json_build_object('persona', persona_id, 'permiso', permiso, 'efecto', efecto)), '[]') from persona_permisos),
  'sucursales', (select coalesce(json_agg(json_build_object('persona', persona_id, 'local', local_config_id)), '[]') from persona_sucursales),
  'cuentas', (select coalesce(json_agg(json_build_object('local', id, 'cuenta', cuenta_local_id)), '[]') from locales_config where cuenta_local_id is not null),
  'catalogo', (select json_agg(json_build_object('clave', clave, 'tipo', tipo, 'area', area, 'nombre', nombre, 'solo_admin', (to_jsonb(c) ->> 'solo_admin')::boolean)) from permisos_catalogo c)
) as r;`

interface Datos {
  personas: { id: string; nombre: string; rol: string; estado: string; modulos: string[] }[]
  rol_areas: { rol: string; area: string }[]
  rol_permisos: { rol: string; permiso: string }[]
  ajustes: { persona: string; permiso: string; efecto: AjustePersona['efecto'] }[]
  sucursales: { persona: string; local: string }[]
  cuentas: { local: string; cuenta: string }[]
  /** solo_admin: null en una base sin la migración de los editores (T5/T6). */
  catalogo: { clave: string; tipo: string; area: string | null; nombre: string; solo_admin: boolean | null }[]
}

function consultar(): Datos {
  const dir = mkdtempSync(join(tmpdir(), 'permisos-'))
  const archivo = join(dir, 'consulta.sql')
  const sql = migracion
    ? `begin;\n${readFileSync(migracion, 'utf8')}\n${CONSULTA}\nrollback;\n`
    : CONSULTA
  writeFileSync(archivo, sql)
  const cli = ['db', 'query', `--remote=${remote}`, '-f', archivo, ...(migracion ? ['--yes'] : ['--read-only'])]
  const salida = execFileSync('supabase', cli, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const json = JSON.parse(salida.slice(salida.indexOf('{'), salida.lastIndexOf('}') + 1))
  if (!json.rows) throw new Error(`La consulta falló:\n${salida.slice(-1500)}`)
  return json.rows[0].r as Datos
}

const d = consultar()
const problemas: string[] = []

// El catálogo de la base es el de lib/permisos/catalogo.ts.
const enBase = new Map(d.catalogo.map(c => [c.clave, c]))
for (const c of CATALOGO) {
  const b = enBase.get(c.clave)
  if (!b) problemas.push(`catálogo: falta ${c.clave} en la base`)
  else if (b.tipo !== c.tipo || (b.area ?? null) !== c.area || b.nombre !== c.nombre) problemas.push(`catálogo: ${c.clave} distinto en la base`)
  else if (b.solo_admin !== null && b.solo_admin !== (c.soloAdmin === true)) problemas.push(`catálogo: ${c.clave} con otra marca "solo Admin" en la base`)
}
for (const b of d.catalogo) if (!CATALOGO.some(c => c.clave === b.clave)) problemas.push(`catálogo: ${b.clave} sobra en la base`)

const agrupar = <T, K>(lista: T[], clave: (x: T) => K) => {
  const m = new Map<K, T[]>()
  for (const x of lista) m.set(clave(x), [...(m.get(clave(x)) ?? []), x])
  return m
}
const areasDe = agrupar(d.rol_areas, x => x.rol)
const permisosDe = agrupar(d.rol_permisos, x => x.rol)
const ajustesDe = agrupar(d.ajustes, x => x.persona)
const sucursalesDe = agrupar(d.sucursales, x => x.persona)
const cuentaDeLocal = new Map(d.cuentas.map(c => [c.local, c.cuenta]))

let revisadas = 0
for (const p of d.personas) {
  revisadas++
  const acceso = resolverAcceso({
    esAdmin: p.rol === 'admin',
    rolAreas: (areasDe.get(p.rol) ?? []).map(x => x.area).filter(esArea) as Area[],
    rolPermisos: (permisosDe.get(p.rol) ?? []).map(x => x.permiso),
    ajustes: (ajustesDe.get(p.id) ?? []).map(x => ({ permiso: x.permiso, efecto: x.efecto })),
    sucursales: (sucursalesDe.get(p.id) ?? []).map(x => x.local),
  })
  const difs = diferencias(accesoSegunReglaVieja(p.rol, p.modulos), comparable(acceso))
  for (const x of difs) problemas.push(`${p.nombre} (${p.rol}, ${p.estado}): ${x}`)

  // Una cuenta de local ve hoy sus pedidos (local_id = su id): tiene que tener esa sucursal.
  if (p.rol === 'local' && !acceso.sucursales.some(s => cuentaDeLocal.get(s) === p.id)) {
    problemas.push(`${p.nombre} (local): sin la sucursal de su cuenta`)
  }
}

console.log(`${migracion ? 'Ensayo' : 'Base'} ${remote}: ${revisadas} personas, ${d.catalogo.length} permisos en el catálogo.`)
if (problemas.length) {
  console.error(`\n${problemas.length} diferencias:\n- ${problemas.join('\n- ')}`)
  process.exit(1)
}
console.log('Sin diferencias: nadie gana ni pierde acceso.')
