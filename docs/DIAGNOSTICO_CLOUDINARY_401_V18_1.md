# Diagnóstico y corrección del 401 de Cloudinary (V18.1)

Rama `feat/implementacion-integral-2026`.

## 1. Qué significa el error

```
POST https://api.cloudinary.com/v1_1/dpjarz8hu/image/upload 401 (Unauthorized)
```

**Ya no es un problema de CSP**: la petición **sale** del navegador y llega a Cloudinary (el arreglo
de V17 funcionó). Un **401** de Cloudinary significa **firma o credenciales**: la petición está
autenticada mal, no bloqueada.

## 2. Causas raíz corregidas

| # | Causa | Corrección |
|---|---|---|
| 1 | **Se firmaba `max_bytes`.** No es un parámetro de la API de subida de Cloudinary. La firma se calcula sobre los parámetros que Cloudinary reconoce: al incluir uno desconocido, **la firma no coincide** y Cloudinary responde `401 Invalid Signature`. | Se elimina `max_bytes` del firmado **y** del envío (`lib/cloudinary.ts`, `cloudinary-upload.ts`). El límite de 8 MB se sigue validando **antes** de subir (`image-validation`). |
| 2 | **Credenciales con espacios o saltos de línea.** Al pegar `CLOUDINARY_*` en Render es fácil que se cuele un `
` o un espacio final; el secreto entonces **no** es el de Cloudinary → `401 Invalid Signature` sin pista alguna. | Se aplica `trim()` a las tres variables al leerlas (`lib/cloudinary.ts`, `lib/asset-cleanup.ts`). |
| 3 | **El 401 se ocultaba.** El mapeo de errores convertía cualquier 401 en «Vuelve a iniciar sesión», que despista: el problema es de Cloudinary, no de la sesión. | El mensaje **literal** de Cloudinary se propaga al administrador (`Cloudinary rechazó la subida: Invalid Signature …`). |
| 4 | **No había forma de saber la causa exacta.** | Nuevo **diagnóstico server-side** (ver §3). |

## 3. Herramienta de diagnóstico (nueva)

**`POST /api/uploads/cloudinary-check`** (solo superadmin) ejecuta **la misma subida firmada que el
navegador** —un PNG de 1×1, que se borra acto seguido— y devuelve:

```json
{
  "ok": false,
  "configured": true,
  "status": 401,
  "cloudName": "dpjarz8hu",
  "cloudinaryMessage": "Invalid Signature 3f2a…. String to sign - 'allowed_formats=png&folder=…'",
  "hints": [
    "Revisa que CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET sean del cloud «dpjarz8hu» …",
    "Vuelve a pegar las variables en Render …",
    "«Invalid Signature» significa que la clave y el secreto no corresponden a este cloud …"
  ]
}
```

En el panel: **Identidad institucional → Diagnóstico de subida de imágenes → «Comprobar Cloudinary»**.

### Cómo interpretar el resultado

| Resultado | Qué hacer |
|---|---|
| `ok: true` | La firma y las credenciales del servidor funcionan: la subida desde el navegador debería completarse. |
| `status: 401` + `Invalid Signature` | La **clave y el secreto no son de este cloud**. En Cloudinary → *Dashboard* del cloud `dpjarz8hu` → copia **API Key** y **API Secret** y vuelve a pegarlos en Render (sin espacios). |
| `status: 401` + `Invalid credentials` | El **API Key no existe** o está mal escrito. |
| `status: 400` | Algún parámetro de la petición fue rechazado. |
| `configured: false` | Faltan variables de Cloudinary en el entorno del servidor. |
| `status: null` | El servidor no pudo salir a `api.cloudinary.com` (red/salida bloqueada). |

## 4. Archivos modificados

**API**
- `artifacts/api-server/src/lib/cloudinary.ts` — `trim()` de credenciales; `max_bytes` fuera del firmado; `getCloudName()`.
- `artifacts/api-server/src/lib/asset-cleanup.ts` — `trim()` de credenciales.
- `artifacts/api-server/src/routes/uploads.ts` — **`POST /uploads/cloudinary-check`**.

**Frontend**
- `artifacts/red-solidaria/src/lib/cloudinary-upload.ts` — deja de enviar `max_bytes`.
- `artifacts/red-solidaria/src/lib/upload-error-message.ts` — propaga el mensaje literal de Cloudinary.
- `artifacts/red-solidaria/src/components/admin/CloudinaryDiagnostic.tsx` **(nuevo)**.
- `artifacts/red-solidaria/src/hooks/use-institutional-identity.ts` — `useCloudinaryCheck`.
- `artifacts/red-solidaria/src/pages/admin/institutional-identity.tsx` — monta el diagnóstico.

**Pruebas**
- `artifacts/api-server/tests/cloudinary.test.mjs` — `max_bytes` no se firma; `trim` de credenciales.
- `artifacts/red-solidaria/tests/upload-error-message.test.mjs` — el 401 propaga el mensaje de Cloudinary.

## 5. Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| `node --test` API | **687/687** ✅ |
| `node --test` frontend | **252/252** ✅ |
| typecheck API + frontend | **sin errores** ✅ |
| build web + build API | **OK** ✅ |

## 6. Cómo verificar en producción

1. Desplegar la rama (sin variables nuevas).
2. Entrar como superadmin → **Identidad institucional** → **«Comprobar Cloudinary»**.
3. Si responde `ok: true` → subir logotipo, portada y favicon (debería funcionar).
4. Si responde `401` → seguir la tabla de §3 (lo más probable: **API Key/Secret que no son del
   cloud `dpjarz8hu`**, o un espacio/salto de línea al pegarlos).

## 7. Riesgos pendientes

- El diagnóstico **crea y borra** un activo de 1×1 en `institutional-identity/_diagnostico`; es
  inofensivo y queda limpio, pero deja una entrada en el log de Cloudinary.
- Si tras el `trim` y sin `max_bytes` el 401 persiste, la causa es **de configuración**
  (clave/secreto), no de código: el diagnóstico devuelve el motivo exacto.
- Sigue pendiente la verificación manual de los escenarios de V18 (subir/reemplazar/publicar) en un
  entorno con Neon + Cloudinary reales.
