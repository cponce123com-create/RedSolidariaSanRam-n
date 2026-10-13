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

---

## 7. Fase 2 · Bloque B — Importadores idempotentes

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 19 | Typecheck backend | `pnpm --filter @workspace/api-server typecheck` | ✅ EXIT=0 |
| 20 | Typecheck scripts | `pnpm --filter @workspace/scripts typecheck` | ✅ EXIT=0 |
| 21 | Suite backend | `pnpm --filter @workspace/api-server test` | ✅ **151/151** (antes 143) |
| 22 | Reconciliación (8 pruebas) | `node --test tests/donation-reconcile.test.mjs` | ✅ 8/8 |

**Cambios:**
- **Nuevo módulo puro** `artifacts/api-server/src/lib/donation-reconcile.ts` (`donationKey`, `planDonationInsert`):
  diff **multiconjunto** por clave natural (insensible a `number`/`string` y `Date`/ISO).
- **B1 (IMP-01/IMP-03):** `apply-chocofest-2025.ts` y `apply-chocolatada-2024.ts` ya **no hacen `DELETE`**; reconcilian
  por clave natural y unifican la idempotencia **por campaña**.
- **B2 (IMP-02):** todo el importador corre dentro de `db.transaction`.
- **B3 (IMP-06):** la actualización de campaña excluye `featured`/`status`/`raised`.

**Pendiente (requiere autorización de migración):** IMP-04 — columna `source`/`dedupKey` con índice único en `donations`.
**No ejecutado:** los importadores no se han corrido contra una BD real (no hay PostgreSQL en el entorno); la lógica de
reconciliación se prueba de forma pura y exhaustiva.

---

## 8. Fase 3 · Bloque C — Página pública ChocoFest 2026

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 23 | Typecheck frontend | `pnpm --filter @workspace/red-solidaria typecheck` | ✅ EXIT=0 |
| 24 | Pruebas frontend (node) | `pnpm --filter @workspace/red-solidaria test` | ✅ **16/16** |
| 25 | Pruebas frontend (vitest) | idem | ✅ **22/22** (7 archivos) |
| 26 | Build de producción (Vite) | `pnpm --filter @workspace/red-solidaria build` | ✅ EXIT=0 — chunk `chocofest-2026-*.js` (+br/gz) |

**Implementado:**
- `src/pages/chocofest-2026.tsx` — página pública con las **13 secciones** del prompt.
- `src/lib/chocofest.ts` — constantes (`CHOCOFEST_2026`, `CHOCOFEST_2026_PATH`) + `findChocofest2026` (pura).
- Ruta `/campanas/chocofest-2026` **antes** de `/campanas/:id` (wouter resuelve por orden).
- i18n es/en: bloque `chocofest` (~38 claves) con paridad verificada por el test existente.
- `tests/chocofest.test.mjs` (5 pruebas) + `build-tests.mjs` actualizado.

**Contenido provisional (NO son datos oficiales):** lema, meta y textos van marcados con el aviso «Contenido en
preparación»; si la campaña 2026 no existe en la BD, la URL muestra un estado «en preparación». No se inventaron
fechas, metas de beneficiarios ni cifras de recaudación.

**Pendiente:** panel admin específico de ChocoFest 2026, donaciones en especie/inventario, localidades beneficiadas y
galería con datos reales (requieren datos del organizador y CRUD).

---

## 9. Fase 3 · Bloque D — Calidad y documentación

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 27 | Typecheck frontend | `pnpm --filter @workspace/red-solidaria typecheck` | ✅ EXIT=0 |
| 28 | Pruebas frontend (node) | `pnpm --filter @workspace/red-solidaria test` | ✅ **16/16** |
| 29 | Pruebas frontend (vitest) | idem | ✅ **22/22** (7 archivos) |
| 30 | Build de producción (Vite) | `pnpm --filter @workspace/red-solidaria build` | ✅ EXIT=0 — **sin** avisos «Failed to resolve dependency» |

**Cambios:**
- **INF-03:** retiradas `react-redux` y `use-sync-external-store` de `optimizeDeps.include` (no instaladas).
- **FE-06 (parcial):** `Navbar` con `aria-label` correcto (`nav.mainMenu`, nueva clave es/en); toggle de anonimato de
  `report-form.tsx` con `role="switch"`/`aria-checked`/`aria-label`.
- **FE-08:** `loading="lazy"` + `decoding="async"` en `about.tsx` y 9 vistas del panel admin. **Recuento real:**
  35 `<img>` / 14 lazy (el dato previo «33/13» era impreciso). Heroes y logo **no** son lazy a propósito (LCP).

**Documentos creados (entregables obligatorios):**
- `docs/ARQUITECTURA_ACTUALIZADA.md`
- `docs/MIGRACIONES_Y_RESPALDOS.md` (plan, **nada ejecutado**)
- `docs/DESPLIEGUE_RENDER.md`

**Pendiente:** FE-06 (radiogroups), FE-07 (consolidar `ui` con el sandbox), FE-09 (SEO en más páginas), FE-10..15.

