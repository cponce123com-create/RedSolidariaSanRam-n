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
`verified:false`; su corrección requiere *re-hash*/re-anclaje con autorización (ver `docs/MIGRACIONES_Y_RESPALDAS.md`).

---

## 5. Fase 2 · A2 / A4 / A5 — Infraestructura y arranque

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 11 | Typecheck backend | `pnpm --filter @workspace/api-server typecheck` | ✅ EXIT=0 |
| 12 | Suite backend | `pnpm --filter @workspace/api-server test` | ✅ **143/143** (antes 141) |
| 13 | Build de producción | `pnpm --filter @workspace/api-server build` | ✅ EXIT=0 (`dist/index.mjs`, 2.6 MB) |
| 14 | `/healthz` liveness | `node --test tests/health-readyz.test.mjs` | ✅ 200 `{status:ok}` |
| 15 | `/readyz` sin DB | `node --test tests/health-readyz.test.mjs` | ✅ 503 `{status:unavailable}` |

**Cambios:**
- **A2 (DB-01):** `scripts/post-merge.sh` ya no ejecuta `drizzle-kit push` (era destructivo). Migraciones versionadas al arrancar.
- **A4 (INF-01):** `src/index.ts` aplica `runMigrations()` **antes** de `app.listen()` y hace `process.exit(1)` si falla (top-level await, validado por typecheck y por el bundle esbuild).
- **A5 (INF-02):** `src/routes/health.ts` añade `/readyz` con `SELECT 1` y timeout de 2 s → 503 si la DB no responde; `/healthz` sigue siendo liveness.

**Nota:** el `/readyz` se prueba sin base de datos real (no hay PostgreSQL en el entorno): el intento de conexión falla y el endpoint devuelve 503, que es exactamente el comportamiento esperado ante una DB caída.

---

## 6. Fase 2 · A6 / A7 / A8 — Validación e integridad financiera

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 16 | Typecheck backend | `pnpm --filter @workspace/api-server typecheck` | ✅ EXIT=0 |
| 17 | Suite backend | `pnpm --filter @workspace/api-server test` | ✅ **143/143** |
| 18 | Build de producción | `pnpm --filter @workspace/api-server build` | ✅ EXIT=0 |

**Cambios:**
- **A6 (FE-02):** **REFUTADO** — el backend **ya** validaba `amount`/`paymentMethod` mediante `donationInputSchema`
  (`lib/donation-validation.ts`), no `insertDonationSchema`. Existen pruebas HTTP (`donations-auth.test.mjs`) que
  rechazan monto negativo, cero, >2 decimales, email inválido y método inválido. **No se modificó código.**
- **A7 (API-05):** `PUT /donations/:id` ahora exige comprobante (fila en `donation_proofs` o `receiptUrl`) al aprobar
  donaciones digitales (`approvalRequiresProof`). Nuevo `DonationProofRequiredError` → 400.
- **A8 (API-02/03/04):** transacciones en `POST /donations`, `POST /admin/reports/:id/convert` y `PATCH /admin/adoption-requests/:id`.

**Pendiente:** prueba de integración de A7/A8 con PostgreSQL real (no disponible en el entorno). Hoy se valida la
compilación/tipos y que las rutas siguen montadas y respondiendo.


