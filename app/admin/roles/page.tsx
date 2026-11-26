export const dynamic = 'force-dynamic'

import { IconShield } from '@tabler/icons-react'
import { cargarAcceso } from '@/lib/permisos/servidor'
import SinGestion from '@/components/permisos/SinGestion'
import { puede } from '@/lib/permisos/acceso'
import { ACCIONES, esArea, type Area } from '@/lib/permisos/catalogo'
import RolesClient, { type RolEditable } from './RolesClient'

export const metadata = { title: 'Roles | YA! Chipacitos' }

export default async function RolesPage() {
  const { supabase, acceso } = await cargarAcceso()
  if (!puede(acceso, ACCIONES.gestionarUsuarios)) return <SinGestion icono={IconShield} titulo="Roles" />

  const [{ data: roles }, { data: perfiles }, { data: areas }, { data: permisos }] = await Promise.all([
    supabase.from('roles').select('*').order('created_at'),
    supabase.from('profiles').select('id, nombre, rol').eq('estado', 'activo').order('nombre'),
    supabase.from('rol_areas').select('rol_key, area'),
    supabase.from('rol_permisos').select('rol_key, permiso'),
  ])

  const lista: RolEditable[] = (roles ?? []).map(r => ({
    key: r.key,
    nombre: r.nombre,
    color: r.color,
    es_sistema: r.es_sistema,
    areas: (areas ?? []).filter(a => a.rol_key === r.key).map(a => a.area).filter(esArea) as Area[],
    permisos: (permisos ?? []).filter(p => p.rol_key === r.key).map(p => p.permiso),
    personas: (perfiles ?? []).filter(p => p.rol === r.key).map(p => p.nombre),
  }))

  return <RolesClient rolesIniciales={lista} puedeGestionar={puede(acceso, ACCIONES.gestionarUsuarios)} />
}
