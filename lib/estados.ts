import type { ModoCalculo, Redondeo } from './fabrica/calculoSugerido'

export type Tono = 'neutro' | 'exito' | 'alerta' | 'peligro' | 'info'

export interface DefinicionEstado {
  label: string
  tono: Tono
  /** Nombre de ícono lucide-react (ver IconoPicker.ICON_MAP), opcional. */
  icono?: string
}

/**
 * Registro único de estados por dominio: label + tono de badge para <EstadoBadge>.
 * Es la primitiva que paga la reventa — el día que un cliente nuevo quiera otras
 * etiquetas de estado, esto es lo que se mueve a configuración de base en vez de
 * tocar código (ver `compras_config` para el resto de lo parametrizable).
 */
export const ESTADOS = {
  pedidos: {
    pendiente:  { label: 'Pendiente',       tono: 'alerta' },
    preparando: { label: 'En preparación',  tono: 'neutro' },
    enviado:    { label: 'Enviado',         tono: 'info' },
    recibido:   { label: 'Recibido',        tono: 'exito' },
  },
  // Estado visible del pedido a proveedor (lo deriva lib/compras/estadoPedido.ts
  // de estado_recepcion + estado_facturacion).
  compras_pedido: {
    sin_enviar: { label: 'Sin enviar',            tono: 'neutro', icono: 'PencilLine' },
    enviado:    { label: 'Enviado',               tono: 'info',   icono: 'Send' },
    parcial:    { label: 'Parcialmente recibido', tono: 'alerta', icono: 'PackageOpen' },
    recibido:   { label: 'Recibido',              tono: 'exito',  icono: 'PackageCheck' },
    cerrado:    { label: 'Cerrado',               tono: 'neutro', icono: 'Lock' },
    facturado:  { label: 'Facturado',             tono: 'exito',  icono: 'ReceiptText' },
    devuelto:   { label: 'Devuelto',              tono: 'peligro', icono: 'Undo2' },
  },
  compras_remito: {
    no_facturado: { label: 'No facturado', tono: 'neutro' },
    facturado:    { label: 'Facturado',    tono: 'exito' },
  },
  // Stock de un insumo contra su stock mínimo (Compras › Stock).
  compras_stock: {
    bajo: { label: 'Bajo el mínimo', tono: 'peligro' },
    ok:   { label: 'OK',             tono: 'exito' },
  },
  gastos: {
    'Pendiente de pago': { label: 'Pendiente de pago', tono: 'peligro' },
    'Parcial':            { label: 'Parcial',           tono: 'alerta' },
    'Pagado':              { label: 'Pagado',            tono: 'exito' },
  },
} as const satisfies Record<string, Record<string, DefinicionEstado>>

export type Dominio = keyof typeof ESTADOS

// Antes vivían en ConteosClient.tsx / InsumosClient.tsx y se importaban cruzado
// desde ConteosFabricaClient.tsx — acá quedan disponibles para los tres sin
// que ninguna pantalla sea la "dueña" de una etiqueta que usan las otras dos.
export const MODO_LABEL: Record<ModoCalculo, string> = {
  por_masa: 'Por masa (receta × proyección)',
  meta_semanal: 'Meta del período (piso fijo)',
  cantidad_fija: 'Cantidad fija',
}

export const REDONDEO_LABEL: Record<Redondeo, string> = {
  estandar: 'Estándar (redondeo al medio)',
  siempre_arriba: 'Siempre hacia arriba',
  siempre_abajo: 'Siempre hacia abajo',
  sin_calculo: 'Sin cálculo (solo stock)',
}
