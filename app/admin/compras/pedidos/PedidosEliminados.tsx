'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import { formatearFecha, formatearFechaHora } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import { conUnidad } from './modelo'
import type { PedidoEliminado } from './datos'

interface LineaEliminada {
  descripcion: string
  unidad: string | null
  cantidad: number
}

function lineasDe(e: PedidoEliminado): LineaEliminada[] {
  return Array.isArray(e.lineas) ? (e.lineas as unknown as LineaEliminada[]) : []
}

/** Pestaña "Eliminados": por qué falta cada número (solo lectura). */
export default function PedidosEliminados({ eliminados, filtrar }: {
  eliminados: PedidoEliminado[]
  filtrar: (e: PedidoEliminado) => boolean
}) {
  const [abierto, setAbierto] = useState<PedidoEliminado | null>(null)
  const filas = eliminados.filter(filtrar)

  const columnas: Columna<PedidoEliminado>[] = [
    {
      key: 'numero',
      header: 'N°',
      render: e => <span className="whitespace-nowrap font-mono tabular-nums text-muted line-through decoration-1">{codigoPedido(e.numero ?? 0)}</span>,
      ordenar: e => e.numero ?? 0,
    },
    { key: 'proveedor', header: 'Proveedor', render: e => e.proveedor_nombre ?? <span className="text-muted">—</span>, ordenar: e => e.proveedor_nombre ?? '' },
    {
      key: 'eliminado',
      header: 'Eliminado',
      render: e => (
        <div className="whitespace-nowrap">
          <p>{e.eliminado_en ? formatearFecha(e.eliminado_en) : <span className="text-muted">Sin fecha</span>}</p>
          {e.eliminado_por_nombre && <p className="text-2xs text-muted">por {e.eliminado_por_nombre}</p>}
        </div>
      ),
      ordenar: e => e.eliminado_en ?? '',
      ocultarHasta: 'sm',
    },
    { key: 'motivo', header: 'Motivo', render: e => <span className="text-muted">{e.motivo}</span>, ordenar: e => e.motivo ?? '' },
    { key: 'items', header: 'Ítems', render: e => lineasDe(e).length || '—', alinear: 'right', ocultarHasta: 'md' },
  ]

  if (filas.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border">
        <EmptyState
          icono={Trash2}
          titulo={eliminados.length ? 'Ningún pedido eliminado coincide con la búsqueda' : 'No hay pedidos eliminados'}
          descripcion={eliminados.length ? undefined : 'Cuando se elimina un borrador, queda acá con su número y el motivo.'}
        />
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-muted">
        Pedidos borrados antes de enviarse. Su número no se vuelve a usar: acá queda por qué falta.
      </p>
      <DataTable filas={filas} columnas={columnas} filaKey={e => e.id ?? String(e.numero)} onFilaClick={setAbierto} />
      <Modal
        open={abierto != null}
        onClose={() => setAbierto(null)}
        title={abierto ? `Pedido ${codigoPedido(abierto.numero ?? 0)} eliminado` : ''}
        encabezado={abierto ? <>Pedido <span className="font-mono tabular-nums">{codigoPedido(abierto.numero ?? 0)}</span> eliminado</> : undefined}
      >
        {abierto && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Proveedor</dt><dd className="text-text">{abierto.proveedor_nombre ?? '—'}</dd>
              <dt className="text-muted">Motivo</dt><dd className="text-text">{abierto.motivo}</dd>
              <dt className="text-muted">Eliminado</dt>
              <dd className="text-text">{abierto.eliminado_en ? formatearFechaHora(abierto.eliminado_en) : '—'}{abierto.eliminado_por_nombre && ` · ${abierto.eliminado_por_nombre}`}</dd>
              {abierto.creado_en && (
                <>
                  <dt className="text-muted">Creado</dt>
                  <dd className="text-text">{formatearFechaHora(abierto.creado_en)}{abierto.creado_por_nombre && ` · ${abierto.creado_por_nombre}`}</dd>
                </>
              )}
            </dl>
            {lineasDe(abierto).length > 0 ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {lineasDe(abierto).map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-2">
                    <span className="text-text">{l.descripcion}</span>
                    <span className="tabular-nums text-muted">{conUnidad(l.cantidad, l.unidad)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No hay detalle de las líneas.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
