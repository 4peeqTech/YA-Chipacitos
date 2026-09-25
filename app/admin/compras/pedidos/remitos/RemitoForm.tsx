'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCheck, Loader2, PackagePlus, Trash2, X } from 'lucide-react'
import SelectBuscador, { type OpcionSelect } from '@/components/ui/SelectBuscador'
import InputNumero from '@/components/ui/InputNumero'
import { Field, controlClass } from '@/components/ui/Field'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearFecha } from '@/lib/formato'
import { codigoPedido, codigoRemito } from '@/lib/compras/codigos'
import { conUnidad } from '../modelo'
import { eliminarRemito, guardarRemito } from './acciones'
import {
  armarEnvio, calcularImpacto, cargadoPorLinea, conDescripcion, estadoInicial, impactoEliminar,
  libreVacia, lineasSinStock, validar,
  type EstadoRemito, type ImpactoItem, type LineaLibre,
} from './modelo'
import type { InsumoRemito, LineaPedido, PedidoRemito, RemitoFila } from './datos'

const botonPrimario = 'presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50'
const botonSecundario = 'presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50'

export interface NombresInsumo {
  nombre: string
  unidad: string | null
}

/** "Suma 3 Bolsa de Fécula (queda en 73)" por insumo; en ámbar si el stock queda negativo. */
export function ResumenImpacto({ impacto, nombres, sinStock = 0 }: {
  impacto: ImpactoItem[]
  nombres: Record<string, NombresInsumo>
  sinStock?: number
}) {
  return (
    <span className="block space-y-1.5 text-left">
      {impacto.map(i => {
        const n = nombres[i.itemId]
        const negativo = i.despues < 0
        return (
          <span key={i.itemId} className={`block ${negativo ? 'text-warning' : 'text-text'}`}>
            {i.delta > 0 ? 'Suma' : 'Resta'} <strong className="tabular-nums">{conUnidad(Math.abs(i.delta), n?.unidad ?? null)}</strong> de {n?.nombre ?? 'un insumo'}{' '}
            <span className={negativo ? '' : 'text-muted'}>(queda en <span className="tabular-nums">{conUnidad(i.despues, n?.unidad ?? null)}</span>)</span>
            {negativo && <span className="block text-xs">El stock queda negativo: revisá la cantidad o ajustá el stock después.</span>}
          </span>
        )
      })}
      {sinStock > 0 && (
        <span className="block text-muted">
          {sinStock === 1 ? '1 línea no mueve stock' : `${sinStock} líneas no mueven stock`} (no tiene insumo).
        </span>
      )}
    </span>
  )
}

