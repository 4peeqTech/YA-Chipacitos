export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface2 rounded ${className}`} />
}

export function SkeletonTabla({ filas = 3, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center gap-3">
          {Array.from({ length: columnas }).map((_, j) => (
            <Skeleton key={j} className={`h-4 ${j === 0 ? 'w-1/3' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-card border border-border bg-surface p-4 space-y-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
