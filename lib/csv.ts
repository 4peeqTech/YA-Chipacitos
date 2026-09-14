// Export de tablas a CSV compatible con Excel en español (BOM + separador ,
// con campos entre comillas). Mismo formato que ya usan MapeosClient y
// AdminCatalogoClient, factorizado para los exports nuevos de Fábrica.
export function descargarCsv(
  nombreArchivo: string,
  cabeceras: string[],
  filas: (string | number | null)[][]
): void {
  function celda(valor: string | number | null): string {
    const texto = valor == null ? '' : String(valor)
    return `"${texto.replace(/"/g, '""')}"`
  }

  const lineas = [cabeceras.map(celda).join(',')]
  for (const fila of filas) {
    lineas.push(fila.map(celda).join(','))
  }
  const csv = lineas.join('\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}
