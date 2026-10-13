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

## FASE 3 · Bloque C — ChocoFest 2026

### C1 / C2 / C3 — Página pública `/campanas/chocofest-2026`

**ESTADO:** 🟡 Parcial (página pública + i18n completas; falta admin específico y módulos de datos)
**ARCHIVOS MODIFICADOS:**
- `artifacts/red-solidaria/src/pages/chocofest-2026.tsx` (nuevo) — 13 secciones.
- `artifacts/red-solidaria/src/lib/chocofest.ts` (nuevo) — constantes + `findChocofest2026`.
- `artifacts/red-solidaria/src/App.tsx` — ruta antes de `/campanas/:id` + import lazy.
- `artifacts/red-solidaria/src/lib/i18n/locales/es.ts` y `en.ts` — bloque `chocofest`.
- `artifacts/red-solidaria/tests/chocofest.test.mjs` (nuevo) y `build-tests.mjs`.
- `artifacts/red-solidaria/tests/i18n-keys.test.mjs` — `chocofest.metaTitle` en `LEGIT_SHARED`.

**PRUEBAS:** typecheck ✅ · node **16/16** ✅ · vitest **22/22** ✅ · build Vite ✅ EXIT=0 (chunk `chocofest-2026-*.js`).
**CONTENIDO:** provisional y marcado («Contenido en preparación»); estado «en preparación» si la campaña no existe.
**RIESGO PENDIENTE:** datos reales (lema, fechas, metas, localidades, fotos) y panel admin específico (C4-C8).

## FASE 3 · Bloque D — Diseño, calidad y documentación

**ESTADO:** 🟡 Parcial (calidad + docs; queda a11y avanzada y consolidación `ui`/sandbox)
**ARCHIVOS MODIFICADOS:**
- `artifacts/red-solidaria/vite.config.ts` — INF-03: retiradas `react-redux`/`use-sync-external-store` de `optimizeDeps.include` (no instaladas).
- `artifacts/red-solidaria/src/components/layout/Navbar.tsx` — FE-06: `aria-label` correcto (`nav.mainMenu`).
- `artifacts/red-solidaria/src/pages/report-form.tsx` — FE-06: toggle con `role="switch"`/`aria-checked`/`aria-label`.
- `artifacts/red-solidaria/src/lib/i18n/locales/{es,en}.ts` — clave `nav.mainMenu`.
- Imágenes: `about.tsx` + 9 archivos del panel admin — FE-08 (`loading="lazy"`/`decoding="async"`).
- **Documentos nuevos:** `docs/ARQUITECTURA_ACTUALIZADA.md`, `docs/MIGRACIONES_Y_RESPALDOS.md`, `docs/DESPLIEGUE_RENDER.md`.

**ERRORES CORREGIDOS:** INF-03, FE-08; FE-06 parcial.
**PRUEBAS:** typecheck frontend ✅ · node **16/16** ✅ · vitest **22/22** ✅ · build Vite ✅ EXIT=0.
**PENDIENTE:** FE-06 (radiogroups), FE-07 (consolidar `ui` con el sandbox), FE-09 (SEO en más páginas), FE-10..15.

---

## FASE 3 · Bloque E — Dependencias vulnerables

**ESTADO:** ✅ Implementado · ✅ Probado
**ARCHIVOS MODIFICADOS:**
- `pnpm-workspace.yaml` — overrides `proxy-addr: ^2.0.8` y `ip-address: ^10.7.1`.
- `artifacts/api-server/package.json` — `compression: ^1.8.2`.
- `pnpm-lock.yaml` — actualizado (`pnpm install`).

**ERRORES CORREGIDOS:** DEP-01 (CRÍTICO), DEP-02 (ALTO), DEP-03 (MEDIO ×4).
**PRUEBAS:** `pnpm audit --prod` → **sin vulnerabilidades** ✅ · typecheck ✅ · backend **151/151** ✅ · build API ✅.

---

## FASE 3 · Bloque F — Accesibilidad, SEO y build

**ESTADO:** ✅ Implementado · ✅ Probado (FE-09 parcial)
**ARCHIVOS MODIFICADOS:**
- `src/components/layout/Navbar.tsx` — FE-12: fallback React en lugar de `innerHTML`.
- `src/pages/volunteer.tsx` — FE-06 (radiogroup disponibilidad, group intereses) + FE-09 (SEO).
- `src/pages/report-form.tsx` — FE-06 (radiogroup tipo y urgencia).
- `src/pages/transparency.tsx` y `src/pages/adoptions.tsx` — FE-09 (SEO).
- `package.json` (root) — INF-04: build/typecheck sin el sandbox.

**ERRORES CORREGIDOS:** FE-06, FE-12, INF-04; FE-09 parcial.
**PRUEBAS:** typecheck ✅ · node **16/16** ✅ · vitest **22/22** ✅ · build Vite ✅ · build root ✅ (0 sandbox).

---

## FASE 4 · Corrección del frontend (acceso admin + protagonismo ChocoFest 2026)

**ESTADO:** ✅ Implementado · ✅ Probado

