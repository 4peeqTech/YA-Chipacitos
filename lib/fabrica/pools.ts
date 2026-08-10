export interface ProduccionCongelado {
  fecha: string
  turno: 'manana' | 'tarde'
  masaKg: number
  saborId: string
  saborNombre: string
  tamanioId: string
  tamanioNombre: string
}

export interface EmbolsadoLinea {
  id: string
  fecha: string
  tamanioId: string
  saborId: string
  presentacionId: string
  presentacionNombre: string
  cantidadKg: number
}

// Solo las devoluciones con destino 'reinsercion' del día vuelven al pool —
// las de destino 'perdida' no se pasan acá. presentacion_id de origen no
// viaja: no limita a qué presentación se re-embolsa la masa.
export interface DevolucionReinsercion {
  fecha: string
  tamanioId: string
  saborId: string
  cantidadKg: number
}

export interface LineaPool {
  id: string
  presentacionId: string
  presentacionNombre: string
  cantidadKg: number
}

export interface PoolCongelado {
  tamanioId: string
  tamanioNombre: string
  saborId: string
  saborNombre: string
  masaProduccionKg: number
  masaReinsertadaKg: number
  masaKg: number
  masaManana: number
  masaTarde: number
  cargas: number
  lineas: LineaPool[]
  embolsadoKg: number
  restanteKg: number
}

function clave(tamanioId: string, saborId: string) {
  return `${tamanioId}::${saborId}`
}

// Agrupa la masa de congelado del día por tamaño×sabor — el pool que se
// reparte en presentaciones en /fabrica/embolsado. `fecha` en ambas listas es
// el día de la MASA, no el de la bolsa: dos cargas de producción en turnos
// distintos del mismo tamaño+sabor caen en un solo pool; tamaños distintos
// nunca se mezclan. Un pool puede existir solo por embolsados (sin
// producción del día, p. ej. si la producción se corrigió después) — en ese
// caso el nombre queda en '—' porque las líneas de embolsado no traen
// sabor/tamaño legible, solo el id.
export function agruparPoolCongelado(
  producciones: ProduccionCongelado[],
  embolsados: EmbolsadoLinea[],
  devoluciones: DevolucionReinsercion[],
  dia: string
): PoolCongelado[] {
  const pools = new Map<string, PoolCongelado>()

  function obtener(tamanioId: string, saborId: string, tamanioNombre: string, saborNombre: string) {
    const k = clave(tamanioId, saborId)
    let pool = pools.get(k)
    if (!pool) {
      pool = { tamanioId, tamanioNombre, saborId, saborNombre, masaProduccionKg: 0, masaReinsertadaKg: 0, masaKg: 0, masaManana: 0, masaTarde: 0, cargas: 0, lineas: [], embolsadoKg: 0, restanteKg: 0 }
      pools.set(k, pool)
    }
    return pool
  }

  for (const p of producciones) {
    if (p.fecha !== dia) continue
    const pool = obtener(p.tamanioId, p.saborId, p.tamanioNombre, p.saborNombre)
    pool.masaProduccionKg += p.masaKg
    if (p.turno === 'manana') pool.masaManana += p.masaKg
    else pool.masaTarde += p.masaKg
    pool.cargas += 1
  }

  for (const e of embolsados) {
    if (e.fecha !== dia) continue
    const pool = obtener(e.tamanioId, e.saborId, '—', '—')
    pool.lineas.push({ id: e.id, presentacionId: e.presentacionId, presentacionNombre: e.presentacionNombre, cantidadKg: e.cantidadKg })
    pool.embolsadoKg += e.cantidadKg
  }

  for (const d of devoluciones) {
    if (d.fecha !== dia) continue
    const pool = obtener(d.tamanioId, d.saborId, '—', '—')
    pool.masaReinsertadaKg += d.cantidadKg
  }

  for (const pool of pools.values()) {
    pool.masaKg = pool.masaProduccionKg + pool.masaReinsertadaKg
    pool.restanteKg = pool.masaKg - pool.embolsadoKg
  }

  return [...pools.values()].sort((a, b) => a.tamanioNombre.localeCompare(b.tamanioNombre) || a.saborNombre.localeCompare(b.saborNombre))
}
