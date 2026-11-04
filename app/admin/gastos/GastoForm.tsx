'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  IconAlertTriangle, IconBuildingStore, IconCircleCheck, IconCircleX, IconDeviceFloppy, IconFileText, IconLock,
  IconPaperclip, IconReceipt, IconTrash, IconWallet, IconX,
} from '@tabler/icons-react'
import LinkEntidad from '@/components/ui/LinkEntidad'
import DatePicker from '@/components/ui/DatePicker'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import EstadoBadge from '@/components/ui/EstadoBadge'
import { ChipGroup } from '@/components/ui/Chip'
import { Puntos } from '@/components/ui/Cargando'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearFechaHora, formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import { mensajeError } from '@/lib/errores'
import { RUBROS, RUBROS_CATEGORIAS } from '@/lib/gastos-constants'
import {
  armarPagos, bloqueoFactura, formInicial, hayCambios, motivoNoEliminar, validarGasto,
  type AdjuntoFila, type CampoGasto, type FormGasto, type GastoVista, type PagoVista,
} from '@/lib/gastos/modelo'
import {
  agregarAdjuntoGasto, anularPagoGasto, detalleGasto, eliminarGasto, guardarGasto, quitarAdjuntoGasto,
  registrarPagoGasto,
} from './acciones'
import { MAX_MB_ARCHIVO, TIPOS_ARCHIVO, abrirArchivoGasto, borrarArchivoGasto, subirArchivoGasto } from './archivos'
import PagoModal, { type DatosPago } from './PagoModal'

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'
const botonTexto = 'presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-text hover:bg-surface2 disabled:opacity-50'

/** Categorías del rubro. Un rubro sin categorías (Movimiento interno) usa el rubro como categoría. */
function categoriasDe(rubro: string): string[] {
  if (!rubro) return []
  const lista = RUBROS_CATEGORIAS[rubro] ?? []
  return lista.length ? lista : [rubro]
}

/** Abre un archivo del bucket privado con un link firmado. */
function BotonArchivo({ valor, texto }: { valor: string; texto: string }) {
  const toast = useToast()
  const [abriendo, setAbriendo] = useState(false)
  async function abrir() {
    setAbriendo(true)
    const ok = await abrirArchivoGasto(valor)
    setAbriendo(false)
    if (!ok) toast.error('No pudimos abrir el archivo. Puede que se haya borrado: probá de nuevo o subilo otra vez.')
  }
  return (
    <button type="button" onClick={abrir} disabled={abriendo} className={botonTexto}>
      {abriendo ? <Puntos /> : <IconFileText size={15} aria-hidden />}
      <span className="truncate underline decoration-accent decoration-2 underline-offset-4">{texto}</span>
    </button>
  )
}

