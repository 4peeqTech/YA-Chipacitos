// Comprobantes de pago en el bucket privado `comprobantes` (solo lo leen los
// admins). En gastos.comprobante_url se guarda la ruta del archivo; los
// registros viejos tienen la URL pública completa, que con el bucket privado no
// abre: de las dos se saca la ruta y se pide un link firmado al momento.

export const BUCKET_COMPROBANTES = 'comprobantes'

const MARCA = `/${BUCKET_COMPROBANTES}/`

/** La ruta dentro del bucket, venga como ruta o como URL (pública o firmada). */
export function rutaComprobante(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) return v.replace(/^\/+/, '')
  const i = v.indexOf(MARCA)
  if (i < 0) return null
  return decodeURIComponent(v.slice(i + MARCA.length).split('?')[0]) || null
}
