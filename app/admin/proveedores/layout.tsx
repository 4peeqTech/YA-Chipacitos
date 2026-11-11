import Tabs from '@/components/ui/Tabs'
import { Truck, Receipt, MessageSquare, Undo2 } from 'lucide-react'

export default function ProveedoresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/proveedores', label: 'Proveedores', icon: <Truck size={14} /> },
          { href: '/admin/proveedores/facturacion', label: 'Datos de facturación', icon: <Receipt size={14} /> },
          { href: '/admin/proveedores/plantillas', label: 'Plantillas WPP', icon: <MessageSquare size={14} /> },
          // B4: en la pestaña alcanza con "Motivos de devolución"; el título dice "al proveedor".
          { href: '/admin/proveedores/motivos-devolucion', label: 'Motivos de devolución', icon: <Undo2 size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
