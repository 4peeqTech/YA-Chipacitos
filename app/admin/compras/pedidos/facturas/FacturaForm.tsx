'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertTriangle, Ban, Check, Info, Loader2, PackageCheck, PackageX, Plus, ReceiptText, Trash2, X,
} from 'lucide-react'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import InputNumero from '@/components/ui/InputNumero'
import DatePicker from '@/components/ui/DatePicker'
import Modal from '@/components/ui/Modal'
import { ChipGroup } from '@/components/ui/Chip'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearFechaHora, formatearMonedaExacta } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import {
  ALICUOTAS, avisaPorPapel, diferenciaPapel, etiquetaAlicuota, subtotalLinea, variacionPrecio,
} from '@/lib/compras/totalesFactura'
import { conUnidad } from '../modelo'
import { ResumenImpacto, type NombresInsumo } from '../remitos/RemitoForm'
import type { ImpactoItem } from '../remitos/modelo'
import { anularFactura, confirmarFactura, descartarFactura, guardarFactura } from './acciones'
import {
  agregarDelPedido, armarEnvio, estadoInicial, facturaDuplicada, faltantesDelPedido,
  lineaLibre, mensajeProblema, pedidosFacturables, resumenRecepcion, tieneRemitos, totales, validar,
  type ContextoPedido, type EstadoFactura, type FacturaVista, type LineaFactura,
} from './modelo'
import type { FacturaItemFila, InsumoFactura, PedidoFactura, PrecioRef } from './datos'
import type { LineaPendiente } from '../datos'

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

/** Encabezado de los confirm: la factura y su pedido, bien legibles. */
function CabeceraFactura({ numero, pedido }: { numero: string; pedido: PedidoFactura | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-surface2 px-4 py-3">
      <span className="font-mono text-lg font-bold tabular-nums text-text">{numero || 'Factura'}</span>
      {pedido && (
        <span className="text-sm text-muted">
          del pedido <span className="font-mono font-semibold tabular-nums text-text">{codigoPedido(pedido.numero)}</span>
          {' · '}<span className="text-text">{pedido.proveedores?.nombre ?? '—'}</span>
        </span>
      )}
    </div>
  )
}

