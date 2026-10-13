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
