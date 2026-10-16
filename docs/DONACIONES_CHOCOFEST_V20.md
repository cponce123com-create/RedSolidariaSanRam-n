# Sistema de donaciones ChocoFest 2026 (V20) — entrega

Rama `feat/implementacion-integral-2026`. Alcance acordado: **núcleo ChocoFest** — modal, formulario
público de 2 pasos con productos múltiples, validación/seguridad, estados de cumplimiento y tabla
`donation_items`. Quedan para la siguiente iteración (con la base ya preparada): registro manual desde
el panel (F4), fotos de producto (F5), galería pública (F7) y Necesidades de campaña (F8).

---

## 1. Diagnóstico de causas raíz

| # | Problema | Causa raíz | Corrección |
|---|---|---|---|
| 1 | **El modal de donación no cerraba** (ni X, ni Escape, ni clic fuera) | `DonationModal.tsx` montaba `onOpenChange={open ? undefined : resetAndClose}`: con el diálogo **abierto** el manejador quedaba en `undefined`, así que Radix no tenía a quién pedir el cierre. Solo cerraban los botones que llamaban a `resetAndClose` directamente | Un único `handleOpenChange` que **nunca** es `undefined` y pasa siempre por `requestClose()`: cierra, o pide confirmación si hay datos, o no cierra mientras se envía |
| 2 | Riesgo de perder lo escrito al cerrar | No existía confirmación | Panel «¿Descartar tu donación?» con «Seguir editando» / «Descartar» |
| 3 | Modal bloqueado / sin salida | El `open` controlado por el padre no podía cambiar de estado | `open` **siempre** tiene manejador; cualquier gesto de cierre tiene salida. Tras enviar, cerrar no pregunta |
| 4 | Problemas de scroll/altura en móvil | El contenido crecía sin acotar | `DialogContent` en columna: cabecera y pie fijos, **solo el cuerpo** hace scroll; `h-[100dvh]` en móvil, `max-h-[85vh]` en escritorio |
| 5 | Un aporte en especie podía inflar el **dinero recaudado** | `POST /donations` guardaba `data.amount` aunque `collaborationType` no fuera dinero, y `GET /donations/stats` sumaba `amount` sin filtrar por tipo | Se **fuerza `amount = 0`** fuera de dinero y el total exige `collaboration_type = 'dinero'` (no-op sobre los datos históricos, que ya tenían 0) |
| 6 | Doble envío creaba dos donaciones | No había idempotencia | Clave `dedupe_token` por sesión de formulario + **índice único parcial**: un reintento devuelve la MISMA donación |
| 7 | No había forma de distinguir «prometido» de «recibido» | Solo existía el estado contable | Columna **`fulfillment_status`** (ciclo de vida paralelo) con transiciones autorizadas y auditoría |

---

## 2. Archivos

**Nuevos (11)**
- `lib/db/src/schema/donation-items.ts`
- `artifacts/api-server/src/lib/donation-fulfillment.ts` · `donation-items.ts` · `donation-tracking.ts`
- `artifacts/api-server/tests/donation-fulfillment.test.mjs` · `donation-items.test.mjs` · `donation-tracking.test.mjs`
- `artifacts/red-solidaria/src/lib/donation-products.ts` · `donation-submit.ts` · `phone.ts`
- `artifacts/red-solidaria/tests/donation-products.test.mjs`

**Modificados (10)**
`lib/db/src/schema/donations.ts` (columnas nuevas + omisión anti mass-assignment), `lib/db/src/schema/index.ts`,
`lib/db/src/migrate.ts` (migración 034), `artifacts/api-server/src/lib/donation-validation.ts` (WhatsApp,
ítems, consentimiento de contacto, organización, idempotencia), `artifacts/api-server/src/routes/donations.ts`
(ítems + idempotencia + código de seguimiento + `PUT /donations/:id/fulfillment` + filtro del total),
`artifacts/api-server/build-tests.mjs`, `artifacts/red-solidaria/build-tests.mjs`,
`artifacts/red-solidaria/src/components/shared/DonationModal.tsx` (reescrito),
`artifacts/red-solidaria/tests/vitest/donation-modal.test.tsx` (regresiones conservadas y ampliadas).

---

## 3. Migraciones necesarias

Una sola, **aditiva e idempotente**: `034_donation_items_fulfillment.sql`.

- `donations`: `fulfillment_status` (default `pendiente_coordinacion`), `tracking_code`, `dedupe_token`,
  `received_at`, `fulfillment_updated_at`, `fulfillment_updated_by`, `contact_consent` (default `false`), `org_name`.
- Índices **únicos parciales** en `tracking_code` y `dedupe_token` (solo cuando no son NULL, así las
  donaciones históricas no chocan).
- Tabla `donation_items` (+ índice por `donation_id`).

