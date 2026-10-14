# Auditoría Técnica Integral — Red Solidaria San Ramón (2026)

> Fase 1 del *Prompt Maestro*. Documento verificable. Todos los hallazgos citan `archivo:línea`.
> Fecha: 2026-10-13. Alcance: monorepo completo en `/home/user/bot-descargador`.

---

## 0. Metodología, alcance y limitaciones

**Método.** Reconocimiento estructural (`git ls-files`: 448 archivos versionados), inspección dirigida por área
(seguridad, API, base de datos, importadores, frontend, infraestructura) y **re-verificación directa** de los
hallazgos de mayor impacto por parte del auditor principal.

**Línea base ejecutada** (detalle en `docs/PRUEBAS_Y_RESULTADOS.md`).

| Comprobación | Comando | Resultado |
|---|---|---|
| Instalación de dependencias | `pnpm install` | ✅ EXIT=0 (618 paquetes) |
| Typecheck | `pnpm run typecheck` | ✅ EXIT=0 (4 paquetes) |
| Arranque dev (Vite) | `pnpm dev` | ✅ HTTP 200 en `:5173` |
| Suite de pruebas | `pnpm -r --if-present test` | ✅ EXIT=0 (api-server 139/139; red-solidaria 22/22) |
| Auditoría de dependencias | `pnpm audit --prod` | ❌ 6 vulnerabilidades (1 CRÍTICA, 1 ALTA, 4 MEDIAS) |
| Build de producción | `pnpm -r --if-present run build` | ⏳ PENDIENTE |

**Limitaciones.** No hay acceso a la base de datos real, a las credenciales de Render, a Cloudinary ni a datos
reales de la campaña. Los hallazgos sobre datos históricos se basan en el código fuente, no en la BD de producción.
No se ejecutó ninguna migración ni operación destructiva.

**Convención de estados.** `CONFIRMADO` = verificado en el código; `RIESGO POTENCIAL` = depende de condiciones no
comprobadas (volumen, configuración de despliegue, refactors futuros).

---

## 1. Arquitectura identificada

Monorepo **pnpm** (`pnpm-workspace.yaml`), Node **>=22** (`.nvmrc` = 24), `packageManager: pnpm@10.34.5`.

| Paquete | Ruta | Rol |
|---|---|---|
| `@workspace/api-server` | `artifacts/api-server` | Backend Express 5 + Drizzle; 24 grupos de rutas; ~25 tests `.mjs` |
| `@workspace/red-solidaria` | `artifacts/red-solidaria` | Frontend React 19 + TS + Vite 7 (SPA pública + panel admin) |
| `@workspace/mockup-sandbox` | `artifacts/mockup-sandbox` | Sandbox de diseño (shadcn); no es producto |
| `@workspace/db` | `lib/db` | Esquema Drizzle + `migrate.ts` embebido |
| `@workspace/api-zod` | `lib/api-zod` | Esquemas Zod (presentes pero **no usados** por las rutas) |
| `@workspace/api-client-react` / `api-spec` | `lib/*` | Cliente/tipos generados |
| `@workspace/scripts` | `scripts` | Importadores manuales + `post-merge.sh` |

**Stack:** React/Vite · Express/Node · PostgreSQL · Drizzle ORM · Zod · Cloudinary · Render · pnpm.
**Despliegue:** `render.yaml` (build `pnpm install --frozen-lockfile && pnpm run build`; start
`node artifacts/api-server/dist/index.mjs`; health `/api/healthz`).

---

## 2. Resumen ejecutivo

Se documentan **65 hallazgos**: **5 CRÍTICOS**, **11 ALTOS**, **26 MEDIOS**, **23 BAJOS**.

| Área | Crítico | Alto | Medio | Bajo | Total |
|---|---|---|---|---|---|
| Seguridad (SEC-01..09) | 0 | 0 | 3 | 6 | 9 |
| API / rutas (API-01..10) | 1 | 0 | 4 | 5 | 10 |
| Base de datos (DB-01..11) | 2 | 2 | 5 | 2 | 11 |
| Importadores (IMP-01..10) | 1 | 3 | 4 | 2 | 10 |
| Frontend (FE-01..15) | 0 | 2 | 7 | 6 | 15 |
| Infraestructura (INF-01..07) | 0 | 3 | 2 | 2 | 7 |
| Dependencias (DEP-01..03) | 1 | 1 | 1 | 0 | 3 |
| **Total** | **5** | **11** | **26** | **23** | **65** |

**Riesgos más graves (raíz):**
1. **Integridad del ledger financiero rota** (`ledger.ts` usa `asc` en vez de `desc` → cadena inválida desde el 3.er asiento).
2. **Pérdida de datos por importadores** `DELETE + INSERT` sin transacción ni idempotencia (`scripts/src/apply-*.ts`).
3. **DDL destructivo automático** (`drizzle-kit push` en `post-merge.sh`) y migraciones en arranque no bloqueantes.
4. **Ledger borrado en cascada** al eliminar una campaña; **FK ausentes** en `donations.campaign_id` y otras tablas.
5. **Vulnerabilidad CRÍTICA de dependencias** (`proxy-addr`): permite falsificar la IP y eludir el rate-limit/lockout (DEP-01).

---

## 3. Hallazgos

### 3.1 Seguridad y autenticación (SEC)

**Correcto (verificado):** `SESSION_SECRET` exigido fuera de desarrollo sin default hardcodeado; `session.regenerate`
en login y `destroy` en logout; store de sesiones en Postgres; `bcryptjs` (12 rondas) con `compare` timing-safe y
contraseña señuelo anti-enumeración; TOTP SHA-1/6 dígitos/30s/±1 con `timingSafeEqual`; gate global `/admin` con
`requireAdmin + adminActionLimiter`; handler de errores sin stack traces; logger redacta `authorization`/`cookie`.

#### SEC-01 — Cookie `secure` solo si `NODE_ENV==='production'` · MEDIO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/src/app.ts:165-172`
- **Descripción:** `secure` depende exclusivamente de `NODE_ENV`. Si un despliegue olvida `NODE_ENV=production`, la cookie viaja sin `Secure`.
- **Causa raíz:** acoplar seguridad a una variable no validada en runtime.
- **Impacto:** exposición de la cookie de sesión en canales no cifrados.
- **Solución:** forzar `secure: true` cuando `SITE_URL` sea `https://`, o validar `NODE_ENV` en el arranque y fallar si falta.
- **Prueba:** arranque con `NODE_ENV` ausente y `SITE_URL=https://…` ⇒ `Set-Cookie` con `Secure`.

