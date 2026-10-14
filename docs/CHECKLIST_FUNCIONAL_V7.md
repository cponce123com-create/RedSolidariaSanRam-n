# CHECKLIST FUNCIONAL V7 — Red Solidaria San Ramón

**Rama:** `feat/implementacion-integral-2026` · **Fecha:** 14 de octubre de 2026
**Estados:** `IMPLEMENTADO Y PROBADO` · `IMPLEMENTADO SIN PRUEBA COMPLETA` · `PARCIAL` ·
`PENDIENTE` · `BLOQUEADO`
**Evidencia de validación:** pruebas ejecutadas en este entorno (`api-server` 329/329 ·
`red-solidaria` 165/165 node:test + 29/29 vitest · typecheck 0 en libs/API/frontend/scripts ·
build de producción OK · `pnpm audit --prod` 0 vulnerabilidades · **E2E 41/41 contra
PostgreSQL real**).
No se usan porcentajes de avance.

---

## 1. Seguridad e integridad (Fase 1)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Auditoría de dependencias de producción | **IMPLEMENTADO Y PROBADO** | `pnpm-lock.yaml` | `pnpm audit --prod` → 0 vulnerabilidades |
| Auditoría de dependencias de desarrollo | **PARCIAL** | toolchain (vite/babel y transitivas) | 66 avisos (11 críticos) **solo dev**; no se actualizan majors a ciegas (recomendación §16 del informe) |
| Inicio/cierre de sesión y autorización por rol | **IMPLEMENTADO Y PROBADO** | `middleware/require-admin.ts`, `roles.ts`, `routes/admin*.ts` | `require-admin.test.mjs`, `require-role.test.mjs`, `admin-users-auth.test.mjs`, `*-auth.test.mjs` |
| 2FA (TOTP) con bloqueo | **IMPLEMENTADO Y PROBADO** | `lib/totp.ts`, `lib/two-factor-lockout.ts`, `routes/admin-2fa.ts` | `admin-2fa.test.mjs`, `totp.test.mjs`, `two-factor-lockout.test.mjs` |
| Gate global de `/admin` + rate limit | **IMPLEMENTADO Y PROBADO** | `routes/index.ts`, `middleware/rate-limit.ts` | `rate-limit.test.mjs`, `supervisor-auth.test.mjs` |
| Registro de acciones administrativas (auditoría) | **IMPLEMENTADO Y PROBADO** | `lib/audit.ts`, `routes/audit-logs.ts` | `audit.test.mjs`, `audit-logs-auth.test.mjs` |
| Cookie de sesión `secure` / `trust proxy` (SEC-01) | **IMPLEMENTADO Y PROBADO** | `app.ts` | Ya estaba correcto (`app.set("trust proxy", 1)` + `secure` en producción); verificado por revisión, no requería cambio |
| Bloqueo de 2FA por ORIGEN + cuenta (SEC-03) | **IMPLEMENTADO Y PROBADO** | `lib/two-factor-lockout.ts`, `routes/admin-2fa.ts` | `two-factor-lockout.test.mjs` (11): dos orígenes no comparten bloqueo, el escape hatch limpia todos los orígenes |
| Gate único de `/admin` verificado por barrido (SEC-08) | **IMPLEMENTADO Y PROBADO** | `routes/index.ts`, `tests/admin-gate-sweep.test.mjs` | 22 rutas GET + 6 escrituras → 401 sin sesión; rutas públicas no bloqueadas; el login no lo intercepta el gate |
| Errores de infraestructura no enmascarados como 400 (API-06) | **IMPLEMENTADO Y PROBADO** | 9 routers (`donations`, `news`, `campaign-evidence`, `campaign-expenses`, `testimonials`, `admin`, `campaign-images`, `campaign-updates`, `contact`, `stats`) | **13 bloques** corregidos: la validación (Zod) sigue siendo 400 y cualquier otro fallo pasa a 500. E2E: 3 cuerpos inválidos → `400 validation_error` contra el servidor real |
| **Verificación del libro contable (cadena de hashes)** | **IMPLEMENTADO Y PROBADO** | `lib/ledger.ts`, `routes/campaign-movements.ts` | `ledger.test.mjs`, `ledger-chain.test.mjs`; endpoints públicos `/movements/verify` y `/ledger/root` |
| **Informe administrativo de integridad del libro** | **IMPLEMENTADO Y PROBADO** | `lib/ledger-audit.ts`, `routes/ledger-audit.ts`, `pages/admin/ledger-audit.tsx` | `ledger-audit.test.mjs` (11) + `ledger-audit-auth.test.mjs` (2) + página `/admin/libro` |
| Restricción real del libro en producción (`RESTRICT`) | **BLOQUEADO** | `docs/migraciones/010_low_risk.sql` | **B-1**: requiere autorización (hoy la API lo impide, la base no) |
| Claves foráneas ausentes (DB-04) | **BLOQUEADO** | esquemas de `lib/db/src/schema` | **B-2**: requiere decidir sobre datos huérfanos |
| Donaciones confirmadas sin asiento (DB-09) | **PARCIAL** | — | **Detectadas** por el informe de V7-3; la regularización es una decisión contable |