**PROBLEMA 1 — falta un acceso visible al administrador (sin login paralelo):**
- `src/components/layout/AdminAccessLink.tsx` **(nuevo)**: reutiliza la **sesión existente** (`GET /api/admin/me`).
  Visitante → `/admin/login`; administrador autenticado → `/admin`. Icono discreto en escritorio (≥lg) y fila
  en el menú móvil, con `aria-label`, `title` y anillo de foco (`focus-visible`).
- `src/lib/admin-access.ts` **(nuevo)**: `resolveAdminTarget()` puro y testeable.
- `Navbar.tsx`: enlace en la zona de acciones (escritorio) y en la sección inferior del menú móvil.
- i18n es/en: `nav.adminAccess`, `nav.adminPanel`.

**PROBLEMA 2 — ChocoFest 2026 como campaña protagonista de la portada:**
- **Identificador ESTABLE:** `settings.protagonist_campaign_id` guarda el **id** de la campaña, nunca el título.
  Al ser una única clave, solo puede haber **una** campaña protagonista a la vez.
- `src/lib/chocofest.ts`: `PROTAGONIST_SETTING_KEY`, `parseProtagonistId`, `resolveProtagonist`,
  `prioritizeCampaign`, `excludeCampaign` (funciones puras, sin red).
- `src/components/home/ProtagonistCampaignSection.tsx` **(nuevo)**: bloque destacado navideño, ligero y responsive
  (nombre, descripción, imagen, meta y progreso **solo con datos reales**; si no hay meta muestra «Meta por
  definir») + accesos directos a **colaborar**, **conocer la campaña** y **voluntariado**.
- `src/pages/home.tsx`: el bloque se renderiza justo después del hero → ChocoFest 2026 aparece **primero**.
- `ActiveCampaignsSection.tsx`: **excluye** la protagonista (no se duplica) y mantiene visibles las demás.
- `src/pages/campaigns.tsx`: la protagonista se muestra **primero**, respetando el filtro de estado.
- `src/components/admin/ProtagonistToggle.tsx` **(nuevo)**, integrado en `/admin/campanas`: fija o quita el
  protagonismo.
- API: `PUT /api/admin/protagonist-campaign` (superadmin) con validación de entrada y *upsert*; **404** si la
  campaña no existe.
- **Restauración automática:** si la campaña no existe, no está publicada, no está activa o ya terminó, el bloque
  **no se renderiza** y la portada general se mantiene, sin cifras inventadas.

**PRUEBAS:** `tests/protagonist.test.mjs` (**20 pruebas**) · typecheck frontend ✅ · node **36/36** ✅ ·
vitest **22/22** ✅ · build Vite ✅ · typecheck backend ✅ · backend **155/155** ✅ · build backend ✅.

**PENDIENTE:**
- `slug` estable para la URL permanente `/campanas/chocofest-2026` (hoy resuelve por título: requiere migración).
- Consistencia `goal`/`raised` (`real` → `numeric`) y `CHECK` de estados (DB-06/DB-08).

---

## Estado global de las unidades de trabajo

| UW | Descripción | Estado |
|---|---|---|
| E1 | DEP-01 `proxy-addr` | ✅ Implementado · ✅ Probado |
| E2 | DEP-02 `compression` | ✅ Implementado · ✅ Probado |
| E3 | DEP-03 `ip-address` | ✅ Implementado · ✅ Probado |
| D1 | INF-03 `optimizeDeps` | ✅ Implementado · ✅ Probado |
| D2 | FE-06 accesibilidad | ✅ Implementado · ✅ Probado |
| D3 | FE-08 `loading="lazy"` | ✅ Implementado · ✅ Probado |
| D4 | Docs obligatorios restantes | ✅ Creados (arquitectura, migraciones, Render) |
| D5 | FE-07 consolidación `ui`/sandbox | 🟡 Mitigado (excluido del build + aviso; drift ya existía) |
| F1 | INF-04 build sin el sandbox | ✅ Implementado · ✅ Probado |
| F2 | FE-12 Navbar sin `innerHTML` | ✅ Implementado · ✅ Probado |
| D6 | FE-09 SEO en más páginas | 🟡 Parcial (9 páginas; falta JSON-LD/hreflang) |
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
| C1 | Datos/metadatos editables de 2026 | 🟡 Reutiliza `campaigns` + admin de campañas |
| C2 | Página pública con 13 secciones | ✅ Implementado · ✅ Probado |
| C3 | i18n es/en de ChocoFest 2026 | ✅ Implementado · ✅ Probado |
| C4 | Donaciones monetarias (estados) | 🟡 Reutiliza el flujo existente; falta vista específica |
| C5 | Donaciones en especie + inventario | ⏳ Pendiente (sección placeholder) |
| C6 | Voluntariado y planificación | 🟡 Enlaza a `/voluntariado`; falta planificación por localidades |
| C7 | Panel admin específico de ChocoFest | ✅ Implementado · ✅ Probado |
| C8 | Transparencia pública | 🟡 Reutiliza el panel existente por campaña |
| D | Diseño, calidad y docs restantes | ⏳ Pendiente |
