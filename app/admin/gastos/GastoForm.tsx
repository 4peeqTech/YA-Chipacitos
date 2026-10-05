'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  CheckCircle2, FileText, Loader2, Lock, ReceiptText, RotateCcw, Save, Trash2, Wallet,
} from 'lucide-react'
import LinkEntidad from '@/components/ui/LinkEntidad'
import DatePicker from '@/components/ui/DatePicker'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import EstadoBadge from '@/components/ui/EstadoBadge'
import { ChipGroup } from '@/components/ui/Chip'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { createClient } from '@/lib/supabase/client'
import { BUCKET_COMPROBANTES, rutaComprobante } from '@/lib/gastos/comprobante'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import { LOCALES, RUBROS, RUBROS_CATEGORIAS } from '@/lib/gastos-constants'
import {
  bloqueoFactura, formInicial, hayCambios, motivoNoEliminar, validarGasto,
  type CampoGasto, type FormGasto, type GastoVista,
} from '@/lib/gastos/modelo'
import { deshacerPagoGasto, eliminarGasto, guardarGasto, registrarPagoGasto } from './acciones'
import PagoModal, { type DatosPago } from './PagoModal'

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

/** Categorías del rubro. Un rubro sin categorías (Movimiento interno) usa el rubro como categoría. */
function categoriasDe(rubro: string): string[] {
  if (!rubro) return []
  const lista = RUBROS_CATEGORIAS[rubro] ?? []
  return lista.length ? lista : [rubro]
}

/** Abre el comprobante con un link firmado (el bucket es privado). */
function VerComprobante({ valor }: { valor: string }) {
  const toast = useToast()
  const [abriendo, setAbriendo] = useState(false)
  const ruta = rutaComprobante(valor)
  if (!ruta) return null

  async function abrir() {
    // La pestaña se abre ya, en el click: después del await el navegador la bloquearía.
    const pestana = window.open('', '_blank')
    setAbriendo(true)
    const { data, error } = await createClient().storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta!, 60)
    setAbriendo(false)
    if (error || !data?.signedUrl) {
      pestana?.close()
      toast.error('No pudimos abrir el comprobante. Puede que se haya borrado: probá de nuevo o subilo otra vez.')
      return
    }
    if (pestana) pestana.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={abriendo}
      className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80 disabled:opacity-50"
    >
      {abriendo ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Ver comprobante
    </button>
  )
}

/** Estado del pago de un gasto existente, con sus acciones. */
function BloquePago({
  gasto, pendiente, conCambios, onPagar, onDeshacer,
}: {
  gasto: GastoVista
  pendiente: boolean
  /** Hay cambios sin guardar: pagar cerraría el formulario y los perdería. */
  conCambios: boolean
  onPagar: () => void
  onDeshacer: () => void
}) {
  if (gasto.estado === 'Pagado') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface2 px-4 py-3">
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-text">
            <CheckCircle2 size={16} className="shrink-0 text-success" />
            Pagado{gasto.fechaPago && <> el {formatearFecha(gasto.fechaPago)}</>}
          </p>
          <p className="text-muted">
            {[gasto.formaPago, gasto.caja && `caja ${gasto.caja}`, gasto.pagadoPor && `por ${gasto.pagadoPor}`].filter(Boolean).join(' · ')}
          </p>
          {gasto.comprobanteUrl && <VerComprobante valor={gasto.comprobanteUrl} />}
        </div>
        <button type="button" onClick={onDeshacer} disabled={pendiente} className={botonSecundario}>
          <RotateCcw size={15} /> Deshacer pago
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface2 px-4 py-3">
      <div className="text-sm">
        <EstadoBadge dominio="gastos" estado={gasto.estado} />
        <p className="mt-1 text-muted">
          {conCambios ? 'Guardá los cambios antes de registrar el pago.' : 'Cuando lo pagues, registralo acá con la caja y el comprobante.'}
        </p>
      </div>
      <button type="button" onClick={onPagar} disabled={pendiente || conCambios} className={botonPrimario}>
        <Wallet size={16} /> Registrar pago
      </button>
    </div>
  )
}

