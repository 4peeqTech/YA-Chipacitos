// Chequeo de las reglas de los editores de Roles y de la ficha (épica roles, T5/T6).
// Correr con: npx tsx lib/permisos/_check_editor.ts
import { ACCIONES, clavePantalla } from './catalogo'
import { ajustesMinimos, resolverAcceso } from './resolver'
import { accionesVisibles, alternar, normalizar, problemaAlGuardar, seccionesPantallas } from './editor'

let fallos = 0
function igual(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`${ok ? 'OK ' : 'MAL'} ${nombre}${ok ? '' : ` → ${JSON.stringify(real)} (esperado ${JSON.stringify(esperado)})`}`)
}

const p = clavePantalla
const claves = (s: Set<string>) => [...s].sort()

// Qué se muestra según las áreas
const conAdmin = seccionesPantallas(['administracion'])
igual('Generales va primero', conAdmin[0].nombre, 'Generales')
igual('Fábrica y Proveedores van plegadas', conAdmin.filter(s => s.plegada).map(s => s.nombre).sort(), ['Fábrica', 'Proveedores'])
igual('las pantallas ocultas (Facturas) no se listan', conAdmin.flatMap(s => s.pantallas).some(x => x.clave === p('compras-facturas')), false)
igual('sin Administración solo queda Tareas', seccionesPantallas(['locales']).flatMap(s => s.pantallas.map(x => x.clave)), [p('tareas')])
igual('Corregir cargas viejas solo con Fábrica',
  [accionesVisibles(['administracion']).some(a => a.clave === ACCIONES.corregirCargasFabrica), accionesVisibles(['fabrica']).some(a => a.clave === ACCIONES.corregirCargasFabrica)],
  [false, true])
igual('acciones de Compras solo con Administración', accionesVisibles(['locales']).map(a => a.clave).sort(), [ACCIONES.gestionarUsuarios, ACCIONES.verTodasLasTareas].sort())

// Facturas va con Ver la plata
igual('tildar Facturas tilda Ver la plata', claves(alternar(new Set(), ACCIONES.facturasCompras)), [ACCIONES.facturasCompras, ACCIONES.verPlataCompras].sort())
igual('destildar Ver la plata destilda Facturas', claves(alternar(new Set([ACCIONES.facturasCompras, ACCIONES.verPlataCompras]), ACCIONES.verPlataCompras)), [])
igual('destildar Facturas deja Ver la plata', claves(alternar(new Set([ACCIONES.facturasCompras, ACCIONES.verPlataCompras]), ACCIONES.facturasCompras)), [ACCIONES.verPlataCompras])
igual('problema: Facturas sin Ver la plata', problemaAlGuardar(new Set([ACCIONES.facturasCompras])) !== null, true)
igual('sin problema con las dos', problemaAlGuardar(new Set([ACCIONES.facturasCompras, ACCIONES.verPlataCompras])), null)

// Normalizar: solo Admin y áreas ajenas afuera
igual('normalizar saca solo Admin y áreas que no tiene',
  normalizar([p('gastos'), p('proveedores'), ACCIONES.corregirCargasFabrica, p('tareas'), 'pantalla:no_existe'], ['administracion']),
  [p('gastos'), p('tareas')])

// Ficha (opción B): tildes efectivos → ajustes mínimos → mismo acceso
const rol = [p('gastos'), p('resumen'), p('tareas')]
const tildes = [p('gastos'), p('tareas'), p('posberry'), ACCIONES.verTodasLasTareas]
const ajustes = ajustesMinimos(rol, tildes)
igual('ficha: un agregar y un quitar', ajustes, [
  { permiso: p('posberry'), efecto: 'agregar' }, { permiso: ACCIONES.verTodasLasTareas, efecto: 'agregar' }, { permiso: p('resumen'), efecto: 'quitar' },
])
igual('ficha: los ajustes reconstruyen los tildes',
  claves(resolverAcceso({ esAdmin: false, rolAreas: ['administracion'], rolPermisos: rol, ajustes, sucursales: [] }).permisos), [...tildes].sort())
igual('ficha: "Volver al rol" en todo = sin ajustes', ajustesMinimos(rol, rol), [])

if (fallos) { console.error(`\n${fallos} fallos`); process.exit(1) }
console.log('\nTodos los casos OK')
