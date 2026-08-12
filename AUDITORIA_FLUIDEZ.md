# Auditoría de Optimización para la Fluidez — Verificación y Correcciones

**Fecha de verificación:** 12 de agosto de 2026
**Rama:** main
**Alcance:** Contrastar contra el código real la auditoría de fluidez previa, corregir los bugs críticos encontrados e implementar las mejoras confirmadas.

---

## 1. Verificación de la auditoría original

### Hallazgos confirmados ✅

| Hallazgo | Evidencia |
|---|---|
| Lazy loading por ruta (22+ páginas + todo el admin) | `src/App.tsx` (`lazy()` + `Suspense` + `PageLoader`) |
| Pre-compresión gzip nivel 9 / brotli nivel 11 | Plugin `precompressBuildAssets` en `vite.config.ts` |
| Preload del chunk home (`<link rel="modulepreload">`) | Plugin `preloadHomeChunk` (verificado en el `index.html` del build) |
| Caché HTTP pública 60s en GETs públicos | `middleware/cache-control.ts` (`publicApiCache`) |
| Compresión API `threshold: 256` | `app.ts:96` |
| Índices DB (13 índices) | `lib/db/src/migrations/001_add_indexes.sql` |
| React Query `staleTime: 60s` + `refetchOnWindowFocus: false` | `src/App.tsx:59-60` |
| Bundle principal sin split de vendor | **Confirmado, pero desactualizado:** el chunk principal era **~803 kB** (no 676 kB) en el build del 12/08/2026 |
| Sin Redis / Service Worker / Sentry / web-vitals | Confirmado (no están en `package.json`) |

### Hallazgos inexactos de la auditoría ❌

| Afirmación de la auditoría | Realidad |
|---|---|
| "No se encontraron usos de `memo`, `useCallback` o `useMemo`" | **Falso en parte:** `useCallback`/`useMemo` sí existen en componentes shadcn (`sidebar`, `field`, `chart`, `carousel`). Solo faltaba `React.memo` en componentes de listado. |
| "Sin lazy loading de imágenes" | **Falso en parte:** `loading="lazy"` ya existía en home, `CampaignCard` y `CampaignMap`. Sí faltaba en ~15 imágenes de páginas públicas. |
| "Posibles N+1 queries — auditar con Drizzle relations" | **No confirmado:** no hay queries en bucle sobre listados; los joins son manuales con `leftJoin`. Solo existe un N+1 latente mitigado en `formatDonation` (donations.ts:428). El schema no define `relations` de Drizzle (solo `pgTable`). |

---

## 2. Bugs críticos descubiertos y corregidos 🔴

### 2.1 Fuga de datos privados en `GET /campaigns/:id/evidence` y `/campaigns/:id/expenses`

**Problema:** ambos endpoints eran públicos (sin auth) y devolvían por defecto TODAS las filas, incluidas las `is_public=false` (gastos internos con responsable, observaciones y URLs de comprobantes). Además `publicApiCache` les añadía `Cache-Control: public, max-age=60`, amplificando la fuga vía CDNs/proxies. El propio comentario del código decía "solo administrador o superadmin".

**Fix aplicado:**
- Los GET públicos ahora filtran `is_public=true` **en SQL** (nunca salen filas privadas).
- Nuevos endpoints admin protegidos (gate global `/admin/*` + `requireRole(ADMIN)`): `GET /admin/campaigns/:id/evidence` y `GET /admin/campaigns/:id/expenses`.
- El panel admin (`admin/campaign-detail.tsx`) usa ahora los hooks `useAdminCampaignExpenses`/`useAdminCampaignEvidence` (con sesión) en lugar de los públicos.
- Tests: `tests/evidence-expenses-auth.test.mjs` (7 casos: público sin gate, admin exige sesión).

### 2.2 Página pública de transparencia rota (404)

**Problema:** `GET /campaigns/:id/transparency` **no existía** — `campaign-transparency.ts` era una copia byte-idéntica de `dashboard.ts` (ambos registraban `/admin/dashboard`, duplicando la ruta y dejando `dashboard.ts` como código muerto). El frontend (`use-phase3.ts`) consumía el endpoint → 404 en `/campanas/:id/transparencia`.

**Fix aplicado:** `campaign-transparency.ts` reescrito con `GET /campaigns/:id/transparency` real: agregados en SQL con `FILTER` (recaudado aprobado, gastado total/público, donantes, conteos) + listas públicas de gastos/evidencias + últimos movimientos del ledger, en un único request (`Promise.all`). Reutiliza `formatExpense`/`formatEvidence` exportados desde sus routers.

---

## 3. Mejoras implementadas ✅

### 3.1 Lazy loading de imágenes (auditoría: media prioridad)
`loading="lazy"` + `decoding="async"` añadidos en las imágenes fuera del viewport de: `news`, `urgent-cases`, `pet-detail` (galería y miniaturas), `adoptions`, `allies`, `campaign-transparency` (grid), `campaign-detail` (galería) y `home` (logos). **Excluidas a propósito:** imágenes LCP (hero de `campaign-detail` y `news`) e imágenes de lightboxes (se renderizan bajo demanda).

### 3.2 Cloudinary `f_auto`/`q_auto` (auditoría: alta prioridad)
Nuevo helper `src/lib/image-url.ts` (`optimizeImageUrl`) que añade `f_auto,q_auto[,w_]` a URLs de Cloudinary (WebP/AVIF automático, ~30-50% menos peso) y deja intactas las de terceros (Unsplash ya sirve `auto=format`). Aplicado en los `src` de imágenes de campañas, mascotas, reportes, evidencias, aliados y noticias. Tests: `tests/vitest/image-url.test.ts` (5 casos).

