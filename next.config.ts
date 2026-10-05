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
  // La ruta del comprobante (B2) lee las fuentes y el logo con readFile: el
  // trazado no los ve solo. La clave es un glob (picomatch): los corchetes
  // del segmento dinámico van escapados.
  outputFileTracingIncludes: {
    '/api/compras/facturas/\\[id\\]/comprobante': ['./assets/fonts/*.ttf', './public/chipacitos-logo.png'],
  },
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
      {
        source: '/admin/compras/solicitudes',
        destination: '/admin/compras/pedidos/solicitudes',
        permanent: true,
      },
      {
        source: '/admin/compras/remitos',
        destination: '/admin/compras/pedidos/remitos',
        permanent: true,
      },
      {
        source: '/admin/compras/pedido-base',
        destination: '/admin/compras/pedidos/base',
        permanent: true,
      },
      {
        source: '/admin/compras/conteos',
        destination: '/admin/compras/insumos/listas-conteo',
        permanent: true,
      },
      {
        source: '/admin/compras/facturacion',
        destination: '/admin/proveedores/facturacion',
        permanent: true,
      },
      {
        source: '/admin/fabrica-parametros',
        destination: '/admin/fabrica/parametros',
        permanent: true,
      },
      {
        source: '/admin/compras/stock/conteos',
        destination: '/admin/fabrica/conteos',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
