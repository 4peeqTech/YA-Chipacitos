import { cargarAcceso } from '@/lib/permisos/servidor'
import { puede } from '@/lib/permisos/acceso'
import { ACCIONES } from '@/lib/permisos/catalogo'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email:        z.string().email('Email inválido'),
  password:     z.string().min(6, 'Mínimo 6 caracteres'),
  nombre:       z.string().min(2, 'Nombre muy corto'),
  rol:          z.string().min(1, 'Rol requerido'),
  local_nombre: z.string().optional(),
})

// Cada variante exige solo su propio campo discriminante; el resto de
// las keys simplemente no se declaran (z.object no es estricto por
// default, así que tolera — e ignora — cualquier key de más). Usar
// z.undefined() para "marcar como ausente" los campos de las otras
// variantes no funciona en Zod v4: una key realmente ausente del body
// no satisface z.undefined(), así que esa key se reporta como inválida
// en TODAS las variantes y el union entero falla con "Invalid input".
// El rol, los ajustes y las sucursales se guardan desde la ficha con
// persona_guardar_acceso (valida y deja historial), no por acá.
const PatchSchema = z.union([
  z.object({ id: z.string().uuid(), password: z.string().min(6) }),
  z.object({ id: z.string().uuid(), whatsapp_phone: z.string().nullable(), whatsapp_apikey: z.string().nullable() }),
  z.object({ id: z.string().uuid(), nombre_posberry: z.string().nullable() }),
])

const EditUserSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  local_nombre: z.string().nullable(),
  email: z.string().email().optional(),
  nueva_password: z.string().min(6).optional(),
})

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Los datos de un Admin (email, contraseña, baja) solo los toca otro Admin:
// si no, quien gestiona usuarios podría entrar como Admin.
async function exigirAdminSiEsAdmin(adminClient: ReturnType<typeof getAdminClient>, id: unknown, soyAdmin: boolean) {
  if (soyAdmin || typeof id !== 'string') return null
  const { data } = await adminClient.from('profiles').select('rol').eq('id', id).single()
  if (data?.rol === 'admin') return NextResponse.json({ error: 'Solo Admin puede cambiar los datos de otro Admin' }, { status: 403 })
  return null
}


export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { acceso } = await cargarAcceso()
  if (!puede(acceso, ACCIONES.gestionarUsuarios)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { email, password, nombre, rol, local_nombre } = parsed.data

  // Nadie da lo que no tiene: el rol entero tiene que estar dentro de lo suyo.
  const { data: puedeAsignar } = await supabase.rpc('rol_puedo_asignar', { p_rol: rol })
  if (!puedeAsignar) return NextResponse.json({ error: 'No podés dar ese rol: trae áreas o permisos que no tenés' }, { status: 403 })

  const adminClient = getAdminClient()
  const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !newUser.user) {
    return NextResponse.json({ error: authError?.message || 'Error al crear auth' }, { status: 400 })
  }

  // Las pantallas y acciones vienen del rol (rol_permisos); los ajustes se hacen en la ficha.
  const { data: newProfile, error: profileError } = await adminClient
    .from('profiles')
    .insert({ id: newUser.user.id, nombre, rol, local_nombre: local_nombre || null })
    .select('id, nombre, rol, local_nombre, nombre_posberry, created_at')
    .single()

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // Una cuenta de local queda vinculada a su sucursal (por nombre; si no existe, se crea).
  let sucursales: string[] = []
  if (rol === 'local') {
    const { error: vinculoError } = await adminClient.rpc('_permisos_vincular_cuenta_local', { p_persona: newUser.user.id })
    if (vinculoError) console.error(vinculoError)
    const { data } = await adminClient.from('persona_sucursales').select('local_config_id').eq('persona_id', newUser.user.id)
    sucursales = (data ?? []).map(s => s.local_config_id)
  }

  return NextResponse.json({ profile: newProfile, sucursales })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { acceso } = await cargarAcceso()
  if (!puede(acceso, ACCIONES.gestionarUsuarios)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json()
  const adminClient = getAdminClient()
  const prohibido = await exigirAdminSiEsAdmin(adminClient, body?.id, !!acceso?.esAdmin)
  if (prohibido) return prohibido

  // Editar nombre / local_nombre / email / nueva_password — schema separado
  if ('nombre' in body) {
    const parsed = EditUserSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { id, nombre, local_nombre, email, nueva_password } = parsed.data
    const { error: profileError } = await adminClient.from('profiles').update({ nombre, local_nombre: local_nombre ?? null }).eq('id', id)
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })
    if (email || nueva_password) {
      const authUpdate: Record<string, string> = {}
      if (email) authUpdate.email = email
      if (nueva_password) authUpdate.password = nueva_password
      const { error: authError } = await adminClient.auth.admin.updateUserById(id, authUpdate)
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { id, password, whatsapp_phone, whatsapp_apikey, nombre_posberry } = parsed.data as {
    id: string; password?: string; whatsapp_phone?: string | null; whatsapp_apikey?: string | null; nombre_posberry?: string | null
  }

  // Resetear contraseña
  if (password) {
    const { error } = await adminClient.auth.admin.updateUserById(id, { password })
    if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo cambiar la contraseña' }, { status: 400 }) }
    return NextResponse.json({ ok: true })
  }

  // Configurar WhatsApp
  if (whatsapp_phone !== undefined) {
    const { error } = await adminClient.from('profiles').update({ whatsapp_phone, whatsapp_apikey }).eq('id', id)
    if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo guardar el WhatsApp' }, { status: 400 }) }
    return NextResponse.json({ ok: true })
  }

  // Actualizar nombre_posberry
  const { error } = await adminClient.from('profiles').update({ nombre_posberry }).eq('id', id)
  if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo guardar el nombre de Posberry' }, { status: 400 }) }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { acceso } = await cargarAcceso()
  if (!puede(acceso, ACCIONES.gestionarUsuarios)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  if (id === user.id) return NextResponse.json({ error: 'No podés eliminarte a vos mismo' }, { status: 403 })

  const adminClient = getAdminClient()
  const prohibido = await exigirAdminSiEsAdmin(adminClient, id, !!acceso?.esAdmin)
  if (prohibido) return prohibido

  // Soft delete: se banea el acceso y se marca el perfil como eliminado,
  // pero no se borra nada — así se conserva el historial que referencia
  // a este usuario (pedidos, ventas, gastos, tareas, etc.)
  const { error: banError } = await adminClient.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  if (banError) { console.error(banError); return NextResponse.json({ error: 'No se pudo eliminar el usuario' }, { status: 400 }) }

  const { error } = await adminClient.from('profiles').update({ estado: 'eliminado' }).eq('id', id)
  if (error) { console.error(error); return NextResponse.json({ error: 'No se pudo eliminar el usuario' }, { status: 400 }) }

  return NextResponse.json({ ok: true })
}
