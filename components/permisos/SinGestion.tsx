import type { ComponentType } from 'react'
import { IconLock } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'

// Usuarios y Roles muestran datos de todos: sin "Gestionar usuarios y roles" se
// veían a medias (lo que la base deja leer). En su lugar, este aviso.
export default function SinGestion({ icono, titulo }: { icono: ComponentType<{ size?: number | string; className?: string }>; titulo: string }) {
  return (
    <div className="space-y-5 w-full">
      <PageHeader icono={icono} titulo={titulo} />
      <div className="bg-surface border border-border rounded-card">
        <EmptyState icono={IconLock} titulo="Esta pantalla es para quien gestiona usuarios"
          descripcion='Para ver y cambiar usuarios y roles hace falta la acción "Gestionar usuarios y roles". Pedísela a un Admin.' />
      </div>
    </div>
  )
}
