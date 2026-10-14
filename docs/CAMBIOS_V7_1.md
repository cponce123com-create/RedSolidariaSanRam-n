# Cambios V7.1 — Red Solidaria San Ramón

Registro de cambios por fase y commit. Los commits son independientes por fase,
como exige la metodología de la auditoría.

---

## `b035d9f` — Fase 1: eliminar campañas por naturaleza real de las dependencias

**Problema:** el borrado se bloqueaba ante **cualquier** fila dependiente; un
borrador con galería o novedades quedaba atrapado («Rescate Animal San Ramón», 17
registros auxiliares).

**Cambio:** clasificación de dependencias en PROTEGIDAS (historial
financiero/documental), AUXILIARES eliminables y DESVINCULABLES. Diagnóstico
previo, eliminación definitiva segura (transacción + limpieza de CDN posterior),
archivado y purga de datos de prueba. Interfaz con diagnóstico y alternativas.

**Archivos:** `lib/campaign-lifecycle.ts`, `lib/asset-cleanup.ts`,
`routes/campaigns.ts`, `components/admin/CampaignDeletionDialog.tsx`,
`hooks/use-campaign-lifecycle.ts`, `lib/campaign-admin.ts`,
`lib/campaign-deletion.ts`, `pages/admin/campaigns.tsx`, pruebas de API y frontend.

---

## `0cb4c89` — Fase 2: detectar duplicados y comprobar saldos

**Cambio:** el informe de integridad pasa a detectar asientos duplicados y a
comprobar saldos y totales por campaña, además de lo ya cotejado (donaciones sin
asiento, asientos sin origen, importes y campañas descuadradas).

**Archivos:** `lib/ledger-audit.ts`, pruebas.

---

## `eee673c` — Fase 2: regularización autorizada e informe de discrepancias

**Cambio:** herramienta de regularización (asientos compensatorios apilados, nunca
edición del historial) con autorización de superadmin, motivo y evidencia; plan de
vista previa; informe de discrepancias en CSV; panel de administración ampliado.

**Archivos:** `lib/ledger-regularization.ts` (nuevo), `routes/ledger-audit.ts`,
`lib/audit.ts`, `pages/admin/ledger-audit.tsx`, pruebas
`ledger-regularization.test.mjs` y `ledger-regularize-auth.test.mjs`.

---

## `0b787f9` — Fase 3: endurecer cookie, CORS y cobertura del gate admin

**Cambio:** `lib/security-config.ts` (nuevo) deriva del entorno la seguridad de la
cookie y CORS, y **falla el arranque** ante configuración insegura en producción.
Se retira la opción obsoleta `xssFilter` de helmet. Prueba que verifica que el gate
global cubre toda ruta `/admin`.

**Archivos:** `lib/security-config.ts` (nuevo), `app.ts`, pruebas
`security-config.test.mjs` y `admin-gate-coverage.test.mjs`.

---

## `3ecf02c` — Fase 4: consentimiento explícito y revocable

**Cambio:** consentimiento del donante (anonimato, publicación de nombres,
fotografías, fecha y versión) y su revocación, reflejada en las vistas públicas sin
destruir registros contables.

**Archivos:** `lib/donor-consent.ts` (nuevo), `routes/donations.ts`,
`lib/donor-format.ts`, `schema/donation-consents.ts` (nuevo), migración
`025_donation_consents.sql`, pruebas.

---

## `c55fc11` — Fase 5: proteger contra certificados duplicados

**Cambio:** `findDuplicateCertificate` compara titular normalizado, tipo y campaña;
un certificado revocado no bloquea emitir uno nuevo.

**Archivos:** `lib/certificates.ts`, `routes/certificates.ts`, pruebas.

---

## `d0e87ca` — Fase 6: captura de rendición e integración real de aliados

**Cambio:** se añade al panel de ChocoFest la captura de las 4 claves
`chocofest_2026_results_*` (publicadas pero sin UI). Se extrae el contrato de
aliados a `lib/allies.ts` y se crea `AlliesStrip`, reutilizado por la página del
evento; `/aliados` importa el mismo contrato.

**Archivos:** `lib/allies.ts` (nuevo), `components/allies/AlliesStrip.tsx` (nuevo),
`pages/chocofest-2026.tsx`, `pages/allies.tsx`, `pages/admin/chocofest.tsx`,
`i18n/locales/es.ts`, `i18n/locales/en.ts`, `tests/allies.test.mjs` (nuevo).

---

## `2d84d9c` — Fase 7: reparar enlace roto de noticias y vigilar rutas

**Problema:** la lista de noticias enlazaba a `/noticias/:id`, ruta inexistente
(404).

**Cambio:** `pages/news-detail.tsx` reutiliza `GET /api/news/:id`; se registra la
ruta antes de `/noticias`. Prueba estática que detecta cualquier enlace interno
roto.

**Archivos:** `pages/news-detail.tsx` (nuevo), `App.tsx`, `i18n/locales/es.ts`,
`i18n/locales/en.ts`, `tests/routes-links.test.mjs` (nuevo).

---

## `03c1a40` — Fase 8: verificar la cadena por campaña y probar la eliminación

**Problema (descubierto en el E2E):** el informe verificaba el libro como una única
cadena global; con movimientos de dos campañas daba un falso «cadena rota».

**Cambio:** `verifyCampaignChains` agrupa por campaña; la UI muestra el número de
cadenas. El E2E reproduce el caso de la Fase 1 contra PostgreSQL real (borrador
auxiliar se elimina; borrador con historial se bloquea).

**Archivos:** `lib/ledger.ts`, `routes/ledger-audit.ts`,
`pages/admin/ledger-audit.tsx`, `tests/e2e/flow.mjs`,
`tests/ledger-campaign-chains.test.mjs` (nuevo).

---

## Documentación (Fase 9)

- `docs/AUDITORIA_CORRECTIVA_V7_1.md`
- `docs/CHECKLIST_FUNCIONAL_V7_1.md`
- `docs/CAMBIOS_V7_1.md`

---

## Resumen de migraciones

| Migración | Fase | Contenido |
| --- | --- | --- |
| `024_certificates.sql` | 5 | Tabla `certificates` (código público, tipo, estado, revocación). |
| `025_donation_consents.sql` | 4 | Tabla `donation_consents` (consentimiento, versión, fecha, revocación). |

En esta iteración **no** se añadieron migraciones. El migrador embebido es
idempotente (el E2E lo demuestra en un segundo arranque y tras restaurar un
respaldo).

## Resultados de la validación

- Typecheck: OK · Builds (API y frontend): OK · `pnpm audit --prod`: sin
  vulnerabilidades.
- API 450/450 · frontend node:test 188/188 · vitest 33/33.
- E2E contra PostgreSQL real: **TODO OK** (incluye respaldo y restauración).