/** Un pago del historial. Anular pide el motivo acá mismo. */
function FilaPago({ pago, ocupado, onAnular }: { pago: PagoVista; ocupado: boolean; onAnular: (motivo: string) => void }) {
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const anulado = pago.anulado
  return (
    <li className={`space-y-2 px-4 py-3 ${anulado ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-text">
            <span className={`tabular-nums ${anulado ? 'line-through' : ''}`}>{formatearMonedaExacta(pago.monto)}</span>
            <span className="text-muted"> · {pago.fecha ? formatearFecha(pago.fecha) : 'sin fecha'}</span>
          </p>
          <p className="text-xs text-muted">
            {[pago.formaPago, pago.caja && `caja ${pago.caja}`, pago.origen === 'fudo' ? 'desde Fudo' : pago.registradoPor && `por ${pago.registradoPor}`].filter(Boolean).join(' · ')}
          </p>
          {anulado && (
            <p className="text-xs text-muted">
              Anulado {formatearFechaHora(anulado.en)}{anulado.por && <> por {anulado.por}</>}{anulado.motivo && <>: {anulado.motivo}</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {pago.comprobanteUrl && <BotonArchivo valor={pago.comprobanteUrl} texto="Comprobante" />}
          {!anulado && pago.origen === 'app' && !anulando && (
            <button type="button" onClick={() => setAnulando(true)} disabled={ocupado} className={botonTexto}>
              <IconCircleX size={15} className="text-brand-red" aria-hidden /> Anular
            </button>
          )}
        </div>
      </div>
      {/* Al anularse, el pago se queda en la lista: el panel se cierra solo. */}
      {anulando && !anulado && (
        <div className="space-y-2 rounded-xl border border-border bg-surface px-3 py-3">
          <p className="text-sm text-text">El pago deja de sumar y el gasto vuelve a quedar pendiente por ese monto. Queda en el historial.</p>
          <input
            aria-label="Motivo de la anulación"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            maxLength={300}
            placeholder="Motivo (opcional): por ejemplo, se cargó dos veces"
            className={`${controlClass} min-h-11`}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setAnulando(false); setMotivo('') }} disabled={ocupado} className={botonSecundario}>Cancelar</button>
            <button
              type="button"
              onClick={() => onAnular(motivo)}
              disabled={ocupado}
              className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-brand-red px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {ocupado ? <Puntos /> : <IconCircleX size={15} aria-hidden />} Anular pago
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Estado del pago, botón para registrar y el historial. */
function SeccionPagos({
  gasto, pagos, cargando, ocupado, conCambios, onPagar, onAnular,
}: {
  gasto: GastoVista
  pagos: PagoVista[] | null
  cargando: boolean
  ocupado: boolean
  /** Hay cambios sin guardar: pagar los mezclaría con un monto viejo. */
  conCambios: boolean
  onPagar: () => void
  onAnular: (pagoId: string, motivo: string) => void
}) {
  const sePuedePagar = gasto.saldo > 0 && gasto.estado !== 'Anulado'
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface2" aria-label="Pagos del gasto">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 space-y-1 text-sm">
          <EstadoBadge dominio="gastos" estado={gasto.estado} />
          <p className="text-muted">
            {gasto.estado === 'Anulado'
              ? 'Se anuló en Fudo: no suma en ningún total.'
              : gasto.estado === 'Pagado'
                ? <>Pagado entero: <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(gasto.monto)}</span></>
                : gasto.pagado > 0
                  ? <>Pagado <span className="tabular-nums">{formatearMonedaExacta(gasto.pagado)}</span> de <span className="tabular-nums">{formatearMonedaExacta(gasto.monto)}</span> · falta <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(gasto.saldo)}</span></>
                  : <>Falta pagar <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(gasto.saldo)}</span></>}
            {gasto.fechaVencimiento && sePuedePagar && (
              <span className={gasto.vencido ? 'font-semibold text-warning' : ''}>
                {' · '}{gasto.vencido ? 'venció' : 'vence'} el {formatearFecha(gasto.fechaVencimiento)}
              </span>
            )}
          </p>
          {sePuedePagar && conCambios && <p className="text-xs text-muted">Guardá los cambios antes de registrar un pago.</p>}
        </div>
        {sePuedePagar && (
          <button type="button" onClick={onPagar} disabled={ocupado || conCambios} className={botonPrimario}>
            <IconWallet size={16} aria-hidden /> Registrar pago
          </button>
        )}
      </div>
      {cargando && !pagos ? (
        <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted"><Puntos /> Trayendo los pagos</p>
      ) : pagos && pagos.length > 0 && (
        <ul className="divide-y divide-border border-t border-border bg-surface" aria-label="Historial de pagos">
          {pagos.map(p => <FilaPago key={p.id} pago={p} ocupado={ocupado} onAnular={motivo => onAnular(p.id, motivo)} />)}
        </ul>
      )}
    </section>
  )
}

/** La factura o el ticket del gasto. En un gasto nuevo se suben al guardar. */
function SeccionAdjuntos({
  adjuntos, enEspera, ocupado, onElegir, onQuitar, onQuitarEnEspera,
}: {
  adjuntos: AdjuntoFila[]
  enEspera: File[]
  ocupado: boolean
  onElegir: (archivos: File[]) => void
  onQuitar: (a: AdjuntoFila) => void
  onQuitarEnEspera: (i: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <Field label="Factura o ticket" ayuda={`Opcional. Fotos o PDF de hasta ${MAX_MB_ARCHIVO} MB.`}>
      <div className="space-y-2">
        {(adjuntos.length > 0 || enEspera.length > 0) && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {adjuntos.map(a => (
              <li key={a.id} className="flex min-h-11 items-center gap-2 px-2">
                <span className="min-w-0 flex-1"><BotonArchivo valor={a.ruta} texto={a.nombre} /></span>
                <button type="button" onClick={() => onQuitar(a)} disabled={ocupado} aria-label={`Quitar ${a.nombre}`}
                  className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-brand-red disabled:opacity-50">
                  <IconTrash size={16} aria-hidden />
                </button>
              </li>
            ))}
            {enEspera.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex min-h-11 items-center gap-3 px-3">
                <IconFileText size={16} className="shrink-0 text-accent-fg" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{f.name}</span>
                <span className="text-xs text-muted">se sube al guardar</span>
                <button type="button" onClick={() => onQuitarEnEspera(i)} disabled={ocupado} aria-label={`Quitar ${f.name}`}
                  className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-brand-red disabled:opacity-50">
                  <IconX size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="presionable flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-text focus-within:border-accent">
          {ocupado ? <Puntos /> : <IconPaperclip size={17} className="shrink-0" aria-hidden />}
          Adjuntar la factura, el ticket o una foto
          <input
            ref={input}
            type="file"
            multiple
            accept={TIPOS_ARCHIVO}
            disabled={ocupado}
            className="sr-only"
            onChange={e => { onElegir([...(e.target.files ?? [])]); if (input.current) input.current.value = '' }}
          />
        </label>
      </div>
    </Field>
  )
}

export default function GastoForm({
  gasto,
  proveedores,
  cajas,
  formasPago,
  locales,
  onCambios,
  onListo,
  onCancelar,
}: {
  /** null = gasto nuevo. */
  gasto: GastoVista | null
  /** Todos, con su estado: el form ofrece los activos y muestra el archivado actual. */
  proveedores: { id: string; nombre: string; estado: string }[]
  cajas: string[]
  formasPago: string[]
  /** Activos (locales_config); el del gasto se muestra aunque esté inactivo. */
  locales: string[]
  onCambios: (hay: boolean) => void
  onListo: () => void
  onCancelar: () => void
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const inicial = useMemo(
    () => formInicial(gasto, hoyISO(), { local: 'YA! FABRICA', formaPago: formasPago.includes('Transferencia') ? 'Transferencia' : formasPago[0] }),
    [gasto, formasPago],
  )
  const [form, setForm] = useState<FormGasto>(inicial)
  const [intento, setIntento] = useState(false)
  const [pagando, setPagando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [detalle, setDetalle] = useState<{ pagos: PagoVista[]; adjuntos: AdjuntoFila[] } | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)
  const [enEspera, setEnEspera] = useState<File[]>([])
  const [comprobanteAlta, setComprobanteAlta] = useState<File | null>(null)
  const ocupado = isPending || subiendo

  const esNuevo = gasto == null
  const deFudo = gasto?.fudo != null
  const bloqueo = bloqueoFactura(gasto)
  // Un gasto de Fudo: monto, fecha, local y proveedor los manda Fudo.
  const candado = bloqueo != null || deFudo
  const problema = validarGasto(form, esNuevo, deFudo)
  const marca = (c: CampoGasto) => (intento && problema?.campo === c ? 'border-brand-red' : '')
  const categorias = categoriasDe(form.rubro)
  const conCambios = hayCambios(form, inicial)

  // Pagos y adjuntos: se vuelven a pedir cuando cambian los totales del gasto
  // (las acciones llaman a refresh() y el gasto llega actualizado).
  const gastoId = gasto?.id
  // El error va en línea y no en un toast: el toast cambia en cada render del
  // proveedor y volvería a disparar la carga.
  const cargarDetalle = useCallback(async () => {
    if (!gastoId) return
    setCargandoDetalle(true)
    const r = await detalleGasto(gastoId)
    setCargandoDetalle(false)
    if (!r.ok) { setErrorDetalle(r.error); return }
    setErrorDetalle(null)
    setDetalle({ pagos: armarPagos(r.data.pagos), adjuntos: r.data.adjuntos })
  }, [gastoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarDetalle() }, [cargarDetalle, gasto?.pagado, gasto?.pagos, gasto?.adjuntos])

  function cambiar(parcial: Partial<FormGasto>) {
    const nuevo = { ...form, ...parcial }
    if (parcial.rubro !== undefined && parcial.rubro !== form.rubro) {
      const cats = categoriasDe(parcial.rubro)
      nuevo.categoria = cats.length === 1 ? cats[0] : ''
    }
    setForm(nuevo)
    // Fuera del actualizador: avisar al padre durante el render es un error de React.
    onCambios(hayCambios(nuevo, inicial) || enEspera.length > 0)
  }

  function elegirArchivos(archivos: File[]) {
    const grandes = archivos.filter(f => f.size > MAX_MB_ARCHIVO * 1024 * 1024)
    if (grandes.length) toast.error(`${grandes.map(f => f.name).join(', ')} pesa${grandes.length > 1 ? 'n' : ''} más de ${MAX_MB_ARCHIVO} MB.`)
    const ok = archivos.filter(f => f.size <= MAX_MB_ARCHIVO * 1024 * 1024)
    if (!ok.length) return
    if (esNuevo) {
      setEnEspera(prev => [...prev, ...ok])
      onCambios(true)
      return
    }
    void subirAdjuntos(gasto.id, ok).then(fallas => {
      if (fallas) toast.error(`No se pudo${fallas > 1 ? 'ieron' : ''} subir ${fallas} archivo${fallas > 1 ? 's' : ''}. Probá de nuevo.`)
      else toast.success(ok.length > 1 ? 'Archivos adjuntados' : 'Archivo adjuntado')
    })
  }

  /** Sube y registra los archivos de un gasto. Devuelve cuántos fallaron. */
  async function subirAdjuntos(id: string, archivos: File[]): Promise<number> {
    setSubiendo(true)
    let fallas = 0
    for (const f of archivos) {
      try {
        const subido = await subirArchivoGasto(id, f, 'adjunto')
        const r = await agregarAdjuntoGasto({ gastoId: id, ...subido })
        if (!r.ok) { fallas++; void borrarArchivoGasto(subido.ruta) }
      } catch {
        fallas++
      }
    }
    setSubiendo(false)
    return fallas
  }

  function quitarAdjunto(a: AdjuntoFila) {
    confirmar({
      titulo: 'Quitar el archivo',
      mensaje: `Se borra "${a.nombre}" de este gasto.`,
      textoConfirmar: 'Quitar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await quitarAdjuntoGasto(a.id)
        if (!r.ok) { toast.error(r.error); return }
        if (r.data) void borrarArchivoGasto(r.data)
        toast.success('Archivo quitado')
      }),
    })
  }

  function guardar() {
    setIntento(true)
    if (problema) { toast.error(problema.mensaje); return }
    startTransition(async () => {
      // El comprobante del pago de un alta ya pagada se sube antes de guardar.
      let comprobanteUrl: string | null = null
      if (esNuevo && form.yaPagado && comprobanteAlta) {
        try {
          comprobanteUrl = (await subirArchivoGasto(`nuevo-${Date.now()}`, comprobanteAlta, 'pago')).ruta
        } catch (e) {
          toast.error(mensajeError(e, 'No se pudo subir el comprobante. Probá de nuevo o guardá el gasto sin él.'))
          return
        }
      }
      const r = await guardarGasto({
        id: gasto?.id ?? null,
        fecha: form.fecha,
        local: form.local,
        rubro: form.rubro,
        categoria: form.categoria,
        proveedorId: form.proveedorId || null,
        monto: form.monto ?? 0,
        formaPago: form.formaPago,
        observaciones: form.observaciones.trim() || null,
        fechaVencimiento: form.fechaVencimiento || null,
        pago: esNuevo && form.yaPagado ? { fechaPago: form.fechaPago, caja: form.caja, comprobanteUrl } : null,
      })
      if (!r.ok) {
        if (comprobanteUrl) void borrarArchivoGasto(comprobanteUrl)
        toast.error(r.error)
        return
      }
      toast.success(esNuevo
        ? (form.yaPagado ? 'Gasto cargado y pagado' : 'Gasto cargado · queda pendiente de pago')
        : 'Cambios guardados')
      if (esNuevo && enEspera.length) {
        const fallas = await subirAdjuntos(r.data, enEspera)
        if (fallas) toast.error(`El gasto se guardó, pero ${fallas} archivo${fallas > 1 ? 's no se pudieron' : ' no se pudo'} subir. Abrilo y adjuntalo de nuevo.`)
      }
      onListo()
    })
  }

  async function pagar(datos: DatosPago): Promise<boolean> {
    if (!gasto) return false
    return await new Promise(resolve => startTransition(async () => {
      const r = await registrarPagoGasto({ id: gasto.id, ...datos })
      if (!r.ok) { toast.error(r.error); resolve(false); return }
      toast.success(`Pago registrado · ${formatearMonedaExacta(datos.monto ?? gasto.saldo)}`)
      setPagando(false)
      resolve(true)
    }))
  }

  function anularPago(pagoId: string, motivo: string) {
    startTransition(async () => {
      const r = await anularPagoGasto(pagoId, motivo.trim() || null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Pago anulado: quedó en el historial')
    })
  }

  function eliminar() {
    if (!gasto) return
    const motivo = motivoNoEliminar(gasto)
    if (motivo) { toast.error(motivo); return }
    confirmar({
      titulo: 'Eliminar gasto',
      mensaje: `Se borra el gasto de ${formatearMonedaExacta(gasto.monto)} (${gasto.local}, ${formatearFecha(gasto.fecha)}). No se puede deshacer.`,
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await eliminarGasto(gasto.id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success('Gasto eliminado')
        onListo()
      }),
    })
  }

  // B3 (E19): solo activos, más el del gasto si se archivó (si no, se vería "Sin proveedor").
  const opcionesProveedor: OpcionSelect[] = [
    { value: '', label: 'Sin proveedor' },
    ...proveedores
      .filter(p => p.estado === 'activo' || p.id === inicial.proveedorId)
      .map(p => ({ value: p.id, label: p.estado === 'activo' ? p.nombre : `${p.nombre} (archivado)` })),
  ]
  const sePuedeEliminar = gasto != null && motivoNoEliminar(gasto) == null

  return (
    <div className="space-y-5">
      {gasto && (
        <SeccionPagos
          gasto={gasto}
          pagos={detalle?.pagos ?? null}
          cargando={cargandoDetalle}
          ocupado={ocupado}
          conCambios={conCambios}
          onPagar={() => setPagando(true)}
          onAnular={anularPago}
        />
      )}
      {errorDetalle && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-brand-red">
          {errorDetalle}
          <button type="button" onClick={() => void cargarDetalle()} className={botonTexto}>Reintentar</button>
        </p>
      )}

      {gasto?.fudo && (
        <div className="space-y-1 rounded-xl border border-border px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 font-medium text-text">
            <IconBuildingStore size={16} className="shrink-0 text-accent-fg" aria-hidden />
            Cargado en Fudo de {gasto.local}
            {gasto.fudo.descripcion && <span className="font-normal text-muted">· {gasto.fudo.descripcion}</span>}
          </p>
          <p className="text-xs text-muted">
            {[gasto.fudo.proveedor && `Proveedor en Fudo: ${gasto.fudo.proveedor}`, gasto.fudo.categoria && `categoría en Fudo: ${gasto.fudo.categoria}`].filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-muted">Acá se clasifica y se paga. El monto, la fecha y el proveedor se corrigen en Fudo; la app nunca cambia nada allá.</p>
          {gasto.fudo.revisar && (
            <p className="flex items-start gap-1.5 pt-1 text-xs font-semibold text-warning">
              <IconAlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              Cambió en Fudo después de pagarlo acá (se canceló, ya no figura o bajó el monto). Revisá los pagos.
            </p>
          )}
        </div>
      )}

      {gasto?.factura && (
        <p className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border px-4 py-2.5 text-sm text-text">
          <IconReceipt size={16} className="shrink-0 text-accent-fg" aria-hidden />
          Salió de la factura{' '}
          <LinkEntidad entidad={{ tipo: 'factura', id: gasto.factura.id }} className="font-semibold">{gasto.factura.numero}</LinkEntidad>
          {gasto.factura.codigoPedido && (
            <span className="text-muted">
              · pedido{' '}
              {gasto.factura.pedidoId
                ? <LinkEntidad entidad={{ tipo: 'pedido', id: gasto.factura.pedidoId }}>{gasto.factura.codigoPedido}</LinkEntidad>
                : <span className="font-mono tabular-nums">{gasto.factura.codigoPedido}</span>}
            </span>
          )}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha del gasto" obligatorio>
          {deFudo ? (
            <p className="flex min-h-11 items-center gap-2 text-sm text-text">
              {formatearFecha(form.fecha)} <IconLock size={14} className="text-muted" aria-label="La manda Fudo" />
            </p>
          ) : (
            <DatePicker
              ariaLabel="Fecha del gasto"
              value={form.fecha}
              onChange={fecha => cambiar({ fecha })}
              className={`${controlClass} min-h-11 ${marca('fecha')}`}
            />
          )}
        </Field>
        <Field label="Monto" obligatorio>
          {candado ? (
            <p className="flex min-h-11 items-center gap-2 text-lg font-bold tabular-nums text-text">
              {formatearMonedaExacta(form.monto ?? 0)} <IconLock size={14} className="text-muted" aria-label={deFudo ? 'Lo manda Fudo' : 'Sale de la factura'} />
            </p>
          ) : (
            <InputNumero
              value={form.monto}
              onChange={monto => cambiar({ monto })}
              min={0}
              placeholder="0"
              ariaLabel="Monto del gasto en pesos"
              className={`${controlClass} min-h-11 text-right text-base font-semibold tabular-nums ${marca('monto')}`}
            />
          )}
        </Field>
        <Field label="Local" obligatorio>
          {deFudo ? (
            <p className="flex min-h-11 items-center gap-2 text-sm text-text">
              {form.local} <IconLock size={14} className="text-muted" aria-label="Lo manda Fudo" />
            </p>
          ) : (
          <select
            aria-label="Local al que corresponde el gasto"
            value={form.local}
            onChange={e => cambiar({ local: e.target.value })}
            className={`${controlClass} min-h-11 ${marca('local')}`}
          >
            <option value="">Elegí el local…</option>
            {locales.map(l => <option key={l} value={l}>{l}</option>)}
            {form.local && !locales.includes(form.local) && <option value={form.local}>{form.local}</option>}
          </select>
          )}
        </Field>
        <Field label="Proveedor">
          {candado ? (
            <p className="flex min-h-11 items-center gap-2 text-sm text-text">
              {gasto?.proveedor ?? gasto?.fudo?.proveedor ?? 'Sin proveedor'} <IconLock size={14} className="text-muted" aria-label={deFudo ? 'Lo manda Fudo' : 'Sale de la factura'} />
            </p>
          ) : (
            <SelectBuscador value={form.proveedorId} onChange={proveedorId => cambiar({ proveedorId })} opciones={opcionesProveedor} placeholderVacio="Sin proveedor" />
          )}
        </Field>
        <Field label="Rubro" obligatorio={!deFudo}>
          <select
            aria-label="Rubro del gasto"
            value={form.rubro}
            onChange={e => cambiar({ rubro: e.target.value })}
            className={`${controlClass} min-h-11 ${marca('rubro')}`}
          >
            <option value="">{deFudo ? 'Sin clasificar' : 'Elegí el rubro…'}</option>
            {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
            {form.rubro && !RUBROS.includes(form.rubro) && <option value={form.rubro}>{form.rubro}</option>}
          </select>
        </Field>
        <Field label="Categoría" obligatorio={!deFudo || !!form.rubro}>
          <select
            aria-label="Categoría del gasto"
            value={form.categoria}
            onChange={e => cambiar({ categoria: e.target.value })}
            disabled={!form.rubro}
            className={`${controlClass} min-h-11 ${marca('categoria')}`}
          >
            <option value="">{form.rubro ? 'Elegí la categoría…' : 'Primero elegí el rubro'}</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            {form.categoria && !categorias.includes(form.categoria) && <option value={form.categoria}>{form.categoria}</option>}
          </select>
        </Field>
        <Field label="Vence" ayuda="Opcional. Si vence, Pendientes lo marca cuando pasa la fecha.">
          <DatePicker
            ariaLabel="Fecha de vencimiento del gasto"
            value={form.fechaVencimiento}
            min={form.fecha || undefined}
            limpiable
            placeholder="Sin vencimiento"
            onChange={fechaVencimiento => cambiar({ fechaVencimiento })}
            className={`${controlClass} min-h-11 ${marca('fechaVencimiento')}`}
          />
        </Field>
      </div>

      {bloqueo && <p className="-mt-2 text-xs text-muted">{bloqueo}</p>}

      {deFudo ? (
        <Field label="Forma de pago en Fudo">
          <p className="flex min-h-11 items-center gap-2 text-sm text-text">{form.formaPago} <IconLock size={14} className="text-muted" aria-label="La manda Fudo" /></p>
        </Field>
      ) : (
        <Field label="Forma de pago prevista" obligatorio>
          <ChipGroup opciones={formasPago.map(f => ({ value: f, label: f }))} value={form.formaPago} onChange={formaPago => cambiar({ formaPago })} />
        </Field>
      )}

      <Field label="Observaciones">
        <textarea
          aria-label="Observaciones del gasto"
          rows={2}
          maxLength={500}
          value={form.observaciones}
          onChange={e => cambiar({ observaciones: e.target.value })}
          placeholder="Lo que quieras recordar de este gasto"
          className={`${controlClass} py-2`}
        />
      </Field>

      <SeccionAdjuntos
        adjuntos={detalle?.adjuntos ?? []}
        enEspera={enEspera}
        ocupado={ocupado}
        onElegir={elegirArchivos}
        onQuitar={quitarAdjunto}
        onQuitarEnEspera={i => setEnEspera(prev => prev.filter((_, j) => j !== i))}
      />

      {esNuevo && (
        <div className="space-y-3 rounded-xl border border-border px-4 py-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={form.yaPagado}
              onChange={e => cambiar({ yaPagado: e.target.checked })}
              className="size-5 shrink-0 cursor-pointer accent-accent"
            />
            Ya está pagado
          </label>
          {form.yaPagado ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha del pago" obligatorio>
                  <DatePicker
                    ariaLabel="Fecha del pago"
                    value={form.fechaPago}
                    max={hoyISO()}
                    onChange={fechaPago => cambiar({ fechaPago })}
                    className={`${controlClass} min-h-11 ${marca('fechaPago')}`}
                  />
                </Field>
                <Field label="Caja" obligatorio>
                  <select
                    aria-label="Caja de la que salió la plata"
                    value={form.caja}
                    onChange={e => cambiar({ caja: e.target.value })}
                    className={`${controlClass} min-h-11 ${marca('caja')}`}
                  >
                    <option value="">Elegí la caja…</option>
                    {cajas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Comprobante del pago" ayuda={`Opcional. Foto o PDF de hasta ${MAX_MB_ARCHIVO} MB.`}>
                {comprobanteAlta ? (
                  <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface2 px-3 py-2">
                    <IconFileText size={18} className="shrink-0 text-accent-fg" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{comprobanteAlta.name}</span>
                    <button type="button" onClick={() => setComprobanteAlta(null)} disabled={ocupado} aria-label="Quitar el comprobante"
                      className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-brand-red">
                      <IconX size={16} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <label className="presionable flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-text focus-within:border-accent">
                    <IconPaperclip size={17} className="shrink-0" aria-hidden />
                    Adjuntar la foto o el PDF del pago
                    <input
                      type="file"
                      accept={TIPOS_ARCHIVO}
                      className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null
                        if (f && f.size > MAX_MB_ARCHIVO * 1024 * 1024) { toast.error(`El comprobante pesa más de ${MAX_MB_ARCHIVO} MB.`); return }
                        setComprobanteAlta(f)
                      }}
                    />
                  </label>
                )}
              </Field>
            </div>
          ) : (
            <p className="text-xs text-muted">Si no lo tildás, queda en Pendientes de pago hasta que lo pagues.</p>
          )}
        </div>
      )}

      {gasto?.creadoPor && (
        <p className="text-xs text-muted">Lo cargó {gasto.creadoPor}.</p>
      )}

      {/* En el celular, Eliminar va al final del contenido y no en el pie fijo, lejos de Guardar. */}
      {sePuedeEliminar && (
        <button
          type="button"
          onClick={eliminar}
          disabled={ocupado}
          className="presionable min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:hidden"
        >
          <IconTrash size={15} className="text-brand-red" aria-hidden /> Eliminar gasto
        </button>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:flex sm:items-center sm:bg-transparent sm:px-0 sm:pb-0">
        {sePuedeEliminar && (
          <button
            type="button"
            onClick={eliminar}
            disabled={ocupado}
            className="presionable hidden min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:mr-auto sm:inline-flex"
          >
            <IconTrash size={15} className="text-brand-red" aria-hidden /> Eliminar gasto
          </button>
        )}
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <button type="button" onClick={onCancelar} disabled={ocupado} className={botonSecundario}>
            {esNuevo || conCambios ? 'Cancelar' : 'Cerrar'}
          </button>
          <button type="button" onClick={guardar} disabled={ocupado || (!esNuevo && !conCambios)} className={botonPrimario}>
            {ocupado ? <Puntos /> : esNuevo ? <IconCircleCheck size={16} aria-hidden /> : <IconDeviceFloppy size={16} aria-hidden />}
            {esNuevo ? 'Guardar gasto' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {gasto && pagando && (
        <PagoModal
          gasto={{
            clave: gasto.id,
            titulo: gasto.titulo,
            detalle: gasto.subtitulo || null,
            deFudo,
            local: gasto.local,
            fecha: gasto.fecha,
            monto: gasto.saldo,
            montoTotal: gasto.monto,
            origen: 'app',
          }}
          formaPagoInicial={gasto.formaPago}
          cajas={cajas}
          formasPago={formasPago}
          pendiente={isPending}
          onConfirmar={pagar}
          onCerrar={() => setPagando(false)}
        />
      )}
    </div>
  )
}