#### SEC-02 — Rate limiting y lockout 2FA en memoria (no distribuidos) · MEDIO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/src/middleware/rate-limit.ts`, `src/lib/two-factor-lockout.ts:26`
- **Descripción:** el store de rate-limit y el contador de intentos 2FA son estructuras en memoria del proceso.
- **Causa raíz:** ausencia de store compartido (Redis/Postgres).
- **Impacto:** con múltiples instancias el límite se multiplica; se reinicia al reiniciar el proceso.
- **Solución:** store compartido o documentar el límite de una sola instancia.
- **Prueba:** dos procesos ⇒ verificar que el límite agregado no se supera.

#### SEC-03 — Lockout 2FA keyed por `userId` permite DoS de cuenta · MEDIO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/src/routes/admin-2fa.ts:39-70`
- **Descripción:** el bloqueo se aplica por usuario, de modo que un atacante puede bloquear la cuenta ajena enviando intentos fallidos.
- **Causa raíz:** clave de lockout solo por identidad de cuenta.
- **Impacto:** denegación de servicio sobre administradores.
- **Solución:** combinar IP + usuario, y backoff progresivo.
- **Prueba:** N intentos fallidos desde una IP bloquean solo a esa IP.

#### SEC-04 — Login 2FA degradado a límite por IP · BAJO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/src/middleware/rate-limit.ts:22-35`
- **Solución:** mantener `loginLimiter` por usuario+IP en `/admin/2fa/login`.

#### SEC-05 — CORS no valida `CORS_ORIGIN` · BAJO · RIESGO POTENCIAL
- **Ubicación:** `artifacts/api-server/src/app.ts:78-86`
- **Solución:** fallar el arranque en producción si `CORS_ORIGIN` falta o es `*`.

#### SEC-06 — `helmet` con `xssFilter` obsoleto · BAJO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/src/app.ts:34-56`

#### SEC-07 — CSP: `style-src 'unsafe-inline'` y `connect-src` por defecto desalineado · BAJO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/src/lib/csp.ts:77`

#### SEC-08 — Rutas admin sin `requireAdmin` propio (solo gate global) · BAJO · RIESGO POTENCIAL
- **Ubicación:** `routes/volunteers.ts:29,39`, `allies.ts`, `faq.ts`, `pets.ts`, `community-reports.ts`, `dashboard.ts`
- **Descripción:** dependen solo de `router.use('/admin', requireAdmin, …)` (`routes/index.ts:42`).
- **Solución:** defensa en profundidad (`requireAdmin`/`requireRole` por router).

#### SEC-09 — Redacción de logs incompleta · BAJO · RIESGO POTENCIAL
- **Ubicación:** `artifacts/api-server/src/lib/logger.ts:5-10`
- **Descripción:** solo redacta `authorization`/`cookie`/`set-cookie`; no `req.query.*`, `*.password`, `*.token`, `*.secret`.
- **Solución:** ampliar la lista de rutas redactadas.

---

### 3.2 API y rutas (API)

**Cobertura de autorización (verificado):** **no existe ninguna ruta de escritura administrativa sin autorización.**
Las rutas bajo `/admin` sin `requireAdmin` en su propio archivo quedan cubiertas por el gate global
(`routes/index.ts:42`). Ninguna ruta usa los esquemas de `lib/api-zod`; la validación real es `drizzle-zod`
(`insert*Schema`) más Zod inline. Las siguientes rutas **no validan el body**: `PUT /stats`, `PUT /admin/settings[/:key]`,
`PUT /donations/:id`.

#### API-01 — `appendMovement` encadenaba contra el primer asiento (ledger) · **CRÍTICO** · ✅ **CORREGIDO** (Fase 2 · A1)
- **Ubicación:** `artifacts/api-server/src/lib/ledger.ts:101-108` (verificado directamente)
- **Descripción:** para `prev_hash` se consultaba `orderBy(asc(campaignMovementsTable.id)).limit(1)` → devolvía el asiento de **menor** id, no el último.
- **Causa raíz:** orden ascendente donde debía ser descendente (`desc`/`max(id)`).
- **Impacto:** a partir del **3.er** movimiento el `prev_hash` apuntaba al 1.º; `verifyChain` (`ledger.ts:57-76`) reportaba `verified:false` en cadenas legítimas. La transparencia pública marcaba como manipuladas cadenas válidas. Afectaba a **cualquier** campaña con ≥3 donaciones aprobadas o gastos.
- **Solución aplicada:** `orderBy(desc(campaignMovementsTable.id)).limit(1)` + import de `desc` en `drizzle-orm`. `verifyLedger` conserva su orden ascendente (correcto).
- **Prueba:** `artifacts/api-server/tests/ledger-chain.test.mjs` (nuevo) — usa un cliente simulado que respeta la dirección del `orderBy`; con el fix `verifyChain` de 3 movimientos = válido. **Control negativo verificado**: con `asc` la prueba falla (2/2). Suite backend: **141/141**.
- **Riesgo residual:** los ledgers ya escritos con la cadena rota **no** se corrigen solos; requieren *re-hash*/re-anclaje (autorización + plan en `docs/MIGRACIONES_Y_RESPALDOS.md`).

#### API-02 — `POST /donations` sin transacción · MEDIO · ✅ **CORREGIDO** (Fase 2 · A8)
- **Ubicación:** `artifacts/api-server/src/routes/donations.ts` (handler `POST /donations`)
- **Descripción:** insert de donación + insert de comprobante + update `receiptUrl` sin `db.transaction`.
- **Impacto:** fallo intermedio dejaba donación sin comprobante.
- **Solución aplicada:** las tres escrituras se envuelven en `db.transaction`.
- **Prueba:** typecheck + suite (143/143). *Pendiente:* prueba de integración con DB forzando fallo intermedio.

#### API-03 — `POST /admin/reports/:id/convert` sin transacción · MEDIO · ✅ **CORREGIDO** (Fase 2 · A8)
- **Ubicación:** `artifacts/api-server/src/routes/community-reports.ts` (handler de conversión)
- **Impacto:** campaña huérfana si falla la segunda escritura.
- **Solución aplicada:** creación de campaña + update del reporte dentro de `db.transaction`.
- **Prueba:** typecheck + suite (143/143).

