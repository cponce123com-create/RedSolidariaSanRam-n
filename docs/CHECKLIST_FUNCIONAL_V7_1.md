# Checklist funcional V7.1 — Red Solidaria San Ramón

Verificación funcional de la versión **V7.1**. Cada punto indica la evidencia que
lo respalda. Una casilla solo se marca si existe una prueba que lo verifica.

## Fase 1 — Eliminación de campañas

- [x] El diagnóstico previo (`GET /api/campaigns/:id/deletion-diagnostic`) devuelve
      estado, recuento total y por tipo, dependencias protegidas y auxiliares,
      motivo concreto del bloqueo y operaciones permitidas.
      _Evidencia:_ `campaign-lifecycle.test.mjs`, `campaign-deletion-auth.test.mjs`.
- [x] Un borrador vacío se elimina.
      _Evidencia:_ E2E (borrador auxiliar → 204).
- [x] Un borrador con imágenes auxiliares se elimina de forma segura (se limpian en
      la misma transacción).
      _Evidencia:_ E2E sección 7bis (galería + novedades → 204).
- [x] Un borrador con donaciones confirmadas se bloquea (409) explicando el motivo.
      _Evidencia:_ E2E sección 7bis.
- [x] Una campaña con movimientos contables se bloquea.
      _Evidencia:_ `campaign-lifecycle.test.mjs`; E2E (movimientos del libro).
- [x] Una campaña archivada conserva su historial y sigue accesible por URL directa.
      _Evidencia:_ E2E (archivar → oculta del listado público, detalle 200).
- [x] Una campaña archivada no acepta donaciones.
      _Evidencia:_ E2E (`archivedDonation` → 400).
- [x] Restauración controlada (archivada → finalizada).
      _Evidencia:_ E2E (restaurar → 200).
- [x] Usuario sin permisos recibe acceso denegado.
      _Evidencia:_ `campaign-deletion-auth.test.mjs`, `admin-gate-coverage.test.mjs`.
- [x] La interfaz solo muestra Eliminar cuando la operación es válida, explica el
      bloqueo, muestra las dependencias y ofrece Archivar.
      _Evidencia:_ `campaign-deletion.test.mjs`, `CampaignDeletionDialog.tsx`.
- [x] Operaciones concurrentes sin pérdida de información (bloqueo `for update`).
      _Evidencia:_ `campaign-lifecycle.test.mjs` (transacción y limpieza posterior).
- [x] Un fallo del almacenamiento externo no corrompe la base (limpieza del CDN
      posterior a la transacción, best-effort con reintentos).
      _Evidencia:_ `asset-cleanup.test.mjs`.

## Fase 2 — Integridad contable y financiera

- [x] Detección de donaciones confirmadas sin asiento (DB-09).
      _Evidencia:_ `ledger-audit.test.mjs`; E2E (informe detecta 59 históricas).
- [x] Detección de movimientos duplicados, sin origen válido, importes y campañas
      descuadradas.
      _Evidencia:_ `ledger-audit.test.mjs`.
- [x] Comprobación de saldos y totales por campaña.
      _Evidencia:_ `ledger-audit.test.mjs`.
- [x] Verificación del encadenamiento de hashes **por campaña**.
      _Evidencia:_ `ledger-campaign-chains.test.mjs`; E2E (`campaigns: 2`).
- [x] Recaudación confirmada, histórica y conciliada distinguidas sin duplicar.
      _Evidencia:_ E2E (ficha y transparencia concilian `totalRaised`).
- [x] Informe de discrepancias descargable (CSV).
      _Evidencia:_ `GET /admin/ledger/discrepancies.csv`; panel `/admin/libro`.
- [x] Regularización autorizada, con evidencia y trazabilidad, sin editar historial.
      _Evidencia:_ `ledger-regularization.test.mjs`, `ledger-regularize-auth.test.mjs`.
- [x] Ninguna regularización modifica registros financieros históricos (append-only).
      _Evidencia:_ diseño del libro + pruebas de regularización.

## Fase 3 — Seguridad y dependencias

- [x] Auditoría de dependencias sin vulnerabilidades conocidas.
      _Evidencia:_ `pnpm audit --prod`.
- [x] Cookie de sesión `Secure` en producción o con `SITE_URL` HTTPS.
      _Evidencia:_ `security-config.test.mjs`.
- [x] CORS sin comodín con credenciales; el arranque falla ante config insegura.
      _Evidencia:_ `security-config.test.mjs`.
