'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { createClientTipado } from '@/lib/supabase/server'
import { ok, fallo, type Resultado } from '@/lib/acciones'
import { TIPOS, UNIDADES, SISTEMAS } from '@/lib/nomenclador/tipos'

// El nomenclador escribe solo por RPC: la autorización (tiene_acceso_nomenclador)
// y las reglas (código, tipos, ciclos, archivado) las hace la base. Acá se
// valida la forma para responder rápido y en castellano.

const id = z.uuid({ message: 'Falta un dato. Recargá la página.' })
const idOpcional = z.uuid().nullable()

function primerError(e: z.ZodError, porDefecto: string) {
  return e.issues[0]?.message ?? porDefecto
}

const DatosItem = z.object({
  tipo: z.enum(TIPOS, { message: 'Elegí un tipo de ítem.' }),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(160, 'El nombre es demasiado largo.'),
  nombresAlternativos: z.array(z.string().trim().max(160)).max(40),
  categoriaId: idOpcional,
  saborId: idOpcional,
  presentacionId: idOpcional,
  varianteDe: idOpcional,
  unidadBase: z.enum(UNIDADES).nullable(),
  notas: z.string().trim().max(2000, 'Las notas son demasiado largas.').nullable(),
})

export async function guardarItem(entrada: { itemId: string | null; datos: z.input<typeof DatosItem> }): Promise<Resultado<{ id: string; codigo: string }>> {
  const parsed = DatosItem.safeParse(entrada.datos)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los datos del ítem.'))
  if (entrada.itemId && !id.safeParse(entrada.itemId).success) return fallo(null, 'No encontramos el ítem. Recargá la página.')
  const d = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('nomenclador_guardar_item', {
      p_item_id: entrada.itemId ?? undefined,
      p_datos: {
        tipo: d.tipo,
        nombre: d.nombre,
        nombres_alternativos: d.nombresAlternativos.filter(Boolean),
        categoria_id: d.categoriaId,
        sabor_id: d.saborId,
        presentacion_id: d.presentacionId,
        variante_de: d.varianteDe,
        unidad_base: d.unidadBase,
        notas: d.notas || null,
      },
    })
    refresh()
    if (error) return fallo(error, 'No se pudo guardar el ítem.')
    const res = z.object({ id: z.string(), codigo: z.string() }).safeParse(data)
    if (!res.success) return fallo(null, 'Se guardó, pero no pudimos leer la respuesta. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el ítem.')
  }
}

export async function archivarItem(entrada: { itemId: string; archivar: boolean }): Promise<Resultado<null>> {
  if (!id.safeParse(entrada.itemId).success) return fallo(null, 'No encontramos el ítem. Recargá la página.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('nomenclador_archivar_item', {
      p_item_id: entrada.itemId, p_archivar: entrada.archivar,
    })
    refresh()
    if (error) return fallo(error, entrada.archivar ? 'No se pudo archivar.' : 'No se pudo reactivar.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo guardar el cambio.')
  }
}

export async function marcarRevisado(entrada: { ids: string[]; revisado: boolean }): Promise<Resultado<number>> {
  const parsed = z.array(id).min(1).max(1000).safeParse(entrada.ids)
  if (!parsed.success) return fallo(null, 'No hay ítems para marcar.')
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('nomenclador_marcar_revisado', {
      p_ids: parsed.data, p_revisado: entrada.revisado,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo marcar.')
    return ok(typeof data === 'number' ? data : 0)
  } catch (e) {
    return fallo(e, 'No se pudo marcar.')
  }
}

export async function asignarExterno(entrada: { externoId: string; itemId: string | null }): Promise<Resultado<null>> {
  if (!id.safeParse(entrada.externoId).success || (entrada.itemId && !id.safeParse(entrada.itemId).success)) {
    return fallo(null, 'Falta un dato. Recargá la página.')
  }
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('nomenclador_asignar_externo', {
      p_externo_id: entrada.externoId, p_item_id: entrada.itemId as string,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo asignar el código.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo asignar el código.')
  }
}

const NuevoExterno = z.object({
  sistema: z.enum(SISTEMAS, { message: 'Elegí Posberry o Fudo.' }),
  codigo: z.string().trim().min(1, 'El código es obligatorio.').max(40, 'El código es demasiado largo.'),
  nombre: z.string().trim().max(200, 'El nombre es demasiado largo.'),
  itemId: idOpcional,
})

export async function crearExterno(entrada: z.input<typeof NuevoExterno>): Promise<Resultado<null>> {
  const parsed = NuevoExterno.safeParse(entrada)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los datos del código.'))
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('nomenclador_guardar_externo', {
      p_datos: {
        sistema: parsed.data.sistema, codigo: parsed.data.codigo,
        nombre: parsed.data.nombre, item_id: parsed.data.itemId,
      },
    })
    refresh()
    if (error) return fallo(error, 'No se pudo crear el código.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo crear el código.')
  }
}

const Parametro = z.object({
  tabla: z.enum(['categoria', 'sabor', 'presentacion']),
  id: idOpcional,
  datos: z.object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'El nombre es demasiado largo.'),
    tipo: z.enum(TIPOS).nullable().optional(),
    nombresAlternativos: z.array(z.string().trim().max(120)).max(40).optional(),
    cantidad: z.number().finite().gt(0, 'La cantidad tiene que ser mayor a 0.').nullable().optional(),
    unidad: z.enum(UNIDADES).nullable().optional(),
    orden: z.number().int().optional(),
    activo: z.boolean().optional(),
  }),
})