#### API-04 — `PATCH /admin/adoption-requests/:id` sin transacción · MEDIO · ✅ **CORREGIDO** (Fase 2 · A8)
- **Ubicación:** `artifacts/api-server/src/routes/pets.ts` (handler de actualización de solicitud)
- **Impacto:** la solicitud y el estado de la mascota podían quedar desincronizados.
- **Solución aplicada:** ambos updates dentro de `db.transaction`; si la solicitud no existe, la transacción devuelve `null` → 404.
- **Prueba:** typecheck + suite (143/143).

#### API-05 — Aprobación de donación digital sin exigir comprobante · MEDIO · ✅ **CORREGIDO** (Fase 2 · A7)
- **Ubicación:** `artifacts/api-server/src/lib/donation-validation.ts` (`approvalRequiresProof`); `routes/donations.ts` (`PUT /donations/:id`)
- **Descripción:** `approvalRequiresProof` existía y estaba testeada pero **no se invocaba** en `PUT /donations/:id`.
- **Impacto:** se aprobaba (y entraba al ledger) un ingreso sin evidencia.
- **Solución aplicada:** dentro de la transacción, al aprobar una donación digital se exige fila en `donation_proofs` o `receiptUrl`; si falta, se lanza `DonationProofRequiredError` → 400. El `catch` ahora captura la clase base `DonationBusinessError`.
- **Prueba:** typecheck + suite (143/143); `approvalRequiresProof` cubierto por `donation-validation.test.mjs`. *Pendiente:* prueba HTTP con DB (aprobar `yape` sin comprobante ⇒ 400).

#### API-06 — `catch → 400 validation_error` enmascara errores 500 · BAJO · CONFIRMADO
- **Ubicación:** `routes/campaigns.ts:146,153`, `news.ts`, `testimonials.ts:44,60`, `donations.ts:121,290`, `contact.ts:15`, `campaign-expenses.ts:88,111`, `campaign-evidence.ts`, `campaign-leftovers.ts`
- **Solución:** distinguir `ZodError` del resto y delegar al handler central (`app.ts:264`).

#### API-07 — IDs de path sin validar (`Number(req.params.id)`) · BAJO · CONFIRMADO
- **Ubicación:** patrón en `routes/*.ts`
- **Solución:** `z.coerce.number().int().positive()`.

#### API-08 — `isValidProofUrl` no coteja la firma emitida · BAJO · RIESGO POTENCIAL
- **Ubicación:** `routes/donations.ts:95-108`; `lib/donation-validation.ts:74-86`
- **Impacto:** posible suplantación de comprobante (solo valida host `res.cloudinary.com`).

#### API-09 — `PUT /stats` y `PUT /admin/settings` iteran upserts sin transacción · BAJO · CONFIRMADO
- **Ubicación:** `routes/stats.ts:47-65`; `routes/settings.ts:48-55`

#### API-10 — Endpoints sin validación Zod · BAJO · CONFIRMADO
- **Ubicación:** `PUT /stats`, `PUT /admin/settings[/:key]`, `PUT /donations/:id`

**Uploads (verificado, sin hallazgo crítico):** `lib/cloudinary.ts:52-77` firma server-side `folder`, `public_id`,
`timestamp`, `allowed_formats=jpg,png,webp` y `max_bytes=8MB` (no alterables sin invalidar la firma);
`/uploads/signature` es anónimo pero limitado (`uploadSignatureLimiter`, 20/h) con folder fijo.

---

### 3.3 Base de datos y modelo de datos (DB)

Esquema Drizzle de **22 tablas**. **Restricciones únicas:** `stats.key`, `admin_users.username`, `settings.key`,
`campaign_movements(source_type, source_id)` (en `migrate.ts:84`). **FK reales:** `donation_proofs→donations` (CASCADE)
y `campaign_movements→campaigns` (CASCADE); `campaign_leftovers→campaigns` **solo en la BD** (`migrate.ts:118`), no en el esquema.

**Inventario de columnas monetarias:**

| Columna | Tipo | Precisión | Ubicación |
|---|---|---|---|
| `donations.amount` | `numeric(12,2)` | precisa | `lib/db/src/schema/donations.ts:13` / `money.ts` |
| `campaign_expenses.amount` | `numeric(12,2)` | precisa | `campaign-expenses.ts:11` |
| `campaign_movements.amount` | `numeric(12,2)` | precisa | `campaign-movements.ts:16` |
| `campaigns.goal` | `real` (float4) | **flotante** | `campaigns.ts:10` (verificado) |
| `campaigns.raised` | `real` (float4) | **flotante + desnormalizada** | `campaigns.ts:11` (verificado) |
| `campaign_leftovers.quantity` | `real` (float4) | **flotante** | `campaign-leftovers.ts:12` |
| `stats.float_value` | `real` (float4) | flotante | `stats.ts:9` |

#### DB-01 — `post-merge.sh` ejecutaba `drizzle-kit push` (DDL destructivo) · **CRÍTICO** · ✅ **CORREGIDO** (Fase 2 · A2)
- **Ubicación:** `scripts/post-merge.sh:4` (`pnpm --filter db push`); `lib/db/package.json`; `.replit` (`[postMerge]`)
- **Descripción:** cada post-merge aplicaba `drizzle-kit push`, que hace *diff* y ejecuta DDL, incluido `DROP` de objetos fuera del esquema.
- **Causa raíz:** despliegue basado en *push* en lugar de migraciones versionadas.
- **Impacto:** pérdida de datos (tablas `session`, `drizzle_migrations`, FK de `campaign_leftovers`), bloqueos/downtime.
- **Solución aplicada:** se eliminó `pnpm --filter db push` de `scripts/post-merge.sh`; las migraciones versionadas se aplican con el migrador de `@workspace/db` (`lib/db/src/migrate.ts`) al arrancar el servidor (ver A4).
- **Prueba:** inspección del script (ya no contiene `push`). *Pendiente:* verificar el estado de `drizzle_migrations` en producción (requiere acceso a la BD).

#### DB-02 — El ledger `campaign_movements` se elimina en CASCADE · **CRÍTICO** · CONFIRMADO
- **Ubicación:** `lib/db/src/schema/campaign-movements.ts:12-14` (`onDelete: "cascade"`); `routes/campaigns.ts:180-189` (`DELETE /campaigns/:id`)
- **Descripción:** la tabla se documenta como *append-only* (`campaign-movements.ts:3-8`) pero su FK a `campaigns` es CASCADE.
- **Impacto:** `DELETE /campaigns/:id` borra la cadena de hashes y el ancla de auditoría.
- **Solución:** `ON DELETE RESTRICT`/`NO ACTION` + borrado lógico.

