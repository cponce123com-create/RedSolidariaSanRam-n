# Auditoría correctiva V7.1 — Red Solidaria San Ramón

> Documento de entrega de la versión **V7.1**. Recoge los problemas detectados, sus
> causas, las correcciones implementadas, las migraciones, las pruebas ejecutadas
> con sus resultados y los riesgos pendientes.
>
> **Ninguna corrección se declara terminada sin prueba.** Todo lo que aparece como
> «corregido» tiene una prueba automática (unitaria, de API o E2E contra
> PostgreSQL real) que lo verifica y que aparece en la sección de resultados.

---

## 1. Resumen ejecutivo

| Fase | Tema | Estado | Commit |
| --- | --- | --- | --- |
| 1 | Eliminación de campañas por naturaleza real de las dependencias | ✅ Corregido y probado | `b035d9f` |
| 2 | Integridad contable y financiera | ✅ Completado | `0cb4c89`, `eee673c` |
| 3 | Seguridad y dependencias | ✅ Corregido y probado | `0b787f9` |
| 4 | Donantes y protección de datos | ✅ Completado | `3ecf02c` |
| 5 | Certificados y reconocimientos | ✅ Completado | `c55fc11` |
| 6 | ChocoFest y colaboradores | ✅ Completado (huecos de captura e integración) | `d0e87ca` |
| 7 | Optimización administrativa y frontend | ✅ Enlace roto reparado + vigilancia | `2d84d9c` |
| 8 | Pruebas y validación de producción | ✅ Ejecutada (E2E PostgreSQL real) | `03c1a40` |
| 9 | Entrega y reporte | ✅ Este documento y sus anexos | — |

**Estado de la batería de pruebas:** API 450/450 · frontend (node:test) 188/188 ·
frontend (vitest) 33/33 · E2E contra PostgreSQL real: **TODO OK** · `pnpm audit
--prod`: sin vulnerabilidades conocidas · typecheck y build de producción: OK.

**Migraciones nuevas:** ninguna en esta iteración. Se reutilizan las 25
migraciones ya existentes (la última es `025_donation_consents.sql`). No se
destruye ni reinicializa ninguna base de datos.

---

## 2. Fase 1 — Eliminación de campañas

### 2.1 Problema detectado

En `/admin/campanas`, al intentar eliminar la campaña **«Rescate Animal San
Ramón»** el sistema respondía:

> «No se pudo eliminar la campaña. El borrador tiene 17 registros asociados y no
> puede eliminarse».

### 2.2 Causa identificada

La ruta `DELETE /api/campaigns/:id` bloqueaba la eliminación ante **cualquier**
fila dependiente, sin distinguir su naturaleza. Un borrador con una galería de
fotos o novedades sin valor contable quedaba atrapado para siempre. Las «17
dependencias» del caso real eran en su totalidad contenido auxiliar de
presentación (imágenes y novedades), no historial financiero.

### 2.3 Corrección implementada

Clasificación de dependencias por naturaleza real (`lib/campaign-lifecycle.ts`):

- **A. Protegidas** (bloquean el borrado definitivo): donaciones, movimientos del
  libro contable, gastos ejecutados, evidencias vinculadas a movimientos y bienes
  recibidos/entregados.
- **B. Auxiliares eliminables** (se limpian en la misma transacción): imágenes de
  galería, novedades, partidas de presupuesto, evidencias de actividad sin vínculo
  financiero y bienes de referencia sin movimientos.
- **C. Desvinculables** (se conservan): reportes ciudadanos, que solo se sueltan de
  la campaña (`campaign_id = NULL`).

No se asume que un registro sea eliminable por su tipo: la ruta comprueba estado,
procedencia y relaciones antes de clasificarlo.

Modalidades implementadas:

- **A. Eliminación definitiva segura** — solo borradores sin dependencias
  protegidas; transacción con `for update` (sin pérdidas en concurrencia) y
  limpieza del CDN programada **después** de confirmar la transacción, con
  reintentos y registro de errores (un fallo externo no corrompe la base).
- **B. Archivado** — conserva historial y auditoría, oculta de los listados
  públicos, bloquea nuevas donaciones y permite restauración controlada.
- **C. Purga de datos de prueba** — exige superadmin, motivo escrito y una vista
  previa; nunca borra asientos del libro.

Endpoints:

- `GET /api/campaigns/:id/deletion-diagnostic` (Fase 1.2): identificador, estado,
  recuento por tipo, dependencias protegidas y auxiliares, motivo concreto del
  bloqueo y operaciones permitidas.
