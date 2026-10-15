#!/usr/bin/env bash
# Verificación E2E contra PostgreSQL REAL (Fase 9 del Prompt Maestro V7).
#
# Qué hace, en un solo comando (el sandbox mata los procesos en background al
# terminar cada comando, así que todo el ciclo vive aquí dentro):
#   1. Crea un clúster PostgreSQL temporal en un directorio de trabajo.
#   2. Aplica el schema base con drizzle-kit push --force.
#   3. Arranca el API compilado: el migrador embebido corre las migraciones.
#   4. Comprueba con psql que el esquema quedó como se documenta.
#   5. Ejecuta el flujo funcional completo por HTTP (tests/e2e/flow.mjs).
#   6. Reintenta el arranque para demostrar que las migraciones son idempotentes.
#   7. Limpia: para el API, para PostgreSQL y borra el directorio temporal.
#
# NO toca ninguna base de datos real: DATABASE_URL se construye aquí.
set -uo pipefail

PGBIN="/nix/store/hkhbalgmx1669niw8jg648vbqs3mdxkv-postgresql-17.7/bin"
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
WORK="$(mktemp -d /tmp/e2e-pg-XXXXXX)"
DATA="$WORK/data"
SOCK="$WORK/sock"
PGPORT=55432
APIPORT=3999
DBNAME="redsolidaria_e2e"
SERVER="artifacts/api-server/dist/index.mjs"

export DATABASE_URL="postgres://postgres@127.0.0.1:${PGPORT}/${DBNAME}"
export E2E_ADMIN_USERNAME="e2e-admin"
export E2E_ADMIN_PASSWORD="E2e-Passw0rd!2026"
export NODE_ENV=development
export ADMIN_USERNAME="$E2E_ADMIN_USERNAME"
export ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD"
# Un recorrido completo de la plataforma hace muchas más de 100 acciones
# administrativas legítimas, así que el ensayo amplía ese presupuesto de forma
# EXPLÍCITA. No afecta a producción (allí la variable no se define) y NO toca el
# límite de reautenticación, que el ensayo sigue verificando.
export ADMIN_ACTION_LIMIT_OVERRIDE=5000
export SESSION_SECRET="e2e-secret-no-usar-en-produccion"
export PORT="$APIPORT"

