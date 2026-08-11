# Roadmap y Estado — Red Solidaria San Ramón

> Última actualización: 2026-08-11 · HEAD: `ab83e90` (Fases 3, 4 y 5 implementadas localmente, sin commitear)

## 🏁 Historial reciente (commits en `origin/main`)

| Commit | Contenido |
|---|---|
| `ab83e90` | Docs: roadmap y estado del proyecto — pendientes para continuar |
| `baae82a` | Rediseño frontend **fase 2**: mapa de campañas (leaflet lazy, migración 007 lat/lng, toggle Grilla/Mapa, campos en admin) |
| `ce59a27` | Rediseño frontend **fase 1**: dark mode (paleta `.dark`, toggle, anti-FOUC), `EmptyState`, skeletons con tokens |
| `a07af0a` | Auditoría externa: 0 vulnerabilidades (overrides), montos `numeric(12,2)` (tipo `money`, migración 006), dashboard con agregaciones SQL, loginLimiter con `username`, `console.*` → logger Pino, CI con `pnpm audit`, Dependabot |
| `f4d9bfe` | Exports: CI y ledger SQL para Storm_Network |
| `538eaae` | Exports: CI y referencia de ledger para shareish y patchwork |
| `0647b9e` | Ledger Trust Pay: movimientos hash-chained verificables (migración 005, endpoints, UI, anclaje) |
| `7a38507` | Auditoría de rendimiento: sourcemaps off en prod, brotli, compresión y caché en API |

## 📍 Roadmap pendiente (rediseño frontend)

- [x] **Fase 3 — Modo emergencia + QR**
  - [x] Banner urgente + countdown para campañas con `endDate` próxima (umbral: 7 días; en detalle, strip en `/campanas` y badge en tarjetas)
  - [x] QR para compartir campañas (`qrcode.react`, modal con descarga PNG y copiar enlace; chunk lazy)
- [x] **Fase 4 — i18n es/en** (`react-i18next`)
  - [x] Infraestructura: react-i18next, recursos `es`/`en` tipados, switcher ES/EN (navbar), persistencia + `<html lang>`, SEO con `hreflang`/`og:locale` dinámico, fechas con locale de date-fns
  - [x] Layout y compartidos: Navbar, Footer, MobileBottomNav, FloatingWhatsApp, DonationModal, CampaignCard, UrgencyBanner, ShareButtons, SEO, ErrorBoundary, 404, LanguageSwitcher, ImageUploadField
  - [x] Páginas principales: home, campañas, detalle de campaña, casos urgentes, noticias, contacto, nosotros, cómo ayudar
  - [x] **Fase 4b**: resto de públicas — transparencia, transparencia de campaña, adopciones, detalle/publicar mascota, bienestar animal, voluntariado, aliados, catálogo, reportar
  - [x] Validación de imágenes i18n: `validateProofImage` devuelve códigos (`type`/`size`) y `UploadError` con código (`init`/`upload`)
  - [x] Tests de paridad es/en (claves, interpolaciones, cadenas sin traducir con allowlist documentada)
  - [ ] Panel admin se mantiene en español (decisión consciente: herramienta interna)
- [x] **Fase 5 — Tests frontend** (Vitest 4 + Testing Library + jsdom)
  - [x] Infra: `vitest.config.ts`, setup con stubs de jsdom (matchMedia, ResizeObserver, scrollTo, canvas-confetti), `renderWithProviders` (react-query + toasts + router con `memoryLocation`)
  - [x] DonationModal: validación de monto mínimo y flujo completo de donación (paso 2 → éxito con ID)
  - [x] AdminLogin: validación de campos, flujo 2FA (TOTP) con acceso y código incorrecto
  - [x] Ledger Trust Pay: movimientos con hash corto, badge de integridad, alerta de cadena comprometida y estado vacío
  - [x] LanguageSwitcher: cambio de idioma + `<html lang>` + persistencia
  - [x] **Bug real encontrado y corregido**: el paso TOTP usaba `FormLabel` fuera del `Form` provider (crasheaba la pantalla de 2FA en producción); ahora usa `<label>` nativo
  - [x] CI: `pnpm -r --if-present test` ya ejecuta node:test + vitest (20 tests en total)
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
s embebidas 001-007 (`lib/db/src/migrate.ts`) corren al boot
- Matar postgres: `pkill -9 -x postgres` (NUNCA `-f`: la URL de la DB contiene "postgres" y mataría el propio shell)
- El sandbox mata procesos en background al terminar cada comando: el E2E debe ir completo en un solo comando
