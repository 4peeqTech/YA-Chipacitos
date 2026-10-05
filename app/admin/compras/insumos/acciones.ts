'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { ALICUOTAS } from '@/lib/compras/totalesFactura'
import type { Json } from '@/lib/database.types'

// A2a: Insumos escribe solo por RPC (compras_guardar_insumo,
// compras_archivar_insumo, compras_eliminar_insumo). La autorización y las
// reglas las hace la RPC; acá se valida lo mismo para responder rápido y en
// español. Si la RPC rechaza también se refresca: casi siempre es que otra
// persona cambió algo mientras tanto.

const numero = z.number().finite()

const Datos = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'El nombre es demasiado largo.'),
  unidad: z.string().trim().min(1, 'La unidad de compra es obligatoria.').max(40, 'La unidad es demasiado larga.'),
  categoriaId: z.uuid().nullable(),
  cantidadPorUnidad: numero.gt(0, 'La cantidad por unidad tiene que ser mayor a 0.'),
  cantidadPorMasa: numero.min(0, 'La cantidad por masa no puede ser negativa.'),
  stockMinimo: numero.min(0, 'El stock mínimo no puede ser negativo.'),
  redondeo: z.enum(['estandar', 'siempre_arriba', 'siempre_abajo', 'sin_calculo']),
  stockMaximo: numero.gt(0, 'El stock máximo tiene que ser mayor a 0, o quedar vacío.').nullable(),
  aDemanda: z.boolean(),
  alicuotaIva: numero.refine(v => (ALICUOTAS as readonly number[]).includes(v), 'Elegí una alícuota de IVA válida.'),
}).partial().strict()

const Proveedor = z.object({
  proveedorId: z.uuid({ message: 'Elegí el proveedor de cada línea.' }),
  esPrincipal: z.boolean(),
  activo: z.boolean(),
  codigo: z.string().trim().max(60, 'El código del proveedor es demasiado largo.').nullable(),
  precioRef: numero.min(0, 'El precio de referencia no puede ser negativo.').nullable(),
  precioRefAnterior: numero.nullable(),
})

const Guardar = z.object({
  itemId: z.uuid().nullable(),
  datos: Datos,
  proveedores: z.array(Proveedor).nullable(),
})

// camelCase → columnas de compras_items. Solo viajan las claves presentes (E1).
const COLUMNA: Record<keyof z.infer<typeof Datos>, string> = {
  nombre: 'nombre',
  unidad: 'unidad',
  categoriaId: 'categoria_id',
  cantidadPorUnidad: 'cantidad_por_unidad',
  cantidadPorMasa: 'cantidad_por_masa',
  stockMinimo: 'stock_minimo',
  redondeo: 'redondeo',
  stockMaximo: 'stock_maximo',
  aDemanda: 'a_demanda',
  alicuotaIva: 'alicuota_iva',
}

// Los mensajes por defecto de zod vienen en inglés: solo se muestran los
// propios (todos terminan en punto).
function primerError(e: z.ZodError, fallback: string): string {
  const msg = e.issues[0]?.message
  return msg?.endsWith('.') ? msg : fallback
}

const RespuestaGuardar = z.object({ item_id: z.string(), cambios: z.number() })

export async function guardarInsumo(
  entrada: z.input<typeof Guardar>,
): Promise<Resultado<{ itemId: string; cambios: number }>> {
  const parsed = Guardar.safeParse(entrada)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los datos del insumo.'))
  const { itemId, datos, proveedores } = parsed.data

  const pDatos: { [columna: string]: Json } = {}
  for (const [k, v] of Object.entries(datos)) {
    if (v !== undefined) pDatos[COLUMNA[k as keyof typeof COLUMNA]] = v as Json
  }
  const pProveedores: Json[] | null = proveedores?.map(p => ({
    proveedor_id: p.proveedorId,
    es_principal: p.esPrincipal,
    activo: p.activo,
    codigo_proveedor: p.codigo || null,
    precio_ref: p.precioRef,
    precio_ref_anterior: p.precioRefAnterior,
  })) ?? null

  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_guardar_insumo', {
      ...(itemId ? { p_item_id: itemId } : {}),
      p_datos: pDatos,
      ...(pProveedores ? { p_proveedores: pProveedores } : {}),
    })
    refresh()
    if (error) return fallo(error, itemId ? 'No se pudo guardar el insumo.' : 'No se pudo crear el insumo.')
    const res = RespuestaGuardar.safeParse(data)
    if (!res.success) return fallo(null, 'Se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({ itemId: res.data.item_id, cambios: res.data.cambios })
  } catch (e) {
    return fallo(e, itemId ? 'No se pudo guardar el insumo.' : 'No se pudo crear el insumo.')
  }
}

const Archivar = z.object({ itemId: z.uuid(), archivar: z.boolean() })

const RespuestaArchivar = z.object({
  estado: z.enum(['activo', 'archivado']),
  borradores_quitados: z.number(),
  listas: z.array(z.string()),
  pedido_base: z.number(),
  stock: z.number(),
})

export interface ResultadoArchivar {
  estado: 'activo' | 'archivado'
  borradoresQuitados: number
  listas: string[]
  pedidoBase: number
  stock: number
}

export async function archivarInsumo(entrada: z.input<typeof Archivar>): Promise<Resultado<ResultadoArchivar>> {
  const parsed = Archivar.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'No encontramos el insumo. Recargá la página.')
  const fallback = parsed.data.archivar ? 'No se pudo archivar el insumo.' : 'No se pudo reactivar el insumo.'
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_archivar_insumo', {
      p_item_id: parsed.data.itemId,
      p_archivar: parsed.data.archivar,
    })
    refresh()
    if (error) return fallo(error, fallback)
    const res = RespuestaArchivar.safeParse(data)
    if (!res.success) return fallo(null, 'Se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok({
      estado: res.data.estado,
      borradoresQuitados: res.data.borradores_quitados,
      listas: res.data.listas,
      pedidoBase: res.data.pedido_base,
      stock: res.data.stock,
    })
  } catch (e) {
    return fallo(e, fallback)
  }
}

const Eliminar = z.object({ itemId: z.uuid() })

export async function eliminarInsumo(entrada: z.input<typeof Eliminar>): Promise<Resultado<{ nombre: string }>> {
  const parsed = Eliminar.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'No encontramos el insumo. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('compras_eliminar_insumo', { p_item_id: parsed.data.itemId })
    refresh()
    if (error) return fallo(error, 'No se pudo eliminar el insumo.')
    const res = z.object({ nombre: z.string() }).safeParse(data)
    return ok({ nombre: res.success ? res.data.nombre : '' })
  } catch (e) {
    return fallo(e, 'No se pudo eliminar el insumo.')
  }
}
