# CMS institucional integral (V19) — entrega

Rama `feat/implementacion-integral-2026`. Continúa la identidad institucional (V18/V18.1) con un
**CMS de páginas** que permite al superadministrador editar el contenido público sin tocar código ni
redesplegar.

**Decisión de alcance acordada:** modelo de **Páginas CMS tipadas**; entrega en **vertical slice**
(Inicio, Nuestra historia, Menú/Pie) de punta a punta; **imágenes con encuadre, proporción y variantes
responsivas**; **CMS por idioma** (es/en con respaldo es). El resto de páginas quedan registradas y
editables, pendientes de cablear sobre la misma base.

---

## 1. Inventario y matriz de cobertura (Fase 1)

24 páginas públicas. El texto vive en `src/lib/i18n/locales/es.ts` (~600 claves) → es el grueso de lo
*estático en código*.

| Clase | Elementos | Tratamiento |
|---|---|---|
| **Ya editable** | Identidad institucional (logo, portada, favicon, historia, misión/visión/valores); `settings` (WhatsApp, ChocoFest, campaña protagonista); entidades reales (campañas, donaciones, noticias, testimonios, FAQ, aliados, mascotas, casos, reportes) | Se conserva; el CMS no lo duplica |
| **Calculado desde Neon** | Recaudado, meta, % de avance, nº de donantes, KPIs de transparencia, contadores del home, cifras de cierre, inventario | **Nunca** pasa a texto libre: solo encabezado y visibilidad |
| **Config técnica** | CSP, `DATABASE_URL`, Cloudinary, `SESSION_SECRET`, roles, rate-limit | **No se expone** |
| **Parcialmente editable** | WhatsApp (número sí), ChocoFest (textos sí; cifras calculadas) | Se extiende donde aporta |
| **Estático a migrar → CMS** | Inicio, Nuestra historia, Menú/Pie | **Cableado en esta entrega** |
| **Estático a migrar (pendiente)** | Campañas, Donaciones, Voluntariado, Necesito ayuda, Adopciones, Transparencia, Noticias/Testimonios, Contacto | Registradas y editables; se cablean sobre la misma base |

**Prioridad**: Inicio · Nuestra historia · Menú/Pie · Contacto · Voluntariado · Necesito ayuda ·
Donaciones · Adopciones · Campañas · Transparencia · Noticias/Testimonios.

**Bug corregido (Fase 4):** `StorySection` («Nuestra historia») usaba una imagen **fija** en el código
(`images/historia-red.jpg`, `aspect-[4/3] object-cover`, sin foco) e ignoraba la foto administrable:
de ahí el recorte. Ahora usa la imagen del CMS con **encuadre** (`object-position`), **texto
alternativo** y **variantes responsivas** (`srcset`), y mantiene la imagen estática como respaldo.

---

## 2. Arquitectura del CMS

### Modelo de datos (migración `033_cms_pages.sql`, aditiva e idempotente)

- `cms_pages`: `slug` PK, `draft` jsonb, `published` jsonb, `status` (`draft|published|scheduled`),
  `published_at`, `scheduled_at`, `version`, `updated_at`, `updated_by`.
- `cms_page_versions`: histórico por página (`slug`, `version`, `content`, `action`, `note`,
  `created_at`, `created_by`) + índice `(slug, version)`.

Mismo patrón probado de `institutional_identity`: **borrador y publicado separados**, versión para
concurrencia optimista, snapshot por acción para auditar y restaurar.

### Contenido tipado y seguro (`lib/cms-content.ts`, puro)

- Registro `PAGE_SPECS` (11 páginas) + `BLOCK_SPECS` (12 tipos de bloque) con **allowlist** de campos.
- `normalizePage` **descarta** cualquier bloque o campo fuera del esquema → el panel no puede inyectar
  campos arbitrarios ni componentes dinámicos.
- Textos bilingües `{ es, en }` con respaldo; HTML saneado con `sanitizeRichText` (doble pasada).
- **Las cifras no son editables**: los bloques `ref*` (estadísticas, campañas, casos urgentes,
  adopciones) solo tienen encabezado/subtítulo/visibilidad. Cualquier número enviado se descarta al
  normalizar (probado).
- `publicPageDto` con **allowlist explícita**: nunca expone `publicId`.
- `diffRemovedAssets` / `collectAssetPublicIds` / `isOwnedCmsPublicId` para no dejar huérfanos.

### API (`routes/cms.ts`)

