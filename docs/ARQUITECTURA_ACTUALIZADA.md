# Arquitectura Actualizada — Red Solidaria San Ramón

> Estado tras las Fases 1-3 del *Prompt Maestro* (auditoría + estabilización + ChocoFest 2026).
> Complementa a `docs/AUDITORIA_INTEGRAL_2026.md`.

---

## 1. Vista general

Monorepo **pnpm** (`pnpm-workspace.yaml`), Node **>=22** (`.nvmrc` = 24), `packageManager: pnpm@10.34.5`.
Gestor: `pnpm`. Despliegue: **Render** (ver `docs/DESPLIEGUE_RENDER.md`).

```
artifacts/
  api-server/   Backend Express 5 + Drizzle (rutas, middleware, lib)
  red-solidaria/ Frontend React 19 + TS + Vite 7 (SPA pública + panel admin)
  mockup-sandbox/ Sandbox de diseño (shadcn) — NO es producto
lib/
  db/            Esquema Drizzle + migrador embebido (migrate.ts) + pool
  api-zod/       Esquemas Zod (declarados; las rutas usan drizzle-zod + Zod inline)
  api-client-react/ Cliente/hooks generados (useGetCampaign, useGetCampaigns, ...)
  api-spec/      Especificación
scripts/         Importadores manuales (apply-*.ts) + post-merge.sh
```

## 2. Flujo de datos (frontend → API → DB)

- El frontend usa hooks de `@workspace/api-client-react` (TanStack Query) contra `/api/*`.
- `GET /api/campaigns` devuelve campañas con `donorCount` y `raisedFromDonations` (agregados en SQL).
- `GET /api/campaigns/:id` + `/updates` + `/images` + `/donors` alimentan el detalle de campaña.
- La transparencia por campaña la expone `useCampaignTransparency` (`/api/campaign-transparency/...`).

## 3. Integridad financiera (ledger hash-chained)

- `lib/ledger.ts`: `computeMovementHash` / `verifyChain` (puras) + `appendMovement` (encadena en la BD).
- **Corregido (A1):** `appendMovement` lee el último asiento con `id DESC` (antes `ASC` rompía la cadena
  desde el 3.er movimiento). `verifyLedger` mantiene orden ascendente.
- El ledger se alimenta al aprobar donaciones y al registrar gastos, dentro de transacciones.

## 4. Validación y autorización

- **Validación de donaciones:** `lib/donation-validation.ts` (`donationInputSchema`, máquina de estados,
  `approvalRequiresProof`, `isValidProofUrl`). El backend la aplica en `POST`/`PUT /donations`.
- **Autorización:** gate global `router.use("/admin", requireAdmin, adminActionLimiter)` + `requireRole`.
- **2FA:** TOTP (`lib/totp.ts`) con lockout (`lib/two-factor-lockout.ts`).
- **Auditoría:** `logAuditAction` registra quién aprueba/rechaza/cambia estado.

## 5. Migraciones y esquema

- **Fuente de verdad del esquema:** `lib/db/src/schema/*` (Drizzle).
- **Aplicación:** `lib/db/src/migrate.ts` (migraciones versionadas 001-009 embebidas) se ejecuta
  **antes** de `app.listen()` (A4) y hace `process.exit(1)` si falla.
- **Retirado:** `drizzle-kit push` de `scripts/post-merge.sh` (era destructivo — DB-01).
- Pendientes de autorización: ver `docs/MIGRACIONES_Y_RESPALDOS.md`.

## 6. Importadores idempotentes (B1-B4)

- `lib/donation-reconcile.ts`: `donationKey` + `planDonationInsert` (diff multiconjunto, puro).
- `scripts/src/apply-chocofest-2025.ts` y `apply-chocolatada-2024.ts`: **sin `DELETE`**, transaccionales,
  actualizan la campaña preservando `featured`/`status`/`raised`.

## 7. ChocoFest 2026 (Bloque C)

- Página pública: `src/pages/chocofest-2026.tsx` (13 secciones) en `/campanas/chocofest-2026`
  (ruta registrada **antes** de `/campanas/:id`).
- Resolución de campaña: `src/lib/chocofest.ts` (`findChocofest2026`, por título; estado «en preparación»
  si no existe). Contenido provisional marcado; sin datos inventados.
- i18n es/en: bloque `chocofest` en `src/lib/i18n/locales/{es,en}.ts`.

## 8. Salud y despliegue

- `/api/healthz` — liveness (sin tocar la BD).
- `/api/readyz` — readiness con `SELECT 1` + timeout 2 s → **503** si la BD no responde (A5).
- Build de API: `artifacts/api-server/build.mjs` → `dist/index.mjs` (coincide con el `startCommand`).
- Build de web: `vite build` → `dist/public` con `.gz`/`.br` y chunk lazy por página.

## 9. Deuda técnica conocida

Ver `docs/AUDITORIA_INTEGRAL_2026.md` (65 hallazgos). Bloques A y B cerrados salvo:
A3 (FK `RESTRICT`), IMP-04 (columna única), DB-05..09 (migraciones) y C5/C7 (especie/inventario y admin).
