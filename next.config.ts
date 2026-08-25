import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Fallbacks para build sin env vars — en producción se leen de .env.local / Vercel
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
  },
  transpilePackages: ['@4peeqtech/ticket-widget'],
  async redirects() {
    return [
      {
        source: '/admin/compras/materia-prima',
        destination: '/admin/compras/insumos',
        permanent: true,
      },
      {
        source: '/fabrica/produccion',
        destination: '/fabrica/registro/produccion',
        permanent: true,
      },
      {
        source: '/fabrica/embolsado',
        destination: '/fabrica/registro/congelados',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
