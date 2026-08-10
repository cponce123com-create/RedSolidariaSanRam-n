# Roadmap y Estado — Red Solidaria San Ramón

> Última actualización: 2026-08-10 · Último commit: `baae82a` (todo pusheado, working tree limpio)

## 🏁 Historial reciente (commits en `origin/main`)

| Commit | Contenido |
|---|---|
| `7a38507` | Auditoría de rendimiento: sourcemaps off en prod, brotli, compresión y caché en API |
| `0647b9e` | Ledger Trust Pay: movimientos hash-chained verificables (migración 005, endpoints, UI, anclaje) |
| `538eaae` | Exports: CI y referencia de ledger para shareish y patchwork |
| `f4d9bfe` | Exports: CI y ledger SQL para Storm_Network |
| `a07af0a` | Auditoría externa: 0 vulnerabilidades (overrides), montos `numeric(12,2)` (tipo `money`, migración 006), dashboard con agregaciones SQL, loginLimiter con `username`, `console.*` → logger Pino, CI con `pnpm audit`, Dependabot |
| `ce59a27` | Rediseño frontend **fase 1**: dark mode (paleta `.dark`, toggle, anti-FOUC), `EmptyState`, skeletons con tokens |
| `baae82a` | Rediseño frontend **fase 2**: mapa de campañas (leaflet lazy, migración 007 lat/lng, toggle Grilla/Mapa, campos en admin) |

## 📍 Roadmap pendiente (rediseño frontend)

- [ ] **Fase 3 — Modo emergencia + QR**
  - Banner urgente + countdown para campañas con `endDate` próxima
  - QR para compartir campañas (inspirado en Storm_Network)
- [ ] **Fase 4 — i18n es/en** (`react-i18next`)
- [ ] **Fase 5 — Tests frontend** (Vitest + Testing Library): DonationModal, login, 2FA, ledger
- [ ] **Fase 6 — Observabilidad y PWA**: Sentry (hoy los errores solo van a la consola del navegador) + service worker offline
- [ ] **Fase 7 — Círculos de confianza** (perfil: familia → vecinos → comunidad, inspirado en Storm_Network)

## ⚠️ Decisiones pendientes

1. **`exports/`** — contiene entregables para shareish, patchwork y Storm_Network (no es código de Red Solidaria). La auditoría externa recomienda eliminarlo del repo; fue commiteado por orden explícita. **Decidir: borrar / mantener / mover a branch.**
2. **Spec OpenAPI sin regenerar** — el tipo generado (`api-client-react`) no incluye `latitude`/`longitude`; hay casts locales documentados en `CampaignMap.tsx` y `admin/campaign-detail.tsx`. Regenerar con orval (`lib/api-spec`) para tipado limpio.
3. **`mockup-sandbox`** — compila en el build (`pnpm -r`); decidir si sale del pipeline de CI.

## 🔧 Cómo validar el proyecto

```bash
export PATH="/home/user/.global_modules/bin:$PATH"   # el PATH del sandbox no expande ~
pnpm typecheck
pnpm --filter @workspace/api-server test              # 65 tests (node:test + esbuild harness)
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/red-solidaria run build
pnpm audit --prod                                     # 0 vulnerabilidades
```

**E2E con Postgres real** (binarios en `/nix/store/...postgresql-17.7/bin`):
- `drizzle push` (`pnpm --filter @workspace/db run push`) crea el schema base; las migraciones embebidas 001-007 (`lib/db/src/migrate.ts`) corren al boot
- Matar postgres: `pkill -9 -x postgres` (NUNCA `-f`: la URL de la DB contiene "postgres" y mataría el propio shell)
- El sandbox mata procesos en background al terminar cada comando: el E2E debe ir completo en un solo comando
