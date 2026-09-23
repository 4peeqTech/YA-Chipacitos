# Capturas para el manual y las entregas

Instrucciones para sacar las capturas de `/ayuda` y de las presentaciones de cada hito con Playwright MCP.

## Reglas

- **Siempre contra el entorno de QA**: `https://qa.yachipacitos.com.ar`, que usa la base de dev con datos de prueba. Antes de empezar, abrí `https://qa.yachipacitos.com.ar/api/entorno` y confirmá que `refCliente` sea `fafckqysyvtlslfnpzrh` (dev).
- **Nunca contra producción** (`app.yachipacitos.com.ar`): las capturas quedan en `public/`, que se publica junto con la app, así que no pueden mostrar proveedores, montos ni personas reales.
- Cuentas: las de `docs/qa-credenciales-dev.md`. Usá la del rol que corresponde a la pantalla (admin para Compras, `supervisor_fabrica` para el conteo, etc.), así la captura muestra lo que ve ese usuario.
- **Tema oscuro** (el de por defecto). Si la cuenta tiene el tema claro activado, cambialo antes desde el menú.

## Tamaños

| Uso | Tamaño de ventana |
|---|---|
| Desktop | 1440 × 900 |
| Mobile | 390 × 844 |

Para el manual alcanza con una de las dos por paso: mobile para lo que hacen los operativos (local, depósito, fábrica), desktop para Compras y administración.

## Pasos con Playwright MCP

1. `browser_resize` al tamaño de la tabla.
2. `browser_navigate` a `https://qa.yachipacitos.com.ar/login` e iniciá sesión con la cuenta del rol.
3. Navegá a la pantalla y dejala en el estado que querés mostrar (modal abierto, filtro aplicado, etc.).
4. `browser_take_screenshot` con `filename` apuntando a `public/manual/<seccion>/<nombre>.png`.
   - `<seccion>` es el `slug` de la sección del manual (`compras-remitos`, `fabrica-conteos`…).
   - `<nombre>` describe el paso en minúsculas y con guiones: `lista`, `cargar-remito`, `confirmar-impacto`.
   - Para recortar a un elemento (un modal, una tarjeta), pasá su `ref` del snapshot en vez de sacar la página entera.
5. Revisá la imagen: sin datos reales, sin textos cortados, sin toasts tapando lo importante.

## Usarla en el manual

En el archivo de la sección (`lib/manual/secciones/<seccion>.ts`), agregala al paso:

```ts
{
  texto: 'Tocá **Cargar remito** y elegí el pedido.',
  captura: { src: '/manual/compras-remitos/cargar-remito.png', alt: 'Formulario para cargar un remito con el pedido elegido', ancho: 1440, alto: 900 },
}
```

- `alt` describe lo que se ve, en castellano llano (lo leen los lectores de pantalla y aparece como título al ampliar).
- `ancho` y `alto` son los de la imagen en píxeles.
- Actualizá `actualizado` de la sección y, si es una función nueva, sumá una entrada en `novedades`.

## Usarla en una presentación

En `docs/entregas/H<n>-…-novedades.html`, reemplazá el placeholder de la slide por:

```html
<div class="shot r"><img src="../../public/manual/<seccion>/<nombre>.png" alt="…"></div>
```

Si la presentación se va a mandar como archivo suelto, la imagen tiene que ir embebida (data URI) porque la ruta relativa no viaja con el archivo.
