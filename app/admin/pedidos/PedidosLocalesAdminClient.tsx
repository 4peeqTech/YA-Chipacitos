'use client'

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Pedido, PedidoEvento } from '@/lib/types'
import { useToasts, ToastStack } from '@/components/ui/Toast'
import HistorialPedidos from '@/components/pedidos/mayorista/HistorialPedidos'
import DetallePedidoModal from '@/components/pedidos/mayorista/DetallePedidoModal'

const SELECT = '*, pedido_items(*), pedido_mensajes(*)'

interface Props {
  sucursales: string[]
  inicioVersion: string | null
  usuarioId: string
}

// Reporte de pedidos de locales para el admin: todos los estados, con filtros, y el
// detalle en solo lectura (ítems, movimientos y chat, sin acciones).
export default function PedidosLocalesAdminClient({ sucursales, inicioVersion, usuarioId }: Props) {
  const [supabase] = useState(() => createClient())
  const toast = useToasts()
  const [detalle, setDetalle] = useState<Pedido | null>(null)
  const [eventos, setEventos] = useState<PedidoEvento[] | null>(null)
  const detalleIdRef = useRef<string | null>(null)

  const leerEventos = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('pedido_eventos').select('*').eq('pedido_id', id).order('created_at')
    if (detalleIdRef.current !== id) return
    if (error) { toast.error('No se pudieron cargar los movimientos del pedido.'); setEventos([]); return }
    setEventos((data ?? []) as PedidoEvento[])
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // El detalle no tiene acciones; esto solo cumple con la interfaz del modal.
  const recargar = useCallback(async (id: string) => {
    const { data } = await supabase.from('pedidos').select(SELECT).eq('id', id).maybeSingle()
    if (data && detalleIdRef.current === id) setDetalle(data as Pedido)
    await leerEventos(id)
  }, [supabase, leerEventos])

  function abrir(p: Pedido) {
    detalleIdRef.current = p.id
    setDetalle(p)
    setEventos(null)
    leerEventos(p.id)
  }

  function cerrar() {
    detalleIdRef.current = null
    setDetalle(null)
    setEventos(null)
  }

  return (
    <div className="space-y-4">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div>
        <h1 className="font-['Syne'] text-xl font-bold text-text">Pedidos de locales</h1>
        <p className="mt-1 text-xs text-muted">
          Lo que los locales le piden al mayorista. Es para consultar: los pedidos los prepara y los manda el mayorista desde su pantalla.
        </p>
      </div>

      <HistorialPedidos destino="fabrica" sucursales={sucursales} inicioVersion={inicioVersion}
        version={0} onAbrir={abrir} todosLosEstados />

      {detalle && (
        <DetallePedidoModal key={detalle.id} pedido={detalle} eventos={eventos} productos={[]}
          usuarioId={usuarioId} onClose={cerrar} onRecargar={recargar} toast={toast}
          sinLeer={0} onChatVisto={() => {}} soloLectura />
      )}
    </div>
  )
}
