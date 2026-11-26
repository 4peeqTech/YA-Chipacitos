#!/usr/bin/env bash
# Backup a JSON antes de una salida (épica roles y permisos, T8): profiles, roles y
# locales_config, más las tablas de permisos si existen. Solo lectura.
#
#   scripts/salida-backup.sh <ref>        (prod: ahlpthzsjipdpcnjbfdk · dev: fafckqysyvtlslfnpzrh)
#
# Deja los archivos en ~/Documents/Dev/Trabajo/4peeq/_backups/<fecha>-<ref>/ (fuera del repo).
set -euo pipefail
REF="${1:?Falta el ref del proyecto de Supabase}"
DIR="$HOME/Documents/Dev/Trabajo/4peeq/_backups/$(date +%Y-%m-%d-%H%M)-$REF"
mkdir -p "$DIR"
for t in profiles roles locales_config rol_areas rol_permisos persona_permisos persona_sucursales permisos_historial; do
  existe=$(supabase db query --remote="$REF" --read-only "select to_regclass('public.$t') is not null as e" 2>/dev/null | python3 -I -c "import sys,json;t=sys.stdin.read();d,_=json.JSONDecoder().raw_decode(t[t.index('{'):]);print(d['rows'][0]['e'])")
  [ "$existe" = "True" ] || { echo "$t: no existe, se saltea"; continue; }
  supabase db query --remote="$REF" --read-only "select coalesce(json_agg(t), '[]') as filas from public.$t t" 2>/dev/null \
    | python3 -I -c "import sys,json;t=sys.stdin.read();d,_=json.JSONDecoder().raw_decode(t[t.index('{'):]);f=d['rows'][0]['filas'];f=json.loads(f) if isinstance(f,str) else f;json.dump(f,open(sys.argv[1],'w'),ensure_ascii=False,indent=1);print(sys.argv[1].split('/')[-1], len(f), 'filas')" "$DIR/$t.json"
done
chmod 600 "$DIR"/*.json
echo "Backup en $DIR"
