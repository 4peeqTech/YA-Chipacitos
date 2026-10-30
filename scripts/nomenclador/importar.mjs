// Carga inicial del nomenclador desde la depuración del Excel de Marcos (T2).
//
//   node scripts/nomenclador/importar.mjs            -> dev (lo que diga .env.local)
//   node scripts/nomenclador/importar.mjs --prod     -> prod (solo si .env apunta a prod)
//
// Lee los CSV de docs/nomenclador/fuentes/ (fuera de git: el repo es público):
// sabores.csv, presentaciones.csv, items.csv y externos.csv, que arma
// fuentes/armar_depuracion.py a partir del Excel.
//
// Es re-ejecutable y no pisa lo que se editó en la app: crea solo lo que falta
// (ítems por clave_importacion, externos por sistema+código, parámetros por
// nombre) y a un código externo solo le asigna ítem si todavía no tenía. Todo
// lo que crea queda "a revisar". Usa la service role, así que las reglas que
// valen son las de los triggers (código, tipos, ciclos).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'ahlpthzsjipdpcnjbfdk'
const args = process.argv.slice(2)
const quiereProd = args.includes('--prod')
const DIR = resolve('docs/nomenclador/fuentes')

process.loadEnvFile(resolve('.env.local'))
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) salir('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.')
const ref = new URL(url).hostname.split('.')[0]
if (ref === PROD_REF && !quiereProd) salir(`.env.local apunta a PROD (${ref}). Para cargar en prod pasá --prod.`)
if (quiereProd && ref !== PROD_REF) salir(`Pasaste --prod pero .env.local apunta a ${ref}, no a prod.`)
console.log(`Destino: ${ref}${ref === PROD_REF ? ' (PROD)' : ''}`)

const db = createClient(url, key, { auth: { persistSession: false } })

function salir(msg) {
  console.error(msg)
  process.exit(1)
}

// CSV con comillas (RFC 4180), primera fila = encabezados.
function leerCsv(nombre) {
  const texto = readFileSync(resolve(DIR, nombre), 'utf8').replace(/^﻿/, '')
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  const [enc, ...datos] = filas.filter(f => f.some(v => v !== ''))
  return datos.map(f => Object.fromEntries(enc.map((h, i) => [h, f[i] ?? ''])))
}

const lista = s => (s ? s.split('|').map(x => x.trim()).filter(Boolean) : [])
const clave = s => s.trim().toLowerCase()

async function q(promesa, que) {
  const { data, error } = await promesa
  if (error) salir(`Error al ${que}: ${error.message}`)
  return data
}

// Busca por nombre (sin distinguir mayúsculas) y crea lo que falta.
async function parametros(tabla, filas, armar) {
  const existentes = await q(db.from(tabla).select('id, nombre'), `leer ${tabla}`)
  const ids = new Map(existentes.map(r => [clave(r.nombre), r.id]))
  let creados = 0
  for (const f of filas) {
    if (ids.has(clave(f.nombre))) continue
    const r = await q(db.from(tabla).insert(armar(f)).select('id').single(), `crear ${tabla} "${f.nombre}"`)
    ids.set(clave(f.nombre), r.id)
    creados++
  }
  console.log(`${tabla}: ${creados} creados, ${filas.length - creados} ya estaban`)
  return ids
}

const sabores = leerCsv('sabores.csv')
const presentaciones = leerCsv('presentaciones.csv')
const items = leerCsv('items.csv')
const externos = leerCsv('externos.csv')

const saborId = await parametros('nomenclador_sabores', sabores, f => ({
  nombre: f.nombre, nombres_alternativos: lista(f.nombres_alternativos), orden: Number(f.orden) || 0,
}))
const presId = await parametros('nomenclador_presentaciones', presentaciones, f => ({
  nombre: f.nombre, cantidad: f.cantidad ? Number(f.cantidad) : null, unidad: f.unidad || null, orden: Number(f.orden) || 0,
}))

// Categorías en el orden en que aparecen; el tipo solo si todos sus ítems son del mismo.
const cats = []
for (const it of items) {
  const c = cats.find(x => x.nombre === it.categoria)
  if (!c) cats.push({ nombre: it.categoria, tipos: new Set([it.tipo]) })
  else c.tipos.add(it.tipo)
}
const catId = await parametros('nomenclador_categorias', cats.map((c, i) => ({ ...c, orden: i + 1 })), c => ({
  nombre: c.nombre, tipo: c.tipos.size === 1 ? [...c.tipos][0] : null, orden: c.orden,
}))