| Método | Ruta | Función |
|---|---|---|
| GET | `/cms/pages/:slug` | **Público**: DTO publicado o `null` (el frontend usa i18n) |
| GET | `/admin/cms/pages` | Listado con estado, versión y cambios pendientes |
| GET | `/admin/cms/pages/:slug` | Borrador + publicado + versión + esquema de bloques |
| PUT | `/admin/cms/pages/:slug` | Guardar **borrador** (409 `version_conflict`) |
| POST | `/admin/cms/pages/:slug/publish` | **Guarda y publica** en una transacción |
| POST | `/admin/cms/pages/:slug/unpublish` | Despublica conservando borrador y assets |
| POST | `/admin/cms/pages/:slug/schedule` | Publicación **programada** (materialización perezosa) |
| GET | `/admin/cms/pages/:slug/versions` | Historial (30 últimas) |
| POST | `/admin/cms/pages/:slug/restore` | Restaura una versión **como borrador** |
| POST | `/admin/cms/assets/discard` | Anti-huérfanos (solo `cms/…` y no referenciados) |
| POST | `/uploads/cms-signature` | Firma Cloudinary; **el servidor fija** `cms/<slug>` |

Todo pasa por `requireRole(SUPERADMIN)` y se registra en auditoría (`CMS_UPDATED`, `CMS_PUBLISHED`,
`CMS_UNPUBLISHED`, `CMS_SCHEDULED`, `CMS_VERSION_RESTORED`, `CMS_ASSETS_DISCARDED`).

### Editor visual (`pages/admin/content.tsx` + `pages/admin/page-editor.tsx`)

Bajo **Contenido → Editor de páginas**. Incluye: vista previa **escritorio/móvil** (iframe con
`?cmsPreview=1`, que lee el **borrador**), guardar borrador, publicar, despublicar, programar,
historial + restaurar, **reordenar** bloques, **activar/desactivar** y editor enriquecido seguro.
Los campos se generan desde el esquema que devuelve el servidor (la misma allowlist que valida).

### Consumo público

`useCmsPage(slug)` + `lib/cms.ts`. **El contenido de i18n es el valor por defecto y lo publicado solo
lo superpone**: la web nunca queda vacía ni se rompe, y los datos estáticos **nunca** sobrescriben lo
publicado. Un bloque **desactivado oculta su sección** (`isBlockEnabled`).

---

## 3. Archivos

**Nuevos (11)**
- `lib/db/src/schema/cms-pages.ts`
- `artifacts/api-server/src/lib/cms-content.ts`
- `artifacts/api-server/src/routes/cms.ts`
- `artifacts/api-server/tests/cms-content.test.mjs`, `tests/cms-auth.test.mjs`
- `artifacts/red-solidaria/src/lib/cms.ts`
- `artifacts/red-solidaria/src/hooks/use-cms-page.ts`
- `artifacts/red-solidaria/src/components/admin/CmsImageField.tsx`
- `artifacts/red-solidaria/src/pages/admin/content.tsx`, `pages/admin/page-editor.tsx`
- `artifacts/red-solidaria/tests/cms-content.test.mjs`

**Modificados (22)**
`lib/db/src/migrate.ts`, `lib/db/src/schema/index.ts`, `api-server/src/lib/{audit,cloudinary}.ts`,
`api-server/src/routes/{index,uploads}.ts`, `api-server/build-tests.mjs`,
`red-solidaria/build-tests.mjs`, `src/App.tsx`, `src/lib/{cloudinary-upload,image-url,query-keys,query-invalidation}.ts`,
`src/pages/home.tsx`, `src/pages/admin/layout.tsx`, `src/components/layout/{Navbar,Footer}.tsx`,
`src/components/home/{HomeHero,HowToHelpSection,TransparencySection,StorySection,FinalCtaSection}.tsx`.

---

## 4. Migraciones de Neon

Una sola, **aditiva**: `033_cms_pages.sql` (2 tablas + índice). Se aplica sola al arrancar
(`runMigrations()`), es idempotente (`IF NOT EXISTS`) y **no toca ninguna tabla financiera**.
Rollback: `DROP TABLE cms_page_versions; DROP TABLE cms_pages;`.

---

## 5. Pruebas ejecutadas y resultados

| Comprobación | Comando | Resultado |
|---|---|---|
| Tests API | `pnpm --filter @workspace/api-server test` | **718/718** ✅ |
| Tests web (node:test) | `pnpm --filter @workspace/red-solidaria test` | **262/262** ✅ |
| Tests web (vitest) | ídem | **33/33** ✅ |
| Typecheck API | `pnpm --filter @workspace/api-server run typecheck` | sin errores ✅ |
| Typecheck web | `pnpm --filter @workspace/red-solidaria run typecheck` | sin errores ✅ |
| Build API | `pnpm --filter @workspace/api-server run build` | OK ✅ |
| Build web | `pnpm --filter @workspace/red-solidaria run build` | OK ✅ |

**Cobertura nueva del CMS**

