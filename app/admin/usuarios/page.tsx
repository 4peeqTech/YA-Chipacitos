export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import UsuariosClient from './UsuariosClient'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: usuarios } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  return <UsuariosClient usuariosIniciales={usuarios || []} />
}
