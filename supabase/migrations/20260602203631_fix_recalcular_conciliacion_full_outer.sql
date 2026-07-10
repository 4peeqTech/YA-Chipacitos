CREATE OR REPLACE FUNCTION public.recalcular_conciliacion(p_fecha date, p_local_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM conciliaciones WHERE fecha = p_fecha AND local_id = p_local_id;

  INSERT INTO conciliaciones (fecha, local_id, producto_nombre, vendido, pedido, diferencia, tiene_alerta)
  SELECT
    p_fecha,
    p_local_id,
    producto_nombre,
    COALESCE(SUM(CASE WHEN fuente = 'venta'   THEN cantidad END), 0) AS vendido,
    COALESCE(SUM(CASE WHEN fuente = 'pedido'  THEN cantidad END), 0) AS pedido,
    COALESCE(SUM(CASE WHEN fuente = 'venta'   THEN cantidad END), 0)
      - COALESCE(SUM(CASE WHEN fuente = 'pedido' THEN cantidad END), 0) AS diferencia,
    ABS(
      COALESCE(SUM(CASE WHEN fuente = 'venta'  THEN cantidad END), 0)
      - COALESCE(SUM(CASE WHEN fuente = 'pedido' THEN cantidad END), 0)
    ) > 0 AS tiene_alerta
  FROM (
    -- Ventas Posberry: normalizar nombre vía mapeos si existe
    SELECT
      COALESCE(pr.nombre, vp.producto_nombre) AS producto_nombre,
      vp.cantidad,
      'venta' AS fuente
    FROM ventas_posberry vp
    LEFT JOIN producto_mapeos pm ON pm.nombre_posberry = vp.producto_nombre
    LEFT JOIN productos pr ON pr.id = pm.producto_id
    WHERE vp.fecha = p_fecha AND vp.local_id = p_local_id

    UNION ALL

    -- Pedidos del sistema (todos los estados salvo pendiente)
    SELECT
      pi.producto_nombre,
      pi.cantidad,
      'pedido' AS fuente
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE DATE(p.created_at) = p_fecha
      AND p.local_id = p_local_id
      AND p.estado IN ('preparando', 'enviado', 'recibido')
  ) combined
  GROUP BY producto_nombre;
END;
$$;
