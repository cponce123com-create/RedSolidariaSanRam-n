# PROGRAMA V7 — Auditoría correctiva, pendientes y estabilización

**Rama:** `feat/implementacion-integral-2026` · **Punto de partida:** V6 (`c2de0ad` + incrementos 3A–4A)
**Método:** inspección directa del código con evidencia `archivo:línea`, ejecución real de `pnpm audit`, typecheck, suites y build de producción. No se ha modificado ningún dato de producción.

> Este documento es el registro vivo del programa V7. Los entregables finales
> (`AUDITORIA_FINAL_V7.md` y `CHECKLIST_FUNCIONAL_V7.md`) se generan al cerrar el
> programa y se nutren de lo aquí registrado. No se marca nada como hecho sin
> pruebas ejecutadas.

---

## 1. Matriz de brechas (V6 → V7)

| Fase | Requisito | Estado real | Evidencia / motivo |
|---|---|---|---|
| 1.1 | Auditoría de dependencias | **PARCIAL** | `pnpm audit --prod` → **0 vulnerabilidades**. Total (incluye dev): 66 avisos (2 low, 19 moderate, 34 high, 11 critical) en toolchain de desarrollo (`@vitejs/plugin-react > @babel/core`, etc.). No se actualizan majors a ciegas: se documenta el alcance dev-only. |
| 1.2 | Autenticación y permisos | **IMPLEMENTADO** con hallazgos abiertos | `requireAdmin`/`requireRole` en todas las rutas admin, TOTP + lockout, auditoría de acciones. Abiertos: SEC-01 (cookie `secure`), SEC-02/03/04 (límites y lockout en memoria), SEC-05 (CORS), SEC-08 (rutas admin sin gate propio). |
| 1.3 | Operaciones financieras | **PARCIAL** | Transacciones en alta de donación, conversión de reportes y adopciones (API-02/03/04 ✔), comprobante obligatorio antes de aprobar (API-05 ✔), importes `numeric(12,2)` ✔, un asiento por donación/gasto (índice único) ✔. Abierto: API-06 (`catch → 400` enmascara fallos 500). |
| 1.4 | Verificación del libro contable | **IMPLEMENTADO (V7-3)** | La cadena era verificable pero **incompleta** (donaciones confirmadas sin asiento, DB-09). Ahora hay informe administrativo de solo lectura (`GET /admin/ledger/audit`) + página `/admin/libro`. Ver §6. |
| 2.1 | Flujo completo de campañas | **IMPLEMENTADO** | `lib/campaign-lifecycle.ts` (estados, transiciones, `deleteBlockReason`) + `PATCH /campaigns/:id/status`. |
| 2.2 | Eliminación y archivado | **IMPLEMENTADO**, con bloqueo de migración | Solo se elimina un borrador sin dependencias; el resto se archiva (conserva historial). **Bloqueo:** la migración 010 (`ON DELETE CASCADE → RESTRICT` en el libro) está ensayada pero **no aplicada**; en producción el ledger sigue en CASCADE. |
| 2.3 | Sincronización admin → público | **CORREGIDO** (Fase 1 del plan) | Invalidación por entidad + `no-store` con sesión; se eliminó la colisión de claves del cliente generado. |
| 2.4 | Pruebas extremo a extremo | **PENDIENTE** | Requieren PostgreSQL real (hay binarios en el sandbox); hoy las suites usan `DATABASE_URL` ficticio. |
| 3.1 | Unificar el cálculo de recaudación | **IMPLEMENTADO (V7-1)** | Se eliminó `Math.max(columna manual, donaciones)` de `campaigns.ts` y la columna cruda del dashboard. Ver §2. |
| 3.2 | Panel de transparencia | **PARCIAL → mejorado (V7-1)** | Ya existía; ahora publica el desglose conciliado y la fecha de última actualización. Falta unificar la exportación PDF/Excel del libro completo. |
| 3.3 | Gestión de comprobantes | **PARCIAL** | Registro, adjunto, visibilidad pública opcional y conciliación ✔. Falta historial de cambios del comprobante. |
| 4 | ChocoFest 2026 y eventos | **PARCIAL** | 3A–3C-3b y 4A cerrados (bienes, presupuesto, programa, composición de canastas, tipos de colaboración). Falta rendición de resultados del evento (4.3) y patrocinios. |
| 5.1 | Donantes | **PARCIAL** | Panel, historial, tipo de donante (incl. organización), anonimato, conciliación y detección de duplicados ✔. Falta consentimiento explícito y nombre colectivo de publicación. |
| 5.2 | Certificados con QR | **NO EXISTE** | Requiere decisión de negocio (ver §3). |
| 5.3 | Insignias y reconocimientos | **NO EXISTE** | Requiere decisión de negocio. |
| 5.4 | Embajadores y auspiciadores | **PARCIAL** | Aliados (CRUD + visibilidad pública) ✔; embajadores con código de referencia, captaciones y métricas no existen. |
| 6 | Dashboard unificado | **PARCIAL** | Existe `GET /admin/dashboard` + panel, con cifras ya coherentes (V7-1). Faltan filtros por campaña/estado/fechas. |
| 7 | Comunicaciones y WhatsApp | **PARCIAL → mejorado (V7-2)** | El número y los mensajes predefinidos ya son configuración editable (allowlist pública + panel + migración 019) y desaparecieron los números fijos del código, incluido el de ejemplo `51999999999` que el catálogo abría en producción. Falta la mensajería automatizada (bloqueo B-4). Ver §5. |
| 8 | Frontend (UX, rendimiento, SEO) | **PARCIAL** | FE-03 (gate de rol en cliente), FE-04 (estados de carga/vacío/error), FE-09 (SEO en 5 páginas), FE-10 (zod 3 en cliente vs zod/v4 en DB). |
| 9 | Pruebas y despliegue | **PARCIAL** | `api-server` 295/295, `red-solidaria` 133/133 + 23/23 vitest, typecheck 0 (libs, API, frontend, scripts) y build de producción OK. Faltan E2E con base real y lint automatizado. |
| 10 | Informe final y checklist | **PENDIENTE** | Se generan al cerrar el programa. |

