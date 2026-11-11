'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  Archive, ArchiveRestore, ClipboardList, CreditCard, Loader2, Mail, MapPin, MessageCircle, Package, Pencil, Phone,
  Tag, Trash2, Truck, User, Wallet,
} from 'lucide-react'
import type { Database } from '@/lib/database.types'
import type { PestanaProveedor } from '@/lib/compras/rutas'
import { codigoPedido } from '@/lib/compras/codigos'
import { formatearTelefono, normalizarTelefonoAR } from '@/lib/compras/telefono'
import Modal from '@/components/ui/Modal'
import Pestanas, { panelDe, type Pestana } from '@/components/ui/Pestanas'
import EstadoBadge from '@/components/ui/EstadoBadge'
import LinkEntidad from '@/components/ui/LinkEntidad'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { archivarProveedor, eliminarProveedor, impactoProveedor, type ImpactoProveedor } from './acciones'
import {
  consultarFacturasDe, consultarFacturasProveedor, consultarInsumosDe, consultarPedidosDe, consultarRemitosDe,
  type FacturaDePedidoProveedor, type FacturaDeProveedor, type InsumoDeProveedor, type PedidoDeProveedor, type ProveedorFila,
  type RemitoDeProveedor,
} from './datos'
import { Cargando, ErrorCarga, PanelCuenta, PanelInsumos, PanelPedidos, PanelRemitos } from './FichaPaneles'
import type { LocalFacturacion } from './ProveedoresClient'

interface Datos {
  pedidos: { filas: PedidoDeProveedor[]; facturas: FacturaDePedidoProveedor[] }
  remitos: RemitoDeProveedor[]
  facturas: FacturaDeProveedor[]
  insumos: InsumoDeProveedor[]
}
type Clave = keyof Datos

const NECESITA: Record<PestanaProveedor, (esAdmin: boolean) => Clave[]> = {
  pedidos: () => ['pedidos'],
  remitos: esAdmin => (esAdmin ? ['remitos', 'facturas'] : ['remitos']),
  cuenta: () => ['facturas'],
  insumos: () => ['insumos'],
}

const IMPACTO_VIGENTE_MS = 30_000

const botonSecundario = 'flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50 sm:min-h-9'

/**
 * Ficha del proveedor (B3, §6.3): la puerta a todo lo de ese proveedor. Cada
 * pestaña carga la primera vez que se abre, desde el navegador con RLS.
 */
