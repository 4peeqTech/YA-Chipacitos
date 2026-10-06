'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { normalizarTelefonoAR } from '@/lib/compras/telefono'
import type { Json } from '@/lib/database.types'

// B3: Proveedores escribe solo por RPC (proveedores_guardar, proveedores_archivar,
// proveedores_eliminar; proveedores_impacto para los diálogos). La autorización
// y las reglas las hace la RPC; acá se valida lo mismo para responder rápido y
// en español. Si la RPC rechaza también se refresca: casi siempre es que otra
// persona cambió algo mientras tanto.

const texto = (max: number, campo: string) =>
  z.string().trim().max(max, `${campo} es demasiado largo.`).nullable()

const Datos = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'El nombre es demasiado largo.'),
  categoria: texto(80, 'La categoría'),
  cuit: texto(20, 'El CUIT'),
  contactoNombre: texto(120, 'El contacto'),
  contactoTelefono: z.string().trim().max(40, 'El teléfono es demasiado largo.').nullable(),
  contactoEmail: z.union([z.literal(''), z.email('El email de contacto no parece válido.')]).nullable(),
  direccion: texto(200, 'La dirección'),
  tiempoEntrega: texto(80, 'El tiempo de entrega'),
  periodicidadCompra: texto(80, 'La periodicidad'),
  financiacion: texto(80, 'La financiación'),
  condicionesPago: texto(120, 'Las condiciones de pago'),
  notas: texto(1000, 'Las notas'),
  manejaStock: z.boolean(),
  localFacturacionId: z.uuid().nullable(),
}).partial().strict()

export type DatosProveedor = z.input<typeof Datos>

const Guardar = z.object({ id: z.uuid().nullable(), datos: Datos })

// camelCase → columnas de proveedores. Solo viajan las claves presentes.
const COLUMNA: Record<keyof z.infer<typeof Datos>, string> = {
  nombre: 'nombre',
  categoria: 'categoria',
  cuit: 'cuit',
  contactoNombre: 'contacto_nombre',
  contactoTelefono: 'contacto_telefono',
  contactoEmail: 'contacto_email',
  direccion: 'direccion',
  tiempoEntrega: 'tiempo_entrega',
  periodicidadCompra: 'periodicidad_compra',
  financiacion: 'financiacion',
  condicionesPago: 'condiciones_pago',
  notas: 'notas',
  manejaStock: 'maneja_stock',
  localFacturacionId: 'local_facturacion_id',
}

// Los mensajes por defecto de zod vienen en inglés: solo se muestran los
// propios (todos terminan en punto).
function primerError(e: z.ZodError, fallback: string): string {
  const msg = e.issues[0]?.message
  return msg?.endsWith('.') ? msg : fallback
}

const RespuestaGuardar = z.object({ id: z.string(), cambios: z.boolean() })

export async function guardarProveedor(
  entrada: z.input<typeof Guardar>,
): Promise<Resultado<{ id: string; cambios: boolean }>> {
  const parsed = Guardar.safeParse(entrada)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los datos del proveedor.'))
  const { id, datos } = parsed.data

  // El teléfono se guarda normalizado (lo usa el link de WhatsApp).
  if (datos.contactoTelefono !== undefined) {
    if (datos.contactoTelefono) {
      const normalizado = normalizarTelefonoAR(datos.contactoTelefono)
      if (!normalizado) return fallo(null, 'El teléfono de contacto no parece un número argentino válido.')
      datos.contactoTelefono = normalizado
    } else {
      datos.contactoTelefono = null
    }
  }

  const pDatos: { [columna: string]: Json } = {}
  for (const [k, v] of Object.entries(datos)) {
    if (v !== undefined) pDatos[COLUMNA[k as keyof typeof COLUMNA]] = v as Json
  }

  const fallback = id ? 'No se pudieron guardar los cambios del proveedor.' : 'No se pudo crear el proveedor.'
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('proveedores_guardar', {
      ...(id ? { p_id: id } : {}),
      p_datos: pDatos,
    })
    refresh()
    if (error) return fallo(error, fallback)
    const res = RespuestaGuardar.safeParse(data)
    if (!res.success) return fallo(null, 'Se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, fallback)
  }
}

const ConId = z.object({ id: z.uuid() })

const Impacto = z.object({
  estado: z.enum(['activo', 'archivado']),
  abiertos: z.array(z.object({ id: z.string(), numero: z.number() })),
  principal_de: z.array(z.object({ id: z.string(), nombre: z.string() })),
  pedido_base: z.number(),
  solicitudes_abiertas: z.number(),
  referencias: z.object({
    pedidos: z.number(),
    pedidos_eliminados: z.number(),
    facturas: z.number(),
    gastos: z.number(),
    insumos: z.number(),
    solicitudes: z.number(),
    pedido_base: z.number(),
    historial: z.number(),
  }),
  puede_eliminar: z.boolean(),
})

export type ImpactoProveedor = z.infer<typeof Impacto>

/** Lo que pasaría al archivar o eliminar: arma los diálogos antes de confirmar. */
export async function impactoProveedor(entrada: z.input<typeof ConId>): Promise<Resultado<ImpactoProveedor>> {
  const parsed = ConId.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'No encontramos el proveedor. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('proveedores_impacto', { p_id: parsed.data.id })
    if (error) return fallo(error, 'No pudimos revisar qué tiene este proveedor.')
    const res = Impacto.safeParse(data)
    if (!res.success) return fallo(null, 'No pudimos leer qué tiene este proveedor. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No pudimos revisar qué tiene este proveedor.')
  }
}

const Archivar = z.object({ id: z.uuid(), archivar: z.boolean() })
const RespuestaArchivar = z.object({ cambio: z.boolean(), estado: z.enum(['activo', 'archivado']) })

export async function archivarProveedor(
  entrada: z.input<typeof Archivar>,
): Promise<Resultado<z.infer<typeof RespuestaArchivar>>> {
  const parsed = Archivar.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'No encontramos el proveedor. Recargá la página.')
  const fallback = parsed.data.archivar ? 'No se pudo archivar el proveedor.' : 'No se pudo reactivar el proveedor.'
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('proveedores_archivar', {
      p_id: parsed.data.id,
      p_archivar: parsed.data.archivar,
    })
    refresh()
    if (error) return fallo(error, fallback)
    const res = RespuestaArchivar.safeParse(data)
    if (!res.success) return fallo(null, 'Se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, fallback)
  }
}

export async function eliminarProveedor(entrada: z.input<typeof ConId>): Promise<Resultado<null>> {
  const parsed = ConId.safeParse(entrada)
  if (!parsed.success) return fallo(null, 'No encontramos el proveedor. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('proveedores_eliminar', { p_id: parsed.data.id })
    refresh()
    if (error) return fallo(error, 'No se pudo eliminar el proveedor.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo eliminar el proveedor.')
  }
}
