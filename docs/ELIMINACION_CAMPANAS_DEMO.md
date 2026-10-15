# Eliminación definitiva de campañas DEMO (V7.2)

Documento de entrega de la funcionalidad **«Más acciones → Eliminar campaña DEMO»**:
permite al superadministrador eliminar definitivamente una campaña de demostración
(«Adopciones» / «Rescate Animal San Ramón») **y todos sus datos de prueba**, sin
comprometer las campañas reales ni la integridad del libro contable.

> **Estado:** implementado y verificado. La purga **no se ha ejecutado sobre
> producción**: queda disponible para que el superadmin la confirme expresamente
> desde el panel (ver §6).

---

## 1. El problema

La campaña de demostración es una de las primeras del sistema y arrastra datos
ficticios: donaciones aprobadas, un gasto, asientos en el libro contable, galería,
novedades, presupuesto, evidencia y un bien. Las dos vías existentes la rechazan:

| Vía existente | Motivo del rechazo |
| --- | --- |
| `DELETE /campaigns/:id` (borrado seguro, Modalidad A) | Solo elimina borradores **sin** dependencias. |
| `POST /campaigns/:id/test-purge` (Modalidad C) | Rechaza si hay asientos, gastos o donaciones confirmadas. |

Resultado: la campaña quedaba atrapada para siempre.

## 2. Por qué la marca «DEMO» no basta (decisión de diseño)

El requisito prohíbe expresamente asumir que un dato es ficticio «porque el
administrador lo indique o por el nombre de la campaña». Por eso la solución tiene
**dos cerrojos independientes**:

1. **Declaración explícita y auditada** (`campaigns.is_demo`, con quién y cuándo).
   Es una *afirmación* del superadmin: necesaria, pero **no suficiente**.
2. **Análisis objetivo del servidor**, que puede **bloquear incluso una campaña ya
   declarada DEMO**. Señales que bloquean la purga:

   | Código del bloqueo | Señal objetiva |
   | --- | --- |
   | `demo_not_marked` | La campaña no está declarada DEMO. |
   | `reconciled_donations` | Donación conciliada con el banco (`status='reconciled'` o `reconciled_at`): dinero real. |
   | `expenses_with_receipt` | Gasto con `receipt_url`: documento con obligación de conservación. |
   | `leftovers_with_flow` | Bien con flujo real (`received_qty`/`used_qty`) o ligado a donante/evidencia. |
   | `evidence_documental` | Evidencia que prueba documentalmente un bien entregado. |
   | `ledger_chain_broken` | La cadena de hashes de la campaña no verifica. |
   | `ledger_foreign_movements` | Asiento cuyo origen no es una donación/gasto **de esta** campaña. |

   Cuando hay bloqueo, la operación **no se ejecuta** y la interfaz ofrece las
   alternativas seguras: **archivar** o **anular contablemente** (`/admin/libro`).

Nada se decide en el navegador: el diálogo informa y recoge la confirmación; el
servidor vuelve a analizar **dentro de la transacción** antes de borrar.

## 3. Protección del libro contable

La cadena de hashes es **independiente por campaña** (`lib/ledger.ts`), así que
eliminar la cadena de una campaña de prueba **no reescribe ni invalida** las de las
demás. Aun así, antes de tocarla:

- se exige que **verifique íntegra** (`verifyChain`); si se rompe, no se borra nada;
- se comprueba que **todos** sus orígenes pertenezcan a la campaña;
- se guarda una **copia íntegra** de los asientos (`prev_hash`, `hash`, importe,
  descripción, origen, fecha) y su **hash raíz** en el respaldo;
- el manifiesto documenta la **estrategia de reconstrucción verificable**: los
  asientos del respaldo se rehidratan y se vuelven a pasar por `verifyChain`,
  obteniendo la misma raíz (cubierto por un test y por el E2E).

**Nunca** se reescribe un hash histórico en silencio ni se elimina un movimiento real.

## 4. API (exclusiva del superadmin)

