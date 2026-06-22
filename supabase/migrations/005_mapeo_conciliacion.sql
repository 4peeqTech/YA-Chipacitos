-- ================================================
-- Tabla de mapeos de productos Posberry → Sistema
-- ================================================
CREATE TABLE IF NOT EXISTS producto_mapeos (
  id uuid primary key default gen_random_uuid(),
  nombre_posberry text not null unique,
  producto_id uuid references productos(id) on delete set null,
  ignorado boolean default false,
  created_at timestamptz default now()
);

-- RLS para producto_mapeos
ALTER TABLE producto_mapeos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin maneja mapeos" ON producto_mapeos
  FOR ALL USING (
    (SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ================================================
-- Función actualizada que agrupa por producto mapeado
-- ================================================
CREATE OR REPLACE FUNCTION recalcular_conciliacion(p_fecha date, p_local_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM conciliaciones
  WHERE fecha = p_fecha AND local_id = p_local_id;

  INSERT INTO conciliaciones (fecha, local_id, producto_nombre, vendido, pedido)
  SELECT
    p_fecha,
    p_local_id,
    COALESCE(prod.nombre, combined.producto_nombre) as producto_nombre,
    COALESCE(SUM(CASE WHEN fuente = 'venta' THEN cantidad END), 0) as vendido,
    COALESCE(SUM(CASE WHEN fuente = 'pedido' THEN cantidad END), 0) as pedido
  FROM (
    -- Ventas de Posberry
    SELECT
      vp.producto_nombre,
      vp.cantidad,
      'venta' as fuente,
      pm.producto_id
    FROM ventas_posberry vp
    LEFT JOIN producto_mapeos pm ON vp.producto_nombre = pm.nombre_posberry
    WHERE vp.fecha = p_fecha AND vp.local_id = p_local_id

    UNION ALL

    -- Items de pedidos
    SELECT
      pi.producto_nombre,
      pi.cantidad,
      'pedido' as fuente,
      pm.producto_id
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    LEFT JOIN producto_mapeos pm ON pi.producto_nombre = pm.nombre_posberry
    WHERE DATE(p.created_at) = p_fecha AND p.local_id = p_local_id
  ) combined
  LEFT JOIN productos prod ON combined.producto_id = prod.id
  GROUP BY COALESCE(prod.nombre, combined.producto_nombre);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
