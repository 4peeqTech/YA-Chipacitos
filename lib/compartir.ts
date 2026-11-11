// Helpers para compartir desde el navegador: WhatsApp, portapapeles y
// archivos. Los de imagen tocan `navigator`/`window`: llamarlos solo del lado
// del cliente (en un handler o un efecto, no durante el render del servidor).

export function linkWhatsApp(telefono: string | null, mensaje: string): string {
  const texto = encodeURIComponent(mensaje)
  const numero = telefono ? telefono.replace(/[^\d]/g, '') : ''
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://api.whatsapp.com/send?text=${texto}`
}

/** Solo los dígitos: "+54 9 351 123-4567" → "5493511234567". */
export function normalizarTelefono(s: string): string {
  return s.replace(/[^\d]/g, '')
}

/** Vacío (WhatsApp sin número) o entre 10 y 15 dígitos, con código de país. */
export function telefonoValido(s: string): boolean {
  const n = normalizarTelefono(s)
  return n === '' || (n.length >= 10 && n.length <= 15)
}

export function puedeCompartirArchivos(file: File): boolean {
  return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] })
}

export function puedeCopiarImagen(): boolean {
  return typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard?.write
}

export function copiarImagen(blob: Blob): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Diferido: Safari cancela la descarga si el objectURL se revoca en el mismo tick.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
