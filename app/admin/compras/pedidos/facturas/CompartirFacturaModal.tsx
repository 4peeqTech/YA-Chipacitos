'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Download, ImageIcon, Info, MessageSquareText, RotateCcw, Share2, TriangleAlert } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Pestanas, { panelDe } from '@/components/ui/Pestanas'
import CompartirMensaje from '@/components/ui/CompartirMensaje'
import { Skeleton } from '@/components/ui/Skeleton'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { copiarImagen, descargar, puedeCompartirArchivos, puedeCopiarImagen } from '@/lib/compartir'
import { altoComprobante, nombreArchivoComprobante } from '@/lib/compras/comprobanteFactura'
import { CUERPO_FACTURA_FALLBACK, renderPlantillaFactura } from '@/lib/compras/facturaMensaje'
import { datosCompartirFactura, type DatosCompartir } from './compartir'

// B2: compartir una factura confirmada. La imagen la genera el servidor
// (/api/compras/facturas/[id]/comprobante) y se pide al abrir, no al tocar el
// botón: navigator.share y clipboard.write tienen que correr sincrónicos en el
// gesto del usuario (Safari iOS pierde la activación si hay un await en el medio).

const LARGO_AVISO = 3500
const ID_BASE = 'compartir-factura'

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

type Imagen =
  | { estado: 'cargando' }
  | { estado: 'error'; error: string }
  | { estado: 'lista'; blob: Blob; file: File; url: string }

type Datos =
  | { estado: 'cargando' }
  | { estado: 'error'; error: string }
  | { estado: 'listo'; data: DatosCompartir }

function nombreDeCabecera(disposicion: string | null): string | null {
  return disposicion?.match(/filename="([^"]+)"/)?.[1] ?? null
}

function Aviso({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3 sm:flex-row sm:items-center">
      <p className="flex flex-1 items-start gap-2 text-sm text-text">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" /> {texto}
      </p>
      <button type="button" onClick={onReintentar} className={botonSecundario}>
        <RotateCcw size={16} /> Reintentar
      </button>
    </div>
  )
}

