'use client'

import TablaMaestra from '@/components/ui/TablaMaestra'
import { CHIP_EFECTO, EFECTOS, TEXTO_EFECTO, esEfecto } from '@/lib/compras/devoluciones'

// B4: los motivos de devolución al proveedor. Son otros que los de Fábrica
// (devoluciones de producto de los locales): por eso "al proveedor" en el título.
export default function MotivosDevolucionClient() {
  return (
    <div className="mt-6">
      <TablaMaestra
        titulo="Motivos de devolución al proveedor"
        singular="motivo"
        descripcion="Al registrar una devolución, el motivo decide si la mercadería sale del stock o si solo se corrige la factura. Cambiar un motivo no cambia las devoluciones ya registradas."
        apiPath="/api/compras-devolucion-motivos"
        camposExtra={[{
          key: 'efecto',
          tipo: 'select',
          label: 'Qué pasa',
          opciones: EFECTOS.map(e => ({ valor: e, label: TEXTO_EFECTO[e] })),
        }]}
        resumenFila={m => (esEfecto(m.efecto)
          ? <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-2xs font-medium text-muted">{CHIP_EFECTO[m.efecto]}</span>
          : null)}
      />
    </div>
  )
}