- `DELETE /api/campaigns/:id`: 204 si procede; 409 con el motivo exacto si hay
  historial protegido.

Interfaz (`pages/admin/campaigns.tsx`, `components/admin/CampaignDeletionDialog.tsx`):
el botón Eliminar solo aparece cuando la operación es válida; se explica qué
impide borrar, se muestran las dependencias concretas, se ofrece Archivar y se
actualiza la tabla tras cada operación.

### 2.4 Pruebas

- `tests/campaign-lifecycle.test.mjs` (clasificación, transiciones, diagnóstico).
- `tests/campaign-deletion-auth.test.mjs` (autorización y validación).
- `tests/campaign-deletion.test.mjs` (frontend).
- **E2E contra PostgreSQL real** (`tests/e2e/flow.mjs`, sección 7bis): un borrador
  con galería + novedades **se elimina (204)**; un borrador con una donación
  confirmada + asiento **se bloquea (409)** y el diagnóstico ofrece archivar.

---

## 3. Fase 2 — Integridad contable y financiera

### 3.1 Observaciones resueltas

- Donaciones confirmadas sin asiento (hallazgo DB-09): detectadas en el informe de
  integridad.
- Movimientos duplicados, sin origen válido, importes y campañas descuadradas.
- Saldos y totales por campaña.
- Encadenamiento de hashes.
- Distinción entre recaudación confirmada, histórica y conciliada (no se duplican
  importes históricos y actuales).
- **Informe de discrepancias descargable** (`GET /admin/ledger/discrepancies.csv`).

### 3.2 Herramienta de regularización (nueva)

El libro es **append-only**: no se edita ni se borra. La única corrección
admisible de una donación confirmada sin asiento es **apilar un asiento
compensatorio autorizado y trazable**.

- `GET /admin/ledger/regularize/preview` — plan sin escribir nada.
- `POST /admin/ledger/regularize` — transacción atómica que apila los asientos
  faltantes. Exige rol **superadmin**, confirmación explícita, motivo escrito
  (mínimo 10 caracteres) y referencia de evidencia documental; todo queda
  auditado (`LEDGER_REGULARIZED`). Una donación sin campaña no es regularizable
  (se informa del motivo).

### 3.3 Corrección descubierta durante la validación (Fase 8)

El ensayo E2E con PostgreSQL real expuso un **bug real**: el informe de integridad
verificaba **todas** las filas del libro como una única cadena global, pero la
cadena es **independiente por campaña** (`appendMovement` enlaza con el último
asiento de la *misma* campaña). Con movimientos de dos campañas distintas el
informe daba un falso «cadena rota».

Corrección: `verifyCampaignChains` agrupa por campaña antes de verificar y agrega
el resultado (`campaigns`; `rootHash` solo tiene sentido con una única cadena).
Se fija con una prueba que documenta la regresión.

---

## 4. Fase 3 — Seguridad y dependencias

### 4.1 Dependencias

`pnpm audit --prod`: **sin vulnerabilidades conocidas**. No se actualizó ninguna
dependencia mayor (no se comprobó compatibilidad, así que no se tocaron).

### 4.2 Correcciones

- **SEC-01 — cookie de sesión.** Antes era `Secure` solo si
  `NODE_ENV==='production'`; un despliegue HTTPS sin `NODE_ENV` viajaba con la
  cookie por HTTP. Ahora es `Secure` en producción **o** cuando `SITE_URL` es
  HTTPS (`resolveCookieSecure`).
- **SEC-05 — CORS.** `resolveCorsOrigin` nunca devuelve `*` con credenciales; en
  producción usa el origen del sitio. `validateSecurityConfig` **impide el
  arranque** si `CORS_ORIGIN='*'` o `SITE_URL` no es HTTPS en producción.
- **SEC-06 — helmet.** Se retiró la opción obsoleta `xssFilter`.
- **SEC-08 — cobertura de autorización.** El gate global
  `router.use("/admin", requireAdmin, adminActionLimiter)` es un comodín real:
  toda ruta `/admin/*` exige sesión (incluidas las inexistentes). Se verifica con
  `tests/admin-gate-coverage.test.mjs` (23 comprobaciones), que también comprueba
  que el login sigue siendo público.

Ninguna validación de seguridad se desactivó: la configuración insegura **falla
el arranque** en lugar de degradar la seguridad en silencio.

---

## 5. Fase 4 — Donantes y protección de datos

