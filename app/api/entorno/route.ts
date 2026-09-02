import { NextResponse } from 'next/server'
import { verificarEntorno, refDeUrl, refDeKey } from '@/lib/entorno'

// GET /api/entorno — reemplaza "grepear el bundle" como método de
// verificación post-deploy. Solo expone datos ya públicos (nunca keys).
export async function GET() {
  const entorno = verificarEntorno({
    vercelEnv: process.env.VERCEL_ENV,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  const body = {
    ok: entorno.ok,
    problemas: entorno.problemas,
    vercelEnv: process.env.VERCEL_ENV || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    refCliente: refDeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    refServiceRole: refDeKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
  }

  return NextResponse.json(body, { status: entorno.ok ? 200 : 503 })
}
