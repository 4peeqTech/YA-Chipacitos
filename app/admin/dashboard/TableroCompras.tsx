import Link from 'next/link'
import {
  AlertTriangle, Clock, FileMinus, PackageMinus, ReceiptText, Scale, ShoppingCart, Truck, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { formatearMoneda } from '@/lib/formato'
import { puedeEntrarAdmin } from '@/lib/modulos'
import { rutaPedidos, rutaPedidosAlerta, rutaStockBajo } from '@/lib/compras/rutas'

/** Lo que devuelve compras_tablero_resumen() (B5). Los campos de admin vienen en null para el resto. */
export interface ResumenTablero {
  dias_demora: number
  por_recibir: number
  demorados: number
  por_facturar: number
  stock_bajo: number
  stock_bajo_sin_pedido: number
  por_facturar_estimado: number | null
  por_facturar_sin_precio: number | null
  diferencias: number | null
  nc_pendientes: number | null
  deuda_pendiente: number | null
  deuda_a_favor: number | null
}

interface Tarjeta {
  clave: string
  icono: LucideIcon
  titulo: string
  valor: string
  sub: string
  href: string
  alerta?: boolean
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`
}

function armarTarjetas(r: ResumenTablero, esAdmin: boolean): Tarjeta[] {
  const t: Tarjeta[] = [
    {
      clave: 'por_recibir', icono: Truck, titulo: 'Por recibir', valor: String(r.por_recibir),
      sub: r.demorados > 0 ? plural(r.demorados, 'demorado', 'demorados') : 'Pedidos esperando mercadería',
      alerta: false, href: rutaPedidosAlerta('por_recibir'),
    },
    {
      clave: 'demorados', icono: Clock, titulo: 'Demorados', valor: String(r.demorados),
      sub: `Más de ${plural(r.dias_demora, 'día', 'días')} sin llegar`,
      alerta: r.demorados > 0, href: rutaPedidosAlerta('demorados'),
    },
    esAdmin && r.por_facturar_estimado != null
      ? {
        clave: 'por_facturar', icono: ReceiptText, titulo: 'Recibidos sin facturar',
        valor: `≈ ${formatearMoneda(r.por_facturar_estimado)}`,
        sub: `${plural(r.por_facturar, 'pedido', 'pedidos')} · a precio de referencia, sin IVA`
          + (r.por_facturar_sin_precio ? ` · ${plural(r.por_facturar_sin_precio, 'línea sin precio', 'líneas sin precio')}` : ''),
        href: rutaPedidos('por_facturar'),
      }
      : {
        clave: 'por_facturar', icono: ReceiptText, titulo: 'Recibidos sin facturar', valor: String(r.por_facturar),
        sub: 'Llegó la mercadería y falta la factura', href: rutaPedidos('por_facturar'),
      },
  ]
  if (esAdmin && r.diferencias != null) {
    t.push({
      clave: 'diferencias', icono: Scale, titulo: 'Diferencias', valor: String(r.diferencias),
      sub: 'Pedidos con diferencias por resolver', alerta: r.diferencias > 0, href: rutaPedidosAlerta('diferencias'),
    })
  }
  if (esAdmin && r.deuda_pendiente != null) {
    const aFavor = r.deuda_a_favor ?? 0
    t.push({
      clave: 'deuda', icono: Wallet, titulo: 'Deuda con proveedores', valor: formatearMoneda(r.deuda_pendiente),
      sub: aFavor < 0
        ? `A favor ${formatearMoneda(aFavor)} · Neto ${formatearMoneda(r.deuda_pendiente + aFavor)}`
        : 'Facturas con el gasto sin pagar',
      href: '/admin/gastos/pendientes',
    })
  }
  if (esAdmin && r.nc_pendientes != null) {
    t.push({
      clave: 'nc', icono: FileMinus, titulo: 'NC pendientes', valor: String(r.nc_pendientes),
      sub: 'Pedidos esperando nota de crédito', alerta: r.nc_pendientes > 0, href: rutaPedidosAlerta('nc'),
    })
  }
  t.push({
    clave: 'stock', icono: PackageMinus, titulo: 'Bajo el mínimo', valor: String(r.stock_bajo),
    sub: r.stock_bajo === 0 ? 'Todo el stock arriba del mínimo' : `${r.stock_bajo_sin_pedido} sin pedido abierto`,
    alerta: r.stock_bajo_sin_pedido > 0, href: rutaStockBajo(),
  })
  return t
}

function Contenido({ t }: { t: Tarjeta }) {
  const Icon = t.icono
  return (
    <>
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon size={15} className={t.alerta ? 'text-warning' : 'text-muted'} />
        <span className="truncate">{t.titulo}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums leading-tight ${t.alerta ? 'text-warning' : 'text-text'}`}>{t.valor}</p>
      <p className="mt-1 text-xs text-muted">{t.sub}</p>
    </>
  )
}

/** Franja de KPIs de compras del dashboard (B5 §6.1). Cada número abre la lista con esos mismos N. */
export default function TableroCompras({
  resumen,
  error,
  rol,
  modulosPermitidos,
}: {
  resumen: ResumenTablero | null
  error: boolean
  rol: string | null
  modulosPermitidos: string[]
}) {
  const esAdmin = rol === 'admin'
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
        <ShoppingCart size={16} className="text-accent" /> Compras
      </h2>
      {error || !resumen ? (
        <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          <AlertTriangle size={15} className="text-warning" /> No se pudieron cargar los números de compras.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {armarTarjetas(resumen, esAdmin).map(t => {
            const clases = 'block rounded-2xl border bg-surface p-4 ' + (t.alerta ? 'border-warning/40' : 'border-border')
            // Mismo criterio que LinkEntidad: sin el módulo del destino, texto y no link.
            return puedeEntrarAdmin(t.href.split('?')[0], rol, modulosPermitidos) ? (
              <Link key={t.clave} href={t.href} className={`${clases} transition-colors hover:border-accent`}>
                <Contenido t={t} />
              </Link>
            ) : (
              <div key={t.clave} className={clases}><Contenido t={t} /></div>
            )
          })}
        </div>
      )}
    </section>
  )
}
