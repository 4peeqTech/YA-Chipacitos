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
const PatchSchema = z.union([
  z.object({ id: z.string().uuid(), rol: z.string().min(1) }),
  z.object({ id: z.string().uuid(), password: z.string().min(6) }),
  z.object({ id: z.string().uuid(), whatsapp_phone: z.string().nullable(), whatsapp_apikey: z.string().nullable() }),
  z.object({ id: z.string().uuid(), nombre_posberry: z.string().nullable() }),
  z.object({ id: z.string().uuid(), modulos_permitidos: z.array(z.string()) }),
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { email, password, nombre, rol, local_nombre } = parsed.data

  const adminClient = getAdminClient()
  const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !newUser.user) {
    return NextResponse.json({ error: authError?.message || 'Error al crear auth' }, { status: 400 })
  }

  // Squad arranca con acceso a Tareas por defecto — es el módulo base de ese rol.
  const modulosPermitidos = rol === 'squad' ? ['tareas'] : []

  const { data: newProfile, error: profileError } = await adminClient
    .from('profiles')
    .insert({ id: newUser.user.id, nombre, rol, local_nombre: local_nombre || null, modulos_permitidos: modulosPermitidos })
    .select()
    .single()

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ profile: newProfile })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json()
  const adminClient = getAdminClient()

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
  const { id, rol, password, whatsapp_phone, whatsapp_apikey, nombre_posberry, modulos_permitidos } = parsed.data as {
    id: string; rol?: string; password?: string; whatsapp_phone?: string | null; whatsapp_apikey?: string | null; nombre_posberry?: string | null; modulos_permitidos?: string[]
  }

  // Evitar que admin se cambie su propio rol
  if (rol && id === user.id) {
    return NextResponse.json({ error: 'No podés cambiar tu propio rol' }, { status: 403 })
  }

  // Resetear contraseña
  if (password) {
    const { error } = await adminClient.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Configurar WhatsApp
  if (whatsapp_phone !== undefined) {
    const { error } = await adminClient.from('profiles').update({ whatsapp_phone, whatsapp_apikey }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Actualizar nombre_posberry
  if (nombre_posberry !== undefined) {
    const { error } = await adminClient.from('profiles').update({ nombre_posberry }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Actualizar módulos permitidos
  if (modulos_permitidos !== undefined) {
    const { error } = await adminClient.from('profiles').update({ modulos_permitidos }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Cambiar rol
  const { error } = await adminClient.from('profiles').update({ rol }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (profile?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  if (id === user.id) return NextResponse.json({ error: 'No podés eliminarte a vos mismo' }, { status: 403 })

  const adminClient = getAdminClient()

  // Soft delete: se banea el acceso y se marca el perfil como eliminado,
  // pero no se borra nada — así se conserva el historial que referencia
  // a este usuario (pedidos, ventas, gastos, tareas, etc.)
  const { error: banError } = await adminClient.auth.admin.updateUserById(id, { ban_duration: '876000h' })
  if (banError) return NextResponse.json({ error: banError.message }, { status: 400 })

  const { error } = await adminClient.from('profiles').update({ estado: 'eliminado' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
