# Correcciones e implementación V15 — Auditoría correctiva + Identidad institucional

Rama: `feat/implementacion-integral-2026` · Fecha: 2026-10-16

Prompt Maestro ejecutado por fases: **1-2/4 (sincronización y borrados seguros) → 3 (identidad institucional) → 5-6 (seguridad y pruebas)**.

---

## 1. Archivos modificados y nuevos

### Backend (API)
- **Nuevo** `artifacts/api-server/src/lib/rich-text.ts` — sanitizador de HTML (allowlist).
- **Nuevo** `artifacts/api-server/src/lib/institutional-identity.ts` — normalización, validación, DTO público y guardas de assets.
- **Nuevo** `artifacts/api-server/src/routes/institutional-identity.ts` — rutas públicas y de superadmin.
- **Modificado** `artifacts/api-server/src/routes/index.ts` — registra el router.
- **Modificado** `artifacts/api-server/src/routes/uploads.ts` — firma `POST /uploads/institutional-signature` (superadmin).
- **Modificado** `artifacts/api-server/src/lib/cloudinary.ts` — constante `INSTITUTIONAL_IDENTITY_FOLDER`.
- **Modificado** `artifacts/api-server/src/lib/audit.ts` — acciones y recurso de identidad.
- **Modificado** `artifacts/api-server/src/lib/public-settings.ts` — nota de política (identidad fuera de `settings`).
- **Modificado** `artifacts/api-server/build-tests.mjs` — nuevos entry points de pruebas.

### Base de datos
- **Nuevo** `lib/db/src/schema/institutional-identity.ts` — tabla `institutional_identity` (fila única).
- **Modificado** `lib/db/src/schema/index.ts` — exporta el esquema.
- **Modificado** `lib/db/src/migrate.ts` — migración **031_institutional_identity.sql**.

### Frontend (panel y web)
- **Nuevo** `src/lib/admin-request.ts` — cliente que comprueba `response.ok`.
- **Nuevo** `src/lib/delete-outcome.ts` — interpretación del código HTTP de un DELETE (puro).
- **Modificado** `src/lib/query-keys.ts` — predicados/entidades `pets, news, testimonials, faq, reports, identity`.
- **Modificado** `src/lib/query-invalidation.ts` — `invalidatePetQueries`, `invalidateNewsQueries`, `invalidateTestimonialQueries`, `invalidateFaqQueries`, `invalidateReportQueries`, `invalidateIdentityQueries`.
- **Modificado** `src/pages/admin/adoptions.tsx` — borrado seguro + alternativa despublicar; estado y solicitudes con mensaje real.
- **Modificado** `src/pages/admin/testimonials.tsx`, `users.tsx`, `allies.tsx`, `faq.tsx` — mutaciones con `response.ok` + `onError`; lecturas con `ok`.
- **Modificado** `src/pages/admin/news.tsx`, `pet-form.tsx`, `messages.tsx` — lecturas con `ok`.
- **Nuevo** `src/hooks/use-institutional-identity.ts` — hooks de identidad (público + panel).
- **Nuevo** `src/components/admin/RichTextEditor.tsx` — editor enriquecido propio.
- **Nuevo** `src/components/layout/BrandLogo.tsx` — logotipo del encabezado.
- **Nuevo** `src/components/home/InstitutionalCover.tsx` — portada del home.
- **Nuevo** `src/pages/admin/institutional-identity.tsx` — panel «Identidad institucional».
- **Modificado** `src/pages/admin/layout.tsx` — ítem de menú (grupo Sistema, solo superadmin).
- **Modificado** `src/App.tsx` — ruta `/admin/identidad-institucional`.
- **Modificado** `src/pages/about.tsx` — «Nosotros» consume la identidad publicada (con fallback).
- **Modificado** `src/components/layout/Navbar.tsx` — logotipo institucional en el encabezado.
- **Modificado** `src/pages/home.tsx` — portada institucional.
- **Modificado** `src/lib/cloudinary-upload.ts` y `src/components/shared/ImageUploadField.tsx` — endpoint de firma institucional.

### Pruebas
- **Nuevo** `artifacts/api-server/tests/rich-text.test.mjs`
- **Nuevo** `artifacts/api-server/tests/institutional-identity-lib.test.mjs`
- **Nuevo** `artifacts/red-solidaria/tests/delete-outcome.test.mjs`
- **Modificado** `artifacts/api-server/tests/admin-gate-coverage.test.mjs` (cubre la ruta admin de identidad)
- **Modificado** `artifacts/red-solidaria/tests/query-keys.test.mjs`

---

## 2. Errores encontrados y causas

El backend ya estaba endurecido (V14): los DELETE devuelven 404 cuando no borran fila y 409 cuando hay dependencias. **El defecto real estaba en el PANEL**: varias mutaciones ignoraban `response.ok` y mostraban éxito aunque la API fallara (`fetch` resuelve igual en 2xx y en 400/403/404/409/500).

| Archivo | Mutación | Causa |
|---|---|---|
| `admin/adoptions.tsx` | `deletePet` | `await fetch(DELETE)` sin comprobar `ok`; `onSuccess` fijo; sin `onError`. No manejaba el 409. |
| `admin/adoptions.tsx` | `updateRequest` | Sin comprobar `ok`; siempre «Solicitud actualizada». |
| `admin/adoptions.tsx` | `updateStatus` | Perdía el mensaje real del servidor y no invalidaba la caché pública `/api/pets`. |
| `admin/testimonials.tsx` | `delete` | Sin comprobar `ok`; sin `onError`. |
| `admin/users.tsx` | `delete` | Sin comprobar `ok`; sin `onError`. |
| `admin/allies.tsx` | `delete` / `toggleActive` | Sin comprobar `ok`; sin `onError`. |
| `admin/faq.tsx` | `delete` / `toggleActive` | Sin comprobar `ok`; sin `onError`. |
| `admin/news.tsx`, `faq.tsx`, `testimonials.tsx`, `pet-form.tsx`, `messages.tsx` | lecturas | `return res.json()` sin `ok`: un cuerpo de error se trataba como lista (rompía el panel). |

