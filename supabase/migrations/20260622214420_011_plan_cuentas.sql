CREATE TABLE IF NOT EXISTS plan_cuentas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rubro text NOT NULL,
  categoria text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plan_cuentas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plan_cuentas' AND policyname='admin_all') THEN
    CREATE POLICY admin_all ON plan_cuentas FOR ALL TO authenticated
      USING ((SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin')
      WITH CHECK ((SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plan_cuentas' AND policyname='read_all') THEN
    CREATE POLICY read_all ON plan_cuentas FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

INSERT INTO plan_cuentas (rubro, categoria, orden) VALUES
  ('MATERIA PRIMA',          'MATERIA PRIMA',            10),
  ('MATERIA PRIMA',          'LACTEOS / QUESO',           11),
  ('MATERIA PRIMA',          'HUEVOS',                    12),
  ('MATERIA PRIMA',          'HARINA / ALMIDON',          13),
  ('MATERIA PRIMA',          'SAL / CONDIMENTOS',         14),
  ('MATERIA PRIMA',          'FRUTAS',                    15),
  ('MATERIA PRIMA',          'MERCADERIA DE REVENTA',     16),
  ('INSUMOS Y EMBALAJE',     'INSUMOS',                   20),
  ('INSUMOS Y EMBALAJE',     'EMBALAJE / BOLSAS',         21),
  ('INSUMOS Y EMBALAJE',     'ETIQUETAS',                 22),
  ('INSUMOS Y EMBALAJE',     'INSUMOS DE LIMPIEZA',       23),
  ('INSUMOS Y EMBALAJE',     'LIBRERIA / PAPELERIA',      24),
  ('PERSONAL',               'PERSONAL',                  30),
  ('PERSONAL',               'SUELDOS PRODUCCION',        31),
  ('PERSONAL',               'SUELDOS SUCURSAL',          32),
  ('PERSONAL',               'SUELDOS ADMINISTRACION',    33),
  ('PERSONAL',               'CARGAS SOCIALES / SINDICATO',34),
  ('PERSONAL',               'ART / COBERTURA MEDICA',    35),
  ('IMPUESTOS Y CARGAS',     'IMPUESTO NACIONAL',         40),
  ('IMPUESTOS Y CARGAS',     'IMPUESTO PROVINCIAL',       41),
  ('IMPUESTOS Y CARGAS',     'PLAN DE PAGO',              42),
  ('SERVICIOS Y ESTRUCTURA', 'ALQUILER',                  50),
  ('SERVICIOS Y ESTRUCTURA', 'ELECTRICIDAD',              51),
  ('SERVICIOS Y ESTRUCTURA', 'AGUA',                      52),
  ('SERVICIOS Y ESTRUCTURA', 'INTERNET / TELEFONIA',      53),
  ('SERVICIOS Y ESTRUCTURA', 'SISTEMA',                   54),
  ('HONORARIOS',             'CONTADOR',                  60),
  ('HONORARIOS',             'DISEÑO',                    61),
  ('HONORARIOS',             'LEGAL',                     62),
  ('HONORARIOS',             'CONSULTORIA',               63),
  ('LOGISTICA Y RODADOS',    'COMBUSTIBLE',               70),
  ('LOGISTICA Y RODADOS',    'MANTENIMIENTO VEHICULO',    71),
  ('LOGISTICA Y RODADOS',    'FLETE / CORREO',            72),
  ('LOGISTICA Y RODADOS',    'SEGURO VEHICULO',           73),
  ('MOVIMIENTO INTERNO',     NULL,                        80)
ON CONFLICT DO NOTHING;