#### DB-03 — Tres sistemas de migración divergentes + drift esquema↔BD · ALTO · CONFIRMADO
- **Ubicación:** `drizzle.config.ts:8-13` (sin `out`); `lib/db/src/migrate.ts:14-143` (001-009 embebidas al arrancar); `lib/db/drizzle/0000_*.sql` y `0001_*.sql` (generadas, nunca aplicadas)
- **Descripción:** `campaign_leftovers` está definida dos veces (0001 y `migrate.ts:110-127`); su FK existe en la BD pero no en el esquema ⇒ `push` la eliminaría. La documentación dice «001-007» cuando en realidad hay 009.
- **Solución:** una única fuente de verdad; alinear esquema y migraciones.
- **Prueba:** `push` dry-run contra una BD creada por `migrate.ts`.

#### DB-04 — FK ausentes en `campaign_id`/`pet_id` → huérfanos y mezcla · ALTO · CONFIRMADO
- **Ubicación:** `donations.ts:8` (verificado); `campaign-expenses.ts:8`; `campaign-evidence.ts:7`; `campaign-updates.ts:7`; `campaign-images.ts:7`; `campaign-leftovers.ts:10`; `community-reports.ts:19`; `adoption-requests.ts:7`
- **Descripción:** las referencias a campaña/mascota son columnas sueltas sin `.references()`.
- **Impacto:** filas huérfanas y agregaciones contaminadas al borrar campañas/mascotas (agravado por DB-02).
- **Solución:** añadir FK con `onDelete` explícito. **Prueba:** insertar `donations.campaign_id=999999` ⇒ rechazo.

#### DB-05 — `campaigns.title` sin `UNIQUE`; los seeds resuelven por título · MEDIO · CONFIRMADO
- **Ubicación:** `campaigns.ts:7`; `scripts/src/apply-chocofest-2025.ts:57-73`; `apply-chocolatada-2024.ts:49-62`; `seed.ts:690-691`
- **Impacto:** campañas duplicadas y datos asociados a la campaña equivocada (`existing[0]` sin `ORDER BY`).
- **Solución:** `slug`/`year` únicos o `UNIQUE(title)`.

#### DB-06 — Fechas como `text` y helper de 2024 con año 2025 · MEDIO · CONFIRMADO
- **Ubicación:** `campaigns.ts:15-16` (`startDate`/`endDate` text); `campaign-expenses.ts:12`; `campaign-evidence.ts:11`; `news.ts:8`; `chocolatada-2024-data.ts:18` (`Date.UTC(2025, 11, …)`) con `startDate:"2024-11-01"`/`endDate:"2024-12-25"` (`:168-169`)
- **Impacto:** reportes mensuales incorrectos (el dashboard agrupa por `TO_CHAR(created_at)`).
- **Solución:** migrar a `date`/`timestamp`; corregir el helper; validar formato.

#### DB-07 — Índices faltantes en columnas consultadas · MEDIO · CONFIRMADO
- **Ubicación:** los índices de `migrate.ts:15-26,62,83,126` no cubren `campaign_expenses/evidence/updates/images.campaign_id` ni `adoption_requests.pet_id`. Consultas: `campaign-expenses.ts:22-33`, `campaign-transparency.ts:24-70`, `pets.ts:110-111`, `community-reports.ts:82-86`.
- **Solución:** añadir índices compuestos por caso de uso. **Prueba:** `EXPLAIN ANALYZE` con volumen.

#### DB-08 — `status` como `text` sin `CHECK`/enum · MEDIO · CONFIRMADO
- **Ubicación:** `donations.ts:20`; `campaigns.ts:12`; `pets.ts:28`; `volunteers.ts:16`; `adoption-requests.ts:19`; `community-reports.ts:15`; `campaign-movements.ts:14`
- **Solución:** `CHECK`/`pgEnum`. **Prueba:** insertar `status='foo'`.

#### DB-09 — Donaciones sembradas aprobadas sin entrada en el ledger · MEDIO · CONFIRMADO
- **Ubicación:** `seed.ts:705-722`; `apply-chocofest-2025.ts:79-83`; `apply-chocolatada-2024.ts:71-75` (sin `appendMovement`; el ledger solo se alimenta en `donations.ts:252-262` y `campaign-expenses.ts:74-82`)
- **Impacto:** recaudado por donaciones ≠ ledger. **Solución:** *backfill* idempotente vía `appendMovement`.
- **Prueba:** `SUM(donations.amount approved) == SUM(campaign_movements.amount ingreso)` por campaña.

#### DB-10 — `updated_at` no automático · BAJO · CONFIRMADO
- **Ubicación:** `community-reports.ts:22`; `pets.ts:31`; `settings.ts:9`

#### DB-11 — Documentación obsoleta · BAJO · CONFIRMADO
- **Ubicación:** `README.md:148` y `docs/ROADMAP.md:63` («001-007» vs 009); `ledger.ts:15-17` dice «real float4» cuando la migración 006 ya usa `numeric(12,2)`.

---

### 3.4 Importadores y datos históricos (IMP)

**Flujo actual (verificado paso a paso):**
1. Al arrancar, `index.ts:35` llama `seedIfEmpty()` y `:39` `runMigrations()` (en paralelo, ver INF-01).
2. `seedIfEmpty()` (`seed.ts:115-131`) → `seedCampaigns()` (solo si `campaigns` está globalmente vacía, `seed.ts:168-169`) → `seedCampaignMedia()` (solo si `donations` está globalmente vacía, `seed.ts:694`).
3. Reaplicación manual: `scripts/src/apply-chocofest-2025.ts` (busca campaña por título → `UPDATE` → **`DELETE` de donaciones (`:80`) → `INSERT` (`:81`)**) y `scripts/src/apply-chocolatada-2024.ts` (idéntico, `:72-75`).
4. «Campaña protagonista»: no existe flag. Se deriva de `featured && active` con `createdAt desc` (`campaigns.ts:14-50`, `ActiveCampaignsSection.tsx:19-25`); el total del hero suma **todas** las donaciones aprobadas sin filtrar campaña (`donations.ts:128-142`).