export default function ProveedorFicha({
  proveedor,
  pestanaInicial,
  insumosActivos,
  pedidosAbiertos,
  localesFacturacion,
  esAdmin,
  diasDemora,
  onEditar,
  onEliminado,
  onClose,
}: {
  proveedor: ProveedorFila
  pestanaInicial?: PestanaProveedor
  insumosActivos: number
  pedidosAbiertos: number
  localesFacturacion: LocalFacturacion[]
  esAdmin: boolean
  diasDemora?: number
  onEditar: () => void
  onEliminado: () => void
  onClose: () => void
}) {
  const supabase = useMemo(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])
  const toast = useToast()
  const confirmar = useConfirmar()
  const [pendiente, startTransition] = useTransition()
  const [accion, setAccion] = useState<'archivar' | 'eliminar' | null>(null)

  const inicial: PestanaProveedor = pestanaInicial === 'cuenta' && !esAdmin ? 'pedidos' : pestanaInicial ?? 'pedidos'
  const [activa, setActiva] = useState<PestanaProveedor>(inicial)

  // ---- Datos de las pestañas: cada clave se pide una sola vez por apertura.
  const [datos, setDatos] = useState<Partial<Datos>>({})
  const [errores, setErrores] = useState<Partial<Record<Clave, string>>>({})
  const pedidas = useRef(new Set<Clave>())
  const montada = useRef(true)
  // En dev, StrictMode desmonta y vuelve a montar: el flag se rearma en cada montaje.
  useEffect(() => {
    montada.current = true
    return () => { montada.current = false }
  }, [])

  const id = proveedor.id
  useEffect(() => {
    const cargadores: Record<Clave, () => Promise<Datos[Clave]>> = {
      pedidos: async () => {
        const { data, error } = await consultarPedidosDe(supabase, id)
        if (error) throw error
        const ids = data.map(p => p.id)
        const facturas = esAdmin && ids.length ? (await consultarFacturasDe(supabase, ids)).data ?? [] : []
        return { filas: data, facturas }
      },
      remitos: async () => {
        const { data, error } = await consultarRemitosDe(supabase, id)
        if (error) throw error
        return data
      },
      facturas: async () => {
        const { data, error } = await consultarFacturasProveedor(supabase, id)
        if (error) throw error
        return data
      },
      insumos: async () => {
        const { data, error } = await consultarInsumosDe(supabase, id)
        if (error) throw error
        return data
      },
    }
    for (const clave of NECESITA[activa](esAdmin)) {
      if (pedidas.current.has(clave)) continue
      pedidas.current.add(clave)
      cargadores[clave]().then(
        valor => { if (montada.current) setDatos(d => ({ ...d, [clave]: valor })) },
        () => { if (montada.current) setErrores(e => ({ ...e, [clave]: 'No se pudo cargar. Cerrá la ficha y volvé a abrirla.' })) },
      )
    }
  }, [activa, esAdmin, id, supabase])

  // ---- Impacto: arma los diálogos de archivar y eliminar.
  const [impacto, setImpacto] = useState<{ datos: ImpactoProveedor; en: number } | null>(null)
  const pedirImpacto = useRef<() => Promise<ImpactoProveedor | null>>(async () => null)
  pedirImpacto.current = async () => {
    const r = await impactoProveedor({ id })
    if (!montada.current) return null
    if (!r.ok) { toast.error(r.error); return null }
    setImpacto({ datos: r.data, en: Date.now() })
    return r.data
  }
  useEffect(() => { void pedirImpacto.current() }, [id, proveedor.estado])

  async function impactoVigente(): Promise<ImpactoProveedor | null> {
    if (impacto && Date.now() - impacto.en < IMPACTO_VIGENTE_MS) return impacto.datos
    return pedirImpacto.current()
  }

  const [bloqueo, setBloqueo] = useState<ImpactoProveedor['abiertos'] | null>(null)

  function pedirArchivar() {
    setAccion('archivar')
    startTransition(async () => {
      const imp = await impactoVigente()
      setAccion(null)
      if (!imp) return
      if (imp.abiertos.length > 0) { setBloqueo(imp.abiertos); return }
      const principal = imp.principal_de
      confirmar({
        titulo: `Archivar ${proveedor.nombre}`,
        textoConfirmar: 'Archivar',
        ancho: 'lg',
        mensaje: (
          <div className="space-y-2">
            <p>Deja de aparecer para pedidos nuevos, gastos nuevos y solicitudes. Su historia (pedidos, facturas y gastos) queda igual.</p>
            {principal.length > 0 && (
              <p>
                Es el proveedor principal de{' '}
                {principal.slice(0, 5).map((i, n) => (
                  <span key={i.id}>
                    {n > 0 && ', '}
                    <LinkEntidad entidad={{ tipo: 'insumo', id: i.id }} variante="texto" className="text-text">{i.nombre}</LinkEntidad>
                  </span>
                ))}
                {principal.length > 5 && ` (+${principal.length - 5})`}. Las solicitudes de Fábrica lo van a seguir proponiendo hasta que cambies el principal en Insumos.
              </p>
            )}
            {imp.pedido_base > 0 && <p>Está en {imp.pedido_base} línea{imp.pedido_base === 1 ? '' : 's'} del pedido base.</p>}
            {imp.solicitudes_abiertas > 0 && (
              <p>Tiene líneas en {imp.solicitudes_abiertas} solicitud{imp.solicitudes_abiertas === 1 ? '' : 'es'} abierta{imp.solicitudes_abiertas === 1 ? '' : 's'}: antes de convertirlas, cambiá el proveedor.</p>
            )}
          </div>
        ),
        onConfirmar: () => cambiarEstado(true),
      })
    })
  }

  function cambiarEstado(archivar: boolean) {
    setAccion('archivar')
    startTransition(async () => {
      const r = await archivarProveedor({ id, archivar })
      setAccion(null)
      if (!r.ok) { toast.error(r.error); void pedirImpacto.current(); return }
      if (r.data.cambio) toast.success(`${proveedor.nombre} ${archivar ? 'archivado' : 'reactivado'}`)
    })
  }

  function pedirEliminar() {
    confirmar({
      titulo: `Eliminar ${proveedor.nombre}`,
      textoConfirmar: 'Eliminar',
      peligroso: true,
      mensaje: 'No tiene pedidos, facturas, gastos ni insumos. Se borra para siempre.',
      onConfirmar: () => {
        setAccion('eliminar')
        startTransition(async () => {
          const r = await eliminarProveedor({ id })
          setAccion(null)
          if (!r.ok) { toast.error(r.error); void pedirImpacto.current(); return }
          toast.success(`${proveedor.nombre} eliminado`)
          onEliminado()
        })
      },
    })
  }

  // ---- Cabecera
  const telefono = normalizarTelefonoAR(proveedor.contacto_telefono)
  const contacto: { icono: ReactNode; texto: ReactNode; titulo: string }[] = [
    proveedor.contacto_nombre && { icono: <User size={13} />, texto: proveedor.contacto_nombre, titulo: 'Contacto' },
    proveedor.contacto_telefono && {
      icono: <Phone size={13} />,
      titulo: 'Teléfono',
      texto: (
        <>
          {formatearTelefono(proveedor.contacto_telefono)}
          {telefono && (
            <a href={`https://wa.me/${telefono}`} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-1 text-success underline-offset-4 hover:underline">
              <MessageCircle size={12} /> WhatsApp
            </a>
          )}
        </>
      ),
    },
    proveedor.contacto_email && { icono: <Mail size={13} />, texto: <span className="break-all">{proveedor.contacto_email}</span>, titulo: 'Email' },
    proveedor.cuit && { icono: <CreditCard size={13} />, texto: proveedor.cuit, titulo: 'CUIT' },
    proveedor.direccion && { icono: <MapPin size={13} />, texto: proveedor.direccion, titulo: 'Dirección' },
  ].filter(x => !!x)

  const local = localesFacturacion.find(l => l.id === proveedor.local_facturacion_id)
  const condiciones = [
    local && `Factura a: ${local.nombre}`,
    proveedor.tiempo_entrega && `Entrega ${proveedor.tiempo_entrega}`,
    proveedor.periodicidad_compra && `Compra ${proveedor.periodicidad_compra.toLowerCase()}`,
    proveedor.condiciones_pago && `Paga: ${proveedor.condiciones_pago}`,
    proveedor.financiacion && `Financiación: ${proveedor.financiacion}`,
  ].filter(Boolean)

  const pestanas: (Pestana & { id: PestanaProveedor })[] = [
    { id: 'pedidos', label: 'Pedidos', icon: <ClipboardList size={14} />, contador: pedidosAbiertos },
    { id: 'remitos', label: esAdmin ? 'Remitos y facturas' : 'Remitos', icon: <Truck size={14} /> },
    ...(esAdmin ? [{ id: 'cuenta' as const, label: 'Cuenta', icon: <Wallet size={14} /> }] : []),
    { id: 'insumos', label: 'Insumos', icon: <Package size={14} />, contador: insumosActivos },
  ]

  const archivado = proveedor.estado === 'archivado'
  const idBase = `ficha-${id}`
  const ocupado = pendiente || accion != null

  function panel(clave: PestanaProveedor): ReactNode {
    const faltan = NECESITA[clave](esAdmin)
    const error = faltan.map(k => errores[k]).find(Boolean)
    switch (clave) {
      case 'pedidos':
        if (errores.pedidos) return <ErrorCarga mensaje={errores.pedidos} />
        return datos.pedidos ? <PanelPedidos pedidos={datos.pedidos.filas} facturas={datos.pedidos.facturas} esAdmin={esAdmin} diasDemora={diasDemora} /> : <Cargando />
      case 'remitos':
        if (errores.remitos) return <ErrorCarga mensaje={errores.remitos} />
        return datos.remitos ? <PanelRemitos remitos={datos.remitos} facturas={datos.facturas} esAdmin={esAdmin} errorFacturas={errores.facturas} /> : <Cargando />
      case 'cuenta':
        if (error) return <ErrorCarga mensaje={error} />
        return datos.facturas ? <PanelCuenta facturas={datos.facturas} /> : <Cargando />
      case 'insumos':
        if (error) return <ErrorCarga mensaje={error} />
        return datos.insumos ? <PanelInsumos insumos={datos.insumos} esAdmin={esAdmin} /> : <Cargando />
    }
  }

  // Las pestañas ya visitadas quedan montadas (ocultas) para no perder su estado.
  const [visitadas, setVisitadas] = useState<PestanaProveedor[]>([inicial])
  function cambiarPestana(p: string) {
    const nueva = p as PestanaProveedor
    setActiva(nueva)
    setVisitadas(v => (v.includes(nueva) ? v : [...v, nueva]))
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={proveedor.nombre}
        size="xl"
        pantallaCompletaMobile
        encabezado={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{proveedor.nombre}</span>
            <EstadoBadge dominio="proveedores" estado={archivado ? 'archivado' : 'activo'} />
            {proveedor.categoria && <span className="inline-flex items-center gap-1 text-sm font-normal text-muted"><Tag size={13} />{proveedor.categoria}</span>}
          </span>
        }
      >
        {(contacto.length > 0 || condiciones.length > 0 || proveedor.notas) && (
          <div className="space-y-1.5 text-sm">
            {contacto.length > 0 && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-text">
                {contacto.map(c => (
                  <span key={c.titulo} className="inline-flex items-center gap-1.5" title={c.titulo}>
                    <span className="text-faint">{c.icono}</span>{c.texto}
                  </span>
                ))}
              </p>
            )}
            {condiciones.length > 0 && <p className="text-muted">{condiciones.join(' · ')}</p>}
            {proveedor.notas && <p className="whitespace-pre-line text-xs text-muted">{proveedor.notas}</p>}
          </div>
        )}

        <Pestanas items={pestanas} activa={activa} onCambiar={cambiarPestana} etiqueta={`Ficha de ${proveedor.nombre}`} idBase={idBase} />

        {visitadas.filter(v => pestanas.some(p => p.id === v)).map(v => (
          <div key={v} {...panelDe(idBase, v)} hidden={v !== activa}>
            {panel(v)}
          </div>
        ))}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onEditar} disabled={ocupado} className={botonSecundario}>
            <Pencil size={15} /> Editar
          </button>
          <div className="flex flex-wrap gap-2">
            {archivado ? (
              <button type="button" onClick={() => cambiarEstado(false)} disabled={ocupado} className={`${botonSecundario} text-text hover:border-accent`}>
                {accion === 'archivar' ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />} Reactivar
              </button>
            ) : (
              <button type="button" onClick={pedirArchivar} disabled={ocupado} className={botonSecundario}>
                {accion === 'archivar' ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />} Archivar
              </button>
            )}
            {impacto?.datos.puede_eliminar && (
              <button
                type="button"
                onClick={pedirEliminar}
                disabled={ocupado}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-brand-red transition-colors hover:bg-danger-bg disabled:opacity-50 sm:min-h-9"
              >
                {accion === 'eliminar' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Eliminar
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={!!bloqueo} onClose={() => setBloqueo(null)} title="No se puede archivar todavía">
        {bloqueo && (
          <div className="space-y-3 text-sm text-muted">
            <p>
              {proveedor.nombre} tiene {bloqueo.length} pedido{bloqueo.length === 1 ? '' : 's'} abierto{bloqueo.length === 1 ? '' : 's'}:{' '}
              {bloqueo.map((p, n) => (
                <span key={p.id}>
                  {n > 0 && ', '}
                  <LinkEntidad entidad={{ tipo: 'pedido', id: p.id }} className="text-text">{codigoPedido(p.numero)}</LinkEntidad>
                </span>
              ))}.
            </p>
            <p>Recibilos, facturalos o cerralos a mano. Después lo vas a poder archivar.</p>
            <button
              type="button"
              autoFocus
              onClick={() => setBloqueo(null)}
              className="min-h-11 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              Entendido
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
