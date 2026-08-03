export interface ItemPedidoMatch {
  id: string
  descripcion: string
}

// Palabras de 4+ letras — descarta artículos, unidades cortas ("x4", "de")
// y demás ruido que no ayuda a distinguir un insumo de otro.
function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(palabra => palabra.length >= 4)
}

// Contención en cualquier sentido — cubre singular/plural ("caja"/"cajas")
// sin necesidad de un stemmer.
function coincide(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a)
}

// Sugiere el ítem del pedido cuya descripción comparte más palabras
// significativas con la línea de remito tipeada. Devuelve null si ningún
// ítem comparte al menos una palabra (deja la línea "sin corresponder").
export function sugerirPedidoItem(descripcionRemito: string, items: ItemPedidoMatch[]): string | null {
  const palabrasRemito = normalizar(descripcionRemito)
  if (!palabrasRemito.length) return null

  let mejorId: string | null = null
  let mejorScore = 0

  for (const item of items) {
    const palabrasItem = normalizar(item.descripcion)
    let score = 0
    for (const palabra of palabrasRemito) {
      if (palabrasItem.some(p => coincide(palabra, p))) score++
    }
    if (score > mejorScore) {
      mejorScore = score
      mejorId = item.id
    }
  }

  return mejorScore > 0 ? mejorId : null
}
