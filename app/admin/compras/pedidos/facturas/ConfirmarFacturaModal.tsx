'use client'

import { useState } from 'react'
import { AlertTriangle, Link2, Loader2, Plus, ReceiptText, Wallet } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Field, controlClass } from '@/components/ui/Field'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { LOCALES } from '@/lib/gastos-constants'
import { ResumenImpacto, type NombresInsumo } from '../remitos/RemitoForm'
import type { ImpactoItem } from '../remitos/modelo'
import CabeceraFactura from './CabeceraFactura'
import type { GastoCandidato } from './acciones'
import type { PedidoFactura } from './datos'

const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

export interface EleccionGasto {
  gastoExistenteId: string | null
  gastoLocal: string | null
}

/**
 * Último paso antes de confirmar: qué pasa con el pedido, el stock y la plata.
 * El gasto (F6 del 22-09) se crea en el local que se elige acá; si hay un gasto
 * del proveedor cargado a mano que se parece (FA10), se ofrece vincularlo en
 * vez de crear otro.
 */
export default function ConfirmarFacturaModal({
  open,
  numero,
  pedido,
  total,
  vencimiento,
  llego,
  impacto,
  nombres,
  preciosACambiar,
  avisoPapel,
  candidatos,
  errorCandidatos,
  localDefault,
  pendiente,
  onConfirmar,
  onCerrar,
}: {
  open: boolean
  numero: string
  pedido: PedidoFactura | null
  total: number
  vencimiento: string
  /** null = el pedido ya tenía remitos y no hubo que preguntar. */
  llego: boolean | null
  impacto: ImpactoItem[]
  nombres: Record<string, NombresInsumo>
  preciosACambiar: number
  /** Diferencia con el total del papel, si supera el margen (FA6). */
  avisoPapel: number | null
  /** null mientras se buscan. */
  candidatos: GastoCandidato[] | null
  errorCandidatos: string | null
  localDefault: string
  pendiente: boolean
  onConfirmar: (e: EleccionGasto) => void
  onCerrar: () => void
}) {
  // 'nuevo' = crear un gasto; un id = vincular ese; null = todavía no eligió.
  const [eleccion, setEleccion] = useState<string | null>(null)
  const [local, setLocal] = useState(localDefault)

  const buscando = candidatos == null
  const hayCandidatos = (candidatos?.length ?? 0) > 0
  const elegida = hayCandidatos ? eleccion : 'nuevo'
  const creaNuevo = elegida === 'nuevo'
  const candidatoElegido = candidatos?.find(c => c.id === elegida) ?? null
  const sumaStock = llego === true && impacto.length > 0
  const puedeConfirmar = !buscando && elegida != null && (!creaNuevo || local.trim() !== '')

  function confirmar() {
    if (!puedeConfirmar) return
    onConfirmar(creaNuevo
      ? { gastoExistenteId: null, gastoLocal: local }
      : { gastoExistenteId: elegida, gastoLocal: null })
  }

  return (
    <Modal open={open} onClose={onCerrar} title="Confirmar factura" size="lg">
      <div className="space-y-5">
        <CabeceraFactura numero={numero} pedido={pedido} />

        <div className="space-y-3">
          <p className="text-sm text-text">
            Se confirma por <strong className="tabular-nums">{formatearMonedaExacta(total)}</strong>
            {vencimiento && <> · vence el {formatearFecha(vencimiento)}</>}.
            {' '}El pedido pasa a <strong>Facturado</strong>{llego === false && <> · falta recibir</>}.
          </p>
          {sumaStock && (
            <>
              <p className="text-sm text-text">Se registra un remito con lo facturado y el stock suma:</p>
              <ResumenImpacto impacto={impacto} nombres={nombres} />
            </>
          )}
          {llego === false && (
            <p className="text-sm text-muted">El stock no se mueve: va a sumar cuando cargues el remito.</p>
          )}
          {preciosACambiar > 0 && (
            <p className="text-sm text-muted">
              {preciosACambiar === 1
                ? 'Se actualiza el precio de referencia de 1 insumo de este proveedor.'
                : `Se actualizan los precios de referencia de ${preciosACambiar} insumos de este proveedor.`}
            </p>
          )}
          {avisoPapel != null && (
            <p className="flex items-start gap-1.5 text-sm text-warning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              El total no coincide con el del papel por {formatearMonedaExacta(avisoPapel)}. Se confirma igual.
            </p>
          )}
        </div>

        {/* Gasto */}
        <section className="space-y-3 border-t border-border pt-4" aria-labelledby="titulo-gasto">
          <h5 id="titulo-gasto" className="flex items-center gap-2 text-sm font-bold text-text">
            <Wallet size={16} className="text-accent" /> Gasto
          </h5>

          {buscando ? (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm text-muted">Buscando si ya cargaste este gasto a mano…</p>
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <>
              {errorCandidatos && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {errorCandidatos} Si ya lo habías cargado, vas a tener que borrarlo a mano después.
                </p>
              )}

              {hayCandidatos && candidatos && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm text-text">
                    Encontramos {candidatos.length === 1 ? 'un gasto' : 'gastos'} de {pedido?.proveedores?.nombre ?? 'este proveedor'} por
                    un monto parecido. ¿Es esta factura?
                  </legend>
                  {candidatos.map(c => (
                    <label
                      key={c.id}
                      className={`presionable flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${eleccion === c.id ? 'border-accent bg-surface2' : 'border-border hover:border-muted'}`}
                    >
                      <input
                        type="radio"
                        name="gasto"
                        checked={eleccion === c.id}
                        onChange={() => setEleccion(c.id)}
                        className="mt-1 size-5 shrink-0 cursor-pointer accent-accent"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="flex items-center gap-1.5 font-bold text-text">
                          <Link2 size={15} className="text-accent-fg" /> Sí, es este:
                          <span className="tabular-nums">{formatearMonedaExacta(c.monto)}</span>
                        </span>
                        <span className="block text-xs text-muted">
                          Del {formatearFecha(c.fecha)} · {c.local} · {c.categoria} · {c.estado}
                        </span>
                        {c.observaciones && <span className="block truncate text-xs text-muted">{c.observaciones}</span>}
                      </span>
                    </label>
                  ))}
                  <label
                    className={`presionable flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${eleccion === 'nuevo' ? 'border-accent bg-surface2' : 'border-border hover:border-muted'}`}
                  >
                    <input
                      type="radio"
                      name="gasto"
                      checked={eleccion === 'nuevo'}
                      onChange={() => setEleccion('nuevo')}
                      className="mt-1 size-5 shrink-0 cursor-pointer accent-accent"
                    />
                    <span className="text-sm">
                      <span className="flex items-center gap-1.5 font-bold text-text"><Plus size={15} className="text-accent-fg" /> No, crear un gasto nuevo</span>
                      <span className="block text-xs text-muted">El otro gasto queda como está.</span>
                    </span>
                  </label>
                </fieldset>
              )}

              {candidatoElegido && (
                <p className="text-sm text-muted">
                  La factura queda vinculada a ese gasto y no se crea otro.
                  {candidatoElegido.estado !== 'Pendiente de pago' && <> Ese gasto ya figura como {candidatoElegido.estado.toLowerCase()}.</>}
                </p>
              )}

              {creaNuevo && (
                <div className="grid gap-3 sm:grid-cols-[1fr_14rem] sm:items-end">
                  <p className="text-sm text-text">
                    Se crea un gasto de <strong className="tabular-nums">{formatearMonedaExacta(total)}</strong> pendiente de pago,
                    en Materia prima. Lo pagás desde Gastos › Pendientes de pago.
                  </p>
                  <Field label="Local del gasto" obligatorio>
                    <select
                      aria-label="Local al que se imputa el gasto"
                      value={local}
                      onChange={e => setLocal(e.target.value)}
                      className={`${controlClass} min-h-11`}
                    >
                      {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </>
          )}
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
          {hayCandidatos && elegida == null && (
            <p className="text-xs text-muted sm:mr-auto">Elegí si es ese gasto o si creás uno nuevo.</p>
          )}
          <button type="button" onClick={onCerrar} disabled={pendiente} className={botonSecundario}>Volver</button>
          <button
            type="button"
            onClick={confirmar}
            disabled={pendiente || !puedeConfirmar}
            className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {pendiente ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />} Confirmar factura
          </button>
        </div>
      </div>
    </Modal>
  )
}
