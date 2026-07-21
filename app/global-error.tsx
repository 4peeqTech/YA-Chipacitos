'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body className="min-h-screen flex items-center justify-center bg-[#111] text-[#eee]">
        <div className="text-center px-6">
          <h2 className="text-lg font-semibold mb-2">Algo salió mal</h2>
          <p className="text-sm text-[#888] mb-4">{error.message || 'Ocurrió un error inesperado.'}</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-md bg-[#e8c547] text-[#111] text-sm font-medium hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