// Ítems: primero los que no son variante de otro, después las presentaciones.
const existentes = await q(
  db.from('nomenclador_items').select('id, clave_importacion').not('clave_importacion', 'is', null),
  'leer ítems')
const itemId = new Map(existentes.map(r => [r.clave_importacion, r.id]))
const nuevos = new Set()
for (const pasada of [false, true]) {
  for (const it of items.filter(i => Boolean(i.variante_de) === pasada)) {
    if (itemId.has(it.clave)) continue
    const fila = {
      clave_importacion: it.clave,
      tipo: it.tipo,
      nombre: it.nombre,
      nombres_alternativos: lista(it.nombres_alternativos),
      categoria_id: it.categoria ? catId.get(clave(it.categoria)) : null,
      sabor_id: it.sabor ? saborId.get(clave(it.sabor)) ?? salir(`Sabor desconocido: ${it.sabor}`) : null,
      presentacion_id: it.presentacion ? presId.get(clave(it.presentacion)) ?? salir(`Presentación desconocida: ${it.presentacion}`) : null,
      variante_de: it.variante_de ? itemId.get(it.variante_de) ?? salir(`Producto base desconocido: ${it.variante_de}`) : null,
      unidad_base: it.unidad_base || null,
      notas: it.notas || null,
      a_revisar: true,
    }
    const r = await q(db.from('nomenclador_items').insert(fila).select('id').single(), `crear el ítem "${it.nombre}"`)
    itemId.set(it.clave, r.id)
    nuevos.add(it.clave)
  }
}
console.log(`nomenclador_items: ${nuevos.size} creados, ${items.length - nuevos.size} ya estaban`)

// Composición de las presentaciones nuevas: producto base × cantidad, cuando la
// unidad de la presentación coincide con la del producto base. Las recetas no
// se cargan (se completan con Marcos).
const porClave = new Map(items.map(i => [i.clave, i]))
const presPorNombre = new Map(presentaciones.map(p => [clave(p.nombre), p]))
let compuestos = 0
for (const c of nuevos) {
  const it = porClave.get(c)
  if (!it.variante_de || !it.presentacion) continue
  const p = presPorNombre.get(clave(it.presentacion))
  if (!p.cantidad || p.unidad !== porClave.get(it.variante_de).unidad_base) continue
  await q(db.from('nomenclador_componentes').insert({
    item_id: itemId.get(c), componente_id: itemId.get(it.variante_de),
    cantidad: Number(p.cantidad), unidad: p.unidad, orden: 1,
  }), `componer "${it.nombre}"`)
  compuestos++
}
console.log(`nomenclador_componentes: ${compuestos} presentaciones compuestas`)

// Códigos externos.
const extExist = await q(db.from('nomenclador_externos').select('id, sistema, codigo, item_id'), 'leer externos')
const extPor = new Map(extExist.map(e => [`${e.sistema}:${e.codigo}`, e]))
let extCreados = 0, extAsignados = 0
for (const e of externos) {
  const destino = e.clave_item ? itemId.get(e.clave_item) ?? salir(`Ítem desconocido para ${e.sistema} ${e.codigo}: ${e.clave_item}`) : null
  const ya = extPor.get(`${e.sistema}:${e.codigo}`)
  if (!ya) {
    await q(db.from('nomenclador_externos').insert({
      sistema: e.sistema, codigo: e.codigo, nombre: e.nombre, item_id: destino,
      origen: 'excel_marcos', activo: e.activo !== 'false', notas: e.notas || null,
    }), `crear el código ${e.sistema} ${e.codigo}`)
    extCreados++
  } else if (!ya.item_id && destino) {
    await q(db.from('nomenclador_externos').update({ item_id: destino, updated_at: new Date().toISOString() })
      .eq('id', ya.id), `asignar el código ${e.sistema} ${e.codigo}`)
    extAsignados++
  }
}
const sinMapear = externos.filter(e => !e.clave_item && e.activo !== 'false').length
console.log(`nomenclador_externos: ${extCreados} creados, ${extAsignados} asignados; en el CSV: ` +
  `${externos.length - sinMapear - externos.filter(e => e.activo === 'false').length} mapeados, ` +
  `${sinMapear} sin mapear, ${externos.filter(e => e.activo === 'false').length} descartados`)