---

## 10. Fase 3 · Bloque E — Dependencias vulnerables (DEP-01/02/03)

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 31 | Instalación con overrides nuevos | `pnpm install` | ✅ EXIT=0 (+4 −3 paquetes) |
| 32 | **Auditoría de dependencias** | `pnpm audit --prod` | ✅ **No known vulnerabilities found** |
| 33 | Typecheck (root, 4 paquetes) | `pnpm run typecheck` | ✅ EXIT=0 |
| 34 | Suite backend | `pnpm --filter @workspace/api-server test` | ✅ **151/151** |
| 35 | Build de producción (API) | `pnpm --filter @workspace/api-server build` | ✅ EXIT=0 |

**Versiones resultantes (antes → después):**

| Paquete | Antes | Después | Fix mínimo |
|---|---|---|---|
| `proxy-addr` (DEP-01, CRÍTICO) | 2.0.7 | **2.0.8** | `>=2.0.8` |
| `compression` (DEP-02, ALTO) | 1.8.1 | **1.8.2** | `>=1.8.2` |
| `ip-address` (DEP-03, MEDIO ×4) | 10.4.0 | **10.7.4** | `>=10.7.1` |

**Cambios:** overrides en `pnpm-workspace.yaml` (`proxy-addr: ^2.0.8`, `ip-address: ^10.7.1`) y
`compression: ^1.8.2` en `artifacts/api-server/package.json`.

**Nota:** DEP-01 era especialmente relevante porque permitía falsificar la IP y **eludir el rate-limit y el lockout
por IP** (SEC-02/SEC-03/SEC-04) si `trust proxy` estaba activo.

---

## 11. Fase 3 · C7 — Panel admin de ChocoFest 2026

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 36 | Typecheck frontend | `pnpm --filter @workspace/red-solidaria typecheck` | ✅ EXIT=0 |
| 37 | Pruebas frontend (node) | `pnpm --filter @workspace/red-solidaria test` | ✅ **16/16** |
| 38 | Pruebas frontend (vitest) | idem | ✅ **22/22** (7 archivos) |
| 39 | Build de producción (Vite) | `pnpm --filter @workspace/red-solidaria build` | ✅ EXIT=0 (chunks `chocofest-2026-*.js` y `chocofest-*.js`) |

**Implementado:**
- `src/pages/admin/chocofest.tsx` (nuevo) en la ruta **`/admin/chocofest`** + ítem en el nav del admin.
- **Sin campaña:** creación guiada — el admin introduce **meta y fechas** (título/descripción provisionales editables);
  **no se inventan fechas**. Invalida la caché de campañas al crear.
- **Con campaña:** KPIs (recaudado/meta/progreso, nº de donaciones, fechas), **accesos rápidos** a edición de campaña,
  donaciones, voluntarios, aliados, transparencia y página pública, y **checklist** del estado de las secciones públicas.
- i18n es/en: bloque `adminChocofest` (~33 claves) con paridad verificada.

**Nota:** el panel **no duplica** el CRUD existente (campañas, donaciones, galería, gastos ya viven en el admin);
actúa como **hub** de la campaña y evita inventar datos al crear.

---

## 12. Fase 3 · Bloque F — Accesibilidad, SEO y build

| # | Comprobación | Comando | Resultado |
|---|---|---|---|
| 40 | Typecheck frontend | `pnpm --filter @workspace/red-solidaria typecheck` | ✅ EXIT=0 |
| 41 | Pruebas frontend (node) | `pnpm --filter @workspace/red-solidaria test` | ✅ **16/16** |
| 42 | Pruebas frontend (vitest) | idem | ✅ **22/22** (7 archivos) |
| 43 | Build de producción (Vite) | `pnpm --filter @workspace/red-solidaria build` | ✅ EXIT=0 |
| 44 | Build del root (sin sandbox) | `pnpm run build` | ✅ EXIT=0 — 0 apariciones de `mockup-sandbox` |

**Cambios:**
- **FE-06 (a11y):** `role="radiogroup"`/`role="radio"`+`aria-checked` en los grupos de selección única
  (`volunteer.tsx` disponibilidad; `report-form.tsx` tipo y urgencia); `role="group"`+`aria-pressed` en el grupo
  múltiple de intereses; toggle con `role="switch"`; `aria-label` correcto en el `Navbar`.
- **FE-09 (SEO):** añadido `<SEO>` a `transparency.tsx`, `adoptions.tsx` y `volunteer.tsx` (ahora 9 páginas con SEO).
- **FE-12:** sustituido el hack `innerHTML` del `Navbar` (inyectaba un SVG como string) por un **fallback React**
  (SVG de corazón siempre presente; la imagen se oculta si falla).
- **INF-04:** `build`/`typecheck` del root ya no compilan `mockup-sandbox`.

**Pendiente:** FE-09 completo (`BASE_URL` hardcodeado, `hreflang`, JSON-LD) y FE-10/FE-11 (zod duplicado, formulario
admin de donaciones sin RHF/Zod).








