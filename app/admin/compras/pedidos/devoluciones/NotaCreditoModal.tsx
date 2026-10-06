'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Loader2, ReceiptText, XCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useConfirmar, useToast } from '@/components/ui/ProveedorUI'
import { formatearMonedaExacta } from '@/lib/formato'
import { hoyISO } from '@/lib/fechas'
import {
  armarNotaCredito, efectoDeMotivo, impactoGasto, textoToastGasto, topeNotaCredito,
} from '@/lib/compras/devoluciones'
import { cortoBase, esUnidadBase } from '@/lib/compras/unidades'
import { cargarNotaCredito } from './acciones'
import { BloqueNc } from './DevolucionModal'
import { useContextoDevolucion, type ContextoDevolucion } from './useContextoDevolucion'
import type { DevolucionVista } from './datos'

/** Cargar la NC de una devolución que la esperaba (D3). Solo admin. */
export default function NotaCreditoModal({
  pedidoId,
  devolucionId,
  abierto,
  onCerrar,
}: {
  pedidoId: string
  devolucionId: string | null
  abierto: boolean
  onCerrar: () => void
}) {
  const [conCambios, setConCambios] = useState(false)
  const [pendiente, setPendiente] = useState(false)
  const confirmar = useConfirmar()

  function cerrar() {
    if (pendiente) return
    if (!conCambios) { onCerrar(); return }
    confirmar({
      titulo: 'Descartar la nota de crédito',
      mensaje: 'Cargaste datos de la nota de crédito que todavía no se guardaron. ¿Descartarlos?',
      textoConfirmar: 'Descartar',
      textoCancelar: 'Seguir cargando',
      peligroso: true,
      onConfirmar: onCerrar,
    })
  }

  return (
    <Modal open={abierto} onClose={cerrar} title="Cargar nota de crédito" size="xl" pantallaCompletaMobile>
      {abierto && devolucionId && (
        <Contenido pedidoId={pedidoId} devolucionId={devolucionId} onCambios={setConCambios} onPendiente={setPendiente} onListo={onCerrar} onCancelar={cerrar} />
      )}
    </Modal>
  )
}

function Contenido(props: { pedidoId: string; devolucionId: string; onCambios: (b: boolean) => void; onPendiente: (b: boolean) => void; onListo: () => void; onCancelar: () => void }) {
  const { ctx, error, cargando } = useContextoDevolucion(props.pedidoId, true)
  if (cargando) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-24 w-full" /></div>
  const dev = ctx?.devoluciones.find(d => d.id === props.devolucionId) ?? null
  if (error || !ctx || !dev) return <EmptyState icono={XCircle} titulo="No se pudo abrir la nota de crédito" descripcion={error ?? 'No encontramos la devolución. Recargá la página.'} />
  if (!ctx.factura) return <EmptyState icono={ReceiptText} titulo="El pedido no tiene factura confirmada" descripcion="Para cargar la nota de crédito, primero confirmá la factura del pedido." />
  return <Formulario {...props} ctx={ctx} dev={dev} factura={ctx.factura} />
}

