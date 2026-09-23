# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(App web instalable como PWA; se usa en celular y en computadora.)

## Users

- **Dueño / administrador (Marcos, rol `admin`)**: controla compras, gastos, fábrica y reportes, sobre todo desde la computadora. Aprende las funciones nuevas en cada entrega y las prueba en el entorno de QA antes de producción.
- **Operativos no técnicos**, casi siempre en el celular y en medio del trabajo:
  - encargados de **local** (sucursales): piden a fábrica y depósito, confirman recepciones, ven ventas;
  - **depósito**: prepara y despacha pedidos de insumos y packaging;
  - **supervisor de fábrica**: registra producción diaria y hace el conteo semanal de stock;
  - **mayoristas**: hacen pedidos y consultan el catálogo.
- **Colaboradores con rol personalizado** (compras, administración): entran al panel de admin con solo los módulos que se les habilitaron.

## Product Purpose

Sistema de gestión interno de YA! Chipacitos (fábrica de chipá con locales propios y venta mayorista): pedidos entre locales, fábrica y depósito; compras a proveedores (pedidos, remitos, facturas, stock); producción y conteos de fábrica; gastos; conciliación de ventas de Posberry y Fudo. El éxito es que cada rol haga su parte sin llamar por teléfono y que los números (stock, plata) sean confiables.

## Positioning

Hecho a medida sobre el circuito real del negocio (conteo semanal de fábrica → cálculo de compra → pedido por WhatsApp → remito → factura), con las fórmulas del sistema anterior. Lo desarrolla y mantiene 4peeq como consultora.

## Operating Context

- Los operativos usan la app en el celular, en la fábrica, el depósito o el mostrador, con poco tiempo y a veces con las manos ocupadas.
- Los pedidos a proveedores salen como mensaje de WhatsApp armado por la app.
- Cada entrega se presenta a Marcos en una reunión y él la prueba sola en QA (`qa.yachipacitos.com.ar`) siguiendo una guía de prueba.
- El manual (`/ayuda`) se consulta de dos formas: **en el celular, cuando alguien se traba** ("¿Qué hago si…?", búsqueda), y **en la computadora, para aprender lo nuevo** (novedades de cada entrega).

## Capabilities and Constraints

- Next.js 16 + Supabase. Roles: `admin`, `local`, `deposito`, `supervisor_fabrica`, `mayorista`, y roles personalizados con `modulos_permitidos`.
- Tema oscuro por defecto, con tema claro opcional (toggle).
- Todo en castellano rioplatense, segunda persona (vos).
- Hay un widget de tickets (`@4peeqtech/ticket-widget`) para reportar errores o pedir cambios al equipo.

## Brand Commitments

- Nombre: **YA! Chipacitos**. Acento amarillo de marca (`accent`) y tipografía Syne en títulos, ya establecidos en la app.
- Voz: castellano llano, frases cortas, sin jerga técnica (nada de nombres de tablas, rutas ni "ledger"); los botones se nombran exactamente como aparecen en pantalla.

## Evidence on Hand

- Manual actual en `app/ayuda/AyudaClient.tsx` (secciones por rol).
- Resumen de avances para el cliente: `docs/avances-sistema-ya-chipacitos.md`; roadmap para Marcos: `docs/roadmap-marcos.html`.
- Capturas del manual: se sacan del entorno de QA (datos de dev), nunca de producción.

## Product Principles

1. Cada rol ve solo lo suyo: menos opciones, menos errores.
2. Todo lo que mueve stock o plata muestra el impacto antes de confirmar y tiene un camino de vuelta.
3. Lenguaje del negocio, no del sistema.
4. El manual viaja con el código: una función nueva no está terminada sin su sección del manual.

## Accessibility & Inclusion

- Mobile a 375px como caso principal para operativos; objetivos táctiles de 44px o más.
- Usuarios no técnicos: textos cortos, un paso por acción, estados con el mismo color y nombre que en la app.
