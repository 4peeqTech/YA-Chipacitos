import { Skeleton, SkeletonTabla } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-lg rounded-xl" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-10 w-72 rounded-xl" />
      </div>
      <SkeletonTabla filas={6} columnas={6} />
    </div>
  )
}
