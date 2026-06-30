export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import UsuariosClient from './UsuariosClient'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: usuarios } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 500 })
  const emailsById: Record<string, string> = {}
  for (const u of authUsers?.users ?? []) {
    if (u.email) emailsById[u.id] = u.email
  }

  return <UsuariosClient usuariosIniciales={usuarios || []} emailsById={emailsById} />
}
