// Normaliza teléfonos argentinos a formato internacional para wa.me
// (549 + característica + número, sin 0 ni 15). Tolera los formatos que
// entran a mano en el ABM de proveedores: espacios, guiones, paréntesis,
// prefijo 0 de larga distancia y el 15 de celular.

export function normalizarTelefonoAR(input: string | null | undefined): string | null {
  if (!input) return null
  let digitos = input.replace(/[^\d]/g, '')
  if (!digitos) return null

  if (digitos.startsWith('54')) digitos = digitos.slice(2)
  if (digitos.startsWith('9')) digitos = digitos.slice(1)
  if (digitos.startsWith('0')) digitos = digitos.slice(1)

  // 0342 15 123456 -> el 15 queda pegado después de la característica, no al inicio
  const conCaracteristica = digitos.match(/^(\d{2,4})15(\d+)$/)
  if (conCaracteristica) digitos = conCaracteristica[1] + conCaracteristica[2]

  if (digitos.length < 10) return null

  return `549${digitos}`
}

export function formatearTelefono(input: string | null | undefined): string {
  const normalizado = normalizarTelefonoAR(input)
  if (!normalizado) return input ?? ''
  const caracteristica = normalizado.slice(3, 7)
  const resto = normalizado.slice(7)
  return `+549 ${caracteristica} ${resto}`
}