### 3.3 React.memo en componentes de listado (auditoría: media prioridad)
`CampaignCard` y `PetCard` (adopciones) envueltas en `React.memo` para evitar re-renderizados al re-renderizar el padre.

### 3.4 Split de vendor conservador (auditoría: alta prioridad)
**Contexto:** el proyecto ya había intentado `manualChunks` y rompió producción (imports circulares → página en blanco). El 12/08/2026 se reintentó con un enfoque seguro y se validó:

| Intento | Resultado | Decisión |
|---|---|---|
| Bucket catch-all `vendor` (todo node_modules) | +40% bytes iniciales; recharts/leaflet arrastrados al eager; ciclo `vendor ↔ vendor-react` | Descartado |
| Exclusión de lazy-deps vía `undefined` | Rollup las mete igual en vendor eager | Descartado |
| **Split conservador final:** solo `vendor-react` (react + react-dom + scheduler + react-redux + react-is + hoist-non-react-statics + use-sync-external-store + @tanstack/react-query) y `vendor-ui` (framer-motion + lucide-react) | Sin ciclos; entry **803 kB → 271 kB**; recharts (dashboard) y leaflet (mapa) siguen en sus chunks lazy | **Implementado** |

**Resultado del build validado:**
- Chunk de entrada: **803 kB → 271 kB** (gzip 81 kB); `vendor-react` 433 kB (gzip 131 kB), `vendor-ui` 168 kB (gzip 57 kB).
- Sin warnings de chunk circular; `modulepreload` de home intacto; pre-compresión `.gz`/`.br` generada para todos los chunks.
- Todo el contenido de React y sus consumidores CJS vive en el mismo chunk → se elimina el riesgo histórico de orden de inicialización.
- Beneficio colateral: los vendor chunks son inmutables → caché larga entre deploys (los cambios de la app solo invalidan `index-*` y los chunks lazy).

### 3.5 Validación completa
- **API:** `pnpm typecheck` OK · `pnpm test` **110/110** (incluidos 7 nuevos).
- **Frontend:** `pnpm typecheck` OK · `pnpm build` OK · `pnpm test` **27/27** (11 node + 16 vitest, incluido el nuevo `image-url.test.ts`).
- Smoke test del build servido con `vite preview`: HTML + chunks 200, preloads correctos.

---

## 4. Recomendaciones NO implementadas (decisión documentada)

| # | Recomendación | Motivo de la decisión |
|---|---|---|
| 1 | **Redis** para caché de consultas DB | Requiere infraestructura adicional (servidor Redis + cambios en `render.yaml`/deploy). El caché HTTP de 60s + React Query cubren el caso actual; revisar al escalar. |
| 2 | **Paginación** en `/pets`, `/reports/urgent`, `/reports/featured`, `/testimonials` | Tablas pequeñas hoy; cambiaría el contrato de la API y obligaría a ajustar el frontend. Ya pagan `/campaigns`, `/news`, `/campaigns/:id/donors`, `/campaigns/:id/movements` y `/donations` (admin). Revisar cuando crezcan. |
| 3 | **Service Worker (Workbox)** para precaching | Costo de mantenimiento alto para el beneficio actual (assets ya inmutables + brotli). |
| 4 | **web-vitals / Sentry** | No hay infraestructura de analytics conectada; `.env.example` ya contempla Sentry. Pendiente de decisión del equipo. |
| 5 | **Placeholders blur-up** de imágenes | Mejora cosmética de percepción; el skeleton `animate-pulse` ya cubre la carga. |
| 6 | **Auditoría N+1 con Drizzle relations** | No hay N+1 reales en listados (verificado). Si se introducen `relations`, usarlas con `leftJoin` como ya se hace. |
| 7 | **Documentar los endpoints Phase 3 en la spec OpenAPI** (`/campaigns/:id/transparency`, `/admin/campaigns/:id/expenses`, `/admin/campaigns/:id/evidence`, movements/ledger) | El frontend los consume con fetch directo (`use-phase3.ts`), no con el cliente generado; la spec no los cubre. Pendiente para el flujo de generación de clientes. |

---

## 5. Archivos modificados

**API (`artifacts/api-server`):**
- `src/routes/campaign-evidence.ts` — GET público filtra `is_public`; nuevo GET admin; exporta `formatEvidence`.
- `src/routes/campaign-expenses.ts` — idem para gastos; exporta `formatExpense`.
- `src/routes/campaign-transparency.ts` — reescrito: `GET /campaigns/:id/transparency` real.
- `build-tests.mjs` — nuevos entryPoints.
- `tests/evidence-expenses-auth.test.mjs` — tests de seguridad (nuevo).

**Frontend (`artifacts/red-solidaria`):**
- `src/lib/image-url.ts` — helper `optimizeImageUrl` (nuevo).
- `src/hooks/use-phase3.ts` — hooks admin `useAdminCampaignExpenses`/`useAdminCampaignEvidence`.
- `src/pages/admin/campaign-detail.tsx` — usa los hooks admin.
- `vite.config.ts` — split de vendor conservador (`vendor-react`, `vendor-ui`).
- `src/components/shared/CampaignCard.tsx`, `src/pages/adoptions.tsx`, `news.tsx`, `urgent-cases.tsx`, `pet-detail.tsx`, `allies.tsx`, `campaign-transparency.tsx`, `campaign-detail.tsx`, `home.tsx` — lazy loading + `optimizeImageUrl` + `React.memo`.
- `tests/vitest/image-url.test.ts` — tests del helper (nuevo).
