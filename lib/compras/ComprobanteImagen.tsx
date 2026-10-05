// Comprobante interno de una factura de proveedor, como JSX para Satori
// (next/og). Estilos inline, solo flexbox: todo div con más de un hijo lleva
// display flex. Siempre en claro: es un papel, no sigue el tema de la app.
// El alto lo fija `altoComprobante` (comprobanteFactura.ts): si se toca el
// diseño, recalibrar ALTO y RENGLON_DESCRIPCION_EM.

import { formatearMonedaExacta } from '@/lib/formato'
import {
  TOPE_LINEAS, fechaHoraNumerica, fechaNumerica, lineaEsDoble, textoEstadoPago, type DatosComprobante,
} from './comprobanteFactura'
import { etiquetaAlicuota } from './totalesFactura'

export const ANCHO_COMPROBANTE = 1080

const C = {
  fondo: '#E9E3D3',
  papel: '#FFFDF8',
  tinta: '#1A1A1A',
  suave: '#6B6658',
  linea: '#E7E0CF',
  oro: '#E8C547',
  fondoTotal: '#FBF3D0',
  alterna: '#FBF8F0',
  sello: '#C62828',
}

const PAD = 64
const sans = 'DM Sans'
const display = 'Syne'

const etiqueta = {
  fontFamily: sans, fontWeight: 600, fontSize: 18, letterSpacing: 2, color: C.suave, textTransform: 'uppercase' as const,
}

// La descripción se queda con el resto: 952 − 580 − 28 de padding = 344 px (ver RENGLON_DESCRIPCION_EM).
const COL = { cantidad: 140, precio: 170, iva: 80, subtotal: 190 }

function cantidadTexto(cantidad: number, unidad: string | null): string {
  const n = cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })
  return unidad ? `${n} ${unidad.toLowerCase()}` : n
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: 48 }}>
      <div style={etiqueta}>{titulo}</div>
      <div style={{ fontFamily: sans, fontSize: 24, color: C.tinta, marginTop: 4 }}>{valor}</div>
    </div>
  )
}

function FilaTotal({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: 48, paddingRight: 12 }}>
      <div style={{ display: 'flex', fontFamily: sans, fontSize: 22, color: C.suave }}>{titulo}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: sans, fontSize: 24, color: C.tinta, width: 240 }}>{valor}</div>
    </div>
  )
}

