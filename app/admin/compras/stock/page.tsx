import { createClientTipado } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PESTANAS_INSUMO } from '@/lib/compras/rutas'
import StockClient, { type ConteoConDiferencias } from './StockClient'

export const metadata = { title: 'Stock | YA! Chipacitos' }

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ insumo?: string; pestana?: string }>
}) {
  const supabase = await createClientTipado()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { insumo, pestana } = await searchParams

  const [{ data: perfil }, { data: items }, { data: stock }, { data: difs }] = await Promise.all([
    supabase.from('profiles').select('rol').eq('id', user.id).single(),
    // A2a: también los archivados (se listan si tienen stock ≠ 0, y su ?insumo= abre la ficha).
    supabase.from('compras_items').select('id, nombre, unidad, stock_minimo, estado, unidad_base, cantidad_por_unidad').order('nombre'),
    supabase.from('v_compras_stock_actual').select('item_id, cantidad, actualizado_en, actualizado_por_nombre'),
    // A1: diferencias de conteo que Compras todavía no aplicó ni ignoró
    // (sin las superadas por un conteo más nuevo: esas no se pueden aplicar).
    supabase
      .from('v_fabrica_conteo_diferencias')
      .select('conteo_id, definicion_nombre, conteo_fecha, conteo_cerrado_en')
      .eq('diferencia_estado', 'pendiente')
      .eq('conteo_estado', 'cerrado')
      .is('superado_por_conteo_id', null),
  ])

  const porConteo = new Map<string, ConteoConDiferencias & { cerradoEn: string }>()
  for (const d of difs ?? []) {
    if (!d.conteo_id) continue
    const actual = porConteo.get(d.conteo_id)
    if (actual) { actual.pendientes++; continue }
    porConteo.set(d.conteo_id, {
      conteoId: d.conteo_id,
      etiqueta: `${d.definicion_nombre ?? 'Conteo'} ${formatearDiaMes(d.conteo_fecha)}`,
      pendientes: 1,
      cerradoEn: d.conteo_cerrado_en ?? '',
    })
  }
  const conteosConDiferencias = [...porConteo.values()]
    .sort((a, b) => b.cerradoEn.localeCompare(a.cerradoEn))
    .map(({ conteoId, etiqueta, pendientes }) => ({ conteoId, etiqueta, pendientes }))

  return (
    <StockClient
      items={items ?? []}
      stock={stock ?? []}
      insumoInicial={insumo}
      pestanaInicial={PESTANAS_INSUMO.find(p => p === pestana) ?? 'stock'}
      esAdmin={perfil?.rol === 'admin'}
      conteosConDiferencias={conteosConDiferencias}
    />
  )
}

function formatearDiaMes(fecha: string | null): string {
  if (!fecha) return ''
  const [, mm, dd] = fecha.split('-')
  return `${dd}/${mm}`
}