export default function GastoForm({
  gasto,
  proveedores,
  cajas,
  formasPago,
  onCambios,
  onListo,
  onCancelar,
}: {
  /** null = gasto nuevo. */
  gasto: GastoVista | null
  proveedores: { id: string; nombre: string }[]
  cajas: string[]
  formasPago: string[]
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

  const esNuevo = gasto == null
  const bloqueo = bloqueoFactura(gasto)
  const problema = validarGasto(form, esNuevo)
  const marca = (c: CampoGasto) => (intento && problema?.campo === c ? 'border-brand-red' : '')
  const categorias = categoriasDe(form.rubro)

  function cambiar(parcial: Partial<FormGasto>) {
    const nuevo = { ...form, ...parcial }
    if (parcial.rubro !== undefined && parcial.rubro !== form.rubro) {
      const cats = categoriasDe(parcial.rubro)
      nuevo.categoria = cats.length === 1 ? cats[0] : ''
    }
    setForm(nuevo)
    // Fuera del actualizador: avisar al padre durante el render es un error de React.
    onCambios(hayCambios(nuevo, inicial))
  }

  const opcionesProveedor: OpcionSelect[] = [
    { value: '', label: 'Sin proveedor' },
    ...proveedores.map(p => ({ value: p.id, label: p.nombre })),
  ]

  function guardar() {
    setIntento(true)
    if (problema) { toast.error(problema.mensaje); return }
    startTransition(async () => {
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
        pago: esNuevo && form.yaPagado ? { fechaPago: form.fechaPago, caja: form.caja, comprobanteUrl: null } : null,
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(esNuevo
        ? (form.yaPagado ? 'Gasto cargado y pagado' : 'Gasto cargado · queda pendiente de pago')
        : 'Cambios guardados')
      onListo()
    })
  }

  async function pagar(datos: DatosPago): Promise<boolean> {
    if (!gasto) return false
    return await new Promise(resolve => startTransition(async () => {
      const r = await registrarPagoGasto({ id: gasto.id, ...datos })
      if (!r.ok) { toast.error(r.error); resolve(false); return }
      toast.success(`Pago registrado · ${formatearMonedaExacta(gasto.monto)}`)
      setPagando(false)
      onListo()
      resolve(true)
    }))
  }

  function deshacerPago() {
    if (!gasto) return
    confirmar({
      titulo: 'Deshacer el pago',
      mensaje: `El gasto de ${formatearMonedaExacta(gasto.monto)} vuelve a quedar pendiente de pago. Se borran la fecha del pago, la caja y el comprobante.`,
      textoConfirmar: 'Deshacer pago',
      onConfirmar: () => startTransition(async () => {
        const r = await deshacerPagoGasto(gasto.id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success('El gasto volvió a pendiente de pago')
        onListo()
      }),
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

  return (
    <div className="space-y-5">
      {gasto && (
        <BloquePago gasto={gasto} pendiente={isPending} conCambios={hayCambios(form, inicial)} onPagar={() => setPagando(true)} onDeshacer={deshacerPago} />
      )}

      {gasto?.factura && (
        <p className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border px-4 py-2.5 text-sm text-text">
          <ReceiptText size={16} className="shrink-0 text-accent-fg" />
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
          <DatePicker
            ariaLabel="Fecha del gasto"
            value={form.fecha}
            onChange={fecha => cambiar({ fecha })}
            className={`${controlClass} min-h-11 ${marca('fecha')}`}
          />
        </Field>
        <Field label="Monto" obligatorio>
          {bloqueo ? (
            <p className="flex min-h-11 items-center gap-2 text-lg font-bold tabular-nums text-text">
              {formatearMonedaExacta(form.monto ?? 0)} <Lock size={14} className="text-muted" aria-label="Sale de la factura" />
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
          <select
            aria-label="Local al que corresponde el gasto"
            value={form.local}
            onChange={e => cambiar({ local: e.target.value })}
            className={`${controlClass} min-h-11 ${marca('local')}`}
          >
            <option value="">Elegí el local…</option>
            {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
            {form.local && !(LOCALES as readonly string[]).includes(form.local) && <option value={form.local}>{form.local}</option>}
          </select>
        </Field>
        <Field label="Proveedor">
          {bloqueo ? (
            <p className="flex min-h-11 items-center gap-2 text-sm text-text">
              {gasto?.proveedor ?? 'Sin proveedor'} <Lock size={14} className="text-muted" aria-label="Sale de la factura" />
            </p>
          ) : (
            <SelectBuscador value={form.proveedorId} onChange={proveedorId => cambiar({ proveedorId })} opciones={opcionesProveedor} placeholderVacio="Sin proveedor" />
          )}
        </Field>
        <Field label="Rubro" obligatorio>
          <select
            aria-label="Rubro del gasto"
            value={form.rubro}
            onChange={e => cambiar({ rubro: e.target.value })}
            className={`${controlClass} min-h-11 ${marca('rubro')}`}
          >
            <option value="">Elegí el rubro…</option>
            {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
            {form.rubro && !RUBROS.includes(form.rubro) && <option value={form.rubro}>{form.rubro}</option>}
          </select>
        </Field>
        <Field label="Categoría" obligatorio>
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
      </div>

      {bloqueo && <p className="-mt-2 text-xs text-muted">{bloqueo}</p>}

      <Field label="Forma de pago" obligatorio>
        <ChipGroup opciones={formasPago.map(f => ({ value: f, label: f }))} value={form.formaPago} onChange={formaPago => cambiar({ formaPago })} />
      </Field>

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
          ) : (
            <p className="text-xs text-muted">Si no lo tildás, queda en Pendientes de pago hasta que lo pagues.</p>
          )}
        </div>
      )}

      {gasto?.creadoPor && (
        <p className="text-xs text-muted">Lo cargó {gasto.creadoPor}.</p>
      )}

      {/* En el celular, Eliminar va al final del contenido y no en el pie fijo, lejos de Guardar. */}
      {gasto && !gasto.factura && (
        <button
          type="button"
          onClick={eliminar}
          disabled={isPending}
          className="presionable min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:hidden"
        >
          <Trash2 size={15} className="text-brand-red" /> Eliminar gasto
        </button>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:flex sm:items-center sm:bg-transparent sm:px-0 sm:pb-0">
        {gasto && !gasto.factura && (
          <button
            type="button"
            onClick={eliminar}
            disabled={isPending}
            className="presionable hidden min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:mr-auto sm:inline-flex"
          >
            <Trash2 size={15} className="text-brand-red" /> Eliminar gasto
          </button>
        )}
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <button type="button" onClick={onCancelar} disabled={isPending} className={botonSecundario}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={isPending} className={botonPrimario}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {esNuevo ? 'Guardar gasto' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {gasto && pagando && (
        <PagoModal
          gasto={{
            clave: `app-${gasto.id}`,
            titulo: gasto.proveedor ?? gasto.categoria,
            detalle: gasto.proveedor ? gasto.categoria : null,
            local: gasto.local,
            fecha: gasto.fecha,
            monto: gasto.monto,
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

