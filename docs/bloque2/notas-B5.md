# B5 — Avisos y tablero de compras: notas de la ejecución

Rama `bloque2/pedidos` (sale de `qa` @ `a327cd9`). Spec: `docs/bloque2/plan-B5.md`. Decisiones D1–D8: las recomendadas de §13 (agrupados, una vez por episodio con `repetir_dias`, "≈" a `precio_ref` sin IVA solo admin, stock bajo con pedido abierto no avisa, destinatarios de §4.2, cron `0 10 * * *`, 3/3/7 días todo prendido, pantalla en Compras › Avisos solo admin).

## Qué quedó

- **SQL:** `supabase/migrations/20261006170000_compras_avisos_tablero.sql`, todo §3. Aplicada **solo en dev**. No redefine nada de otra fase (`git diff` de `supabase/migrations` = un archivo nuevo).
  - Seed de 9 claves en `compras_config` (`on conflict do nothing`).
  - `compras_avisos_enviados` (el "ya avisé", `unique (tipo, entidad_id)`, `huella`) y `compras_avisos_corridas` (log). Lectura solo admin; sin políticas de escritura.
  - Helpers internos `_compras_config_num/_bool` (un valor que no castea cae en el default) y los 6 de §3.4, más `_compras_avisos_candidatos` (los arma con los umbrales de la config). Todos revocados a `public, anon, authenticated`.
  - `compras_avisos_tomar(p_tipos, p_pedido_id)`: advisory lock, rearme, toma con `on conflict … where` y devuelve solo lo que hay que avisar. Solo `service_role`.
  - `compras_tablero_resumen()`: un `jsonb` de agregados; los campos de admin vienen en `null` desde la base para el resto; `42501` sin compras.
- **Escenarios:** `docs/bloque2/escenarios-B5.sql` (S1–S20 + S22 ledger).
- **Lógica pura:** `lib/compras/avisos.ts` (textos, `destinatariosDe`, `resumenCorrida`, `leerConfigAvisos`) + `_check_avisos.ts`; `rutas.ts` (`AlertaPedidos`, `rutaPedidosAlerta`, `rutaStockBajo`); `estadoPedido.ts` (`estaDemorado`/`proximaAccion` con `diasDemora` opcional, `coincideAlerta`; se borró el `TODO(config)`) + casos en `_check_estado.ts`.
- **Servidor:** `lib/compras/avisosServidor.ts` (`correrAvisos`, `avisarRemitoListo`); `app/api/cron/avisos-compras/route.ts`; `vercel.json` (un cron nuevo, el de tareas igual); `after()` en `guardarRemito` (`app/admin/compras/pedidos/remitos/acciones.ts`).
- **Pantallas:**
  - Compras › Avisos: `app/admin/compras/avisos/{page,AvisosClient,acciones}.tsx`; módulo `compras-avisos` (soloAdmin) en `lib/modulos.tsx`.
  - Dashboard: `app/admin/dashboard/TableroCompras.tsx` (nuevo) + `page.tsx`.
  - Pedidos: `?alerta=` con chip y vacío propio (`PedidosClient`), `diasDemora` en `page`, `modelo`, `PedidoDetalle`.
  - Proveedores: `diasDemora` en `page` → `ProveedoresClient` → `ProveedorFicha` → `FichaPaneles`.
  - Stock: `?bajo=1` (`page`, `StockClient`).
- **Docs:** `ARQUITECTURA.md` (cron y endpoint nuevos).

## Verificación

- **Escenarios SQL:**
  - Lote `begin; migración + escenarios; rollback` antes del push: S1–S20 `ok`, S22 (ledger) **0**, `to_regclass` limpio después.
  - Después del push, el lote solo (sin la migración), revertido: `TODOS_OK`, ledger 0. (S13 se ajustó para borrar dentro del lote un "ya avisé" que había dejado la QA: ver Desvíos.)
  - S11 (réplica de `espera_nota_credito` sobre las 7 devoluciones de dev): `except` vacío en los dos sentidos.
  - S12: `por_facturar` y `demorados` del tablero = los de las reglas de la pantalla (3 y 11 en el lote). En el navegador, cada KPI coincidió con el número de su lista (abajo).
  - S15: `deuda_pendiente`/`deuda_a_favor` = `estadoPago`/`resumirPagos` aplicados sobre `v_compras_facturas` (326.282,55 / 0 en el lote).
  - S21 (concurrencia, después del push, revertido): dos `db query` simultáneos; la segunda **esperó 5,0 s** el advisory lock. Que la segunda no repita lo cubre S5 en secuencia.
  - Invariante del ledger en dev después de la QA: **0**.