| Método y ruta | Función |
| --- | --- |
| `GET /api/campaigns/:id/demo-purge/preview` | Análisis de seguridad: nombre, ID, estado, recuento y **tipos** de registros, estado del libro contable y veredicto (qué se elimina, qué se desvincula, qué se conserva, qué bloquea). No modifica nada. |
| `POST /api/campaigns/:id/demo-mark` | Declara la campaña como DEMO. Exige reautenticación + motivo. Auditado. |
| `DELETE /api/campaigns/:id/demo-mark` | Retira la declaración (si se marcó por error). Auditado. |
| `POST /api/campaigns/:id/demo-purge` | **Purga definitiva.** Exige reautenticación, motivo, el identificador escrito a mano y confirmación explícita. |
| `GET /api/admin/campaign-demo-purge/backups` | Lista de respaldos (localizar la copia de una purga). |
| `GET /api/admin/campaign-demo-purge/backups/:id` | Respaldo completo + verificación recomputada del sello SHA-256. |

Todas exigen sesión (`requireAdmin`) **y** rol `superadmin` (`requireRole`), y
tienen un límite de reautenticación de **5 intentos / 15 min por usuario**
(`reauthLimiter`): una sesión robada no puede usar el endpoint como oráculo.

## 5. Interfaz administrativa

En `/admin/campanas`, para el superadmin aparece **Más acciones → Eliminar campaña DEMO**.
El diálogo muestra y exige, en este orden:

1. **Análisis**: nombre, identificador, estado, declaración DEMO, recuento y tipos de
   registros, estado del libro contable, qué se elimina / desvincula / conserva,
   bloqueos con su motivo y la advertencia de **eliminación irreversible**.
2. **Declaración DEMO** (solo si falta): motivo + contraseña (y 2FA si procede).
3. **Confirmación**: motivo, contraseña, código 2FA (si aplica), el **identificador
   de la campaña escrito a mano** y el acuse de irreversibilidad.

No permite borrar por accidente otra campaña: el identificador escrito debe
coincidir con el de la ruta y, además, el servidor lo vuelve a comprobar.

## 6. Cómo eliminar la campaña DEMO real

> **No se ha ejecutado sobre producción.** Estos son los pasos para que el
> superadmin la confirme expresamente.

**1) Identificarla por su ID real** (nunca solo por el nombre):

```sql
-- Candidata: «Adopciones» / «Rescate Animal San Ramón»
SELECT id, title, status, is_demo, created_at
FROM campaigns
WHERE title ILIKE '%adopcion%' OR title ILIKE '%rescate animal%'
ORDER BY id;
```

**2) Analizarla antes de tocar nada** (sustituir `<ID>`):

```bash
curl -s --cookie "$COOKIE" 
  "https://<host>/api/campaigns/<ID>/demo-purge/preview" | jq
```

Comprobar en la respuesta: `campaign.id`, `counts`, `real` (todo a 0),
`ledger.chainVerified: true`, `ledger.foreignSources: []` y
`verdict.allowed`. Si `verdict.blockers` no está vacío, **no continuar**: usar
archivar o anular contablemente.

**3) Purgar desde el panel**: `/admin/campanas` → fila de la campaña →
**Más acciones → Eliminar campaña DEMO** → completar los tres pasos.
Alternativa por API:

```bash
curl -s -X POST --cookie "$COOKIE" -H 'Content-Type: application/json' 
  -d '{"confirm":true,"identifier":"<ID>","reason":"<motivo ≥10 caracteres>","password":"<tu contraseña>"}' 
  "https://<host>/api/campaigns/<ID>/demo-purge" | jq
```

**4) Guardar el respaldo** que devuelve la operación (`backupId` y
`manifest.hash`) y verificarlo:

```bash
curl -s --cookie "$COOKIE" 
  "https://<host>/api/admin/campaign-demo-purge/backups/<backupId>" | jq '{verified, reason, performedBy, ledger}'
```

## 7. Registros afectados por tabla

**Se eliminan** (en este orden exacto; los hijos con FK `RESTRICT` antes que la
campaña):

| Tabla | Contenido |
| --- | --- |
| `campaign_movements` | Asientos contables de prueba (se guardan copia y raíz antes). |
| `donation_consents` | Consentimientos de las donaciones ficticias. |
| `donation_proofs` | Comprobantes de las donaciones ficticias (y sus archivos). |
| `donations` | Donaciones ficticias. |
| `campaign_expenses` | Gastos ficticios. |
| `campaign_images` | Imágenes exclusivas de la campaña (y sus archivos). |
| `campaign_updates` | Novedades de la campaña. |
| `campaign_budgets` | Partidas de presupuesto. |
| `campaign_evidence` | Evidencias de prueba. |
| `campaign_leftovers` | Bienes e insumos de referencia. |
| `campaigns` | La campaña. |

