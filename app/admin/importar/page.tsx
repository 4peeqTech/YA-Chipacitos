export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import ImportarClient from './ImportarClient'

export default async function ImportarPage() {
  const supabase = await createClient()
  const { data: config } = await supabase
    .from('config').select('value').eq('key', 'apps_script_url').single()

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Sincronizar ventas</h1>
        <p className="text-sm text-[#888]">Importa datos desde Google Sheets en tiempo real</p>
      </div>
      <ImportarClient urlInicial={config?.value || ''} />
    </div>
  )
}
