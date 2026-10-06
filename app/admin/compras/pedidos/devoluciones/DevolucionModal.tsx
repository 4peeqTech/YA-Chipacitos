'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Check, FileMinus2, Loader2, PackageMinus, ReceiptText, Repeat, Tag, Undo2, XCircle,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import InputNumero from '@/components/ui/InputNumero'
import DatePicker from '@/components/ui/DatePicker'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import { codigoPedido } from '@/lib/compras/codigos'
import { ALICUOTAS, avisaPorPapel, etiquetaAlicuota, variacionPrecio } from '@/lib/compras/totalesFactura'
import { cortoBase, esUnidadBase } from '@/lib/compras/unidades'
import {
  armarNotaCredito, efectoDeMotivo, impactoGasto, kgFueraDeRango, lineasDevolvibles, lineasPrecio,
  recepcionDespues, sugerenciaDesdeDiferencia, TEXTO_EFECTO, textoImpactoEstado, textoToastGasto, topeNotaCredito,
  type EfectoMotivo, type FilaDevolvible, type LineaPrecio,
} from '@/lib/compras/devoluciones'
import { registrarDevolucion } from './acciones'
import { useContextoDevolucion, type ContextoDevolucion } from './useContextoDevolucion'

/** Desde una diferencia "Reclamo al proveedor" (§6.2): qué se prellena. */
export interface DiferenciaOrigen {
  id: string
  itemId: string
  descripcion: string
  diferencia: number
}

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