- [x] Toda ruta `/admin/*` exige sesión (gate comodín) y el login sigue público.
      _Evidencia:_ `admin-gate-coverage.test.mjs`.
- [x] Autenticación de dos factores y roles intactos (no se desactivó nada).
      _Evidencia:_ `admin-2fa.test.mjs`, `require-role.test.mjs`, `require-admin.test.mjs`.
- [x] Validación de entradas del servidor (400, no 500).
      _Evidencia:_ E2E (contacto, testimonio, noticia inválidos → 400).

## Fase 4 — Donantes y protección de datos

- [x] Consentimiento explícito, anonimato, control de nombres y fotografías.
      _Evidencia:_ `donor-consent.test.mjs`, `donor-format.test.mjs`.
- [x] Registro de fecha y versión del consentimiento.
      _Evidencia:_ migración `025_donation_consents.sql`.
- [x] Revocación del consentimiento reflejada en las vistas públicas sin destruir
      registros contables.
      _Evidencia:_ `donation-consents-auth.test.mjs`, `donor-consent.test.mjs`.

## Fase 5 — Certificados y reconocimientos

- [x] Emisión con código público aleatorio (QR) y consulta pública.
      _Evidencia:_ E2E (emisión + consulta).
- [x] Revocación con motivo y bloqueo de doble revocación.
      _Evidencia:_ E2E (revocar → 200; revocar de nuevo → 409).
- [x] La vista pública no expone id interno, estado ni datos de contacto.
      _Evidencia:_ E2E (claves públicas verificadas).
- [x] Protección contra certificados duplicados (titular + tipo + campaña).
      _Evidencia:_ `certificates.test.mjs`.

## Fase 6 — ChocoFest y colaboradores

- [x] Captura de la rendición de resultados desde el panel (beneficiarios,
      actividades, resumen, destino de sobrantes).
      _Evidencia:_ `admin/chocofest.tsx`, `i18n-keys.test.mjs`.
- [x] La sección de aliados del evento muestra los aliados reales (mismo módulo
      que `/aliados`).
      _Evidencia:_ `allies.test.mjs`, `AlliesStrip.tsx`.
- [x] Voluntarios, equipos, inventario, presupuesto, gastos, evidencias y
      resultados operativos.
      _Evidencia:_ suites `volunteer-teams-admin`, `inventory`, `budget`,
      `results`, `event-results`, `chocofest`.
- [ ] Aliados con tipo de aporte (monetario/especie/servicios/logística) y nivel de
      auspicio. _(Pendiente: requiere migración.)_
- [ ] Módulo de embajadores. _(Pendiente: bloqueo de negocio.)_
- [ ] Localidades beneficiadas con datos reales. _(Pendiente: modelo de datos.)_

## Fase 7 — Optimización administrativa y frontend

- [x] No hay enlaces internos rotos.
      _Evidencia:_ `routes-links.test.mjs` (extrae rutas de `App.tsx` y valida todo
      enlace de `src/**/*.tsx`).
- [x] Página de detalle de noticia (`/noticias/:id`) reparada.
      _Evidencia:_ `pages/news-detail.tsx`, `routes-links.test.mjs`.
- [x] Panel del libro con estados de carga, errores reales, duplicados, saldos y
      descarga de discrepancias.
      _Evidencia:_ `admin/ledger-audit.tsx`.
- [x] Tabla de campañas con filtros, búsqueda, ordenación, carga y refresco tras
      cada operación.
      _Evidencia:_ `admin/campaigns.tsx`, `campaign-deletion.test.mjs`.

## Fase 8 — Pruebas y validación de producción

- [x] Instalación/typecheck sin errores.
- [x] Build de producción del API y del frontend.
- [x] Pruebas unitarias, de API, de integración y de permisos (450 + 188 + 33).
- [x] Pruebas PostgreSQL reales (E2E).
- [x] Pruebas financieras (libro, cadena, conciliación, regularización).
- [x] Pruebas de regresión (incluye el bug de la cadena por campaña).
- [x] Migraciones compatibles con la base existente (idempotentes).
- [x] No se borra ni reinicializa la base de producción.

## Fase 9 — Entrega y reporte

- [x] `docs/AUDITORIA_CORRECTIVA_V7_1.md`
- [x] `docs/CHECKLIST_FUNCIONAL_V7_1.md` (este documento)
- [x] `docs/CAMBIOS_V7_1.md`
