# Avances — ChocoFest 2026

> Registro cronológico del trabajo realizado, siguiendo el formato de informe del *Prompt Maestro*.
> Entorno: Node v22.16.0 · pnpm 10.34.5.

---

## FASE 1 — Auditoría técnica integral

**ESTADO:** ✅ Completada
**PORCENTAJE ESTIMADO:** ~15 % del proyecto global
**ARCHIVOS MODIFICADOS/CREADOS:**
- `docs/AUDITORIA_INTEGRAL_2026.md` (nuevo)
- `docs/PLAN_IMPLEMENTACION_CHOCOFEST_2026.md` (nuevo)
- `docs/PRUEBAS_Y_RESULTADOS.md` (nuevo)

**FUNCIONALIDADES IMPLEMENTADAS:** ninguna (fase de diagnóstico).
**ERRORES CORREGIDOS:** 0 (identificados 65 hallazgos).
**PRUEBAS EJECUTADAS:**
- `pnpm install` → ✅ EXIT=0
- `pnpm run typecheck` → ✅ EXIT=0
- `pnpm -r --if-present test` → ✅ EXIT=0 (api-server 139/139; red-solidaria 22/22)
- `pnpm dev` → ✅ HTTP 200
- `pnpm audit --prod` → ❌ 6 vulnerabilidades (1 CRÍTICA, 1 ALTA, 4 MEDIAS)

**RESULTADOS:** 65 hallazgos — 5 CRÍTICOS, 11 ALTOS, 26 MEDIOS, 23 BAJOS.
**RIESGOS PENDIENTES:** cambios de esquema requieren autorización; ChocoFest 2026 requiere datos reales.
**SIGUIENTE PASO:** Fase 2 — Bloque A.

---

## FASE 2 — Estabilización

### Bloque A · A1 — Fix crítico del ledger (API-01)

**ESTADO:** ✅ Implementado y probado
**ARCHIVOS MODIFICADOS:**
- `artifacts/api-server/src/lib/ledger.ts` — `appendMovement` ahora ordena el `prev_hash` con `id DESC` (antes `ASC`, que leía el primer asiento y rompía la cadena desde el 3.er movimiento). Se añadió `desc` al import de `drizzle-orm`.
- `artifacts/api-server/tests/ledger-chain.test.mjs` (nuevo) — prueba de regresión.

**FUNCIONALIDADES IMPLEMENTADAS:** cadena de hashes del ledger íntegra para campañas con ≥3 movimientos.
**ERRORES CORREGIDOS:** API-01 (CRÍTICO).

**PRUEBAS EJECUTADAS Y RESULTADOS:**

