-- ================================================
-- Tabla de proveedores
-- ================================================
CREATE TABLE IF NOT EXISTS proveedores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  categoria     text,
  contacto_nombre    text,
  contacto_telefono  text,
  contacto_email     text,
  direccion          text,
  tiempo_entrega     text,
  periodicidad_compra text,
  financiacion       text,
  condiciones_pago   text,
  notas              text,
  estado        text not null default 'activo' check (estado in ('activo', 'archivado')),
  created_at    timestamptz default now()
);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin maneja proveedores" ON proveedores
  FOR ALL USING (
    (SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ================================================
-- Tabla de gastos
-- ================================================
CREATE TABLE IF NOT EXISTS gastos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null default current_date,
  local         text not null,
  rubro         text not null,
  categoria     text not null,
  proveedor_id  uuid references proveedores(id) on delete set null,
  monto         numeric(12,2) not null,
  forma_pago    text not null,
  estado        text not null default 'Pendiente de pago' check (estado in ('Pendiente de pago', 'Pagado', 'Parcial')),
  observaciones text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz default now()
);

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin maneja gastos" ON gastos
  FOR ALL USING (
    (SELECT rol FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ================================================
-- Seed proveedores (lista inicial)
-- ================================================
INSERT INTO proveedores (nombre) VALUES
  ('ABATIDOR'),('ACOR'),('ADAPTADOR DE COMPU'),('ADMINISTRACION'),('AFIP / ARCA'),
  ('AGUA'),('AL S.A'),('ALBAÑIL COCO'),('ALBO DISTRIBUCIONES'),('ALBOR'),
  ('ALMIBAR'),('ALMIBAR AZUCAR'),('ALQUILER'),('ALSA'),('AMERICAN'),
  ('AMERICAN MEDWISE'),('AMOBLAMIENTO'),('ANALISIS DE ALIMENTOS'),('ANIS Y JAMON'),
  ('ARCA'),('AREGLO DEL HORNO'),('ARQUITECTO'),('ARRELGO EXHIBIDORA SUPERMAX'),
  ('ASEGURADORA (R.C)'),('AUTONOMO'),('AUTONOMO RUBEN'),('AZUCAR'),('BALANZA'),
  ('BALET OFICIAL'),('BANNER'),('BANQUETA LA UNIDAD'),('BASIBUSS'),('BEBIDA'),
  ('BIOMATIC'),('BOLSAPLAST'),('BOLSAR'),('BOLSAS BARBIJOS GALLETITA'),
  ('BOLSAS DE PAPEL'),('BOLSAS DE ZIMBA'),('BOMBEROS'),('BOTIQUIN'),
  ('BOULS COLOMBRARO'),('BURLETES'),('CABLE COMPUTADORA'),('CADETE'),
  ('CAJA CHIPANDWICH'),('CAJA DE LOMITO'),('CAJA EGISTRADORA'),('CAJITA FELIZ'),
  ('CAMARAS'),('CAPRIZE'),('CARGADOR BALANZA'),('CARTELERIA'),('CARTUCHOS DE TINTA'),
  ('CAÑERIA FABRICA'),('CELULARES'),('CERRAJERO'),('CERROJO'),('CESPEDES'),
  ('CHIPA SANTA INES'),('CHIPS'),('CHURROS'),('CHURROS TUBO'),('CHUS'),
  ('CHUSTER'),('CHUSTER FIAMBRE QUESOS'),('CHUSTERCITO'),('CINTA DE EMBALAR'),
  ('CINTA PACK ML'),('CM REDES'),('COBERTURA MEDICA (CAIP)'),('COCO RRALLADO OREGANO'),
  ('COLOMBRARO'),('COMBUSTIBLE'),('CONTADOR RUBEN'),('COPIA DE LLAVE'),
  ('CORREA RALLADORA'),('CORRUGADOS'),('CORRUGADOS AVELLANEDA'),('CREDIFIN LOGISTICA'),
  ('CUBIERTA Y LLANTA'),('DEPEC'),('DGR'),('DISCOR'),('DISTRIBUIDORA CLAUDIO'),
  ('DISTRIBUIDORA DEL LITORAL'),('DISTRIBUIDORA MONTECARLO'),('DISTRIGAS'),
  ('DPEC'),('DULCE DE LECHE'),('DUPLA COMRCIAL'),('DW EMBALAJES'),
  ('ELECTRICISTA'),('ELECTRICISTA MARTIN'),('ELECTRON.SRL'),('EMMAPEL'),('EMME'),
  ('ENCOMIENDA'),('ESTUDIO CONTABLE'),('EXPRESO DEMONTE'),('FABIMP'),('FAJAS'),
  ('FAMILIA BERCOMAT'),('FARMACIA'),('FARMAFEST GRAFICA'),('FECHADORA PRINPAQ'),
  ('FEDERICO MIÑO'),('FERRETERIA'),('FIAMBRES'),('FIDANI'),('FLETE'),
  ('FRAMAP'),('FRANDIS SRL'),('FRIOS DEL NEA'),('FRUTOS DEL NOA'),('GABARDINI'),
  ('GIGARED'),('GLOBAL'),('GRAFICA'),('GRUPO FRAMAP'),('HANLOR'),
  ('HECTOR PARODI'),('HONORARIOS ABOGADA'),('HORNO'),('HUEVOS DE CAMPO'),
  ('IBERIA'),('INKJET'),('INTERNET'),('INTERNET OFICINA'),('JUANJO URBANO'),
  ('JULIAN'),('JULIAN MUEBLES'),('KANGOO'),('LA BOUTIQUE DEL PANADERO'),
  ('LA CALANDRIA'),('LA OFI STORE'),('LASA'),('LECHE'),('LIBRERIA'),
  ('LICUADORA'),('LOBER SRL EN FORMACIÓN'),('LOGISTICA'),('LUCAS LANGONE'),
  ('MANGAS Y REPOSTERIA'),('MARCOS'),('MARKETING'),('MARTIN BERNEL'),
  ('MATA FUEGO FABRICA'),('MERCADO LIBRE'),('METALCOR'),('MILKAUT'),('MINIPIMER'),
  ('MOLDES'),('MONITOR'),('MONOTRIBUTO'),('MONTECARLO'),('MORINIGO DISTR.'),
  ('MOTOR TRIFASICO'),('MP DISTRIBUIDORA'),('MUNICIPALIDAD DE CORRIENTES'),
  ('NOTICORREO'),('NOZIGLIA'),('PAPER SRL'),('PARLANTES'),('PEDRITO ELECTRICISTA'),
  ('PLAN OVALO'),('PLOMERO'),('POLIINSUMOS'),('PROSEGUR'),
  ('RENAULT'),('ROCIO'),('SEBASTIAN ZINI'),('SEGURO KANGOO'),
  ('SISTEMA FUDO'),('SPAF'),('SUPERVISOR'),('TDX ARASATI (MAX)'),('TONUTTI'),
  ('TRANSPORTE AVELLANEDA'),('TRANSPORTE FRIOS DEL NEA'),('VERDULERIA'),
  ('ZIMBA'),('OCACIONAL')
ON CONFLICT DO NOTHING;