**Se desvinculan** (se conservan intactas, solo sueltan la FK): `community_reports`,
`certificates`, `volunteer_participations`.

**Nunca se tocan**: `donors`, `volunteers` / `volunteer_teams`, `news`, y los
archivos o registros de cualquier otra campaña.

> Nota: `news` no tiene vínculo con campañas en el esquema, así que «noticias de
> demostración» se refiere a `campaign_updates` (que sí se elimina). No se borra
> ninguna noticia general.

## 8. Ejecución segura

- **Respaldo verificable antes de modificar**: snapshot completo + SHA-256 en
  `campaign_purge_backups`, en la **misma transacción** (existe si y solo si la
  purga se confirma). La tabla **no tiene FK** a `campaigns`: sobrevive al borrado.
- **Una única transacción PostgreSQL** con la fila de la campaña bloqueada
  (`SELECT … FOR UPDATE`): serializa purgas concurrentes y, como toda FK exige un
  lock compartido de la fila referenciada, **impide que aparezcan hijos nuevos**
  entre el análisis y el borrado.
- **Relaciones y permisos comprobados dentro de la transacción**; la FK `RESTRICT`
  del libro actúa como segunda barrera (si algo escapara, la transacción se
  revierte y se responde 409).
- **Auditoría externa a lo purgado**: `CAMPAIGN_DEMO_PURGED` (con motivo, sello,
  desglose por tabla y resultado de la limpieza), `CAMPAIGN_DEMO_MARKED`,
  `CAMPAIGN_DEMO_UNMARKED` y `ADMIN_REAUTH_FAILED`.
- **Archivos externos** (Cloudinary): se recopilan dentro de la transacción y se
  eliminan **después** de confirmarla; un fallo de limpieza no revierte la purga
  (se informa en `assetsFailed`).
- **Sin purgas automáticas**: no hay cron, ni limpieza al arrancar, ni purga al
  archivar. Todo exige confirmación explícita del superadmin.

## 9. Resultado de integridad

Medido en el E2E contra PostgreSQL real (§10), sobre una campaña DEMO con
**2 asientos** (ingreso de donación + gasto) y **1 donación**.

**ID de la campaña eliminada:** `campaigns.id = 11` (clúster PostgreSQL temporal y
desechable del E2E; su segunda campaña DEMO de prueba, `id = 12`, quedó **bloqueada**
por tener un gasto con boleta). En producción, la campaña DEMO «Adopciones» /
«Rescate Animal San Ramón» se identifica con la consulta de §6 antes de actuar: el
ID real depende del entorno y **no se ha leído ni modificado** el de producción.

| Comprobación | Resultado |
| --- | --- |
| Cadena de la campaña antes de purgar | `verified: true`, raíz `72acbd42…` |
| Cadena de la campaña eliminada, después | `verified: true`, `count: 0` |
| **Otra** campaña con asiento propio (`id = 8`) | `verified: true`, `count: 1`, su recaudación intacta (80) |
| Libro global tras la purga | `verified: true`, 3 cadenas verificadas |
| Respaldo | `verified: true` (sello SHA-256 recomputado), con donaciones, gastos y los 2 asientos |
| Reconstrucción de la cadena desde el respaldo | 2 filas con `hash` de 64 hex, reverificables con `verifyChain` |
| Registros huérfanos | 0 en asientos, gastos, presupuesto, evidencia, bienes, novedades y galería |
| Campaña eliminada | 404 en el frontend y en transparencia; ausente de los listados público y de administración |
| Donación DEMO en estadísticas | 0 restantes |

## 10. Resultado de pruebas

| Suite | Comando | Resultado |
| --- | --- | --- |
| API (unitaria + HTTP) | `pnpm --filter @workspace/api-server test` | **500 / 500 ok** (450 previas + 26 de lógica pura + 24 de autorización) |
| Frontend (pura) | `pnpm --filter @workspace/red-solidaria test` | **203 / 203 ok** (188 previas + 15 nuevas) |
| E2E real (PostgreSQL 17.7) | `bash artifacts/api-server/tests/e2e/run-e2e.sh` | **E2E COMPLETO: OK** — 97 comprobaciones `ok`, 0 fallos |
| Typecheck | `tsc` en `lib/db`, `api-server`, `red-solidaria`, `scripts` | Sin errores |
| Build | `build.mjs` (API) y `vite build` (frontend) | Sin errores |

Cobertura nueva destacada:

