import Tabs from '@/components/ui/Tabs'
import { ShoppingBasket, ClipboardCheck } from 'lucide-react'

export default function InsumosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/compras/insumos', label: 'Catálogo', icon: <ShoppingBasket size={14} /> },
          { href: '/admin/compras/insumos/listas-conteo', label: 'Listas de conteo', icon: <ClipboardCheck size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
