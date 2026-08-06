# Pruebas — Módulo Fábrica (Fases 1 a 6)

Guía manual para probar de punta a punta lo construido en
`docs/superpowers/planifiquemos-el-modulo-de-fabrica.md`. Pensada para ir tildando a
medida que se prueba en el navegador, contra el proyecto **dev/test** de Supabase
(`YA! mayorista`, ref `fafckqysyvtlslfnpzrh`) — nunca contra producción.

No reemplaza `npx tsc --noEmit` / `npm run build` / las pruebas de lógica pura con
`npx tsx` (esas ya corrieron limpias al cerrar la Fase 6). Esto es la parte que solo se
puede validar mirando la pantalla: flujos completos, RLS, y que los números cierren.

## 0. Antes de empezar

- Confirmar que `supabase/.temp/project-ref` apunta a `fafckqysyvtlslfnpzrh` (dev/test),
  no a producción, antes de tocar nada: `cat supabase/.temp/project-ref`.
- `npx supabase migration list` — todas las migraciones deben tener `remote` igual a
  `local`. Si alguna quedó sin aplicar, `npx supabase db push` antes de seguir.
- Usuarios de prueba (crear/editar desde `/admin/usuarios`):
  - Uno con **rol `fabrica`** (ej. "Operario Test 1") y otro más si quieres probar que
    el rendimiento por operario distingue a cada uno.
  - Un usuario **admin** (o squad con los módulos `compras-*` habilitados) para el lado
    de Compras.
  - Uno con **rol `local`**, solo para el chequeo de RLS cruzado al final.
- Convenga tener dos sesiones abiertas en paralelo (una como `fabrica`, otra como
  Compras/admin) para ver la notificación y el traspaso de la solicitud sin ida y
  vuelta de logins.

---

## Fase 1 — Parámetros e insumos extendidos

- [ ] `/admin/fabrica-parametros`: revisar/crear sabores, presentaciones (con
      `peso_kg`) y tamaños. Confirmar que las tres tablas maestras funcionan con el
      mismo patrón de `TablaMaestra` que `/admin/cajas`.
- [ ] `/admin/compras/insumos`: abrir un insumo y asignarle categoría, base de
      cálculo, coeficiente e "incluir en conteo". Probar las **tres** bases de cálculo
      (`kg_masa`, `kg_embolsado`, `meta_semanal`) en insumos distintos — las vas a
      necesitar para la Fase 2.
- [ ] ⚠️ Insumos que ya tenían `consumo_por_masa` cargado antes de esta fase: su valor
      quedó en `coeficiente` con **otra unidad** (por kg, no por batch). Revisarlos y
      corregir si hace falta antes de cerrar el primer conteo real.

---

## Fase 2 — Conteo semanal + proyección + cierre

Como usuario `fabrica`:

- [ ] `/fabrica/stock` — abre o retoma el borrador de la semana.
- [ ] Cargar "Kg de masa" y "Kg a embolsar" en el bloque de proyección.
- [ ] Escribir una cantidad en 3 insumos con las 3 bases de cálculo distintas y
      confirmar que el panel de necesidad/sugerido se recalcula en vivo, sin recargar.
- [ ] Confirmar que la fila se pinta en rojo cuando `sugerido > 0`.
- [ ] Probar el filtro **Faltantes / Todos** y el buscador de insumos.
- [ ] Caso borde: dejar la proyección en 0 y confirmar que ningún insumo da sugerido
      negativo (debe quedar en 0, o en lo que falte contra `meta_semanal` si esa es su
      base de cálculo — la proyección en 0 no afecta a esos).
- [ ] Tocar **"Cerrar conteo y pedir a Compras"** → confirmar en el modal → toast
      "Conteo cerrado. Se avisó a Compras."
- [ ] El conteo pasa al Historial (solo lectura); al tocarlo se abre el detalle con
      cantidad contada / necesidad / sugerido por insumo.
