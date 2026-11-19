import Tabs from '@/components/ui/Tabs'
import { Mail, ClipboardList, Inbox, FolderOpen, ReceiptText } from 'lucide-react'
import { cargarAcceso } from '@/lib/permisos/servidor'
import { puede, puedePantalla } from '@/lib/permisos/acceso'
import { ACCIONES } from '@/lib/permisos/catalogo'

// Facturas: la pestaña es la pantalla compras-facturas y sus datos piden
// compras.ver_plata (RLS de las tres tablas). Sin las dos, ni se muestra; si
// igual entra por la URL, proxy.ts lo rebota y la pantalla no devuelve datos.
export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const { acceso } = await cargarAcceso()
  const verFacturas = puedePantalla(acceso, 'compras-facturas') && puede(acceso, ACCIONES.verPlataCompras)

  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/compras/pedidos/solicitudes', label: 'Solicitudes', icon: <Mail size={14} /> },
          { href: '/admin/compras/pedidos', label: 'Pedidos', icon: <ClipboardList size={14} /> },
          { href: '/admin/compras/pedidos/remitos', label: 'Remitos', icon: <Inbox size={14} /> },
          ...(verFacturas ? [{ href: '/admin/compras/pedidos/facturas', label: 'Facturas', icon: <ReceiptText size={14} /> }] : []),
          { href: '/admin/compras/pedidos/base', label: 'Pedido base', icon: <FolderOpen size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
