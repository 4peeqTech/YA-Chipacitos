'use server'

import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { cargarComprobante } from '@/lib/compras/cargarComprobante'
import type { DatosComprobante } from '@/lib/compras/comprobanteFactura'

// Aparte de acciones.ts (que es de A2b) para no chocar. Solo lee: el mensaje
// no se guarda ni deja eventos (B2, E4).

export interface PlantillaFactura {
  id: string
  nombre: string
  cuerpo: string
  es_default: boolean
}

export interface DatosCompartir {
  comprobante: DatosComprobante
  plantillas: PlantillaFactura[]
  whatsappAdmin: string | null
}

/** Valor de compras_config `factura.whatsapp_admin`, normalizado; null si falta o no es válido. */
function leerWhatsapp(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const n = valor.replace(/[^\d]/g, '')
  return n.length >= 10 && n.length <= 15 ? n : null
}

export async function datosCompartirFactura(facturaId: string): Promise<Resultado<DatosCompartir>> {
  const id = z.uuid().safeParse(facturaId)
  if (!id.success) return fallo(null, 'La factura no existe')
  try {
    const supabase = await createClientTipado()
    const r = await cargarComprobante(supabase, id.data)
    if (!r.ok) return fallo(null, r.error)

    const [plantillas, config] = await Promise.all([
      supabase
        .from('compras_plantillas_mensaje')
        .select('id, nombre, cuerpo, es_default')
        .eq('tipo', 'factura')
        .eq('activo', true)
        .order('orden'),
      supabase.from('compras_config').select('valor').eq('clave', 'factura.whatsapp_admin').maybeSingle(),
    ])
    if (plantillas.error) return fallo(plantillas.error, 'No se pudieron leer las plantillas.')

    return ok({
      comprobante: r.data,
      plantillas: plantillas.data ?? [],
      whatsappAdmin: leerWhatsapp(config.data?.valor),
    })
  } catch (e) {
    return fallo(e, 'No se pudo preparar la factura para compartir.')
  }
}