- [ ] Reintentar cerrar el mismo conteo (por ejemplo llamando dos veces al RPC) debe
      fallar con "Conteo no encontrado o ya cerrado" — no hay forma de cerrarlo dos
      veces ni de reabrirlo desde la UI.

Del lado de Compras (otra sesión):

- [ ] Si el dispositivo tiene permisos de push habilitados, confirmar que llegó la
      notificación a los usuarios con acceso al módulo `compras-solicitudes`.

---

## Fase 3 — Bandeja de Compras + pedido base

- [ ] `/admin/compras/solicitudes`: la solicitud recién cerrada aparece con tipo
      "complementario" y el conteo de origen a la vista.
- [ ] Editar cantidades, tildar/destildar "incluir" en alguna línea, cambiar el
      proveedor de otra.
- [ ] Tocar **"Generar pedidos"** → confirmar en el modal.
- [ ] Verificar en `/admin/compras/pedidos` que se creó un pedido en borrador **por
      proveedor** con sus líneas incluidas, listo para el flujo de WhatsApp existente.
- [ ] La solicitud usada pasa a estado "convertida" y desaparece de la bandeja de
      abiertas.
- [ ] Con una solicitud de prueba distinta, probar **"Descartar solicitud"** y
      confirmar que pasa a "descartada" sin generar ningún pedido.
- [ ] `/admin/compras/pedido-base`: crear 2-3 líneas, alguna con proveedor distinto al
      que tiene asignado el insumo (debe aceptarlo — es independiente).
- [ ] Tocar **"Generar pedido base"** → aparece en la misma bandeja de solicitudes,
      tipo "base", **sin** conteo de origen. Repetir "Generar pedidos" sobre ella.

---

## Fase 4 — Carga de producción por turno

Como usuario `fabrica`, en `/fabrica/produccion`:

- [ ] Cargar una producción con destino **"Masa a locales"**: escribir fécula y
      confirmar que la masa se precarga sola (`fécula × rendimiento` configurado).
      Editar la masa a mano y confirmar que, después de tocarla, ya no se recalcula
      sola si se cambia la fécula.
- [ ] Cargar otra con destino **"Congelado embolsado"**: elegir tamaño una sola vez,
      agregar 2+ líneas de presentación × sabor × kg.
- [ ] Caso borde: que la suma de las líneas de embolsado difiera bastante de la masa
      cargada — debe aparecer el aviso ámbar, pero el botón de guardar sigue
      habilitado (no bloqueante, a propósito).
- [ ] Probar **"Repetir última carga"**: duplica sabor/destino/fécula/masa/líneas en
      el formulario **sin guardar todavía** — hay que tocar "Guardar" a propósito.
- [ ] Editar una carga ya guardada (ícono lápiz), cambiar algo y guardar — debe
      actualizarse en la lista, no crear una nueva.
- [ ] Eliminar una carga (ícono tacho) — pide confirmación antes de borrar.
- [ ] Cambiar entre turno "Mañana"/"Tarde" y confirmar que la lista de abajo filtra
      por turno.

---

## Fase 5 — Stock de producto terminado

- [ ] `/admin/catalogo`: asignar la terna presentación × sabor × tamaño a un producto
      existente, o crear uno nuevo con **destino `fabrica`** (si no tiene ese destino,
      un pedido interno de ese producto nunca va a tocar el stock de fábrica).
- [ ] Volver a `/fabrica/produccion` y cargar un embolsado con esa combinación exacta.
- [ ] `/fabrica/stock-terminado`: el producto aparece con el kg cargado, su
      equivalente en bultos (`cantidad_kg / peso_kg`), y el movimiento "Producción" en
      el historial.
- [ ] Como `local` (o pidiéndole a alguien con el rol), hacer un pedido interno de ese
      producto con destino fábrica y marcarlo **enviado** — confirmar que
      `/fabrica/stock-terminado` descuenta `cantidad × peso_kg` con movimiento "Salida
      a pedido".
