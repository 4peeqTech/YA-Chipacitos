import Tabs from '@/components/ui/Tabs'
import { Mail, ClipboardList, Inbox, FolderOpen } from 'lucide-react'

export default function PedidosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/compras/pedidos/solicitudes', label: 'Solicitudes', icon: <Mail size={14} /> },
          { href: '/admin/compras/pedidos', label: 'Pedidos', icon: <ClipboardList size={14} /> },
          { href: '/admin/compras/pedidos/remitos', label: 'Remitos', icon: <Inbox size={14} /> },
          { href: '/admin/compras/pedidos/base', label: 'Pedido base', icon: <FolderOpen size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
