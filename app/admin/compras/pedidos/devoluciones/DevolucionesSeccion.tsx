'use client'

import { useEffect, useRef, useState } from 'react'
import { Ban, ChevronDown, FileX2, Plus, ReceiptText, Undo2 } from 'lucide-react'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { CHIP_EFECTO, efectoDeMotivo, textoLineaDevolucion } from '@/lib/compras/devoluciones'
import { TEXTO_NC_GASTO } from '@/lib/compras/historialPedido'
import MenuSecundario, { type ItemMenu } from '../MenuSecundario'
import type { DevolucionVista } from './datos'

const MAX_ANULADAS_VISIBLES = 2

function Chip({ children, tono = 'neutro' }: { children: React.ReactNode; tono?: 'neutro' | 'alerta' | 'info' }) {
  const color = tono === 'alerta' ? 'border-warning text-warning' : tono === 'info' ? 'border-border text-text' : 'border-border text-muted'
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium ${color}`}>{children}</span>
}

function textoNc(d: DevolucionVista): string {
  const partes = [`Nota de crédito N° ${d.ncNumero ?? '—'}`]
  if (d.ncTotal != null) partes.push(formatearMonedaExacta(d.ncTotal))
  if (d.ncGasto && TEXTO_NC_GASTO[d.ncGasto]) partes.push(TEXTO_NC_GASTO[d.ncGasto])
  return partes.join(' · ')
}

function Tarjeta({
  d, esAdmin, resaltada, onCargarNc, onAnularNc, onAnular,
}: {
  d: DevolucionVista
  esAdmin: boolean
  resaltada: boolean
  onCargarNc: (d: DevolucionVista) => void
  onAnularNc: (d: DevolucionVista) => void
  onAnular: (d: DevolucionVista) => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const [brillo, setBrillo] = useState(resaltada)
  useEffect(() => {
    if (!resaltada) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setBrillo(false), 2000)
    return () => clearTimeout(t)
  }, [resaltada])

  const anulada = d.estado === 'anulada'
  const efecto = efectoDeMotivo({ devuelve_mercaderia: d.devuelveMercaderia, corrige_precio: d.corrigePrecio })
  const tieneNc = !!d.notaCreditoId
  const items: ItemMenu[] = []
  if (!anulada) {
    if (esAdmin && d.esperaNotaCredito) items.push({ label: 'Cargar nota de crédito', icono: ReceiptText, onClick: () => onCargarNc(d) })
    if (esAdmin && tieneNc) items.push({ label: 'Anular nota de crédito', icono: FileX2, onClick: () => onAnularNc(d) })
    // Sin NC y con mercadería la anula Compras; lo demás, solo admin (E15).
    if (esAdmin || (!tieneNc && d.devuelveMercaderia)) items.push({ label: 'Anular devolución', icono: Ban, onClick: () => onAnular(d), peligro: true })
  }

  return (
    <li
      ref={ref}
      id={`devolucion-${d.id}`}
      data-resaltado={brillo}
      className={`resaltable space-y-2 rounded-xl border border-border px-3 py-3 ${anulada ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-text">
            <span className={`font-mono font-semibold tabular-nums ${anulada ? 'line-through' : ''}`}>{d.codigo}</span>
            <span className="text-muted"> · {formatearFecha(d.creadaEn)}{d.creadaPor && ` · ${d.creadaPor}`}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip tono="info">{d.motivoNombre}</Chip>
            <Chip>{CHIP_EFECTO[efecto]}</Chip>
            {d.devuelveMercaderia && <Chip>{d.repone ? 'Repone' : 'No repone'}</Chip>}
          </div>
        </div>
        <MenuSecundario items={items} etiqueta={`Acciones de ${d.codigo}`} compacto />
      </div>

      <ul className="space-y-0.5 text-sm text-text">
        {d.lineas.map(l => (
          <li key={l.id} className="tabular-nums">
            {textoLineaDevolucion(l)}
            {d.corrigePrecio && esAdmin && l.precioCorrecto != null && (
              <span className="text-muted"> · precio correcto {formatearMonedaExacta(l.precioCorrecto)}</span>
            )}
          </li>
        ))}
      </ul>
      {d.nota && <p className="text-xs text-muted">Nota: {d.nota}</p>}

      {!anulada && (
        esAdmin ? (
          tieneNc ? (
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <ReceiptText size={13} className="shrink-0 text-success" />
              <LinkEntidad entidad={{ tipo: 'factura', id: d.notaCreditoId! }} variante="texto" title="Ver la nota de crédito">{textoNc(d)}</LinkEntidad>
            </p>
          ) : d.esperaNotaCredito ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-bg px-3 py-2">
              <p className="text-xs font-medium text-warning">Falta la nota de crédito</p>
              <button
                type="button"
                onClick={() => onCargarNc(d)}
                className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-black hover:opacity-90"
              >
                <ReceiptText size={14} /> Cargar nota de crédito
              </button>
            </div>
          ) : d.repone ? (
            <p className="text-xs text-muted">Con reposición: no lleva nota de crédito.</p>
          ) : null
        ) : (
          (tieneNc || d.esperaNotaCredito) && (
            <p className="text-xs text-muted">{tieneNc ? 'Tiene nota de crédito.' : 'Esperando nota de crédito.'}</p>
          )
        )
      )}

      {anulada && (
        <p className="text-xs text-muted">
          Anulada{d.anuladaPor && ` por ${d.anuladaPor}`}{d.anuladaEn && ` el ${formatearFecha(d.anuladaEn)}`}
          {d.anuladaMotivo && ` · Motivo: ${d.anuladaMotivo}`}
        </p>
      )}
    </li>
  )
}