## 2. Integración admin ↔ frontend (Fase 2)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Crear, editar, publicar, pausar, finalizar, archivar, restaurar | **IMPLEMENTADO Y PROBADO** | `lib/campaign-lifecycle.ts`, `routes/campaigns.ts` | `campaign-lifecycle.test.mjs` (9), `campaigns-status.test.mjs` (11) |
| Eliminación segura (solo borrador sin dependencias) | **IMPLEMENTADO Y PROBADO** | `lib/campaign-lifecycle.ts` (`deleteBlockReason`) | `campaign-lifecycle.test.mjs`; `23503` → 409 accionable |
| Archivado que conserva historial | **IMPLEMENTADO Y PROBADO** | `campaign-lifecycle.ts`, `routes/campaigns.ts` | transiciones y `HIDDEN_STATUSES` probadas |
| Visibilidad pública de borradores y archivadas | **IMPLEMENTADO Y PROBADO** | `routes/campaigns.ts` (404 público de borrador; listados filtran ambos) | `campaigns-status.test.mjs`; política documentada en `campaign-lifecycle.ts` |
| Sincronización de caché admin → público | **IMPLEMENTADO Y PROBADO** | `lib/query-invalidation.ts`, `middleware/cache-control.ts` | `query-keys.test.mjs`, `cache-control` en `csp.test.mjs`/`performance.test.mjs` |
| No recibir donaciones en campañas no activas | **IMPLEMENTADO Y PROBADO** | `routes/donations.ts` (campaña debe existir y estar `active`) | `donations-auth.test.mjs`; botón deshabilitado en la ficha |
| Pruebas extremo a extremo con PostgreSQL real | **PENDIENTE** | — | Procedimiento documentado en `docs/ROADMAP.md`; requiere ventana y arranque de PostgreSQL |