- **Checks puros:** `_check_avisos` 47 casos OK, `_check_estado` 66 OK; el resto de `lib/compras/_check_*` sin cambios y OK.
- **`tsc --noEmit`**, **eslint** de todo lo tocado y **`npm run build`**: limpios.
- **Cron en local** (:3006, `CRON_SECRET` de prueba en el `.env.local` del worktree, nunca impreso):
  - sin header → 401; `Bearer otra-cosa` → 401;
  - sin `CRON_SECRET` → 503 "Cron sin configurar" (hubo que comentar la línea del `.env.local`: Next pisa una variable vacía del proceso con la del archivo);
  - con el secret → 200: "Se avisaron 3 pedidos listos para facturar, 10 pedidos demorados, 1 pedido con diferencias y 1 insumo bajo el mínimo"; fila `origen = cron` en `compras_avisos_corridas`; en la campanita de `qa-admin`, agrupados ("🚚 10 pedidos demorados" → `?alerta=demorados`);
  - repetido enseguida → 200, "No había nada nuevo para avisar";
  - `/api/entorno` del mismo server: `refCliente = fafckqysyvtlslfnpzrh`.

### QA en el navegador (local :3006 contra dev)

1. **Dashboard admin:** las 7 tarjetas. Cada una abre su lista con el mismo número: Por recibir 12 = 12 filas con chip, Demorados 10 = 10, Diferencias 1 = 1, NC 0 = vacío "No hay pedidos esperando nota de crédito", Por facturar 3 = 3, Bajo el mínimo 4 = Stock con el chip prendido y 4 filas.
2. **Compras › Avisos:** las 5 filas con interruptor, días y "Lo reciben"; Guardar sin tocar → "No había cambios"; 0 y 100 → "Entre 1 y 60" en el campo; guardar → "Avisos guardados"; "Revisar ahora" → toast con el resumen; "Última revisión" y "Avisos recientes" con links.
3. **`pedidos.dias_demora`:** con 13 días (P-0025 tiene 12), Demorados pasó de 10 a 9 en el dashboard y en la lista; la ficha de GLOBAL dejó de marcar en ámbar a P-0025 (P-0019, 33 días, sigue en ámbar). Vuelto a 3.
4. **Stock bajo:** Ananá (kg) con mínimo 5 → "Revisar ahora" avisó "📉 Stock bajo el mínimo · Ananá (kg): 0 (mínimo 5)…" a admins y a quienes tienen Pedidos o Stock. Con el aviso apagado no avisó; prendido de nuevo, sí. Mínimo vuelto a 0.
5. **Remito:** como `qa-squad`, el remito que completa P-0103 → `qa-admin` recibió "📦 Listo para facturar · P-0103 de GLOBAL…" en la campanita; tocarlo abrió P-0103. Corrida `origen = remito` registrada. `qa-squad` no lo recibe (no es admin).
6. **Dashboard `qa-squad`** (con el módulo dashboard puesto un rato): 4 tarjetas, sin montos ni Diferencias/Deuda/NC; sin `compras-stock`, "Bajo el mínimo" queda como texto. `qa-squad` no ve Compras › Avisos y la URL lo rebota.
7. **375 px y tema claro** (iframe de 375 px: el driver no puede cambiar el viewport): dashboard en 2 columnas (158 px c/u), sin scroll horizontal; Avisos sin scroll horizontal de página y con Guardar visible (sticky); tarjetas blancas con texto oscuro en claro. La tabla de "Avisos recientes" scrollea dentro de su contenedor.

### Datos que quedaron en dev

- Migración aplicada y tipos regenerados.
- Pedidos de prueba **P-0103** (recibido, remito R-0103-01, +2 Bolsas de Fécula) y **P-0104** (enviado, 4 Bolsas de Fécula), los dos de GLOBAL, creados como `qa-squad`.
- Avisos en `notificaciones` de las cuentas `qa-*` y de los admins de dev, filas en `compras_avisos_enviados` y `compras_avisos_corridas` (cron, manual y remito).
- `compras_config`: las 9 claves con sus valores iniciales (3/3/7/0, todo prendido).
- `qa-squad`: módulos como estaban (se le puso `dashboard` y se le sacó `compras-stock` un rato, ya restaurado).
- El `.env.local` del worktree tiene un `CRON_SECRET` de prueba (`test-b5-…`), no el original.