API_PID=""
cleanup() {
  if [ -n "$API_PID" ]; then kill "$API_PID" 2>/dev/null; fi
  "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

psql_c() { "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DBNAME" -tAc "$1"; }

wait_for_api() {
  for _ in $(seq 1 45); do
    if curl -sf "http://127.0.0.1:$APIPORT/api/healthz" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

echo "== 1. Clúster PostgreSQL temporal =="
mkdir -p "$SOCK"
"$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null 2>&1 || { echo "FALLO: initdb"; exit 1; }
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PGPORT -k $SOCK -c listen_addresses=127.0.0.1" -l "$WORK/pg.log" -w start >/dev/null || { echo "FALLO: arranque de PostgreSQL"; tail -20 "$WORK/pg.log"; exit 1; }
"$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DBNAME" || { echo "FALLO: createdb"; exit 1; }
echo "   PostgreSQL escuchando en 127.0.0.1:$PGPORT (base $DBNAME)"

echo "== 2. Schema base (drizzle-kit push --force) =="
( cd "$REPO" && pnpm --filter @workspace/db run push-force >"$WORK/push.log" 2>&1 ) || { echo "FALLO: drizzle push"; tail -20 "$WORK/push.log"; exit 1; }
echo "   tablas base creadas: $(psql_c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"

echo "== 3. Arranque del API (migraciones embebidas) =="
( cd "$REPO" && node "$SERVER" >"$WORK/api.log" 2>&1 ) &
API_PID=$!
if ! wait_for_api; then echo "FALLO: el API no respondió en /api/healthz"; tail -30 "$WORK/api.log"; exit 1; fi
echo "   API respondiendo en http://127.0.0.1:$APIPORT"

echo "== 4. Esquema tras las migraciones =="
MIGRATIONS="$(psql_c "SELECT count(*) FROM drizzle_migrations")"
echo "   migraciones registradas: $MIGRATIONS"
COLLAB="$(psql_c "SELECT column_default FROM information_schema.columns WHERE table_name='donations' AND column_name='collaboration_type'")"
echo "   donations.collaboration_type default: ${COLLAB:-AUSENTE}"
MOVEMENT_FK="$(psql_c "SELECT confdeltype FROM pg_constraint WHERE conname = 'campaign_movements_campaign_id_fkey'")"
if [ "$MOVEMENT_FK" = "c" ]; then
  echo "   AVISO (B-1 confirmado): campaign_movements_campaign_id_fkey = CASCADE (la migración 010 sigue sin autorizar)"
elif [ "$MOVEMENT_FK" = "r" ]; then
  echo "   campaign_movements_campaign_id_fkey = RESTRICT (protección real del libro)"
else
  echo "   campaign_movements_campaign_id_fkey = ${MOVEMENT_FK:-AUSENTE}"
fi
UNIQUE_SOURCE="$(psql_c "SELECT count(*) FROM pg_indexes WHERE tablename='campaign_movements' AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%source%'")"
echo "   índice único de origen en el libro: $UNIQUE_SOURCE"
USE_CASE_INDEXES="$(psql_c "SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_adoption_requests_pet','idx_adoption_requests_status','idx_expenses_campaign_public','idx_evidence_campaign_public','idx_updates_campaign_created','idx_donations_campaign_status_created')")"
echo "   índices por caso de uso (migración 021): $USE_CASE_INDEXES/6"
if [ "$USE_CASE_INDEXES" -lt 6 ]; then
  echo "   FAIL - faltan índices de la migración 021"
  exit 1
fi

echo "== 4b. Restricciones de estado (DB-08) y updated_at automático (DB-10) =="
STATUS_CHECKS="$(psql_c "SELECT count(*) FROM pg_constraint WHERE contype='c' AND conname IN ('donations_status_check','campaigns_status_check','pets_status_check','volunteers_status_check','adoption_requests_status_check','community_reports_status_check','campaign_movements_kind_check')")"
echo "   restricciones de estado (DB-08): $STATUS_CHECKS/7"
if [ "$STATUS_CHECKS" -lt 7 ]; then
  echo "   FAIL - faltan restricciones de estado"
  exit 1
fi

# El seed del API corre en paralelo al arranque: se espera a que haya datos
# REALES antes de probar las restricciones contra ellos (no se prueba en vacío).
SEEDED_CAMPAIGN=""
SEEDED_SETTING="0"
for _ in $(seq 1 30); do
  SEEDED_CAMPAIGN="$(psql_c "SELECT id FROM campaigns ORDER BY id LIMIT 1")"
  SEEDED_SETTING="$(psql_c "SELECT count(*) FROM settings WHERE key = 'org_name'")"
  if [ -n "$SEEDED_CAMPAIGN" ] && [ "$SEEDED_SETTING" = "1" ]; then break; fi
  sleep 0.5
done
if [ -z "$SEEDED_CAMPAIGN" ]; then
  echo "   FAIL - no hay campañas sembradas para probar la restricción de estado"
  exit 1
fi

BAD_STATUS="$(psql_c "UPDATE campaigns SET status='estado_invalido' WHERE id=$SEEDED_CAMPAIGN" 2>&1 || true)"
if echo "$BAD_STATUS" | grep -qi "campaigns_status_check"; then
  echo "   ok   - la base RECHAZA un estado inválido (CHECK activo en escrituras nuevas)"
else
  echo "   FAIL - la base aceptó un estado inválido: $BAD_STATUS"
  exit 1
fi

GOOD_STATUS="$(psql_c "UPDATE campaigns SET status=status WHERE id=$SEEDED_CAMPAIGN RETURNING status")"
if [ -n "$GOOD_STATUS" ]; then
  echo "   ok   - un estado válido se sigue aceptando (campaña #$SEEDED_CAMPAIGN sigue en '$GOOD_STATUS')"
else
  echo "   FAIL - la base rechazó un estado válido"
  exit 1
fi

UPDATED_TRIGGERS="$(psql_c "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_donors_updated_at','trg_volunteer_teams_updated_at','trg_pets_updated_at','trg_community_reports_updated_at','trg_settings_updated_at','trg_volunteers_updated_at')")"
echo "   disparadores de updated_at (DB-10): $UPDATED_TRIGGERS/6"
if [ "$UPDATED_TRIGGERS" -lt 6 ]; then
  echo "   FAIL - faltan disparadores de updated_at"
  exit 1
fi

if [ "$SEEDED_SETTING" != "1" ]; then
  echo "   FAIL - no hay configuración sembrada para probar updated_at"
  exit 1
fi
psql_c "UPDATE settings SET value = value WHERE key = 'org_name'" >/dev/null
FRESH_UPDATED="$(psql_c "SELECT count(*) FROM settings WHERE key = 'org_name' AND updated_at > now() - interval '10 seconds'")"
if [ "$FRESH_UPDATED" -ge 1 ] 2>/dev/null; then
  echo "   ok   - updated_at se actualiza solo al modificar una fila ($FRESH_UPDATED fila/s recién tocada/s)"
else
  echo "   FAIL - updated_at no se actualizó automáticamente ($FRESH_UPDATED)"
  exit 1
fi

echo "== 4c. Claves foráneas ausentes (DB-04 / B-2) =="
FKS="$(psql_c "SELECT count(*) FROM pg_constraint WHERE contype='f' AND conname IN ('donations_campaign_id_fkey','donations_donor_id_fkey','campaign_expenses_campaign_id_fkey','campaign_evidence_campaign_id_fkey','campaign_images_campaign_id_fkey','campaign_updates_campaign_id_fkey','campaign_leftovers_campaign_id_fkey','campaign_leftovers_donor_id_fkey','campaign_budgets_campaign_id_fkey','community_reports_campaign_id_fkey','adoption_requests_pet_id_fkey')")"
echo "   claves foráneas de la migración 023: $FKS/11"
if [ "$FKS" -lt 11 ]; then
  echo "   FAIL - faltan claves foráneas"
  exit 1
fi

# La base debe RECHAZAR una referencia a una campaña que no existe.
SEEDED_DONATION="$(psql_c "SELECT id FROM donations ORDER BY id LIMIT 1")"
if [ -z "$SEEDED_DONATION" ]; then
  echo "   FAIL - no hay donaciones sembradas para probar la clave foránea"
  exit 1
fi
BAD_FK="$(psql_c "UPDATE donations SET campaign_id = 999999 WHERE id = $SEEDED_DONATION" 2>&1 || true)"
if echo "$BAD_FK" | grep -qi "donations_campaign_id_fkey"; then
  echo "   ok   - la base RECHAZA una donación apuntando a una campaña inexistente"
else
  echo "   FAIL - la base aceptó una referencia inexistente: $BAD_FK"
  exit 1
fi

# Y una referencia válida se sigue aceptando.
GOOD_FK="$(psql_c "UPDATE donations SET campaign_id = campaign_id WHERE id = $SEEDED_DONATION RETURNING campaign_id")"
if [ -n "$GOOD_FK" ]; then
  echo "   ok   - una referencia válida se sigue aceptando (donación #$SEEDED_DONATION → campaña $GOOD_FK)"
else
  echo "   FAIL - la base rechazó una referencia válida"
  exit 1
fi

echo "== 5. Flujo funcional completo por HTTP =="
node "$REPO/artifacts/api-server/tests/e2e/flow.mjs" "http://127.0.0.1:$APIPORT"
FLOW_STATUS=$?

echo "== 6. Estado tras el seed y segundo arranque (idempotencia) =="
WHATSAPP_KEYS="$(psql_c "SELECT count(*) FROM settings WHERE key IN ('org_whatsapp','whatsapp_message_general','whatsapp_message_donation','whatsapp_message_volunteer','whatsapp_message_sponsor')")"
echo "   claves de WhatsApp en settings (tras el seed): $WHATSAPP_KEYS"
if [ "$WHATSAPP_KEYS" -lt 5 ]; then
  echo "   FAIL - faltan claves de configuración de WhatsApp"
  FLOW_STATUS=1
fi
RESULTS_KEYS="$(psql_c "SELECT count(*) FROM settings WHERE key LIKE 'chocofest_2026_results_%'")"
echo "   claves de rendición de resultados (tras el seed): $RESULTS_KEYS"
if [ "$RESULTS_KEYS" -lt 4 ]; then
  echo "   FAIL - faltan claves de la rendición de resultados del evento"
  FLOW_STATUS=1
fi
SEEDED_CONFIRMED="$(psql_c "SELECT count(*) FROM donations WHERE status IN ('approved','reconciled')")"
SEEDED_MOVEMENTS="$(psql_c "SELECT count(*) FROM campaign_movements")"
echo "   donaciones confirmadas: $SEEDED_CONFIRMED · asientos en el libro: $SEEDED_MOVEMENTS"

kill "$API_PID" 2>/dev/null
wait "$API_PID" 2>/dev/null
API_PID=""
( cd "$REPO" && node "$SERVER" >"$WORK/api2.log" 2>&1 ) &
API_PID=$!
if ! wait_for_api; then echo "FALLO: el API no arrancó en el segundo intento"; tail -30 "$WORK/api2.log"; FLOW_STATUS=1; fi
MIGRATIONS_2="$(psql_c "SELECT count(*) FROM drizzle_migrations")"
if [ "$MIGRATIONS" = "$MIGRATIONS_2" ]; then
  echo "   ok   - el segundo arranque no duplica migraciones ($MIGRATIONS_2)"
else
  echo "   FAIL - migraciones antes=$MIGRATIONS después=$MIGRATIONS_2"
  FLOW_STATUS=1
fi

echo "== 7. Ensayo de respaldo y restauración (docs/MIGRACIONES_Y_RESPALDOS.md) =="
DUMP_FILE="$WORK/backup.sql"

# Se para el API: el respaldo y la restauración se hacen en frío, como en un
# incidente real, y así la base no tiene conexiones abiertas al eliminarla.
kill "$API_PID" 2>/dev/null
wait "$API_PID" 2>/dev/null
API_PID=""

BEFORE_DONATIONS="$(psql_c "SELECT count(*) FROM donations")"
BEFORE_MOVEMENTS="$(psql_c "SELECT count(*) FROM campaign_movements")"
BEFORE_SETTINGS="$(psql_c "SELECT count(*) FROM settings")"
BEFORE_MIGRATIONS="$(psql_c "SELECT count(*) FROM drizzle_migrations")"
echo "   antes: donaciones=$BEFORE_DONATIONS · asientos=$BEFORE_MOVEMENTS · configuración=$BEFORE_SETTINGS · migraciones=$BEFORE_MIGRATIONS"

"$PGBIN/pg_dump" -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DBNAME" -f "$DUMP_FILE" >/dev/null 2>&1
if [ ! -s "$DUMP_FILE" ]; then
  echo "   FAIL - el respaldo quedó vacío"
  exit 1
fi
echo "   respaldo creado: $(wc -c <"$DUMP_FILE" | tr -d ' ') bytes"

# Se DESTRUYE la base y se restaura solo desde el respaldo. WITH (FORCE) cierra
# las conexiones que hubieran quedado del API recién parado.
DROP_OUT="$("$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS \"$DBNAME\" WITH (FORCE)" 2>&1)" || { echo "   FAIL - no se pudo eliminar la base: $DROP_OUT"; exit 1; }
"$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DBNAME" || { echo "   FAIL - no se pudo recrear la base"; exit 1; }
"$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DBNAME" -q -f "$DUMP_FILE" >/dev/null 2>&1 || { echo "   FAIL - la restauración devolvió error"; exit 1; }

AFTER_DONATIONS="$(psql_c "SELECT count(*) FROM donations")"
AFTER_MOVEMENTS="$(psql_c "SELECT count(*) FROM campaign_movements")"
AFTER_SETTINGS="$(psql_c "SELECT count(*) FROM settings")"
AFTER_MIGRATIONS="$(psql_c "SELECT count(*) FROM drizzle_migrations")"
if [ "$AFTER_DONATIONS" = "$BEFORE_DONATIONS" ] && [ "$AFTER_MOVEMENTS" = "$BEFORE_MOVEMENTS" ] && [ "$AFTER_SETTINGS" = "$BEFORE_SETTINGS" ] && [ "$AFTER_MIGRATIONS" = "$BEFORE_MIGRATIONS" ]; then
  echo "   ok   - la base restaurada tiene los mismos datos (donaciones=$AFTER_DONATIONS · asientos=$AFTER_MOVEMENTS · configuración=$AFTER_SETTINGS · migraciones=$AFTER_MIGRATIONS)"
else
  echo "   FAIL - los datos no coinciden tras restaurar: donaciones=$AFTER_DONATIONS/$BEFORE_DONATIONS asientos=$AFTER_MOVEMENTS/$BEFORE_MOVEMENTS configuración=$AFTER_SETTINGS/$BEFORE_SETTINGS migraciones=$AFTER_MIGRATIONS/$BEFORE_MIGRATIONS"
  exit 1
fi

# El API debe arrancar sobre la base restaurada sin volver a migrar ni duplicar.
( cd "$REPO" && node "$SERVER" >"$WORK/api3.log" 2>&1 ) &
API_PID=$!
if ! wait_for_api; then
  echo "   FAIL - el API no arrancó sobre la base restaurada"
  tail -30 "$WORK/api3.log"
  exit 1
fi
MIGRATIONS_3="$(psql_c "SELECT count(*) FROM drizzle_migrations")"
if [ "$MIGRATIONS_3" != "$BEFORE_MIGRATIONS" ]; then
  echo "   FAIL - el arranque tras restaurar duplicó migraciones ($MIGRATIONS_3 vs $BEFORE_MIGRATIONS)"
  exit 1
fi
echo "   ok   - el API arranca sobre la base restaurada sin duplicar migraciones ($MIGRATIONS_3)"

# Y la prueba de fondo: el libro contable sigue íntegro (cadena de hashes).
CHAIN_CAMPAIGN="$(psql_c "SELECT campaign_id FROM campaign_movements ORDER BY id LIMIT 1")"
if [ -n "$CHAIN_CAMPAIGN" ]; then
  VERIFY_BODY="$(curl -s "http://127.0.0.1:$APIPORT/api/campaigns/$CHAIN_CAMPAIGN/movements/verify")"
  if echo "$VERIFY_BODY" | grep -q '"verified":true'; then
    echo "   ok   - la cadena del libro sigue verificando tras la restauración"
  else
    echo "   FAIL - la cadena del libro no verifica tras restaurar: $VERIFY_BODY"
    exit 1
  fi
else
  echo "   nota - no hay asientos en el libro: la cadena no es comprobable en este ensayo"
fi

echo ""
if [ "$FLOW_STATUS" -eq 0 ]; then
  echo "E2E COMPLETO: OK"
else
  echo "E2E COMPLETO: con fallos (ver arriba)"
fi
exit "$FLOW_STATUS"