## 3. Donaciones y transparencia (Fase 3)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| **Recaudación verificada / histórica / conciliada / saldo** | **IMPLEMENTADO Y PROBADO** | `lib/funding.ts`, `routes/campaigns.ts`, `routes/campaign-transparency.ts`, `routes/dashboard.ts` | `funding.test.mjs` (9): invariante, duplicidad, redondeo, negativos |
| Coherencia ficha ↔ transparencia ↔ dashboard | **IMPLEMENTADO Y PROBADO** | los tres anteriores | Misma función pura en los tres; contrato publicado en `openapi.yaml` |
| Fecha de última actualización en transparencia | **IMPLEMENTADO Y PROBADO** | `routes/campaign-transparency.ts`, `pages/campaign-transparency.tsx` | `updatedAt` + prueba de tipos (typecheck) |
| Panel de transparencia público (recaudado, meta, %, gastos, saldo, evidencias) | **IMPLEMENTADO SIN PRUEBA COMPLETA** | `pages/transparency.tsx`, `pages/campaign-transparency.tsx` | Render verificado por typecheck/build; sin pruebas de UI para esta página |
| Registro y adjunto de comprobantes con visibilidad opcional | **IMPLEMENTADO Y PROBADO** | `routes/donations.ts`, `lib/donation-validation.ts` | `donation-validation.test.mjs`, `donations-auth.test.mjs` |
| Historial de cambios del comprobante | **PENDIENTE** | — | No existe; requiere esquema nuevo |
| Tipos de colaboración (dinero, productos, servicios, logística) | **IMPLEMENTADO Y PROBADO** | `lib/donor-identity.ts`, `lib/donation-validation.ts`, `routes/donations.ts`, `pages/admin/donations.tsx` | `donor-identity.test.mjs`, `donation-validation.test.mjs`, `donors-admin.test.mjs` |
| Comprobante obligatorio solo para dinero digital | **IMPLEMENTADO Y PROBADO** | `lib/donation-validation.ts` (`approvalRequiresProof`) | `donation-validation.test.mjs` |

## 4. ChocoFest 2026 y eventos (Fase 4)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Información, objetivos, fecha, lugar y programa del evento | **IMPLEMENTADO Y PROBADO** | `lib/chocofest.ts`, `pages/chocofest-2026.tsx`, `pages/admin/chocofest.tsx` | `chocofest.test.mjs`, `chocofest-program.test.mjs`, `chocofest-readiness.test.mjs` |
| Bienes e insumos con metas y saldo verificable | **IMPLEMENTADO Y PROBADO** | `lib/inventory.ts`, `pages/admin/chocofest.tsx` | `inventory.test.mjs` |
| Presupuesto por categoría con saldo y avance | **IMPLEMENTADO Y PROBADO** | `lib/budget.ts` | `budget.test.mjs` |
| Composición y cobertura de canastas | **IMPLEMENTADO Y PROBADO** | `lib/baskets.ts` | `baskets.test.mjs` |
| Vinculación bien ↔ donante ↔ evidencia | **IMPLEMENTADO Y PROBADO** | `routes/campaign-leftovers.ts` | `leftovers-auth.test.mjs` |
| Colaboraciones en especie separadas de la recaudación monetaria | **IMPLEMENTADO Y PROBADO** | `lib/funding.ts`, `lib/donors-admin.ts` | `funding.test.mjs`, `donors-admin.test.mjs` |
| **Rendición de resultados del evento (4.3)** | **IMPLEMENTADO Y PROBADO** | `src/lib/event-results.ts`, `pages/chocofest-2026.tsx`, `migrate.ts` (020) | `event-results.test.mjs` (10) + E2E contra base real con las 4 claves de la migración 020 verificadas |
| Patrocinios con estados de negociación | **PENDIENTE** | — | Relacionado con B-6 |

## 5. Donantes, voluntarios y auspiciadores (Fase 5)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Registro y panel de donantes con historial | **IMPLEMENTADO Y PROBADO** | `routes/donors.ts`, `pages/admin/donors.tsx`, `pages/admin/donor-detail.tsx` | `donors-admin.test.mjs`, `donor-format.test.mjs`, `donors-auth.test.mjs` |
| Identidad de donante (incluye «organización») | **IMPLEMENTADO Y PROBADO** | `lib/donor-identity.ts`, `lib/donors-admin.ts` | `donor-identity.test.mjs`, `donors-admin.test.mjs` |
| Detección de duplicados | **IMPLEMENTADO Y PROBADO** | `lib/donor-identity.ts` (`findDuplicateGroups`), `routes/donors.ts` | `donor-identity.test.mjs` |
| Conciliación trazable (autor y fecha) | **IMPLEMENTADO Y PROBADO** | `routes/donations.ts`, `routes/donors.ts` | `donation-reconcile.test.mjs`, `confirmed-statuses.test.mjs` |
| Anonimato y comprobante público opcional | **IMPLEMENTADO Y PROBADO** | `routes/campaigns.ts` (listado público) | `donors-auth.test.mjs` |
| Consentimiento explícito y nombre colectivo del donante | **PENDIENTE** | `lib/db/src/schema/donors.ts` | Requiere esquema + interfaz (V7-6) |
| **Certificados digitales con QR** | **BLOQUEADO** | — | **B-3**: decisión de negocio (tipos, vigencia, datos publicados) |
| **Insignias y reconocimientos** | **BLOQUEADO** | — | **B-6**: definición del programa |
| Aliados/auspiciadores con visibilidad pública | **IMPLEMENTADO Y PROBADO** | `routes/allies.ts`, `pages/allies.tsx`, `pages/admin/allies.tsx` | `allies-patch.test.mjs` |
| Embajadores con código de referencia y métricas | **PENDIENTE** | — | Requiere modelo nuevo |