#### IMP-01 — `DELETE + INSERT` que destruye registros auditados · **CRÍTICO** · ✅ **CORREGIDO** (Fase 2 · B1)
- **Ubicación:** `scripts/src/apply-chocofest-2025.ts`; `scripts/src/apply-chocolatada-2024.ts`
- **Descripción:** «reemplazo de la fuente de verdad» implementado borrando la colección entera.
- **Causa raíz:** reconciliación destructiva en lugar de *upsert*/diff por clave natural.
- **Impacto:** eliminaba donaciones reales creadas vía `POST /donations` (incluidas aprobadas/auditadas); reasignaba IDs serial e invalidaba `campaign_movements.source_id`; en cascada borraba `donation_proofs`.
- **Solución aplicada:** los importadores **ya no borran**. Reconciliar por clave natural (`donationKey`) insertando solo las donaciones ausentes; las existentes (reales o sembradas) se preservan intactas. Diff multiconjunto.
- **Prueba:** `tests/donation-reconcile.test.mjs` (8 pruebas) — incluye «no borra ni reemplaza donaciones reales» y «re-ejecución idempotente».

#### IMP-02 — Importaciones no transaccionales · ALTO · ✅ **CORREGIDO** (Fase 2 · B2)
- **Ubicación:** `scripts/src/apply-chocofest-2025.ts`, `apply-chocolatada-2024.ts`
- **Impacto:** el `DELETE` se confirmaba de inmediato; si el `INSERT` fallaba, la campaña quedaba vacía.
- **Solución aplicada:** todo el importador corre dentro de `db.transaction` (las migraciones se aplican antes, fuera de la transacción). Ya no hay `DELETE`, así que un fallo no destruye nada.
- **Prueba:** typecheck + suite (151/151). *Pendiente:* prueba con DB forzando fallo.

#### IMP-03 — Idempotencia inconsistente (por tabla global vs por campaña) · ALTO · ✅ **CORREGIDO** (Fase 2 · B1)
- **Ubicación:** `apply-chocolatada-2024.ts` (`tableEmpty`, global) → unificado
- **Impacto:** re-ejecuciones producían contenido faltante o duplicado.
- **Solución aplicada:** ambos scripts usan el mismo criterio **por campaña** (`campaignHasRows`) para el contenido de transparencia, y la reconciliación por clave natural para donaciones.

#### IMP-04 — Sin clave natural ni upsert · ALTO · 🟡 **PARCIAL** (Fase 2 · B1)
- **Ubicación:** `lib/db/src/schema/donations.ts` (sin `unique`)
- **Solución aplicada:** la idempotencia se resuelve con `donationKey` calculada en código (`lib/donation-reconcile.ts`), sin cambios de esquema.
- **Pendiente (requiere autorización de migración):** añadir columna `source`/`dedupKey` con índice único para garantizar la unicidad a nivel de BD y permitir `ON CONFLICT`. Hoy la garantía es de aplicación (los importadores son manuales y poco frecuentes).

#### IMP-05 — Mezcla de campañas y ambigüedad de «campaña actual» · MEDIO · CONFIRMADO
- **Ubicación:** `chocolatada-2024-data.ts:165-169` (`status:"active"`, `featured:true`, `endDate:"2024-12-25"`); `chocofest-2025-data.ts:173-177`; consumo en `ActiveCampaignsSection.tsx:19-25`, `HomeHero.tsx:18-21`
- **Impacto:** en 2026 sigue en portada una campaña terminada en 2024; el total global mezcla años.
- **Nota (verificado):** los arrays de donaciones de 2024 y 2025 son **idénticos** (ver «Notas de verificación»).
- **Solución:** derivar `status` de `endDate`; campo `isCurrent`/ventana anual. *Pendiente.*

#### IMP-06 — `UPDATE` ciego sobrescribe ediciones del panel admin · MEDIO · ✅ **CORREGIDO** (Fase 2 · B3)
- **Ubicación:** `apply-chocofest-2025.ts`; `apply-chocolatada-2024.ts`
- **Descripción:** `db.update(campaignsTable).set({ ...CAMPAIGN })` reescribía `featured`/`status`/`raised`, revirtiendo ediciones humanas.
- **Solución aplicada:** la actualización de campaña **excluye** `featured`, `status` y `raised` (destructuring); solo actualiza campos de contenido.

#### IMP-07 — El `DELETE` propaga a comprobantes y deja el ledger huérfano · MEDIO · CONFIRMADO/POTENCIAL
- **Ubicación:** `lib/db/drizzle/0000_*.sql:290` (`donation_proofs … ON DELETE cascade`); `migrate.ts:66-84`; `lib/ledger.ts:34-40`
- **Impacto:** pérdida de evidencia documental; ingresos fantasma en transparencia; posible choque con `idx_movements_source`.

#### IMP-08 — `seed` global por `isEmpty` no repuebla BD parcialmente poblada · MEDIO · CONFIRMADO
- **Ubicación:** `seed.ts:103,168-169,694`

#### IMP-09 — Tests «puros» no cubren importación ni BD · BAJO · CONFIRMADO
- **Ubicación:** `artifacts/api-server/tests/chocofest-2025-data.test.mjs`, `chocolatada-2024-data.test.mjs`
- **Nota:** el test de 2024 asertaba el mes `2025-12`, **codificando el bug DB-06** (ver «Notas de verificación»).

#### IMP-10 — Importadores fuera de CI/despliegue · BAJO · CONFIRMADO
- **Ubicación:** `.github/workflows/ci.yml`; `render.yaml`; `scripts/package.json`

---

### 3.5 Frontend (FE)

#### FE-01 — No existe ninguna página/componente de ChocoFest 2026 · ALTO (FALTA) · 🟡 **PARCIAL** (Fase 3 · Bloque C)
- **Ubicación original:** `artifacts/red-solidaria/src/**` (no había ruta ni contenido de 2026).
- **Implementado:** página pública `src/pages/chocofest-2026.tsx` con las **13 secciones** del prompt; ruta permanente
  `/campanas/chocofest-2026` registrada **antes** de `/campanas/:id`; `src/lib/chocofest.ts` (constantes + resolución por
  título); i18n es/en (bloque `chocofest`, paridad verificada); test `tests/chocofest.test.mjs`.
- **Contenido:** **provisional y marcado** («Contenido en preparación»); si la campaña 2026 no existe en la BD, la URL
  muestra un estado «en preparación» (no se inventan cifras ni fechas).
