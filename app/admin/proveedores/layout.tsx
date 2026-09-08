import Tabs from '@/components/ui/Tabs'
import { Truck, Receipt, MessageSquare } from 'lucide-react'

export default function ProveedoresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/proveedores', label: 'Proveedores', icon: <Truck size={14} /> },
          { href: '/admin/proveedores/facturacion', label: 'Datos de facturación', icon: <Receipt size={14} /> },
          { href: '/admin/proveedores/plantillas', label: 'Plantillas WPP', icon: <MessageSquare size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
