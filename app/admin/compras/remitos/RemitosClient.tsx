'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, PackageOpen } from 'lucide-react'

interface RemitoItemRow {
  id: string
  descripcion: string
  cantidad: number
  precio: number | null
}

interface RemitoRow {
  id: string
  pedido_id: string
  numero: string
  fecha: string
  created_at: string
  compras_pedidos: { proveedor_id: string; proveedores: { nombre: string } | null } | null
  compras_remito_items: RemitoItemRow[]
}

type Columna = 'proveedor' | 'numero' | 'fecha' | 'lineas'

interface PedidoSinRemito {
  id: string
  proveedorNombre: string
}

export default function RemitosClient({
  remitosIniciales,
  pedidosSinRemito,
}: {
  remitosIniciales: RemitoRow[]
  pedidosSinRemito: PedidoSinRemito[]
}) {
  const [filtro, setFiltro] = useState('')
  const [sortCampo, setSortCampo] = useState<Columna>('fecha')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  function ordenarPor(campo: Columna) {
    if (campo === sortCampo) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortCampo(campo); setSortDir(1) }
  }

  const filtrados = useMemo(() => {
    const texto = filtro.trim().toLowerCase()
    const porTexto = texto
      ? remitosIniciales.filter(r =>
          r.numero.toLowerCase().includes(texto) ||
          (r.compras_pedidos?.proveedores?.nombre ?? '').toLowerCase().includes(texto)
        )
      : remitosIniciales

    return [...porTexto].sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortCampo === 'proveedor') {
        va = a.compras_pedidos?.proveedores?.nombre ?? ''
        vb = b.compras_pedidos?.proveedores?.nombre ?? ''
      } else if (sortCampo === 'numero') {
        va = a.numero
        vb = b.numero
      } else if (sortCampo === 'lineas') {
        va = a.compras_remito_items.length
        vb = b.compras_remito_items.length
      } else {
        va = a.fecha
        vb = b.fecha
      }
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
  }, [remitosIniciales, filtro, sortCampo, sortDir])

  function flecha(campo: Columna) {
    return campo === sortCampo ? (sortDir === 1 ? ' ▲' : ' ▼') : ''
  }

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-[#e8c547] uppercase tracking-wider cursor-pointer select-none"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Remitos</h1>
        <p className="text-[#888] text-sm mt-0.5">Listado de todos los remitos registrados, de todos los proveedores.</p>
      </div>

      {pedidosSinRemito.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-yellow-800 bg-yellow-900/20 px-4 py-3">
          <PackageOpen size={18} className="text-yellow-400 shrink-0" />
          <p className="flex-1 min-w-[200px] text-sm text-yellow-100">
            <span className="font-semibold">{pedidosSinRemito.length} pedido{pedidosSinRemito.length === 1 ? '' : 's'} enviado{pedidosSinRemito.length === 1 ? '' : 's'}</span>{' '}
            todavía sin remito registrado
            {pedidosSinRemito.length <= 4 && (
              <span className="text-yellow-300/80"> — {pedidosSinRemito.map(p => p.proveedorNombre).join(', ')}</span>
            )}
          </p>
          <Link
            href="/admin/compras/pedidos"
            className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-yellow-300 hover:text-yellow-200 transition-colors"
          >
            Ir a Pedidos <ArrowRight size={14} />
          </Link>
        </div>
      )}

      <input
        type="text"
        placeholder="Filtrar por N° de remito o proveedor..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
        className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#e8c547] transition-colors"
      />

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-[#888]">No hay remitos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className={thClass} onClick={() => ordenarPor('proveedor')}>Proveedor{flecha('proveedor')}</th>
                  <th className={thClass} onClick={() => ordenarPor('numero')}>N° Remito{flecha('numero')}</th>
                  <th className={thClass} onClick={() => ordenarPor('fecha')}>Fecha{flecha('fecha')}</th>
                  <th className={thClass} onClick={() => ordenarPor('lineas')}>Líneas{flecha('lineas')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {filtrados.map(r => (
                  <tr key={r.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#f0f0f0] font-medium">{r.compras_pedidos?.proveedores?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-[#888]">{r.numero}</td>
                    <td className="px-4 py-3 text-[#888]">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-[#888]">{r.compras_remito_items.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
