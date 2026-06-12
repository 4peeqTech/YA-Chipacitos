import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email:        z.string().email('Email inválido'),
  password:     z.string().min(6, 'Mínimo 6 caracteres'),
  nombre:       z.string().min(2, 'Nombre muy corto'),
  rol:          z.enum(['local', 'deposito', 'fabrica', 'admin']),
  local_nombre: z.string().optional(),
})

const PatchSchema = z.union([
  z.object({ id: z.string().uuid(), rol: z.enum(['local', 'deposito', 'fabrica', 'admin']), password: z.undefined(), whatsapp_phone: z.undefined(), whatsapp_apikey: z.undefined() }),
  z.object({ id: z.string().uuid(), password: z.string().min(6), rol: z.undefined(), whatsapp_phone: z.undefined(), whatsapp_apikey: z.undefined() }),
  z.object({ id: z.string().uuid(), whatsapp_phone: z.string().nullable(), whatsapp_apikey: z.string().nullable(), rol: z.undefined(), password: z.undefined() }),
])

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

  const { data: newProfile, error: profileError } = await adminClient
    .from('profiles')
    .insert({ id: newUser.user.id, nombre, rol, local_nombre: local_nombre || null })
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
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { id, rol, password, whatsapp_phone, whatsapp_apikey } = parsed.data as {
    id: string; rol?: string; password?: string; whatsapp_phone?: string | null; whatsapp_apikey?: string | null
  }

  // Evitar que admin se cambie su propio rol
  if (rol && id === user.id) {
    return NextResponse.json({ error: 'No podés cambiar tu propio rol' }, { status: 403 })
  }

  const adminClient = getAdminClient()

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

  // Cambiar rol
  const { error } = await adminClient.from('profiles').update({ rol }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
