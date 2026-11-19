#!/usr/bin/env bash
# Corre docs/roles/escenarios-editores.sql (todo dentro de begin … rollback) y
# muestra los casos que fallan. Con una migración, la antepone en la misma
# transacción: sirve para probarla antes de aplicarla.
#
#   scripts/permisos-editores-prueba.sh [migración.sql] [ref]     (ref por defecto: dev)
set -euo pipefail
MIGRACION="${1:-}"
REF="${2:-fafckqysyvtlslfnpzrh}"
TMP="$(mktemp -d)"

python3 -I - "$MIGRACION" docs/roles/escenarios-editores.sql "$TMP/prueba.sql" <<'EOF'
import sys
mig = open(sys.argv[1]).read() if sys.argv[1] else ''
esc = open(sys.argv[2]).read()
open(sys.argv[3], 'w').write(esc.replace('begin;\n', 'begin;\n' + mig + '\n', 1))
EOF

supabase db query --remote="$REF" -f "$TMP/prueba.sql" --yes 2>&1 > "$TMP/salida.json" || { cat "$TMP/salida.json"; exit 1; }

python3 -I - "$TMP/salida.json" <<'EOF'
import json, sys
t = open(sys.argv[1]).read()
d = json.loads(t[t.find('{'):t.rfind('}') + 1])
filas = d.get('rows')
if filas is None:
    print(t); sys.exit(1)
mal = [f for f in filas if not f['ok']]
for f in filas:
    print(('OK ' if f['ok'] else 'MAL'), f['caso'], '' if f['ok'] else f"→ {f['detalle']}")
print(f"\n{len(filas) - len(mal)}/{len(filas)} casos OK")
sys.exit(1 if mal else 0)
EOF
