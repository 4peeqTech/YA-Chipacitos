import Tabs from '@/components/ui/Tabs'
import { Package, History } from 'lucide-react'

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Tabs
        items={[
          { href: '/admin/compras/stock', label: 'Stock actual', icon: <Package size={14} /> },
          { href: '/admin/compras/stock/historico', label: 'Histórico por insumo', icon: <History size={14} /> },
        ]}
      />
      {children}
    </div>
  )
}
