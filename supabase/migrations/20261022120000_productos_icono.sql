-- Ícono de cada producto en Pedir (local) y en el Catálogo del mayorista.
-- null = automático: el ícono sale del nombre (masa, queso, jamón...) o de la
-- categoría. Si no, es la clave de un ícono de la lista de la app
-- (lib/pedidos/categorias.ts); una clave que la app no conoce también cae en
-- automático, así que no hace falta atar la lista a un check.
alter table productos add column if not exists icono text;

comment on column productos.icono is
  'Clave del ícono elegido a mano (lib/pedidos/categorias.ts). null = automático según nombre y categoría.';