- **Panel admin (C7, añadido):** `src/pages/admin/chocofest.tsx` en `/admin/chocofest` — estado de la campaña, KPIs,
  accesos rápidos a los módulos existentes, checklist de secciones y **creación guiada** (el admin define meta y fechas;
  no se inventan datos). Enlace en el nav del admin.
- **Pendiente:** donaciones en especie/inventario (C5), localidades beneficiadas y galería con datos reales.
- **Prueba:** typecheck frontend EXIT=0 · node 16/16 · vitest 22/22 · build Vite EXIT=0 (chunks `chocofest-2026-*.js` y `chocofest-*.js`).

#### FE-02 — El backend no valida `amount`/`paymentMethod` en `POST /donations` · ALTO · ❌ **REFUTADO** (Fase 2 · A6)
- **Ubicación:** `shared/DonationModal.tsx:57-75`; `routes/donations.ts` (`POST /donations`)
- **Hallazgo original:** se reportó que el backend usaba `insertDonationSchema` (drizzle-zod), que no validaba monto ni método.
- **Verificación (refutación):** el handler usa **`donationInputSchema`** de `lib/donation-validation.ts` (monto mínimo 5, máx. 2 decimales, `paymentMethod` enum, email, longitudes). `insertDonationSchema` no se usa en la ruta.
- **Evidencia:** `tests/donations-auth.test.mjs` verifica que `POST /api/donations` responde **400** ante monto negativo, cero, >2 decimales, email inválido y método inválido (pruebas HTTP en verde).
- **Conclusión:** no requiere corrección; **no se modificó código**. El comentario de `donation-validation.ts` documenta que este schema reemplazó al de drizzle-zod.

#### FE-03 — Gate admin de cliente solo redirige ante 401 (sin gate de rol) · MEDIO · CONFIRMADO
- **Ubicación:** `pages/admin/layout.tsx:20-31,39-77`
- **Descripción:** `/admin/usuarios`, `/admin/donaciones` están en el `Switch` para cualquier sesión; el nav solo oculta ítems. El backend sí protege (`routes/index.ts:42`, `middleware/roles.ts`, `admin-users.ts:12`).
- **Impacto:** UX (no brecha de seguridad). **Solución:** gate de rol en cliente.

#### FE-04 — Estados de carga/vacío/error inconsistentes · MEDIO · CONFIRMADO
- **Ubicación:** `lib/Skeleton.tsx` (usado solo en `ActiveCampaignsSection.tsx`); `components/shared/EmptyState.tsx` (solo en 4 sitios); `main.tsx`/`pages/home.tsx` (un único `ErrorBoundary` global)
- **Impacto:** «Cargando…» textual en el resto; un `throw` en una sección lazy desmonta toda la app.

#### FE-05 — Validación de cliente no replicada en backend · MEDIO · CONFIRMADO
- **Ubicación:** `pages/volunteer.tsx:56-68` vs `volunteers.ts:25`; `pages/report-form.tsx:50-62` vs `community-reports.ts:25`

#### FE-06 — Accesibilidad: etiquetas/roles incorrectos · MEDIO · ✅ **CORREGIDO** (Fase 3 · Bloques D y F)
- **Corregido:**
  - `Navbar`: `aria-label` del nav de escritorio ahora usa `nav.mainMenu` (antes `common.skipToContent`).
  - `report-form.tsx`: el toggle de anonimato tiene `role="switch"` + `aria-checked` + `aria-label`.
  - Grupos de selección única con `role="radiogroup"` + `role="radio"`/`aria-checked`: disponibilidad (`volunteer.tsx`) y tipo de caso + urgencia (`report-form.tsx`).
  - Grupo de selección múltiple (intereses, `volunteer.tsx`) con `role="group"` + `aria-pressed`.
- **Pendiente (menor):** auditoría a11y completa (contraste, foco, teclado) y `axe`/Lighthouse.
- **Prueba:** typecheck EXIT=0 · node 16/16 · vitest 22/22 · build Vite EXIT=0.

#### FE-07 — Duplicación de `components/ui` con el sandbox · MEDIO · 🟡 **MITIGADO** (Fase 3 · Bloque D/F)
- **Verificación correcta:** ambos directorios tienen 55 archivos, pero **NO son idénticos**: 7 difieren
  (`badge`, `button`, `chart`, `dialog`, `input-group`, `sidebar`, `skeleton`). El *drift* **ya ocurrió**
  (el hallazgo delegado decía «copias idénticas»; era impreciso).
- **Impacto real:** el sandbox se compilaba en el build raíz (→ INF-04) y existía riesgo de confusión/drift.
- **Mitigación aplicada:**
  1. **INF-04:** `build` y `typecheck` del root ahora filtran `api-server`, `red-solidaria`, `lib/**` y `scripts`
     → el sandbox **no** se compila (verificado: 0 apariciones en el build).
  2. **Aviso explícito:** `artifacts/mockup-sandbox/src/components/ui/README.md` documenta que es una copia de
     trabajo, que la copia de producto es `red-solidaria/...` y que ya hay drift.
- **Pendiente (opcional):** extraer `ui` a un paquete compartido `lib/ui` (refactor amplio, requiere revisar imports).

#### FE-08 — Imágenes sin `loading="lazy"` · MEDIO · ✅ **CORREGIDO** (Fase 3 · Bloque D)
- **Recuento real (verificado):** 35 `<img>` y 14 con `loading="lazy"`; el conteo previo («33, solo 13») era impreciso porque los `<img>` multilínea llevan el atributo en otra línea.
- **Corregido:** se añadió `loading="lazy"` + `decoding="async"` a las imágenes **por debajo del pliegue**: `about.tsx`, `ImageUploadField`/`DonationModal` (previas) y las listas del panel admin (`campaign-detail`, `adoptions`, `volunteers`, `reports`, `report-detail`, `news`, `testimonials`, `allies`, `donations`).
- **Intencionalmente NO lazy:** las imágenes *hero* (`HomeHero`, `campaign-detail`, `chocofest-2026`) y el logo del `Navbar` — están sobre el pliegue y el lazy perjudicaría el LCP.
- **Prueba:** typecheck EXIT=0 · node 16/16 · vitest 22/22 · build Vite EXIT=0.

