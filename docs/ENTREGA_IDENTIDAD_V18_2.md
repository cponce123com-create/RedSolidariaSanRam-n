# Entrega — Corrección integral de la identidad institucional (V18.2)

Rama `feat/implementacion-integral-2026`. Continúa el trabajo de V18 (identidad administrable) y
V18.1 (diagnóstico del 401 de Cloudinary).

**Criterio de éxito:** como superadministrador debo poder cambiar logotipo, portada y favicon desde
el panel, guardar, publicar y comprobar que los tres cambios aparecen en la web pública, incluso tras
cerrar sesión y abrirla desde otro navegador.

---

## 1. Causa raíz de cada problema

| # | Síntoma | Causa raíz | Corrección |
|---|---|---|---|
| 1 | **No se podía subir/reemplazar NINGUNA imagen** (logotipo, portada, favicon): Cloudinary responde `401 Invalid Signature`. | La firma del servidor incluía `max_bytes`, un parámetro que **la API de subida de Cloudinary no reconoce**. La firma se calcula sobre los parámetros reconocidos; al firmar uno desconocido, la firma no coincide → `401`. | `max_bytes` se elimina del firmado **y** del envío (`lib/cloudinary.ts`, `cloudinary-upload.ts`). El límite de 8 MB se sigue validando **antes** de subir (`image-validation`). |
| 2 | El 401 aparecía **sin ninguna pista** aunque las credenciales parecieran correctas. | Un espacio o salto de línea al pegar `CLOUDINARY_*` en Render produce un secreto distinto → firma inválida. | `trim()` de las tres variables (`lib/cloudinary.ts`, `lib/asset-cleanup.ts`). |
| 3 | El 401 se mostraba como «Vuelve a iniciar sesión», despistando. | El mapeo de errores descartaba el mensaje de Cloudinary en los 401. | `describeUploadFailure` propaga el mensaje **literal** de Cloudinary («Invalid Signature…»). |
| 4 | Imposible saber la causa exacta de un fallo de subida. | No había comprobación server-side. | Nuevo `POST /api/uploads/cloudinary-check` (solo superadmin) + `CloudinaryDiagnostic` en el panel. |
| 5 | **No se podía reemplazar** una imagen ya puesta: solo se podía borrarla (dejando un cambio sin guardar) para subir otra. | El botón de subida solo se mostraba cuando NO había imagen. | `ImageUploadField` con botón permanente **«Subir / Reemplazar imagen»**, vista previa, validación de formato/peso/dimensiones y estados de carga/éxito/error. |
| 6 | El favicon no era administrable. | No existía en el modelo ni en la API ni en el panel. | `favicon` en el contenido (draft/published), firma `kind=favicon` (PNG/WebP, cuadrado), sección **Identidad institucional → Favicon** con previsualización 32×32 y 64×64, reemplazo y restauración; `DynamicFavicon` actualiza `link[rel="icon"]` con **URL versionada** (`?v=<publishedAt>`) y respaldo estático `/favicon.svg`. |
| 7 | «Publicar» podía mostrar «Publicado correctamente» sin publicar la versión editada. | Publicaba el borrador ya guardado en el servidor, no lo que se veía en pantalla. | `POST /publish` acepta el contenido pendiente y **guarda + publica en una sola transacción**: se publica exactamente lo guardado. |
| 8 | Dos sesiones podían pisarse el borrador. | No había control de concurrencia. | Columna `version` + `409 version_conflict`; el panel envía la versión leída y avisa sin sobrescribir. |
| 9 | Riesgo de borrar el archivo anterior antes de confirmar, o de dejar huérfanos. | Borrado inmediato al reemplazar. | Borrado **diferido**: al reemplazar dentro de la sesión se usa `discard-assets` (solo borra lo no referenciado); al guardar/publicar el servidor calcula `diffRemovedAssets` y borra **después** del commit y **solo** lo que ya no se usa. |
| 10 | 4 tests de `/admin/donaciones` fallaban (suite en rojo). | `DonationVoidAction` usa `useGetAdminMe` y el mock del test no lo exportaba. | Se añade el mock. (No afecta a la identidad; se corrige para dejar la suite verde.) |