function n(v: number): string {
  return v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function conUnidad(v: number, unidad: string | null): string {
  return unidad ? `${n(v)} ${unidad}` : n(v)
}

function Paso({ numero, titulo, ayuda, children, accion }: { numero: number; titulo: string; ayuda?: ReactNode; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="paso-entrada space-y-3" aria-labelledby={`paso-${numero}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={`paso-${numero}`} className="flex items-center gap-2 text-sm font-bold text-text">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs tabular-nums text-muted">{numero}</span>
            {titulo}
          </h4>
          {ayuda && <p className="mt-1 pl-8 text-xs text-muted">{ayuda}</p>}
        </div>
        {accion}
      </div>
      <div className="pl-0 sm:pl-8">{children}</div>
    </section>
  )
}

/**
 * Registrar una devolución al proveedor (B4). Se abre desde el pedido, desde la
 * factura confirmada y desde una diferencia resuelta como reclamo. Los datos se
 * piden al abrir (useContextoDevolucion): la RPC vuelve a validar todo.
 */
export default function DevolucionModal({
  pedidoId,
  esAdmin,
  abierto,
  onCerrar,
  diferencia = null,
}: {
  pedidoId: string
  esAdmin: boolean
  abierto: boolean
  onCerrar: () => void
  diferencia?: DiferenciaOrigen | null
}) {
  const [conCambios, setConCambios] = useState(false)
  const [pendiente, setPendiente] = useState(false)
  const confirmar = useConfirmar()

  function cerrar() {
    if (pendiente) return
    if (!conCambios) { onCerrar(); return }
    confirmar({
      titulo: 'Descartar la devolución',
      mensaje: 'Cargaste datos de una devolución que todavía no se registró. ¿Descartarlos?',
      textoConfirmar: 'Descartar',
      textoCancelar: 'Seguir cargando',
      peligroso: true,
      onConfirmar: onCerrar,
    })
  }

  return (
    <Modal open={abierto} onClose={cerrar} title="Registrar devolución" size="xl" pantallaCompletaMobile>
      {abierto && (
        <Contenido
          pedidoId={pedidoId}
          esAdmin={esAdmin}
          diferencia={diferencia}
          onCambios={setConCambios}
          onPendiente={setPendiente}
          onListo={onCerrar}
          onCancelar={cerrar}
        />
      )}
    </Modal>
  )
}

function Contenido(props: {
  pedidoId: string
  esAdmin: boolean
  diferencia: DiferenciaOrigen | null
  onCambios: (hay: boolean) => void
  onPendiente: (p: boolean) => void
  onListo: () => void
  onCancelar: () => void
}) {
  const { ctx, error, cargando } = useContextoDevolucion(props.pedidoId, props.esAdmin)
  if (cargando) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando la devolución">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (error || !ctx) {
    return <EmptyState icono={XCircle} titulo="No se pudo abrir la devolución" descripcion={error ?? 'Recargá la página.'} />
  }
  return <Formulario {...props} ctx={ctx} />
}

interface PrecioNc { precio: number | null; alicuota: number }

function Formulario({
  ctx, esAdmin, diferencia, onCambios, onPendiente, onListo, onCancelar,
}: {
  ctx: ContextoDevolucion
  esAdmin: boolean
  diferencia: DiferenciaOrigen | null
  onCambios: (hay: boolean) => void
  onPendiente: (p: boolean) => void
  onListo: () => void
  onCancelar: () => void
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const motivosVisibles = useMemo(
    () => ctx.motivos.filter(m => m.activo && (esAdmin || m.devuelve_mercaderia)),
    [ctx.motivos, esAdmin],
  )
  const sugerencia = diferencia ? sugerenciaDesdeDiferencia(diferencia, ctx.motivos) : null

  const [motivoId, setMotivoId] = useState<string | null>(sugerencia?.motivoId ?? null)
  const [cantidades, setCantidades] = useState<Record<string, number | null>>(
    sugerencia ? { [sugerencia.itemId]: sugerencia.cantidad } : {},
  )
  const [kgs, setKgs] = useState<Record<string, number | null>>({})
  const [correctos, setCorrectos] = useState<Record<string, number | null>>({})
  const [repone, setRepone] = useState<boolean | null>(sugerencia ? sugerencia.repone : null)
  const [conNc, setConNc] = useState(!!sugerencia?.notaCredito && !!ctx.factura)
  const [ncNumero, setNcNumero] = useState('')
  const [ncFecha, setNcFecha] = useState(hoyISO())
  const [ncPapel, setNcPapel] = useState<number | null>(null)
  const [ncPrecios, setNcPrecios] = useState<Record<string, PrecioNc>>({})
  const [nota, setNota] = useState('')

  const motivo = ctx.motivos.find(m => m.id === motivoId) ?? null
  const efecto: EfectoMotivo | null = motivo ? efectoDeMotivo(motivo) : null
  const factura = ctx.factura
  const cerradoAMano = ctx.pedido.estadoRecepcion === 'cerrado_manual'
  const unidadBaseDe = (itemId: string | null) => (itemId ? ctx.insumos.get(itemId)?.unidad_base ?? null : null)
  const corto = (itemId: string | null) => { const ub = unidadBaseDe(itemId); return esUnidadBase(ub) ? cortoBase(ub) : 'kg' }

  function marcar<T>(set: (f: (prev: T) => T) => void) {
    return (f: (prev: T) => T) => { onCambios(true); set(f) }
  }

  const filas = useMemo(
    () => lineasDevolvibles(ctx.lineas, ctx.recibidos, ctx.devoluciones, factura),
    [ctx.lineas, ctx.recibidos, ctx.devoluciones, factura],
  )
  const filasMercaderia = filas.filter(f => f.llego > 0)
  const filasNoEntregado = filas.filter(f => f.facturado > 0)
  // Una línea con una corrección de precio activa no se vuelve a ofrecer (la RPC también lo frena).
  const filasPrecio: LineaPrecio[] = useMemo(() => {
    if (!factura) return []
    const corregidas = new Set(ctx.devoluciones
      .filter(d => d.estado === 'activa' && d.corrigePrecio)
      .flatMap(d => d.lineas.map(l => l.facturaItemId).filter(Boolean)))
    return lineasPrecio(factura, unidadBaseDe).filter(l => !corregidas.has(l.facturaItemId))
  }, [factura, ctx.devoluciones]) // eslint-disable-line react-hooks/exhaustive-deps

  const hayNc = esAdmin && !!factura && conNc && (efecto !== 'mercaderia' || repone === false)

  // Ítems elegidos, en el orden de la tabla.
  const elegidos = useMemo(() => {
    if (efecto === 'precio') {
      return filasPrecio.flatMap(l => {
        const c = cantidades[l.facturaItemId]
        return c && c > 0 ? [{ key: l.facturaItemId, itemId: l.itemId, facturaItemId: l.facturaItemId, descripcion: l.descripcion, cantidad: c, cantidadBase: null, precioCorrecto: correctos[l.facturaItemId] ?? null }] : []
      })
    }
    const lista = efecto === 'mercaderia' ? filasMercaderia : efecto === 'no_entregado' ? filasNoEntregado : []
    return lista.flatMap(f => {
      const c = cantidades[f.itemId]
      return c && c > 0 ? [{ key: f.itemId, itemId: f.itemId, facturaItemId: null, descripcion: f.descripcion, cantidad: c, cantidadBase: kgs[f.itemId] ?? null, precioCorrecto: null }] : []
    })
  }, [efecto, filasPrecio, filasMercaderia, filasNoEntregado, cantidades, kgs, correctos])

  const nc = useMemo(() => {
    if (!hayNc || !factura || !efecto) return null
    return armarNotaCredito(
      elegidos,
      factura,
      efecto,
      elegidos.map(e => ({ precioUnitario: ncPrecios[e.key]?.precio ?? undefined, alicuotaIva: ncPrecios[e.key]?.alicuota ?? undefined })),
      unidadBaseDe,
    )
  }, [hayNc, factura, efecto, elegidos, ncPrecios]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Errores por fila
  function errorFila(f: FilaDevolvible): string | null {
    const c = cantidades[f.itemId]
    if (!c) return null
    const max = efecto === 'no_entregado' ? f.maximoNoEntregado : f.maximo
    if (c > max + 1e-9) return `Como mucho ${conUnidad(max, f.unidad)}`
    return null
  }
  function errorPrecio(l: LineaPrecio): string | null {
    const c = cantidades[l.facturaItemId]
    if (!c) return null
    if (c > l.cantidadCobrada + 1e-9) return `Como mucho ${conUnidad(l.cantidadCobrada, l.unidadCobro)}`
    const correcto = correctos[l.facturaItemId]
    if (correcto == null) return 'Cargá el precio correcto'
    if (correcto >= l.precio) return `Tiene que ser menor que ${formatearMonedaExacta(l.precio)}`
    return null
  }
  const erroresFilas = efecto === 'precio'
    ? filasPrecio.map(errorPrecio).filter(Boolean)
    : (efecto === 'mercaderia' ? filasMercaderia : filasNoEntregado).map(errorFila).filter(Boolean)

  const tope = factura ? topeNotaCredito(factura) : 0
  const ncSupera = !!nc && nc.totales.total > tope + 0.005
  const ncInvalida = hayNc && (!nc || nc.incompleta || !ncNumero.trim() || !ncFecha || ncSupera)
  const faltaRepone = efecto === 'mercaderia' && repone == null
  const puedeRegistrar = !!motivo && elegidos.length > 0 && erroresFilas.length === 0 && !faltaRepone && !ncInvalida && !isPending

  // --- Impacto
  const impactoStock = efecto === 'mercaderia'
    ? elegidos.map(e => {
      const antes = ctx.stock[e.itemId ?? ''] ?? 0
      const fila = filas.find(f => f.itemId === e.itemId)
      return { nombre: e.descripcion, unidad: fila?.unidad ?? null, cantidad: e.cantidad, despues: antes - e.cantidad }
    })
    : []
  const estadoTexto = efecto === 'mercaderia' && elegidos.length > 0 && repone != null
    ? textoImpactoEstado(
      { estado_recepcion: ctx.pedido.estadoRecepcion, estado_facturacion: ctx.pedido.estadoFacturacion },
      recepcionDespues({
        actual: ctx.pedido.estadoRecepcion,
        lineas: ctx.lineas,
        recibidoTotal: ctx.recibidos.reduce((t, r) => t + r.cantidad, 0),
        devueltoTotal: filas.reduce((t, f) => t + f.devuelto, 0),
        hayRemitos: ctx.pedido.hayRemitos,
        haySinRepone: ctx.devoluciones.some(d => d.estado === 'activa' && d.devuelveMercaderia && !d.repone),
        nuevas: elegidos.map(e => ({ itemId: e.itemId ?? '', cantidad: e.cantidad })),
        repone,
      }),
      repone,
    )
    : null
  const gasto = nc && factura ? impactoGasto({
    gastoId: factura.gastoId, gastoEstado: factura.gastoEstado, gastoMonto: factura.gastoMonto,
    totalNc: nc.totales.total, facturaNumero: factura.numero,
  }) : null
  const esperaNc = !hayNc && !!factura && efecto != null && repone !== true && efecto !== 'precio'

  const frasesImpacto: { texto: string; tono: 'normal' | 'alerta' }[] = []
  for (const s of impactoStock) {
    frasesImpacto.push({
      texto: `Resta ${conUnidad(s.cantidad, s.unidad)} de ${s.nombre} del stock (queda en ${n(s.despues)}).`,
      tono: s.despues < 0 ? 'alerta' : 'normal',
    })
  }
  if (efecto && efecto !== 'mercaderia' && elegidos.length > 0) frasesImpacto.push({ texto: 'El stock no se mueve.', tono: 'normal' })
  if (estadoTexto) frasesImpacto.push({ texto: `El pedido: ${estadoTexto.charAt(0).toLowerCase()}${estadoTexto.slice(1)}`, tono: 'normal' })
  // Con la NC a medio cargar (faltan kg o precios) el número del gasto no dice nada todavía.
  if (gasto && nc && !nc.incompleta) frasesImpacto.push({ texto: gasto.texto, tono: 'normal' })
  if (esperaNc && elegidos.length > 0) frasesImpacto.push({ texto: 'Queda esperando la nota de crédito: la cargás desde la devolución cuando llegue.', tono: 'normal' })

  function registrar() {
    if (!motivo || !efecto) return
    const resumen = (
      <div className="space-y-2">
        <ul className="space-y-1">
          {elegidos.map(e => (
            <li key={e.key} className="tabular-nums">
              {e.descripcion}: {efecto === 'precio' ? `${n(e.cantidad)} a ${formatearMonedaExacta(e.precioCorrecto ?? 0)}` : n(e.cantidad)}
              {e.cantidadBase != null && ` (${n(e.cantidadBase)} ${corto(e.itemId)})`}
            </li>
          ))}
        </ul>
        {frasesImpacto.map(f => <p key={f.texto} className={f.tono === 'alerta' ? 'text-warning' : ''}>{f.texto}</p>)}
        {nc && <p className="font-semibold">Crea la nota de crédito {ncNumero.trim()} por {formatearMonedaExacta(nc.totales.total)}.</p>}
      </div>
    )
    confirmar({
      titulo: `Registrar la devolución · ${motivo.nombre}`,
      mensaje: resumen,
      textoConfirmar: 'Registrar devolución',
      ancho: 'lg',
      onConfirmar: () => {
        onPendiente(true)
        startTransition(async () => {
          const r = await registrarDevolucion({
            pedidoId: ctx.pedido.id,
            motivoId: motivo.id,
            repone: efecto === 'mercaderia' ? !!repone : false,
            items: elegidos.map(e => ({
              itemId: e.itemId, pedidoItemId: null, facturaItemId: e.facturaItemId,
              cantidad: e.cantidad, cantidadBase: e.cantidadBase, precioCorrecto: e.precioCorrecto,
            })),
            nota: nota.trim() || null,
            notaCredito: hayNc && nc ? {
              numero: ncNumero.trim(),
              fecha: ncFecha,
              totalPapel: ncPapel,
              lineas: nc.lineas.map((l, i) => ({ indice: i, precioUnitario: efecto === 'precio' ? 1 : l.precioUnitario, alicuotaIva: l.alicuotaIva })),
            } : null,
            diferenciaId: diferencia?.id ?? null,
          })
          onPendiente(false)
          if (!r.ok) { toast.error(r.error); return }
          const extra = r.data.notaCredito ? textoToastGasto(r.data.notaCredito.gasto, r.data.notaCredito.monto_despues) : null
          toast.success(`${r.data.codigo} registrada${r.data.notaCredito ? ' · nota de crédito cargada' : ''}${extra ? ` · ${extra}` : ''}`)
          onListo()
        })
      },
    })
  }

  // --- Vacíos
  if (motivosVisibles.length === 0) {
    return (
      <EmptyState
        icono={Undo2}
        titulo="No hay motivos de devolución"
        descripcion={esAdmin ? 'Cargá al menos uno en Proveedores › Motivos de devolución.' : 'Pedile a un administrador que cargue los motivos.'}
        accion={esAdmin ? <Link href="/admin/proveedores/motivos-devolucion" className={botonSecundario}>Ir a Motivos de devolución</Link> : undefined}
      />
    )
  }

  const gruposMotivos: { titulo: string; lista: typeof motivosVisibles; deshabilitado: boolean }[] = [
    { titulo: 'Sale del stock', lista: motivosVisibles.filter(m => m.devuelve_mercaderia), deshabilitado: filasMercaderia.length === 0 },
    { titulo: 'Corrige la factura', lista: motivosVisibles.filter(m => !m.devuelve_mercaderia), deshabilitado: !factura },
  ].filter(g => g.lista.length > 0)

  return (
    <div className="space-y-6">
      <p className="-mt-2 text-sm text-muted">
        <span className="font-mono tabular-nums text-text">{codigoPedido(ctx.pedido.numero)}</span> · {ctx.pedido.proveedor}
        {factura && <> · factura {factura.numero}</>}
      </p>

      {diferencia && (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-text">
          <ReceiptText size={16} className="mt-0.5 shrink-0 text-accent-fg" />
          Desde la diferencia de {diferencia.descripcion} ({diferencia.diferencia > 0 ? '+' : ''}{n(diferencia.diferencia)})
        </p>
      )}

      {/* 1. Motivo */}
      <Paso numero={1} titulo="Motivo">
        <div className="space-y-4">
          {gruposMotivos.map(g => (
            <fieldset key={g.titulo} className="space-y-2">
              <legend className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">{g.titulo}</legend>
              {g.deshabilitado && (
                <p className="text-xs text-muted">
                  {g.titulo === 'Sale del stock'
                    ? 'Todavía no llegó mercadería de este pedido: no hay nada para devolver.'
                    : 'Primero confirmá la factura del pedido.'}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {g.lista.map(m => {
                  const activo = motivoId === m.id
                  const ef = efectoDeMotivo(m)
                  const Icono = ef === 'mercaderia' ? PackageMinus : ef === 'precio' ? Tag : FileMinus2
                  return (
                    <label
                      key={m.id}
                      className={`presionable flex min-h-11 items-start gap-3 rounded-xl border p-3 transition-colors ${g.deshabilitado ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${activo ? 'border-accent bg-surface2' : 'border-border hover:border-muted'}`}
                    >
                      <input
                        type="radio"
                        name="motivo"
                        value={m.id}
                        checked={activo}
                        disabled={g.deshabilitado}
                        onChange={() => { onCambios(true); setMotivoId(m.id); setCantidades({}); setKgs({}); setCorrectos({}); setNcPrecios({}); setRepone(ef === 'mercaderia' ? null : false) }}
                        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                          <Icono size={15} className="shrink-0 text-accent-fg" /> {m.nombre}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{TEXTO_EFECTO[ef]}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </Paso>

      {/* 2. Qué se devuelve */}
      {efecto && (
        <Paso
          numero={2}
          titulo={efecto === 'precio' ? 'Qué se cobró mal' : efecto === 'no_entregado' ? 'Qué se facturó y no llegó' : 'Qué se devuelve'}
          accion={efecto === 'mercaderia' && filasMercaderia.length > 0 ? (
            <button
              type="button"
              onClick={() => { onCambios(true); setCantidades(Object.fromEntries(filasMercaderia.map(f => [f.itemId, f.maximo > 0 ? f.maximo : null]))) }}
              className="presionable min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80"
            >
              Devolver todo
            </button>
          ) : undefined}
        >
          {efecto === 'precio' ? (
            <TablaPrecio
              filas={filasPrecio}
              cantidades={cantidades}
              correctos={correctos}
              error={errorPrecio}
              onCantidad={(k, v) => marcar(setCantidades)(p => ({ ...p, [k]: v }))}
              onCorrecto={(k, v) => marcar(setCorrectos)(p => ({ ...p, [k]: v }))}
            />
          ) : (
            <TablaItems
              filas={efecto === 'mercaderia' ? filasMercaderia : filasNoEntregado}
              efecto={efecto}
              cantidades={cantidades}
              kgs={kgs}
              kgObligatorio={esAdmin && !!factura && efecto === 'mercaderia' ? repone !== true : hayNc}
              stock={ctx.stock}
              insumos={ctx.insumos}
              error={errorFila}
              corto={corto}
              onCantidad={(k, v) => marcar(setCantidades)(p => ({ ...p, [k]: v }))}
              onKg={(k, v) => marcar(setKgs)(p => ({ ...p, [k]: v }))}
            />
          )}
        </Paso>
      )}

      {/* 3. ¿Repone? */}
      {efecto === 'mercaderia' && (
        <Paso numero={3} titulo="¿El proveedor repone?" ayuda="Si la repone y después la factura aparte, eso es otro pedido.">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="¿El proveedor repone?">
            {[
              { valor: true, titulo: 'Sí, repone', texto: 'Vuelve a quedar pendiente de llegar en el pedido.', icono: Repeat,
                bloqueo: cerradoAMano ? 'El pedido está cerrado a mano: reabrilo para esperar la reposición, o registrá la devolución sin reposición.'
                  : hayNc ? 'Si el proveedor repone, no hay nota de crédito: la reposición ya está facturada.' : null },
              { valor: false, titulo: 'No repone', texto: factura ? 'Esa cantidad se cierra. Como está facturada, falta la nota de crédito.' : 'Esa cantidad se cierra.', icono: Check, bloqueo: null },
            ].map(o => {
              const activo = repone === o.valor
              return (
                <label
                  key={String(o.valor)}
                  className={`presionable flex min-h-11 items-start gap-3 rounded-xl border p-3 transition-colors ${o.bloqueo ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${activo ? 'border-accent bg-surface2' : 'border-border hover:border-muted'}`}
                >
                  <input
                    type="radio"
                    name="repone"
                    checked={activo}
                    disabled={!!o.bloqueo}
                    onChange={() => { onCambios(true); setRepone(o.valor); if (o.valor) setConNc(false) }}
                    className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-text"><o.icono size={15} className="text-accent-fg" /> {o.titulo}</span>
                    <span className="mt-0.5 block text-xs text-muted">{o.bloqueo ?? o.texto}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </Paso>
      )}

      {/* 4. Nota de crédito */}
      {esAdmin && factura && efecto && (efecto !== 'mercaderia' || repone === false) && (
        <Paso numero={efecto === 'mercaderia' ? 4 : 3} titulo="Nota de crédito">
          <div className="space-y-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={conNc}
                onChange={e => { onCambios(true); setConNc(e.target.checked) }}
                className="size-5 shrink-0 cursor-pointer accent-accent"
              />
              Ya llegó la nota de crédito
            </label>
            {!conNc ? (
              <p className="text-xs text-muted">La nota de crédito se puede cargar después, desde la devolución.</p>
            ) : (
              <BloqueNc
                nc={nc}
                elegidos={elegidos.map(e => e.key)}
                efecto={efecto}
                numero={ncNumero}
                fecha={ncFecha}
                papel={ncPapel}
                tope={tope}
                supera={ncSupera}
                precios={ncPrecios}
                onNumero={v => { onCambios(true); setNcNumero(v) }}
                onFecha={v => { onCambios(true); setNcFecha(v) }}
                onPapel={v => { onCambios(true); setNcPapel(v) }}
                onPrecio={(k, p) => marcar(setNcPrecios)(prev => ({ ...prev, [k]: p }))}
              />
            )}
          </div>
        </Paso>
      )}

      {efecto && (
        <Field label="Nota">
          <textarea
            aria-label="Nota de la devolución"
            value={nota}
            onChange={e => { onCambios(true); setNota(e.target.value) }}
            rows={2}
            maxLength={500}
            placeholder="Opcional. Ej.: lo retiró el chofer el martes"
            className={`${controlClass} py-2`}
          />
        </Field>
      )}

      {/* Pie: impacto en vivo + acciones. Sticky, así en el celular el botón siempre se ve. */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:px-6">
        {frasesImpacto.length > 0 && (
          <ul aria-live="polite" className="mb-3 max-h-28 space-y-0.5 overflow-y-auto text-xs sm:text-sm">
            {frasesImpacto.map(f => (
              <li key={f.texto} className={`flex items-start gap-1.5 ${f.tono === 'alerta' ? 'text-warning' : 'text-muted'}`}>
                {f.tono === 'alerta' && <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                <span>{f.texto}{f.tono === 'alerta' && ' Ya se usó: igual se puede registrar.'}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex sm:items-center sm:justify-end">
          <button type="button" onClick={onCancelar} disabled={isPending} className={botonSecundario}>Cancelar</button>
          <button type="button" onClick={registrar} disabled={!puedeRegistrar} className={botonPrimario}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
            Registrar devolución
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TablaItems({
  filas, efecto, cantidades, kgs, kgObligatorio, stock, insumos, error, corto, onCantidad, onKg,
}: {
  filas: FilaDevolvible[]
  efecto: EfectoMotivo
  cantidades: Record<string, number | null>
  kgs: Record<string, number | null>
  kgObligatorio: boolean
  stock: Record<string, number>
  insumos: ContextoDevolucion['insumos']
  error: (f: FilaDevolvible) => string | null
  corto: (itemId: string | null) => string
  onCantidad: (k: string, v: number | null) => void
  onKg: (k: string, v: number | null) => void
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-muted">{efecto === 'mercaderia' ? 'Todavía no llegó mercadería de este pedido: no hay nada para devolver.' : 'La factura no tiene insumos para reclamar.'}</p>
  }
  const hayKg = filas.some(f => f.cobraPorBase)
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {filas.map(f => {
        const c = cantidades[f.itemId] ?? null
        const err = error(f)
        const max = efecto === 'no_entregado' ? f.maximoNoEntregado : f.maximo
        const insumo = insumos.get(f.itemId)
        const kg = kgs[f.itemId] ?? null
        const fueraDeRango = kgFueraDeRango(c ?? 0, kg, insumo?.cantidad_por_unidad ?? null)
        const stockAntes = stock[f.itemId] ?? 0
        return (
          <li key={f.key} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text">
                {f.descripcion}
                {insumo?.archivado && <span className="rounded-full bg-surface2 px-2 py-0.5 text-2xs font-medium text-muted">Archivado</span>}
              </p>
              <p className="text-xs tabular-nums text-muted">
                {efecto === 'mercaderia'
                  ? <>Llegó {conUnidad(f.llego, f.unidad)}{f.devuelto > 0 && <> · ya devuelto {n(f.devuelto)}</>} · stock {n(stockAntes)}</>
                  : <>Facturado {conUnidad(f.facturado, f.unidad)}{f.acreditado + f.reclamado > 0 && <> · ya reclamado {n(f.acreditado + f.reclamado)}</>}</>}
              </p>
              <p className="text-xs tabular-nums text-muted">máx. {conUnidad(max, f.unidad)}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <div className="w-28">
                <InputNumero
                  value={c}
                  onChange={v => onCantidad(f.itemId, v)}
                  placeholder="0"
                  ariaLabel={`Cantidad de ${f.descripcion}`}
                  className={`text-right tabular-nums ${err ? 'border-brand-red' : ''}`}
                />
                <p className="mt-0.5 text-right text-2xs text-muted">{f.unidad ?? 'unidades'}</p>
              </div>
              {hayKg && f.cobraPorBase && (
                <div className="w-28">
                  <InputNumero
                    value={kg}
                    onChange={v => onKg(f.itemId, v)}
                    placeholder={insumo?.cantidad_por_unidad && c ? n(c * insumo.cantidad_por_unidad) : corto(f.itemId)}
                    ariaLabel={`${corto(f.itemId)} reales de ${f.descripcion}`}
                    className="text-right tabular-nums"
                  />
                  <p className={`mt-0.5 text-right text-2xs ${kgObligatorio && c && kg == null ? 'text-warning' : 'text-muted'}`}>
                    {corto(f.itemId)} reales{kgObligatorio ? ' · necesarios para la NC' : ''}
                  </p>
                </div>
              )}
            </div>
            {err && <p role="alert" className="text-xs font-medium text-brand-red sm:col-span-2">{err}</p>}
            {fueraDeRango && <p className="text-xs text-warning sm:col-span-2">Los {corto(f.itemId)} se alejan más del 10 % de lo nominal. Revisá que estén bien.</p>}
          </li>
        )
      })}
    </ul>
  )
}

function TablaPrecio({
  filas, cantidades, correctos, error, onCantidad, onCorrecto,
}: {
  filas: LineaPrecio[]
  cantidades: Record<string, number | null>
  correctos: Record<string, number | null>
  error: (l: LineaPrecio) => string | null
  onCantidad: (k: string, v: number | null) => void
  onCorrecto: (k: string, v: number | null) => void
}) {
  if (filas.length === 0) return <p className="text-sm text-muted">La factura no tiene líneas con precio.</p>
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {filas.map(l => {
        const err = error(l)
        return (
          <li key={l.facturaItemId} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">{l.descripcion}</p>
              <p className="text-xs tabular-nums text-muted">Cobrado {formatearMonedaExacta(l.precio)} /{l.unidadCobro} · {conUnidad(l.cantidadCobrada, l.unidadCobro)}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <div className="w-28">
                <InputNumero value={cantidades[l.facturaItemId] ?? null} onChange={v => onCantidad(l.facturaItemId, v)} placeholder={n(l.cantidadCobrada)} ariaLabel={`Cantidad cobrada de ${l.descripcion}`} className="text-right tabular-nums" />
                <p className="mt-0.5 text-right text-2xs text-muted">{l.unidadCobro}</p>
              </div>
              <div className="w-32">
                <InputNumero value={correctos[l.facturaItemId] ?? null} onChange={v => onCorrecto(l.facturaItemId, v)} placeholder="$" ariaLabel={`Precio correcto de ${l.descripcion}`} className={`text-right tabular-nums ${err ? 'border-brand-red' : ''}`} />
                <p className="mt-0.5 text-right text-2xs text-muted">correcto $/{l.unidadCobro}</p>
              </div>
            </div>
            {err && cantidades[l.facturaItemId] ? <p role="alert" className="text-xs font-medium text-brand-red sm:col-span-2">{err}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Número, fecha, líneas con precio y alícuota editables, totales y "Total según el papel". */
export function BloqueNc({
  nc, elegidos, efecto, numero, fecha, papel, tope, supera, precios, onNumero, onFecha, onPapel, onPrecio, soloLectura = false,
}: {
  nc: ReturnType<typeof armarNotaCredito> | null
  elegidos: string[]
  efecto: EfectoMotivo
  numero: string
  fecha: string
  papel: number | null
  tope: number
  supera: boolean
  precios: Record<string, PrecioNc>
  onNumero: (v: string) => void
  onFecha: (v: string) => void
  onPapel: (v: number | null) => void
  onPrecio: (k: string, p: PrecioNc) => void
  soloLectura?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="N° de la nota de crédito" obligatorio>
          <input
            value={numero}
            onChange={e => onNumero(e.target.value)}
            maxLength={40}
            placeholder="0001-00000123"
            className={`${controlClass} font-mono`}
            aria-label="Número de la nota de crédito"
          />
        </Field>
        <Field label="Fecha" obligatorio>
          <DatePicker value={fecha} onChange={onFecha} max={hoyISO()} ariaLabel="Fecha de la nota de crédito" />
        </Field>
      </div>

      {elegidos.length === 0 || !nc ? (
        <p className="text-xs text-muted">Elegí arriba qué se devuelve para armar las líneas.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {nc.lineas.map((l, i) => {
            const k = elegidos[i]
            const variacion = l.precioFactura != null && efecto !== 'precio' ? variacionPrecio(l.precioUnitario, l.precioFactura) : null
            return (
              <li key={k} className="space-y-2 px-3 py-3">
                <p className="text-sm text-text">{l.descripcion}</p>
                <div className="flex flex-wrap items-end gap-2 text-sm">
                  <span className="tabular-nums text-muted">{n(l.cantidad)} {l.unidadCobro} ×</span>
                  {efecto === 'precio' || soloLectura ? (
                    <span className="tabular-nums text-text">{formatearMonedaExacta(l.precioUnitario)}</span>
                  ) : (
                    <div className="w-32">
                      <InputNumero
                        value={precios[k]?.precio ?? l.precioUnitario}
                        onChange={v => onPrecio(k, { precio: v, alicuota: precios[k]?.alicuota ?? l.alicuotaIva })}
                        ariaLabel={`Precio de ${l.descripcion} en la nota de crédito`}
                        className="text-right tabular-nums"
                      />
                    </div>
                  )}
                  <span className="text-muted">/{l.unidadCobro}</span>
                  <select
                    value={precios[k]?.alicuota ?? l.alicuotaIva}
                    onChange={e => onPrecio(k, { precio: precios[k]?.precio ?? l.precioUnitario, alicuota: Number(e.target.value) })}
                    aria-label={`IVA de ${l.descripcion}`}
                    disabled={soloLectura}
                    className={`${controlClass} w-auto min-h-11 sm:min-h-0`}
                  >
                    {ALICUOTAS.map(a => <option key={a} value={a}>IVA {etiquetaAlicuota(a)}</option>)}
                  </select>
                  <span className="ml-auto font-semibold tabular-nums text-text">{formatearMonedaExacta(l.subtotal)}</span>
                </div>
                {variacion != null && (
                  <p className="text-2xs text-muted">{variacion > 0 ? '↑' : '↓'} {Math.abs(variacion)} % vs factura</p>
                )}
                {l.error && <p role="alert" className="text-xs font-medium text-brand-red">{l.error}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {nc && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-surface2 px-4 py-3 text-sm tabular-nums">
          <dt className="text-muted">Subtotal</dt><dd className="text-right text-text">{formatearMonedaExacta(nc.totales.subtotal)}</dd>
          <dt className="text-muted">IVA</dt><dd className="text-right text-text">{formatearMonedaExacta(nc.totales.iva)}</dd>
          <dt className="font-semibold text-text">Total</dt><dd className="text-right font-bold text-text">{formatearMonedaExacta(nc.totales.total)}</dd>
        </dl>
      )}
      {supera && (
        <p role="alert" className="text-xs font-medium text-brand-red">
          La nota de crédito supera lo que queda de la factura ({formatearMonedaExacta(tope)}). Revisá precios y cantidades.
        </p>
      )}

      <Field label="Total según el papel" ayuda="Opcional: para comparar con lo que calculamos.">
        <InputNumero value={papel} onChange={onPapel} placeholder="$" ariaLabel="Total según el papel" className="text-right tabular-nums sm:w-48" />
      </Field>
      {nc && papel != null && avisaPorPapel(nc.totales.total, papel) && (
        <p className="text-xs text-warning">El papel dice {formatearMonedaExacta(papel)} y calculamos {formatearMonedaExacta(nc.totales.total)}. Revisá precios y alícuotas.</p>
      )}
    </div>
  )
}