#### FE-09 — `SEO.tsx` usado solo en 5 páginas · MEDIO · 🟡 **PARCIAL** (Fase 3 · Bloque F)
- **Ubicación:** `shared/SEO.tsx`.
- **Corregido:** añadido `<SEO>` a `transparency.tsx`, `adoptions.tsx` y `volunteer.tsx` → **9 páginas** con SEO.
- **Pendiente:** `BASE_URL` hardcodeado, `hreflang` es/en apuntando a la misma URL y datos estructurados (JSON-LD).
- **Corregido en V7-13:** `BASE_URL` configurable (`VITE_PUBLIC_URL`, con el despliegue actual por defecto); `hreflang` honesto (solo `x-default`, sin alternates de idioma apuntando a la misma URL); datos estructurados JSON-LD (`NGO` + `WebSite` en la portada) con serialización que **no se puede cerrar con `</script>`** y que **se retira** al cambiar de página; 9 pruebas puras + 4 de componente. **Pendiente deliberado:** el `Event` de ChocoFest 2026 no se publica porque sus fechas oficiales no están definidas (no se inventan datos).

#### FE-10 a FE-15 — BAJO
- `pnpm-workspace.yaml:30`: `zod` 3.25.76 en cliente vs `zod/v4` en `lib/db` (FE-10). *Pendiente.*
- `pages/admin/donations.tsx`: formulario admin sin RHF/Zod (FE-11). *Pendiente.*
- `Navbar.tsx`: `innerHTML` con SVG inline en `onError` (FE-12). ✅ **CORREGIDO** (Fase 3 · Bloque F): fallback React (SVG de corazón siempre presente; la imagen se oculta si falla).
- Responsive correcto (breakpoints y bottom nav coherentes) — sin hallazgo (FE-13).
- `image-url.ts`/`cloudinary-upload.ts`/`vite.config.ts`: optimizeImageUrl en 10 archivos; split vendor + gzip/brotli OK (FE-14).
- i18n es/en con persistencia `rs_lang` y `<html lang>` OK (FE-15).

---

### 3.6 Infraestructura y despliegue (INF)

**Verificado sin hallazgo:** `build.mjs:17-22` genera `dist/index.mjs`, que **coincide** con el `startCommand`
de `render.yaml:9`.

#### INF-01 — Migraciones DDL automáticas no bloqueantes en el arranque · ALTO · ✅ **CORREGIDO** (Fase 2 · A4)
- **Ubicación:** `artifacts/api-server/src/index.ts:25-45` (verificado)
- **Descripción:** `app.listen()` se ejecutaba **antes** de `runMigrations()`/`seedIfEmpty()`; ambos eran *fire-and-forget* que solo logueaban el error.
- **Impacto:** DDL automático en producción (drift/bloqueos) y ventana sirviendo contra un esquema antiguo si la migración falla; el fallo no detenía el servicio.
- **Solución aplicada:** `runMigrations()` se ejecuta **antes** de `app.listen()` (top-level await) y `process.exit(1)` si falla. El seed permanece no bloqueante, pero después de migrar.
- **Prueba:** typecheck EXIT=0 y build de producción EXIT=0 (el bundle esbuild empaqueta el top-level await). *Pendiente:* prueba con DB real forzando fallo de migración.

#### INF-02 — Health check no verifica la base de datos · ALTO · ✅ **CORREGIDO** (Fase 2 · A5)
- **Ubicación:** `artifacts/api-server/src/routes/health.ts`; `render.yaml:10` (`healthCheckPath: /api/healthz`)
- **Descripción:** `/healthz` devolvía `{status:'ok'}` fijo, sin comprobar la DB.
- **Impacto:** deploy marcado «healthy» con la BD caída; enmascaraba INF-01.
- **Solución aplicada:** nuevo `/readyz` que ejecuta `SELECT 1` con timeout de 2 s y devuelve **503** si la DB no responde; `/healthz` sigue siendo liveness puro.
- **Prueba:** `tests/health-readyz.test.mjs` — `/healthz` 200 y `/readyz` 503 sin DB (verificado, 143/143 en la suite).

#### INF-03 — `optimizeDeps.include` con dependencias no instaladas · ALTO · ✅ **CORREGIDO** (Fase 3 · Bloque D)
- **Ubicación:** `artifacts/red-solidaria/vite.config.ts` (incluía `react-redux` y `use-sync-external-store`, ausentes en `package.json`; el comentario asumía `recharts 3` pero el instalado es `^2.15.2`).
- **Impacto:** Vite avisaba «Failed to resolve dependency» en cada arranque; en un entorno limpio el pre-bundle podía fallar.
- **Solución aplicada:** se eliminaron ambas entradas de `optimizeDeps.include` y se documentó que la interop de React se resuelve con `resolve.alias` + `dedupe` (una sola copia de React).
- **Prueba:** `pnpm --filter @workspace/red-solidaria build` EXIT=0 sin avisos de resolución; typecheck y tests en verde.

#### INF-04 — El build raíz compila el sandbox innecesariamente · MEDIO · CONFIRMADO
- **Ubicación:** `package.json` (root) `build: pnpm run typecheck && pnpm -r --if-present run build`; consumido por `render.yaml:8`
- **Impacto:** deploy más lento y mayor superficie de fallo. **Solución:** `--filter` a `api-server`, `red-solidaria` y `lib/**`.

#### INF-05 — Prefijo `/api` del health check no verificado · MEDIO · RIESGO POTENCIAL
- **Ubicación:** `health.ts:6` declara `/healthz`; `render.yaml:10` espera `/api/healthz`; depende del montaje en `app.ts`.
- **Solución:** confirmar `app.use('/api', router)` + test de `/api/healthz`.

#### INF-06 — `render.yaml` fija `PORT=10000` y el `startCommand` omite `--enable-source-maps` · BAJO · RIESGO POTENCIAL
- **Ubicación:** `render.yaml:9`; `build.mjs:24` (`sourcemap: "linked"`)

#### INF-07 — Build de producción no verificado en la línea base · BAJO · PENDIENTE
- **Ubicación:** `.github/workflows/ci.yml` (sí lo ejecuta en CI)
- **Nota:** el `pnpm audit --prod` sí se ejecutó en la línea base y reveló vulnerabilidades (ver 3.7 y `docs/PRUEBAS_Y_RESULTADOS.md`).

---

### 3.7 Dependencias (DEP)

`pnpm audit --prod` detectó **6 vulnerabilidades** (1 CRÍTICA, 1 ALTA, 4 MODERADAS). **Todas están corregidas**
(Fase 3 · Bloque E) y el audit queda **limpio** (`No known vulnerabilities found`).

