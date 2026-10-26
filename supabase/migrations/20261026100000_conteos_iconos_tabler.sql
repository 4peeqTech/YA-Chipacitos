-- Íconos de las definiciones de conteo: de nombres de lucide a nombres de Tabler
-- (la librería de íconos de la app desde el 23-10). El selector
-- (components/ui/IconoPicker.tsx) ahora guarda el nombre del componente de Tabler.
-- El renderer sigue entendiendo los nombres viejos, así que el orden entre esta
-- migración y el código nuevo no importa. Valores que no son de la lista (emoji
-- viejos) quedan como están.
update fabrica_conteo_definiciones
set icono = case icono
  when 'Package'        then 'IconPackage'
  when 'PackageOpen'    then 'IconPackageExport'
  when 'Boxes'          then 'IconBoxMultiple'
  when 'Box'            then 'IconBox'
  when 'Archive'        then 'IconArchive'
  when 'Warehouse'      then 'IconBuildingWarehouse'
  when 'Wheat'          then 'IconWheat'
  when 'Egg'            then 'IconEgg'
  when 'Milk'           then 'IconMilk'
  when 'Cookie'         then 'IconCookie'
  when 'Beef'           then 'IconMeat'
  when 'Fish'           then 'IconFish'
  when 'ShoppingBasket' then 'IconBasket'
  when 'ShoppingCart'   then 'IconShoppingCart'
  when 'ClipboardList'  then 'IconClipboardList'
  when 'Layers'         then 'IconStack2'
  when 'Scale'          then 'IconScale'
  when 'Droplet'        then 'IconDroplet'
  when 'Flame'          then 'IconFlame'
  when 'Snowflake'      then 'IconSnowflake'
  when 'Utensils'       then 'IconToolsKitchen2'
  when 'Sandwich'       then 'IconBaguette'
  when 'CircleDot'      then 'IconCircleDot'
  when 'Star'           then 'IconStar'
  else icono
end
where icono in (
  'Package', 'PackageOpen', 'Boxes', 'Box', 'Archive', 'Warehouse', 'Wheat', 'Egg', 'Milk', 'Cookie',
  'Beef', 'Fish', 'ShoppingBasket', 'ShoppingCart', 'ClipboardList', 'Layers', 'Scale', 'Droplet',
  'Flame', 'Snowflake', 'Utensils', 'Sandwich', 'CircleDot', 'Star'
);