export default function ComprobanteImagen({ d, logo }: { d: DatosComprobante; logo: string }) {
  const visibles = d.lineas.slice(0, TOPE_LINEAS)
  const ocultas = d.lineas.length - visibles.length
  const estadoPago = textoEstadoPago(d.estadoPago)
  const proveedorLinea = d.proveedor.cuit
    ? `${d.proveedor.nombre.toUpperCase()} · CUIT ${d.proveedor.cuit}`
    : d.proveedor.nombre.toUpperCase()
  // Dos renglones fijos (el alto no depende del largo de los nombres).
  const confirmada = d.confirmada.en
    ? `Confirmada el ${fechaHoraNumerica(d.confirmada.en)}${d.confirmada.por ? ` por ${d.confirmada.por}` : ''}`
    : 'Confirmada'
  const generado = `Generado el ${fechaHoraNumerica(d.generado.en)} por ${d.generado.por}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: C.fondo }}>
      <div
        style={{
          display: 'flex', flexDirection: 'column', flexGrow: 1, backgroundColor: C.papel, position: 'relative',
          fontFamily: sans, color: C.tinta,
        }}
      >
        {/* Banda */}
        <div style={{ display: 'flex', height: 16, backgroundColor: C.oro }} />

        {/* Cabecera: marca y sello */}
        <div style={{ display: 'flex', alignItems: 'flex-start', padding: `40px ${PAD}px 0` }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} width={72} height={72} style={{ borderRadius: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20 }}>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 32 }}>YA! Chipacitos</div>
            <div style={{ fontSize: 20, color: C.suave }}>Compras · Fábrica</div>
          </div>
          {/* En el flujo y no absoluto: así nunca pisa el número, por largo que sea. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto' }}>
            <div style={{ display: 'flex', ...etiqueta, color: C.tinta }}>Comprobante interno</div>
            <div
              style={{
                display: 'flex', marginTop: 28, marginRight: 4, transform: 'rotate(-6deg)',
                border: `4px solid ${C.sello}`, borderRadius: 12, padding: '10px 20px', opacity: 0.92,
                fontFamily: display, fontWeight: 700, fontSize: 28, letterSpacing: 1, color: C.sello,
              }}
            >
              NO VÁLIDO COMO FACTURA
            </div>
          </div>
        </div>

        {/* Número */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: `36px ${PAD}px 0` }}>
          <div style={etiqueta}>Factura del proveedor</div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 56, lineHeight: 1.15, marginTop: 4 }}>{d.numero}</div>
          <div style={{ fontSize: 24, color: C.suave, marginTop: 4 }}>{proveedorLinea}</div>
        </div>

        {/* Metadatos */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: `28px ${PAD}px 0`, borderTop: `2px solid ${C.linea}`, paddingTop: 20 }}>
          <div style={{ display: 'flex' }}>
            <Dato titulo="Fecha" valor={fechaNumerica(d.fecha)} />
            <Dato titulo="Vence" valor={d.vencimiento ? fechaNumerica(d.vencimiento) : '—'} />
            <Dato titulo="Pedido" valor={d.pedido} />
            <Dato titulo={d.remitos.length > 1 ? 'Remitos' : 'Remito'} valor={d.remitos.length ? d.remitos.join(', ') : '—'} />
          </div>
          {d.facturadoA && (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 20 }}>
              <div style={{ ...etiqueta, marginRight: 16 }}>Facturado a</div>
              <div style={{ fontSize: 24 }}>
                {`${d.facturadoA.razonSocial} · CUIT ${d.facturadoA.cuit} · ${d.facturadoA.sucursal}`}
              </div>
            </div>
          )}
        </div>

        {/* Tabla */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: `24px ${PAD}px 0` }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', height: 48, borderTop: `2px solid ${C.linea}`,
              borderBottom: `2px solid ${C.linea}`, ...etiqueta, fontSize: 16,
            }}
          >
            <div style={{ display: 'flex', flex: 1, paddingLeft: 12 }}>Descripción</div>
            <div style={{ display: 'flex', width: COL.cantidad, justifyContent: 'flex-end' }}>Cant.</div>
            <div style={{ display: 'flex', width: COL.precio, justifyContent: 'flex-end' }}>P. unit.</div>
            <div style={{ display: 'flex', width: COL.iva, justifyContent: 'flex-end' }}>IVA</div>
            <div style={{ display: 'flex', width: COL.subtotal, justifyContent: 'flex-end', paddingRight: 12 }}>Subtotal</div>
          </div>
          {visibles.map((l, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', height: lineaEsDoble(l.descripcion) ? 88 : 56,
                backgroundColor: i % 2 === 1 ? C.alterna : C.papel, fontSize: 22,
              }}
            >
              <div style={{ display: 'flex', flex: 1, paddingLeft: 12, paddingRight: 16 }}>
                <div style={{ display: 'block', lineClamp: 2, fontSize: 22, lineHeight: 1.35 }}>{l.descripcion}</div>
              </div>
              <div style={{ display: 'flex', width: COL.cantidad, justifyContent: 'flex-end' }}>{cantidadTexto(l.cantidad, l.unidad)}</div>
              <div style={{ display: 'flex', width: COL.precio, justifyContent: 'flex-end' }}>{formatearMonedaExacta(l.precioUnitario)}</div>
              <div style={{ display: 'flex', width: COL.iva, justifyContent: 'flex-end', color: C.suave }}>{etiquetaAlicuota(l.alicuota)}</div>
              <div style={{ display: 'flex', width: COL.subtotal, justifyContent: 'flex-end', paddingRight: 12 }}>{formatearMonedaExacta(l.subtotal)}</div>
            </div>
          ))}
          {(ocultas > 0 || d.lineas.length === 0) && (
            <div style={{ display: 'flex', alignItems: 'center', height: 56, paddingLeft: 12, fontSize: 22, color: C.suave }}>
              {d.lineas.length === 0
                ? 'Sin líneas cargadas'
                : `y ${ocultas} ${ocultas === 1 ? 'línea más' : 'líneas más'} (ver la factura en el sistema)`}
            </div>
          )}
        </div>

        {/* Totales */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: `0 ${PAD}px`, paddingTop: 16, borderTop: `2px solid ${C.linea}` }}>
          <FilaTotal titulo="Subtotal sin IVA" valor={formatearMonedaExacta(d.subtotal)} />
          {d.porAlicuota.map(g => (
            <FilaTotal
              key={g.alicuota}
              titulo={`IVA ${etiquetaAlicuota(g.alicuota)} s/ ${formatearMonedaExacta(g.base)}`}
              valor={formatearMonedaExacta(g.iva)}
            />
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 80,
                backgroundColor: C.fondoTotal, borderLeft: `8px solid ${C.oro}`, padding: '0 12px 0 24px',
              }}
            >
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 26, letterSpacing: 2 }}>TOTAL</div>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 52 }}>{formatearMonedaExacta(d.total)}</div>
            </div>
          </div>
          {estadoPago && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: 40, fontSize: 20, color: C.suave }}>
              {`Gasto: ${estadoPago.toLowerCase()}`}
            </div>
          )}
        </div>

        {/* Lo que sobra del alto mínimo queda acá, entre los totales y el pie. */}
        <div style={{ display: 'flex', flexGrow: 1, minHeight: 24 }} />

        {/* Pie */}
        <div
          style={{
            display: 'flex', flexDirection: 'column', margin: `0 ${PAD}px`, padding: '24px 0 48px',
            borderTop: `2px dashed ${C.linea}`, fontSize: 20, lineHeight: 1.45, color: C.suave,
          }}
        >
          <div style={{ display: 'flex' }}>
            {`Representación digital de la factura ${d.numero} de ${d.proveedor.nombre.toUpperCase()}, cargada en el sistema de compras de YA! Chipacitos. No es un comprobante fiscal: no la emitió ARCA y no reemplaza la factura original del proveedor.`}
          </div>
          <div style={{ display: 'flex', marginTop: 12, color: C.tinta }}>{confirmada}</div>
          <div style={{ display: 'flex', color: C.tinta }}>{generado}</div>
        </div>
      </div>

      {/* Borde troquelado: círculos del color del fondo que muerden el papel. */}
      <div style={{ display: 'flex', height: 24, marginTop: -12, justifyContent: 'space-between', padding: '0 6px' }}>
        {Array.from({ length: 27 }, (_, i) => (
          <div key={i} style={{ display: 'flex', width: 24, height: 24, borderRadius: 12, backgroundColor: C.fondo }} />
        ))}
      </div>
    </div>
  )
}
