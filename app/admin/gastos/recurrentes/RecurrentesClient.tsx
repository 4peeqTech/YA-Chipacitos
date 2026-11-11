'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  IconAlertTriangle, IconArrowLeft, IconCircleCheck, IconDeviceFloppy, IconPlayerPause, IconPlayerPlay, IconPlus,
  IconRepeat, IconTrash,
} from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import DataTable, { type Columna } from '@/components/ui/DataTable'
import DatePicker from '@/components/ui/DatePicker'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import { ChipGroup } from '@/components/ui/Chip'
import { Puntos } from '@/components/ui/Cargando'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha, formatearMonedaExacta } from '@/lib/formato'
import type { CuentaPlan } from '@/lib/gastos/plan'
import {
  formRecurrenteInicial, textoDia, validarRecurrente,
  type CampoRecurrente, type FormRecurrente, type RecurrenteFila,
} from '@/lib/gastos/modelo'
import { activarRecurrente, eliminarRecurrente, guardarRecurrente } from '../acciones'
import CampoCuenta from '../CampoCuenta'

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

type Proveedor = { id: string; nombre: string; estado: string }

function FormRecurrente({
  plantilla, hoy, proveedores, formasPago, locales, cuentas, onListo, onCancelar,
}: {
  plantilla: RecurrenteFila | null
  cuentas: CuentaPlan[]
  hoy: string
  proveedores: Proveedor[]
  formasPago: string[]
  locales: string[]
  onListo: () => void
  onCancelar: () => void
}) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<FormRecurrente>(() =>
    formRecurrenteInicial(plantilla, hoy, formasPago.includes('Transferencia') ? 'Transferencia' : formasPago[0]))
  const [intento, setIntento] = useState(false)
  const problema = validarRecurrente(form)
  const marca = (c: CampoRecurrente) => (intento && problema?.campo === c ? 'border-brand-red' : '')
  const esNueva = plantilla == null

  function cambiar(parcial: Partial<FormRecurrente>) {
    setForm(f => ({ ...f, ...parcial }))
  }

  const opcionesProveedor: OpcionSelect[] = [
    { value: '', label: 'Sin proveedor' },
    ...proveedores
      .filter(p => p.estado === 'activo' || p.id === plantilla?.proveedor_id)
      .map(p => ({ value: p.id, label: p.estado === 'activo' ? p.nombre : `${p.nombre} (archivado)` })),
  ]

  function guardar() {
    setIntento(true)
    if (problema) { toast.error(problema.mensaje); return }
    startTransition(async () => {
      const r = await guardarRecurrente({
        id: plantilla?.id ?? null,
        nombre: form.nombre,
        local: form.local,
        cuenta: form.cuenta,
        proveedorId: form.proveedorId || null,
        monto: form.monto ?? 0,
        montoVariable: form.montoVariable,
        formaPago: form.formaPago,
        diaDelMes: form.diaDelMes ?? 0,
        diasParaVencer: form.diasParaVencer,
        desde: form.desde,
        hasta: form.hasta || null,
        observaciones: form.observaciones || null,
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(esNueva ? 'Listo: se va a cargar solo cada mes' : 'Cambios guardados: valen para los meses que vienen')
      onListo()
    })
  }

  function pausar(activo: boolean) {
    if (!plantilla?.id) return
    const id = plantilla.id
    startTransition(async () => {
      const r = await activarRecurrente(id, activo)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(activo ? 'Reactivado: sigue cargándose cada mes' : 'Pausado: no se carga más hasta que lo reactives')
      onListo()
    })
  }

  function eliminar() {
    if (!plantilla?.id) return
    const id = plantilla.id
    confirmar({
      titulo: 'Eliminar',
      mensaje: `Se borra "${plantilla.nombre}". Nunca generó gastos, así que no se pierde nada.`,
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await eliminarRecurrente(id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success('Eliminado')
        onListo()
      }),
    })
  }

  return (
    <div className="space-y-5">
      {plantilla && !plantilla.activo && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-muted">
          <IconPlayerPause size={16} aria-hidden /> Pausado: no se está cargando. Reactivalo para que siga.
        </p>
      )}

      <Field label="Nombre" obligatorio ayuda="Es lo que se ve en la lista de gastos.">
        <input
          aria-label="Nombre del gasto que se repite"
          value={form.nombre}
          onChange={e => cambiar({ nombre: e.target.value })}
          maxLength={120}
          placeholder="Por ejemplo: Alquiler San Lorenzo"
          className={`${controlClass} min-h-11 ${marca('nombre')}`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Local" obligatorio>
          <select aria-label="Local" value={form.local} onChange={e => cambiar({ local: e.target.value })} className={`${controlClass} min-h-11 ${marca('local')}`}>
            <option value="">Elegí el local…</option>
            {locales.map(l => <option key={l} value={l}>{l}</option>)}
            {form.local && !locales.includes(form.local) && <option value={form.local}>{form.local}</option>}
          </select>
        </Field>
        <Field label="Proveedor">
          <SelectBuscador value={form.proveedorId} onChange={proveedorId => cambiar({ proveedorId })} opciones={opcionesProveedor} placeholderVacio="Sin proveedor" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Cuenta" obligatorio>
            <CampoCuenta
              cuentas={cuentas}
              value={form.cuenta}
              onChange={cuenta => cambiar({ cuenta })}
              actual={plantilla?.cuenta ? { codigo: plantilla.cuenta, nombre: plantilla.cuenta_nombre ?? plantilla.cuenta } : null}
              invalido={marca('cuenta') !== ''}
            />
          </Field>
        </div>
        <Field label="Monto" obligatorio>
          <InputNumero
            value={form.monto}
            onChange={monto => cambiar({ monto })}
            min={0}
            placeholder="0"
            ariaLabel="Monto en pesos"
            className={`${controlClass} min-h-11 text-right text-base font-semibold tabular-nums ${marca('monto')}`}
          />
        </Field>
        <Field label="Día del mes" obligatorio ayuda={textoDia(form.diaDelMes)}>
          <InputNumero
            value={form.diaDelMes}
            onChange={diaDelMes => cambiar({ diaDelMes })}
            min={1}
            ariaLabel="Día del mes en que se carga"
            className={`${controlClass} min-h-11 tabular-nums ${marca('diaDelMes')}`}
          />
        </Field>
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 text-sm text-text">
        <input
          type="checkbox"
          checked={form.montoVariable}
          onChange={e => cambiar({ montoVariable: e.target.checked })}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent"
        />
        <span>
          <span className="block font-medium">El monto cambia todos los meses</span>
          <span className="block text-xs text-muted">Como la luz o el agua: se carga con el monto del mes anterior y queda marcado &quot;a confirmar&quot; hasta que lo corrijas.</span>
        </span>
      </label>

      <Field label="Forma de pago" obligatorio>
        <ChipGroup opciones={formasPago.map(f => ({ value: f, label: f }))} value={form.formaPago} onChange={formaPago => cambiar({ formaPago })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Desde" obligatorio>
          <DatePicker ariaLabel="Desde cuándo se repite" value={form.desde} onChange={desde => cambiar({ desde })} className={`${controlClass} min-h-11 ${marca('desde')}`} />
        </Field>
        <Field label="Hasta" ayuda="Opcional. Sin fecha, sigue siempre.">
          <DatePicker ariaLabel="Hasta cuándo se repite" value={form.hasta} min={form.desde || undefined} limpiable placeholder="Sin fin" onChange={hasta => cambiar({ hasta })} className={`${controlClass} min-h-11 ${marca('hasta')}`} />
        </Field>
        <Field label="Vence a los" ayuda="Días desde la fecha del gasto. Opcional.">
          <InputNumero
            value={form.diasParaVencer}
            onChange={diasParaVencer => cambiar({ diasParaVencer })}
            min={0}
            placeholder="Sin vencimiento"
            ariaLabel="Días para vencer"
            className={`${controlClass} min-h-11 tabular-nums ${marca('diasParaVencer')}`}
          />
        </Field>
      </div>

      <Field label="Observaciones">
        <textarea
          aria-label="Observaciones"
          rows={2}
          maxLength={500}
          value={form.observaciones}
          onChange={e => cambiar({ observaciones: e.target.value })}
          placeholder="Se copian en cada gasto que se genera"
          className={`${controlClass} py-2`}
        />
      </Field>

      {!esNueva && <p className="text-xs text-muted">Los cambios valen para los meses que vienen: los gastos ya cargados no se tocan.</p>}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0">
        {plantilla && (
          <>
            <button type="button" onClick={() => pausar(!plantilla.activo)} disabled={isPending} className={botonSecundario}>
              {plantilla.activo ? <><IconPlayerPause size={15} aria-hidden /> Pausar</> : <><IconPlayerPlay size={15} aria-hidden /> Reactivar</>}
            </button>
            {(plantilla.generados ?? 0) === 0 && (
              <button type="button" onClick={eliminar} disabled={isPending}
                className="presionable min-h-11 inline-flex items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50">
                <IconTrash size={15} className="text-brand-red" aria-hidden /> Eliminar
              </button>
            )}
          </>
        )}
        <div className="ml-auto grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={onCancelar} disabled={isPending} className={botonSecundario}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={isPending} className={botonPrimario}>
            {isPending ? <Puntos /> : esNueva ? <IconCircleCheck size={16} aria-hidden /> : <IconDeviceFloppy size={16} aria-hidden />}
            {esNueva ? 'Guardar' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RecurrentesClient({
  plantillas,
  error,
  hoy,
  proveedores,
  formasPago,
  locales,
  cuentas,
}: {
  plantillas: RecurrenteFila[]
  cuentas: CuentaPlan[]
  error: boolean
  hoy: string
  proveedores: Proveedor[]
  formasPago: string[]
  locales: string[]
}) {
  const [abierta, setAbierta] = useState<string | 'nueva' | null>(null)
  const plantilla = abierta && abierta !== 'nueva' ? plantillas.find(p => p.id === abierta) ?? null : null
  const activas = plantillas.filter(p => p.activo)
  const porMes = useMemo(() => activas.reduce((s, p) => s + Number(p.ultimo_monto ?? p.monto ?? 0), 0), [activas])

  const columnas: Columna<RecurrenteFila>[] = [
    {
      key: 'nombre',
      header: 'Nombre',
      render: p => (
        <span className={`block min-w-0 ${p.activo ? '' : 'opacity-60'}`}>
          <span className="block font-medium text-text">{p.nombre}</span>
          <span className="block text-xs text-muted">{[p.local, p.cuenta_nombre, p.proveedor_nombre].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    {
      key: 'cuando',
      header: 'Cuándo',
      render: p => (
        <span className="block text-sm">
          <span className="block">{textoDia(p.dia_del_mes)}</span>
          {p.dias_para_vencer != null && <span className="block text-xs text-muted">vence a los {p.dias_para_vencer} días</span>}
        </span>
      ),
      ocultarHasta: 'md',
    },
    {
      key: 'monto',
      header: 'Monto',
      alinear: 'right',
      render: p => (
        <span className="inline-flex flex-col items-end">
          <span className="whitespace-nowrap font-semibold tabular-nums">{formatearMonedaExacta(Number(p.ultimo_monto ?? p.monto ?? 0))}</span>
          {p.monto_variable && <span className="whitespace-nowrap text-2xs text-muted">cambia cada mes</span>}
        </span>
      ),
    },
    {
      key: 'proximo',
      header: 'Próximo',
      render: p => !p.activo
        ? <span className="inline-flex items-center gap-1 text-sm text-muted"><IconPlayerPause size={14} aria-hidden /> Pausado</span>
        : p.proximo ? <span className="whitespace-nowrap tabular-nums">{formatearFecha(p.proximo)}</span>
        : <span className="text-sm text-muted">Terminó</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icono={IconRepeat}
        titulo="Gastos que se repiten"
        descripcion="Alquileres, sueldos, servicios: se cargan solos cada mes como pendientes de pago."
        acciones={
          <>
            <Link href="/admin/gastos" className={botonSecundario}><IconArrowLeft size={16} aria-hidden /> Gastos</Link>
            <button type="button" onClick={() => setAbierta('nueva')} className={botonPrimario}>
              <IconPlus size={16} aria-hidden /> Nuevo
            </button>
          </>
        }
      />

      {activas.length > 0 && (
        <p className="text-sm text-muted">
          {activas.length} activo{activas.length === 1 ? '' : 's'} · <span className="font-semibold tabular-nums text-text">{formatearMonedaExacta(porMes)}</span> por mes
        </p>
      )}

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          No pudimos cargar los gastos que se repiten. Recargá la página.
        </p>
      ) : plantillas.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <EmptyState
            icono={IconRepeat}
            titulo="Todavía no hay gastos que se repiten"
            descripcion="Cargá el alquiler, los sueldos o los servicios una sola vez: la app los crea cada mes como pendientes de pago."
            accion={<button type="button" onClick={() => setAbierta('nueva')} className={botonPrimario}><IconPlus size={16} aria-hidden /> Nuevo</button>}
          />
        </div>
      ) : (
        <DataTable filas={plantillas} columnas={columnas} filaKey={p => p.id ?? p.nombre ?? ''} onFilaClick={p => setAbierta(p.id)} />
      )}

      <Modal
        open={abierta != null && (abierta === 'nueva' || plantilla != null)}
        onClose={() => setAbierta(null)}
        title={plantilla ? plantilla.nombre ?? 'Gasto que se repite' : 'Nuevo gasto que se repite'}
        size="xl"
        pantallaCompletaMobile
      >
        {abierta && (abierta === 'nueva' || plantilla) && (
          <FormRecurrente
            key={abierta}
            plantilla={plantilla}
            cuentas={cuentas}
            hoy={hoy}
            proveedores={proveedores}
            formasPago={formasPago}
            locales={locales}
            onListo={() => setAbierta(null)}
            onCancelar={() => setAbierta(null)}
          />
        )}
      </Modal>
    </div>
  )
}