---

## 2. Archivos modificados

**API**
- `artifacts/api-server/src/lib/cloudinary.ts` — `trim()` de credenciales; `max_bytes` fuera del firmado; `getCloudName()`.
- `artifacts/api-server/src/lib/asset-cleanup.ts` — `trim()` de credenciales.
- `artifacts/api-server/src/routes/uploads.ts` — `POST /uploads/cloudinary-check`; firma institucional por `kind`.
- `artifacts/api-server/src/routes/institutional-identity.ts` — borrador/publicado con versión, publicar-que-guarda, descarte de assets, auditoría.
- `artifacts/api-server/src/lib/institutional-identity.ts` — normalización, DTO público con allowlist, `diffRemovedAssets`, `collectAssetPublicIds`.
- `artifacts/api-server/src/lib/csp.ts` — `connect-src` incluye `https://api.cloudinary.com` (V17).

**Frontend**
- `artifacts/red-solidaria/src/components/shared/ImageUploadField.tsx` — botón permanente, validación y estados.
- `artifacts/red-solidaria/src/lib/cloudinary-upload.ts` — deja de enviar `max_bytes`.
- `artifacts/red-solidaria/src/lib/upload-error-message.ts` — mensaje literal de Cloudinary.
- `artifacts/red-solidaria/src/lib/image-validation.ts` — validación por tipo/dimensiones/cuadratura.
- `artifacts/red-solidaria/src/components/shared/DynamicFavicon.tsx` — favicon versionado y respaldo.
- `artifacts/red-solidaria/src/hooks/use-institutional-identity.ts` — hooks con versión + `useCloudinaryCheck`.
- `artifacts/red-solidaria/src/pages/admin/institutional-identity.tsx` — panel completo (logotipo, portada, favicon, historia, estados, diagnóstico).
- `artifacts/red-solidaria/src/components/admin/CloudinaryDiagnostic.tsx` — diagnóstico de subida.
- Consumo público: `BrandLogo.tsx`, `InstitutionalCover.tsx`, `pages/about.tsx`.

**Pruebas**
- `artifacts/api-server/tests/cloudinary.test.mjs` — `max_bytes` no se firma; `trim`.
- `artifacts/api-server/tests/institutional-identity-auth.test.mjs` **(nuevo)** — 403/400 de la API de identidad.
- `artifacts/red-solidaria/tests/upload-error-message.test.mjs` — 401 propaga el mensaje.
- `artifacts/red-solidaria/tests/vitest/admin-donations.test.tsx` — mock de `useGetAdminMe`.

---

## 3. Migraciones

**No se añade ninguna migración nueva.** El favicon vive dentro de las columnas JSONB `draft`/`published`,
así que no requiere cambio de esquema. Ya existen (y se aplican al arrancar, `runMigrations()`):

- `031_institutional_identity.sql` — crea la tabla de fila única.
- `032_institutional_identity_version.sql` — añade `version integer NOT NULL DEFAULT 1` (concurrencia optimista).

Ambas son **aditivas e idempotentes** (`IF NOT EXISTS`); el rollback es `DROP COLUMN` / `DROP TABLE`.

---

## 4. Pruebas ejecutadas y resultados

| Comprobación | Comando | Resultado |
|---|---|---|
| Tests API | `pnpm --filter @workspace/api-server test` | **694/694** ✅ |
| Tests frontend (node:test) | `pnpm --filter @workspace/red-solidaria test` | **252/252** ✅ |
| Tests frontend (vitest) | ídem | **33/33** ✅ |
| Typecheck API | `pnpm --filter @workspace/api-server run typecheck` | sin errores ✅ |
| Typecheck web | `pnpm --filter @workspace/red-solidaria run typecheck` | sin errores ✅ |
| Build API | `pnpm --filter @workspace/api-server run build` | OK ✅ |
| Build web | `pnpm --filter @workspace/red-solidaria run build` | OK ✅ |

