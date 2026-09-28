import Tabs from '@/components/ui/Tabs'
import { Mail, ClipboardList, Inbox, FolderOpen, ReceiptText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

// Facturas es solo de admin (RLS es_admin() en las tres tablas): a un
// colaborador ni le mostramos la pestaña. Si igual entra por la URL, proxy.ts
// lo rebota y la pantalla no le devuelve datos.
export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: perfil } = user
    ? await supabase.from('profiles').select('rol').eq('id', user.id).single()
    : { data: null }
  const esAdmin = perfil?.rol === 'admin'

  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/compras/pedidos/solicitudes', label: 'Solicitudes', icon: <Mail size={14} /> },
          { href: '/admin/compras/pedidos', label: 'Pedidos', icon: <ClipboardList size={14} /> },
          { href: '/admin/compras/pedidos/remitos', label: 'Remitos', icon: <Inbox size={14} /> },
          ...(esAdmin ? [{ href: '/admin/compras/pedidos/facturas', label: 'Facturas', icon: <ReceiptText size={14} /> }] : []),
          { href: '/admin/compras/pedidos/base', label: 'Pedido base', icon: <FolderOpen size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
