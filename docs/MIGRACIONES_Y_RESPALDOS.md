# Migraciones y Respaldos — Plan (pendiente de autorización)

> **Nada de este documento se ha ejecutado.** Cada migración requiere autorización explícita.
> Regla: **respaldo → conversión → conciliación → reversión**. Nunca en producción sin plan de rollback.
> Contexto: `docs/AUDITORIA_INTEGRAL_2026.md` (hallazgos DB-* e IMP-04).

---

## 0. Preparación común

1. **Respaldo completo** de la BD (`pg_dump -Fc`) y verificación de restauración en un entorno de prueba.
2. **Clon de producción** para ensayar cada migración (nunca `push`/`migrate` directo a prod).
3. **Ventana de mantenimiento** y aviso; migraciones DDL cortas y transaccionales cuando sea posible.
4. Registrar el estado de `drizzle_migrations` **antes** de tocar nada.
5. Script de **reversión** por cada migración (SQL inverso) probado en el clon.

> Herramienta: migraciones **versionadas** de `lib/db/src/migrate.ts` (no `drizzle-kit push`).

---

## 1. DB-02 / A3 — FK del ledger a `RESTRICT` + borrado lógico

- **Problema:** `campaign_movements.campaign_id` es `ON DELETE CASCADE` → borrar una campaña destruye el ledger.
- **Cambio:** `ALTER TABLE campaign_movements DROP CONSTRAINT …; ADD … ON DELETE RESTRICT`.
- **Riesgo:** bajo (no borra datos). **Antes:** verificar que no haya campañas borradas con movimientos huérfanos.
- **Reversión:** volver a `CASCADE` (SQL inverso).
- **Además (app):** `DELETE /campaigns/:id` pasa a **borrado lógico** (`archived`) en lugar de físico.

## 2. IMP-04 — Clave natural única en `donations`

- **Problema:** sin `UNIQUE` no se puede garantizar idempotencia a nivel de BD (`ON CONFLICT`).
- **Cambio (aditivo):** `ADD COLUMN dedup_key text`; `UPDATE` para rellenarla (hash de
  `firstName|lastName|amount|paymentMethod|message|created_at`); luego `CREATE UNIQUE INDEX` (parcial,
  solo filas con `dedup_key IS NOT NULL`).
- **Riesgo:** el índice único falla si hay duplicados existentes → **detectar y resolver duplicados primero**
  (informe de duplicados, decisión manual del organizador).
- **Reversión:** `DROP INDEX` + `DROP COLUMN`.

## 3. DB-05 — Unicidad de campaña (`slug`/`year`)

- **Problema:** `campaigns.title` sin `UNIQUE`; los seeds resuelven por título (`existing[0]` sin `ORDER BY`).
- **Cambio:** `ADD COLUMN slug text` + `UNIQUE(slug)`; backfill desde el título; o `UNIQUE(title)` si se prefiere.
- **Riesgo:** medio (títulos duplicados existentes). **Reversión:** `DROP` de la columna/índice.

## 4. DB-06 — Tipos de fecha (`text` → `date`/`timestamp`)

- **Problema:** `startDate`/`endDate` y fechas de gastos/evidencias/noticias son `text`; el helper 2024 usa 2025.
- **Cambio:** `ALTER COLUMN … TYPE date USING (…::date)` por tabla; validar el formato antes (`~ '^\d{4}-\d{2}-\d{2}$'`).
- **Riesgo:** **alto** si hay valores no parseables → informe de valores inválidos y limpieza previa.
- **Reversión:** `ALTER COLUMN … TYPE text` (los datos ISO se preservan).
- **Además (código):** corregir `chocolatada-2024-data.ts:18` (`Date.UTC(2024, …)`) y el test que lo codificaba.

## 5. DB-08 — `CHECK` de estados

- **Problema:** `status` es `text` libre en varias tablas.
- **Cambio:** `ADD CONSTRAINT … CHECK (status IN (…))` tras **auditar valores existentes**.
- **Riesgo:** medio (valores fuera de catálogo) → informe previo y normalización.
- **Reversión:** `DROP CONSTRAINT`.
- **✅ APLICADO en V7-12 (migración 022)** con el patrón **`NOT VALID`**: no revisa las filas
  históricas (por eso no puede fallar ni exigir limpieza previa) y **sí** comprueba todas las
  escrituras nuevas. Los valores de cada tabla se tomaron de los esquemas de la aplicación, no
  de una lista inventada. Para endurecerlo cuando los datos estén limpios:
  `SELECT status, count(*) FROM <tabla> GROUP BY status;` y
  `ALTER TABLE <tabla> VALIDATE CONSTRAINT <nombre>;`.

## 6. DB-07 — Índices faltantes

- **Cambio:** índices en `campaign_expenses/evidence/updates/images.campaign_id`, `adoption_requests.pet_id`, etc.
- **Riesgo:** bajo; en tablas grandes usar `CREATE INDEX CONCURRENTLY` (fuera de transacción).
- **Reversión:** `DROP INDEX`.
- **Verificación:** `EXPLAIN ANALYZE` antes/después.

## 7. DB-09 — Backfill del ledger

- **Problema:** donaciones aprobadas sembradas sin entrada en `campaign_movements`.
- **Cambio:** script **idempotente** que recorre donaciones aprobadas sin movimiento y llama `appendMovement`.
- **Riesgo:** medio; ejecutar sobre el clon y conciliar
  `SUM(donations.amount approved) == SUM(movements ingreso)` por campaña.
