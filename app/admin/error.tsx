'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <h2 className="text-lg font-semibold mb-2">Algo salió mal</h2>
      <p className="text-sm text-[#888] mb-4">{error.message || 'Ocurrió un error inesperado.'}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-md bg-[#e8c547] text-[#111] text-sm font-medium hover:opacity-90"
      >
        Reintentar
      </button>
    </div>
  )
}