- **`tests/campaign-demo-purge.test.mjs` (API, 26):** cada bloqueo objetivo por
  separado; cadena rota y asientos ajenos; orden del plan de eliminación (asientos
  antes que la campaña, hijos de donaciones antes que las donaciones); validación
  de la petición (confirmación, identificador, motivo, reautenticación); hash
  estable a través del viaje por `jsonb`; **reconstrucción y reverificación de la
  cadena desde el respaldo**; detección de respaldo manipulado.
- **`tests/campaign-demo-purge-auth.test.mjs` (API, 24):** 401 sin sesión, 403 para
  administrador y moderador, 400 por id inválido / sin confirmación / identificador
  incorrecto / motivo corto / sin contraseña, y que una petición válida llega a la
  verificación de identidad (nunca a un 400/401/403).
- **`tests/campaign-demo-purge.test.mjs` (frontend, 15):** la UI no habilita la
  confirmación si el servidor bloquea, el titular nunca dice «listo» con bloqueos,
  pasos del flujo, resumen y descripciones, y comparación del identificador.
- **E2E `7ter`:** crea una campaña DEMO real con donación aprobada + gasto
  (2 asientos), comprueba el análisis, la reautenticación (401), el bloqueo sin
  declaración (409), la declaración, la purga, la desaparición en frontend y
  estadísticas, la ausencia de huérfanos, que **otra** campaña conserva datos y
  cadena, que una campaña declarada DEMO **sigue bloqueada** por un gasto con
  boleta, el respaldo verificable, la auditoría y el **límite 429**.

## 11. Operaciones que requieren autorización adicional

1. **Migración `026_campaign_demo_purge.sql`** en producción (aditiva e
   idempotente: 3 columnas con valor por defecto + 1 tabla nueva + 2 índices; no
   reinterpreta ni borra datos). Se aplica sola al arrancar el API.
2. **La purga de la campaña DEMO real**: requiere la confirmación expresa del
   superadmin desde el panel (§6). No se ha ejecutado.
3. **Anulación contable** (si el análisis bloquease la purga): la regularización del
   libro se hace desde el informe de integridad (`/admin/libro`), con evidencia
   documental; es una operación distinta y también auditada.
4. **Retirar la marca DEMO** de una campaña real marcada por error: `DELETE
   /campaigns/:id/demo-mark` (auditado).

## 12. Archivos

**Base de datos**
- `lib/db/src/schema/campaigns.ts` — columnas `is_demo`, `demo_marked_at`, `demo_marked_by` (excluidas del schema de inserción: anti mass-assignment).
- `lib/db/src/schema/campaign-purge-backups.ts` — respaldo/manifiesto (nuevo).
- `lib/db/src/schema/index.ts`, `lib/db/src/migrate.ts` — export y migración `026`.

**API**
- `lib/campaign-demo-purge.ts` — análisis, validación, snapshot y sello SHA-256 (puro).
- `lib/superadmin-credentials.ts` — credenciales del superadmin de entorno (extraídas de `routes/admin.ts`).
- `lib/admin-reauth.ts` — reautenticación (contraseña + TOTP).
- `lib/audit.ts` — acciones y etiquetas nuevas.
- `middleware/rate-limit.ts` — `reauthLimiter`.
- `routes/campaigns.ts` — endpoints y transacción de purga.
- `routes/admin.ts` — usa el módulo compartido de credenciales.
- `build-tests.mjs` — nuevos puntos de entrada.

**Frontend**
- `src/lib/campaign-demo-purge.ts` — presentación pura (nuevo).
- `src/lib/campaign-admin.ts` — cliente HTTP + re-exports.
- `src/hooks/use-campaign-lifecycle.ts` — `useDemoPurgePreview` y `useDemoPurge`.
- `src/components/admin/CampaignDemoPurgeDialog.tsx` — diálogo de tres pasos (nuevo).
- `src/components/ui/dropdown-menu.tsx` — menú «Más acciones» (nuevo).
- `src/pages/admin/campaigns.tsx` — «Más acciones → Eliminar campaña DEMO».

**Pruebas**
- `artifacts/api-server/tests/campaign-demo-purge.test.mjs`
- `artifacts/api-server/tests/campaign-demo-purge-auth.test.mjs`
- `artifacts/api-server/tests/e2e/flow.mjs` — sección `7ter`
- `artifacts/red-solidaria/tests/campaign-demo-purge.test.mjs`