## 6. Dashboard administrativo (Fase 6)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Indicadores reales y coherentes (campañas, recaudado, gastos, saldo, pendientes) | **IMPLEMENTADO Y PROBADO** | `routes/dashboard.ts`, `pages/admin/dashboard.tsx` | `funding.test.mjs` (regla) + typecheck; conteos por SQL con `FILTER` |
| Top de campañas con la misma regla que el sitio público | **IMPLEMENTADO Y PROBADO** | `routes/dashboard.ts` | Misma función pura `campaignFunding` |
| Alertas de integridad del libro en el panel | **IMPLEMENTADO Y PROBADO** | `pages/admin/ledger-audit.tsx` | Página `/admin/libro` con estado global y hallazgos |
| Filtros por campaña, estado y fechas | **IMPLEMENTADO Y PROBADO** | `lib/dashboard-filters.ts`, `routes/dashboard.ts`, `pages/admin/dashboard.tsx` | `dashboard-filters.test.mjs` (11) + barra de filtros en el panel; el servidor recalcula todas las cifras de campaña con el mismo filtro |
| Navegación de cada tarjeta a su detalle | **IMPLEMENTADO Y PROBADO** | `pages/admin/dashboard.tsx` | Las 8 tarjetas del KPI navegan (las financieras a `/admin/libro`) |

## 7. Comunicaciones y WhatsApp (Fase 7)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Número de WhatsApp configurable desde el panel | **IMPLEMENTADO Y PROBADO** | `lib/whatsapp.ts`, `lib/public-settings.ts`, `migrate.ts` (019) | `whatsapp.test.mjs` (10), `public-settings.test.mjs` |
| Mensajes predefinidos editables por propósito | **IMPLEMENTADO Y PROBADO** | idem + `i18n/locales/*` | `whatsapp.test.mjs` (el configurado gana; si está vacío, el del idioma) |
| Eliminación de números ficticios del código | **IMPLEMENTADO Y PROBADO** | `FloatingWhatsApp.tsx`, `how-to-help.tsx`, `stock-catalog.tsx` | `whatsapp.test.mjs`; sin número no hay enlace |
| Contacto por campaña / por tipo | **PARCIAL** | `lib/whatsapp.ts` | Propósitos general/donación/voluntariado/auspicio; falta contacto específico por campaña |
| Mensajería automatizada (Cloud API oficial) | **BLOQUEADO** | — | **B-4**: credenciales y proveedor aprobado |

