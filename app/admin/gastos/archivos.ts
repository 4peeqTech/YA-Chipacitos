// Archivos de Gastos en el bucket privado `comprobantes`: el comprobante de un
// pago y los adjuntos del gasto (factura, ticket). Se guarda la ruta y se abre
// con un link firmado al momento. Corre en el navegador (sube directo al bucket).
import { createClient } from '@/lib/supabase/client'
import { BUCKET_COMPROBANTES, rutaComprobante } from '@/lib/gastos/comprobante'

export const MAX_MB_ARCHIVO = 10
export const TIPOS_ARCHIVO = 'image/jpeg,image/png,image/webp,application/pdf'

export interface ArchivoSubido { ruta: string; nombre: string; tipo: string | null; tamano: number }

/** `carpeta`: el id del gasto (o una clave única si todavía no existe). */
export async function subirArchivoGasto(carpeta: string, archivo: File, tipo: 'pago' | 'adjunto'): Promise<ArchivoSubido> {
  const ext = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const dir = carpeta.replace(/[^a-zA-Z0-9_-]/g, '_')
  const ruta = `gastos/${dir}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await createClient().storage.from(BUCKET_COMPROBANTES).upload(ruta, archivo, { upsert: false })
  if (error) throw error
  return { ruta, nombre: archivo.name, tipo: archivo.type || null, tamano: archivo.size }
}

/** Si falla no importa: el registro ya se borró y el archivo queda huérfano. */
export async function borrarArchivoGasto(ruta: string): Promise<void> {
  await createClient().storage.from(BUCKET_COMPROBANTES).remove([ruta]).catch(() => {})
}

/**
 * Abre el archivo en otra pestaña con un link firmado. La pestaña se abre en el
 * click (después del await el navegador la bloquearía). Devuelve false si falló.
 */
export async function abrirArchivoGasto(valor: string): Promise<boolean> {
  const ruta = rutaComprobante(valor)
  if (!ruta) return false
  const pestana = window.open('', '_blank')
  const { data, error } = await createClient().storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta, 60)
  if (error || !data?.signedUrl) {
    pestana?.close()
    return false
  }
  if (pestana) pestana.location.href = data.signedUrl
  else window.location.href = data.signedUrl
  return true
}