## Desvíos y decisiones de ejecución

- **`import 'server-only'`** en `avisosServidor.ts`: no se puso. El paquete no está instalado y no agregué dependencias; el archivo usa el service role igual que `lib/push/sendPush.ts`, que tampoco lo tiene. Solo lo importan la ruta del cron y server actions.
- **`_compras_avisos_candidatos`** (helper interno extra): junta los 5 tipos con sus umbrales; `compras_avisos_tomar` lo materializa en un `jsonb` y lo usa para el rearme y la toma. Mismo resultado que el CTE por tipo de §3.5.
- **Huella nueva = episodio nuevo:** al cambiar la huella, `envios` vuelve a 1 y `primer_aviso_en` a `now()`, así un reenvío no sale como "(sigue)".
- **`stock_bajo` con `p_pedido_id`:** no se acota ni en candidatos ni en el rearme (la spec dice "no aplica").
- **"(sigue)"** solo si **todo** lo agrupado de ese tipo es repetido; si se mezcla con algo nuevo, título normal.
- **Resumen:** "Se avisó 1 …" en singular (la QA mostró "Se avisaron 1 insumo").
- **`resultado` de la corrida:** `candidatos` = lo que tomó la corrida (lo nuevo); `avisados` = lo mismo si había a quién, 0 si no. El total que muestra "Última revisión" es la suma de `candidatos`.
- **Cron:** responde 500 (no 200) si `correrAvisos` registró un error; `verificarEntornoServidor()` va en `try` porque en producción tira.
- **Tablero:** "Demorados" dice "Enviados hace N días o más" (la regla es ≥ N; "más de N" era incorrecto). "Por recibir" pone "N demorados" en ámbar. "Bajo el mínimo" y "NC/Diferencias" con borde ámbar si hay algo que hacer.
- **Escenarios:** S7 hace que el pedido deje de ser candidato cambiando `enviado_en` (un `cerrado_manual` directo choca con el check `compras_pedidos_cierre_manual_con_motivo`). S14 sube el stock con `compras_ajustar_stock` (respeta el ledger). S13 borra dentro del lote cualquier "ya avisé" previo de los insumos que usa.
- **QA en el navegador:** el driver no deja cambiar el viewport ni hacer foco en algunos inputs. El remito **parcial** (P-0104) se verificó por SQL revertido como `qa-squad`: queda `parcial` y `tomar(['remito_listo'], pedido)` devuelve 0. El remito completo sí se cargó desde la UI.
- **Dev server:** había uno viejo de este worktree en :3006 (de B4) con otro `.env`; lo bajé y levanté uno nuevo.

## Para el coordinador

- **Dueños nuevos (B5):** `compras_avisos_enviados`, `compras_avisos_corridas`, `compras_avisos_tomar`, `compras_tablero_resumen`, `_compras_config_num/_bool`, `_compras_pedidos_por_recibir/_demorados/_por_facturar/_con_diferencias`, `_compras_devoluciones_esperan_nc`, `_compras_insumos_bajo_minimo`, `_compras_avisos_candidatos`; claves `avisos.*` y `pedidos.dias_demora`.
- **Réplicas a mantener:** `espera_nota_credito` (v_compras_devoluciones) ↔ `_compras_devoluciones_esperan_nc` (correr S11 si A4 la toca); `filtroDelPedido`/`estaDemorado`/`hayDiferencias` ↔ helpers (a)–(d); `estadoPago`/`resumirPagos` ↔ deuda del tablero.
- **`lib/modulos.tsx`:** suma `compras-avisos` (soloAdmin, sección Compras).
- **Archivos compartidos tocados:** `estadoPedido.ts` (parámetro opcional, no rompe), `PedidosClient.tsx`, `modelo.ts` (parámetro opcional al final de `armarVistas`), `PedidoDetalle.tsx`, `FichaPaneles.tsx`/`ProveedorFicha.tsx`/`ProveedoresClient.tsx`, `StockClient.tsx` (estado inicial del toggle), `remitos/acciones.ts`.
- **Release:** el primer cron de prod manda a los admins el atraso acumulado, agrupado (≤ 5 avisos por persona). Antes de mergear a `main`, verificar `CRON_SECRET` de Production ≥ 16 caracteres. Al día siguiente, mirar "Última revisión" en Compras › Avisos.
- **Para F9:** `Bearer undefined` en `recordatorios-tareas`; mover el resto de `compras_config` a Avisos; purga de `compras_avisos_corridas`.

