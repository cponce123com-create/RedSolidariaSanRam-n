# Pruebas y Resultados — Línea base (Fase 1)

> Registro verificable de comprobaciones ejecutadas. Solo se anota lo que **realmente se ejecutó**.
> Entorno: Node v22.16.0 · pnpm 10.34.5 · fecha 2026-10-13.

---

## 1. Línea base ejecutada

| # | Comprobación | Comando | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | Instalación | `pnpm install` | ✅ EXIT=0 (618 paquetes, 27.7 s) | `node_modules` en los 8 paquetes |
| 2 | Typecheck | `pnpm run typecheck` | ✅ EXIT=0 (4 paquetes) | `api-server`, `mockup-sandbox`, `red-solidaria`, `scripts` |
| 3 | Suite de pruebas | `pnpm -r --if-present test` | ✅ EXIT=0 | api-server **139/139**, red-solidaria **22/22** (7 archivos) |
| 4 | Arranque dev | `pnpm dev` | ✅ HTTP 200 en `:5173` | título «Red Solidaria San Ramón…» |
| 5 | Auditoría de dependencias | `pnpm audit --prod` | ❌ 6 vulnerabilidades | 1 CRÍTICA, 1 ALTA, 4 MODERADAS (ver DEP-01..03) |
| 6 | Build de producción | `pnpm -r --if-present run build` | ⏳ Pendiente | — |

### Detalle de la suite (paso 3)

| Paquete | Runner | Resultado |
|---|---|---|
| `artifacts/api-server` | `node --test` (`.mjs`) | `# tests 139 · # pass 139 · # fail 0` |
| `artifacts/red-solidaria` | vitest + node | `Test Files 7 passed (7) · Tests 22 passed (22)` |

**Cobertura observada:** hay tests de auth (`require-admin`, `require-role`, `admin-users-auth`, `admin-2fa`),
validación (`donation-validation`, `admin-input-validation`), ledger (`ledger.test.mjs`, **solo funciones puras**),
rate-limit, CSP, cloudinary y datasets históricos (`chocofest-2025-data`, `chocolatada-2024-data`).
**No** hay tests de integración con base de datos, ni de los importadores (`scripts/src/apply-*.ts`), ni del
encadenamiento real del ledger (ver API-01 en la auditoría).

---

## 2. Vulnerabilidades de dependencias (`pnpm audit --prod`)

| ID | Severidad | Paquete | Advisory | Fix |
|---|---|---|---|---|
| DEP-01 | CRÍTICA | `proxy-addr` | IP spoofing vía IPv4-mapped IPv6 trust subnet | `>=2.0.8` |
| DEP-02 | ALTA | `compression` | DoS por fuga de memoria al cerrar respuesta | `>=1.8.2` |
| DEP-03 | MEDIA ×4 | `ip-address` | SSRF / trust-boundary bypass (4 advisories) | `>=10.7.1` |

Ruta: `artifacts__api-server > express-rate-limit > ip-address`; `proxy-addr` y `compression` son transitivas de Express.
**Impacto combinado:** DEP-01 es especialmente relevante porque puede habilitar el **bypass del rate-limit y del lockout
por IP** (SEC-02/SEC-03/SEC-04) si `trust proxy` está activo.

---

## 3. Pruebas pendientes (no ejecutadas)

- Build de producción (`pnpm -r run build`) y verificación del artefacto `dist/index.mjs`.
- `pnpm audit --prod` tras actualizar dependencias.
- Pruebas de integración con PostgreSQL (transacciones, FKs, importadores idempotentes). *(El encadenamiento del ledger ya se cubre con cliente simulado — ver sección 4.)*
- Pruebas de accesibilidad y Lighthouse (`lighthouserc.json`).

> Ninguna prueba marcada como ✅ se infiere: todas se ejecutaron y su resultado quedó registrado.

---

## 4. Fase 2 · A1 — Fix crítico del ledger (API-01)

**Cambio:** `appendMovement` (`artifacts/api-server/src/lib/ledger.ts`) ordena el `prev_hash` con `id DESC` (antes `ASC`).

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 7 | Typecheck backend | `pnpm --filter @workspace/api-server typecheck` | ✅ EXIT=0 |
| 8 | Suite backend | `pnpm --filter @workspace/api-server test` | ✅ **141/141** (antes 139) |
| 9 | Regresión (con el fix) | `node --test tests/ledger-chain.test.mjs` | ✅ 2/2 |
| 10 | **Control negativo** (con el bug) | `git stash` del fix + `node --test tests/ledger-chain.test.mjs` | ✅ 2/2 **fallan** → la prueba detecta el defecto |

**Nota metodológica (control negativo):** para demostrar que la prueba de regresión tiene "dientes", se revirtió
temporalmente el fix con `git stash push -- artifacts/api-server/src/lib/ledger.ts`, se reconstruyó el bundle de
tests (`build-tests.mjs`) y se ejecutó la prueba: **falló** (2/2). Tras `git stash pop` y reconstrucción, **pasó**
(2/2). Sin base de datos real disponible (no hay PostgreSQL ni Docker en el entorno), la prueba usa un cliente
simulado que emula el `orderBy`/`limit`/`for update` de Drizzle y respeta la dirección del orden.

**Riesgo pendiente:** un ledger existente con ≥3 asientos ya escritos con la cadena rota seguirá dando
`verified:false`; su corrección requiere *re-hash*/re-anclaje con autorización (ver `docs/MIGRACIONES_Y_RESPALDOS.md`).
