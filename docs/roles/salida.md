# Salida de la épica roles y permisos (T8)

Instructivo del pase a producción. Plan: `artifacts/roles-permisos/plan-tecnico` (Migración y salida). Prod: `ahlpthzsjipdpcnjbfdk` · `app.yachipacitos.com.ar`. Dev/QA: `fafckqysyvtlslfnpzrh`.

## Antes

1. **OK de Marcos** en QA con la guía `docs/entregas/R1-2026-11-26-guia-de-prueba-roles.html`.
2. **Qué sale.** La épica se hizo sobre `qa`, que además tiene Gastos G1–G3 (plan de cuentas, espera el OK de Nico), Supervisión v2 y Fudo (locales nuevos, Conexión y Ventas Fudo), que tampoco están en `main`. Llevar solo la épica a `main` no compila sin esos bloques (probado el 26-11: 8 archivos en conflicto y 22 errores de tipos). Decidir antes:
   - **A. Sale `qa` entera** (necesita el OK de esos bloques). Migraciones: las 20 de `qa` que no están en prod, en orden.
   - **B. Sale solo la épica**, portada a mano sobre `main`: hay que resolver los conflictos con las versiones de `main` y probar ese `main` en otro entorno (QA tiene todo junto). Migraciones: `20261113120000_locales_fudo_nuevos` y las 8 de permisos.
3. **Orden:** `20261113120000_locales_fudo_nuevos` va antes que `20261119120000_permisos_modelo` (crea YA! SANTA FE con Fudo y caja; si no, la de permisos la crea sin Fudo y la de Fudo la saltea por el `on conflict`). El guard del archivo lo exige con `--requiere 20261113120000`.

## Paso a paso

```bash
cd <repo>; export PATH=~/.local/node/bin:$PATH
PROD=ahlpthzsjipdpcnjbfdk
MIGS=(…migraciones de la opción elegida, en orden de versión…)

# 1. Archivos
python3 -I scripts/salida-migraciones.py subir --requiere 20261113120000 $MIGS > salida.sql
python3 -I scripts/salida-migraciones.py subir --sin-transaccion --requiere 20261113120000 $MIGS > salida-ensayo.sql
python3 -I scripts/salida-migraciones.py bajar <downs en orden inverso> > bajada.sql   # docs/roles/down/

# 2. Backup (solo lectura) → ~/Documents/Dev/Trabajo/4peeq/_backups/
scripts/salida-backup.sh $PROD

# 3. Ensayo contra prod: corre todo y deshace. Tiene que decir "Sin diferencias".
npm run permisos:comparar -- --remote $PROD --ensayo salida-ensayo.sql

# 4. Aplicar (con la app todavía en el código viejo: la migración es compatible)
supabase db query --remote=$PROD --yes -f salida.sql

# 5. Código: merge a main y push. Esperar el deploy (~2 min) y verificar el commit
curl -s https://app.yachipacitos.com.ar/api/entorno

# 6. Después: comparador contra prod, sin ensayo
npm run permisos:comparar -- --remote $PROD
```

7. **Santiago revisa en prod con Ver como** a una persona de cada rol (local, supervisor de fábrica, depósito, mayorista y los de Administración): ve lo mismo que antes.
8. Si sale Fudo: `node scripts/fudo-claves-a-la-base.mjs --prod` con las variables de prod (ver memoria de deploy).

## Si algo sale mal

- **Código:** en Vercel, volver al deployment anterior de `main` (Promote). El código viejo no lee las tablas nuevas.
- **Base:** `supabase db query --remote=$PROD --yes -f bajada.sql` (todos los downs, en orden inverso). `profiles.modulos_permitidos` nunca se tocó: con el código anterior, cada persona vuelve a lo de antes.
- Probado el 26-11 sobre dev: bajar toda la épica y volver a subirla en una sola transacción con `rollback` (las 8 migraciones, el guard, y que el down deje la base como antes).

## Notas

- El comparador mide contra la regla vieja (`rol` + `modulos_permitidos`). En dev marca a Supervisor de locales QA "gana Locales": es a propósito (configurado en T4). En prod no debería haber ninguna diferencia.
- Los downs por migración están en `docs/roles/down/`; los escenarios, en `docs/roles/escenarios*.sql` (begin … rollback).
