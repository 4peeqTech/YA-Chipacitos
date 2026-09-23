import { mensajeError } from '@/lib/errores'

/**
 * Resultado de una Server Action. Las acciones nunca tiran a través del borde
 * servidor→cliente: devuelven `{ ok: false, error }` con un mensaje ya listo
 * para mostrar en un toast.
 *
 * Este archivo NO lleva 'use server': un archivo 'use server' solo puede
 * exportar funciones async (cada export se vuelve un endpoint POST). Acá viven
 * el tipo y los helpers que usan las acciones.
 *
 * Patrón de una acción (Next 16 — ver node_modules/next/dist/docs/01-app/
 * 01-getting-started/07-mutating-data.md y 03-api-reference/04-functions/refresh.md):
 *
 *   // app/admin/compras/pedidos/acciones.ts
 *   'use server'
 *   import { refresh } from 'next/cache'
 *   import { z } from 'zod'
 *   import { createClientTipado } from '@/lib/supabase/server'
 *   import { ok, fallo, type Resultado } from '@/lib/acciones'
 *
 *   const Entrada = z.object({ pedidoId: z.uuid(), motivo: z.string().trim().min(1) })
 *
 *   export async function cerrarPedido(entrada: z.input<typeof Entrada>): Promise<Resultado<null>> {
 *     const parsed = Entrada.safeParse(entrada)
 *     if (!parsed.success) return fallo(null, 'Revisá los datos del formulario.')
 *     try {
 *       const supabase = await createClientTipado()
 *       // La autorización la hace la RPC (tiene_acceso_compras()/es_admin()):
 *       // las acciones son alcanzables por POST directo, nunca confiar en la UI.
 *       const { error } = await supabase.rpc('compras_cerrar_pedido_manual', {
 *         p_pedido_id: parsed.data.pedidoId, p_motivo: parsed.data.motivo,
 *       })
 *       if (error) return fallo(error, 'No se pudo cerrar el pedido.')
 *       refresh() // refresca el router del cliente; solo se puede llamar dentro de una Server Action
 *       return ok(null)
 *     } catch (e) {
 *       return fallo(e, 'No se pudo cerrar el pedido.')
 *     }
 *   }
 *
 * Desde el cliente: `startTransition(async () => { const r = await cerrarPedido(...);
 * r.ok ? toast.success('…') : toast.error(r.error) })`, con el botón deshabilitado
 * mientras `isPending`.
 */
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): Resultado<T> {
  return { ok: true, data }
}

export function fallo<T = never>(e: unknown, fallback: string): Resultado<T> {
  return { ok: false, error: e == null ? fallback : mensajeError(e, fallback) }
}