/**
 * La sección "Devoluciones" del pedido (§6.3): una tarjeta por devolución, las
 * anuladas al final y plegadas si son más de 2.
 */
export default function DevolucionesSeccion({
  devoluciones, esAdmin, puedeRegistrar, resaltadaId, onRegistrar, onCargarNc, onAnularNc, onAnular,
}: {
  devoluciones: DevolucionVista[]
  esAdmin: boolean
  puedeRegistrar: boolean
  resaltadaId: string | null
  onRegistrar: () => void
  onCargarNc: (d: DevolucionVista) => void
  onAnularNc: (d: DevolucionVista) => void
  onAnular: (d: DevolucionVista) => void
}) {
  const activas = devoluciones.filter(d => d.estado === 'activa')
  const anuladas = devoluciones.filter(d => d.estado !== 'activa')
  const resaltadaAnulada = anuladas.some(d => d.id === resaltadaId)
  const [verAnuladas, setVerAnuladas] = useState(anuladas.length <= MAX_ANULADAS_VISIBLES || resaltadaAnulada)
  const props = { esAdmin, onCargarNc, onAnularNc, onAnular }

  if (devoluciones.length === 0 && !puedeRegistrar) return null

  return (
    <section className="space-y-2" aria-labelledby="titulo-devoluciones">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="titulo-devoluciones" className="flex items-center gap-2 text-sm font-bold text-text">
          <Undo2 size={16} className="text-accent" /> Devoluciones
          {devoluciones.length > 0 && <span className="font-normal text-muted">({activas.length})</span>}
        </h4>
        {puedeRegistrar && (
          <button
            type="button"
            onClick={onRegistrar}
            className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-text hover:bg-surface2"
          >
            <Plus size={15} /> Registrar devolución
          </button>
        )}
      </div>
      {devoluciones.length === 0 ? (
        <p className="text-sm text-muted">Si llegó algo mal, registrá la devolución acá: descuenta el stock y queda en el historial.</p>
      ) : (
        <ul className="space-y-2">
          {activas.map(d => <Tarjeta key={d.id} d={d} resaltada={d.id === resaltadaId} {...props} />)}
          {anuladas.length > 0 && !verAnuladas && (
            <li>
              <button
                type="button"
                onClick={() => setVerAnuladas(true)}
                className="min-h-11 inline-flex items-center gap-1 rounded text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80"
              >
                <ChevronDown size={14} /> Ver {anuladas.length} anuladas
              </button>
            </li>
          )}
          {verAnuladas && anuladas.map(d => <Tarjeta key={d.id} d={d} resaltada={d.id === resaltadaId} {...props} />)}
        </ul>
      )}
    </section>
  )
}