#### DEP-01 — `proxy-addr` con IP spoofing vía IPv6 mapeado · **CRÍTICO** · ✅ **CORREGIDO** (Fase 3 · Bloque E)
- **Ubicación:** transitiva de Express en `artifacts/api-server` (`proxy-addr`); fix `>=2.0.8`.
- **Impacto:** si `trust proxy` está activo, un cliente podía falsificar su IP y **eludir el rate limiting y el lockout por IP**.
- **Solución aplicada:** override `proxy-addr: ^2.0.8` en `pnpm-workspace.yaml` → instalado **2.0.8**.
- **Prueba:** `pnpm audit --prod` → *No known vulnerabilities found*; suite backend 151/151.

#### DEP-02 — `compression` con DoS por fuga de memoria · ALTO · ✅ **CORREGIDO** (Fase 3 · Bloque E)
- **Ubicación:** `artifacts/api-server` (`compression`); fix `>=1.8.2`.
- **Solución aplicada:** dependencia subida a `^1.8.2` → instalado **1.8.2**.
- **Prueba:** `pnpm audit --prod` limpio; build y suite en verde.

#### DEP-03 — `ip-address` (4 advisories: SSRF / trust-boundary) · MEDIO · ✅ **CORREGIDO** (Fase 3 · Bloque E)
- **Ubicación:** `artifacts/api-server > express-rate-limit > ip-address`; fix `>=10.7.1`.
- **Nota:** ya existía un override `ip-address: ^10.3.1`, pero resolvía a **10.4.0** (por debajo del fix).
- **Solución aplicada:** override subido a `^10.7.1` → instalado **10.7.4**.
- **Prueba:** `pnpm audit --prod` limpio.

---

## 4. Matriz de riesgos priorizada

| Prioridad | ID | Título | Severidad |
|---|---|---|---|
| 1 | API-01 | Ledger encadena contra el primer asiento | CRÍTICO |
| 2 | IMP-01 | `DELETE+INSERT` destruye donaciones auditadas | CRÍTICO |
| 3 | DB-01 | `drizzle-kit push` automático en post-merge | CRÍTICO |
| 4 | DB-02 | Ledger borrado en CASCADE | CRÍTICO |
| 5 | INF-01 | Migraciones no bloqueantes en arranque | ALTO |
| 6 | INF-02 | Health check sin verificar BD | ALTO |
| 7 | DB-04 | FK ausentes en `campaign_id`/`pet_id` | ALTO |
| 8 | IMP-02 | Importaciones no transaccionales | ALTO |
| 9 | IMP-03/04 | Idempotencia y clave natural ausentes | ALTO |
| 10 | FE-02 | Backend no valida donación | ALTO |
| 11 | FE-01 | ChocoFest 2026 inexistente | ALTO (falta) |
| 12 | INF-03 | `optimizeDeps` con deps no instaladas | ALTO |
| 13 | DB-03 | Migraciones divergentes / drift | ALTO |
| 14 | DB-06 | Fechas `text` + helper 2024 erróneo | MEDIO |
| 15 | API-02..05, DB-05,07,08,09, IMP-05..08, FE-03..09 | — | MEDIO |

---

## 5. Notas de verificación

**Re-verificado directamente por el auditor principal (evidencia en código):**
`ledger.ts:101-108` (API-01), `index.ts:25-45` (INF-01), `campaigns.ts:10-16` (DB-06/monetarios),
`donations.ts:8,20,26` (DB-04/08, FE-02), `build.mjs:17-22` (sin hallazgo crítico).

**Corrección de una verificación previa (integridad del documento):**
en una revisión inicial este documento **refutó por error** el hallazgo delegado de que los datasets
`chocolatada-2024-data.ts` y `chocofest-2025-data.ts` eran idénticos. Aquella comprobación usó un `grep` sobre
literales `amount:`/`name:` que **no existen** en los datos (se construyen con los helpers `cash()`/`kind()`), por lo
que el resultado no era válido.

**Verificación correcta** (`diff` de los arrays completos, 71 líneas cada uno): los arrays de donaciones son
**IDÉNTICOS** salvo el nombre de la constante (`CHOCOLATADA_2024_DONATIONS` vs `CHOCOLATADA_2025_DONATIONS`), y ambos
declaran `CASH_TOTAL = 2818.5`. **El hallazgo delegado era correcto.**

**Implicación (agrava IMP-01):** la campaña «2024» contiene en realidad **los mismos datos que la de 2025** (probable
error de copia al crear el archivo), y además con **fechas de diciembre de 2025** por el helper `iso`
(`chocolatada-2024-data.ts:18`). Ver IMP-01 / DB-06 / IMP-05.
El test `chocolatada-2024-data.test.mjs` asertaba el mes `2025-12`, **codificando** ese comportamiento erróneo (IMP-09).

**Verificado contra la base de datos real (solo lectura, 2026-10; sin DDL):**
- **API-01 CONFIRMADO y activo:** la cadena del ledger está **rota en el movimiento #3** (5 movimientos en total).
- **IMP-04:** existe **1 duplicado** por clave natural (bloquearía el índice único).
- **DB-02:** FK de `campaign_movements` = **CASCADE**.
- **DB-06:** `campaigns.start_date/end_date` = `text`; `goal`/`raised`/`quantity`/`float_value` = `real`. Los `amount` ya son `numeric(12,2)`.
- **DB-07:** las tablas de contenido no tienen índice por `campaign_id`.
- **drizzle_migrations** existe con 9 filas (001-009). **0** donaciones huérfanas. Detalle en `docs/PRUEBAS_Y_RESULTADOS.md` §13.

---

## 6. Siguientes pasos

1. **Fase 2 — Estabilización** de los 4 CRÍTICOS + ALTOS sin impacto destructivo (ver `docs/PLAN_IMPLEMENTACION_CHOCOFEST_2026.md`).
2. Ejecutar la línea base pendiente (`pnpm -r test`, `pnpm -r build`, `pnpm audit --prod`).
3. Fase 3 — ChocoFest 2026 (página pública + administración + transparencia).

> Este documento no afirma que se hayan ejecutado pruebas que no se hayan ejecutado. La suite y el build se marcan como
> PENDIENTES hasta correrlos y registrar resultados en `docs/PRUEBAS_Y_RESULTADOS.md`.
