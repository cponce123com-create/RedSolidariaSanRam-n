#!/bin/bash
set -e
pnpm install --frozen-lockfile

# NOTA (hallazgo DB-01): NO usar `drizzle-kit push` aquí. `push` hace un diff
# del esquema y puede emitir DROP de objetos no declarados (p. ej. la tabla
# `session` de connect-pg-simple), con riesgo de pérdida de datos.
# Las migraciones versionadas se aplican con el migrador de @workspace/db
# (lib/db/src/migrate.ts) al arrancar el servidor.