- [ ] Cargar el remito de recepción con una cantidad **distinta** a la pedida —
      confirmar el movimiento "Ajuste por remito" con la diferencia en el sentido
      correcto (llegó menos → se devuelve stock; llegó más → se resta de más).
- [ ] Probar **"Ajustar stock"** manual (positivo y negativo) — queda como "Ajuste
      manual" en el historial.
- [ ] Cuenta final a mano: `stock terminado = producido − enviado ± ajustes`, debe
      coincidir con la suma de los movimientos listados para ese producto.

---

## Fase 6 — Reportes

`/fabrica/reportes`:

- [ ] Pestaña **Producción**: alternar Día / Turno / Operario / Sabor — los totales de
      masa/fécula tienen que coincidir con lo cargado en la Fase 4.
- [ ] Pestaña **Embolsado**: el total por presentación coincide con lo embolsado.
- [ ] Pestaña **Rendimiento**: cargar 2 producciones del mismo operario con
      rendimientos distintos (por ejemplo 30kg fécula → 76kg masa, y 10kg fécula →
      20kg masa) y confirmar que el número mostrado es
      **masa total / fécula total** de ese operario (40kg/40kg = 1.0×), no el promedio
      simple de los dos rendimientos individuales (2.53× y 2.0×).
- [ ] Pestaña **Cumplimiento**: cruza el conteo cerrado en la Fase 2 contra lo
      producido en su ventana `semana_desde`–`semana_hasta`. Confirmar el color/ícono:
      verde ≥90%, ámbar 70-89%, rojo <70%, "Sin proyección" si la meta era 0.
- [ ] Filtros de fecha (Mes actual / Mes anterior / Personalizado): deben filtrar
      Producción y Embolsado. Cumplimiento **no** se recorta por el filtro — muestra
      la semana completa del conteo aunque el filtro tape parte de ella (manda la
      ventana del conteo, no el selector de fecha).

`/admin/compras/reportes` → pestaña **"Sugerido vs. comprado"**:

- [ ] Aparece la semana del conteo de la Fase 2 (y/o "Pedido base") con el sugerido
      del cierre contra lo realmente comprado, según lo que quedó ajustado en la
      Fase 3 al generar los pedidos.
- [ ] Un pedido armado a mano fuera del circuito de solicitudes **no** debe sumar acá
      (solo cuenta lo que nació de una solicitud).

---

## Chequeo cruzado de RLS — el único perímetro real

Con el usuario `local` (o cualquier rol sin acceso a fábrica/compras):

- [ ] Entrar por URL directa a `/fabrica/stock`, `/fabrica/produccion`,
      `/fabrica/stock-terminado` y `/fabrica/reportes` — debe redirigir a `/login`
      (el layout de `/fabrica` rechaza cualquier rol que no sea `fabrica`/`admin`).
- [ ] Con esa sesión ya logueada, desde la consola del navegador, pedir directo a
      Supabase (`fabrica_conteos`, `fabrica_producciones`, `fabrica_stock_terminado`)
      — tiene que volver vacío por RLS, no por el proxy/layout.
- [ ] Con un usuario `fabrica`, confirmar que puede leer `profiles.nombre` de otro
      operario (lo necesita la pestaña Rendimiento) pero la policy nueva es **solo
      lectura** — no debería poder cambiarle el rol a nadie desde ahí.

---

## Ya verificado (no hace falta repetir a mano)

- [x] `npx tsc --noEmit` sin errores.
- [x] `npm run build` sin errores.
- [x] Lógica pura de `lib/fabrica/reportes.ts` y `lib/compras/reportes.ts` verificada
      con `npx tsx` contra casos borde (coeficiente nulo, proyección/fécula en 0,
      ventanas de fecha).
- [x] Migración de la Fase 6 (`20260806100000_fabrica_fase6_reportes.sql`) aplicada
      al proyecto dev/test.

## Al terminar

No mergear `dev` → `main` ni migrar a producción hasta indicarlo explícitamente.

## Bugs encontrados

_(agregar acá a medida que se prueba, con pasos para reproducir)_
