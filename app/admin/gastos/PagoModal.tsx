'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, FileText, Loader2, Paperclip, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DatePicker from '@/components/ui/DatePicker'
import { ChipGroup } from '@/components/ui/Chip'
import { Field, controlClass } from '@/components/ui/Field'
import { createClient } from '@/lib/supabase/client'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import { mensajeError } from '@/lib/errores'
import { BUCKET_COMPROBANTES } from '@/lib/gastos/comprobante'

const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

const MAX_MB = 10
const TIPOS_COMPROBANTE = 'image/jpeg,image/png,image/webp,application/pdf'

export interface DatosPago {
  fechaPago: string
  formaPago: string
  caja: string
  /** Ruta del archivo en el bucket (privado): se abre con un link firmado. */
  comprobanteUrl: string | null
}

/** Lo que se muestra del gasto que se paga: vale para uno de la app o de Fudo. */
export interface ResumenAPagar {
  /** Para la carpeta del comprobante: única entre app y Fudo. */
  clave: string
  titulo: string
  detalle: string | null
  local: string
  fecha: string
  monto: number
  origen: 'app' | 'fudo'
}

/**
 * Sube el comprobante y devuelve su ruta. El bucket es privado: una URL
 * pública no abriría; se guarda la ruta y se firma al mostrarlo.
 */
async function subirComprobante(clave: string, archivo: File): Promise<string> {
  const supabase = createClient()
  const ext = (archivo.name.split('.').pop() ?? 'bin').toLowerCase()
  const carpeta = clave.replace(/[^a-zA-Z0-9_-]/g, '_')
  const path = `gastos/${carpeta}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET_COMPROBANTES).upload(path, archivo, { upsert: false })
  if (error) throw error
  return path
}

/**
 * Registrar el pago de un gasto: fecha, forma de pago, caja y comprobante
 * opcional. El comprobante se sube primero; si la subida falla, no se registra
 * nada y el error dice qué pasó.
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
  const [formaPago, setFormaPago] = useState(formaPagoInicial && formasPago.includes(formaPagoInicial) ? formaPagoInicial : '')
  const [caja, setCaja] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const ocupado = pendiente || subiendo

  function elegirArchivo(f: File | null) {
    setError(null)
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`El comprobante pesa más de ${MAX_MB} MB. Sacale una foto más liviana o subí un PDF.`)
      if (input.current) input.current.value = ''
      return
    }
    setArchivo(f)
  }

  async function confirmar() {
    setIntento(true)
    if (!gasto || !fechaPago || !formaPago || !caja) return
    setError(null)
    let comprobanteUrl: string | null = null
    if (archivo) {
      setSubiendo(true)
      try {
        comprobanteUrl = await subirComprobante(gasto.clave, archivo)
      } catch (e) {
        setError(mensajeError(e, 'No se pudo subir el comprobante. Probá de nuevo o registrá el pago sin él.'))
        setSubiendo(false)
        return
      }
      setSubiendo(false)
    }
    await onConfirmar({ fechaPago, formaPago, caja, comprobanteUrl })
  }

  const falta = intento && (!fechaPago || !formaPago || !caja)

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
                {gasto.origen === 'fudo' && <> · de Fudo</>}
              </p>
            </div>
            <p className="text-xl font-bold tabular-nums text-text">{formatearMonedaExacta(gasto.monto)}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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

          <Field label="Comprobante" ayuda="Opcional. Foto o PDF de hasta 10 MB.">
            {archivo ? (
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface2 px-3 py-2">
                <FileText size={18} className="shrink-0 text-accent-fg" />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{archivo.name}</span>
                <button
                  type="button"
                  onClick={() => { setArchivo(null); if (input.current) input.current.value = '' }}
                  disabled={ocupado}
                  aria-label="Quitar el comprobante"
                  className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-brand-red"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="presionable flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-text focus-within:border-accent">
                <Paperclip size={17} className="shrink-0" />
                Adjuntar la foto o el PDF del pago
                <input
                  ref={input}
                  type="file"
                  accept={TIPOS_COMPROBANTE}
                  className="sr-only"
                  onChange={e => elegirArchivo(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </Field>

          {falta && (
            <p className="text-sm text-brand-red">
              {!caja ? 'Elegí de qué caja salió la plata.' : !formaPago ? 'Elegí la forma de pago.' : 'Elegí la fecha del pago.'}
            </p>
          )}
          {error && <p className="text-sm text-brand-red">{error}</p>}
          {gasto.origen === 'fudo' && (
            <p className="text-xs text-muted">El pago queda anotado acá. En Fudo el gasto sigue figurando como impago.</p>
          )}

          <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:flex sm:justify-end sm:bg-transparent sm:px-0 sm:pb-0">
            <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>Cancelar</button>
            <button
              type="button"
              onClick={confirmar}
              disabled={ocupado}
              className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {subiendo ? 'Subiendo el comprobante…' : 'Registrar pago'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
