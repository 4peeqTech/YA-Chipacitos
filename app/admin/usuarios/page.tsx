export const dynamic = 'force-dynamic'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { IconUsers } from '@tabler/icons-react'
import { cargarAcceso } from '@/lib/permisos/servidor'
import SinGestion from '@/components/permisos/SinGestion'
import { puede } from '@/lib/permisos/acceso'
import { ACCIONES, esArea, type Area } from '@/lib/permisos/catalogo'
import type { Efecto } from '@/lib/permisos/resolver'
import UsuariosClient, { type DatosUsuarios } from './UsuariosClient'

export const metadata = { title: 'Usuarios | YA! Chipacitos' }

export default async function UsuariosPage() {
  const { supabase, acceso } = await cargarAcceso()
  if (!puede(acceso, ACCIONES.gestionarUsuarios)) return <SinGestion icono={IconUsers} titulo="Usuarios" />

  const [
    { data: usuarios }, { data: roles }, { data: rolAreas }, { data: rolPermisos },
    { data: ajustes }, { data: sucursales }, { data: locales }, { data: historial },
  ] = await Promise.all([
    supabase.from('profiles').select('id, nombre, rol, local_nombre, nombre_posberry, created_at')
      .eq('estado', 'activo').order('nombre').limit(500),
    supabase.from('roles').select('key, nombre, color, es_sistema').order('created_at'),
    supabase.from('rol_areas').select('rol_key, area'),
    supabase.from('rol_permisos').select('rol_key, permiso'),
    supabase.from('persona_permisos').select('persona_id, permiso, efecto'),
    supabase.from('persona_sucursales').select('persona_id, local_config_id'),
    supabase.from('locales_config').select('id, sucursal, activo, orden, cuenta_local_id, tiene_fudo').order('orden'),
    supabase.from('permisos_historial').select('id, persona_id, rol_key, cambio, hecho_por, created_at')
      .not('persona_id', 'is', null).order('created_at', { ascending: false }).limit(1000),
  ])

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

  const datos: DatosUsuarios = {
    usuarios: usuarios ?? [],
    roles: (roles ?? []).map(r => ({
      ...r,
      areas: (rolAreas ?? []).filter(a => a.rol_key === r.key).map(a => a.area).filter(esArea) as Area[],
      permisos: (rolPermisos ?? []).filter(p => p.rol_key === r.key).map(p => p.permiso),
    })),
    ajustes: (ajustes ?? []).map(a => ({ ...a, efecto: a.efecto as Efecto })),
    sucursales: sucursales ?? [],
    locales: (locales ?? []).map(l => ({ ...l, activo: l.activo !== false })),
    historial: (historial ?? []).map(h => ({ ...h, cambio: (h.cambio ?? {}) as Record<string, unknown> })),
    emailsById,
  }

  return (
    <UsuariosClient
      datos={datos}
      yo={acceso?.id ?? ''}
      soyAdmin={!!acceso?.esAdmin}
      puedeGestionar={puede(acceso, ACCIONES.gestionarUsuarios)}
    />
  )
}