Cobertura automatizada del flujo: normalización/DTO/allowlist, `diffRemovedAssets` (no borra lo que sigue
en uso), `hasPendingChanges`, cuadratura del favicon, firma sin `max_bytes`, `trim` de credenciales, y
403/400 de los endpoints admin.

---

## 5. Verificación manual (entorno con Neon + Cloudinary reales)

1. Entrar como superadmin → **Identidad institucional** → **«Comprobar Cloudinary»**. Debe responder
   `ok: true`. Si no, la tabla de `DIAGNOSTICO_CLOUDINARY_401_V18_1.md` §3 indica la causa exacta.
2. Subir un logotipo nuevo → aparece la vista previa y el estado «Subida».
3. Reemplazarlo por otro → el botón «Reemplazar» está siempre disponible.
4. Subir y reemplazar la portada (escritorio y móvil) y ajustar el encuadre.
5. Subir y reemplazar el favicon (PNG/WebP cuadrado); previsualizar 32×32 y 64×64.
6. «Guardar borrador» → estado «Borrador guardado · pendiente de publicar».
7. «Publicar» → «Publicado correctamente» (guarda y publica lo que se ve).
8. Recargar la página (sesión admin → `Cache-Control: private, no-store`).
9. Abrir otra sesión/navegador (anónimo) → logotipo, portada, favicon e historia actualizados; la pestaña
   muestra el favicon nuevo.
10. Comprobar que el archivo anterior **no** se borró antes de publicar (solo tras publicar lo reemplazado).
11. Probar errores: CSP (mensaje de bloqueo), 401/403 (Cloudinary/sesión), 409 (dos pestañas), 500.
12. Repetir typecheck, tests y build.

---

## 6. Riesgos pendientes

- **Cloudinary = causa de configuración, no de código:** si tras el `trim` y sin `max_bytes` el 401
  persiste, la API Key/Secret no corresponden al cloud `CLOUDINARY_CLOUD_NAME`. El diagnóstico devuelve el
  motivo exacto.
- **Caché pública de 60 s** en `GET /api/institutional-identity` para peticiones anónimas. La sesión admin
  siempre recibe `no-store`; un navegador nuevo (sin caché) obtiene datos frescos. Si se desea visibilidad
  inmediata también para proxies, excluir la ruta de `publicApiCache`.
- **Diagnóstico** crea y borra un activo de 1×1 en `institutional-identity/_diagnostico` (inofensivo; deja
  una entrada en el log de Cloudinary).
- **Dependencia de Cloudinary Free / Neon Free / Render Free:** dentro de sus límites; el borrado diferido
  evita acumular huérfanos.
- Compatibilidad con Node: el repo pide `>=22`; verificado funcionando en Node 20 (solo aparece un WARN de
  motor de pnpm).

---

## 7. Despliegue en Render

1. **Variables de entorno (dashboard, `sync: false`)** — confirmar que existen y **sin espacios**:
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (además de `DATABASE_URL`,
   `SESSION_SECRET`, `SITE_URL`, `CORS_ORIGIN`, `NODE_ENV=production`).
2. **Build/Start** (ya en `render.yaml`): `pnpm install --frozen-lockfile && pnpm run build` /
   `node artifacts/api-server/dist/index.mjs`.
3. **Migraciones:** `runMigrations()` se ejecuta al arrancar; aplicará `032_institutional_identity_version.sql`
   si la BD aún no la tenía. No hay pasos manuales.
4. **Verificación:** `GET /api/healthz` → 200; entrar como superadmin → **Comprobar Cloudinary** →
   subir/publicar logotipo, portada y favicon → recargar y abrir en otro navegador.
5. **Rollback:** redeploy de la versión previa; si se revirtiera el esquema, `DROP COLUMN version` /
   `DROP TABLE institutional_identity` (el resto de la app no depende de ella).

> Durante las pruebas **no** se modifican ni eliminan datos reales de producción: la identidad es una fila
> única que se edita desde el panel; el diagnóstico usa un activo temporal de 1×1.
