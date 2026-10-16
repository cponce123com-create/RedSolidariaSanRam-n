# Corrección CSP — Subida de imágenes a Cloudinary (V17)

Rama `feat/implementacion-integral-2026`.

## 1. El error

```
Connecting to https://api.cloudinary.com/v1_1/dpjarz8hu/image/upload violates
Content Security Policy: connect-src 'self' https://api.redsolidaria.com
```

## 2. Dónde se define la CSP (una sola fuente)

- **`artifacts/api-server/src/lib/csp.ts`** → `buildCspDirectives()`. La directiva
  culpable era `connectSrc: ["'self'", process.env.API_URL || "https://api.redsolidaria.com"]`.
- **`artifacts/api-server/src/app.ts`** → la aplica con `helmet({ contentSecurityPolicy: { directives } })`.

**No hay políticas duplicadas**: se verificó que no existe `<meta http-equiv="Content-Security-Policy">`
en `index.html`, ni archivo `_headers`, ni cabeceras CSP en `render.yaml`. La CSP se emite una sola vez,
desde el servidor (que en producción sirve también el frontend).

## 3. La corrección (solo `connect-src`)

```ts
connectSrc: [
  "'self'",
  process.env.API_URL || "https://api.redsolidaria.com",
  "https://api.cloudinary.com",   // ← añadido
],
```

- Se **conservan** los orígenes existentes (`'self'` y el API propio).
- Se añade el **origen exacto** del endpoint de subida: **sin comodines** y sin abrir `https:`.
- **No se toca ninguna otra directiva** ni se desactiva la CSP.

## 4. Cabecera real servida (comprobación en vivo)

```
HTTP 200
  default-src 'self'
  img-src 'self' data: https: blob:
  script-src 'self' 'sha256-P0ZVAVqQgMCHt7XYCoLvQhSHLn4aeAtfyknNQfDnBHQ='
  script-src-attr 'none'
  connect-src 'self' https://api.redsolidaria.com https://api.cloudinary.com
```

Una sola `connect-src` (sin duplicados) y `img-src` intacta.

## 5. Módulo de subida y componente (revisados)

- `artifacts/red-solidaria/src/lib/cloudinary-upload.ts`: firma del servidor → subida
  directa a `https://api.cloudinary.com/v1_1/<cloud>/image/upload`.
- `artifacts/red-solidaria/src/components/shared/ImageUploadField.tsx`: valida tipo/tamaño,
  sube, guarda la URL y muestra el error al administrador.

## 6. Cloudinary: cloud name y preset

- El **cloud name** viene de `CLOUDINARY_CLOUD_NAME` (entorno del servidor) y se devuelve en
  la firma; el cliente lo usa para construir la URL. **No está hardcodeado.**
- **No se usa «upload preset» sin firmar.** Se usa **signed upload**: las restricciones
  (carpeta, formatos permitidos, `public_id`) van **dentro de la firma**, así que el cliente
  no puede alterarlas. Es más seguro que un preset abierto.

## 7. El secreto nunca llega al frontend

`getUploadSignature()` devuelve `cloudName, apiKey, timestamp, publicId, folder, allowedFormats,
maxBytes, signature`. **`CLOUDINARY_API_SECRET` solo se usa para firmar en el servidor** y no
aparece en la respuesta (hay una prueba que lo comprueba). `apiKey` sí viaja: Cloudinary lo exige
en el formulario y no es un secreto.

## 8. Método de subida seguro

- Subida **firmada** (sin firma, Cloudinary rechaza el archivo).
- Restricciones firmadas: **carpeta** fija por endpoint (`institutional-identity`,
  `campaign-evidence`, `donation-proofs`), **formatos** `jpg,png,webp` (`allowed_formats`,
  aplicado por Cloudinary) y `max_bytes` 8 MB (validado además en el navegador con
  `validateProofImage`; la API de Cloudinary no acepta un parámetro de tamaño máximo, por eso
  el límite efectivo es cliente + firma).
- Rutas de firma protegidas: `/uploads/admin-signature` (admin) e
  `/uploads/institutional-signature` (**solo superadmin**), con rate limit.

## 9. `img-src` (visualización desde `res.cloudinary.com`)

**Sin cambios**: `img-src 'self' data: https: blob:` ya cubre `https://res.cloudinary.com`, así que
las imágenes subidas se muestran. El problema era `connect-src` (la subida), no `img-src` (la carga).

## 10. La URL se guarda en Neon y se refleja en la portada pública

El flujo ya existente (V15) sigue igual: la subida devuelve `secure_url` + `public_id` →
`ImageUploadField` llama a `onChange(url)` → el panel guarda con
`PUT /api/admin/institutional-identity` (columna `draft` JSONB en Neon) → **Publicar** copia a
`published` → la web pública lo lee con `GET /api/institutional-identity` y lo muestra en
`/nosotros`, el encabezado y la portada del home.

## 11. Mensajes de error comprensibles (nuevo)

`artifacts/red-solidaria/src/lib/upload-error-message.ts` (puro) traduce la causa real:
bloqueo de red/CSP (el caso que nos ocupa), firma rechazada (401/403), formato no permitido,
tamaño excedido, servicio caído (5xx) o mensaje desconocido de Cloudinary. Antes, un bloqueo CSP
llegaba al administrador como **`Failed to fetch`**; ahora se explica qué pasó y qué hacer.

## 12. Pruebas

| Comprobación | Resultado |
|---|---|
| `node --test` API (incluye `csp`, `cloudinary`) | **679/679** ✅ |
| `node --test` frontend (incluye `upload-error-message`) | **243/243** ✅ |
| typecheck API + frontend | **sin errores** ✅ |
| build web + build API | **OK** ✅ |
| Cabecera CSP real (servidor en vivo) | `connect-src 'self' … https://api.cloudinary.com` ✅ |

Pruebas añadidas: `connect-src` incluye Cloudinary **conservando** `'self'` y el API propio, sin
comodines; la cabecera servida **no duplica** directivas; la firma **no expone** el `api_secret`;
y los 7 casos de mensajes de error.

**Pruebas manuales (requieren navegador + Cloudinary real):** subir logotipo, subir portada,
reemplazar una imagen, guardar y recuperar la URL, comprobar la visualización pública, recargar y
confirmar que no hay errores en consola (CSP/CORS) ni respuestas fallidas de Cloudinary.

## 13. Despliegue en Render

1. Desplegar la rama (el CSP es código; **no** hay variables nuevas).
2. Variables ya existentes que deben estar presentes: `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (las tres o ninguna; el arranque falla si faltan
   parcialmente), `SITE_URL`, `API_URL` (opcional), `DATABASE_URL`, `SESSION_SECRET`.
3. Tras el deploy, **recargar el panel con caché limpia** (el `index.html` va `no-cache`, pero el
   navegador puede tener el documento anterior en memoria).

## 14. Verificación en producción

1. `curl -sI https://<dominio>/ | grep -i content-security-policy` → debe incluir
   `https://api.cloudinary.com` en `connect-src` y una sola `connect-src`.
2. En el panel (superadmin) → **Identidad institucional**: subir logotipo y portada. En DevTools →
   Network debe verse `200` desde `api.cloudinary.com` y **ninguna** violación de CSP en Console.
3. Guardar borrador → Publicar → abrir `/nosotros` en otra pestaña y comprobar el logotipo/portada.
4. Recargar (F5) y confirmar que la URL persiste (está en Neon).
5. Reemplazar la imagen y confirmar que la nueva se muestra (y la anterior se borra solo si es de
   nuestra carpeta).