export default function RemitoForm({
  remito,
  pedidos,
  pedidoIdInicial,
  lineas,
  remitos,
  stockPorItem,
  insumos,
  onCambios,
  onListo,
  onCancelar,
}: {
  remito: RemitoFila | null
  pedidos: PedidoRemito[]
  pedidoIdInicial: string | null
  lineas: LineaPedido[]
  remitos: RemitoFila[]
  stockPorItem: Record<string, number>
  insumos: InsumoRemito[]
  onCambios: () => void
  onListo: () => void
  onCancelar: () => void
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [pedidoId, setPedidoId] = useState(remito?.pedido_id ?? pedidoIdInicial ?? '')
  const lineasDelPedido = useMemo(() => lineas.filter(l => l.pedido_id === pedidoId), [lineas, pedidoId])
  const [estado, setEstado] = useState<EstadoRemito>(() => estadoInicial(remito, lineasDelPedido))
  const [intentoGuardar, setIntentoGuardar] = useState(false)

  const pedido = pedidos.find(p => p.id === pedidoId) ?? null
  const cargadoAntes = useMemo(() => cargadoPorLinea(remito), [remito])

  const nombres = useMemo(() => {
    const res: Record<string, NombresInsumo> = {}
    for (const i of insumos) res[i.id] = { nombre: i.nombre, unidad: i.unidad }
    for (const l of lineasDelPedido) {
      if (l.item_id && !res[l.item_id]) res[l.item_id] = { nombre: l.descripcion ?? 'Insumo', unidad: l.unidad }
    }
    return res
  }, [insumos, lineasDelPedido])

  const codigo = useMemo(() => {
    if (!pedido) return null
    if (remito) return codigoRemito(pedido.numero, remito.secuencia)
    // Igual que la RPC: los códigos de remitos borrados no se reusan.
    const siguiente = Math.max(pedido.ultima_secuencia_remito, ...remitos.filter(r => r.pedido_id === pedido.id).map(r => r.secuencia)) + 1
    return codigoRemito(pedido.numero, siguiente)
  }, [pedido, remito, remitos])

  const envio = useMemo(() => armarEnvio(estado, lineasDelPedido), [estado, lineasDelPedido])
  const impacto = useMemo(
    () => calcularImpacto(envio, remito, lineasDelPedido, stockPorItem),
    [envio, remito, lineasDelPedido, stockPorItem],
  )
  const sinStock = lineasSinStock(envio)
  const problema = validar(estado)

  // Lo que ya llegó en otros remitos y lo que suma este, por línea del pedido.
  const recepcion = useMemo(() => {
    const res: Record<string, { yaLlego: number; este: number }> = {}
    for (const l of lineasDelPedido) {
      const id = l.pedido_item_id ?? ''
      const libres = estado.libres
        .filter(x => x.corresponde === id)
        .reduce((t, x) => t + (x.cantidad ?? 0), 0)
      res[id] = {
        yaLlego: (l.recibido ?? 0) - (cargadoAntes[id] ?? 0),
        este: (estado.porLinea[id]?.cantidad ?? 0) + libres,
      }
    }
    return res
  }, [lineasDelPedido, estado, cargadoAntes])

  const faltantes = lineasDelPedido.filter(l => {
    const r = recepcion[l.pedido_item_id ?? '']
    return r && (l.cantidad ?? 0) - r.yaLlego - r.este > 0 && estado.porLinea[l.pedido_item_id ?? '']?.cantidad == null
  })

  function cambiar(fn: (e: EstadoRemito) => EstadoRemito) {
    setEstado(fn)
    onCambios()
  }

  function elegirPedido(id: string) {
    setPedidoId(id)
    setEstado(estadoInicial(null, lineas.filter(l => l.pedido_id === id)))
    setIntentoGuardar(false)
    onCambios()
  }

  function completarFaltantes() {
    cambiar(e => {
      const porLinea = { ...e.porLinea }
      for (const l of faltantes) {
        const id = l.pedido_item_id ?? ''
        const r = recepcion[id]
        porLinea[id] = { ...porLinea[id], cantidad: Math.max((l.cantidad ?? 0) - r.yaLlego - r.este, 0) }
      }
      return { ...e, porLinea }
    })
  }

  function actualizarLibre(clave: string, fn: (l: LineaLibre) => LineaLibre) {
    cambiar(e => ({ ...e, libres: e.libres.map(l => (l.clave === clave ? fn(l) : l)) }))
  }

  function mensajeProblema(): string {
    switch (problema?.tipo) {
      case 'sin_fecha': return 'Elegí la fecha en que llegó la mercadería.'
      case 'libre_incompleta': return 'Hay una línea agregada sin descripción o sin cantidad.'
      case 'libre_sin_destino': return 'Hay una línea agregada sin elegir a qué corresponde.'
      case 'sin_lineas': return remito
        ? 'El remito quedó sin cantidades. Si no llegó nada, eliminá el remito.'
        : 'Cargá la cantidad que llegó en al menos una línea.'
      default: return ''
    }
  }

  function guardar() {
    if (!pedido) { toast.error('Elegí el pedido al que corresponde el remito.'); return }
    if (problema) { setIntentoGuardar(true); toast.error(mensajeProblema()); return }

    const ejecutar = () => startTransition(async () => {
      const r = await guardarRemito({ remitoId: remito?.id ?? null, pedidoId: pedido.id, fecha: estado.fecha, lineas: envio })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(remito ? `Remito ${r.data.codigo} actualizado` : `Remito ${r.data.codigo} guardado`)
      onListo()
    })

    if (impacto.length === 0) { ejecutar(); return }
    confirmar({
      // El código va en el mensaje (mono): la Syne del título dibuja los ceros como "o".
      titulo: remito ? 'Guardar cambios del remito' : 'Guardar remito',
      mensaje: (
        <span className="block space-y-2">
          <span className="block font-mono tabular-nums text-text">{codigo}</span>
          <ResumenImpacto impacto={impacto} nombres={nombres} sinStock={sinStock} />
        </span>
      ),
      textoConfirmar: 'Guardar',
      onConfirmar: ejecutar,
    })
  }

  function eliminar() {
    if (!remito) return
    const imp = impactoEliminar(remito, stockPorItem)
    confirmar({
      titulo: 'Eliminar remito',
      mensaje: (
        <span className="block space-y-2">
          <span className="block font-mono tabular-nums text-text">{codigo}</span>
          {imp.length
            ? <><span className="block">Se resta del stock lo que sumó:</span><ResumenImpacto impacto={imp} nombres={nombres} /></>
            : <span className="block">Este remito no había sumado stock. El pedido vuelve a mostrar esas líneas como pendientes.</span>}
        </span>
      ),
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: () => startTransition(async () => {
        const r = await eliminarRemito(remito.id)
        if (!r.ok) { toast.error(r.error); return }
        toast.success(`Remito ${r.data.codigo} eliminado`)
        onListo()
      }),
    })
  }

  const opcionesPedido: OpcionSelect[] = pedidos.map(p => ({
    value: p.id,
    label: `${codigoPedido(p.numero)} · ${p.proveedores?.nombre ?? '—'}${p.enviado_en ? ` — enviado ${formatearFecha(p.enviado_en.slice(0, 10))}` : ''}`,
    grupo: p.estado_recepcion === 'enviado' || p.estado_recepcion === 'parcial' ? 'Esperando mercadería' : 'Recibidos o cerrados',
  }))

  const opcionesInsumo: OpcionSelect[] = insumos.map(i => ({ value: i.id, label: i.unidad ? `${i.nombre} (${i.unidad})` : i.nombre }))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field label="Pedido" obligatorio>
          {remito ? (
            <p className="flex min-h-11 items-center text-sm text-text">
              <span className="font-mono tabular-nums">{pedido ? codigoPedido(pedido.numero) : '—'}</span>
              <span className="text-muted">&nbsp;·&nbsp;{pedido?.proveedores?.nombre ?? '—'}</span>
            </p>
          ) : (
            <SelectBuscador value={pedidoId} onChange={elegirPedido} opciones={opcionesPedido} placeholderVacio="Elegí un pedido…" />
          )}
        </Field>
        <Field label="Llegó el" obligatorio>
          <input
            type="date"
            aria-label="Fecha en que llegó la mercadería"
            className={`${controlClass} min-h-11 ${intentoGuardar && problema?.tipo === 'sin_fecha' ? 'border-brand-red' : ''}`}
            value={estado.fecha}
            onChange={e => { const fecha = e.target.value; cambiar(s => ({ ...s, fecha })) }}
          />
        </Field>
      </div>

      {!pedido ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          Elegí el pedido para ver qué había que recibir.
        </p>
      ) : (
        <>
          {!remito && codigo && (
            <p className="-mt-2 text-xs text-muted">
              Se guarda como <span className="font-mono tabular-nums text-text">{codigo}</span>. No hace falta copiar el número impreso del proveedor.
            </p>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-text">Qué llegó</h4>
              {faltantes.length > 0 && (
                <button type="button" onClick={completarFaltantes} className={botonSecundario}>
                  <CheckCheck size={15} /> Completar con lo que falta
                </button>
              )}
            </div>
            {lineasDelPedido.length === 0 ? (
              <p className="text-sm text-muted">Este pedido no tiene líneas. Cargá lo que llegó con “Algo que no estaba en el pedido”.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {lineasDelPedido.map(l => {
                  const id = l.pedido_item_id ?? ''
                  const r = recepcion[id] ?? { yaLlego: 0, este: 0 }
                  const pedidoCant = l.cantidad ?? 0
                  const falta = Math.max(pedidoCant - r.yaLlego - r.este, 0)
                  const deMas = Math.max(r.yaLlego + r.este - pedidoCant, 0)
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                      <div className="min-w-0 flex-1 basis-52">
                        <p className="text-sm font-medium text-text">{l.descripcion}</p>
                        <p className="text-xs text-muted tabular-nums">
                          Pedido {conUnidad(pedidoCant, l.unidad)}
                          {r.yaLlego > 0 && <> · antes llegó {conUnidad(r.yaLlego, l.unidad)}</>}
                          {' · '}
                          {deMas > 0
                            ? <span className="font-semibold text-warning">+{conUnidad(deMas, l.unidad)} de más</span>
                            : falta > 0
                              ? <>falta {conUnidad(falta, l.unidad)}</>
                              : <span className="text-success">completo</span>}
                          {!l.item_id && <> · <span className="text-warning">sin insumo: no mueve stock</span></>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="w-28">
                          <InputNumero
                            value={estado.porLinea[id]?.cantidad ?? null}
                            onChange={v => cambiar(e => ({ ...e, porLinea: { ...e.porLinea, [id]: { ...e.porLinea[id], cantidad: v } } }))}
                            placeholder="0"
                            min={0}
                            className={`${controlClass} min-h-11 text-right tabular-nums`}
                            ariaLabel={`Cantidad que llegó de ${l.descripcion ?? 'la línea'}`}
                          />
                        </div>
                        <span className="w-16 truncate text-xs text-muted">{l.unidad ?? ''}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            {estado.libres.length > 0 && <h4 className="text-sm font-bold text-text">No estaba en el pedido o vino con otro nombre</h4>}
            {estado.libres.map(l => {
              const incompleta = intentoGuardar && problema?.tipo === 'libre_incompleta' && problema.clave === l.clave
              const sinDestino = l.corresponde === '' && (l.descripcion.trim() !== '' || l.cantidad != null)
              return (
                <div key={l.clave} className={`space-y-2 rounded-xl border p-3 ${sinDestino ? 'border-warning bg-warning-bg' : 'border-border'}`}>
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      aria-label="Descripción, como figura en el remito"
                      placeholder="Descripción, como figura en el remito"
                      className={`${controlClass} min-h-11 flex-1 ${incompleta && !l.descripcion.trim() ? 'border-brand-red' : ''}`}
                      value={l.descripcion}
                      onChange={e => { const d = e.target.value; actualizarLibre(l.clave, x => conDescripcion(x, d, lineasDelPedido)) }}
                    />
                    <div className="w-24 shrink-0">
                      <InputNumero
                        value={l.cantidad}
                        onChange={v => actualizarLibre(l.clave, x => ({ ...x, cantidad: v }))}
                        placeholder="Cant."
                        min={0}
                        className={`${controlClass} min-h-11 text-right tabular-nums ${incompleta && !(l.cantidad && l.cantidad > 0) ? 'border-brand-red' : ''}`}
                        ariaLabel="Cantidad"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => cambiar(e => ({ ...e, libres: e.libres.filter(x => x.clave !== l.clave) }))}
                      aria-label="Quitar esta línea"
                      title="Quitar esta línea"
                      className="presionable flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-brand-red"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label="A qué corresponde"
                      className={`${controlClass} min-h-11 ${sinDestino ? 'border-warning' : ''}`}
                      value={l.corresponde}
                      onChange={e => { const c = e.target.value; actualizarLibre(l.clave, x => ({ ...x, corresponde: c, manual: true, itemId: c === 'nada' ? x.itemId : null })) }}
                    >
                      <option value="">Elegí a qué corresponde…</option>
                      {lineasDelPedido.map(p => (
                        <option key={p.pedido_item_id} value={p.pedido_item_id ?? ''}>Es “{p.descripcion}” del pedido</option>
                      ))}
                      {l.corresponde !== '' && l.corresponde !== 'nada' && !lineasDelPedido.some(p => p.pedido_item_id === l.corresponde) && (
                        <option value={l.corresponde}>Una línea del pedido</option>
                      )}
                      <option value="nada">No está en el pedido</option>
                    </select>
                    {l.corresponde === 'nada' && (
                      <SelectBuscador
                        value={l.itemId ?? ''}
                        onChange={v => actualizarLibre(l.clave, x => ({ ...x, itemId: v || null }))}
                        opciones={opcionesInsumo}
                        placeholderVacio="Insumo (opcional)…"
                      />
                    )}
                  </div>
                  {sinDestino && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                      <AlertTriangle size={13} /> Elegí a qué corresponde: si es algo del pedido, suma a esa línea.
                    </p>
                  )}
                  {l.corresponde === 'nada' && !l.itemId && (
                    <p className="text-xs text-muted">Sin insumo, esta línea queda registrada pero no mueve stock.</p>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => cambiar(e => ({ ...e, libres: [...e.libres, libreVacia()] }))}
              className={botonSecundario}
            >
              <PackagePlus size={15} /> Algo que no estaba en el pedido
            </button>
          </section>

          <section className="space-y-2 rounded-xl bg-surface2 px-4 py-3" aria-live="polite">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Cómo queda el stock</h4>
            {impacto.length === 0 ? (
              <p className="text-sm text-muted">
                {envio.length === 0 ? 'Cargá cantidades para ver cuánto suma al stock.' : 'Con estos cambios el stock no se mueve.'}
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {impacto.map(i => {
                  const n = nombres[i.itemId]
                  return (
                    <li key={i.itemId} className={`flex flex-wrap justify-between gap-x-3 ${i.despues < 0 ? 'text-warning' : 'text-text'}`}>
                      <span className="min-w-0">{n?.nombre ?? 'Insumo'}</span>
                      <span className="tabular-nums">
                        <span className="text-muted">{conUnidad(i.antes, null)} → </span>
                        <strong>{conUnidad(i.despues, n?.unidad ?? null)}</strong>
                        <span className={i.delta > 0 ? 'text-success' : 'text-warning'}> ({i.delta > 0 ? '+' : '−'}{conUnidad(Math.abs(i.delta), null)})</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        {remito && (
          <button
            type="button"
            onClick={eliminar}
            disabled={isPending}
            className="presionable min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-text hover:bg-danger-bg disabled:opacity-50 sm:mr-auto"
          >
            <Trash2 size={15} className="text-brand-red" /> Eliminar remito
          </button>
        )}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          <button type="button" onClick={onCancelar} disabled={isPending} className={botonSecundario}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={isPending || !pedido} className={botonPrimario}>
            {isPending && <Loader2 size={16} className="animate-spin" />}
            {remito ? 'Guardar cambios' : 'Guardar remito'}
          </button>
        </div>
      </div>
    </div>
  )
}
