import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'YA! Chipacitos — Sistema de Gestión',
  description: 'Sistema interno de pedidos y conciliación',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>{children}</body>
    </html>
  )
}