- **Reversión:** no destructiva (el ledger es append-only); documentar el rango insertado.

## 8. Tipos monetarios (`real` → `numeric`)

- **Problema:** `campaigns.goal/raised`, `campaign_leftovers.quantity`, `stats.float_value` son `real` (float4).
- **Cambio:** `ALTER COLUMN … TYPE numeric(12,2) USING round(…::numeric, 2)`.
- **Riesgo:** medio (redondeo); conciliar sumas antes/después.
- **Reversión:** `ALTER … TYPE real`.

---

## 9. Orden recomendado y checklist

1. Respaldo + clon. 2. Duplicados/normalización de datos. 3. Cambios **aditivos** (columnas/índices).
4. Cambios de tipo (con conversión validada). 5. `CHECK`/`FK`. 6. Backfill del ledger. 7. Conciliación.
8. Documentar en `docs/PRUEBAS_Y_RESULTADOS.md`.

**Checklist por migración:** ☐ respaldo ☐ ensayo en clon ☐ SQL de reversión probado ☐ conciliación
☐ sin pérdida de datos ☐ documentado ☐ autorizado.

---

## 10. Ensayo en réplica local (2026-10) — RESULTADOS

Se montó una **réplica local** con los datos reales, **sin tocar producción**: PostgreSQL 17.7 (store de Nix),
esquema extraído de los **catálogos** y datos exportados en **solo lectura** (22 tablas, 213 filas).
Los conteos coinciden con producción (6 campañas, 70 donaciones, 5 movimientos, 23 gastos, 6 mascotas, 7 reportes).

| Cambio ensayado | Resultado |
|---|---|
| **DB-07** — 4 índices por `campaign_id` | ✅ Creados; 0 errores |
| **A3 / DB-02** — FK del ledger a `ON DELETE RESTRICT` | ✅ Aplicado; borrar una campaña con ledger **falla** (protección efectiva) |
| **DB-09** — re-hash del ledger | ✅ 3 filas corregidas (#3, #4, #5); re-verificación → **cadena válida, 0 cambios pendientes** |

**✅ APLICADO EN PRODUCCIÓN (2026-10-13)** con **respaldo previo** (`/tmp/backup-prod/`: `schema.sql`, `data.sql`,
`ledger-before.json`) y autorización explícita del responsable:

| Paso | Resultado |
|---|---|
| `docs/migraciones/010_low_risk.sql` | ✅ Aplicada y **registrada** en `drizzle_migrations` (10 filas) |
| Índices DB-07 | ✅ 4/4 presentes |
| FK del ledger | ✅ `ON DELETE RESTRICT` |
| **DB-09** re-hash | ✅ 3 movimientos corregidos (#3, #4, #5) |
| **Cadena del ledger** | ✅ **VÁLIDA** (antes: rota en #3) |

- `010_low_risk.sql` ya está en `lib/db/src/migrate.ts`; el migrador la omite porque está registrada.
- **Seguimiento en código:** `DELETE /admin/campaigns/:id` responde **409** (no 500) si la FK del ledger lo bloquea,
  vía `artifacts/api-server/src/lib/pg-errors.ts` + test `tests/pg-errors.test.mjs`.

**Pendiente de ensayo:**
- **IMP-04** — la clave natural tiene **1 duplicado real** que bloquea el índice único (requiere decisión sobre el duplicado).
- **DB-05 / DB-06** — unicidad de campaña y tipos `text`→`date` / `real`→`numeric`: **cambian el contrato de la API**.
- **DB-08** — ✅ **YA NO PENDIENTE**: aplicado en la **migración 022** (V7-12) con `CHECK … NOT VALID`
  en las 7 tablas con estado, sin exigir limpieza previa de datos históricos.

---

## 11. Ensayo automatizado de respaldo y restauración (2026-10-14) — RESULTADOS

El checklist tenía el respaldo como **documentado pero sin probar**. Ahora se ensaya de verdad en
cada ejecución del E2E (`artifacts/api-server/tests/e2e/run-e2e.sh`, sección 7), **contra una base
PostgreSQL real y sin tocar producción**:

1. se para el API;
2. `pg_dump` de la base;
3. se cuentan donaciones, asientos, configuración y migraciones;
4. **se destruye la base** (`DROP DATABASE … WITH (FORCE)`) y se recrea vacía;
5. se restaura **solo** desde el respaldo;
6. se comparan los conteos;
7. el API arranca sobre la base restaurada (no debe volver a migrar);
8. y se comprueba lo importante: **la cadena de hashes del libro sigue verificando**.

**Resultado real:**

```
   antes: donaciones=113 · asientos=1 · configuración=22 · migraciones=22
   respaldo creado: 114927 bytes
   ok   - la base restaurada tiene los mismos datos
   ok   - el API arranca sobre la base restaurada sin duplicar migraciones (22)
   ok   - la cadena del libro sigue verificando tras la restauración
```

**Aprendizaje operativo:** el primer intento usaba `dropdb`, que **falla si queda alguna conexión
abierta** (el API recién parado deja conexiones del pool). Se usa
`DROP DATABASE … WITH (FORCE)`, que las cierra. Es el fallo que aparecería en una recuperación
real, y queda documentado aquí y en el propio arnés.

**Nota sobre DB-05 / DB-06 (del ensayo anterior):** los cambios de tipo (`text`→`date`,
`real`→`numeric`) **cambian el contrato de la API** —`numeric` se serializa como string— así que
exigen ajuste en la capa de consulta antes de migrar.
