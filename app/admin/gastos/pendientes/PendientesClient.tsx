'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Gasto {
  id: string
  fecha: string
  local: string
  rubro: string
  categoria: string
  monto: number
  forma_pago: string
  estado: string
  observaciones: string | null
  comprobante_url: string | null
  fecha_pago: string | null
  proveedores: { nombre: string } | null
}

interface Props {
  gastos: Gasto[]
}

function formatMonto(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function hoy() {
  return new Date().toISOString().split('T')[0]
}

export default function PendientesClient({ gastos: initialGastos }: Props) {
  const supabase = createClient()
  const [gastos, setGastos] = useState(initialGastos)
  const [modalGasto, setModalGasto] = useState<Gasto | null>(null)
  const [fechaPago, setFechaPago] = useState(hoy())
  const [file, setFile] = useState<File | null>(null)
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Agrupar por local
  const porLocal = gastos.reduce<Record<string, Gasto[]>>((acc, g) => {
    if (!acc[g.local]) acc[g.local] = []
    acc[g.local].push(g)
    return acc
  }, {})

  const totalPendiente = gastos.reduce((s, g) => s + g.monto, 0)

  function openModal(gasto: Gasto) {
    setModalGasto(gasto)
    setFechaPago(hoy())
    setFile(null)
    setError('')
  }

  function closeModal() {
    setModalGasto(null)
    setFile(null)
    setError('')
  }

  async function marcarPagado() {
    if (!modalGasto) return
    setError('')
    setUploading(true)

    try {
      let comprobante_url: string | null = modalGasto.comprobante_url

      if (file) {
        const ext = file.name.split('.').pop()
        const path = `gastos/${modalGasto.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('comprobantes')
          .upload(path, file, { upsert: true })
        if (uploadError) throw new Error(`Error al subir comprobante: ${uploadError.message}`)

        const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
        comprobante_url = urlData.publicUrl
      }

      const { error: updateError } = await supabase
        .from('gastos')
        .update({ estado: 'Pagado', fecha_pago: fechaPago, comprobante_url })
        .eq('id', modalGasto.id)

      if (updateError) throw new Error(updateError.message)

      setGastos(prev => prev.filter(g => g.id !== modalGasto.id))
      closeModal()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setUploading(false)
    }
  }

  const inputClass = "w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] [color-scheme:dark]"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Pendientes de pago</h1>
        <p className="text-[#888] text-sm mt-0.5">Gastos pendientes y parciales por sucursal</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Total pendiente</p>
          <p className="text-xl font-bold text-red-400 mt-1">{formatMonto(totalPendiente)}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Gastos</p>
          <p className="text-xl font-bold text-[#f0f0f0] mt-1">{gastos.length}</p>
        </div>
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[#888] text-xs uppercase tracking-wider">Sucursales</p>
          <p className="text-xl font-bold text-[#f0f0f0] mt-1">{Object.keys(porLocal).length}</p>
        </div>
      </div>

      {gastos.length === 0 && (
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-[#f0f0f0] font-medium">Todo al día</p>
          <p className="text-[#888] text-sm mt-1">No hay gastos pendientes de pago</p>
        </div>
      )}

      {/* Por sucursal */}
      {Object.entries(porLocal).sort(([a], [b]) => a.localeCompare(b)).map(([local, items]) => {
        const subtotal = items.reduce((s, g) => s + g.monto, 0)
        return (
          <div key={local} className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
              <h2 className="font-bold text-[#f0f0f0] text-sm">{local}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#888]">{items.length} gastos</span>
                <span className="text-sm font-bold text-red-400">{formatMonto(subtotal)}</span>
              </div>
            </div>
            <div className="divide-y divide-[#1a1a1a]">
              {items.map(gasto => (
                <div key={gasto.id} className="px-4 py-3 flex items-center gap-4 hover:bg-[#161616] transition-colors">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-[#888] text-xs">Fecha</p>
                      <p className="text-[#f0f0f0]">{gasto.fecha}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs">Proveedor / Categoría</p>
                      <p className="text-[#f0f0f0] truncate">{gasto.proveedores?.nombre ?? gasto.categoria}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs">Forma de pago</p>
                      <p className="text-[#f0f0f0]">{gasto.forma_pago}</p>
                    </div>
                    <div>
                      <p className="text-[#888] text-xs">Monto</p>
                      <p className="text-[#f0f0f0] font-bold">{formatMonto(gasto.monto)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      gasto.estado === 'Parcial' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-red-900/40 text-red-300'
                    }`}>
                      {gasto.estado}
                    </span>
                    <button
                      onClick={() => openModal(gasto)}
                      className="bg-[#e8c547] hover:opacity-90 text-black font-bold text-xs py-1.5 px-3 rounded-lg transition-all"
                    >
                      Dar pago
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Modal pago */}
      {modalGasto && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-[#f0f0f0]">Registrar pago</h2>
              <p className="text-[#888] text-sm mt-0.5">{modalGasto.local} — {modalGasto.proveedores?.nombre ?? modalGasto.categoria}</p>
            </div>

            {/* Resumen del gasto */}
            <div className="bg-[#0a0a0a] rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#888]">Fecha</span>
                <span className="text-[#f0f0f0]">{modalGasto.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Rubro</span>
                <span className="text-[#f0f0f0]">{modalGasto.rubro}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Categoría</span>
                <span className="text-[#f0f0f0]">{modalGasto.categoria}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Forma de pago</span>
                <span className="text-[#f0f0f0]">{modalGasto.forma_pago}</span>
              </div>
              <div className="flex justify-between border-t border-[#2a2a2a] pt-2 mt-2">
                <span className="text-[#888] font-medium">Monto</span>
                <span className="text-[#e8c547] font-bold text-base">{formatMonto(modalGasto.monto)}</span>
              </div>
            </div>

            {/* Fecha de pago */}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">Fecha de pago</label>
              <input type="date" className={inputClass} value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
            </div>

            {/* Comprobante */}
            <div>
              <label className="block text-xs font-semibold text-[#e8c547] uppercase tracking-wider mb-1.5">
                Comprobante <span className="text-[#555] normal-case font-normal">(opcional — JPG, PNG, PDF)</span>
              </label>
              <label className="flex items-center gap-3 border border-dashed border-[#2a2a2a] hover:border-[#e8c547]/40 rounded-xl p-4 cursor-pointer transition-colors">
                <span className="text-2xl">📎</span>
                <div className="flex-1 min-w-0">
                  {file ? (
                    <p className="text-[#f0f0f0] text-sm truncate">{file.name}</p>
                  ) : (
                    <p className="text-[#888] text-sm">Seleccionar archivo</p>
                  )}
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={marcarPagado}
                disabled={isPending || uploading}
                className="flex-1 bg-[#e8c547] hover:opacity-90 disabled:opacity-40 text-black font-bold py-2.5 rounded-xl transition-all text-sm"
              >
                {uploading ? 'Guardando...' : 'Confirmar pago'}
              </button>
              <button
                onClick={closeModal}
                className="px-4 text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] rounded-xl text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