- `cms-content.test.mjs` (API, puro): slug desconocido; materialización de bloques; **allowlist**
  (bloque y campos desconocidos descartados); bilingüe con recorte; **«las cifras no se pueden
  falsificar»** (un bloque `refStats` con `totalRecaudado: 999999` → el número no sobrevive); una
  cifra en un campo de texto se descarta; solo URLs https y enlaces seguros; **anti-XSS** del HTML
  enriquecido; orden y activado/desactivado; validación de botón-sin-enlace; DTO público sin
  `publicId` y con bandera `enabled`; `null` sin publicar; cambios pendientes; borrado diferido de
  activos.
- `cms-auth.test.mjs` (API, rutas): 403 sin sesión y con rol insuficiente; 404 de slug desconocido;
  400 de validación (botón sin enlace, descarte vacío, fecha de programación pasada).
- `cms-content.test.mjs` (web, puro): respaldo de idioma; **i18n como valor por defecto**; lo
  publicado superpone; un campo vacío **no** sobrescribe; `javascript:` bloqueado; activo con foco y
  proporción; `resolveImage` con respaldo; **bloque desactivado oculta la sección**; listas.

---

## 6. Evaluación de seguridad

| Vector | Mitigación |
|---|---|
| XSS por HTML arbitrario | `sanitizeRichText` con allowlist estricta, aplicado **al escribir y al leer**; el editor no acepta HTML libre |
| Campos/componentes no autorizados | Allowlist de bloques y campos en el servidor; el editor se genera desde ese esquema |
| Enlaces peligrosos (`javascript:`) | Validación de URL en servidor y en el resolutor del frontend |
| Escalada de privilegios | Todas las rutas admin con `requireRole(SUPERADMIN)`; la vista pública solo devuelve lo publicado |
| Fuga de identificadores internos | El DTO público no expone `publicId` |
| Falsificación de cifras | Los bloques `ref*` no tienen campos numéricos; los números se calculan desde Neon |
| Condiciones de carrera | `version` + **409** en cada escritura; publicar guarda y publica en una transacción |
| Archivos huérfanos | Borrado **diferido** (tras confirmar) y **solo** de la carpeta `cms/` y no referenciados |
| CSP | Sin cambios permisivos: se sigue usando la CSP existente (ya autoriza `api.cloudinary.com`) |
| Credenciales | La firma se emite en el servidor; el cliente nunca ve el `api_secret` |

---

## 7. Comparación antes / después

| Aspecto | Antes | Después |
|---|---|---|
| Cambiar un texto del home | Editar `es.ts` + commit + redeploy | Editor de páginas → guardar borrador → publicar |
| Imagen de «Nuestra historia» | Fija en código, recortada, sin foco | Administrable, con **encuadre**, alt y `srcset` |
| Menú y pie de página | Fijos en código | Etiquetas, enlaces y orden administrables |
| Vista previa | No existía | Escritorio y móvil, sobre el **borrador** real |
| Revertir un cambio | Revertir el commit | **Historial** con restauración a borrador |
| Despublicar sin perder el trabajo | No existía | `unpublish` conserva borrador y assets |
| Publicación programada | No existía | `schedule` con materialización perezosa |
| Concurrencia entre pestañas | No contemplada | `version` + 409 |
| Cifras | Texto en i18n en algunos sitios | Siempre desde Neon; el CMS no puede tocarlas |
| Huérfanos en Cloudinary | Riesgo al reemplazar | Borrado diferido y acotado a `cms/` |

---

## 8. Puntuación por áreas (sobre 10)

| Área | Nota | Comentario |
|---|---|---|
| Arquitectura y modelo de datos | 9 | Reutiliza el patrón probado; aditivo y sin tocar finanzas |
| Seguridad | 9 | Allowlist, saneado doble, roles, sin `publicId`, sin CSP laxa |
| Fase 3 (editor visual) | 8 | Todo lo pedido; el reordenar es con botones (no drag & drop) |
| Fase 4 (imágenes) | 8 | Foco, proporción, alt, srcset; falta recorte libre por arrastre |
| Sincronización (Fase 5) | 8 | Invalidación por entidad + vista previa del borrador; caché anónima de 60 s |
| Optimización (Fase 6) | 7 | `srcset`/lazy y code splitting del editor; sin perfilado en producción |
| Pruebas (Fase 7) | 7 | Lógica pura y permisos cubiertos; falta E2E con Neon + Cloudinary reales |
| Cobertura del contenido | 6 | 3 de 11 páginas cableadas (por diseño del slice) |
| Documentación | 9 | Inventario, matriz, riesgos y despliegue |

---

## 9. Problemas pendientes

