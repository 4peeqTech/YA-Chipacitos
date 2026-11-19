import { Shield } from 'lucide-react'
import type { SeccionManual } from '../tipos'

export const usuariosRoles: SeccionManual = {
  slug: 'usuarios-roles',
  titulo: 'Usuarios y roles',
  icono: Shield,
  area: 'administracion',
  roles: ['admin'],
  modulos: ['usuarios', 'roles'],
  resumen: 'Qué trae cada rol, qué tiene distinto cada persona, sus sucursales y quién cambió qué.',
  actualizado: '2026-11-19',
  novedades: [
    { fecha: '2026-11-19', texto: 'Nuevas pantallas de **Roles** y de la **ficha de usuario**: cada rol define áreas, pantallas y acciones, y en la ficha se ajusta lo puntual de cada persona.' },
  ],
  apartados: [
    {
      ancla: 'como-funciona',
      titulo: 'Cómo funciona el acceso',
      bloques: [
        { tipo: 'parrafo', texto: 'Cada persona tiene **un rol**. El rol dice a qué **áreas** entra (Administración, Locales, Fábrica, Depósito, Mayorista) y qué **pantallas** y **acciones** trae. En la ficha de la persona se le puede **agregar** o **quitar** algo puntual sin tocar el rol.' },
        {
          tipo: 'lista',
          items: [
            '**Áreas:** las da solo el rol. Con más de un área, la persona elige en cuál está desde el encabezado.',
            '**Pantallas:** se tildan las de Administración y Tareas. Las de Locales, Fábrica, Depósito y Mayorista vienen con el área.',
            '**Acciones:** lo que no alcanza con tener la pantalla, como **Ver la plata de Compras** o **Gestionar usuarios y roles**.',
            '**Sucursales:** si el rol entra a Locales, cada persona trabaja con las sucursales que tenga elegidas.',
          ],
        },
        { tipo: 'alerta', texto: 'Nadie puede dar lo que no tiene: si no tenés **Ver la plata de Compras**, no se la podés dar a un rol ni a una persona. **Admin** tiene todo y no se edita.' },
      ],
    },
    {
      ancla: 'roles',
      titulo: 'Roles',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Parámetros › Roles** está la lista de roles a la izquierda y, a la derecha, lo que trae el rol elegido. En el celular, tocá un rol para abrirlo y usá **‹ Roles** para volver.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Elegí el rol en la lista.' },
            { texto: 'Tildá sus **áreas**, las **pantallas** de cada sección (o **Todas**) y las **acciones**.' },
            { texto: 'Tocá **Guardar cambios**. Antes de guardar se ve a quién afecta: quién **gana** y quién **pierde** cada cosa.' },
            { texto: 'Confirmá con **Guardar**. Cada persona lo ve la próxima vez que abre la app.' },
          ],
        },
        {
          tipo: 'lista',
          titulo: 'Para tener en cuenta',
          items: [
            'Las pantallas marcadas **solo Admin** (Proveedores, Facturas, Conexión Fudo, Avisos, Pedidos de locales, Que se repiten, Clasificar Fudo y las de Fábrica en Administración) se ven pero no se pueden tildar.',
            '**Facturas y notas de crédito** va junto con **Ver la plata de Compras**: al tildar la primera se tilda la segunda.',
            '**Corregir cargas viejas de Fábrica** aparece cuando el rol tiene el área Fábrica.',
            'Si le sumás **Locales** a un rol, la vista previa avisa quién no tiene sucursal: elegíla en su ficha.',
            'Lo que una persona tiene ajustado en su ficha se respeta aunque cambie el rol.',
            '**Nuevo rol** crea uno vacío; **Cambiar nombre** y el tacho solo están en los roles que no son del sistema (y el tacho, cuando nadie lo tiene).',
          ],
        },
      ],
    },
    {
      ancla: 'ficha',
      titulo: 'Ficha de usuario',
      bloques: [
        { tipo: 'parrafo', texto: 'En **Parámetros › Usuarios**, elegí a la persona en la lista. La ficha muestra su rol, sus áreas, sus sucursales, un tilde por cada pantalla y acción con **lo que tiene hoy**, y el historial.' },
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Para darle o sacarle algo puntual, tildá o destildá. Lo que no coincide con su rol queda marcado **agregada** o **quitada**.' },
            { texto: '**Volver al rol** al lado de una marca deshace ese ajuste.' },
            { texto: 'Para cambiarle el rol, usá **Rol**: los tildes pasan a ser los del rol nuevo.' },
            { texto: 'Tocá **Guardar**.' },
          ],
        },
        { tipo: 'tip', texto: 'Con el lápiz cambiás nombre y email; con la llave, la contraseña; con el tacho, la persona deja de entrar (lo que cargó se conserva).' },
        { tipo: 'alerta', texto: 'No podés cambiar tu propio rol. Solo Admin puede dar o sacar el rol Admin.' },
      ],
    },
    {
      ancla: 'sucursales',
      titulo: 'Sucursales',
      bloques: [
        { tipo: 'parrafo', texto: 'Si el rol entra a **Locales**, la ficha muestra las sucursales para elegir (o **Todas**). **Hay que elegir al menos una**: sin ninguna no se puede guardar.' },
        { tipo: 'parrafo', texto: 'Las **cuentas de local** (rol Local) tienen solo su sucursal y no se cambia desde la ficha. Ahí también está el **Cliente en Posberry** de esa cuenta.' },
      ],
    },
    {
      ancla: 'historial',
      titulo: 'Historial',
      bloques: [
        { tipo: 'parrafo', texto: 'Al pie de la ficha queda cada cambio: cuándo, quién lo hizo y qué ganó o perdió la persona, sea por un cambio en su ficha o en su rol.' },
      ],
    },
    {
      ancla: 'nuevo-usuario',
      titulo: 'Nuevo usuario',
      bloques: [
        {
          tipo: 'pasos',
          pasos: [
            { texto: 'Tocá **Nuevo usuario** y completá email, contraseña, nombre y rol.' },
            { texto: 'Si es una **cuenta de local**, poné el nombre del local: se vincula sola a su sucursal.' },
            { texto: 'Si el rol entra a Locales y no es una cuenta de local, elegí sus sucursales.' },
            { texto: 'Entra con lo que trae su rol. Lo puntual se ajusta después en su ficha.' },
          ],
        },
      ],
    },
  ],
}
