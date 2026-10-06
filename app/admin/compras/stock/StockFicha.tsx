'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { History, Package, Pencil, ShoppingBasket } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import Pestanas, { panelDe } from '@/components/ui/Pestanas'
import { usePuedeEntrar } from '@/components/ui/AccesoModulos'
import type { Database } from '@/lib/database.types'
import { rutaEditarInsumo, type PestanaInsumo } from '@/lib/compras/rutas'
import { textoBaseItem } from '@/lib/compras/unidades'
import { unidadesDe } from '@/lib/compras/trazabilidad'
import { conUnidad } from '../pedidos/modelo'
import type { FilaStock } from './StockClient'
import PanelStock from './ficha/PanelStock'
import PanelCompras from './ficha/PanelCompras'
import PanelMovimientos from './ficha/PanelMovimientos'

const ID_BASE = 'ficha-insumo'

const PESTANAS = [
  { id: 'stock', label: 'Stock', icon: <Package size={14} /> },
  { id: 'compras', label: 'Compras', icon: <ShoppingBasket size={14} /> },
  { id: 'movimientos', label: 'Movimientos', icon: <History size={14} /> },
] satisfies { id: PestanaInsumo; label: string; icon: React.ReactNode }[]

/**
 * Ficha del insumo (A2c §6.1): encabezado fijo y tres pestañas. Cada pestaña
 * carga la primera vez que se abre y queda montada (oculta) mientras el modal
 * esté abierto: volver a una no la vuelve a pedir (E11). Cambiar de pestaña no
 * toca la URL.
 */
export default function StockFicha({
  fila,
  pestanaInicial,
  esAdmin,
  onCambios,
  onCerrar,
}: {
  fila: FilaStock
  pestanaInicial: PestanaInsumo
  esAdmin: boolean
  onCambios: (hay: boolean) => void
  onCerrar: () => void
}) {
  const [tab, setTab] = useState<PestanaInsumo>(pestanaInicial)
  const [vistas, setVistas] = useState<Set<PestanaInsumo>>(() => new Set([pestanaInicial]))
  // Un ?pestana= nuevo con la ficha ya abierta (mismo insumo) llega como prop nueva.
  const [previa, setPrevia] = useState(pestanaInicial)
  if (pestanaInicial !== previa) {
    setPrevia(pestanaInicial)
    setTab(pestanaInicial)
    setVistas(v => new Set(v).add(pestanaInicial))
  }

  const puedeEntrar = usePuedeEntrar()
  const supabase = useMemo(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])
  const unidades = useMemo(() => unidadesDe({
    unidad: fila.item.unidad, unidad_base: fila.item.unidad_base, contenido: fila.item.cantidad_por_unidad,
  }), [fila.item.unidad, fila.item.unidad_base, fila.item.cantidad_por_unidad])

  function cambiar(id: string) {
    const p = id as PestanaInsumo
    setTab(p)
    setVistas(v => (v.has(p) ? v : new Set(v).add(p)))
  }

  const unidad = fila.item.unidad
  const base = textoBaseItem(fila.cantidad, fila.item)
  const editar = rutaEditarInsumo(fila.item.id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Stock actual
              {fila.item.estado === 'archivado' && (
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">Archivado</span>
              )}
            </p>
            <p className={`text-3xl font-bold tabular-nums ${fila.bajo ? 'text-brand-red' : 'text-text'}`}>
              {conUnidad(fila.cantidad, unidad)}
              {base && <span className="ml-2 text-sm font-normal text-muted">{base}</span>}
            </p>
          </div>
          <p className="pb-1 text-sm text-muted tabular-nums">
            Mínimo {conUnidad(fila.item.stock_minimo, unidad)}
            {fila.bajo && <span className="text-brand-red"> · está por debajo</span>}
          </p>
        </div>
        {puedeEntrar(editar) && (
          <Link
            href={editar}
            onClick={onCerrar}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80"
          >
            <Pencil size={14} /> Editar insumo
          </Link>
        )}
      </div>

      <Pestanas items={PESTANAS} activa={tab} onCambiar={cambiar} etiqueta="Ficha del insumo" idBase={ID_BASE} />

      {/* Alto mínimo: cambiar de pestaña no hace saltar el modal. */}
      <div className="min-h-[24rem]">
        {vistas.has('stock') && (
          <div {...panelDe(ID_BASE, 'stock')} hidden={tab !== 'stock'}>
            <PanelStock supabase={supabase} fila={fila} onCambios={onCambios} onCerrar={onCerrar} />
          </div>
        )}
        {vistas.has('compras') && (
          <div {...panelDe(ID_BASE, 'compras')} hidden={tab !== 'compras'}>
            <PanelCompras supabase={supabase} itemId={fila.item.id} unidades={unidades} esAdmin={esAdmin} visible={tab === 'compras'} onCerrar={onCerrar} />
          </div>
        )}
        {vistas.has('movimientos') && (
          <div {...panelDe(ID_BASE, 'movimientos')} hidden={tab !== 'movimientos'}>
            <PanelMovimientos supabase={supabase} fila={fila} onCerrar={onCerrar} />
          </div>
        )}
      </div>
    </div>
  )
}