1. **Cablear las 8 páginas restantes** (Contacto, Voluntariado, Necesito ayuda, Donaciones, Adopciones,
   Campañas, Transparencia, Noticias/Testimonios): ya están registradas y editables; solo falta que sus
   componentes lean `useCmsPage`.
2. **Verificación E2E manual** con Neon + Cloudinary reales (subir/publicar/programar/restaurar y
   comprobar en una sesión anónima). No se ha ejecutado aquí por no disponer de esas credenciales.
3. **Drag & drop** para reordenar bloques (hoy: botones subir/bajar, accesibles por teclado).
4. **Recorte libre** de imágenes por arrastre (hoy: rejilla 3×3 de encuadre).
5. **Caché pública de 60 s** en `GET /api/cms/pages/:slug` anónimo: la sesión admin va con `no-store`,
   pero un proxy podría servir hasta 60 s de contenido antiguo. Si se quiere visibilidad inmediata,
   excluir la ruta de `publicApiCache`.
6. **Sin cron en Render Free**: la publicación programada se materializa de forma perezosa al leer o
   publicar (idempotente), no en el instante exacto.

---

## 10. Despliegue en Render

1. **Variables**: las mismas de V18.1 (`DATABASE_URL`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SITE_URL`, `CORS_ORIGIN`, `NODE_ENV=production`).
2. **Build/Start** (ya en `render.yaml`): `pnpm install --frozen-lockfile && pnpm run build` /
   `node artifacts/api-server/dist/index.mjs`.
3. **Migración**: `runMigrations()` aplica `033_cms_pages.sql` al arrancar. No hay pasos manuales.
4. **Verificación**: entrar como superadmin → **Contenido → Editor de páginas** → editar «Inicio» →
   guardar borrador → **vista previa escritorio/móvil** → publicar → abrir la web en una ventana de
   incógnito y comprobar el cambio.
5. **Rollback**: redeploy de la versión previa; si se revirtiera el esquema,
   `DROP TABLE cms_page_versions; DROP TABLE cms_pages;` (ninguna otra parte del sistema depende de ellas).

---

## 11. Addendum V19.1 — cableado de las 8 páginas restantes

Se completó el pendiente nº 1 de la entrega anterior: **las 11 páginas del CMS ya son administrables
y la web pública las consume**.

**Nuevo componente `components/shared/CmsPageHeading.tsx`**: encabezado administrable reutilizable
(bloque `hero`). Aplica el principio del CMS — el texto de i18n es el valor por defecto, lo publicado
lo superpone, y un bloque `hero` **desactivado** oculta el encabezado. Evita duplicar en cada página la
lectura del CMS y el respaldo de idioma.

**Páginas cableadas en este addendum** (título + subtítulo administrables):

| Página | Slug del CMS | Archivo |
|---|---|---|
| Campañas y actividades | `campanas` | `pages/campaigns.tsx` |
| Donaciones / cómo ayudar | `donaciones` | `pages/how-to-help.tsx` |
| Voluntariado | `voluntariado` | `pages/volunteer.tsx` |
| Necesito ayuda | `necesito-ayuda` | `pages/report-form.tsx` |
| Adopciones | `adopciones` | `pages/adoptions.tsx` |
| Transparencia | `transparencia` | `pages/transparency.tsx` |
| Noticias y testimonios | `noticias` | `pages/news.tsx` |
| Contacto | `contacto` | `pages/contact.tsx` |

**Cobertura resultante**

| Página | Bloques administrables | Estado |
|---|---|---|
| Inicio | hero, formas de ayudar, ref. campañas, ref. casos urgentes, ref. cifras, imagen+texto, ref. adopciones, CTA | **Completa** |
| Nuestra historia | hero, imagen+texto, texto enriquecido, tarjetas, CTA | **Completa** |
| Menú y pie | menú principal, pie de página | **Completa** |
| Las 8 restantes | encabezado (hero) | Encabezado administrable; se añadirán más bloques por página |

El esquema de cada página declara **solo los bloques que tienen efecto**, de modo que el editor nunca
muestra controles que no cambian nada. Añadir más bloques a una página es ampliar su esquema en
`PAGE_SPECS` y renderizarlos en el componente: la infraestructura (borrador, publicación, versiones,
imágenes, auditoría) ya está resuelta.

**Verificación tras el addendum**

| Comprobación | Resultado |
|---|---|
| Tests API | **718/718** ✅ |
| Tests web (node:test) | **262/262** ✅ |
| Tests web (vitest) | **33/33** ✅ |
| Typecheck API y web | sin errores ✅ |
| Build API y web | OK ✅ |

**Pendiente actualizado**: ya no queda ninguna página sin encabezado administrable. Lo que resta es
**ampliar bloques** (texto enriquecido, CTA, imágenes) en las 8 páginas secundarias, y la verificación
E2E manual con Neon + Cloudinary reales.
