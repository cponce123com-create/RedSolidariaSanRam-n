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
| API (unitaria + HTTP) | `pnpm --filter @workspace/api-server test` | **535 / 535 ok** |
| Frontend (pura) | `pnpm --filter @workspace/red-solidaria test` | **215 / 215 ok** |
| E2E real (PostgreSQL 17.7) | `bash artifacts/api-server/tests/e2e/run-e2e.sh` | **E2E COMPLETO: OK** — 122 comprobaciones `ok`, 0 fallos |
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
   /campaigns/:id/demo-mark` (auditado), disponible en el propio diálogo como
   **«Retirar declaración DEMO»**.

## 11bis. Corrección V7.2.1 — «no podía declarar la campaña como DEMO»

Al probarlo en el navegador aparecieron dos defectos reales (el aviso
`Blocked aria-hidden…` de la consola era ruido benigno de Radix, pero señalaba el
primero):

1. **Conflicto de capas modales.** El diálogo se abría desde el `onSelect` del menú
   «Más acciones», montando dos capas modales de Radix en el mismo clic. Radix
   gestiona por capa el foco y el `pointer-events` del `body`, y las dos se
   pisaban: el diálogo se veía pero podía quedar sin responder a ningún clic.
   **Arreglo:** el menú pasa a estado controlado y el diálogo se abre **solo
   cuando el menú ya se ha cerrado del todo** (efecto + `onOpenChange`), con la
   regla aislada en `shouldOpenDemoPurgeDialog` (pura y con pruebas).
2. **Límite de reautenticación mal calibrado.** `reauthLimiter` contaba **toda**
   petición, incluido el propio flujo legítimo (declarar DEMO y después purgar) y
   los despistes al escribir la contraseña: con 5 peticiones cualesquiera el
   endpoint quedaba en **429 durante 15 minutos** y el superadmin veía el diálogo
   sin poder completarlo. **Arreglo:** solo consumen presupuesto los **fallos de
   identidad (401)** (`requestWasSuccessful` + `skipSuccessfulRequests`); un 409
   de bloqueo o un 400 de validación tampoco gastan el presupuesto. Los 5 intentos
   fallidos siguen cortando la fuerza bruta.
   *Nota:* `requestWasSuccessful` **solo** se evalúa si `skipSuccessfulRequests`
   está activo; con ambos flags en `false` el descuento no se ejecuta y el
   contador vuelve a medir toda petición. Lo detectó la prueba de regresión.
3. **Errores invisibles.** Un fallo del servidor solo se mostraba como *toast*: si
   pasaba desapercibido, el botón parecía no hacer nada. **Arreglo:** el diálogo
   muestra el mensaje real del servidor **en línea**, junto a los botones.

Pruebas añadidas para fijar las regresiones: `reauthLimiter` (los aciertos y los
409 no gastan presupuesto; el sexto 401 devuelve 429) y
`shouldOpenAfterMenuClose` (el diálogo no se abre con un menú abierto).

## 11ter. Anulación contable de donaciones (V7.2.2)

**El problema que resuelve.** Una donación confirmada queda encadenada en el libro
y la máquina de estados prohíbe volver atrás: `PUT /donations/:id` solo acepta
`pending|approved|rejected` y rechaza cualquier transición desde `approved`. Sin
una vía de corrección, un dato de prueba —o una donación registrada por error—
bloqueaba la campaña para siempre: las cifras no se podían limpiar y la purga DEMO
seguía bloqueada por `reconciled_donations` (que es exactamente lo que ofrecía
«anulación contable» en §2, ahora implementado).

**Por qué anular y no borrar.** Borrar la donación dejaría su asiento huérfano
(el informe lo señalaría como `movementsWithoutSource`) y rompería la cadena de
hashes. La corrección correcta es la que documenta el propio libro: un **asiento
compensatorio autorizado y trazable**.

| Efecto | Detalle |
| --- | --- |
| Estado | `status = 'annulled'` → sale de **todas** las cifras (recaudado, donantes, transparencia, dashboard) sin tocar ninguna consulta: los agregados filtran por `CONFIRMED_DONATION_STATUSES`. |
| Libro | Se añade un asiento `gasto` por el mismo importe con origen `donation_reversal` (la unicidad por `source_type+source_id` impide reutilizar `donation`). El saldo sigue **cuadrando** y la cadena sigue **verificando**. |
| Traza | `voided_at`, `voided_by`, `void_reason` en la donación + `DONATION_ANNULLED` en la auditoría (motivo, importe, asiento compensatorio y si la cadena verificó). |
| Alcance | Solo donaciones **confirmadas** (aprobadas o conciliadas). Una pendiente o rechazada no tiene asiento: se gestiona con el rechazo normal. |

**API** (exclusiva del superadmin, con reautenticación, confirmación explícita y
motivo obligatorio):

| Método y ruta | Función |
| --- | --- |
| `POST /api/donations/:id/void` | Anula una donación confirmada. |
| `GET /api/campaigns/:id/donations/void/preview` | Qué se anularía: cuántas, por cuánto, cuántas estaban conciliadas y cuáles no se pueden tocar. No modifica nada. |
| `POST /api/campaigns/:id/donations/void` | Anula **en bloque** todas las confirmadas de una campaña (un motivo, una transacción). |

**Interfaz**: botón **«Anular»** en cada fila de donación confirmada del panel de
donaciones (solo superadmin) y **Más acciones → Anular donaciones de la campaña**
en `/admin/campanas` (con el identificador escrito a mano). El diálogo explica
siempre que **no se borra nada** y avisa cuando la donación está conciliada con el
banco. Pestaña de filtro **«Anuladas»** para localizarlas.

**Efecto sobre la purga DEMO**: una donación anulada **no** cuenta como dinero real
(`reconciled_donations` deja de bloquear) y el análisis lo advierte con
`donations_annulled`. Así el flujo completo queda cerrado: anular lo que estaba
mal registrado → declarar DEMO → purgar, con el libro cuadrado en todo momento.

**Verificado en el E2E** (campañas desechables 13 y 14 del clúster temporal): una
donación conciliada bloquea la purga; tras anularla, el libro queda con 60 de
ingreso y 60 de reverso (`ledgerNet 0`, `sourceNet 0`, `balanced: true`), sin
asientos huérfanos ni descuadres nuevos, la cadena verifica con 2 asientos, la
purga deja de estar bloqueada, repetir la anulación da 409 y el lote (2 donaciones,
75) queda igualmente a cero y cuadrado. Los descuadres `[1,2,3]` que informa el
libro son el hallazgo **DB-09 preexistente** (donaciones históricas del seed sin
asiento), no un efecto de la anulación.

## 12. Archivos

**Base de datos**
- `lib/db/src/schema/campaigns.ts` — columnas `is_demo`, `demo_marked_at`, `demo_marked_by` (excluidas del schema de inserción: anti mass-assignment).
- `lib/db/src/schema/campaign-purge-backups.ts` — respaldo/manifiesto (nuevo).
- `lib/db/src/schema/index.ts`, `lib/db/src/migrate.ts` — export y migración `026`.

**API**
- `lib/campaign-demo-purge.ts` — análisis, validación, snapshot y sello SHA-256 (puro).
- `lib/donation-annulment.ts` — anulación contable: veredicto, plan por campaña y validación (puro).
- `lib/donor-identity.ts` — estado `annulled`, `canAnnull`, `annulBlockReason` y la descripción del asiento compensatorio.
- `lib/ledger.ts` — origen `donation_reversal` (asiento compensatorio).
- `lib/ledger-audit.ts` — resuelve el asiento compensatorio contra su donación.
- `lib/superadmin-credentials.ts` — credenciales del superadmin de entorno (extraídas de `routes/admin.ts`).
- `lib/admin-reauth.ts` — reautenticación (contraseña + TOTP).
- `lib/audit.ts` — acciones y etiquetas nuevas.
- `middleware/rate-limit.ts` — `reauthLimiter`.
- `routes/campaigns.ts` — purga DEMO y análisis.
- `routes/donations.ts` — anulación individual, vista previa y en bloque.
- `routes/ledger-audit.ts` — informe con todas las donaciones (para resolver el reverso).
- `routes/admin.ts` — usa el módulo compartido de credenciales.
- `build-tests.mjs` — nuevos puntos de entrada.

**Frontend**
- `src/lib/campaign-demo-purge.ts` — presentación pura de la purga (nuevo).
- `src/lib/donation-annulment.ts` — presentación pura de la anulación (nuevo).
- `src/lib/campaign-admin.ts`, `src/lib/donors-admin.ts` — clientes HTTP + re-exports.
- `src/hooks/use-campaign-lifecycle.ts`, `src/hooks/use-donors-admin.ts` — mutaciones y consultas.
- `src/components/admin/CampaignDemoPurgeDialog.tsx` — diálogo de purga (nuevo).
- `src/components/admin/DonationVoidDialog.tsx` — diálogo de anulación (nuevo).
- `src/components/admin/DonationVoidAction.tsx` — acción «Anular» por fila (nuevo).
- `src/components/ui/dropdown-menu.tsx` — menú «Más acciones» (nuevo).
- `src/pages/admin/campaigns.tsx`, `src/pages/admin/donations.tsx`.

**Contrato**
- `lib/api-spec/openapi.yaml` — `annulled` en los enums de estado de donación.
- `lib/api-client-react`, `lib/api-zod` — enums generados sincronizados a mano (orval exige Node 22 y aquí no puede regenerarse con seguridad; la próxima regeneración en CI no debe producir diferencias).

**Pruebas**
- `artifacts/api-server/tests/campaign-demo-purge.test.mjs`
- `artifacts/api-server/tests/campaign-demo-purge-auth.test.mjs`
- `artifacts/api-server/tests/donation-annulment.test.mjs`
- `artifacts/api-server/tests/donation-void-auth.test.mjs`
- `artifacts/api-server/tests/rate-limit.test.mjs` (límite de reautenticación)
- `artifacts/api-server/tests/e2e/flow.mjs` — secciones `7ter` y `7quater`
- `artifacts/red-solidaria/tests/campaign-demo-purge.test.mjs`
- `artifacts/red-solidaria/tests/donation-annulment.test.mjs`
