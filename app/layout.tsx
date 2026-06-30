import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import SWRegister from '@/components/ui/SWRegister'
import InstallPrompt from '@/components/ui/InstallPrompt'
import './globals.css'

export const metadata: Metadata = {
  title: 'YA! Chipacitos — Sistema de Gestión',
  description: 'Sistema interno de pedidos y conciliación',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'YA! Chipacitos',
  },
}

export const viewport: Viewport = {
  themeColor: '#111111',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value
  return (
    <html lang="es" className={`h-full${theme === 'light' ? ' light' : ''}`} suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <SWRegister />
        <InstallPrompt />
        {children}
      </body>
    </html>
  )
}
