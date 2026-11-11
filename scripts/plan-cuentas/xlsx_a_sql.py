"""Convierte el plan de cuentas de Nico (Excel) en el insert de la migración.

Uso (no hace falta instalar nada, uv baja openpyxl):

    uvx --with openpyxl python scripts/plan-cuentas/xlsx_a_sql.py docs/gastos/plan-cuentas-v1.xlsx > /tmp/insert.sql

Imprime un `insert into public.plan_cuentas (...) values ...;` con todas las
filas, en el orden del Excel. Qué cuentas se ven en Gastos (uso_gastos) no sale
del Excel: lo decide la migración.
"""

import sys

import openpyxl

COLUMNAS = {
    'Código': 'codigo',
    'Cuenta contable': 'nombre',
    'Código padre': 'padre',
    'Imputable': 'imputable',
    'Categoría del gasto': 'categoria_gasto',
    'Rubro del gasto': 'rubro_gasto',
    'Tipo': 'tipo',
    'Qué se incluye en esta cuenta': 'incluye',
    'Línea del Tablero · fábrica y adm. central': 'tablero_fabrica',
    'Línea del Tablero · locales': 'tablero_locales',
}


def texto(v):
    if v is None:
        return None
    s = ' '.join(str(v).split())
    return s or None


def sql(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    return "'" + v.replace("'", "''") + "'"


def main(ruta):
    hoja = openpyxl.load_workbook(ruta, read_only=True).worksheets[0]
    filas = hoja.iter_rows(values_only=True)
    encabezado = [texto(c) for c in next(filas)]
    faltan = [c for c in COLUMNAS if c not in encabezado]
    if faltan:
        sys.exit(f'Al Excel le faltan columnas: {faltan}')
    idx = {COLUMNAS[c]: encabezado.index(c) for c in COLUMNAS}

    valores = []
    codigos = set()
    for orden, fila in enumerate(filas, start=1):
        d = {k: texto(fila[i]) for k, i in idx.items()}
        if not d['codigo']:
            continue
        if d['codigo'] in codigos:
            sys.exit(f'Código repetido: {d["codigo"]}')
        if d['padre'] and d['padre'] not in codigos:
            sys.exit(f'{d["codigo"]}: el padre {d["padre"]} no está antes en el Excel')
        if d['imputable'] not in ('Sí', 'No'):
            sys.exit(f'{d["codigo"]}: Imputable tiene que ser Sí o No')
        codigos.add(d['codigo'])
        nivel = d['codigo'].count('.') + 1
        valores.append('(' + ', '.join([
            sql(d['codigo']), sql(d['nombre']), sql(nivel), sql(d['padre']), sql(d['imputable'] == 'Sí'),
            sql(d['tipo']), sql(d['rubro_gasto']), sql(d['categoria_gasto']), sql(d['incluye']),
            sql(d['tablero_fabrica']), sql(d['tablero_locales']), sql(orden),
        ]) + ')')

    print('insert into public.plan_cuentas (codigo, nombre, nivel, padre, imputable, tipo, rubro_gasto,')
    print('  categoria_gasto, incluye, tablero_fabrica, tablero_locales, orden) values')
    print(',\n'.join(valores) + ';')
    print(f'-- {len(valores)} filas', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