export default function CompartirFacturaModal({
  facturaId,
  numero,
  onCerrar,
}: {
  facturaId: string
  numero: string
  onCerrar: () => void
}) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [pestana, setPestana] = useState<'imagen' | 'mensaje'>('imagen')
  const [imagen, setImagen] = useState<Imagen>({ estado: 'cargando' })
  const [datos, setDatos] = useState<Datos>({ estado: 'cargando' })
  const [copiada, setCopiada] = useState(false)

  // Mensaje: el texto arranca en el de la plantilla y se puede retocar.
  const [plantillaId, setPlantillaId] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  // Una respuesta vieja (un Reintentar encima de otro) no pisa a la nueva.
  const vigenteImagen = useRef(0)
  const vigenteDatos = useRef(0)
  const urlActual = useRef<string | null>(null)
  const timerCopiada = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargarImagen = useCallback(async () => {
    const n = ++vigenteImagen.current
    setImagen({ estado: 'cargando' })
    try {
      const res = await fetch(`/api/compras/facturas/${facturaId}/comprobante`, { cache: 'no-store' })
      if (!res.ok) {
        const error = (await res.text()) || 'No se pudo generar la imagen'
        if (n === vigenteImagen.current) setImagen({ estado: 'error', error })
        return
      }
      const blob = await res.blob()
      if (n !== vigenteImagen.current) return
      const nombre = nombreDeCabecera(res.headers.get('Content-Disposition')) ?? `Factura-${numero}.png`
      const file = new File([blob], nombre, { type: 'image/png' })
      const url = URL.createObjectURL(blob)
      if (urlActual.current) URL.revokeObjectURL(urlActual.current)
      urlActual.current = url
      setImagen({ estado: 'lista', blob, file, url })
    } catch {
      if (n === vigenteImagen.current) setImagen({ estado: 'error', error: 'No se pudo generar la imagen. Revisá la conexión.' })
    }
  }, [facturaId, numero])

  const cargarDatos = useCallback(async () => {
    const n = ++vigenteDatos.current
    setDatos({ estado: 'cargando' })
    try {
      const r = await datosCompartirFactura(facturaId)
      if (n !== vigenteDatos.current) return
      if (!r.ok) { setDatos({ estado: 'error', error: r.error }); return }
      const inicial = r.data.plantillas.find(p => p.es_default) ?? r.data.plantillas[0] ?? null
      setPlantillaId(inicial?.id ?? null)
      setTexto(renderPlantillaFactura(inicial?.cuerpo ?? CUERPO_FACTURA_FALLBACK, r.data.comprobante))
      setDatos({ estado: 'listo', data: r.data })
    } catch {
      if (n === vigenteDatos.current) setDatos({ estado: 'error', error: 'No se pudo preparar el mensaje. Revisá la conexión.' })
    }
  }, [facturaId])

  useEffect(() => {
    // Las dos cargas son asíncronas: los setState iniciales no disparan un render en cascada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarImagen()
    void cargarDatos()
  }, [cargarImagen, cargarDatos])

  useEffect(() => () => {
    vigenteImagen.current++
    vigenteDatos.current++
    if (urlActual.current) URL.revokeObjectURL(urlActual.current)
    if (timerCopiada.current) clearTimeout(timerCopiada.current)
  }, [])

  const comprobante = datos.estado === 'listo' ? datos.data.comprobante : null
  const plantillas = datos.estado === 'listo' ? datos.data.plantillas : []
  const whatsappAdmin = datos.estado === 'listo' ? datos.data.whatsappAdmin : null
  const cuerpoActual = plantillas.find(p => p.id === plantillaId)?.cuerpo ?? CUERPO_FACTURA_FALLBACK
  const textoPlantilla = comprobante ? renderPlantillaFactura(cuerpoActual, comprobante) : ''
  const editado = comprobante != null && texto !== textoPlantilla

  const nombreArchivo = imagen.estado === 'lista'
    ? imagen.file.name
    : comprobante ? nombreArchivoComprobante(comprobante) : `Factura-${numero}.png`
  const titulo = comprobante ? `Factura ${comprobante.numero} · ${comprobante.proveedor.nombre}` : `Factura ${numero}`

  // Se calculan con la imagen lista: dependen del navegador, no del servidor.
  const puedeCompartir = imagen.estado === 'lista' && puedeCompartirArchivos(imagen.file)
  const puedeCopiar = imagen.estado === 'lista' && puedeCopiarImagen()

  function compartir() {
    if (imagen.estado !== 'lista') return
    navigator.share({ files: [imagen.file], title: titulo }).catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return
      toast.error('No se pudo compartir. Descargala y mandala a mano.')
    })
  }

  function bajar() {
    if (imagen.estado !== 'lista') return
    descargar(imagen.blob, nombreArchivo)
    toast.success('Imagen descargada')
  }

  function copiar() {
    if (imagen.estado !== 'lista') return
    copiarImagen(imagen.blob).then(() => {
      setCopiada(true)
      if (timerCopiada.current) clearTimeout(timerCopiada.current)
      timerCopiada.current = setTimeout(() => setCopiada(false), 2000)
    }).catch(() => toast.error('Tu navegador no deja copiar imágenes: descargala.'))
  }

  function cambiarPlantilla(id: string) {
    const aplicar = () => {
      setPlantillaId(id)
      const cuerpo = plantillas.find(p => p.id === id)?.cuerpo ?? CUERPO_FACTURA_FALLBACK
      if (comprobante) setTexto(renderPlantillaFactura(cuerpo, comprobante))
    }
    if (!editado) { aplicar(); return }
    confirmar({
      titulo: 'Cambiar de plantilla',
      mensaje: 'Se pierde lo que cambiaste en el texto.',
      textoConfirmar: 'Cambiar',
      onConfirmar: aplicar,
    })
  }

  const proporcion = comprobante ? `1080 / ${altoComprobante(comprobante)}` : '1080 / 1300'

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Compartir factura"
      encabezado={<span>Compartir · <span className="font-mono">{numero}</span></span>}
      size="lg"
      pantallaCompletaMobile
    >
      <div className="space-y-4">
        <Pestanas
          idBase={ID_BASE}
          etiqueta="Qué compartir"
          activa={pestana}
          onCambiar={id => setPestana(id as 'imagen' | 'mensaje')}
          items={[
            { id: 'imagen', label: 'Imagen', icon: <ImageIcon size={16} /> },
            { id: 'mensaje', label: 'Mensaje', icon: <MessageSquareText size={16} /> },
          ]}
        />

        <div {...panelDe(ID_BASE, 'imagen')} hidden={pestana !== 'imagen'} className="space-y-4">
          {imagen.estado === 'cargando' && (
            <div aria-label="Generando la imagen" className="w-full animate-pulse rounded-xl bg-surface2" style={{ aspectRatio: proporcion, maxHeight: '60vh' }} />
          )}
          {imagen.estado === 'error' && <Aviso texto={imagen.error} onReintentar={cargarImagen} />}
          {imagen.estado === 'lista' && (
            <div className="sm:max-h-[60vh] sm:overflow-y-auto rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- es un blob local, next/image no aplica */}
              <img
                src={imagen.url}
                alt={`Comprobante interno de la factura ${comprobante?.numero ?? numero}${comprobante ? ` de ${comprobante.proveedor.nombre}` : ''}. No válido como factura.`}
                className="w-full rounded-xl border border-border shadow-sm"
              />
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {puedeCompartir && (
              <button type="button" onClick={compartir} className={botonPrimario}>
                <Share2 size={16} /> Compartir
              </button>
            )}
            <button
              type="button"
              onClick={bajar}
              disabled={imagen.estado !== 'lista'}
              className={puedeCompartir ? botonSecundario : botonPrimario}
            >
              <Download size={16} /> Descargar
            </button>
            {puedeCopiar && (
              <button type="button" onClick={copiar} className={botonSecundario}>
                {copiada ? <Check size={16} className="text-success" /> : <Copy size={16} />} {copiada ? 'Copiada' : 'Copiar imagen'}
              </button>
            )}
          </div>

          <p className="flex items-start gap-2 text-xs text-muted">
            <Info size={14} className="mt-0.5 shrink-0" />
            Es un comprobante interno para compartir: la imagen dice que no es una factura oficial.
          </p>
        </div>

        <div {...panelDe(ID_BASE, 'mensaje')} hidden={pestana !== 'mensaje'} className="space-y-4">
          {datos.estado === 'cargando' && <Skeleton className="h-64 w-full rounded-xl" />}
          {datos.estado === 'error' && <Aviso texto={datos.error} onReintentar={cargarDatos} />}
          {datos.estado === 'listo' && (
            <>
              {plantillas.length > 1 && (
                <Field label="Plantilla">
                  <select
                    aria-label="Plantilla"
                    value={plantillaId ?? ''}
                    onChange={e => cambiarPlantilla(e.target.value)}
                    className={`${controlClass} min-h-11`}
                  >
                    {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.es_default ? ' (predeterminada)' : ''}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Mensaje" ayuda={plantillas.length === 0 ? 'Sin plantillas de factura: formato estándar.' : 'Podés retocarlo antes de mandarlo.'}>
                <textarea
                  aria-label="Mensaje"
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  rows={12}
                  className={`${controlClass} font-sans`}
                />
              </Field>

              {editado && (
                <button
                  type="button"
                  onClick={() => setTexto(textoPlantilla)}
                  className="presionable min-h-11 inline-flex items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:text-text hover:bg-surface2"
                >
                  <RotateCcw size={16} /> Volver al texto de la plantilla
                </button>
              )}

              {texto.length > LARGO_AVISO && (
                <p className="text-xs text-warning">Mensaje largo: si WhatsApp lo corta, usá Copiar.</p>
              )}

              <CompartirMensaje
                mensaje={texto}
                deshabilitado={!texto.trim()}
                telefono={whatsappAdmin}
                etiquetaWhatsApp={whatsappAdmin ? 'Enviar a la administración' : 'Enviar por WhatsApp'}
                ofrecerSinNumero
              />

              {!whatsappAdmin && (
                <p className="flex items-start gap-2 text-xs text-muted">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  WhatsApp se abre para que elijas el contacto. Podés fijar el número de la administración en Plantillas.
                </p>
              )}

              <Link href="/admin/proveedores/plantillas?tipo=factura" className="inline-block text-xs font-medium text-accent-fg underline-offset-2 hover:underline">
                Editar plantillas de factura
              </Link>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
