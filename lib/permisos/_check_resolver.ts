// Chequeo del resolver de permisos (épica roles, T1). Correr con: npx tsx lib/permisos/_check_resolver.ts
import { MODULOS } from '@/lib/modulos'
import { ACCIONES, CATALOGO, clavePantalla } from './catalogo'
import { ajustesMinimos, resolverAcceso, type EntradaAcceso } from './resolver'
import { accesoSegunReglaVieja, comparable, diferencias } from './equivalencia'

let fallos = 0
function igual(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`${ok ? 'OK ' : 'MAL'} ${nombre}${ok ? '' : ` → ${JSON.stringify(real)} (esperado ${JSON.stringify(esperado)})`}`)
}

const p = clavePantalla
const base: EntradaAcceso = { esAdmin: false, rolAreas: [], rolPermisos: [], ajustes: [], sucursales: [] }
const permisos = (e: EntradaAcceso) => [...resolverAcceso(e).permisos].sort()

// Catálogo
igual('catálogo sin claves repetidas', new Set(CATALOGO.map(x => x.clave)).size, CATALOGO.length)
igual('cada módulo de MODULOS es una pantalla', MODULOS.every(m => CATALOGO.some(x => x.clave === p(m.key))), true)
igual('cinco acciones v1', CATALOGO.filter(x => x.tipo === 'accion').length, 5)

// Resolver
igual('defaults del rol', permisos({ ...base, rolAreas: ['administracion'], rolPermisos: [p('gastos'), p('tareas')] }), [p('gastos'), p('tareas')])
igual('agregar suma', permisos({ ...base, rolAreas: ['administracion'], rolPermisos: [p('gastos')], ajustes: [{ permiso: p('resumen'), efecto: 'agregar' }] }), [p('gastos'), p('resumen')])
igual('quitar saca un default', permisos({ ...base, rolAreas: ['administracion'], rolPermisos: [p('gastos'), p('resumen')], ajustes: [{ permiso: p('resumen'), efecto: 'quitar' }] }), [p('gastos')])
igual('pantalla de un área que no tiene no cuenta', permisos({ ...base, rolAreas: ['fabrica'], rolPermisos: [p('gastos')] }), [])
igual('Tareas es transversal', permisos({ ...base, rolAreas: ['locales'], ajustes: [{ permiso: p('tareas'), efecto: 'agregar' }] }), [p('tareas')])
igual('acción de Fábrica con el área', permisos({ ...base, rolAreas: ['fabrica'], rolPermisos: [ACCIONES.corregirCargasFabrica] }), [ACCIONES.corregirCargasFabrica])
igual('acción de Fábrica sin el área no cuenta', permisos({ ...base, rolAreas: ['locales'], rolPermisos: [ACCIONES.corregirCargasFabrica] }), [])
igual('clave fuera del catálogo no cuenta', permisos({ ...base, rolAreas: ['administracion'], rolPermisos: ['pantalla:fudo'] }), [])
igual('la persona no suma áreas', resolverAcceso({ ...base, rolAreas: ['locales'], ajustes: [{ permiso: p('gastos'), efecto: 'agregar' }] }).areas, ['locales'])
const admin = resolverAcceso({ ...base, esAdmin: true, rolAreas: ['administracion', 'locales', 'deposito', 'fabrica'] })
igual('admin: todo el catálogo', admin.permisos.size, CATALOGO.length)
igual('admin: un "quitar" no lo afecta', resolverAcceso({ ...base, esAdmin: true, rolAreas: ['administracion'], ajustes: [{ permiso: p('gastos'), efecto: 'quitar' }] }).permisos.has(p('gastos')), true)

// Ajustes mínimos: ida y vuelta
const rolDefaults = [p('gastos'), p('tareas')]
const deseados = [p('tareas'), p('resumen'), p('posberry')]
const ajustes = ajustesMinimos(rolDefaults, deseados)
igual('ajustes mínimos', ajustes, [
  { permiso: p('posberry'), efecto: 'agregar' }, { permiso: p('resumen'), efecto: 'agregar' }, { permiso: p('gastos'), efecto: 'quitar' },
])
igual('ajustes mínimos reconstruyen lo deseado', permisos({ ...base, rolAreas: ['administracion'], rolPermisos: rolDefaults, ajustes }), [...deseados].sort())

// Equivalencia con la regla vieja
const viejoSquad = accesoSegunReglaVieja('squad', ['tareas', 'gastos', 'proveedores', 'fudo'])
igual('regla vieja: roles con módulos ignoran soloAdmin y claves viejas', viejoSquad, { areas: ['administracion'], pantallas: [p('gastos'), p('tareas')] })
igual('regla vieja: operativo solo cuenta Tareas', accesoSegunReglaVieja('supervisor_fabrica', ['dashboard', 'tareas']), { areas: ['fabrica'], pantallas: [p('tareas')] })
const nuevoSquad = resolverAcceso({ ...base, rolAreas: ['administracion'], rolPermisos: [p('tareas')], ajustes: [{ permiso: p('gastos'), efecto: 'agregar' }] })
igual('equivalentes: sin diferencias', diferencias(viejoSquad, comparable(nuevoSquad)), [])
igual('diferencias legibles', diferencias(viejoSquad, comparable(resolverAcceso({ ...base, rolAreas: ['administracion'], rolPermisos: [p('tareas')] }))), [`pierde pantallas: ${p('gastos')}`])
igual('admin viejo = admin nuevo', diferencias(accesoSegunReglaVieja('admin', []), comparable(admin)), [])

if (fallos) { console.error(`\n${fallos} fallos`); process.exit(1) }
console.log('\nTodos los casos OK')