## Lista de pruebas para el usuario

En **https://qa.yachipacitos.com.ar**, una vez mergeado B5 a `qa`, con `qa-admin@chipacitos.test` salvo donde se indica.

> En QA el aviso automático diario **no corre** (Vercel solo corre los crons en producción). Para ver los avisos de demorados, diferencias, nota de crédito y stock, usá **Compras › Avisos › Revisar ahora**. "Listo para facturar" sí llega solo.

1. **Compras › Avisos** (menú Compras).
   - Ves 5 avisos, cada uno con su interruptor, los días donde corresponde y quién lo recibe.
   - Cambiá "Pedido demorado" a 5 días y tocá **Guardar**: aparece "Avisos guardados". Tocá Guardar sin cambiar nada: "No había cambios".
   - Poné 0 o 100 días: el campo marca "Entre 1 y 60" y no guarda.
2. **Revisar ahora.**
   - Esperado: un toast "Se avisaron …" y, en la campanita, avisos **agrupados** (por ejemplo "🚚 N pedidos demorados"). Tocá uno agrupado: abre Pedidos con un chip arriba ("Demorados · N") y la misma cantidad de filas. La ✕ del chip lo saca.
   - Tocá Revisar ahora otra vez: "No había nada nuevo para avisar".
3. **Listo para facturar.**
   - Con `qa-squad`, cargá el remito que completa un pedido enviado.
   - Con `qa-admin`, en la campanita aparece "📦 Listo para facturar · P-…". Tocalo: abre ese pedido.
   - Un remito parcial no avisa. Si lo cargás vos como admin, no te avisás a vos mismo.
4. **Demorado.** Volvé "Pedido demorado" a 3 días. En el Dashboard, "Demorados" y la lista que abre muestran el mismo número; en Pedidos esos pedidos tienen el relojito, y en la ficha del proveedor (pestaña Pedidos) el "enviado hace N días" en ámbar. Con un número de días más grande que la antigüedad de alguno, ese deja de contar en las tres pantallas.
5. **Diferencias y nota de crédito.** Poné los días de esos dos avisos en 1 y tocá Revisar ahora. Si hay pedidos con diferencias o devoluciones esperando NC desde hace más de 1 día, llegan "⚖️ Diferencias sin resolver" y "🧾 Falta la nota de crédito". El de la NC abre el pedido con la devolución resaltada. Volvelos a 3 y 7.
6. **Stock bajo el mínimo.** En Insumos, subile el mínimo a uno que no esté en ningún pedido abierto y tocá Revisar ahora: llega "📉 Stock bajo el mínimo", que abre su ficha en Stock. Volvé el mínimo a como estaba.
7. **Apagar.** Apagá "Stock bajo el mínimo", guardá, subí el mínimo de otro insumo y tocá Revisar ahora: no avisa. Prendelo de nuevo y volvé el mínimo.
8. **Dashboard.**
   - Arriba siguen las métricas de siempre; abajo, "Compras" con Por recibir, Demorados, Recibidos sin facturar (≈ $, a precio de referencia y sin IVA), Diferencias, Deuda con proveedores, NC pendientes y Bajo el mínimo.
   - Tocá cada una: la lista que abre tiene el mismo número (Bajo el mínimo abre Stock con "Bajo el mínimo" prendido; Deuda abre Gastos › Pendientes de pago).
   - Deuda (+ "A favor" si aparece) tiene que cuadrar con Reportes › Gasto por proveedor en "Todo" (Pendiente + A favor).
9. **Con `qa-squad`.** No ve Compras › Avisos en el menú (y la URL lo rebota). Si tiene el Dashboard, ve solo Por recibir, Demorados, Recibidos sin facturar (cantidad, sin $) y Bajo el mínimo.
10. **Avisos recientes.** Abajo en Compras › Avisos, la lista de lo avisado con links que abren el pedido, la devolución o el insumo. "Última revisión" dice cuándo y si fue manual.
11. **Celular (375 px) y tema claro.** Dashboard con las tarjetas de Compras en 2 columnas, sin scroll horizontal. En Avisos, el botón Guardar queda visible abajo mientras bajás.
