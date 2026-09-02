import type { NextConfig } from 'next'
import { verificarEntorno, mensajeEntorno } from './lib/entorno'

// Aborta el build si el proyecto de Supabase detectado no es el esperado
// para este entorno (ver lib/entorno.ts). Va acá y no en un script
// `prebuild` porque next.config.ts lo carga `next build` siempre, sin
// importar el Build Command configurado en el dashboard de Vercel.
const entorno = verificarEntorno({
  vercelEnv: process.env.VERCEL_ENV,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
})
console.log(mensajeEntorno(entorno))
if (!entorno.ok) {
  throw new Error(mensajeEntorno(entorno))
}

const nextConfig: NextConfig = {
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