Causa raíz común: la comprobación de `response.ok` era manual y repetida en cada página, fácil de omitir.

---

## 3. Correcciones implementadas

1. **`lib/admin-request.ts`**: `adminRequest`/`adminRequestJson`/`adminRequestNoContent` comprueban `res.ok` y lanzan `ApiError(status, mensaje real del servidor)`.
2. **`lib/delete-outcome.ts`** (puro): traduce 200/204/404/409/401/403/5xx a un desenlace tipado y decide si ofrecer la alternativa no destructiva.
3. **Panel de adopciones**: el DELETE lee el código real. Si hay **409** (solicitudes vinculadas) muestra el mensaje del servidor y ofrece **«Despublicar»** (`PATCH status:"inactive"`), conservando las solicitudes. Acciones diferenciadas: Eliminar / Despublicar / Archivar (`inactive`) / Restaurar. Filtro «Despublicadas» añadido.
4. **Testimonios, usuarios, aliados, FAQ, noticias, pet-form, mensajes**: mutaciones y lecturas con `response.ok` y `onError` con el mensaje real.
5. **Contrato de invalidación admin↔público**: `query-keys.ts`/`query-invalidation.ts` ampliados. Tras cada mutación se invalidan lista, detalle y vista pública de la entidad (sin recargas completas; se conserva `staleTime` 60 s + refocus).
6. **Identidad institucional**: tabla de fila única con `draft`/`published`; rutas públicas y de superadmin; panel con logotipo, portada (escritorio/móvil/encuadre), texto principal + CTA, editor enriquecido, misión/visión/valores/fotos, vista previa, borrador/publicar/despublicar; consumo en «Nosotros», encabezado y home con fallback.
7. **Seguridad**: `requireRole(SUPERADMIN)` en todas las escrituras; auditoría; validación de imágenes (tipo/tamaño en cliente, https + carpeta propia en servidor); XSS saneado al escribir y al leer; borrado de assets solo de la carpeta propia.

---

## 4. Migraciones necesarias

- **031_institutional_identity.sql** (aditiva). Crea `institutional_identity` (fila única, `draft`/`published` JSONB, `published_at`, `updated_at`, `updated_by`) e inserta la fila `id=1`. Se aplica sola al arrancar (`runMigrations()`).
- **Rollback**: `DROP TABLE institutional_identity;`. No toca ninguna otra tabla.

---

## 5. Pruebas ejecutadas y resultados reales

| Comando | Resultado |
|---|---|
| `pnpm --filter @workspace/api-server test` | **663/663** pasan (incluye `rich-text`, `institutional-identity-lib` y el gate de `/api/admin/institutional-identity`). |
| `pnpm --filter @workspace/red-solidaria` (node:test) | **236/236** pasan (incluye `delete-outcome` y los nuevos predicados de entidad). |
| `npx tsc --build` (libs) + typecheck de `api-server`, `red-solidaria`, `scripts` | **Sin errores**. |
| `pnpm --filter @workspace/red-solidaria build` | **OK** (chunk `institutional-identity` generado). |
| `pnpm --filter @workspace/api-server build` | **OK**. |
| `vitest run` | 29/33 pasan; **4 fallos PREEXISTENTES** en `DonationVoidAction` (fallan idénticamente sin estos cambios; probablemente por Node 20 local frente a Node ≥22 del repo). |

### Escenarios funcionales 1-12 (requieren app + Neon + Cloudinary)
No ejecutables en este entorno (sin base de datos ni credenciales de Cloudinary). Procedimiento documentado abajo. **No se eliminaron datos reales, contables ni archivos**; las pruebas usan datos aislados.

---

## 6. Riesgos pendientes

- Las pruebas dependientes de base de datos no pueden ejecutarse aquí sin Neon; se compensan con módulos puros + typecheck + build.
- `contentEditable`/`execCommand` tienen diferencias entre navegadores; el saneado en servidor es la garantía real.
- El borrado de assets de Cloudinary se limita por prefijo de carpeta; requiere verificación en un entorno con Cloudinary real.
- Los 4 fallos preexistentes de `vitest` deben revisarse aparte (no relacionados con esta entrega).

---

## 7. Instrucciones para desplegar en Render

1. Variables de entorno: `DATABASE_URL` (Neon), `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SITE_URL`.
2. Desplegar la rama. `runMigrations()` aplica **031** automáticamente al arrancar.
3. Build: `pnpm install --frozen-lockfile` → build de `api-server` y `red-solidaria`.
4. Comprobar `GET /api/health`.

## 8. Procedimiento para verificar producción

1. `GET /api/institutional-identity` → 200 con el contenido publicado (o `null`), sin `publicId`.
2. `GET /api/admin/institutional-identity` sin sesión → 401; con rol no superadmin → 403.
3. En el panel (superadmin) → **Identidad institucional**: subir logotipo y portada, editar «Nuestra historia», **Guardar borrador** (la web no cambia) y **Publicar** (la web sí cambia).
4. Abrir `/nosotros` y el home en otra sesión/navegador → el cambio se refleja sin recargar la caché manualmente.
5. **Despublicar** → la web vuelve a su contenido por defecto.
6. En Adopciones: intentar eliminar una mascota con solicitudes → mensaje de error real y opción **Despublicar**; sin solicitudes → se elimina.
7. Confirmar que ninguna operación fallida muestra éxito y que los registros contables permanecen intactos.
