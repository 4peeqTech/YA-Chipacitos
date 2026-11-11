'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'

// B2. El resto del ABM de plantillas sigue escribiendo desde el navegador
// (pasarlo a server actions es F9). La autorización es de la RPC y de la RLS
// de compras_config (es_admin()); acá se repite el chequeo para dar un error claro.

export async function marcarPlantillaDefault(id: string): Promise<Resultado<null>> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return fallo(null, 'La plantilla no existe')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('compras_marcar_plantilla_default', { p_plantilla_id: parsed.data })
    if (error) return fallo(error, 'No se pudo marcar la plantilla como predeterminada.')
    revalidatePath('/admin/proveedores/plantillas')
    revalidatePath('/admin/compras/pedidos')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo marcar la plantilla como predeterminada.')
  }
}

export async function guardarWhatsappAdministracion(numero: string): Promise<Resultado<{ numero: string }>> {
  const normalizado = String(numero ?? '').replace(/[^\d]/g, '')
  if (normalizado !== '' && (normalizado.length < 10 || normalizado.length > 15)) {
    return fallo(null, 'Poné el número con código de país, solo dígitos (ej.: 5493511234567)')
  }
  try {
    const supabase = await createClientTipado()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fallo(null, 'Iniciá sesión')
    const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).maybeSingle()
    if (perfil?.rol !== 'admin') return fallo(null, 'Solo un administrador puede cambiar el número.')

    const { error } = await supabase
      .from('compras_config')
      .upsert({ clave: 'factura.whatsapp_admin', valor: normalizado, updated_at: new Date().toISOString() }, { onConflict: 'clave' })
    if (error) return fallo(error, 'No se pudo guardar el número.')
    revalidatePath('/admin/proveedores/plantillas')
    return ok({ numero: normalizado })
  } catch (e) {
    return fallo(e, 'No se pudo guardar el número.')
  }
}
