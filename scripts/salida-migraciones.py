#!/usr/bin/env python3
"""Arma un solo archivo SQL para una salida a producción (épica roles y permisos, T8).

  subir:  python3 -I scripts/salida-migraciones.py subir [--ensayo | --sin-transaccion] [--requiere VERSIÓN ...] MIGRACIÓN... > salida.sql
  bajar:  python3 -I scripts/salida-migraciones.py bajar [--ensayo] DOWN... > bajada.sql

subir: begin; guard que aborta si alguna ya está aplicada o si falta una requerida
(aplicada antes o incluida antes en la lista); cada migración en orden con su insert en
supabase_migrations.schema_migrations; commit. Con --ensayo termina en rollback: sirve
para probarlo contra la base real sin cambiar nada. Con --sin-transaccion sale sin begin ni
commit: es lo que espera `npm run permisos:comparar -- --ensayo <archivo>` (él lo envuelve en
begin … rollback y compara el acceso de cada persona).

bajar: begin; cada down en el orden dado, sin sus begin/commit propios; commit (o rollback).

Correr con: supabase db query --remote=<ref> --yes -f salida.sql
"""
import os
import re
import sys


def version_y_nombre(ruta):
    base = os.path.basename(ruta)
    m = re.match(r'^(\d{14})_(.+?)(?:\.down)?\.sql$', base)
    if not m:
        sys.exit(f'No reconozco el nombre de {base}: tiene que ser <versión>_<nombre>.sql')
    return m.group(1), m.group(2)


def literal(texto):
    return "'" + texto.replace("'", "''") + "'"


def sin_transaccion(sql):
    # Los downs traen su propio begin/commit: en el archivo único va uno solo.
    return re.sub(r'^\s*(begin|commit|rollback);\s*$', '', sql, flags=re.I | re.M)


def subir(args):
    ensayo = '--ensayo' in args
    sin_tx = '--sin-transaccion' in args
    requiere = []
    archivos = []
    i = 0
    while i < len(args):
        if args[i] in ('--ensayo', '--sin-transaccion'):
            pass
        elif args[i] == '--requiere':
            i += 1
            requiere.append(args[i])
        else:
            archivos.append(args[i])
        i += 1
    if not archivos:
        sys.exit('Faltan las migraciones')
    versiones = [version_y_nombre(a) for a in archivos]
    if [v for v, _ in versiones] != sorted(v for v, _ in versiones):
        sys.exit('Las migraciones tienen que ir en orden de versión')

    lista = ', '.join(literal(v) for v, _ in versiones)
    partes = [
        f'-- Salida generada por scripts/salida-migraciones.py ({len(archivos)} migraciones{", ENSAYO: termina en rollback" if ensayo else ""}).',
        '' if sin_tx else 'begin;',
        '',
        'do $guard$',
        'declare v_ya text; v_falta text;',
        'begin',
        f'  select string_agg(version, \', \') into v_ya from supabase_migrations.schema_migrations where version in ({lista});',
        "  if v_ya is not null then raise exception 'Ya aplicadas: %', v_ya; end if;",
    ]
    for r in requiere:
        partes.append(f"  if not exists (select 1 from supabase_migrations.schema_migrations where version = {literal(r)})"
                      f" and {literal(r)} not in ({lista}) then raise exception 'Falta aplicar antes la migración %', {literal(r)}; end if;")
    partes += ['end', '$guard$;', '']
    for ruta, (v, n) in zip(archivos, versiones):
        sql = open(ruta).read()
        partes += [f'-- ===== {v}_{n} =====', sql.rstrip(), '',
                   'insert into supabase_migrations.schema_migrations (version, name, statements)',
                   f'values ({literal(v)}, {literal(n)}, array[{literal(sql)}]);', '']
    if not sin_tx:
        partes.append('rollback;' if ensayo else 'commit;')
    print('\n'.join(partes))


def bajar(args):
    ensayo = '--ensayo' in args
    archivos = [a for a in args if a != '--ensayo']
    if not archivos:
        sys.exit('Faltan los downs')
    partes = [f'-- Bajada generada por scripts/salida-migraciones.py ({len(archivos)} downs{", ENSAYO: termina en rollback" if ensayo else ""}).', 'begin;', '']
    for ruta in archivos:
        v, n = version_y_nombre(ruta)
        partes += [f'-- ===== down {v}_{n} =====', sin_transaccion(open(ruta).read()).strip(), '']
    partes.append('rollback;' if ensayo else 'commit;')
    print('\n'.join(partes))


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('subir', 'bajar'):
        sys.exit(__doc__)
    (subir if sys.argv[1] == 'subir' else bajar)(sys.argv[2:])
