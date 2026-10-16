# Corrección integral — Identidad institucional: imágenes, favicon y Publicar (V18)

Rama `feat/implementacion-integral-2026`.

## 1. Causa raíz de cada problema

| # | Problema | Causa raíz |
|---|---|---|
| 1 | **No se podía reemplazar una imagen** | `ImageUploadField` renderizaba O la vista previa (input para pegar URL + papelera) O la zona de subida. Con una imagen ya puesta, el único camino era **borrarla** (dejando la URL vacía como cambio sin guardar) y volver a subir. No existía un botón de reemplazo. |
| 2 | **Archivos huérfanos / no se borra el anterior** | En `institutional-identity.tsx` cada `onChange` hacía `patch({ logo: { url, publicId: null } })`: se guardaba la URL y se **descartaba el `publicId`**. Sin identificador no había forma de borrar el archivo anterior, ni de diferir el borrado hasta confirmar el reemplazo. |
| 3 | **Favicon no administrable** | No existía en el modelo (`InstitutionalIdentityContent`), ni en la API, ni en el panel. `index.html` solo tenía un `<link rel="icon" href="/favicon.svg">` estático. |
| 4 | **«Publicar» mostraba éxito sin publicar los cambios** | `POST /admin/institutional-identity/publish` copiaba el **borrador ya almacenado en el servidor**. Si el admin editaba y no pulsaba «Guardar borrador», se publicaba la versión VIEJA y aun así se mostraba «Publicado correctamente». |
| 5 | **Cambios pisados entre sesiones** | No había token de versión: dos pestañas/administradores se sobrescribían el borrador sin aviso. |
| 6 | **Sin validación de dimensiones ni bloqueo de subidas** | Solo se miraban el tipo MIME y el peso; se podía subir un favicon rectangular o un logotipo de 8×8 px, y no había protección frente a subidas simultáneas. |
| 7 | **Errores técnicos al administrador** | Un bloqueo de CSP/red llegaba como `Failed to fetch` (corregido en V17); el resto de causas se unifican ahora en mensajes accionables. |

## 2. Archivos modificados

**Base de datos**
- `lib/db/src/schema/institutional-identity.ts` — columna `version`.
- `lib/db/src/migrate.ts` — migración **032**.

**API**
- `artifacts/api-server/src/lib/institutional-identity.ts` — `favicon`, `contentFingerprint`, `hasPendingChanges`, `collectAssetPublicIds`, `diffRemovedAssets`.
- `artifacts/api-server/src/lib/cloudinary.ts` — `INSTITUTIONAL_ASSET_KINDS` (carpeta y formatos por tipo; favicon solo PNG/WebP), `getUploadSignature(folder, { allowedFormats })`.
- `artifacts/api-server/src/lib/asset-cleanup.ts` — `cleanupCloudinaryAssetsByPublicId` (borrado por `public_id` conocido).
- `artifacts/api-server/src/lib/audit.ts` — acción `IDENTITY_ASSETS_DISCARDED`.
- `artifacts/api-server/src/routes/uploads.ts` — la firma institucional acepta `{ kind }`.
- `artifacts/api-server/src/routes/institutional-identity.ts` — versión, **publicar = guardar + publicar**, `hasPendingChanges`, borrado diferido y `discard-assets`.

**Frontend**
- `artifacts/red-solidaria/src/lib/image-validation.ts` **(nuevo)** — formato, peso y dimensiones.
- `artifacts/red-solidaria/src/lib/cloudinary-upload.ts` — `opts.kind` en la firma.
- `artifacts/red-solidaria/src/components/shared/ImageUploadField.tsx` — **botón permanente «Subir / Reemplazar»**, vista previa, validación, estados, `publicId`, bloqueo de subidas simultáneas, `onDiscard`.
- `artifacts/red-solidaria/src/components/shared/DynamicFavicon.tsx` **(nuevo)** — `link[rel=icon]` con el favicon publicado y URL versionada; respaldo estático.
- `artifacts/red-solidaria/src/hooks/use-institutional-identity.ts` — favicon, `version`, publicar con contenido, `useDiscardIdentityAssets`.
- `artifacts/red-solidaria/src/pages/admin/institutional-identity.tsx` — sección **Favicon** (32/64 + restaurar), estados del flujo, publicar que guarda, manejo del 409.
- `artifacts/red-solidaria/src/App.tsx` — monta `DynamicFavicon` dentro del `QueryClientProvider`.
- `artifacts/red-solidaria/src/lib/i18n/locales/{es,en}.ts` — claves del botón de reemplazo.

