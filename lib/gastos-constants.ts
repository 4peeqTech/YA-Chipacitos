export const RUBROS_CATEGORIAS: Record<string, string[]> = {
  'MATERIA PRIMA': [
    'MATERIA PRIMA',
    'LACTEOS / QUESO',
    'HUEVOS',
    'HARINA / ALMIDON',
    'SAL / CONDIMENTOS',
    'FRUTAS',
    'MERCADERIA DE REVENTA',
  ],
  'INSUMOS Y EMBALAJE': [
    'INSUMOS',
    'EMBALAJE / BOLSAS',
    'ETIQUETAS',
    'INSUMOS DE LIMPIEZA',
    'LIBRERIA / PAPELERIA',
  ],
  'PERSONAL': [
    'PERSONAL',
    'SUELDOS PRODUCCION',
    'SUELDOS SUCURSAL',
    'SUELDOS ADMINISTRACION',
    'CARGAS SOCIALES / SINDICATO',
    'ART / COBERTURA MEDICA',
  ],
  'IMPUESTOS Y CARGAS': [
    'IMPUESTO NACIONAL',
    'IMPUESTO PROVINCIAL',
    'PLAN DE PAGO',
  ],
  'SERVICIOS Y ESTRUCTURA': [
    'ALQUILER',
    'ELECTRICIDAD',
    'AGUA',
    'INTERNET / TELEFONIA',
    'SISTEMA',
  ],
  'HONORARIOS': [
    'CONTADOR',
    'DISEÑO',
    'LEGAL',
    'CONSULTORIA',
  ],
  'LOGISTICA Y RODADOS': [
    'COMBUSTIBLE',
    'MANTENIMIENTO VEHICULO',
    'FLETE / CORREO',
    'SEGURO VEHICULO',
  ],
  'MOVIMIENTO INTERNO': [],
}

export const RUBROS = Object.keys(RUBROS_CATEGORIAS)

// Locales, formas de pago y cajas salen de la base (locales_config, formas_pago,
// cajas). Rubros y categorías quedan acá hasta que llegue el plan de cuentas.
