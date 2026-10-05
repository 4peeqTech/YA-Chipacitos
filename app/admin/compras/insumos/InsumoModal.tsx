'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { Archive, ArchiveRestore, History, Loader2, Plus, RotateCcw, Star, Trash2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Redondeo } from '@/lib/fabrica/calculoSugerido'
import { REDONDEO_LABEL } from '@/lib/estados'
import { ALICUOTA_DEFAULT, ALICUOTAS, etiquetaAlicuota } from '@/lib/compras/totalesFactura'
import { formatearMoneda, formatearNumero } from '@/lib/formato'
import { codigoPedido } from '@/lib/compras/codigos'
import Modal from '@/components/ui/Modal'
import HelpTooltip from '@/components/ui/HelpTooltip'
import InputNumero from '@/components/ui/InputNumero'
import SelectBuscador from '@/components/ui/SelectBuscador'
import { controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { archivarInsumo, eliminarInsumo, guardarInsumo } from './acciones'
import type { CategoriaOption, CompraItem, ItemProveedor, ProveedorOption, ResumenInsumo } from './InsumosClient'

interface Linea {
  /** Clave estable de React (las líneas nuevas no tienen proveedor todavía). */
  key: string
  proveedorId: string
  esPrincipal: boolean
  activo: boolean
  codigo: string
  precioRef: number | null
  /** El precio con el que se abrió el form (E2): si la base ya no lo tiene, la RPC rechaza. */
  precioRefAnterior: number | null
  /** Ya existe en la base (su proveedor no se cambia: se quita y se agrega otro). */
  existente: boolean
}

interface Cambio {
  id: string
  lote: string
  campo: string
  proveedor_id: string | null
  valor_anterior: string | null
  valor_nuevo: string | null
  creado_en: string
  origen: string
  profiles: { nombre: string | null } | null
}

const CAMPO_LABEL: Record<string, string> = {
  nombre: 'Nombre',
  unidad: 'Unidad de compra',
  categoria: 'Categoría',
  cantidad_por_unidad: 'Cantidad por unidad',
  cantidad_por_masa: 'Cantidad por masa',
  stock_minimo: 'Stock mínimo',
  stock_maximo: 'Stock máximo',
  redondeo: 'Redondeo',
  a_demanda: 'A demanda',
  alicuota_iva: 'IVA',
}

const labelClass = 'mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted'

let siguienteKey = 0
const nuevaKey = () => `linea-${++siguienteKey}`

function lineasIniciales(pares: ItemProveedor[]): Linea[] {
  return [...pares]
    .sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map(p => ({
      key: nuevaKey(),
      proveedorId: p.proveedor_id,
      esPrincipal: p.es_principal,
      activo: p.activo,
      codigo: p.codigo_proveedor ?? '',
      precioRef: p.precio_ref,
      precioRefAnterior: p.precio_ref,
      existente: true,
    }))
}

const lineaVacia = (esPrincipal: boolean): Linea => ({
  key: nuevaKey(), proveedorId: '', esPrincipal, activo: true, codigo: '', precioRef: null, precioRefAnterior: null, existente: false,
})

/** Lo que importa comparar para saber si el usuario tocó los proveedores. */
const firmaLineas = (ls: Linea[]) =>
  JSON.stringify(ls.map(l => [l.proveedorId, l.esPrincipal, l.activo, l.codigo.trim(), l.precioRef]).sort())

function numeroHist(v: string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? formatearNumero(n) : v
}

function precioHist(v: string | null): string {
  if (v == null) return 'sin precio'
  const n = Number(v)
  return Number.isFinite(n) ? formatearMoneda(n) : v
}

function fechaHoraCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function InsumoModal({
  item,
  proveedoresItem,
  proveedores,
  categorias,
  resumen,
  listas,
  enPedidoBase,
  onClose,
}: {
  /** null = crear. */
  item: CompraItem | null
  proveedoresItem: ItemProveedor[]
  proveedores: ProveedorOption[]
  categorias: CategoriaOption[]
  resumen: ResumenInsumo
  listas: string[]
  enPedidoBase: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [isPending, startTransition] = useTransition()
  const [accion, setAccion] = useState<'guardar' | 'archivar' | 'eliminar' | null>(null)

  const [nombre, setNombre] = useState(item?.nombre ?? '')
  const [unidad, setUnidad] = useState(item?.unidad ?? '')
  const [categoriaId, setCategoriaId] = useState<string | null>(item?.categoria_id ?? null)
  const [cantidadPorUnidad, setCantidadPorUnidad] = useState<number | null>(item?.cantidad_por_unidad ?? 1)
  const [cantidadPorMasa, setCantidadPorMasa] = useState<number | null>(item ? item.cantidad_por_masa : 0)
  const [stockMinimo, setStockMinimo] = useState<number | null>(item ? item.stock_minimo : 0)
  const [redondeo, setRedondeo] = useState<Redondeo>(item?.redondeo ?? 'estandar')
  const [stockMaximo, setStockMaximo] = useState<number | null>(item?.stock_maximo ?? null)
  const [aDemanda, setADemanda] = useState(item?.a_demanda ?? false)
  const [alicuotaIva, setAlicuotaIva] = useState<number>(item?.alicuota_iva ?? ALICUOTA_DEFAULT)

  const [inicial] = useState(() => (item ? lineasIniciales(proveedoresItem) : [lineaVacia(true)]))
  const [lineas, setLineas] = useState<Linea[]>(inicial)

  const [cambios, setCambios] = useState<Cambio[] | null>(null)

  // "Cambios": solo lectura, la RLS alcanza (plan §4).
  useEffect(() => {
    if (!item) return
    let vigente = true
    createClient()
      .from('compras_items_historial')
      .select('id, lote, campo, proveedor_id, valor_anterior, valor_nuevo, creado_en, origen, profiles(nombre)')
      .eq('item_id', item.id)
      .order('creado_en', { ascending: false })
      .limit(30)
      .then(({ data }) => { if (vigente) setCambios((data ?? []) as unknown as Cambio[]) })
    return () => { vigente = false }
  }, [item])

  const nombreProveedor = (id: string | null) => proveedores.find(p => p.id === id)?.nombre ?? 'un proveedor'
  const proveedorActivo = (id: string) => proveedores.find(p => p.id === id)?.activo ?? false

  const activas = lineas.filter(l => l.activo)
  const anteriores = lineas.filter(l => !l.activo)
  const usados = new Set(lineas.map(l => l.proveedorId).filter(Boolean))

  function opcionesPara(l: Linea) {
    return proveedores
      .filter(p => p.id === l.proveedorId || (p.activo && !usados.has(p.id)))
      .map(p => ({ value: p.id, label: p.activo ? p.nombre : `${p.nombre} (archivado)` }))
  }

  function actualizar(key: string, cambios: Partial<Linea>) {
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, ...cambios } : l)))
  }

  function marcarPrincipal(key: string) {
    setLineas(prev => prev.map(l => ({ ...l, esPrincipal: l.key === key })))
  }

  function quitar(key: string) {
    setLineas(prev => {
      const next = prev.filter(l => l.key !== key)
      // Si se quitó la estrella, pasa al primero activo que queda.
      if (!next.some(l => l.esPrincipal && l.activo)) {
        const primero = next.find(l => l.activo)
        return next.map(l => ({ ...l, esPrincipal: l === primero }))
      }
      return next
    })
  }

  function volverAUsar(key: string) {
    setLineas(prev => {
      const hayPrincipal = prev.some(l => l.activo && l.esPrincipal)
      return prev.map(l => (l.key === key ? { ...l, activo: true, esPrincipal: !hayPrincipal } : l))
    })
  }

  function agregar() {
    setLineas(prev => [...prev, lineaVacia(!prev.some(l => l.activo))])
  }

  // ---- Guardar ------------------------------------------------------------

  const datosCambiados = useMemo(() => {
    const d: Parameters<typeof guardarInsumo>[0]['datos'] = {}
    const nom = nombre.trim()
    const uni = unidad.trim()
    if (!item || nom !== item.nombre) d.nombre = nom
    if (!item || uni !== (item.unidad ?? '')) d.unidad = uni
    if (!item ? categoriaId != null : categoriaId !== item.categoria_id) d.categoriaId = categoriaId
    if (cantidadPorUnidad != null && (!item || cantidadPorUnidad !== item.cantidad_por_unidad)) d.cantidadPorUnidad = cantidadPorUnidad
    if (!item || (cantidadPorMasa ?? 0) !== item.cantidad_por_masa) d.cantidadPorMasa = cantidadPorMasa ?? 0
    if (!item || (stockMinimo ?? 0) !== item.stock_minimo) d.stockMinimo = stockMinimo ?? 0
    if (!item || redondeo !== item.redondeo) d.redondeo = redondeo
    if (!item ? stockMaximo != null : stockMaximo !== item.stock_maximo) d.stockMaximo = stockMaximo
    if (!item || aDemanda !== item.a_demanda) d.aDemanda = aDemanda
    if (!item || alicuotaIva !== item.alicuota_iva) d.alicuotaIva = alicuotaIva
    return d
  }, [item, nombre, unidad, categoriaId, cantidadPorUnidad, cantidadPorMasa, stockMinimo, redondeo, stockMaximo, aDemanda, alicuotaIva])

  const proveedoresCambiados = !item || firmaLineas(lineas) !== firmaLineas(inicial)

  function guardar() {
    if (isPending) return
    if (!nombre.trim()) { toast.error('El nombre es obligatorio.'); return }
    if (!unidad.trim()) { toast.error('La unidad de compra es obligatoria.'); return }
    if (!(cantidadPorUnidad != null && cantidadPorUnidad > 0)) { toast.error('La cantidad por unidad tiene que ser mayor a 0.'); return }
    if (lineas.some(l => !l.proveedorId)) { toast.error('Elegí el proveedor de cada línea, o quitala.'); return }
    if (!activas.length) { toast.error('El insumo necesita al menos un proveedor activo.'); return }

    if (item && Object.keys(datosCambiados).length === 0 && !proveedoresCambiados) {
      toast.success('No había cambios')
      onClose()
      return
    }

    setAccion('guardar')
    startTransition(async () => {
      const r = await guardarInsumo({
        itemId: item?.id ?? null,
        datos: datosCambiados,
        proveedores: proveedoresCambiados
          ? lineas.map(l => ({
              proveedorId: l.proveedorId,
              esPrincipal: l.activo && l.esPrincipal,
              activo: l.activo,
              codigo: l.codigo.trim() || null,
              precioRef: l.precioRef,
              precioRefAnterior: l.existente ? l.precioRefAnterior : null,
            }))
          : null,
      })
      setAccion(null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(item ? 'Cambios guardados' : 'Insumo creado')
      onClose()
    })
  }

  // ---- Archivar / reactivar / eliminar -------------------------------------

  function pedirArchivar() {
    if (!item || isPending) return
    const u = item.unidad ?? ''
    const puntos: ReactNode[] = []
    if (listas.length) puntos.push(<>No se va a contar en {listas.join(', ')} (queda guardado en la lista: si lo reactivás, vuelve).</>)
    if (enPedidoBase) puntos.push(<>No entra en el pedido base.</>)
    if (resumen.stock !== 0) puntos.push(<>Tiene <strong className="text-text">{formatearNumero(resumen.stock)} {u}</strong> en stock. Si ya no hay, ajustalo a 0 en Stock.</>)
    for (const p of resumen.pedidosAbiertos) {
      puntos.push(<><strong className="font-mono text-text">{p.numero != null ? codigoPedido(p.numero) : 'Un pedido'}</strong> todavía espera {formatearNumero(p.pendiente)} {u}: ese remito se va a poder cargar igual.</>)
    }
    confirmar({
      titulo: `Archivar ${item.nombre}`,
      textoConfirmar: 'Archivar',
      ancho: 'lg',
      mensaje: (
        <div className="space-y-2">
          <p>
            <span className="text-text">{item.nombre}</span> deja de aparecer en pedidos, remitos, facturas y conteos nuevos.
            No se borra nada: sus movimientos, pedidos y facturas quedan.
          </p>
          {puntos.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {puntos.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>
      ),
      onConfirmar: () => cambiarEstado(true),
    })
  }

  function cambiarEstado(archivar: boolean) {
    if (!item) return
    setAccion('archivar')
    startTransition(async () => {
      const r = await archivarInsumo({ itemId: item.id, archivar })
      setAccion(null)
      if (!r.ok) { toast.error(r.error); return }
      if (archivar) {
        const q = r.data.borradoresQuitados
        toast.success(q > 0 ? `Insumo archivado, se sacó de ${q} conteo${q === 1 ? '' : 's'} en curso` : 'Insumo archivado')
      } else {
        toast.success('Insumo reactivado: vuelve a sus listas de conteo y al pedido base')
      }
      onClose()
    })
  }

  function pedirEliminar() {
    if (!item || isPending) return
    const tambien = [...listas, ...(enPedidoBase ? ['el pedido base'] : [])]
    confirmar({
      titulo: 'Eliminar insumo',
      textoConfirmar: 'Eliminar',
      peligroso: true,
      mensaje: (
        <p>
          ¿Eliminar <span className="text-text">{item.nombre}</span>? No tiene movimientos, pedidos ni facturas.
          {tambien.length > 0 && <> También sale de: {tambien.join(', ').replace(/, ([^,]*)$/, ' y $1')}.</>}
          {' '}No se puede deshacer.
        </p>
      ),
      onConfirmar: () => {
        setAccion('eliminar')
        startTransition(async () => {
          const r = await eliminarInsumo({ itemId: item.id })
          setAccion(null)
          if (!r.ok) { toast.error(r.error); return }
          toast.success('Insumo eliminado')
          onClose()
        })
      },
    })
  }

  // ---- Historial ------------------------------------------------------------

  function lineaCambio(c: Cambio): string | null {
    const prov = c.proveedor_id ? nombreProveedor(c.proveedor_id) : null
    switch (c.campo) {
      case 'creado': return 'Creó el insumo'
      case 'estado': return c.valor_nuevo === 'archivado' ? 'Archivó el insumo' : 'Reactivó el insumo'
      case 'proveedor':
        return c.valor_nuevo != null ? `Agregó a ${c.valor_nuevo}` : `Quitó a ${c.valor_anterior ?? prov}`
      case 'proveedor.activo':
        return c.valor_nuevo === 'no' ? `Pasó a ${prov} a proveedores anteriores` : `Volvió a usar a ${prov}`
      case 'proveedor.principal':
        return c.valor_nuevo === 'sí' ? `Marcó a ${prov} como principal` : null
      case 'proveedor.precio_ref':
        return `Precio ref. de ${prov}: ${precioHist(c.valor_anterior)} → ${precioHist(c.valor_nuevo)}${c.origen === 'factura' ? ' (por factura)' : ''}`
      case 'proveedor.codigo':
        return `Código de ${prov}: ${c.valor_anterior ?? '—'} → ${c.valor_nuevo ?? '—'}`
      case 'a_demanda':
        return `A demanda: ${c.valor_anterior ?? '—'} → ${c.valor_nuevo ?? '—'}`
      case 'redondeo':
        return `Redondeo: ${REDONDEO_LABEL[c.valor_anterior as Redondeo] ?? c.valor_anterior ?? '—'} → ${REDONDEO_LABEL[c.valor_nuevo as Redondeo] ?? c.valor_nuevo ?? '—'}`
      case 'alicuota_iva':
        return `IVA: ${c.valor_anterior != null ? etiquetaAlicuota(Number(c.valor_anterior)) : '—'} → ${c.valor_nuevo != null ? etiquetaAlicuota(Number(c.valor_nuevo)) : '—'}`
      case 'nombre': case 'unidad': case 'categoria':
        return `${CAMPO_LABEL[c.campo]}: ${c.valor_anterior ?? '—'} → ${c.valor_nuevo ?? '—'}`
      default:
        return `${CAMPO_LABEL[c.campo] ?? c.campo}: ${numeroHist(c.valor_anterior)} → ${numeroHist(c.valor_nuevo)}`
    }
  }

  const lotes = useMemo(() => {
    const grupos: { lote: string; quien: string; cuando: string; lineas: string[] }[] = []
    for (const c of cambios ?? []) {
      const texto = lineaCambio(c)
      let g = grupos.find(x => x.lote === c.lote)
      if (!g) {
        g = { lote: c.lote, quien: c.origen === 'factura' ? 'Factura' : c.profiles?.nombre ?? 'Alguien', cuando: c.creado_en, lineas: [] }
        grupos.push(g)
      }
      if (texto) g.lineas.push(texto)
    }
    return grupos.filter(g => g.lineas.length > 0)
    // lineaCambio depende de proveedores, que no cambia mientras el form está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cambios])

  // ---- Render -------------------------------------------------------------

  const archivado = item?.estado === 'archivado'
  const bloqueado = isPending

  return (
    <Modal
      open
      onClose={() => { if (!isPending) onClose() }}
      title={item ? `Editar — ${item.nombre}` : 'Nuevo insumo'}
      size="xl"
      pantallaCompletaMobile
    >
      <div className="space-y-5">
        {archivado && (
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-4 py-2.5 text-sm text-text">
            <Archive size={16} className="shrink-0 text-muted" />
            Archivado: no se ofrece en pedidos, remitos, facturas ni conteos nuevos.
          </p>
        )}

        <div>
          <label htmlFor="insumo-nombre" className={labelClass}>Nombre *</label>
          <input id="insumo-nombre" className={controlClass} maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>

        <section className="space-y-2" aria-labelledby="insumo-proveedores">
          <p id="insumo-proveedores" className={labelClass}>
            Proveedores *
            <HelpTooltip text="Un insumo puede cotizarse con varios proveedores. Marcá el principal con la estrella: es el que se usa por default al armar pedidos y plantillas. Si quitás uno que ya tuvo pedidos o facturas, pasa a «Proveedores anteriores» con su precio." />
          </p>
          <div className="space-y-3 sm:space-y-2">
            {activas.map(l => (
              <div key={l.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_7rem_8rem_auto]">
                <button
                  type="button"
                  onClick={() => marcarPrincipal(l.key)}
                  aria-pressed={l.esPrincipal}
                  aria-label={l.esPrincipal ? 'Proveedor principal' : 'Marcar como principal'}
                  title={l.esPrincipal ? 'Proveedor principal' : 'Marcar como principal'}
                  className={`order-1 flex h-11 w-11 items-center justify-center rounded-lg transition-colors sm:h-9 sm:w-9 ${l.esPrincipal ? 'text-accent' : 'text-faint hover:text-muted'}`}
                >
                  <Star size={18} fill={l.esPrincipal ? 'currentColor' : 'none'} />
                </button>
                <div className="order-2 min-w-0">
                  {l.existente ? (
                    <p className="truncate px-1 text-sm text-text" title={nombreProveedor(l.proveedorId)}>
                      {nombreProveedor(l.proveedorId)}
                      {!proveedorActivo(l.proveedorId) && <span className="text-muted"> (archivado)</span>}
                    </p>
                  ) : (
                    <SelectBuscador
                      value={l.proveedorId}
                      onChange={v => actualizar(l.key, { proveedorId: v })}
                      opciones={opcionesPara(l)}
                      placeholderVacio="Seleccionar proveedor..."
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => quitar(l.key)}
                  aria-label={`Quitar ${l.proveedorId ? nombreProveedor(l.proveedorId) : 'esta línea'}`}
                  title={l.existente ? 'Quitar. Si tiene pedidos o facturas con este proveedor, se desactiva y queda en «Proveedores anteriores».' : 'Quitar esta línea'}
                  className="order-3 flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-brand-red sm:order-6 sm:h-9 sm:w-9"
                >
                  <Trash2 size={16} />
                </button>
                <div className="order-4 col-span-3 grid grid-cols-2 gap-2 pl-[52px] sm:contents">
                  <input
                    className={`${controlClass} sm:order-4`}
                    placeholder="Código"
                    aria-label="Código del proveedor"
                    maxLength={60}
                    value={l.codigo}
                    onChange={e => actualizar(l.key, { codigo: e.target.value })}
                  />
                  <InputNumero
                    className={`${controlClass} tabular-nums sm:order-5`}
                    placeholder="Precio ref."
                    ariaLabel="Precio de referencia"
                    min={0}
                    value={l.precioRef}
                    onChange={v => actualizar(l.key, { precioRef: v })}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={agregar}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-text sm:min-h-9"
          >
            <Plus size={14} /> Agregar proveedor
          </button>

          {anteriores.length > 0 && (
            <details className="rounded-xl border border-border bg-surface2 px-3 py-2">
              <summary className="cursor-pointer select-none py-1 text-sm font-medium text-muted">
                Proveedores anteriores ({anteriores.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {anteriores.map(l => (
                  <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                    <span className="min-w-0 text-text">
                      {nombreProveedor(l.proveedorId)}
                      {!proveedorActivo(l.proveedorId) && <span className="text-muted"> (archivado)</span>}
                      <span className="ml-2 text-xs tabular-nums text-muted">{l.precioRef != null ? formatearMoneda(l.precioRef) : 'sin precio'}</span>
                    </span>
                    {proveedorActivo(l.proveedorId) && (
                      <button
                        type="button"
                        onClick={() => volverAUsar(l.key)}
                        className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:opacity-80 sm:min-h-8"
                      >
                        <RotateCcw size={13} /> Volver a usar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="insumo-categoria" className={labelClass}>Categoría</label>
            <select id="insumo-categoria" className={controlClass} value={categoriaId ?? ''} onChange={e => setCategoriaId(e.target.value || null)}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="insumo-unidad" className={labelClass}>Unidad de compra *</label>
            <input id="insumo-unidad" className={controlClass} maxLength={40} placeholder="Ej: kg, Bolsa, Caja, Cajón" value={unidad} onChange={e => setUnidad(e.target.value)} />
          </div>
          <div>
            <p className={labelClass}>
              Cantidad por unidad
              <HelpTooltip text="Cuánto trae cada unidad de compra. Por ejemplo, una bolsa de fécula trae 25kg, o un cajón de huevos trae 360 unidades." />
            </p>
            <InputNumero ariaLabel="Cantidad por unidad" placeholder="1" className={`${controlClass} tabular-nums`} value={cantidadPorUnidad} onChange={setCantidadPorUnidad} />
          </div>
          <div>
            <p className={labelClass}>
              Cantidad por masa
              <HelpTooltip text="Cuánto de este insumo entra en una masa (un batch de producción) — la receta. La necesidad sugerida = cantidad por masa × masas proyectadas. Dejalo en 0 si no entra en ninguna receta." />
            </p>
            <InputNumero ariaLabel="Cantidad por masa" placeholder="0" className={`${controlClass} tabular-nums`} value={cantidadPorMasa || null} onChange={v => setCantidadPorMasa(v ?? 0)} />
          </div>
          <div>
            <p className={labelClass}>
              Stock mínimo
              <HelpTooltip text="Piso general de este insumo, sin relación con ningún conteo — lo usan la sugerencia de /admin/compras/pedidos y el indicador de bajo stock de /admin/compras/stock. Si el insumo participa de un conteo, ese conteo tiene su propia meta independiente de esta." />
            </p>
            <InputNumero ariaLabel="Stock mínimo" placeholder="0" className={`${controlClass} tabular-nums`} value={stockMinimo || null} onChange={v => setStockMinimo(v ?? 0)} />
          </div>
          <div>
            <label htmlFor="insumo-iva" className={labelClass}>
              IVA
              <HelpTooltip text="Con qué alícuota suele venir este insumo en la factura del proveedor. Se copia a la línea de la factura cuando la cargás, y ahí se puede cambiar si esa factura vino distinta." />
            </label>
            <select id="insumo-iva" className={controlClass} value={String(alicuotaIva)} onChange={e => setAlicuotaIva(Number(e.target.value))}>
              {ALICUOTAS.map(a => <option key={a} value={a}>{etiquetaAlicuota(a)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="insumo-redondeo" className={labelClass}>
              Redondeo
              <HelpTooltip text="Cómo redondear cuántas unidades pedir al cerrar el conteo. Estándar: si falta menos de media unidad no se pide, si falta media o más se pide una entera. Siempre hacia arriba: cualquier faltante pide una unidad completa. Siempre hacia abajo: un faltante menor a una unidad no pide nada. Sin cálculo: no participa del pedido complementario — se repone solo vía el Pedido base semanal. No cambia el aviso de sobrestock: eso lo decide «Se pide a demanda»." />
            </label>
            <select id="insumo-redondeo" className={controlClass} value={redondeo} onChange={e => setRedondeo(e.target.value as Redondeo)}>
              {Object.entries(REDONDEO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-surface2 p-3 sm:col-span-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={aDemanda}
                onChange={e => setADemanda(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-accent"
              />
              <span className="text-sm">
                <span className="font-semibold text-text">Se pide a demanda</span>
                <span className="block text-muted">Se pide según se necesite, no por proyección de masas. No avisa sobrestock en el conteo, salvo que le pongas un stock máximo.</span>
              </span>
            </label>
            {aDemanda && (
              <div className="pl-8">
                <p className={labelClass}>
                  Stock máximo (opcional)
                  <HelpTooltip text="Si el conteo supera este número, se avisa sobrestock y se sugiere pedir menos en el Pedido base. Vacío: nunca avisa." />
                </p>
                <div className="flex items-center gap-2">
                  <InputNumero
                    ariaLabel="Stock máximo"
                    placeholder="Sin tope"
                    className={`${controlClass} max-w-40 tabular-nums`}
                    value={stockMaximo}
                    onChange={v => setStockMaximo(v != null && v > 0 ? v : null)}
                  />
                  <span className="text-sm text-muted">{unidad.trim() || 'unidades de compra'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {item && (
          <details className="rounded-xl border border-border px-3 py-2">
            <summary className="flex cursor-pointer select-none items-center gap-2 py-1 text-sm font-medium text-muted">
              <History size={15} /> Cambios{cambios ? ` (${lotes.length})` : ''}
              {cambios === null && <Loader2 size={13} className="animate-spin" />}
            </summary>
            {cambios !== null && (
              lotes.length === 0 ? (
                <p className="py-2 text-sm text-muted">Sin cambios registrados todavía (el historial empieza el 05/10).</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {lotes.map(g => (
                    <li key={g.lote} className="text-sm">
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <User size={12} /> {g.quien} · {fechaHoraCorta(g.cuando)}
                      </p>
                      <ul className="mt-0.5 space-y-0.5 pl-4 text-text">
                        {g.lineas.map((t, i) => <li key={i} className="tabular-nums">{t}</li>)}
                      </ul>
                    </li>
                  ))}
                </ol>
              )
            )}
          </details>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {item && (archivado ? (
              <button
                type="button"
                onClick={() => cambiarEstado(false)}
                disabled={bloqueado}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent disabled:opacity-50 sm:min-h-9"
              >
                {accion === 'archivar' ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />} Reactivar
              </button>
            ) : (
              <button
                type="button"
                onClick={pedirArchivar}
                disabled={bloqueado}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50 sm:min-h-9"
              >
                {accion === 'archivar' ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />} Archivar
              </button>
            ))}
            {item && resumen.puedeEliminar && (
              <button
                type="button"
                onClick={pedirEliminar}
                disabled={bloqueado}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-brand-red transition-colors hover:bg-danger-bg disabled:opacity-50 sm:min-h-9"
              >
                {accion === 'eliminar' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={bloqueado}
              className="min-h-11 flex-1 rounded-xl border border-border px-5 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50 sm:min-h-9 sm:flex-none"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={bloqueado}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-9 sm:flex-none"
            >
              {accion === 'guardar' && <Loader2 size={15} className="animate-spin" />}
              {accion === 'guardar' ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
