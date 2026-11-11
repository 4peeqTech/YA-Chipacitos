'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { CreditCard, Loader2, Mail, MapPin, Phone, User } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { controlClass } from '@/components/ui/Field'
import { useToast } from '@/components/ui/ProveedorUI'
import { normalizarTelefonoAR } from '@/lib/compras/telefono'
import { guardarProveedor, type DatosProveedor } from './acciones'
import type { ProveedorFila } from './datos'
import type { LocalFacturacion } from './ProveedoresClient'

const labelClass = 'mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted'

type Campos = Required<{ [K in keyof DatosProveedor]: NonNullable<DatosProveedor[K]> }>

function inicial(p: ProveedorFila | null): Campos {
  return {
    nombre: p?.nombre ?? '',
    categoria: p?.categoria ?? '',
    cuit: p?.cuit ?? '',
    contactoNombre: p?.contacto_nombre ?? '',
    contactoTelefono: p?.contacto_telefono ?? '',
    contactoEmail: p?.contacto_email ?? '',
    direccion: p?.direccion ?? '',
    tiempoEntrega: p?.tiempo_entrega ?? '',
    periodicidadCompra: p?.periodicidad_compra ?? '',
    financiacion: p?.financiacion ?? '',
    condicionesPago: p?.condiciones_pago ?? '',
    notas: p?.notas ?? '',
    manejaStock: p?.maneja_stock ?? false,
    localFacturacionId: p?.local_facturacion_id ?? '',
  }
}

function Campo({ label, icono, className = '', children }: { label: string; icono?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClass}>{icono}{label}</span>
      {children}
    </label>
  )
}

/** Alta y edición de un proveedor (B3). Guarda por proveedores_guardar. */
export default function ProveedorForm({
  proveedor,
  localesFacturacion,
  onClose,
  onCreado,
}: {
  /** null = alta. */
  proveedor: ProveedorFila | null
  localesFacturacion: LocalFacturacion[]
  onClose: () => void
  /** Después de un alta: abre la ficha del nuevo. */
  onCreado: (id: string) => void
}) {
  const toast = useToast()
  const [campos, setCampos] = useState<Campos>(() => inicial(proveedor))
  const [error, setError] = useState('')
  const [pendiente, startTransition] = useTransition()

  const set = <K extends keyof Campos>(k: K) => (v: Campos[K]) => setCampos(c => ({ ...c, [k]: v }))
  const texto = (k: Exclude<keyof Campos, 'manejaStock'>) => ({
    value: campos[k],
    onChange: (e: { target: { value: string } }) => set(k)(e.target.value),
    className: controlClass,
    disabled: pendiente,
  })

  function guardar() {
    if (!campos.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    if (campos.contactoTelefono.trim() && !normalizarTelefonoAR(campos.contactoTelefono)) {
      setError('El teléfono de contacto no parece un número argentino válido.')
      return
    }
    setError('')
    const vacio = (s: string) => s.trim() || null
    startTransition(async () => {
      const r = await guardarProveedor({
        id: proveedor?.id ?? null,
        datos: {
          nombre: campos.nombre,
          categoria: vacio(campos.categoria),
          cuit: vacio(campos.cuit),
          contactoNombre: vacio(campos.contactoNombre),
          contactoTelefono: vacio(campos.contactoTelefono),
          contactoEmail: vacio(campos.contactoEmail),
          direccion: vacio(campos.direccion),
          tiempoEntrega: vacio(campos.tiempoEntrega),
          periodicidadCompra: vacio(campos.periodicidadCompra),
          financiacion: vacio(campos.financiacion),
          condicionesPago: vacio(campos.condicionesPago),
          notas: vacio(campos.notas),
          manejaStock: campos.manejaStock,
          localFacturacionId: campos.localFacturacionId || null,
        },
      })
      if (!r.ok) { setError(r.error); return }
      if (!proveedor) {
        toast.success('Proveedor creado')
        onCreado(r.data.id)
        return
      }
      toast.success(r.data.cambios ? 'Cambios guardados' : 'No había cambios')
      onClose()
    })
  }

  return (
    <Modal open onClose={pendiente ? () => {} : onClose} title={proveedor ? `Editar · ${proveedor.nombre}` : 'Nuevo proveedor'} size="xl">
      <form
        className="space-y-4"
        onSubmit={e => { e.preventDefault(); guardar() }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Campo label="Nombre *" className="lg:col-span-2">
            <input {...texto('nombre')} maxLength={120} />
          </Campo>
          <Campo label="Categoría">
            <input {...texto('categoria')} placeholder="Ej: Lácteos, Harinas..." />
          </Campo>
          <Campo label="CUIT" icono={<CreditCard size={13} />}>
            <input {...texto('cuit')} placeholder="20-12345678-9" inputMode="numeric" />
          </Campo>
          <Campo label="Contacto" icono={<User size={13} />}>
            <input {...texto('contactoNombre')} placeholder="Nombre" />
          </Campo>
          <Campo label="Teléfono" icono={<Phone size={13} />}>
            <input {...texto('contactoTelefono')} placeholder="+54 9..." inputMode="tel" />
          </Campo>
          <Campo label="Email" icono={<Mail size={13} />}>
            <input {...texto('contactoEmail')} type="email" />
          </Campo>
          <Campo label="Dirección" icono={<MapPin size={13} />} className="md:col-span-2 lg:col-span-2">
            <input {...texto('direccion')} />
          </Campo>
          <Campo label="Tiempo de entrega">
            <input {...texto('tiempoEntrega')} placeholder="Ej: 24hs, 3-5 días" />
          </Campo>
          <Campo label="Periodicidad de compra">
            <input {...texto('periodicidadCompra')} placeholder="Ej: Semanal, Mensual" />
          </Campo>
          <Campo label="Financiación">
            <input {...texto('financiacion')} placeholder="Ej: 30 días, Contado" />
          </Campo>
          <Campo label="Condiciones de pago">
            <input {...texto('condicionesPago')} placeholder="Ej: Factura A, efectivo" />
          </Campo>
          <Campo label="Local de facturación por defecto">
            <select
              value={campos.localFacturacionId}
              onChange={e => set('localFacturacionId')(e.target.value)}
              className={controlClass}
              disabled={pendiente}
            >
              <option value="">Sin asignar</option>
              {localesFacturacion.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Notas" className="md:col-span-2 lg:col-span-3">
            <textarea {...texto('notas')} rows={2} className={`${controlClass} resize-none`} />
          </Campo>
          {/* A2a (C2): la columna sigue siendo maneja_stock; su único uso real es la autosugerencia de PedidoEditor. */}
          <label className="flex min-h-11 items-start gap-2 md:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={campos.manejaStock}
              onChange={e => set('manejaStock')(e.target.checked)}
              disabled={pendiente}
              className="mt-0.5 size-4 accent-accent"
            />
            <span className="text-sm text-text">
              Sugerir cantidades al pedir
              <span className="block text-muted">Al crear un pedido a este proveedor, arranca con lo que falta para llegar al stock mínimo de cada insumo.</span>
            </span>
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-brand-red">{error}</p>}

        <div className="flex gap-2 border-t border-border pt-4 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pendiente}
            className="min-h-11 flex-1 rounded-xl border border-border px-5 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50 sm:min-h-9 sm:flex-none"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-9 sm:flex-none"
          >
            {pendiente && <Loader2 size={15} className="animate-spin" />}
            {pendiente ? 'Guardando...' : proveedor ? 'Guardar' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
