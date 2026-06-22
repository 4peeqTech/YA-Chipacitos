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

export const LOCALES = [
  'YA! FABRICA',
  'YA! SAN LORENZO',
  'YA! PARAGUAY',
  'YA! IRIGOYEN',
  'YA! CORDOBA',
  'YA! ITUZAINGO',
  'YA! GOYA',
  'YA! UNIDAD',
  'CHURROS TUBO',
]

export const FORMAS_PAGO = [
  'Transferencia',
  'Efectivo',
  'Cheque',
  'E-Cheq',
  'Debito automatico',
  'Tarjeta de credito',
  'Mixto',
]

export const ESTADOS_GASTO = [
  'Pendiente de pago',
  'Pagado',
  'Parcial',
]