Se aplica sola al arrancar (`runMigrations()`). **No modifica ni borra ninguna donación histórica**
(ChocoFest 2025) y no toca ninguna tabla financiera. Rollback: `DROP TABLE donation_items;` y `DROP COLUMN`
de las columnas nuevas.

---

## 4. Nuevas funciones implementadas

**Formulario público (Fases 1–2)**
- Paso 1 con tres opciones: **donar dinero** (botones rápidos S/ 10 · 20 · 50 · 100 + otro monto + Yape/Plin/transferencia/otro + aviso de que el aporte queda **pendiente** hasta verificar), **donar productos**
  (catálogo de 9 productos, cantidad, unidad entre caja/paquete/saco/unidad/kilogramo/litro, descripción,
  valor estimado **separado** y **varios productos por donación**) y **ofrecer servicios o apoyo logístico**
  (descripción + disponibilidad).
- Paso 2 con lo mínimo: nombre, WhatsApp peruano, correo, organización opcional, autorización de contacto
  y preferencia de anonimato.
- Cierre con agradecimiento y **código único de seguimiento** (`RSR-2026-A7K3Q9`, alfabeto sin caracteres
  ambiguos). Para dinero se distingue «solicitud registrada» de «pago recibido».

**Validación y seguridad (Fase 3)**
- Validación en el navegador **y** en el servidor (zod): tipo obligatorio, cantidades > 0, montos ≥ S/ 5 y
  máx. 2 decimales, WhatsApp peruano (9 dígitos / `+51`), correo válido, descripciones con tope, producto y
  unidad por allowlist, máx. 10 productos.
- Idempotencia, rate limit existente, permisos administrativos intactos, errores genéricos al público y
  consentimientos de **contacto** y **publicación** registrados por separado.

**Estados de cumplimiento (Fase 6)**
- `pendiente_coordinacion → comprometida → recibida → verificada` y `rechazada_cancelada` desde cualquier
  estado no verificado; `verificada` es terminal. `PUT /donations/:id/fulfillment` (solo admin, con rate
  limit y auditoría) y registro de la **cantidad realmente recibida** por ítem.
- **El estado contable no se toca**: una promesa nunca cuenta como ingreso.

---

## 5. Pruebas ejecutadas y resultados

| Comprobación | Comando | Resultado |
|---|---|---|
| Tests API | `pnpm --filter @workspace/api-server test` | **740/740** ✅ (+22) |
| Tests web (node:test) | `pnpm --filter @workspace/red-solidaria test` | **266/266** ✅ |
| Tests web (vitest) | ídem | **41/41** ✅ (+8) |
| Typecheck API y web | `… run typecheck` | sin errores ✅ |
| Build API y web | `… run build` | OK ✅ |

**Cobertura nueva**
- `donation-fulfillment.test.mjs`: estados, transiciones, `verificada` terminal, motivo del bloqueo y la
  guarda de que **ningún estado de cumplimiento es un estado contable confirmado** (una promesa no suma).
- `donation-items.test.mjs`: catálogo/unidades, **varios productos**, «otros» con texto libre, cantidad > 0,
  topes, decimales, y que el **valor estimado no se mezcla** con el dinero (no existe campo `amount`).
- `donation-tracking.test.mjs`: normalización del WhatsApp peruano, formato y validación del código de
  seguimiento, y tokens de idempotencia (rechaza espacios y `;`).
- `donation-products.test.mjs` (frontend): el espejo del catálogo coincide con el servidor, el resumen del
  ejemplo del prompt («1 caja · Panetones») y el mismo criterio de teléfono.
- `donation-modal.test.tsx` (vitest): **abre**, **cierra con la X**, **cierra con Escape**, **cierra con
  Cancelar**, **pide confirmación** si hay datos y permite seguir editando, envío de productos con código de
  seguimiento, **no muestra éxito si la API falla**, WhatsApp inválido, y las regresiones conservadas del
  test anterior (monto mínimo, 2 decimales, centavos, flujo completo de dinero).

---

## 6. Problemas pendientes

1. **Fuera del alcance acordado**: registro manual desde el panel (F4), fotos de producto en Cloudinary (F5),
   galería pública «La solidaridad en acción» (F7) y Necesidades de campaña con recibido derivado (F8). La
   base ya está lista: `donation_items` (con `photo_url`/`photo_public_id`/`received_quantity`),
   `fulfillment_status`, el consentimiento `public_photo` y `isVerifiedStatus()`.
2. **Correo obligatorio**: el prompt pedía «correo opcional», pero la identidad del donante
   (`donors.email`, única) se resuelve por correo. Hacerlo opcional exige cambiar el modelo de identidad y
   el recuento de donantes; **no se hizo en silencio** y queda como decisión pendiente.