## 8. Frontend: experiencia, rendimiento y SEO (Fase 8)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Diseño responsive, móvil, jerarquía y formularios | **IMPLEMENTADO SIN PRUEBA COMPLETA** | `pages/**`, `components/**` | Build + typecheck; sin pruebas visuales automatizadas |
| i18n es/en con paridad de claves | **IMPLEMENTADO Y PROBADO** | `lib/i18n/**` | `i18n-keys.test.mjs` |
| Code splitting y carga diferida por ruta | **IMPLEMENTADO Y PROBADO** | `App.tsx`, `vite.config.ts` | Build con chunks por página (salida real del build) |
| Imágenes con `loading="lazy"` | **IMPLEMENTADO SIN PRUEBA COMPLETA** | `components/**` | Verificación por inspección (FE-08 del informe integral) |
| Gate del panel por rol en el cliente (FE-03) | **IMPLEMENTADO Y PROBADO** | `lib/admin-session.ts`, `pages/admin/layout.tsx` | `admin-session.test.mjs` (12) + `vitest/admin-layout-gate.test.tsx` (6): solo el 401 redirige; un 500 o un fallo de red NO expulsan al login; un rol desconocido se explica en pantalla |
| Estados de carga/vacío/error consistentes (FE-04) | **PARCIAL** | `lib/Skeleton.tsx`, `components/shared/EmptyState.tsx`, `pages/admin/layout.tsx` | El panel ya tiene carga, error de servidor (con «Reintentar») y permiso explicados y probados; el resto de páginas mantiene los estados existentes |
| SEO por página (FE-09) y zod unificado (FE-10) | **PARCIAL** | `components/shared/SEO.tsx` | Usado en un subconjunto de páginas |

## 9. Pruebas y despliegue (Fase 9)

| Funcionalidad | Estado | Archivos | Evidencia |
|---|---|---|---|
| Suite de API (permisos, financieras, campañas) | **IMPLEMENTADO Y PROBADO** | `artifacts/api-server/tests/**` | **329/329** (incluye barrido del gate, SEC-03 y filtros del panel) |
| Suite de frontend (node:test + vitest) | **IMPLEMENTADO Y PROBADO** | `artifacts/red-solidaria/tests/**` | **153/153** + **23/23** |
| Validación de tipos en todo el monorepo | **IMPLEMENTADO Y PROBADO** | `tsconfig*.json` | 0 errores (libs, API, frontend, scripts) |
| Compilación de producción | **IMPLEMENTADO Y PROBADO** | `build.mjs`, `vite.config.ts` | Build OK (API + SPA) |
| Migraciones aditivas e idempotentes | **IMPLEMENTADO Y PROBADO** | `lib/db/src/migrate.ts` (001–021) | Verificado contra **PostgreSQL 17.7 real**: 21 migraciones aplicadas y **no duplicadas** en el segundo arranque (`tests/e2e/run-e2e.sh`) |
| E2E con PostgreSQL real (flujo completo) | **IMPLEMENTADO Y PROBADO** | `artifacts/api-server/tests/e2e/run-e2e.sh`, `flow.mjs` | **41/41** comprobaciones en verde contra una base real: campaña, donaciones, comprobante, libro y cadena, archivado, filtros, informe de integridad y validación de cuerpos inválidos (API-06) |
| Lint automatizado | **PENDIENTE** | — | No hay script de lint en el proyecto |
| Respaldo y recuperación documentados | **IMPLEMENTADO SIN PRUEBA COMPLETA** | `docs/MIGRACIONES_Y_RESPALDOS.md` | Documentado; sin ensayo de restauración en este entorno |

## 10. Bloqueos que esperan decisión

| # | Bloqueo | Qué se necesita para desbloquearlo |
|---|---|---|
| B-1 | Migración 010 (libro `CASCADE` → `RESTRICT`) | Autorización para alterar la restricción en producción |
| B-2 | Claves foráneas ausentes (DB-04) | Decisión sobre datos huérfanos existentes + autorización de la migración |
| B-3 | Certificados con QR (5.2) | Definir tipos, vigencia, revocación y datos publicados |
| B-4 | Mensajería automatizada de WhatsApp | Credenciales y proveedor oficial aprobado |
| B-5 | Artefactos de migración obsoletos | Autorización para eliminarlos del repositorio |
| B-6 | Insignias y embajadores (5.3/5.4) | Definición del programa (niveles, vigencia, qué se publica) |
