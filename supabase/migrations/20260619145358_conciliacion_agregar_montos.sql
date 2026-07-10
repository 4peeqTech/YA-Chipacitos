ALTER TABLE conciliaciones
  ADD COLUMN IF NOT EXISTS monto_vendido NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_remito  NUMERIC(12,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalcular_conciliacion(p_fecha date, p_local_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM conciliaciones WHERE fecha = p_fecha AND local_id = p_local_id;

  INSERT INTO conciliaciones (fecha, local_id, producto_nombre, vendido, pedido, monto_vendido, monto_remito)
  SELECT
    p_fecha,
    p_local_id,
    producto_nombre,
    COALESCE(SUM(CASE WHEN fuente = 'venta'  THEN cantidad  END), 0)::integer AS vendido,
    COALESCE(SUM(CASE WHEN fuente = 'remito' THEN cantidad  END), 0)::integer AS pedido,
    COALESCE(SUM(CASE WHEN fuente = 'venta'  THEN monto     END), 0) AS monto_vendido,
    COALESCE(SUM(CASE WHEN fuente = 'remito' THEN monto     END), 0) AS monto_remito
  FROM (
    -- Ventas Posberry: cantidad e importe
    SELECT
      COALESCE(pr.nombre, vp.producto_nombre) AS producto_nombre,
      vp.cantidad,
      COALESCE(vp.importe, 0) AS monto,
      'venta' AS fuente
    FROM ventas_posberry vp
    LEFT JOIN producto_mapeos pm ON pm.nombre_posberry = vp.producto_nombre
    LEFT JOIN productos pr ON pr.id = pm.producto_id
    WHERE vp.fecha = p_fecha
      AND vp.local_id = p_local_id

    UNION ALL

    -- Remitos recibidos: cantidad_recibida y valor_total del remito
    SELECT
      pi.producto_nombre,
      COALESCE(pi.cantidad_recibida, pi.cantidad),
      COALESCE(pi.valor_total, 0) AS monto,
      'remito' AS fuente
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE (p.recibido_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = p_fecha
      AND p.local_id = p_local_id
      AND p.estado = 'recibido'
  ) combined
  GROUP BY producto_nombre;
END;
$function$
