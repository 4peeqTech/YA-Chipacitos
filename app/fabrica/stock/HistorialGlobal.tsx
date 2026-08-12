'use client'

import { useState } from 'react'
import { ChevronRight, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import { IconoRenderer } from '@/components/ui/IconoPicker'
import type { ConteoHistorial } from './ConteoDesplegable'

export interface HistorialGlobalItem extends ConteoHistorial {
  definicionId: string
  definicionNombre: string
  definicionIcono: string | null
  pideMasas: boolean
}

interface DetalleLinea {
  descripcion: string
  unidad: string | null
  cantidad_sugerida: number
  stock_actual: number
}

function formatearFechaCorta(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function HistorialGlobal({ historial }: { historial: HistorialGlobalItem[] }) {
  const supabase = createClient()
  const [detalle, setDetalle] = useState<HistorialGlobalItem | null>(null)
  const [detalleLineas, setDetalleLineas] = useState<DetalleLinea[] | null>(null)

  async function verDetalle(c: HistorialGlobalItem) {
    setDetalle(c)
    setDetalleLineas(null)
    const { data } = await supabase
      .from('compras_solicitudes')
      .select('compras_solicitud_items(descripcion, unidad, cantidad_sugerida, stock_actual)')
      .eq('conteo_id', c.id)
      .eq('tipo', 'complementario')
      .maybeSingle()
    const lineas = ((data?.compras_solicitud_items as DetalleLinea[] | undefined) ?? [])
      .slice()
      .sort((a, b) => b.cantidad_sugerida - a.cantidad_sugerida)
    setDetalleLineas(lineas)
  }

  return (
    <div className="space-y-2 pt-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#888] uppercase tracking-wider px-1">
        <History size={14} /> Historial de conteos cerrados
      </p>
      {historial.length === 0 ? (
        <p className="text-sm text-[#666] px-1">Todavía no hay conteos cerrados.</p>
      ) : (
        <Card className="divide-y divide-[#1a1a1a] overflow-hidden">
          {historial.map(c => (
            <button
              key={c.id}
              onClick={() => verDetalle(c)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#1a1a1a] transition-colors"
            >
              <IconoRenderer nombre={c.definicionIcono} size={16} className="shrink-0 text-[#e8c547]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f0f0f0] truncate">
                  {c.definicionNombre} · {formatearFechaCorta(c.semana_desde)} → {formatearFechaCorta(c.semana_hasta)}
                </p>
                {c.pideMasas && <p className="text-xs text-[#666] mt-0.5">{c.masas_proyectadas} masas proyectadas</p>}
              </div>
              <ChevronRight size={16} className="text-[#666] shrink-0" />
            </button>
          ))}
        </Card>
      )}

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `${detalle.definicionNombre} — ${formatearFechaCorta(detalle.semana_desde)}` : ''}
        size="lg"
      >
        {detalle?.pideMasas && (
          <p className="text-xs text-[#888] px-1 pb-2">
            Masas proyectadas: <span className="text-[#f0f0f0] font-medium">{detalle.masas_proyectadas}</span>
          </p>
        )}
        {!detalleLineas ? (
          <p className="text-sm text-[#888] text-center py-8">Cargando...</p>
        ) : detalleLineas.length === 0 ? (
          <p className="text-sm text-[#666] text-center py-8">Este conteo no generó ninguna línea sugerida.</p>
        ) : (
          <div className="divide-y divide-[#1a1a1a] -mx-6">
            {detalleLineas.map((it, idx) => (
              <div key={idx} className="px-6 py-2.5 flex items-center justify-between gap-3">
                <span className="flex-1 text-sm text-[#f0f0f0] truncate">{it.descripcion}</span>
                <div className="text-right shrink-0">
                  <p className="text-xs text-[#666]">stock actual {it.stock_actual} {it.unidad}</p>
                  <p className={`text-xs font-medium ${it.cantidad_sugerida > 0 ? 'text-red-400' : 'text-[#56d68a]'}`}>
                    {it.cantidad_sugerida > 0 ? `sugerido ${it.cantidad_sugerida} ${it.unidad}` : 'cubre con stock actual'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
