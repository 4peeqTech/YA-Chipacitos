'use client'

import { useRef, useState } from 'react'
import { IconCircleCheck, IconFileText, IconPaperclip, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import DatePicker from '@/components/ui/DatePicker'
import InputNumero from '@/components/ui/InputNumero'
import { ChipGroup } from '@/components/ui/Chip'
import { Puntos } from '@/components/ui/Cargando'
import { Field, controlClass } from '@/components/ui/Field'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import { mensajeError } from '@/lib/errores'
import { MAX_MB_ARCHIVO, TIPOS_ARCHIVO, subirArchivoGasto } from './archivos'

const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

export interface DatosPago {
  fechaPago: string
  formaPago: string
  caja: string
  /** Ruta del archivo en el bucket (privado): se abre con un link firmado. */
  comprobanteUrl: string | null
  /** null = todo lo que falta. */
  monto: number | null
}

/** Lo que se muestra del gasto que se paga: vale para uno de la app o de Fudo. */
export interface ResumenAPagar {
  /** Para la carpeta del comprobante: única entre app y Fudo. */
  clave: string
  titulo: string
  detalle: string | null
  local: string
  fecha: string
  /** Lo que falta pagar. */
  monto: number
  /** Si ya se pagó una parte: el total del gasto. */
  montoTotal?: number
  /** Un gasto que vino de Fudo (se paga acá, Fudo no se entera). */
  deFudo?: boolean
}

/**
 * Registrar un pago: fecha, monto (de la app: puede ser una parte), forma de
 * pago, caja y comprobante opcional. El comprobante se sube primero; si la
 * subida falla, no se registra nada y el error dice qué pasó.
 */
export default function PagoModal({
  gasto,
  formaPagoInicial,
  cajas,
  formasPago,
  pendiente,
  onConfirmar,
  onCerrar,
}: {
  gasto: ResumenAPagar | null
  formaPagoInicial: string | null
  cajas: string[]
  formasPago: string[]
  /** La acción está corriendo (lo maneja quien abre el modal). */
  pendiente: boolean
  onConfirmar: (datos: DatosPago) => Promise<boolean>
  onCerrar: () => void
}) {
  const [fechaPago, setFechaPago] = useState(hoyISO())
  const [monto, setMonto] = useState<number | null>(gasto?.monto ?? null)
  const [formaPago, setFormaPago] = useState(formaPagoInicial && formasPago.includes(formaPagoInicial) ? formaPagoInicial : '')
  const [caja, setCaja] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const ocupado = pendiente || subiendo
  const montoMal = monto == null || monto <= 0 || (gasto != null && monto > gasto.monto)

  function elegirArchivo(f: File | null) {
    setError(null)
    if (f && f.size > MAX_MB_ARCHIVO * 1024 * 1024) {
      setError(`El comprobante pesa más de ${MAX_MB_ARCHIVO} MB. Sacale una foto más liviana o subí un PDF.`)
      if (input.current) input.current.value = ''
      return
    }
    setArchivo(f)
  }

  async function confirmar() {
    setIntento(true)
    if (!gasto || !fechaPago || !formaPago || !caja || montoMal) return
    setError(null)
    let comprobanteUrl: string | null = null
    if (archivo) {
      setSubiendo(true)
      try {
        comprobanteUrl = (await subirArchivoGasto(gasto.clave, archivo, 'pago')).ruta
      } catch (e) {
        setError(mensajeError(e, 'No se pudo subir el comprobante. Probá de nuevo o registrá el pago sin él.'))
        setSubiendo(false)
        return
      }
      setSubiendo(false)
    }
    // Pagar todo lo que falta viaja como null: si otro pagó una parte en el medio, la base no deja pagar de más.
    await onConfirmar({ fechaPago, formaPago, caja, comprobanteUrl, monto: monto !== gasto.monto ? monto : null })
  }

  const falta = intento && (!fechaPago || !formaPago || !caja || montoMal)

  return (
    <Modal open={gasto != null} onClose={ocupado ? () => {} : onCerrar} title="Registrar pago" size="lg" pantallaCompletaMobile>
      {gasto && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-surface2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-text">{gasto.titulo}</p>
              <p className="text-sm text-muted">
                {gasto.local}
                {gasto.fecha && <> · del {formatearFecha(gasto.fecha)}</>}
                {gasto.detalle && <> · {gasto.detalle}</>}
                {gasto.deFudo && <> · de Fudo</>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums text-text">{formatearMonedaExacta(gasto.monto)}</p>
              {gasto.montoTotal != null && gasto.montoTotal !== gasto.monto && (
                <p className="text-xs text-muted">falta, de <span className="tabular-nums">{formatearMonedaExacta(gasto.montoTotal)}</span></p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monto del pago" obligatorio ayuda="Si pagás una parte, cambialo: el resto queda pendiente.">
              <InputNumero
                value={monto}
                onChange={setMonto}
                min={0}
                ariaLabel="Monto del pago en pesos"
                className={`${controlClass} min-h-11 text-right text-base font-semibold tabular-nums ${intento && montoMal ? 'border-brand-red' : ''}`}
              />
            </Field>
            <Field label="Fecha del pago" obligatorio>
              <DatePicker
                ariaLabel="Fecha del pago"
                value={fechaPago}
                max={hoyISO()}
                onChange={setFechaPago}
                className={`${controlClass} min-h-11 ${intento && !fechaPago ? 'border-brand-red' : ''}`}
              />
            </Field>
            <Field label="Caja" obligatorio>
              <select
                aria-label="Caja de la que salió la plata"
                value={caja}
                onChange={e => setCaja(e.target.value)}
                className={`${controlClass} min-h-11 ${intento && !caja ? 'border-brand-red' : ''}`}
              >
                <option value="">Elegí la caja…</option>
                {cajas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Forma de pago" obligatorio>
            <ChipGroup
              opciones={formasPago.map(f => ({ value: f, label: f }))}
              value={formaPago}
              onChange={setFormaPago}
            />
          </Field>

          <Field label="Comprobante" ayuda={`Opcional. Foto o PDF de hasta ${MAX_MB_ARCHIVO} MB.`}>
            {archivo ? (
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface2 px-3 py-2">
                <IconFileText size={18} className="shrink-0 text-accent-fg" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{archivo.name}</span>
                <button
                  type="button"
                  onClick={() => { setArchivo(null); if (input.current) input.current.value = '' }}
                  disabled={ocupado}
                  aria-label="Quitar el comprobante"
                  className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-brand-red"
                >
                  <IconX size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <label className="presionable flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-text focus-within:border-accent">
                <IconPaperclip size={17} className="shrink-0" aria-hidden />
                Adjuntar la foto o el PDF del pago
                <input
                  ref={input}
                  type="file"
                  accept={TIPOS_ARCHIVO}
                  className="sr-only"
                  onChange={e => elegirArchivo(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </Field>

          {falta && (
            <p className="text-sm text-brand-red">
              {montoMal
                ? `El monto tiene que ser mayor a $ 0 y no más de ${formatearMonedaExacta(gasto.monto)}.`
                : !caja ? 'Elegí de qué caja salió la plata.' : !formaPago ? 'Elegí la forma de pago.' : 'Elegí la fecha del pago.'}
            </p>
          )}
          {error && <p className="text-sm text-brand-red">{error}</p>}
          {gasto.deFudo && (
            <p className="text-xs text-muted">El pago queda anotado acá. En Fudo el gasto sigue figurando como impago: la app no cambia nada en Fudo.</p>
          )}

          <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:flex sm:justify-end sm:bg-transparent sm:px-0 sm:pb-0">
            <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>Cancelar</button>
            <button
              type="button"
              onClick={confirmar}
              disabled={ocupado}
              className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {ocupado ? <Puntos /> : <IconCircleCheck size={16} aria-hidden />}
              {subiendo ? 'Subiendo el comprobante…' : 'Registrar pago'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