function Formulario({
  ctx, dev, factura, onCambios, onPendiente, onListo, onCancelar,
}: {
  ctx: ContextoDevolucion
  dev: DevolucionVista
  factura: NonNullable<ContextoDevolucion['factura']>
  onCambios: (b: boolean) => void
  onPendiente: (b: boolean) => void
  onListo: () => void
  onCancelar: () => void
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [papel, setPapel] = useState<number | null>(null)
  const [precios, setPrecios] = useState<Record<string, { precio: number | null; alicuota: number }>>({})

  const efecto = efectoDeMotivo({ devuelve_mercaderia: dev.devuelveMercaderia, corrige_precio: dev.corrigePrecio })
  const unidadBaseDe = (itemId: string | null) => (itemId ? ctx.insumos.get(itemId)?.unidad_base ?? null : null)
  const nc = useMemo(() => armarNotaCredito(
    dev.lineas.map(l => ({ ...l, precioCorrecto: l.precioCorrecto })),
    factura,
    efecto,
    dev.lineas.map(l => ({ precioUnitario: precios[l.id]?.precio ?? undefined, alicuotaIva: precios[l.id]?.alicuota ?? undefined })),
    unidadBaseDe,
  ), [dev, factura, efecto, precios]) // eslint-disable-line react-hooks/exhaustive-deps

  // D7: sin los kg de una línea por kg, la NC no se puede cargar.
  const sinKg = dev.lineas.find((l, i) => nc.lineas[i]?.precioPor === 'base' && l.cantidadBase == null) ?? null
  const ub = sinKg ? unidadBaseDe(sinKg.itemId) : null
  const corto = esUnidadBase(ub) ? cortoBase(ub) : 'kg'
  const tope = topeNotaCredito(factura)
  const supera = nc.totales.total > tope + 0.005
  const gasto = impactoGasto({ gastoId: factura.gastoId, gastoEstado: factura.gastoEstado, gastoMonto: factura.gastoMonto, totalNc: nc.totales.total, facturaNumero: factura.numero })
  const puede = !sinKg && !nc.incompleta && !supera && !!numero.trim() && !!fecha && !isPending

  function guardar() {
    confirmar({
      titulo: `Nota de crédito de ${dev.codigo}`,
      mensaje: (
        <div className="space-y-2">
          <p className="font-semibold">Se carga la nota de crédito {numero.trim()} por {formatearMonedaExacta(nc.totales.total)}.</p>
          <p>{gasto.texto}</p>
          {!dev.corrigePrecio && <p>Las diferencias de la factura que esperaban esta nota se cierran si los números coinciden.</p>}
        </div>
      ),
      textoConfirmar: 'Cargar nota de crédito',
      onConfirmar: () => {
        onPendiente(true)
        startTransition(async () => {
          const r = await cargarNotaCredito({
            devolucionId: dev.id,
            numero: numero.trim(),
            fecha,
            totalPapel: papel,
            lineas: dev.lineas.map((l, i) => ({
              devolucionItemId: l.id,
              precioUnitario: efecto === 'precio' ? 1 : nc.lineas[i].precioUnitario,
              alicuotaIva: nc.lineas[i].alicuotaIva,
            })),
          })
          onPendiente(false)
          if (!r.ok) { toast.error(r.error); return }
          const extra = textoToastGasto(r.data.notaCredito.gasto, r.data.notaCredito.monto_despues ?? null)
          toast.success(`Nota de crédito ${r.data.notaCredito.numero} cargada${extra ? ` · ${extra}` : ''}`)
          onListo()
        })
      },
    })
  }

  return (
    <div className="space-y-5">
      <p className="-mt-2 text-sm text-muted">
        De <span className="font-mono tabular-nums text-text">{dev.codigo}</span> · {dev.motivoNombre} · factura {factura.numero}
      </p>
      {sinKg ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning bg-warning-bg px-3 py-2.5 text-sm text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Esta devolución no tiene los {corto} de {sinKg.descripcion} y la factura lo cobra por {corto}. Anulá la devolución y registrala de nuevo con los {corto}.
        </p>
      ) : (
        <BloqueNc
          nc={nc}
          elegidos={dev.lineas.map(l => l.id)}
          efecto={efecto}
          numero={numero}
          fecha={fecha}
          papel={papel}
          tope={tope}
          supera={supera}
          precios={precios}
          onNumero={v => { onCambios(true); setNumero(v) }}
          onFecha={v => { onCambios(true); setFecha(v) }}
          onPapel={v => { onCambios(true); setPapel(v) }}
          onPrecio={(k, p) => { onCambios(true); setPrecios(prev => ({ ...prev, [k]: p })) }}
        />
      )}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:px-6">
        {!sinKg && <p aria-live="polite" className="mb-3 text-xs text-muted sm:text-sm">{gasto.texto}</p>}
        <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={onCancelar} disabled={isPending} className="presionable min-h-11 inline-flex items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!puede} className="presionable min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50">
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />} Cargar nota de crédito
          </button>
        </div>
      </div>
    </div>
  )
}
