'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, Printer } from 'lucide-react'
import type { Pedido, Producto } from '@/lib/types'
import EmptyState from '@/components/ui/EmptyState'
import { etiquetaEstado, formatoCantidad } from '@/lib/pedidos/estados'
import { cantidadAEnviar, sumar } from './utiles'

// Hoja de preparación: total por producto de los pedidos nuevos y en
// preparación (lo que se va a mandar, con decimales) y, abajo, el detalle por
// sucursal. Al imprimir se usa una copia en blanco y negro pensada para A4
// que se monta directo en <body>; el resto de la página se oculta.

interface Linea { producto_id: string; nombre: string; unidad: string; cantidad: number }
interface Sucursal { nombre: string; pedidos: Pedido[]; lineas: Linea[] }

interface Props {
  pedidos: Pedido[]
  productos: Producto[]
  sucursal: string
}

function agrupar(pedidos: Pedido[], unidades: Map<string, string>): Linea[] {
  const porProducto = new Map<string, Linea>()
  for (const p of pedidos) {
    for (const i of p.pedido_items ?? []) {
      const cant = cantidadAEnviar(i)
      if (cant <= 0) continue
      const prev = porProducto.get(i.producto_id)
      if (prev) prev.cantidad = sumar(prev.cantidad, cant)
      else porProducto.set(i.producto_id, { producto_id: i.producto_id, nombre: i.producto_nombre, unidad: unidades.get(i.producto_id) ?? '', cantidad: cant })
    }
  }
  return [...porProducto.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

function fechaHoy() {
  return new Date().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

const CSS_IMPRESION = `
#hoja-preparacion-impresion { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; }
  body > *:not(#hoja-preparacion-impresion) { display: none !important; }
  #hoja-preparacion-impresion { display: block !important; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; }
  #hoja-preparacion-impresion h1 { font-size: 16pt; margin: 0 0 2mm; }
  #hoja-preparacion-impresion h2 { font-size: 12.5pt; margin: 6mm 0 2mm; }
  #hoja-preparacion-impresion table { width: 100%; border-collapse: collapse; }
  #hoja-preparacion-impresion th, #hoja-preparacion-impresion td { border-bottom: 0.3mm solid #999; padding: 1.6mm 2mm; text-align: left; }
  #hoja-preparacion-impresion th { font-size: 9pt; text-transform: uppercase; border-bottom: 0.5mm solid #000; }
  #hoja-preparacion-impresion .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  #hoja-preparacion-impresion .check { width: 9mm; }
  #hoja-preparacion-impresion .caja { display: inline-block; width: 4mm; height: 4mm; border: 0.3mm solid #000; }
  #hoja-preparacion-impresion .sucursal { break-inside: avoid; page-break-inside: avoid; }
  #hoja-preparacion-impresion .meta { font-size: 9.5pt; color: #333; margin: 0 0 3mm; }
}
`

function TablaImpresion({ lineas }: { lineas: Linea[] }) {
  return (
    <table>
      <thead><tr><th className="check" /><th>Producto</th><th className="num">Cantidad</th></tr></thead>
      <tbody>
        {lineas.map(l => (
          <tr key={l.producto_id}>
            <td className="check"><span className="caja" /></td>
            <td>{l.nombre}</td>
            <td className="num"><strong>{formatoCantidad(l.cantidad)}</strong>{l.unidad ? ` ${l.unidad}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function HojaPreparacion({ pedidos, productos, sucursal }: Props) {
  const [montado, setMontado] = useState(false)
  // El portal de impresión necesita document: solo después de montar.
  useEffect(() => { setMontado(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect

  // "Unidad" es el valor por defecto y no dice nada: el nombre ya trae el envase (Kg., x 4 L.).
  const unidades = useMemo(
    () => new Map(productos.map(p => [p.id, p.unidad && p.unidad.toLowerCase() !== 'unidad' ? p.unidad : ''])),
    [productos],
  )
  const aPreparar = useMemo(
    () => pedidos.filter(p => (p.estado === 'pendiente' || p.estado === 'preparando') && (sucursal === 'todas' || p.local_nombre === sucursal)),
    [pedidos, sucursal],
  )
  const totales = useMemo(() => agrupar(aPreparar, unidades), [aPreparar, unidades])
  const sucursales: Sucursal[] = useMemo(() => {
    const porLocal = new Map<string, Pedido[]>()
    for (const p of aPreparar) porLocal.set(p.local_nombre, [...(porLocal.get(p.local_nombre) ?? []), p])
    return [...porLocal.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([nombre, ps]) => ({ nombre, pedidos: ps, lineas: agrupar(ps, unidades) }))
  }, [aPreparar, unidades])

  if (aPreparar.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface">
        <EmptyState icono={ClipboardList} titulo="No hay nada para preparar"
          descripcion={sucursal === 'todas' ? 'Cuando entren pedidos nuevos, acá vas a ver el total por producto.' : 'Esta sucursal no tiene pedidos nuevos ni en preparación.'} />
      </div>
    )
  }

  const titulo = `Hoja de preparación${sucursal === 'todas' ? '' : ` · ${sucursal}`}`
  const resumen = `${aPreparar.length} pedido${aPreparar.length === 1 ? '' : 's'} · ${sucursales.length} sucursal${sucursales.length === 1 ? '' : 'es'}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-['Syne'] text-lg font-bold text-text">{titulo}</h2>
          <p className="text-xs text-muted">{resumen} · nuevos y en preparación · cantidades a mandar</p>
        </div>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90">
          <Printer size={16} /> Imprimir
        </button>
      </div>

      <section className="rounded-card border border-border bg-surface p-4">
        <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-faint">Total por producto</h3>
        <table className="w-full text-sm">
          <tbody>
            {totales.map(l => (
              <tr key={l.producto_id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3 text-text">{l.nombre}</td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">
                  <span className="text-base font-bold text-accent">{formatoCantidad(l.cantidad)}</span>
                  {l.unidad && <span className="ml-1 text-xs text-muted">{l.unidad}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h3 className="text-2xs font-semibold uppercase tracking-wider text-faint">Por sucursal</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sucursales.map(s => (
            <div key={s.nombre} className="rounded-card border border-border bg-surface p-4">
              <p className="font-['Syne'] font-bold text-text">{s.nombre}</p>
              <p className="mb-2 text-xs text-muted">
                {s.pedidos.map(p => `#${p.numero} (${etiquetaEstado(p.estado).toLowerCase()})`).join(' · ')}
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {s.lineas.map(l => (
                    <tr key={l.producto_id} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-3 text-text">{l.nombre}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-text whitespace-nowrap">
                        {formatoCantidad(l.cantidad)}{l.unidad && <span className="ml-1 text-xs font-normal text-muted">{l.unidad}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.pedidos.some(p => p.notas) && (
                <ul className="mt-2 space-y-1 border-t border-border pt-2">
                  {s.pedidos.filter(p => p.notas).map(p => (
                    <li key={p.id} className="text-xs text-muted"><span className="font-semibold">#{p.numero}:</span> {p.notas}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {montado && createPortal(
        <div id="hoja-preparacion-impresion">
          <style>{CSS_IMPRESION}</style>
          <h1>{titulo}</h1>
          <p className="meta">{fechaHoy()} · {resumen}</p>
          <h2>Total por producto</h2>
          <TablaImpresion lineas={totales} />
          {sucursales.map(s => (
            <div key={s.nombre} className="sucursal">
              <h2>{s.nombre}</h2>
              <p className="meta">Pedidos {s.pedidos.map(p => `#${p.numero}`).join(', ')}</p>
              <TablaImpresion lineas={s.lineas} />
              {s.pedidos.filter(p => p.notas).map(p => (
                <p key={p.id} className="meta">Obs. #{p.numero}: {p.notas}</p>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