---

## 2. Incremento V7-1 — Recaudación conciliable (Fase 3.1 y 3.2) · CERRADO

### 2.1 Defecto corregido

`formatCampaign` publicaba `raised = max(columna manual, suma de donaciones confirmadas)`
(`routes/campaigns.ts`) y el dashboard ordenaba el top de campañas por la columna manual
cruda (`routes/dashboard.ts`). Dos cifras de naturaleza distinta mezcladas sin criterio:
un importe histórico podía tapar las donaciones reales y, en el mismo panel, el total
general y el ranking de campañas se calculaban con fuentes distintas. Es exactamente el
sustituto de conciliación que el Prompt Maestro prohíbe.

### 2.2 Regla implementada (una sola fuente: `src/lib/funding.ts`)

| Concepto | Definición aplicada |
|---|---|
| **Recaudación verificada** (`verifiedRaised`) | Suma de donaciones confirmadas (aprobadas + conciliadas). |
| **Recaudación histórica registrada** (`historicalRaised`) | Importe escrito a mano en la campaña (importaciones anteriores a la plataforma). |
| **¿Cuenta el histórico?** (`historicalCounted`) | Solo si **no hay ninguna donación registrada**: entonces es la única fuente. Si hay donaciones, se publica como referencia y **no** se suma (sumarlo duplicaría importes que ya están en la base). |
| **Total conciliado** (`reconciledRaised`) | Verificado + histórico contado. **Nunca** el máximo de dos cifras. |
| **Saldo disponible** | Conciliado − egresos válidos (derivado, nunca guardado). |

- Aplicado en la **ficha pública de campaña**, en el **panel de transparencia de la campaña** (antes solo sumaba donaciones, así que una campaña con recaudación histórica mostraba S/ 0 mientras su ficha mostraba el importe) y en el **dashboard** (total y top de campañas, que ahora usan la misma regla).
- Redondeo a céntimos (`roundMoney`) para que la suma de `numeric(12,2)` no derive.
- Importes negativos o corruptos se normalizan a 0: nunca restan recaudación ni rompen la interfaz.
- La interfaz **explica** la cifra: si el histórico cuenta, se dice; si solo es referencia, se dice por qué no se suma.
- El panel de transparencia publica además la **fecha de última actualización** (los datos se leen en vivo de la base).

### 2.3 Archivos

```
artifacts/api-server/src/lib/funding.ts                       regla pura de conciliación + saldo
artifacts/api-server/tests/funding.test.mjs                   +9 pruebas (regla, duplicidad, invariante, redondeo)
artifacts/api-server/build-tests.mjs                          entry point del nuevo módulo
artifacts/api-server/src/routes/campaigns.ts                  formatCampaign sin Math.max + desglose
artifacts/api-server/src/routes/campaign-transparency.ts      misma cifra que la ficha + updatedAt
artifacts/api-server/src/routes/dashboard.ts                  total conciliado y top por la misma regla
lib/api-spec/openapi.yaml                                     Campaign: verifiedRaised/historicalRaised/historicalCounted
lib/api-client-react|api-zod/src/generated/**                 cliente regenerado (orval)
artifacts/red-solidaria/src/pages/campaign-detail.tsx         nota de conciliación bajo la barra de progreso
artifacts/red-solidaria/src/pages/campaign-transparency.tsx   desglose + última actualización
artifacts/red-solidaria/src/hooks/use-phase3.ts               TransparencyData ampliado
artifacts/red-solidaria/src/lib/i18n/locales/es.ts|en.ts      3 etiquetas nuevas
```