3. **Panel de administración**: el listado admin (`formatDonationRow`) devuelve `fulfillmentStatus`/`trackingCode`
   en `null` si su SQL no selecciona las columnas nuevas. Falta añadirlas a esa consulta y a la interfaz
   (no se inventa ningún estado, para no mostrar información falsa).
4. **i18n**: los textos nuevos del formulario están en español (los antiguos usaban i18n). Falta añadir las
   claves a `es.ts`/`en.ts` para mantener el bilingüismo del flujo de donación.
5. **E2E**: no se ejecutó el flujo E2E completo contra Neon + Cloudinary reales (no hay credenciales aquí).
6. **Estados de cumplimiento en el total de productos**: `isFulfilledStatus()` ya existe y está probado, pero
   todavía no hay ningún agregado público de «productos recibidos» que lo consuma (llega con F8).

---

## 7. Instrucciones de despliegue en Render

1. **Variables**: las mismas de V18.1/V19 (`DATABASE_URL`, `SESSION_SECRET`, `CLOUDINARY_*`, `SITE_URL`,
   `CORS_ORIGIN`, `NODE_ENV=production`). No se añade ninguna nueva.
2. **Build/Start** (ya en `render.yaml`): `pnpm install --frozen-lockfile && pnpm run build` /
   `node artifacts/api-server/dist/index.mjs`.
3. **Migración**: `runMigrations()` aplica `034_donation_items_fulfillment.sql` al arrancar. Es idempotente;
   no hay pasos manuales ni scripts que ejecutar.
4. **Orden recomendado**: desplegar primero la API (aplica la migración) y luego el frontend. El formulario
   antiguo sigue funcionando durante la transición: los campos nuevos son opcionales en el servidor.
5. **Rollback**: redeploy de la versión previa. Si hiciera falta revertir el esquema:
   `DROP TABLE IF EXISTS donation_items;` y `DROP COLUMN IF EXISTS` de las ocho columnas nuevas (ninguna otra
   parte del sistema depende de ellas).

---

## 8. Verificaciones posteriores al despliegue

1. `GET /api/healthz` → 200.
2. Abrir el modal desde ChocoFest 2026 y **cerrarlo con la X, con Escape y con «Cancelar»** (las tres vías).
3. Escribir algo, cerrar y comprobar que **pide confirmación**.
4. Donar **S/ 20** por Yape → aparece el código de seguimiento y el aviso de «solicitud pendiente».
5. Comprobar en el panel que la donación es `pending` y que **el total recaudado no subió**.
6. Aprobarla (con comprobante) y comprobar que **ahora sí** suma y que se creó el asiento en el libro.
7. Donar **productos** (una caja de panetones + 5 kg de arroz) → verificar que se guardaron los dos ítems.
8. Ofrecer un **servicio** (transporte) → comprobar que exige la descripción.
9. Marcar el aporte como **recibida** y luego **verificada** desde el panel; comprobar que el estado contable
   del dinero no cambia.
10. Reenviar el mismo formulario (doble clic) y comprobar que **no se crea una segunda donación**.
11. Repetir en **móvil** (modal a pantalla completa, botones grandes, solo el cuerpo con scroll).

---

## 9. Evaluación técnica antes / después

| Área | Antes | Después |
|---|---|---|
| Cierre del modal | X, Escape y clic fuera **no funcionaban** | Las tres vías funcionan; confirmación si hay datos; nunca se bloquea |
| Formulario | 2 pasos fijos, solo dinero + comprobante | 3 tipos de aporte en 2 pasos, con productos múltiples y servicios |
| Productos | No existían | `donation_items`: producto, cantidad, unidad, descripción, valor estimado separado |
| Código de seguimiento | No existía | `RSR-AAAA-XXXXXX` por donación |
| Duplicados | Doble envío = dos donaciones | Idempotencia con índice único |
| Dinero vs. bienes | Un importe en especie podía sumar al recaudado | `amount = 0` fuera de dinero + filtro `dinero` en el total |
| Prometido vs. recibido | Un solo estado | Estado de cumplimiento paralelo, con transiciones y auditoría |
| WhatsApp | Texto libre | Validado y normalizado a `+51XXXXXXXXX` |
| Accesibilidad móvil | Sin controles de altura | Pantalla completa, cabecera/pie fijos, botones ≥ 44 px, `aria-invalid` y `role="alert"` |
| Pruebas | 718 API / 33 vitest | **740 API / 41 vitest** (+ los contratos puros del frontend) |

**Puntuación por área (sobre 10)**: corrección del bug 10 · formulario público 8 (falta i18n y correo
opcional) · validación/seguridad 9 · estados 9 · base de datos 9 · sincronización 8 · pruebas 8 ·
documentación 8 · alcance restante (F4/F5/F7/F8) 3.