/** Las dos salidas de FA1/FA2, con lo que pasa con el stock en cada una. */
function PreguntaMercaderia({
  open, numero, pedido, onResponder, onCerrar,
}: {
  open: boolean
  numero: string
  pedido: PedidoFactura | null
  onResponder: (llego: boolean) => void
  onCerrar: () => void
}) {
  const opciones: { llego: boolean; icono: typeof PackageCheck; titulo: string; detalle: string }[] = [
    {
      llego: true,
      icono: PackageCheck,
      titulo: 'Sí, ya llegó',
      detalle: 'Registramos un remito con lo que dice la factura y el stock suma.',
    },
    {
      llego: false,
      icono: PackageX,
      titulo: 'No, llega después',
      detalle: 'El pedido queda “Facturado · falta recibir”. El stock no se mueve hasta que cargues el remito.',
    },
  ]
  return (
    <Modal open={open} onClose={onCerrar} title="¿Ya llegó la mercadería?" size="lg">
      <div className="space-y-4">
        <CabeceraFactura numero={numero} pedido={pedido} />
        <p className="text-sm text-muted">
          Este pedido no tiene ningún remito cargado. Contanos si la mercadería ya está en el depósito: de eso
          depende que el stock suba ahora o cuando llegue.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {opciones.map(o => (
            <button
              key={o.titulo}
              type="button"
              onClick={() => onResponder(o.llego)}
              className="presionable flex flex-col items-start gap-2 rounded-xl border border-border bg-surface2 p-4 text-left hover:border-accent"
            >
              <o.icono size={22} className="text-accent-fg" />
              <span className="text-sm font-bold text-text">{o.titulo}</span>
              <span className="text-xs text-muted">{o.detalle}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end border-t border-border pt-3">
          <button type="button" onClick={onCerrar} className={botonSecundario}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}

// TODO(config): motivos de anulación a compras_config si Marcos quiere editarlos.
const MOTIVOS_ANULAR = ['Cargada al pedido equivocado', 'Datos mal cargados', 'La anuló el proveedor', 'Otro'] as const
type MotivoAnular = (typeof MOTIVOS_ANULAR)[number]

/** FA8: anular pide motivo, así que va en su propio paso en vez del confirm común. */
function AnularFacturaModal({
  open, numero, pedido, generoRemito, pendiente, onAnular, onCerrar,
}: {
  open: boolean
  numero: string
  pedido: PedidoFactura | null
  generoRemito: boolean
  pendiente: boolean
  onAnular: (motivo: string) => void
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoAnular | ''>('')
  const [otro, setOtro] = useState('')
  const [intento, setIntento] = useState(false)
  const texto = motivo === 'Otro' ? otro.trim() : motivo

  function anular() {
    setIntento(true)
    if (!texto) return
    onAnular(texto)
  }

  return (
    <Modal open={open} onClose={onCerrar} title="Anular factura" accent="red" size="lg">
      <div className="space-y-5">
        <CabeceraFactura numero={numero} pedido={pedido} />
        <p className="text-sm text-text">
          La factura queda registrada como anulada y el pedido vuelve a estar sin facturar.
          {generoRemito && <> Se elimina el remito que había generado y el stock vuelve atrás.</>}
        </p>

        <Field label="¿Por qué la anulás?" obligatorio>
          <ChipGroup
            opciones={MOTIVOS_ANULAR.map(m => ({ value: m, label: m }))}
            value={motivo as MotivoAnular}
            onChange={setMotivo}
          />
        </Field>

        {motivo === 'Otro' && (
          <Field label="Contanos el motivo" obligatorio>
            <textarea
              aria-label="Motivo de la anulación"
              value={otro}
              onChange={e => setOtro(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="Ej.: el proveedor mandó la factura corregida"
              className={controlClass}
            />
          </Field>
        )}

        {intento && !texto && (
          <p className="text-sm text-brand-red">{motivo === 'Otro' ? 'Escribí el motivo.' : 'Elegí un motivo.'}</p>
        )}

        <p className="flex items-start gap-2 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          Queda registrado con quién y cuándo. Después podés cargar la factura corregida en el pedido que corresponda.
        </p>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={pendiente} className={botonSecundario}>Volver</button>
          <button
            type="button"
            onClick={anular}
            disabled={pendiente}
            className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {pendiente ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Anular factura
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function FacturaForm({
  factura,
  items,
  facturas,
  pedidos,
  pedidoIdInicial,
  lineas,
  precios,
  insumos,
  stockPorItem,
  onCambios,
  onListo,
  onCancelar,
}: {
  factura: FacturaVista | null
  items: FacturaItemFila[]
  facturas: FacturaVista[]
  pedidos: PedidoFactura[]
  pedidoIdInicial: string | null
  lineas: LineaPendiente[]
  precios: PrecioRef[]
  insumos: InsumoFactura[]
  stockPorItem: Record<string, number>
  onCambios: () => void
  onListo: () => void
  onCancelar: () => void
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [pedidoId, setPedidoId] = useState(factura?.pedidoId ?? pedidoIdInicial ?? '')
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [preguntaAbierta, setPreguntaAbierta] = useState(false)
  const [anularAbierto, setAnularAbierto] = useState(false)

  const estadoFactura = factura?.estado ?? 'borrador'
  const soloLectura = estadoFactura !== 'borrador'

  const insumosPorId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos])
  const pedido = useMemo(() => pedidos.find(p => p.id === pedidoId) ?? null, [pedidos, pedidoId])
  const lineasDelPedido = useMemo(() => lineas.filter(l => l.pedido_id === pedidoId), [lineas, pedidoId])

  const ctx = useMemo<ContextoPedido | null>(() => {
    if (!pedido) return null
    const deEsteProveedor = new Map(
      precios.filter(p => p.proveedor_id === pedido.proveedor_id && p.precio_ref != null).map(p => [p.item_id, p.precio_ref as number]),
    )
    return { pedido, lineas: lineasDelPedido, precios: deEsteProveedor, insumos: insumosPorId }
  }, [pedido, lineasDelPedido, precios, insumosPorId])

  const [estado, setEstado] = useState<EstadoFactura>(() => estadoInicial(factura, items, ctx))

  // Las líneas que teníamos al abrir: la RPC las usa para no borrar lo que la
  // pantalla nunca llegó a mostrar.
  const idsConocidos = useRef<string[]>(items.map(i => i.id))
  // Id de la factura una vez creada. Sin esto, si el guardado anda pero la
  // confirmación falla, el reintento crearía una segunda factura del mismo
  // pedido y chocaría contra el índice único.
  const idGuardado = useRef<string | null>(factura?.id ?? null)

  const nombres = useMemo(() => {
    const res: Record<string, NombresInsumo> = {}
    for (const i of insumos) res[i.id] = { nombre: i.nombre, unidad: i.unidad }
    for (const l of lineasDelPedido) {
      if (l.item_id && !res[l.item_id]) res[l.item_id] = { nombre: l.descripcion ?? 'Insumo', unidad: l.unidad }
    }
    return res
  }, [insumos, lineasDelPedido])

  const t = useMemo(() => totales(estado), [estado])
  const duplicada = useMemo(
    () => facturaDuplicada(estado.numero, pedido?.proveedor_id ?? null, factura?.id ?? null, facturas),
    [estado.numero, pedido, factura, facturas],
  )
  const faltantes = useMemo(() => faltantesDelPedido(estado, ctx), [estado, ctx])
  const problema = validar(estado)
  const diferencia = diferenciaPapel(t.total, estado.totalPapel)
  const avisaPapel = avisaPorPapel(t.total, estado.totalPapel)
  const sinRemitos = pedido != null && !tieneRemitos(pedido)

  /** Lo que sumaría al stock el remito "desde factura" (FA1). */
  const impactoStock = useMemo<ImpactoItem[]>(() => {
    const porItem = new Map<string, number>()
    for (const l of estado.lineas) {
      if (!l.itemId || !l.cantidad || l.cantidad <= 0) continue
      porItem.set(l.itemId, (porItem.get(l.itemId) ?? 0) + l.cantidad)
    }
    return [...porItem.entries()].map(([itemId, delta]) => {
      const antes = stockPorItem[itemId] ?? 0
      return { itemId, delta, antes, despues: antes + delta }
    })
  }, [estado.lineas, stockPorItem])

  const preciosACambiar = useMemo(
    () => estado.lineas.filter(l => l.itemId && (l.precioUnitario ?? 0) > 0 && l.precioUnitario !== l.precioRef).length,
    [estado.lineas],
  )

  function cambiar(fn: (e: EstadoFactura) => EstadoFactura) {
    setEstado(fn)
    onCambios()
  }

  function actualizarLinea(clave: string, fn: (l: LineaFactura) => LineaFactura) {
    cambiar(e => ({ ...e, lineas: e.lineas.map(l => (l.clave === clave ? fn(l) : l)) }))
  }

  function elegirPedido(id: string) {
    setPedidoId(id)
    const p = pedidos.find(x => x.id === id) ?? null
    const nuevas = p
      ? estadoInicial(null, [], {
        pedido: p,
        lineas: lineas.filter(l => l.pedido_id === id),
        precios: new Map(precios.filter(x => x.proveedor_id === p.proveedor_id && x.precio_ref != null).map(x => [x.item_id, x.precio_ref as number])),
        insumos: insumosPorId,
      })
      : estadoInicial(null, [], null)
    setEstado(e => ({ ...nuevas, numero: e.numero, fecha: e.fecha, vencimiento: e.vencimiento }))
    setIntentoGuardar(false)
    onCambios()
  }

  /** Guarda el borrador y devuelve su id, o null si algo falló (ya avisado). */
  async function guardar(): Promise<string | null> {
    const yaExiste = idGuardado.current
    const r = await guardarFactura({
      facturaId: yaExiste,
      pedidoId: yaExiste ? null : pedidoId,
      numero: estado.numero.trim(),
      fecha: estado.fecha,
      vencimiento: estado.vencimiento || null,
      totalPapel: estado.totalPapel,
      observaciones: estado.observaciones.trim() || null,
      lineas: armarEnvio(estado),
      idsConocidos: idsConocidos.current,
    })
    if (!r.ok) { toast.error(r.error); return null }
    idGuardado.current = r.data.id
    // Las líneas nuevas ya tienen id: se lo pegamos a las del formulario para
    // que un segundo guardado (o un reintento) las actualice en vez de
    // duplicarlas, y para que la RPC vea que las conocemos todas.
    idsConocidos.current = r.data.items
    setEstado(e => ({ ...e, lineas: e.lineas.map((l, i) => ({ ...l, id: r.data.items[i] ?? l.id })) }))
    return r.data.id
  }

  function revisar(paraConfirmar: boolean): boolean {
    if (!pedido) { toast.error('Elegí el pedido al que corresponde la factura.'); return false }
    const p = validar(estado, paraConfirmar)
    if (p) { setIntentoGuardar(true); toast.error(mensajeProblema(p)); return false }
    if (duplicada) {
      setIntentoGuardar(true)
      toast.error(`Ya cargaste esa factura de ${pedido.proveedores?.nombre ?? 'este proveedor'} (pedido ${duplicada.codigo}).`)
      return false
    }
    return true
  }

  function onGuardarBorrador() {
    if (!revisar(false)) return
    startTransition(async () => {
      const id = await guardar()
      if (!id) return
      toast.success(factura ? 'Borrador actualizado' : 'Factura guardada como borrador')
      onListo()
    })
  }

  function onConfirmar() {
    if (!revisar(true)) return
    if (sinRemitos) { setPreguntaAbierta(true); return }
    pedirConfirmacion(null)
  }

  function pedirConfirmacion(llego: boolean | null) {
    setPreguntaAbierta(false)
    const sumaStock = llego === true && impactoStock.length > 0
    confirmar({
      // El número va en el cuerpo (mono): la Syne del título dibuja los ceros como "o".
      titulo: 'Confirmar factura',
      mensaje: (
        <div className="space-y-3">
          <CabeceraFactura numero={estado.numero} pedido={pedido} />
          <p className="text-sm text-text">
            Se confirma por <strong className="tabular-nums">{formatearMonedaExacta(t.total)}</strong>
            {estado.vencimiento && <> · vence el {formatearFecha(estado.vencimiento)}</>}.
            {' '}El pedido pasa a <strong>Facturado</strong>{llego === false && <> · falta recibir</>}.
          </p>
          {sumaStock && (
            <>
              <p className="text-sm text-text">Se registra un remito con lo facturado y el stock suma:</p>
              <ResumenImpacto impacto={impactoStock} nombres={nombres} />
            </>
          )}
          {llego === false && (
            <p className="text-sm text-muted">El stock no se mueve: va a sumar cuando cargues el remito.</p>
          )}
          {estado.actualizarPrecios && preciosACambiar > 0 && (
            <p className="text-sm text-muted">
              {preciosACambiar === 1
                ? 'Se actualiza el precio de referencia de 1 insumo de este proveedor.'
                : `Se actualizan los precios de referencia de ${preciosACambiar} insumos de este proveedor.`}
            </p>
          )}
          {avisaPapel && (
            <p className="flex items-start gap-1.5 text-sm text-warning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              El total no coincide con el del papel por {formatearMonedaExacta(Math.abs(diferencia ?? 0))}. Se confirma igual.
            </p>
          )}
        </div>
      ),
      ancho: 'lg',
      textoConfirmar: 'Confirmar factura',
      onConfirmar: () => startTransition(async () => {
        const id = await guardar()
        if (!id) return
        const r = await confirmarFactura({ facturaId: id, mercaderiaLlego: llego, actualizarPrecios: estado.actualizarPrecios })
        if (!r.ok) { toast.error(r.error); return }
        toast.success(r.data.remitoGenerado
          ? `Factura confirmada · remito ${r.data.remitoGenerado}`
          : 'Factura confirmada')
        onListo()
      }),
    })
  }

  function onAnular(motivo: string) {
    if (!factura) return
    startTransition(async () => {
      const r = await anularFactura({ facturaId: factura.id, motivo })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(r.data.remitoEliminado
        ? `Factura anulada · remito ${r.data.remitoEliminado} eliminado`
        : 'Factura anulada')
      onListo()
    })
  }

  function onDescartar() {
    if (!factura) return
    confirmar({
      titulo: 'Descartar borrador',
      mensaje: 'Se borra el borrador de la factura. No movió stock ni tocó el pedido, así que no queda rastro.',
      textoConfirmar: 'Descartar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await descartarFactura(factura.id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success('Borrador descartado')
        onListo()
      }),
    })
  }

  const opcionesPedido: OpcionSelect[] = pedidosFacturables(pedidos, facturas).map(p => ({
    value: p.id,
    label: `${codigoPedido(p.numero)} · ${p.proveedores?.nombre ?? '—'}${p.enviado_en ? ` — enviado ${formatearFecha(p.enviado_en.slice(0, 10))}` : ''}`,
    grupo: p.estado_recepcion === 'recibido' ? 'Recibidos' : 'Esperando mercadería',
  }))

  return (
    <div className="space-y-5">
      {/* 1. Pedido */}
      <section className="space-y-2">
        <Field label="Pedido" obligatorio>
          {factura ? (
            <p className="flex min-h-11 items-center text-sm text-text">
              <span className="font-mono tabular-nums">{pedido ? codigoPedido(pedido.numero) : '—'}</span>
              <span className="text-muted">&nbsp;·&nbsp;{pedido?.proveedores?.nombre ?? '—'}</span>
            </p>
          ) : (
            <SelectBuscador value={pedidoId} onChange={elegirPedido} opciones={opcionesPedido} placeholderVacio="Elegí un pedido…" />
          )}
        </Field>
        {pedido && (
          <p className="text-xs text-muted">
            {pedido.enviado_en && <>Enviado el {formatearFecha(pedido.enviado_en.slice(0, 10))} · </>}
            {resumenRecepcion(pedido, lineasDelPedido)}
          </p>
        )}
      </section>

      {!pedido ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          Elegí el pedido para cargar su factura. Solo aparecen los pedidos enviados que todavía no tienen una.
        </p>
      ) : (
        <>
          {/* 2. Datos de la factura */}
          <section className="grid gap-4 sm:grid-cols-[1fr_9rem_9rem]">
            <Field label="Número de la factura" obligatorio>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Número de la factura, como figura en el papel"
                placeholder="0003-00012345"
                disabled={soloLectura}
                className={`${controlClass} min-h-11 font-mono tabular-nums ${intentoGuardar && (problema?.tipo === 'sin_numero' || duplicada) ? 'border-brand-red' : ''}`}
                value={estado.numero}
                onChange={e => { const v = e.target.value; cambiar(s => ({ ...s, numero: v })) }}
              />
            </Field>
            <Field label="Fecha" obligatorio>
              <DatePicker
                ariaLabel="Fecha de la factura"
                disabled={soloLectura}
                className={`${controlClass} min-h-11 ${intentoGuardar && problema?.tipo === 'sin_fecha' ? 'border-brand-red' : ''}`}
                value={estado.fecha}
                onChange={fecha => cambiar(s => ({ ...s, fecha }))}
              />
            </Field>
            <Field label="Vence">
              {soloLectura && !estado.vencimiento ? (
                <p className="flex min-h-11 items-center text-sm text-muted">Sin vencimiento</p>
              ) : (
                <DatePicker
                  ariaLabel="Fecha de vencimiento de la factura"
                  min={estado.fecha || undefined}
                  limpiable
                  disabled={soloLectura}
                  className={`${controlClass} min-h-11 ${intentoGuardar && problema?.tipo === 'vencimiento_antes' ? 'border-brand-red' : ''}`}
                  value={estado.vencimiento}
                  onChange={vencimiento => cambiar(s => ({ ...s, vencimiento }))}
                />
              )}
            </Field>
          </section>

          {duplicada && (
            <p className="flex items-start gap-1.5 rounded-xl border border-warning bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Ya cargaste una factura con este número para {pedido.proveedores?.nombre ?? 'este proveedor'}
              {duplicada.pedidoNumero != null && <> (pedido <span className="font-mono tabular-nums">{duplicada.codigo}</span>)</>}.
              Revisá el número antes de guardar.
            </p>
          )}

          {/* 3. Líneas */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-text">Qué dice la factura</h4>
              <span className="text-xs text-muted">
                {tieneRemitos(pedido) ? 'Prellenado con lo que llegó por remitos.' : 'Prellenado con lo que se pidió.'}
              </span>
            </div>

            {estado.lineas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                La factura todavía no tiene líneas. Agregá al menos una.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {estado.lineas.map(l => {
                  const variacion = variacionPrecio(l.precioUnitario, l.precioRef)
                  const vacia = intentoGuardar && problema?.tipo === 'linea_incompleta' && problema.clave === l.clave
                  return (
                    <li key={l.clave} className="space-y-2 px-3 py-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          aria-label="Descripción de la línea, como figura en la factura"
                          placeholder="Descripción, como figura en la factura"
                          disabled={soloLectura}
                          className={`${controlClass} min-h-11 flex-1 ${vacia ? 'border-brand-red' : ''}`}
                          value={l.descripcion}
                          onChange={e => { const v = e.target.value; actualizarLinea(l.clave, x => ({ ...x, descripcion: v })) }}
                        />
                        {!soloLectura && (
                          <button
                            type="button"
                            onClick={() => cambiar(e => ({ ...e, lineas: e.lineas.filter(x => x.clave !== l.clave) }))}
                            aria-label={`Quitar la línea ${l.descripcion || 'sin descripción'}`}
                            title="Quitar esta línea"
                            className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-brand-red"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-24">
                          <span className="mb-1 block text-2xs uppercase tracking-wider text-muted" aria-hidden>Cantidad</span>
                          <InputNumero
                            value={l.cantidad}
                            onChange={v => actualizarLinea(l.clave, x => ({ ...x, cantidad: v }))}
                            placeholder="0"
                            min={0}
                            disabled={soloLectura}
                            className={`${controlClass} min-h-11 text-right tabular-nums`}
                            ariaLabel={`Cantidad facturada de ${l.descripcion || 'la línea'}`}
                          />
                        </div>
                        <div className="w-32">
                          <span className="mb-1 block text-2xs uppercase tracking-wider text-muted" aria-hidden>Precio por unidad</span>
                          <InputNumero
                            value={l.precioUnitario}
                            onChange={v => actualizarLinea(l.clave, x => ({ ...x, precioUnitario: v }))}
                            placeholder="0"
                            min={0}
                            disabled={soloLectura}
                            className={`${controlClass} min-h-11 text-right tabular-nums`}
                            ariaLabel={`Precio por unidad de ${l.descripcion || 'la línea'}`}
                          />
                        </div>
                        <div className="w-24">
                          <label className="mb-1 block text-2xs uppercase tracking-wider text-muted" htmlFor={`iva-${l.clave}`}>IVA</label>
                          <select
                            id={`iva-${l.clave}`}
                            aria-label={`Alícuota de IVA de ${l.descripcion || 'la línea'}`}
                            disabled={soloLectura}
                            className={`${controlClass} min-h-11`}
                            value={String(l.alicuotaIva)}
                            onChange={e => { const v = Number(e.target.value); actualizarLinea(l.clave, x => ({ ...x, alicuotaIva: v })) }}
                          >
                            {ALICUOTAS.map(a => <option key={a} value={a}>{etiquetaAlicuota(a)}</option>)}
                          </select>
                        </div>
                        <div className="ml-auto text-right">
                          <span className="block text-2xs uppercase tracking-wider text-muted">Subtotal</span>
                          <span className="block min-h-11 pt-2.5 text-sm font-semibold tabular-nums text-text">{formatearMonedaExacta(subtotalLinea(l))}</span>
                        </div>
                      </div>

                      <p className="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
                        {l.pedido != null && <span>Pedido {conUnidad(l.pedido, l.unidad)}</span>}
                        {l.recibido != null && l.recibido > 0 && <span>llegó {conUnidad(l.recibido, l.unidad)}</span>}
                        {variacion != null && (
                          <span className={variacion > 0 ? 'font-semibold text-warning' : 'font-semibold text-success'}>
                            {variacion > 0 ? '↑' : '↓'} {Math.abs(variacion)} % vs. el último precio ({formatearMonedaExacta(l.precioRef ?? 0)})
                          </span>
                        )}
                        {!l.itemId && <span>No mueve stock</span>}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}

            {!soloLectura && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => cambiar(e => ({ ...e, lineas: [...e.lineas, lineaLibre()] }))}
                  className={botonSecundario}
                >
                  <Plus size={15} /> Agregar una línea
                </button>
                <span className="text-xs text-muted">Para el flete u otros cargos que no son mercadería.</span>
              </div>
            )}

            {!soloLectura && faltantes.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-dashed border-border px-3 py-2.5">
                <p className="text-xs text-muted">Del pedido no está en la factura:</p>
                <div className="flex flex-wrap gap-2">
                  {faltantes.map(f => (
                    <button
                      key={f.pedido_item_id}
                      type="button"
                      onClick={() => ctx && cambiar(e => ({ ...e, lineas: [...e.lineas, agregarDelPedido(f, ctx)] }))}
                      className="presionable min-h-11 sm:min-h-9 inline-flex items-center gap-1 rounded-full border border-border bg-surface2 px-3 text-xs font-medium text-text hover:border-accent"
                    >
                      <Plus size={13} /> {f.descripcion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 4. Pie */}
          <section className="space-y-3 rounded-xl bg-surface2 px-4 py-3" aria-live="polite">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Totales</h4>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Subtotal sin IVA</dt>
                <dd className="tabular-nums text-text">{formatearMonedaExacta(t.subtotal)}</dd>
              </div>
              {t.porAlicuota.map(g => (
                <div key={g.alicuota} className="flex justify-between gap-3">
                  <dt className="text-muted">IVA {etiquetaAlicuota(g.alicuota)} <span className="text-2xs">sobre {formatearMonedaExacta(g.base)}</span></dt>
                  <dd className="tabular-nums text-text">{formatearMonedaExacta(g.iva)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="font-bold text-text">Total</dt>
                <dd className="text-lg font-bold tabular-nums text-text">{formatearMonedaExacta(t.total)}</dd>
              </div>
            </dl>

            {soloLectura && estado.totalPapel == null ? null : (
            <div className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:items-end">
              <Field label="Total según el papel">
                <InputNumero
                  value={estado.totalPapel}
                  onChange={v => cambiar(s => ({ ...s, totalPapel: v }))}
                  placeholder="Opcional"
                  min={0}
                  disabled={soloLectura}
                  className={`${controlClass} min-h-11 text-right tabular-nums ${avisaPapel ? 'border-warning' : ''}`}
                  ariaLabel="Total según el papel de la factura"
                />
              </Field>
              {avisaPapel ? (
                <p className="flex items-start gap-1.5 pb-2.5 text-xs font-medium text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Hay {formatearMonedaExacta(Math.abs(diferencia ?? 0))} de diferencia con el total calculado. Revisá las cantidades, los precios o las alícuotas.
                </p>
              ) : (
                <p className="pb-2.5 text-xs text-muted">
                  {diferencia != null ? 'Coincide con el total calculado.' : 'Si lo cargás, avisamos cuando no coincide con el total calculado.'}
                </p>
              )}
            </div>
            )}

            {!soloLectura && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-text">
                <input
                  type="checkbox"
                  checked={estado.actualizarPrecios}
                  onChange={e => { const v = e.target.checked; cambiar(s => ({ ...s, actualizarPrecios: v })) }}
                  className="size-5 shrink-0 cursor-pointer accent-accent"
                />
                Actualizar los precios de referencia de {pedido.proveedores?.nombre ?? 'este proveedor'} con los de esta factura
              </label>
            )}
          </section>

          {soloLectura && !estado.observaciones ? null : (
          <Field label="Observaciones">
            <textarea
              rows={2}
              aria-label="Observaciones de la factura"
              disabled={soloLectura}
              placeholder="Lo que quieras recordar de esta factura"
              className={`${controlClass} py-2`}
              value={estado.observaciones}
              onChange={e => { const v = e.target.value; cambiar(s => ({ ...s, observaciones: v })) }}
            />
          </Field>
          )}

          {/* Estado de una factura que ya no se edita */}
          {factura && estadoFactura === 'confirmada' && (
            <p className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-muted">
              <Check size={15} className="shrink-0 text-success" />
              Confirmada{factura.confirmadaEn && <> el {formatearFechaHora(factura.confirmadaEn)}</>}
              {factura.confirmadaPor && <> por {factura.confirmadaPor}</>}.
              {factura.mercaderiaLlego === false && <> El pedido todavía espera la mercadería.</>}
            </p>
          )}
          {factura && estadoFactura === 'anulada' && (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-danger-bg px-3 py-2.5 text-sm text-brand-red">
              <Ban size={15} className="mt-0.5 shrink-0" />
              <span>
                Anulada{factura.anuladaEn && <> el {formatearFechaHora(factura.anuladaEn)}</>}
                {factura.anuladaPor && <> por {factura.anuladaPor}</>}.
                {factura.anuladaMotivo && <> Motivo: {factura.anuladaMotivo}</>}
              </span>
            </p>
          )}
        </>
      )}

      {/* Pie de acciones: pegado abajo en celular, donde el formulario es largo */}
      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:items-center sm:bg-transparent sm:px-0 sm:pb-0">
        {factura && estadoFactura === 'borrador' && (
          <button type="button" onClick={onDescartar} disabled={isPending} className="presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:mr-auto">
            <Trash2 size={15} className="text-brand-red" /> Descartar borrador
          </button>
        )}
        {factura && estadoFactura === 'confirmada' && (
          <button type="button" onClick={() => setAnularAbierto(true)} disabled={isPending} className="presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:mr-auto">
            <Ban size={15} className="text-brand-red" /> Anular factura
          </button>
        )}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          <button type="button" onClick={onCancelar} disabled={isPending} className={botonSecundario}>
            {soloLectura ? 'Cerrar' : 'Cancelar'}
          </button>
          {!soloLectura && (
            <>
              <button type="button" onClick={onGuardarBorrador} disabled={isPending || !pedido} className={botonSecundario}>
                {isPending && <Loader2 size={16} className="animate-spin" />} Guardar borrador
              </button>
              <button type="button" onClick={onConfirmar} disabled={isPending || !pedido} className={botonPrimario}>
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />} Confirmar factura
              </button>
            </>
          )}
        </div>
      </div>

      <AnularFacturaModal
        open={anularAbierto}
        numero={factura?.numero ?? ''}
        pedido={pedido}
        generoRemito={pedido?.compras_remitos.some(r => r.origen === 'factura') ?? false}
        pendiente={isPending}
        onAnular={motivo => { setAnularAbierto(false); onAnular(motivo) }}
        onCerrar={() => setAnularAbierto(false)}
      />

      <PreguntaMercaderia
        open={preguntaAbierta}
        numero={estado.numero}
        pedido={pedido}
        onResponder={pedirConfirmacion}
        onCerrar={() => setPreguntaAbierta(false)}
      />
    </div>
  )
}