- Consentimiento explícito para reconocimiento público, preferencias de anonimato,
  control de publicación de nombres, autorización de fotografías, registro de
  fecha y versión, y **revocación** del consentimiento
  (`lib/donor-consent.ts`, `routes/donations.ts`).
- Migración `025_donation_consents.sql` (tabla `donation_consents`).
- La revocación se refleja en las vistas públicas sin destruir los registros
  contables que deben conservarse.
- Pruebas: `donor-consent.test.mjs`, `donation-consents-auth.test.mjs`,
  `donor-format.test.mjs`.

---

## 6. Fase 5 — Certificados y reconocimientos

- Emisión con **código público aleatorio** (lo que abre el QR), consulta pública
  por QR, revocación con motivo y página pública de autenticidad.
- La vista pública **no** expone id interno, estado, motivo de revocación ni datos
  de contacto.
- **Protección contra duplicados** (`findDuplicateCertificate`): compara titular
  normalizado, tipo y campaña; un certificado revocado no bloquea emitir uno
  nuevo; el mismo titular puede tener certificados de otros tipos o campañas.
- Migración `024_certificates.sql`; pruebas en `certificates.test.mjs` y E2E.

---

## 7. Fase 6 — ChocoFest y colaboradores

El núcleo de ChocoFest 2026 ya estaba implementado (página pública de 13
secciones, panel admin, inventario, presupuesto, gastos, evidencias, rendición).
Se cerraron dos huecos **sin duplicar módulos existentes**:

- **Captura de la rendición.** Las 4 claves `chocofest_2026_results_*` se
  publicaban en la web pero **no había UI para escribirlas** (el grupo
  `chocofest` tampoco se renderiza en `/admin/configuracion`). Se añadieron al
  panel `/admin/chocofest`: beneficiarios, actividades, resumen y destino de
  sobrantes. Las cifras de dinero y bienes se siguen calculando solas.
- **Integración de aliados.** La sección «Aliados y patrocinadores» del evento era
  un marcador de posición que no consumía `/api/allies`. Se extrajo el contrato
  compartido a `lib/allies.ts` (tipo, etiquetas i18n, colores, fetch, orden) y un
  componente `AlliesStrip` reutilizado por la página del evento; `/aliados` pasa a
  importar el mismo contrato.

**Pendiente (ver riesgos):** el modelo `allies` no distingue aporte monetario de
colaboración no monetaria ni tiene nivel/importe de auspicio; no existe un módulo
de **embajadores**; las **localidades beneficiadas** son un marcador de posición
sin modelo de datos.

---

## 8. Fase 7 — Optimización administrativa y frontend

- **Enlace roto reparado.** La lista de noticias enlazaba a `/noticias/:id`
  («Leer más») pero esa ruta **no existía**: cada enlace llevaba a la página 404.
  Se implementó `pages/news-detail.tsx` reutilizando el endpoint público existente
  `GET /api/news/:id` (sin modelo nuevo) y se registró la ruta.
- **Vigilancia de enlaces.** `tests/routes-links.test.mjs` extrae las rutas de
  `App.tsx` y verifica que **todo** enlace interno de `src/**/*.tsx` apunta a una
  ruta real (excluye `/api/` y enlaces externos). Fija la regresión.
- **Panel del libro contable** (`pages/admin/ledger-audit.tsx`): estados de carga,
  mensajes de error reales del servidor, secciones de duplicados y saldos
  descuadrados, descarga de discrepancias y panel de regularización para
  superadmin.

---

## 9. Fase 8 — Pruebas y validación de producción

Ejecutado sobre el repositorio:

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Typecheck (libs + api + web + scripts) | `pnpm run typecheck` | ✅ 0 errores |
| Build de producción del API | `node artifacts/api-server/build.mjs` | ✅ |
| Build de producción del frontend | `vite build` | ✅ |
| Pruebas de API | `node --test tests/*.test.mjs` | ✅ 450/450 |
| Pruebas de lógica del frontend | `node --test tests/*.test.mjs` | ✅ 188/188 |
| Pruebas de componentes | `vitest run` | ✅ 33/33 (9 archivos) |
| Auditoría de dependencias | `pnpm audit --prod` | ✅ sin vulnerabilidades |
| **E2E contra PostgreSQL real** | `bash tests/e2e/run-e2e.sh` | ✅ **TODO OK** |

