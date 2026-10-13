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

**SIGUIENTE PASO:** A2 (retirar `drizzle-kit push` de `post-merge.sh`), A4 (migrar antes de `listen`), A5 (`/readyz` con `SELECT 1`), A6 (validación Zod de `POST /donations`).

---

## Estado global de las unidades de trabajo

| UW | Descripción | Estado |
|---|---|---|
| A1 | Fix ledger `asc`→`desc` + test | ✅ Implementado · ✅ Probado |
| A2 | Quitar `drizzle-kit push` de `post-merge.sh` | ⏳ Pendiente |
| A3 | FK del ledger a `RESTRICT` + borrado lógico | ⏳ Pendiente |
| A4 | Migrar antes de `listen` + `exit(1)` | ⏳ Pendiente |
| A5 | `/readyz` con `SELECT 1` | ⏳ Pendiente |
| A6 | Validación Zod de `POST /donations` | ⏳ Pendiente |
| A7 | Exigir comprobante al aprobar | ⏳ Pendiente |
| A8 | Transacciones en donations/reports/pets | ⏳ Pendiente |
| B1-B5 | Importadores idempotentes | ⏳ Pendiente |
| C1-C8 | ChocoFest 2026 | ⏳ Pendiente (bloqueado por datos reales) |
| D | Diseño, calidad y docs restantes | ⏳ Pendiente |