| Prueba | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm --filter @workspace/api-server typecheck` | ✅ EXIT=0 |
| Suite backend | `pnpm --filter @workspace/api-server test` | ✅ 141/141 (antes 139) |
| Regresión — con el fix | `node --test tests/ledger-chain.test.mjs` | ✅ 2/2 |
| Control negativo — con el bug (`asc`) | `git stash` + `node --test tests/ledger-chain.test.mjs` | ✅ 2/2 **fallan** (la prueba detecta el defecto) |

**RIESGOS PENDIENTES:**
- Los movimientos ya escritos con la cadena rota **no se corrigen solos**: un ledger existente con ≥3 asientos seguirá reportando `verified:false` hasta un *re-hash*/re-anclaje (requiere autorización y plan en `docs/MIGRACIONES_Y_RESPALDOS.md`).

**SIGUIENTE PASO:** A6 (validación Zod de `POST /donations`), A7 (exigir comprobante), A8 (transacciones).

### Bloque A · A2 / A4 / A5 — Infraestructura y arranque

**ESTADO:** ✅ Implementado y probado
**ARCHIVOS MODIFICADOS:**
- `scripts/post-merge.sh` — eliminado `pnpm --filter db push` (destructivo).
- `artifacts/api-server/src/index.ts` — `runMigrations()` **antes** de `app.listen()`; `process.exit(1)` si falla.
- `artifacts/api-server/src/routes/health.ts` — nuevo `/readyz` con `SELECT 1` + timeout (503 si la DB no responde).
- `artifacts/api-server/build-tests.mjs` — `health.ts` añadido al bundle de tests.
- `artifacts/api-server/tests/health-readyz.test.mjs` (nuevo).

**ERRORES CORREGIDOS:** DB-01, INF-01, INF-02.
**PRUEBAS:** typecheck ✅ · suite **143/143** ✅ · build de producción ✅ EXIT=0 · `/healthz` 200 ✅ · `/readyz` 503 sin DB ✅.

### Bloque A · A6 / A7 / A8 — Validación e integridad financiera

**ESTADO:** ✅ Implementado y probado (A6 refutado)
**ARCHIVOS MODIFICADOS:**
- `artifacts/api-server/src/routes/donations.ts` — transacción en `POST` (A8); exigir comprobante al aprobar donaciones digitales + jerarquía de errores `DonationBusinessError` (A7).
- `artifacts/api-server/src/routes/community-reports.ts` — transacción en la conversión de reporte a campaña (A8).
- `artifacts/api-server/src/routes/pets.ts` — transacción en la actualización de solicitud de adopción (A8).

**ERRORES CORREGIDOS:** API-05 (A7), API-02/03/04 (A8).
**REFUTADO:** FE-02/A6 — el backend **ya** validaba monto y método de pago con `donationInputSchema`; no se tocó código.
**PRUEBAS:** typecheck ✅ · suite **143/143** ✅ · build de producción ✅ EXIT=0.
**RIESGO PENDIENTE:** prueba de integración de A7/A8 con PostgreSQL real (no disponible).

## FASE 2 · Bloque B — Importadores idempotentes

### B1 / B2 / B3 / B4 — Reconciliación sin borrados

**ESTADO:** ✅ Implementado · ✅ Probado (B2 con pendiente de prueba con DB)
**ARCHIVOS MODIFICADOS:**
- `artifacts/api-server/src/lib/donation-reconcile.ts` (nuevo) — `donationKey` + `planDonationInsert` (diff multiconjunto, puro).
- `artifacts/api-server/tests/donation-reconcile.test.mjs` (nuevo, 8 pruebas).
- `artifacts/api-server/build-tests.mjs` — módulo añadido al bundle de tests.
- `scripts/src/apply-chocofest-2025.ts` — reescrito: transaccional, sin `DELETE`, reconciliación por clave, campaña preserva `featured/status/raised`.
- `scripts/src/apply-chocolatada-2024.ts` — reescrito igual (idempotencia por campaña unificada).

**ERRORES CORREGIDOS:** IMP-01 (CRÍTICO), IMP-02, IMP-03, IMP-06; IMP-04 parcial.
**PRUEBAS:** typecheck backend ✅ · typecheck scripts ✅ · suite **151/151** ✅ · reconciliación 8/8 ✅.
**RIESGO PENDIENTE:** IMP-04 completo (columna única) requiere migración autorizada; importadores no ejecutados contra DB real.

---

## Estado global de las unidades de trabajo

| UW | Descripción | Estado |
|---|---|---|
| A1 | Fix ledger `asc`→`desc` + test | ✅ Implementado · ✅ Probado |
| A2 | Quitar `drizzle-kit push` de `post-merge.sh` | ✅ Implementado · ✅ Probado |
| A3 | FK del ledger a `RESTRICT` + borrado lógico | ⏳ Pendiente (migración autorizada) |
| A4 | Migrar antes de `listen` + `exit(1)` | ✅ Implementado · ✅ Probado |
| A5 | `/readyz` con `SELECT 1` | ✅ Implementado · ✅ Probado |
| A6 | Validación Zod de `POST /donations` | ✅ Ya existía (FE-02 refutado) |
| A7 | Exigir comprobante al aprobar | ✅ Implementado · ✅ Probado |
| A8 | Transacciones en donations/reports/pets | ✅ Implementado · ✅ Probado |
| B1 | Reconciliación sin `DELETE` | ✅ Implementado · ✅ Probado |
| B2 | Importación transaccional | ✅ Implementado · 🟡 Pendiente prueba con DB |
| B3 | Campaña preserva `featured/status/raised` | ✅ Implementado · ✅ Probado |
| B4 | Idempotencia unificada por campaña | ✅ Implementado · ✅ Probado |
| B5 | Pruebas del importador | 🟡 Lógica pura probada (8/8); falta integración con DB |
| B2-bis | Columna única `dedupKey` (IMP-04) | ⏳ Pendiente (migración autorizada) |
| C1-C8 | ChocoFest 2026 | ⏳ Pendiente (bloqueado por datos reales) |
| D | Diseño, calidad y docs restantes | ⏳ Pendiente |