El E2E crea un clúster PostgreSQL **temporal**, aplica el esquema, arranca el API
compilado (el migrador embebido corre las migraciones), comprueba el esquema, corre
el flujo funcional completo por HTTP, demuestra la idempotencia de las migraciones
(segundo arranque sin duplicar) y ensaya **respaldo y restauración** reales. No
toca ninguna base de datos de producción.

Comprobaciones destacadas del E2E: creación y publicación de campaña, donación
pública con y sin comprobante, comprobante obligatorio solo para dinero digital,
asiento único en el libro, cadena de hashes (por campaña), cifra pública
conciliada entre ficha y transparencia, **eliminación por naturaleza de
dependencias**, archivado/restauración, informe de integridad, filtros del panel,
validaciones 400 (no 500) y certificados con QR (emisión, consulta, revocación).

---

## 10. Migraciones

No se añadieron migraciones en esta iteración. Las migraciones relevantes de la
versión son `024_certificates.sql` y `025_donation_consents.sql` (Fases 4 y 5). El
migrador embebido es **idempotente** (el E2E lo demuestra con un segundo arranque
sobre la misma base y tras una restauración).

---

## 11. Riesgos pendientes

1. **Aliados sin tipo de aporte.** El modelo `allies` no distingue aporte monetario
   de colaboración no monetaria ni tiene nivel/importe de auspicio. Requiere
   migración (nuevas columnas) y actualizar formularios y páginas públicas.
2. **Embajadores.** No existe tabla, ruta, página ni lib. Bloqueo de negocio.
3. **Localidades beneficiadas.** Marcador de posición sin modelo de datos.
4. **`stock-catalog.tsx`.** El catálogo de auspicio usa `STOCK_ITEMS` con
   `inStock`/`stockLevel` fijos, desacoplados del inventario real.
5. **«En especie» en dos lugares.** `donations.collaboration_type` (nivel donante)
   y `campaign_leftovers` (nivel campaña) sin enlace explícito donación→inventario.
6. **`chocofest-2025-data.ts`.** El dataset real es de 2025; 2026 se carga a mano.
7. **ChocoFest resuelto por título** (`findChocofest2026`), sin slug estable.

Ninguno de estos riesgos afecta a la integridad financiera ni destruye datos.

---

## 12. Requisitos para despliegue

- **Variables de entorno en producción:** `SESSION_SECRET`, `ADMIN_USERNAME`,
  `ADMIN_PASSWORD` (obligatorias; el API no arranca sin ellas). `SITE_URL` debe ser
  HTTPS y `CORS_ORIGIN` no puede ser `*` (el API **no arranca** si lo son).
- **Cloudinary:** las 3 variables juntas o ninguna.
- **Base de datos:** aplicar las migraciones embebidas arrancando el API contra la
  base existente (idempotente). **No** reinicializar ni borrar la base.
- **Respaldo previo:** seguir `docs/MIGRACIONES_Y_RESPALDOS.md` (el E2E ensaya el
  ciclo respaldo→restauración).

---

## 13. Recomendaciones posteriores

1. Modelar el tipo de aporte y el nivel de auspicio de los aliados (migración) y
   distinguir formalmente aporte monetario de colaboración no monetaria.
2. Decidir el alcance del módulo de embajadores (tabla, ruta, página).
3. Modelar las localidades beneficiadas del evento.
4. Conectar el catálogo de auspicio con el inventario real.
5. Enlazar explícitamente la donación en especie con el inventario del evento.
6. Fijar un slug estable para ChocoFest 2026 (hoy se resuelve por título).
7. Ejecutar la regularización del libro (Fase 2) sobre las donaciones históricas
   confirmadas sin asiento, con evidencia documental, en un entorno controlado.

---

## 14. Criterios finales de aceptación

| # | Criterio | Estado |
| --- | --- | --- |
| 1 | Permitir eliminar borradores realmente eliminables | ✅ (E2E) |
| 2 | Mostrar qué dependencias impiden eliminar una campaña | ✅ |
| 3 | Preservar registros financieros históricos | ✅ |
| 4 | Permitir archivar campañas protegidas | ✅ (E2E) |
| 5 | Consistencia entre administrador y frontend | ✅ |
| 6 | Cálculos financieros conciliables | ✅ |
| 7 | Proteger datos personales | ✅ |
| 8 | Certificados y reconocimientos | ✅ |
| 9 | Integrar módulos de ChocoFest | ✅ (parcial: ver riesgos) |
| 10 | Pasar las pruebas esenciales | ✅ |
| 11 | Compilar correctamente | ✅ |
| 12 | Mantener compatibilidad con producción | ✅ (sin migraciones nuevas) |