**Pruebas**
- `artifacts/api-server/tests/institutional-identity-lib.test.mjs`, `admin-gate-coverage.test.mjs`.
- `artifacts/red-solidaria/tests/image-validation.test.mjs` **(nuevo)**.

## 3. Migración necesaria

**032_institutional_identity_version.sql** (aditiva):
```sql
ALTER TABLE institutional_identity
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
```
Token de **concurrencia optimista**. Se aplica sola al arrancar. Rollback: `DROP COLUMN version`.
El favicon **no** necesita columna: vive dentro del JSONB `draft`/`published`.

## 4. Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| `node --test` API | **686/686** ✅ |
| `node --test` frontend | **249/249** ✅ |
| `tsc --build` (libs) + typecheck API/frontend/scripts | **sin errores** ✅ |
| build web + build API | **OK** ✅ |

Nuevas pruebas: favicon en `normalizeContent` y en el DTO público (sin `publicId`),
`collectAssetPublicIds`, **`diffRemovedAssets` no borra lo que sigue en uso**, `hasPendingChanges`,
`isOwnedPublicId`, gate de `discard-assets`, y 6 casos de validación de imágenes
(formato, peso, **cuadrado**, lado mínimo/máximo, dimensiones ilegibles).

## 5. Resultados verificables

- **Reemplazo**: el botón «Subir / Reemplazar» está siempre disponible; no hace falta borrar antes.
- **No se borra el anterior antes de tiempo**: al reemplazar, el servidor **solo** borra el activo si
  no está referenciado por el borrador guardado ni por lo publicado. Si aún se usa, se elimina
  **después** del guardado/publicación (`diffRemovedAssets`).
- **Publicar guarda**: `POST /publish` persiste y publica el contenido enviado **en una transacción**;
  el botón solo dice «Publicado correctamente» si la operación devolvió 2xx.
- **Concurrencia**: dos sesiones → la segunda recibe **409** con el estado del servidor y el panel
  muestra el aviso «Otra sesión cambió esto» + botón **Recargar** (no se escribe nada).
- **Estados visibles**: *Cambios sin guardar · Borrador guardado · pendiente de publicar ·
  Publicado correctamente · Error de publicación*.
- **Favicon**: se publica y `DynamicFavicon` actualiza `link[rel=icon]` con `?v=<publishedAt>`;
  al despublicar se restaura el estático `/favicon.svg`.
- **Cloudinary**: solo se destruyen `public_id` con prefijo `institutional-identity/` (nunca archivos
  compartidos ni de otras carpetas).

### Escenarios manuales (requieren navegador + Neon + Cloudinary)
1. Subir logotipo · 2. Reemplazarlo · 3. Subir/reemplazar portada (escritorio y móvil) ·
4. Subir/reemplazar favicon (cuadrado PNG/WebP) · 5. Guardar borrador · 6. Publicar pendientes ·
7. Recargar (F5) · 8. Abrir otra sesión/navegador y comprobar los tres cambios ·
9. Errores CSP/401/403/409/500/Cloudinary (mensajes claros, sin falso éxito) ·
10. El archivo anterior no se borra antes de guardar/publicar · 11. El favicon cambia en la pestaña ·
12. `typecheck`, `tests`, `build`.

## 6. Riesgos pendientes

- Las pruebas con Neon/Cloudinary reales no pueden ejecutarse en este entorno.
- El borrado en Cloudinary es **best-effort**: si falla, la base queda consistente y el activo se
  limpia manualmente (queda registrado en el log y en la auditoría).
- Las subidas hechas y **abandonadas sin guardar** se limpian al reemplazarlas (o al guardar); un
  abandono sin reemplazo puede dejar el archivo subido (no referenciado) — es el único huérfano
  posible y se puede limpiar desde la misma herramienta.
- La validación de dimensiones es en el cliente (la API no recibe el archivo); el servidor sí
  impone formato (firmado) y propiedad de carpeta.

## 7. Despliegue en Render

1. Desplegar la rama. **No hay variables de entorno nuevas.**
2. `runMigrations()` aplica la migración **032** al arrancar.
3. Requisitos ya existentes: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
   `SITE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (las tres de
   Cloudinary o ninguna).
4. Tras el deploy, entrar como superadmin → **Administración → Identidad institucional** y probar
   los escenarios 1-11. El `index.html` va `no-cache`, pero conviene recargar con caché limpia.