export async function guardarParametro(entrada: z.input<typeof Parametro>): Promise<Resultado<null>> {
  const parsed = Parametro.safeParse(entrada)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los datos.'))
  const { tabla, datos } = parsed.data
  if (tabla === 'presentacion' && (datos.cantidad == null) !== (datos.unidad == null)) {
    return fallo(null, 'La cantidad y la unidad van juntas: completá las dos o ninguna.')
  }
  const p: Record<string, unknown> = { nombre: datos.nombre }
  if (datos.tipo !== undefined) p.tipo = datos.tipo
  if (datos.nombresAlternativos !== undefined) p.nombres_alternativos = datos.nombresAlternativos.filter(Boolean)
  if (datos.cantidad !== undefined) p.cantidad = datos.cantidad
  if (datos.unidad !== undefined) p.unidad = datos.unidad
  if (datos.orden !== undefined) p.orden = datos.orden
  if (datos.activo !== undefined) p.activo = datos.activo
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('nomenclador_guardar_parametro', {
      p_tabla: tabla, p_id: parsed.data.id ?? undefined, p_datos: p as never,
    })
    refresh()
    if (error) return fallo(error, 'No se pudo guardar.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo guardar.')
  }
}

const Componente = z.object({
  componenteId: z.uuid({ message: 'Elegí el ítem de cada componente.' }),
  cantidad: z.number().finite().gt(0, 'Las cantidades tienen que ser mayores a 0.').nullable(),
  unidad: z.enum(UNIDADES).nullable(),
  mermaPct: z.number().finite().min(0, 'La merma no puede ser negativa.').lt(100, 'La merma tiene que ser menor a 100%.').nullable(),
  notas: z.string().trim().max(500).nullable(),
})
const Composicion = z.object({
  itemId: id,
  rinde: z.number().finite().gt(0, 'El rendimiento tiene que ser mayor a 0.').nullable(),
  componentes: z.array(Componente).max(100, 'Demasiados componentes.'),
})

// Reemplaza la composición completa. Tipos, ciclos y archivados los valida la base.
export async function guardarComposicion(entrada: z.input<typeof Composicion>): Promise<Resultado<null>> {
  const parsed = Composicion.safeParse(entrada)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los componentes.'))
  const ids = parsed.data.componentes.map(c => c.componenteId)
  if (new Set(ids).size !== ids.length) return fallo(null, 'Hay un componente repetido: juntalos en una sola línea.')
  try {
    const supabase = await createClientTipado()
    const { error } = await supabase.rpc('nomenclador_guardar_componentes', {
      p_item_id: parsed.data.itemId,
      p_rinde_cantidad: parsed.data.rinde as number,
      p_componentes: parsed.data.componentes.map(c => ({
        componente_id: c.componenteId, cantidad: c.cantidad, unidad: c.unidad, merma_pct: c.mermaPct, notas: c.notas,
      })),
    })
    refresh()
    if (error) return fallo(error, 'No se pudo guardar la composición.')
    return ok(null)
  } catch (e) {
    return fallo(e, 'No se pudo guardar la composición.')
  }
}

const Generar = z.object({
  nombre: z.string().trim().min(1, 'Escribí el nombre del producto base (ej. "Chipá").').max(80),
  categoriaId: idOpcional,
  unidadBase: z.enum(UNIDADES),
  sabores: z.array(id).min(1, 'Elegí al menos un sabor.'),
  presentaciones: z.array(id).min(1, 'Elegí al menos una presentación.'),
  simular: z.boolean(),
})
const FilaGenerada = z.object({
  accion: z.enum(['crear', 'existe', 'conflicto']),
  tipo: z.string(),
  nombre: z.string(),
  codigo: z.string().optional(),
  id: z.string().optional(),
})
export type FilaGenerador = z.infer<typeof FilaGenerada>

export async function generarVariantes(entrada: z.input<typeof Generar>): Promise<Resultado<FilaGenerador[]>> {
  const parsed = Generar.safeParse(entrada)
  if (!parsed.success) return fallo(null, primerError(parsed.error, 'Revisá los datos del generador.'))
  const d = parsed.data
  try {
    const supabase = await createClientTipado()
    const { data, error } = await supabase.rpc('nomenclador_generar_variantes', {
      p_base: { nombre: d.nombre, categoria_id: d.categoriaId, unidad_base: d.unidadBase },
      p_sabores: d.sabores,
      p_presentaciones: d.presentaciones,
      p_simular: d.simular,
    })
    if (!d.simular) refresh()
    if (error) return fallo(error, 'No se pudieron generar las variantes.')
    const res = z.array(FilaGenerada).safeParse(data)
    if (!res.success) return fallo(null, 'No pudimos leer el resultado. Recargá la página.')
    return ok(res.data)
  } catch (e) {
    return fallo(e, 'No se pudieron generar las variantes.')
  }
}