### 2.4 Verificación

- `api-server`: **295/295** (+9) · typecheck **0**.
- `red-solidaria`: **133/133** node:test + **23/23** vitest · typecheck **0**.
- `typecheck:libs` **0** · build de producción **OK**.
- No se modificó ningún dato: la regla es de cálculo y presentación.

### 2.5 Impacto visible (decisión de negocio, ya aplicada por mandato del Prompt)

Las campañas que hoy muestran el **máximo** entre su importe histórico y sus donaciones
pasarán a mostrar el **total conciliado**: si tienen donaciones registradas, la cifra
publicada baja al importe realmente verificable y el histórico se muestra como referencia
etiquetada. Para que el importe histórico cuente, la organización debe cargarlo como
donaciones registradas (procedimiento documentado, sin doble conteo).

---

## 3. Bloqueos que requieren aprobación específica

| # | Bloqueo | Por qué necesita aprobación | Propuesta |
|---|---|---|---|
| B-1 | **Migración 010 sin aplicar** (`campaign_movements` de `ON DELETE CASCADE` a `RESTRICT`) | Es una alteración de restricción sobre la base de producción; el propio archivo `docs/migraciones/010_low_risk.sql` la dejó fuera de `migrate.ts` a propósito. Hoy la única defensa del libro contable es el conteo en la aplicación. | Añadirla a `migrate.ts` (idempotente: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`) tras confirmar que no hay movimientos huérfanos. Se puede ensayar antes en la réplica local. |
| B-2 | **Claves foráneas ausentes (DB-04)** en `donations`, `campaign_expenses`, `campaign_evidence`, `campaign_images`, `campaign_updates`, `community_reports`, `campaign_leftovers` | Añadir FKs falla si ya existen huérfanos; hay que limpiarlos o dejarlos documentados. | Migración aditiva en dos pasos: informe de huérfanos → FK con `ON DELETE RESTRICT` (o `SET NULL` en las opcionales). Requiere decisión sobre los datos existentes. |
| B-3 | **Certificados con QR (Fase 5.2)** | Define datos personales publicados: nombre autorizado, tipo de reconocimiento, vigencia y revocación. | Propuesta: tabla `certificates` (identificador público aleatorio, nombre autorizado, campaña/evento, tipo, fecha, estado, motivo de revocación) + página pública `/certificados/:code` con datos mínimos + QR generado en el cliente (sin servicio externo). Pendiente: confirmar tipos de certificado y si el monto se incluye (recomendado: **no**). |
| B-4 | **WhatsApp Business automatizado (Fase 7)** | Requiere credenciales y proveedor oficial (Cloud API) y consentimiento de contacto. | Implementar primero lo que no depende de credenciales: enlaces y mensajes configurables desde el panel, contacto por campaña/tipo. Dejar la mensajería automatizada tras la decisión y las credenciales. |
| B-5 | **Artefactos de migración obsoletos** (`lib/db/drizzle/0000_*.sql`, `0001_*.sql`) | Son DDL generado que **nunca** se aplica y contradice a `migrate.ts` (el esquema ya declara `RESTRICT`): un `drizzle-kit push` accidental reintroduciría el CASCADE. | Eliminarlos del repositorio (o moverlos a `docs/legacy/`) y documentar que la única fuente es `lib/db/src/migrate.ts`. Requiere confirmación por ser borrado de archivos. |
| B-6 | **Insignias/embajadores (Fase 5.3/5.4)** | Definición de programa (niveles, vigencia, qué se publica). | Requiere decisión de negocio antes de modelar. |

---

## 4. Plan de ejecución restante (orden de prioridad)

1. **V7-2 · Fase 7 (parte sin credenciales):** WhatsApp y contactos configurables desde el panel (allowlist pública de `org_whatsapp`, mensajes predefinidos, contacto por campaña) — elimina números fijos del código.
2. **V7-3 · Fase 1.4:** herramienta administrativa de verificación del libro: informe de integridad (cadena rota, donaciones confirmadas sin asiento, movimientos sin origen), sin modificar registros.
3. **V7-4 · Fase 1.2/1.3:** cerrar SEC-01/SEC-03/SEC-08 y API-06 (errores de infraestructura dejan de reportarse como validación).
4. **V7-5 · Fase 6:** filtros del dashboard (campaña, estado, fechas) y enlaces de cada tarjeta a su detalle.
5. **V7-6 · Fase 5.1:** consentimiento explícito y nombre colectivo del donante (con separación estricta público/privado).
6. **V7-7 · Fase 2.4/9:** pruebas extremo a extremo con PostgreSQL real (migraciones, borrado 204, 409 por dependencias) en el sandbox.
7. **V7-8 · Fase 10:** `AUDITORIA_FINAL_V7.md` + `CHECKLIST_FUNCIONAL_V7.md`.
8. **Bloqueados:** B-1 a B-6 (§3), a la espera de aprobación.

---

## 5. Incremento V7-2 — Contacto por WhatsApp configurable (Fase 7, parte sin credenciales) · CERRADO

### 5.1 Defecto corregido

El número de contacto estaba **fijo en el código**: `FloatingWhatsApp.tsx` y `how-to-help.tsx`
publicaban `51921615737` y el catálogo de bienes abría `51999999999`, un **número de
ejemplo** con el comentario «Reemplazar con el número real de WhatsApp», en producción. La
clave `org_whatsapp` existía en `settings` (con otro valor de ejemplo, `51987654321`) pero
**no** estaba en la allowlist pública, así que el sitio no podía leerla.

### 5.2 Qué se implementó

- **Migración 019 (aditiva e idempotente):** crea en `settings` el número y los cuatro
  mensajes predefinidos (contacto general, donaciones, voluntariado, auspicios). Solo
  escribe si `settings` **ya** tiene contenido (despliegue existente); en una base nueva no
  escribe nada para no romper el seed, que solo carga si la tabla está vacía.
  `ON CONFLICT DO NOTHING`: no sobrescribe lo que el administrador ya haya editado.
- **Allowlist pública:** `org_whatsapp` y los cuatro mensajes pasan a ser públicos (se
  publican en enlaces `wa.me`); `org_phone`, `org_email`, `org_address` y las cuentas
  bancarias **siguen privados**, y hay una prueba que lo fija.
- **Lógica pura** (`src/lib/whatsapp.ts`, con 10 pruebas): normaliza el número (solo
  dígitos, 8–15, acepta `+`, espacios y guiones), lo formatea para mostrar
  (`+51 921 615 737`), construye el enlace `wa.me` con el mensaje codificado y resuelve el
  contacto por propósito (el mensaje configurado gana; si está vacío se usa el texto del
  idioma activo).
- **Interfaz:** el botón flotante, «cómo ayudar» y el catálogo de bienes leen la
  configuración. **Si no hay número configurado no se inventa uno:** el botón flotante y el
  enlace no se muestran, y en el catálogo los botones de patrocinio llevan a la página de
  contacto en lugar de abrir un chat inexistente.
- **Panel:** las cinco claves se editan en «Datos de Contacto» (el panel agrupa por `group`,
  así que aparecen sin tocar la interfaz) y se sirven al público al guardarlas.

### 5.3 Archivos

```
lib/db/src/migrate.ts                                    migración 019 (aditiva, idempotente)
artifacts/api-server/src/lib/public-settings.ts          +5 claves públicas de WhatsApp
artifacts/api-server/src/lib/seed.ts                     número real + claves de mensajes
artifacts/api-server/tests/public-settings.test.mjs      contrato de la allowlist actualizado
artifacts/red-solidaria/src/lib/whatsapp.ts              normalización, formato, enlace y resolución
artifacts/red-solidaria/tests/whatsapp.test.mjs          +10 pruebas
artifacts/red-solidaria/build-tests.mjs                  entry point del nuevo módulo
artifacts/red-solidaria/src/components/layout/FloatingWhatsApp.tsx   configuración, no constante
artifacts/red-solidaria/src/pages/how-to-help.tsx        enlace desde la configuración
artifacts/red-solidaria/src/pages/stock-catalog.tsx      adiós al número de ejemplo
artifacts/red-solidaria/src/lib/i18n/locales/es.ts|en.ts 3 mensajes por propósito
```

### 5.4 Verificación

- `api-server`: **296/296** (+1: contrato de la allowlist) · typecheck **0**.
- `red-solidaria`: **143/143** node:test (+10) + **23/23** vitest · typecheck **0**.
- La migración 019 no modifica ni sobrescribe datos existentes.

### 5.5 Pendiente de este bloque

La **mensajería automatizada** (Cloud API oficial, plantillas y consentimiento de contacto)
queda en el bloqueo **B-4**: necesita credenciales y proveedor aprobado. Lo implementado no
depende de ellas y no bloquea el despliegue.

---

## 6. Incremento V7-3 — Informe de integridad del libro contable (Fase 1.4) · CERRADO

### 6.1 Qué faltaba

La cadena de hashes ya era verificable (pública: `/campaigns/:id/movements/verify` y
`/ledger/root`, con anclaje), pero **una cadena íntegra puede estar incompleta**: los datos
históricos cargados por seed dejaron donaciones aprobadas **sin asiento** (hallazgo DB-09),
y entonces la verificación dice «íntegra» mientras el libro no cuenta toda la historia.
Tampoco existía ninguna herramienta administrativa que produjera un informe.

### 6.2 Qué se implementó

- **Lógica pura** (`src/lib/ledger-audit.ts`, 11 pruebas): coteja el libro con sus orígenes y
  devuelve un informe con cinco bloques — cadena (verificada / rota en el asiento N / raíz),
  **donaciones confirmadas sin asiento**, **asientos sin origen** (incluye tipos de origen
  desconocidos), **importes descuadrados** y **asientos en otra campaña** que su origen.
  `healthy` solo es `true` si la cadena verifica **y** no hay ningún hallazgo.
  Una donación **pendiente** sin asiento no es un hallazgo: solo se registra al aprobarse.
- **Ruta administrativa** `GET /admin/ledger/audit` (`requireAdmin` + rate limit), de **solo
  lectura**: no escribe ni corrige nada, y devuelve además qué se auditó (número de asientos,
  donaciones confirmadas y gastos) con la fecha del informe, para que un tercero pueda
  contrastarlo.
- **Panel**: nueva página «Libro contable» (`/admin/libro`, en el menú solo para
  administradores, no para moderadores) con el estado global, la cadena, los contadores y una
  tabla por tipo de hallazgo, con estados vacíos explícitos y botón de actualización. Cierra
  con la regla de corrección: el libro es append-only y cualquier arreglo es un **asiento
  compensatorio autorizado y trazable**, nunca una edición.

### 6.3 Archivos

```
artifacts/api-server/src/lib/ledger-audit.ts              informe puro (5 bloques)
artifacts/api-server/tests/ledger-audit.test.mjs          +11 pruebas
artifacts/api-server/src/routes/ledger-audit.ts           GET /admin/ledger/audit (solo lectura)
artifacts/api-server/tests/ledger-audit-auth.test.mjs     +2 pruebas de autorización (401 / pasa el gate)
artifacts/api-server/src/routes/index.ts                  registro del router
artifacts/api-server/build-tests.mjs                      entry points (lib + router)
artifacts/red-solidaria/src/pages/admin/ledger-audit.tsx  página del informe
artifacts/red-solidaria/src/App.tsx                       ruta /admin/libro
artifacts/red-solidaria/src/pages/admin/layout.tsx        ítem de menú (solo administradores)
```

### 6.4 Verificación

- `api-server`: **309/309** (+13) · typecheck **0**.
- `red-solidaria`: **143/143** node:test + **23/23** vitest · typecheck **0**.
- Build de producción **OK** · migraciones: ninguna nueva (el informe no necesita esquema).
- Cobertura de pruebas: cadena rota, DB-09, donación pendiente (no es hallazgo), asiento sin
  origen, tipo de origen desconocido, importes descuadrados, equivalencia `100` vs `"100.00"`
  y `0.1+0.2` vs `0.3`, asiento en otra campaña y caso vacío.

### 6.5 Nota operativa

El informe lee el libro completo (es su naturaleza). Si el libro creciera mucho, la consulta
se puede paginar por rango de `id` sin cambiar el contrato del informe; se documenta como
mejora futura, no como bloqueo.

---

## 7. Incremento V7-4 — Seguridad e integridad de las operaciones (Fase 1.2 y 1.3) · CERRADO

### 7.1 SEC-03 — Denegación de servicio sobre la cuenta del administrador (corregido)

**El defecto:** el contador de intentos fallidos de 2FA se indexaba **solo por `userId`**, y
ese `userId` viaja en el cuerpo de `POST /admin/2fa/login`. Cualquiera podía enviar 5 códigos
inválidos para el superadmin (`userId: 1`) desde cualquier parte y dejar esa cuenta **sin poder
entrar durante 15 minutos**, repitiéndolo indefinidamente. El check se hacía antes de tocar la
base, así que ni siquiera hacía falta que el usuario existiera para intentarlo.

**La corrección:** la clave del contador pasa a ser **origen + cuenta** (`lockoutKey(ip, userId)`),
de modo que el bloqueo solo afecta al par origen+cuenta: frena la fuerza bruta sin dejar fuera
al administrador legítimo. La rotación de IP sigue cubierta por el rate limit por IP del login
(`loginLimiter`). Además:

- el escape hatch de superadmin (`/admin/users/:id/2fa/reset`) limpia la cuenta en **todos**
  los orígenes (`clearFailedAttemptsForUser`), que es lo que se espera de un desbloqueo;
- desactivar 2FA con código válido también limpia todos los orígenes de esa cuenta;
- el módulo documenta explícitamente por qué la clave es compuesta (para que nadie la
  "simplifique" de vuelta a `userId`).

### 7.2 SEC-01 — Cookie de sesión (ya estaba correcta, verificado)

`app.ts` ya declara `app.set("trust proxy", 1)` (Render termina TLS en un proxy) y
`cookie.secure` en producción, con `httpOnly`, `sameSite: "lax"`, `maxAge` de 24 h y
`rolling: true`. **No requería cambio**: se verifica y se documenta en lugar de "arreglar" algo
que ya estaba bien.

### 7.3 SEC-08 — Gate de administración (verificado por barrido)

El diseño es un **único punto de control**: `router.use("/admin", requireAdmin,
adminActionLimiter)` montado antes de todos los routers. En lugar de repartir gates redundantes
por router (que no aportan seguridad adicional y sí riesgo de incoherencia), se añade una
**prueba de barrido** que monta el router real y comprueba que:

- 22 rutas `GET /admin/*` y 6 escrituras (`POST`, `PUT`, `PATCH`, `DELETE`) responden **401**
  sin sesión;
- las rutas públicas (`/health`, `/campaigns`, `/settings`, `/stats`) **no** están bloqueadas;
- `/admin/login` **no** es interceptado por el gate (si alguien montara un router antes del
  gate, o añadiera una ruta administrativa en un router público, el barrido lo detecta).

### 7.4 API-06 — Fallos de infraestructura disfrazados de error de validación (parcial)

`POST /donations` usaba `donationInputSchema.parse()` dentro del `try` y el `catch` devolvía
**400 «Invalid donation data»** para *cualquier* fallo: un dato inválido y una base de datos
caída eran indistinguibles, la interfaz decía «datos inválidos» y el equipo no veía ninguna
señal de 500. Ahora la validación se resuelve con `safeParse` **antes** del `try` (patrón del
resto del API) y el `catch` responde **500** con un mensaje accionable.

El mismo patrón existe en otros routers; se corrigió la ruta financiera (la más sensible) y el
resto queda **documentado como pendiente** en el checklist, sin marcar como hecho.

### 7.5 Archivos

```
artifacts/api-server/src/lib/two-factor-lockout.ts       clave compuesta + limpieza por cuenta
artifacts/api-server/src/routes/admin-2fa.ts             check, registro, limpieza y escape hatch
artifacts/api-server/src/routes/donations.ts             safeParse + 400 explícito, catch → 500
artifacts/api-server/tests/two-factor-lockout.test.mjs   11 pruebas (+5: SEC-03)
artifacts/api-server/tests/admin-2fa.test.mjs            registro del bloqueo con la clave compuesta
artifacts/api-server/tests/admin-gate-sweep.test.mjs     barrido del gate (nuevo, 4 pruebas)
artifacts/api-server/build-tests.mjs                     entry point del router raíz
```

### 7.6 Verificación

- `api-server`: **318/318** (+9) · typecheck **0**.
- `red-solidaria`: **143/143** + **23/23** (sin cambios: control de regresión).
- Casos nuevos cubiertos: dos orígenes no comparten bloqueo, el escape hatch limpia todos los
  orígenes, la clave tolera IP ausente, y el barrido de rutas admin públicas/privadas.

### 7.7 Pendiente de este bloque

- **API-06 en el resto de routers** (mismo patrón `catch → 400`), sin marcar como hecho.
- **SEC-02/04** (rate limit y lockout en memoria): no se comparten entre instancias; mover a
  PostgreSQL/Redis si el despliegue escala horizontalmente.
- **FE-03** (gate del panel por rol en el cliente): el API ya bloquea los datos, pero la
  interfaz no redirige a un usuario autenticado sin rol admin.

---

## 8. Incremento V7-5 — Filtros del panel administrativo (Fase 6) · CERRADO

### 8.1 Qué faltaba

El dashboard mostraba **siempre el acumulado global**: no se podía ver «el dinero de esta
campaña» ni «lo recaudado en este trimestre» sin leer el total del sistema. Además, dos
tarjetas financieras no llevaban a ningún detalle.

### 8.2 Qué se implementó

- `GET /admin/dashboard` acepta `campaignId`, `status`, `from` y `to`, normalizados por una
  función pura (`lib/dashboard-filters.ts`, 11 pruebas): identificador positivo, estado de
  campaña conocido, fechas ISO válidas y rango no invertido. Un filtro inválido devuelve
  **400 con el motivo**, nunca se ignora en silencio.
- **Semántica explícita** (un filtro ambiguo produce cifras que nadie puede conciliar):
  filtrar por campaña o por estado deja fuera el **fondo general** (no pertenece a ninguna
  campaña); el rango de fechas aplica a donaciones y a gastos (`campaign_expenses.date` es
  texto ISO, así que la comparación lexicográfica equivale a la cronológica).
- **El importe histórico no se cuenta con fechas activas**: es un acumulado que no se puede
  atribuir a un periodo; con rango se publica solo la recaudación verificada del rango.
- Todas las cifras de campaña se recalculan con el **mismo** filtro en el servidor:
  contadores de campañas, recaudación conciliada, gastos, evolución mensual, top de campañas
  y gastos por categoría. Los indicadores que no dependen de campaña (reportes, adopciones,
  voluntarios, mascotas) siguen globales y **el panel lo dice en pantalla**.
- La respuesta devuelve los filtros aplicados con una descripción legible
  (`filters.description`), para que un tercero sepa sobre qué se calcularon las cifras.
- **Panel**: barra de filtros (campaña, estado, desde, hasta, limpiar) con la descripción de
  lo aplicado; las 8 tarjetas del KPI navegan a su información (las financieras a
  `/admin/libro`).

**Nota sobre «evento»:** en este sistema un evento solidario (ChocoFest) **es** una campaña,
así que el filtro de campaña lo cubre sin duplicar el concepto.

### 8.3 Archivos

```
artifacts/api-server/src/lib/dashboard-filters.ts       normalización y descripción de filtros
artifacts/api-server/tests/dashboard-filters.test.mjs   11 pruebas
artifacts/api-server/src/routes/dashboard.ts            filtros aplicados a todas las cifras de campaña
artifacts/api-server/build-tests.mjs                    entry point del módulo
artifacts/red-solidaria/src/pages/admin/dashboard.tsx   barra de filtros + navegación de tarjetas
```

### 8.4 Verificación

- `api-server`: **329/329** (+11) · typecheck **0**.
- `red-solidaria`: **143/143** + **23/23** · typecheck **0**.
- Build de producción **OK**.
- Casos cubiertos: sin filtros, parámetros desconocidos, `campaignId` inválido, estado
  desconocido, fechas inválidas, rango invertido, un solo extremo del rango, parámetros
  repetidos y descripción legible de lo aplicado.

---

## 9. Incremento V7-7 — Verificación E2E con PostgreSQL real (Fase 2.4 y 9) · CERRADO

### 9.1 Qué faltaba

Toda la verificación del programa se hacía con funciones puras y pruebas de autorización
contra un `DATABASE_URL` ficticio. **Nadie había ejecutado el sistema contra una base real**,
así que ni las migraciones ni los flujos financieros de punta a punta estaban comprobados.

### 9.2 Arnés implementado

`artifacts/api-server/tests/e2e/run-e2e.sh` (todo en un solo comando, porque el entorno mata
los procesos en segundo plano al terminar cada comando):

1. crea un clúster **PostgreSQL 17.7** temporal (`initdb` + `pg_ctl` en un directorio de trabajo);
2. aplica el schema base con `drizzle-kit push --force`;
3. arranca el **API compilado**, de modo que el migrador embebido corre las migraciones;
4. comprueba el esquema resultante con `psql`;
5. ejecuta el flujo funcional completo por HTTP (`flow.mjs`, 38 comprobaciones);
6. reinicia el API para demostrar que las migraciones son **idempotentes**;
7. para PostgreSQL, mata el API y borra el directorio temporal.

**No toca ninguna base real**: construye su propia `DATABASE_URL` y borra todo al terminar.

### 9.3 Resultado de la ejecución completa

| Comprobación | Resultado |
|---|---|
| Migraciones aplicadas | **19** (`001`–`019`) y **no se duplican** en el segundo arranque |
| `donations.collaboration_type` | default `'dinero'::text` ✔ (migración 018 sobre base real) |
| Claves de WhatsApp en `settings` | **5** ✔ (migración 019 + seed) |
| FK del libro en una base creada con el esquema actual | `RESTRICT` ✔ (ver matiz en 9.5) |
| Flujo funcional por HTTP | **38/38 en verde** |
| Informe de integridad sobre datos reales | cadena **íntegra**; detecta **111 donaciones confirmadas sin asiento** (DB-09) y **1 asiento** (el del propio E2E) |

Lo verificado de punta a punta: sesión y gate de rutas admin en rutas públicas · crear
campaña como borrador · el borrador **no** es público (404) · publicar · donación pública de
dinero · donación en especie sin monto ni método · rechazo de donación a campaña inexistente ·
**comprobante obligatorio solo para dinero digital** (aprobar sin comprobante → 400; con
comprobante → 200) · aprobar una donación en especie sin pago → 200 · **un asiento por dinero
aprobado y ninguno por una especie con valor 0** · la cadena de hashes verifica · la ficha
pública y el **panel de transparencia publican la MISMA cifra** (S/ 80, sin la especie) con
desglose verificado/histórico y fecha de actualización · **borrado bloqueado (409)** con motivo
accionable · archivar → fuera del listado público pero accesible por URL directa (política
documentada) · **una campaña archivada no acepta donaciones (400)** · restaurar · informe de
integridad · filtros del panel por campaña contra datos reales · filtro inválido → 400 con el
motivo.

### 9.4 Hallazgo nuevo, corregido en este incremento (API-07)

El E2E descubrió que en el router del libro `Number(req.params.id)` se usaba **sin validar**:
un identificador no numérico llegaba a la consulta como `NaN` y PostgreSQL devolvía **500**
en lugar de un error de cliente. Corregido con un único `router.param("id", …)` que valida
todas las rutas del router (400 «Identificador inválido») y con la comprobación
correspondiente en el flujo E2E.

### 9.5 Matiz importante sobre el bloqueo B-1

El clúster temporal se crea con el esquema **actual** de Drizzle, que ya declara
`ON DELETE RESTRICT`, así que en una base **nueva** el libro nace protegido. El `CASCADE`
solo persiste en bases **creadas antes** del arreglo del esquema (producción). Es decir:
la migración 010 sigue siendo necesaria para producción, pero **no** para despliegues nuevos.

### 9.6 Cómo se ejecuta

```bash
bash artifacts/api-server/tests/e2e/run-e2e.sh
```

Requiere los binarios de PostgreSQL documentados en `docs/ROADMAP.md`. El script imprime
cada comprobación con `ok`/`FAIL` y termina con `E2E COMPLETO: OK` o el número de fallos.

---

## 10. Incremento V7-8 — Rendición de resultados del evento (Fase 4.3) · CERRADO

### 10.1 Qué faltaba

El evento ya publicaba **dinero** (panel de transparencia), **bienes** (inventario con flujo
recibido/entregado), **presupuesto**, **programa** y **evidencias**. Lo que no existía era el
**informe de rendición** que lo reúne, ni los datos que solo la organización puede declarar:
beneficiarios atendidos (dato agregado), actividades **realizadas**, resumen de la rendición y
destino posterior de los recursos sobrantes.

### 10.2 Qué se implementó

- **Lógica pura** (`src/lib/event-results.ts`, 10 pruebas): `assembleEventResults` reúne el
  informe con **cifras reales** y **datos declarados**:
  - dinero: ingresos, gastos y saldo conciliados (los de la transparencia);
  - bienes: recibidos, entregados y sobrantes con `resolveStock`, **la misma regla** que el
    inventario público (una fila antigua sin flujo cuenta como recibida y no entregada);
  - actividades: planificadas frente a realizadas, reutilizando `parseProgram` (mismo formato
    que el programa, una actividad por línea);
  - beneficiarios: entero declarado, o `null` si no se declaró (nunca un cero inventado);
  - resumen y destino de los sobrantes;
  - `hasAnything`: la sección no se muestra si no hay nada que rendir.
  **Los bienes nunca se suman al dinero**: son rendiciones separadas y así se publican.
- **4 claves públicas nuevas** (allowlist) + seed + **migración 020**, con el mismo patrón
  idempotente de la 019 (solo escribe si `settings` ya tiene contenido, para no romper el seed
  de una base nueva).
- **Página pública del evento**: la sección «Resultados y cierre» incorpora el informe
  (dinero, bienes, beneficiarios, actividades realizadas con el conteo frente al programa,
  resumen y destino de sobrantes) y muestra **«aún no declarado por la organización»** donde no
  hay dato, en lugar de un cero que parecería real.
- **Editable desde el panel**: las claves viven en el grupo `chocofest`, así que aparecen en la
  configuración con sus etiquetas sin tocar la interfaz del panel.

### 10.3 Archivos

```
artifacts/red-solidaria/src/lib/event-results.ts            informe puro (cifras + declarado)
artifacts/red-solidaria/tests/event-results.test.mjs        10 pruebas
artifacts/red-solidaria/src/pages/chocofest-2026.tsx        informe dentro de «Resultados y cierre»
artifacts/red-solidaria/src/lib/i18n/locales/es.ts|en.ts     13 etiquetas nuevas (es/en)
artifacts/red-solidaria/build-tests.mjs                     entry point del módulo
artifacts/api-server/src/lib/public-settings.ts             +4 claves públicas
artifacts/api-server/src/lib/seed.ts                        claves sembradas (grupo chocofest)
artifacts/api-server/tests/public-settings.test.mjs         contrato de la allowlist
lib/db/src/migrate.ts                                       migración 020 (aditiva, idempotente)
artifacts/api-server/tests/e2e/run-e2e.sh                   verifica las 4 claves en base real
```

### 10.4 Verificación

- `red-solidaria`: **153/153** node:test (+10) + **23/23** vitest · typecheck **0**.
- `api-server`: **329/329** · typecheck **0**.
- **E2E contra PostgreSQL real: `E2E COMPLETO: OK`** con **20 migraciones** aplicadas y
  **4 claves** de rendición de resultados presentes en la base tras el seed.
- Casos cubiertos: flujo de bienes (con y sin flujo registrado, nunca por debajo de cero),
  beneficiarios (declarado, con separadores de miles, inválido → `null`), informe completo,
  informe vacío (`hasAnything: false`), saldo derivado y dinero sin transparencia cargada.

### 10.5 Nota de diseño

No se creó ninguna tabla nueva: el módulo reutiliza el patrón de configuración del evento y los
datos que ya existen (transparencia, inventario, programa). Así el informe no puede
desincronizarse de las cifras que el sitio ya publica, y el módulo es reutilizable para
futuros eventos cambiando las claves.
