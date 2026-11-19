#!/usr/bin/env bash
# Corre docs/roles/escenarios.sql antes y después de una migración (sin aplicarla:
# todo va dentro de begin … rollback) y muestra qué cambió por persona.
#
#   scripts/permisos-escenarios.sh <migración.sql> [ref]     (ref por defecto: dev)
set -euo pipefail
MIGRACION="$1"
REF="${2:-fafckqysyvtlslfnpzrh}"
TMP="$(mktemp -d)"

correr() {
  supabase db query --remote="$REF" -f "$1" --yes 2>/dev/null > "$2"
}

correr docs/roles/escenarios.sql "$TMP/antes.json"
# "Después": la migración va adentro de la misma transacción que los escenarios.
python3 -I - "$MIGRACION" docs/roles/escenarios.sql "$TMP/despues.sql" <<'EOF'
import sys
mig = open(sys.argv[1]).read()
esc = open(sys.argv[2]).read()
open(sys.argv[3], 'w').write(esc.replace('begin;\n', 'begin;\n' + mig + '\n', 1))
EOF
correr "$TMP/despues.sql" "$TMP/despues.json"

python3 -I - "$TMP/antes.json" "$TMP/despues.json" <<'EOF'
import json, sys
def leer(p):
    t = open(p).read()
    d = json.loads(t[t.find('{'):t.rfind('}') + 1])
    if 'rows' not in d:
        sys.exit(f'Falló la consulta:\n{t[-1500:]}')
    return d['rows'][0]['escenarios']
antes, despues = leer(sys.argv[1]), leer(sys.argv[2])
cambios = 0
for persona in sorted(set(antes) | set(despues)):
    a, d = antes.get(persona, {}), despues.get(persona, {})
    difs = [f'{k}: {a.get(k)} → {d.get(k)}' for k in sorted(set(a) | set(d)) if a.get(k) != d.get(k)]
    if difs:
        cambios += 1
        print(f'{persona}\n  ' + '\n  '.join(difs))
print(f'\n{len(antes)} personas, {cambios} con cambios.')
EOF
