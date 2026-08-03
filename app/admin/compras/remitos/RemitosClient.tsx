'use client'

import { useMemo, useState } from 'react'

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

export default function RemitosClient({ remitosIniciales }: { remitosIniciales: RemitoRow[] }) {
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
