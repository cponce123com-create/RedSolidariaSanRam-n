# AUDITORÍA FINAL V7 — Red Solidaria San Ramón

**Fecha:** 14 de octubre de 2026
**Rama:** `feat/implementacion-integral-2026` (HEAD: `eea170c`)
**Punto de partida:** V6 (`c2de0ad`) + incrementos 3A–4A
**Método:** inspección directa del código con evidencia `archivo:línea`, ejecución real de
`pnpm audit`, typecheck, suites y build de producción. Ninguna operación destructiva sobre
datos y ningún dato de producción modificado.

> Este informe declara **solo lo verificado**. Lo que no se probó se dice explícitamente.
> El registro incremental del programa está en `docs/PROGRAMA_V7.md`.

---

## 1. Resumen ejecutivo

El sistema **no necesitaba reconstrucción**: la persistencia, la autorización, el libro
contable encadenado, el ciclo de vida de campañas, la transparencia pública, ChocoFest y el
módulo de donantes ya funcionaban y estaban probados. Lo que faltaba era **coherencia
financiera**, **herramientas de auditoría** y **eliminar datos ficticios del código**.

En este programa se corrigieron tres defectos reales de fondo y se documentó con precisión
todo lo que queda bloqueado por decisiones de negocio o credenciales externas:

1. **Recaudación no conciliable** (Fase 3.1): el sitio publicaba `max(importe manual, suma de
   donaciones)` y el dashboard mezclaba ambas fuentes. Sustituido por una regla única,
   explícita y auditable.
2. **Libro contable sin herramienta de auditoría** (Fase 1.4): la cadena verificaba pero
   nadie podía ver que hay donaciones confirmadas sin asiento (DB-09). Ahora hay informe
   administrativo de solo lectura.
3. **Datos ficticios en producción** (Fase 7): el catálogo de bienes abría el número de
   WhatsApp de ejemplo `51999999999` («Reemplazar con el número real») y el número real
   estaba fijo en el código. Ahora todo es configuración editable.

**Estado de verificación:** `api-server` **309/309**, `red-solidaria` **143/143** node:test +
**23/23** vitest, typecheck **0** en libs/API/frontend/scripts y **build de producción OK**.
`pnpm audit --prod` → **0 vulnerabilidades**.

---

## 2. Problemas originales (los que motivaron el programa)

| # | Problema reportado | Diagnóstico real | Estado |
|---|---|---|---|
| P-1 | «No puedo eliminar la campaña» | Regla de ciclo de vida demasiado rígida: un borrador con cualquier fila dependiente no podía eliminarse **ni** archivarse (callejón sin salida). Corregido en la Fase 1 previa del plan (`draft → archived`). | **CORREGIDO** (verificado con pruebas de ciclo de vida y de motivo de bloqueo) |
| P-2 | «El panel muestra una cosa y la web otra» | La invalidación de caché no alcanzaba las claves reales del cliente generado (`["/api/campaigns/5"]`) y el navegador cacheaba GET públicos con sesión. Corregido (invalidación por entidad + `no-store` con sesión). | **CORREGIDO** |
| P-3 | Cifras financieras no cuadraban entre ficha, transparencia y dashboard | `Math.max` como sustituto de conciliación; la transparencia solo sumaba donaciones; el dashboard ordenaba por la columna manual. | **CORREGIDO en V7-1** |
| P-4 | Número de WhatsApp de ejemplo en producción | `51999999999` hardcodeado en el catálogo de bienes. | **CORREGIDO en V7-2** |

---

## 3. Hallazgos adicionales (no reportados por el usuario)

- **DB-09 (integridad):** las donaciones históricas cargadas por seed quedaron **aprobadas sin
  asiento** en el libro. La verificación de cadena devolvía «íntegra», que es correcto para la
  cadena pero no para el libro. Detectable ahora con el informe de V7-3.
- **DB-02 / migración 010:** ✅ **RESUELTO** — aplicada en **producción el 2026-10-13** con
  respaldo previo y autorización explícita, y registrada en `drizzle_migrations`. El esquema
  Drizzle ya declaraba `ON DELETE RESTRICT`; ahora la base también.
- **DB-03 / artefactos de migración divergentes:** ✅ **RESUELTO en V7-16** — los artefactos
  `lib/db/drizzle/0000_*.sql`, `0001_*.sql` y su carpeta `meta/` se eliminaron del repositorio
  (nada los referenciaba: ni scripts, ni CI, ni build) y `drizzle.config.ts` documenta que la
  única fuente de verdad es `lib/db/src/migrate.ts`. **Ya no hay dos esquemas en conflicto.**
- **DB-04 / claves foráneas:** ✅ **RESUELTO en V7-15** — 11 claves `NOT VALID` (no validan los
  huérfanos históricos y sí todas las escrituras nuevas) con `ON DELETE` elegido caso por caso;
  verificado contra base real (rechaza `campaign_id=999999`) y el borrado de una mascota con
  solicitudes responde **409**.

- **V7-17 / datos históricos de 2024:** el bloque de donaciones de
  `artifacts/api-server/src/lib/chocolatada-2024-data.ts` es una **copia** del de
  `chocofest-2025-data.ts`: los donantes, los importes y el **total (S/. 2,818.5)** coinciden uno
  a uno, los comentarios de fecha de ese fichero dicen `── 4/12/2025 ──` y su helper `iso` usa
  `Date.UTC(2025, 11, day)`. **Impacto:** la campaña «Chocolatada Navideña 2024» publica las
  donaciones de 2025 y con fechas de 2025; los gastos, las evidencias y las imágenes **sí** son
  propios de 2024 (verificado con una prueba), así que el problema está acotado a las donaciones.
  **Encontrado al cerrar B-5**, verificando una duda que la auditoría había dejado abierta (su
  refutación inicial usó un `grep` sobre literales que no existen en esos ficheros). **No se han
  tocado los datos:** no hay hoja fuente de 2024 en el repositorio, este proyecto no inventa
  datos históricos y sustituir el bloque alteraría cifras publicadas, lo que es una decisión de
  la organización. **Qué sí se ha hecho:** una advertencia al principio del bloque, una prueba
  `TODO` que compara las huellas de ambos datasets y deja el problema visible en cada ejecución
  sin romper la suite (`# pass 330 · # fail 0 · # todo 1`), y una segunda prueba que confirma
  que los gastos **sí** difieren. **Para cerrarlo:** el informe real de la Chocolatada 2024;
  entonces la prueba `TODO` pasa a ser una comprobación normal.
- **API-06:** el patrón `catch → 400 validation_error` enmascara fallos de infraestructura
  como si fueran errores del cliente (dificulta el diagnóstico). **Pendiente (V7-4).**
- **SEC-01:** la cookie de sesión usa `secure` solo con `NODE_ENV==='production'`; tras un
  proxy conviene además `trust proxy` explícito. **Pendiente (V7-4).**
- **SEC-03:** el lockout de 2FA se indexa por `userId`, lo que permite a un atacante dejar
  fuera a un administrador concreto (DoS de cuenta). **Pendiente (V7-4).**
- **SEC-08:** varias rutas admin dependen del gate global de `/admin` en lugar de declarar su
  propio `requireAdmin` (defensa en profundidad). **Pendiente (V7-4).**
- **FE-03:** el gate del panel en el cliente solo redirige ante 401, no ante rol insuficiente:
  un usuario autenticado sin rol admin puede ver la estructura del panel (los datos los
  bloquea el API). **Pendiente (V7-4).**
- **FE-04 / FE-09 / FE-10:** estados de carga/vacío/error inconsistentes, `SEO` usado en 5
  páginas y `zod` 3 en el cliente frente a `zod/v4` en `lib/db`. **Pendiente (Fase 8).**

---

## 4. Cambios implementados en este programa

### 4.1 V7-1 — Recaudación conciliable (Fase 3.1 y 3.2)

- Nueva lógica pura `src/lib/funding.ts`: `campaignFunding(histórico, verificado)` →
  `verifiedRaised`, `historicalRaised`, `historicalCounted`, `reconciledRaised`, más
  `availableBalance` y `roundMoney`. **Nunca el máximo de dos cifras.**
- `formatCampaign` deja de usar `Math.max` y publica el desglose; el panel de transparencia
  publica **la misma cifra** que la ficha (antes solo sumaba donaciones: una campaña con
  recaudación histórica mostraba S/ 0 en transparencia y su importe en la ficha) e incluye la
  **fecha de última actualización**.
- El dashboard calcula el total recaudado y el top de campañas con la misma regla (antes el
  total salía de las donaciones y el ranking de la columna manual).
- La interfaz explica la cifra: si el histórico cuenta, lo dice; si solo es referencia, dice
  por qué no se suma.

### 4.2 V7-2 — Contacto por WhatsApp configurable (Fase 7, parte sin credenciales)

- Migración **019** (aditiva e idempotente): número y cuatro mensajes predefinidos en
  `settings`, con el número que el sitio publica hoy y mensajes vacíos (la interfaz usa el
  texto del idioma). Solo escribe si `settings` ya tiene contenido: no rompe el seed de una
  base nueva y no sobrescribe configuración existente.
- Allowlist pública ampliada (el número se publica en enlaces `wa.me`); el resto del contacto
  (`org_phone`, `org_email`, `org_address`, cuentas bancarias) **sigue privado**, con prueba.
- Lógica pura `src/lib/whatsapp.ts`: normalización (solo dígitos, 8–15, acepta `+`, espacios y
  guiones), formato para mostrar, construcción del enlace y resolución por propósito.
- El botón flotante, «cómo ayudar» y el catálogo de bienes leen la configuración. **Sin número
  configurado no se inventa uno**: no se muestra el botón/enlace y el catálogo lleva a la
  página de contacto en lugar de abrir un chat inexistente.

### 4.3 V7-3 — Informe de integridad del libro contable (Fase 1.4)

- Lógica pura `src/lib/ledger-audit.ts`: cadena, donaciones confirmadas **sin asiento**,
  asientos **sin origen** (incluye tipos desconocidos), **importes descuadrados** y asientos
  **en otra campaña** que su origen. `healthy` exige cadena íntegra **y** cero hallazgos.
- Ruta `GET /admin/ledger/audit` (solo lectura, `requireAdmin` + rate limit) con el detalle de
  lo auditado y la fecha del informe.
- Página «Libro contable» (`/admin/libro`) en el panel, visible solo para administradores.

---

## 5. Archivos modificados y creados

**Nuevos (lógica y pruebas)**
```
artifacts/api-server/src/lib/funding.ts
artifacts/api-server/src/lib/ledger-audit.ts
artifacts/api-server/src/routes/ledger-audit.ts
artifacts/api-server/tests/funding.test.mjs
artifacts/api-server/tests/ledger-audit.test.mjs
artifacts/api-server/tests/ledger-audit-auth.test.mjs
artifacts/red-solidaria/src/lib/whatsapp.ts
artifacts/red-solidaria/src/pages/admin/ledger-audit.tsx
artifacts/red-solidaria/tests/whatsapp.test.mjs
docs/PROGRAMA_V7.md
docs/AUDITORIA_FINAL_V7.md
docs/CHECKLIST_FUNCIONAL_V7.md
```
**Modificados (relevantes)**
```
lib/db/src/migrate.ts                                    migración 019 (+ 018 del 4A)
lib/api-spec/openapi.yaml                                Campaign: verifiedRaised/historicalRaised/historicalCounted
artifacts/api-server/src/routes/campaigns.ts             formatCampaign conciliado
artifacts/api-server/src/routes/campaign-transparency.ts misma cifra que la ficha + updatedAt
artifacts/api-server/src/routes/dashboard.ts             total y top conciliados
artifacts/api-server/src/routes/index.ts                 registro del router del informe
artifacts/api-server/src/lib/public-settings.ts          allowlist pública de WhatsApp
artifacts/api-server/src/lib/seed.ts                     número real + claves de mensajes
artifacts/api-server/tests/public-settings.test.mjs      contrato de la allowlist
artifacts/api-server/build-tests.mjs                     entry points nuevos
artifacts/red-solidaria/src/pages/campaign-detail.tsx    nota de conciliación
artifacts/red-solidaria/src/pages/campaign-transparency.tsx  desglose + última actualización
artifacts/red-solidaria/src/hooks/use-phase3.ts          TransparencyData ampliado
artifacts/red-solidaria/src/components/layout/FloatingWhatsApp.tsx  configuración
artifacts/red-solidaria/src/pages/how-to-help.tsx        enlace desde la configuración
artifacts/red-solidaria/src/pages/stock-catalog.tsx      adiós al número de ejemplo
artifacts/red-solidaria/src/App.tsx                      ruta /admin/libro
artifacts/red-solidaria/src/pages/admin/layout.tsx       ítem de menú
artifacts/red-solidaria/src/lib/i18n/locales/es.ts|en.ts 6 etiquetas nuevas
lib/api-client-react|api-zod/src/generated/**            cliente regenerado (orval)
```

---

## 6. Migraciones realizadas

| Migración | Contenido | Tipo | Estado |
|---|---|---|---|
| **018** | `donations.collaboration_type` (default `dinero`) + índice; normalización de tipos de donante legados; reclasificación de donaciones en especie históricas | aditiva, idempotente | en `migrate.ts` (incremento 4A) |
| **019** | Claves de WhatsApp (número + 4 mensajes) en `settings`, solo si la tabla ya tiene contenido | aditiva, idempotente | en `migrate.ts` (V7-2) |
| 010 | `campaign_movements`: `ON DELETE CASCADE → RESTRICT` + índices por campaña | alteración de restricción | **FUERA de `migrate.ts`, pendiente de autorización (B-1)** |

Ninguna migración aplicada elimina columnas, tablas ni datos. No se ejecutó nada sobre la
base de producción desde este entorno.

---

## 7. Pruebas ejecutadas

```
pnpm audit --prod                                     → 0 vulnerabilidades
pnpm audit (incluye dev)                              → 66 avisos (11 críticos), toolchain dev
pnpm run typecheck:libs                               → 0 errores
pnpm --filter @workspace/api-server run typecheck     → 0 errores
pnpm --filter @workspace/red-solidaria run typecheck  → 0 errores
pnpm --filter @workspace/api-server run test          → 309 pruebas (node:test)
pnpm --filter @workspace/red-solidaria run test       → 143 pruebas (node:test) + 23 (vitest)
pnpm -r --filter ./artifacts/** run build             → build de producción OK
```

## 8. Resultados de las pruebas

| Suite | Antes de V7 | Después | Resultado |
|---|---|---|---|
| `api-server` (node:test) | 286 | **309** | 309/309 ✅ |
| `red-solidaria` (node:test) | 133 | **143** | 143/143 ✅ |
| `red-solidaria` (vitest) | 23 | **23** | 23/23 ✅ |
| typecheck (libs/API/frontend/scripts) | 0 | **0** | ✅ |
| build de producción | OK | **OK** | ✅ |
| `pnpm audit --prod` | 0 | **0** | ✅ |

**Cobertura nueva:** 9 pruebas de conciliación de recaudación (incluye la invariante
`conciliado = verificado + histórico contado` y el caso de duplicidad), 11 del informe del
libro (cadena rota, DB-09, pendiente que no es hallazgo, asiento sin origen, tipo desconocido,
importes descuadrados, equivalencia de centimos, campaña distinta), 2 de autorización del
informe, 10 de contacto por WhatsApp y 1 del contrato de la allowlist pública.

**No se modificó ninguna prueba para ocultar errores:** la única prueba ajustada fue el
contrato de la allowlist pública (`public-settings.test.mjs`), que **debía** cambiar porque la
funcionalidad nueva publica claves nuevas; se añadió además la comprobación de que el resto
del contacto sigue privado.

---

## 9. Vulnerabilidades corregidas

| # | Vulnerabilidad | Corrección |
|---|---|---|
| V-1 | **Datos ficticios en producción**: el catálogo abría el WhatsApp de ejemplo `51999999999` | Configuración editable + ausencia de enlace si no hay número (V7-2) |
| V-2 | **Cifras financieras manipulables en su presentación**: publicar el máximo de dos fuentes permitía que un importe manual tapara las donaciones reales | Regla única de conciliación, con desglose publicado (V7-1) |
| V-3 | **Ingresos confirmados no auditables**: donaciones aprobadas sin asiento invisibles para la verificación | Informe de integridad que las detecta (V7-3) |

## 10. Vulnerabilidades pendientes

| # | Hallazgo | Severidad | Motivo por el que no se corrigió aquí |
|---|---|---|---|
| V-4 | SEC-01 cookie `secure` condicionada a `NODE_ENV` | media | Requiere decidir `trust proxy` en el despliegue; se aborda en V7-4 |
| V-5 | SEC-03 lockout 2FA por `userId` (DoS de cuenta) | media | Se aborda en V7-4 junto con SEC-02/04 (límites en memoria) |
| V-6 | SEC-08 rutas admin sin gate propio | baja | Defensa en profundidad; V7-4 |
| V-7 | API-06 `catch → 400` enmascara fallos 500 | baja | V7-4 (afecta a varias rutas; cambio transversal) |
| V-8 | DB-02 restricción `CASCADE` real en el libro | **alta** | ✅ **RESUELTO**: aplicada en producción el 2026-10-13 (registrada en `drizzle_migrations`) |
| V-9 | DB-04 claves foráneas ausentes | alta | ✅ **RESUELTO** en V7-15: migración 023, 11 claves `NOT VALID` con `ON DELETE` por caso |
| V-10 | 66 avisos de dependencias de desarrollo (11 críticos) | baja (no llegan a producción) | No se actualizan majors a ciegas; recomendación en §16 |

---

## 11. Funcionalidades completadas en este programa

- Recaudación conciliable y coherente en ficha, transparencia y dashboard (Fase 3.1/3.2).
- Fecha de última actualización del panel de transparencia (Fase 3.2).
- Contacto por WhatsApp configurable desde el panel, sin datos ficticios (Fase 7, parte 1).
- Informe administrativo de integridad del libro contable (Fase 1.4).

## 12. Funcionalidades parcialmente completadas

- **Fase 4 (ChocoFest/eventos):** 3A–3C-3b y 4A cerrados (bienes, presupuesto, programa,
  composición y cobertura de canastas, tipos de colaboración). Falta la **rendición de
  resultados del evento** (4.3) y el modelo de patrocinios.
- **Fase 5.1 (donantes):** panel, historial, tipo, anonimato, duplicados y conciliación.
  Falta **consentimiento explícito** y **nombre colectivo** de publicación.
- **Fase 5.4 (auspiciadores):** aliados con CRUD y visibilidad pública. Faltan embajadores con
  código de referencia y métricas.
- **Fase 6 (dashboard):** indicadores ya coherentes. Faltan **filtros** por campaña, estado y
  fechas, y navegación de cada tarjeta a su detalle.
- **Fase 3.3 (comprobantes):** registro, adjunto, visibilidad y conciliación. Falta historial
  de cambios del comprobante.
- **Fase 8 (frontend):** FE-03 (gate por rol), FE-04 (estados), FE-09 (SEO), FE-10 (zod).
- **Fase 9 (pruebas):** suites y build completos; falta **E2E con PostgreSQL real** y lint
  automatizado en CI.

## 13. Funcionalidades pendientes (no iniciadas)

- **Certificados digitales con QR** (Fase 5.2) — bloqueo B-3 (decisión de negocio).
- **Insignias y reconocimientos** (Fase 5.3) — bloqueo B-6.
- **Mensajería automatizada de WhatsApp** (Fase 7, parte 2) — bloqueo B-4 (credenciales).
- **Casos sociales permanentes** y flujo de 13 pasos (fases 4/9 del Prompt original).

---

## 14. Riesgos residuales

1. **Alto — B-1:** en producción el libro contable sigue pudiendo borrarse en cascada si
   alguien elimina una campaña por fuera de la aplicación. La API lo impide, la base no.
2. **Alto — B-2:** sin claves foráneas, un borrado fuera de la aplicación puede dejar
   huérfanos (donaciones, gastos, evidencias, imágenes, novedades, reportes, sobrantes).
3. **Medio — DB-09:** hay donaciones confirmadas sin asiento; el informe ya las muestra, pero
   **regularizarlas es una decisión contable** (asientos compensatorios autorizados).
4. **Medio —** límites de tasa y lockout en memoria: no se comparten entre instancias si el
   despliegue escala horizontalmente.
5. **Bajo —** los avisos de dependencias de desarrollo no llegan a producción, pero el
   toolchain debe actualizarse en una ventana planificada.
6. **Bajo —** la E2E con base real no está automatizada: las rutas con lógica de datos se
   validan con pruebas puras y de autorización, no contra PostgreSQL.

## 15. Instrucciones de despliegue

1. **Respaldo antes de desplegar** (procedimiento en `docs/MIGRACIONES_Y_RESPALDOS.md`).
2. Variables de entorno requeridas: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`
   y, si aplica, `CORS_ORIGIN` y las credenciales de Cloudinary. **Ninguna clave nueva es
   obligatoria** para este despliegue.
3. Al arrancar, el migrador embebido aplica las migraciones pendientes **018 y 019**
   (aditivas e idempotentes). No hay pasos manuales.
4. Verificar después del despliegue:
   - `/api/health` y `/api/readyz`;
   - la ficha de una campaña con donaciones (la cifra publicada debe ser la suma verificada);
   - `/admin/libro` (informe de integridad; **se esperan hallazgos DB-09** hasta regularizar);
   - el botón de WhatsApp (aparece solo si `org_whatsapp` está configurado en el panel).
5. **No ejecutar** `drizzle-kit push` (reintroduciría el `CASCADE`; ver B-5).
6. Rollback: revertir el despliegue del código. Las migraciones 018/019 son aditivas; si se
   necesitara deshacerlas, `DROP COLUMN collaboration_type` y `DELETE FROM settings WHERE
   key IN (...)` son suficientes, previa autorización.

## 16. Recomendaciones posteriores

1. **Autorizar B-1 (migración 010)**: es la mitigación más importante pendiente.
2. **Autorizar el plan de B-2** (informe de huérfanos → FKs con `ON DELETE` conservador).
3. **Decidir la regularización de DB-09** (asientos compensatorios para las donaciones
   históricas confirmadas sin asiento) y documentar el procedimiento.
4. **Planificar la actualización del toolchain de desarrollo** (vite/babel y transitivas) en un
   PR aislado con CI en verde, en lugar de forzarla aquí.
5. **Implementar V7-4** (SEC-01/03/08 y API-06) y **V7-5** (filtros del dashboard).
6. **Automatizar la E2E con PostgreSQL** en CI usando los binarios locales (procedimiento en
   `docs/ROADMAP.md`) antes de considerar cerrada la Fase 9.
7. **Abrir la decisión de negocio de certificados con QR** (B-3) y del programa de insignias
   (B-6) con las propuestas de `docs/PROGRAMA_V7.md` §3.

---

## 17. Apéndice — Incremento V7-4 (seguridad, posterior al cierre inicial)

Este apéndice actualiza §9, §10 y §8 del informe con el incremento V7-4
(`docs/PROGRAMA_V7.md` §7).

**Corregido:**

- **SEC-03 (media → corregida):** el contador de intentos fallidos de 2FA se indexaba solo por
  `userId` (que viaja en el cuerpo del login), así que un tercero podía dejar sin acceso la
  cuenta del superadmin durante 15 minutos, repetidamente. Ahora la clave es **origen +
  cuenta**: frena la fuerza bruta sin bloquear al administrador legítimo, y el escape hatch
  limpia la cuenta en todos los orígenes.

**Verificado sin cambios necesarios:**

- **SEC-01:** `app.set("trust proxy", 1)` y `cookie.secure` en producción ya estaban correctos.
- **SEC-08:** el gate único de `/admin` queda **probado por barrido** (22 rutas GET + 6
  escrituras → 401 sin sesión; públicas accesibles; `/admin/login` no interceptado). Se
  prefirió la prueba de regresión a repartir gates redundantes por router.

**Parcial:**

- **API-06:** corregido en `POST /donations` (la ruta financiera): la validación se resuelve
  con `safeParse` antes del `try` (400 explícito) y el `catch` responde 500 en lugar de
  disfrazar un fallo de infraestructura de error de validación. El mismo patrón sigue en otros
  routers y queda documentado como pendiente.

**Contadores actualizados:** `api-server` **318/318** (+9: 5 de SEC-03 y 4 del barrido del
gate), `red-solidaria` **143/143** + **23/23** (sin cambios), typecheck **0** en libs/API/
frontend/scripts, build de producción **OK**.

**Pendientes que siguen abiertos:** API-06 en el resto de routers, SEC-02/04 (estado en
memoria) y FE-03 (gate del panel por rol en el cliente).

---

## 18. Apéndice — Incremento V7-5 (filtros del panel, Fase 6)

**Completado:**

- `GET /admin/dashboard` acepta `campaignId`, `status`, `from` y `to`. Una función pura
  (`lib/dashboard-filters.ts`, 11 pruebas) los normaliza y un filtro inválido devuelve **400
  con el motivo** en lugar de ignorarse.
- Todas las cifras de campaña (contadores, recaudación conciliada, gastos, evolución mensual,
  top de campañas y gastos por categoría) se recalculan con el **mismo** filtro en el
  servidor. Los indicadores que no dependen de campaña siguen globales y el panel lo declara
  en pantalla.
- Con rango de fechas activo el **importe histórico no se cuenta** (no es atribuible a un
  periodo): se publica solo la recaudación verificada del rango.
- El panel incorpora la barra de filtros (campaña, estado, desde, hasta, limpiar) y las 8
  tarjetas del KPI navegan a su información.

**Contadores actualizados:** `api-server` **329/329** (+11), `red-solidaria` **143/143** +
**23/23**, typecheck **0** en libs/API/frontend/scripts, build de producción **OK**.

**Nota de alcance:** el filtro por «evento» queda cubierto por el filtro de campaña, porque
un evento solidario (ChocoFest) es una campaña del sistema; no se duplica el concepto.

---

## 19. Apéndice — Incremento V7-7 (verificación E2E con PostgreSQL real)

**Arnés:** `artifacts/api-server/tests/e2e/run-e2e.sh` levanta un clúster PostgreSQL 17.7
temporal, aplica el schema base con `drizzle-kit push --force`, arranca el API compilado (el
migrador embebido corre las migraciones), comprueba el esquema con `psql`, ejecuta el flujo
HTTP completo y limpia todo. No toca ninguna base real.

**Resultado: `E2E COMPLETO: OK` (38/38 comprobaciones).**

- **19 migraciones** aplicadas y **no duplicadas** en un segundo arranque (idempotencia real).
- `donations.collaboration_type` con default `'dinero'` ✔ y **5 claves** de WhatsApp en
  `settings` ✔, verificado en la base.
- Flujo verificado: sesión y gate admin en rutas públicas · crear/publicar/archivar/restaurar ·
  borrador no público · donación de dinero y en especie · **comprobante obligatorio solo para
  dinero digital** · **un asiento por dinero aprobado, ninguno por especie con valor 0** ·
  cadena de hashes íntegra · **ficha y transparencia con la misma cifra** · borrado **409** con
  motivo · archivada fuera del listado y sin aceptar donaciones · filtros del panel contra
  datos reales · filtro inválido → 400.
- **DB-09 confirmado con datos reales:** el informe detecta **111 donaciones confirmadas sin
  asiento** (datos históricos del seed) frente a **1 asiento** (el del propio E2E). La cifra
  «el libro no cuenta toda la historia» deja de ser una hipótesis.

**Hallazgo nuevo corregido (API-07):** en el router del libro se usaba
`Number(req.params.id)` sin validar, de modo que un identificador no numérico producía un
**500** (consulta con `NaN`). Corregido con un `router.param("id", …)` único que devuelve 400
para todas las rutas del router, con comprobación en el flujo E2E.

**Matiz que corrige el alcance del bloqueo B-1:** una base **nueva** creada con el esquema
actual ya nace con el libro en `ON DELETE RESTRICT` (el esquema Drizzle se corrigió en la Fase
1 del plan). El `CASCADE` solo persiste en bases **anteriores** a ese arreglo, es decir en
producción. La migración 010 sigue siendo necesaria allí, pero **no** para despliegues nuevos.

**Estado de la Fase 9:** migraciones y E2E pasan de *pendiente* a **implementado y probado**.
Sigue pendiente el **lint automatizado** (no existe script de lint en el proyecto).

---

## 20. Apéndice — Incremento V7-8 (rendición de resultados del evento, Fase 4.3)

**Completado.** El evento ya publicaba dinero, bienes, presupuesto, programa y evidencias; lo
que faltaba era el **informe que lo reúne** y los datos que solo la organización puede
declarar (beneficiarios atendidos, actividades realizadas, resumen y destino de los sobrantes).

- **Lógica pura** `src/lib/event-results.ts` (10 pruebas): cifras reales (dinero de la
  transparencia; bienes con la regla única `resolveStock`) + datos declarados opcionales, con
  `null` explícito cuando no se declararon (nunca un cero que parecería real). **Los bienes no
  se suman al dinero.**
- **4 claves públicas** nuevas (allowlist) + seed + **migración 020** idempotente, editables
  desde el panel (grupo `chocofest`).
- **Página pública del evento**: el informe se muestra dentro de «Resultados y cierre»
  (dinero, bienes recibidos/entregados/sobrantes, beneficiarios, actividades realizadas frente
  al programa, resumen y destino de sobrantes), con «aún no declarado por la organización»
  donde no hay dato.
- **Sin tablas nuevas**: reutiliza el patrón de configuración del evento y los datos
  existentes, así que el informe no puede desincronizarse de lo que el sitio ya publica.

**Contadores actualizados:** `red-solidaria` **153/153** (+10) + **23/23**, `api-server`
**329/329**, typecheck **0** en libs/API/frontend/scripts, build **OK**, y **E2E 38/38 contra
PostgreSQL real** con **20 migraciones** aplicadas.

**Estado de la Fase 4 tras este incremento:** la rendición de resultados queda cerrada. Sigue
**pendiente** el modelo de **patrocinios con estados de negociación** (relacionado con el
bloqueo B-6).

---

## 21. Apéndice — Incremento V7-9 (índices por caso de uso, DB-07)

**Completado.** Al revisar DB-07 resultó que las migraciones **001** y **012** ya habían
cubierto los índices simples por campaña; lo que faltaba eran los **compuestos por caso de
uso** y `adoption_requests`.

- **Migración 021 (aditiva: solo `CREATE INDEX IF NOT EXISTS`, sin tocar datos ni columnas):**
  `adoption_requests (pet_id)`, `adoption_requests (status)`,
  `campaign_expenses (campaign_id, is_public)`, `campaign_evidence (campaign_id, is_public)`,
  `campaign_updates (campaign_id, created_at DESC)` y
  `donations (campaign_id, status, created_at DESC)`.
- **Verificado en base real:** **21 migraciones** aplicadas (idempotentes en el segundo
  arranque) y **6/6 índices** presentes, dentro del E2E que sigue en `E2E COMPLETO: OK`.

**Límite declarado:** la prueba propuesta por la auditoría (`EXPLAIN ANALYZE` con volumen) no
se ejecutó porque en una base vacía PostgreSQL prefiere un *seq scan*; el E2E comprueba la
existencia y la correspondencia con las consultas identificadas. Medir el plan real queda como
verificación pendiente y **no se marca como hecha**.

---

## 22. Apéndice — Incremento V7-10 (API-06 completo)

**Completado.** Los **13 bloques `catch` de 9 routers** que respondían `400 "Invalid … data"`
ante *cualquier* excepción ahora distinguen:

- **validación** (`ZodError`) → **400** `validation_error` (el dato es del cliente);
- **cualquier otro fallo** → **500** `server_error`, con el error registrado.

Routers: `news`, `campaign-evidence`, `campaign-expenses` (incluye el asiento en el libro),
`testimonials`, `admin` (login), `campaign-images`, `campaign-updates`, `contact`, `stats`
(más `donations`, que ya se había corregido en V7-4).

**Efecto real:** una caída de la base o un error de programación ya no se presentan como «datos
inválidos» al usuario ni quedan invisibles para la monitorización: aparece el 500 y queda el
registro del error.

**Verificado:** `api-server` **329/329**, typecheck **0** (el cambio obligó a hacer
consistentes las salidas de los handlers, porque el proyecto tiene `noImplicitReturns`), y
**E2E 41/41 contra PostgreSQL real** con 3 comprobaciones nuevas que confirman que la
validación sigue devolviendo `400 validation_error`.

**Límite declarado:** la rama del 500 no se prueba de forma automatizada (exigiría tumbar la
base durante el E2E); se cubre por revisión y compilador, y la rama que el cambio podía romper
—la validación— sí está probada.

---

## 23. Apéndice — Incremento V7-11 (gate del panel y estados, FE-03 y FE-04)

**Completado.** El gate del panel tenía tres defectos reales: **cualquier** error de
`/api/admin/me` mandaba al login (así que una caída del servidor se presentaba como «sesión
expirada»), un **rol sin permiso** no se trataba, y el caso de error devolvía `null` (pantalla
en blanco).

- **Decisión pura y probada** (`src/lib/admin-session.ts`, 12 pruebas): `resolvePanelGate`
  distingue `loading`, `unauthenticated` (**solo 401** → formulario de acceso), `forbidden`
  (403 o rol desconocido), `unavailable` (500 o fallo de red: no expulsa al usuario, ofrece
  reintentar) y `ready`. Los roles del panel se contrastaron con `middleware/roles.ts` de la
  API (superadmin, administrador, moderador, supervisor).
- **Estados en el panel (FE-04):** esqueleto de carga, pantalla de rol sin permiso con el rol
  declarado, pantalla de error del servidor con **Reintentar** (relanza la consulta) y el panel
  normal cuando la sesión es válida. Con datos cargados, un error posterior ya no expulsa.

**Verificado:** `red-solidaria` **165/165** (+12) + **29/29** vitest (+6), typecheck **0** y
build **OK**. Las 6 pruebas de componente fijan el comportamiento observable (500 y fallo de
red no redirigen; rol sin permiso se explica; la carga se ve; el 401 no muestra pantallas de
error; con sesión válida se renderiza el panel).

---

## 24. Apéndice — Incremento V7-12 (DB-08 y DB-10)

**Completado.** La integridad de los estados y de `updated_at` ya no depende de que la
aplicación se acuerde: la base lo garantiza.

- **DB-08 — 7 restricciones `CHECK ... NOT VALID`** (`donations`, `campaigns`, `pets`,
  `volunteers`, `adoption_requests`, `community_reports` y `campaign_movements.kind`) con los
  valores que **ya** aceptaban los esquemas de la aplicación. `NOT VALID` deja intactas las
  filas históricas y comprueba **todas las escrituras nuevas**; el endurecimiento posterior
  (`VALIDATE CONSTRAINT`) queda documentado dentro de la migración.
- **DB-10 — 6 disparadores** que mantienen `updated_at` automáticamente en las seis tablas que
  lo tienen (`donors`, `volunteer_teams`, `pets`, `community_reports`, `settings`,
  `volunteers`).

**Verificado contra PostgreSQL real:** la base **rechaza** un `status` inválido (error con el
nombre de la restricción) y **acepta** los válidos; `updated_at` se actualiza solo al modificar
una fila; 22 migraciones idempotentes; flujo HTTP 41/41; `api-server` 329/329; typecheck 0.

**Hallazgo de la propia prueba (y corrección):** `campaigns` tiene columnas NOT NULL
(`description`, `start_date`) que obligaron a cambiar el enfoque a un `UPDATE` sobre una fila
sembrada, y el seed del API es asíncrono, así que la comprobación **espera a que existan
datos** antes de medir (antes habría dado un falso verde probando en vacío).

---

## 25. Apéndice — Incremento V7-13 (SEO: FE-09)

**Completado.** Cuatro defectos del `<head>`, no solo los tres que la auditoría había listado:

1. la **URL pública estaba fija en el código** → ahora sale de `VITE_PUBLIC_URL` (con el
   despliegue actual por defecto), así que un dominio distinto ya no publica canonical y Open
   Graph apuntando al dominio viejo;
2. `hreflang="es"` y `hreflang="en"` apuntaban **a la misma URL** → ahora se declara solo
   `x-default` y se retiran los alternates de idioma que hubieran quedado (el sitio se sirve en
   una sola URL: el idioma se persiste en el navegador);
3. **no había datos estructurados** → `NGO` + `WebSite` en la portada, con lógica pura y probada
   (`src/lib/structured-data.ts`) y serialización que **escapa** `<`, `>` y `&` para que un
   texto con `</script>` no pueda cerrar la etiqueta;
4. **las etiquetas solo se añadían, nunca se retiraban** → el JSON-LD se publica y se **retira**
   al cambiar de página (si no, la siguiente heredaría los datos de la anterior).

**Pendiente deliberado:** el `Event` de ChocoFest 2026 no se publica porque sus fechas oficiales
todavía no están definidas; un `Event` sin `startDate` no aporta resultados enriquecidos y una
fecha inventada sería peor que no poner nada.

**Verificado:** `red-solidaria` **174/174** (+9) + **33/33** vitest (+4), typecheck **0**, build
**OK**. Las pruebas de componente fijan el comportamiento en `<head>` y la de serialización
demuestra que `</script>` no puede cerrar la etiqueta.

**Hallazgo de la propia verificación (y corrección):** la primera versión usaba `"\u003c"`, que
en JavaScript es **el propio carácter** `<` y no la secuencia escapada: el escape no hacía nada.
Lo detectó la prueba; se corrigió con `String.raw`. Sin esa prueba habría quedado un «escape»
cosmético en el código.

---

## 26. Apéndice — Incremento V7-14 (respaldo y restauración probados)

**Completado.** El checklist declaraba el respaldo como **documentado pero sin prueba**; ahora
está **probado**. Una copia de seguridad que nunca se ha restaurado no es una copia de
seguridad.

El E2E (contra PostgreSQL real) ensaya el ciclo **en frío**: para el API → `pg_dump` → cuenta
donaciones/asientos/configuración/migraciones → **destruye la base** → la recrea vacía → la
restaura **solo** desde el respaldo → compara los conteos → arranca el API sobre la base
restaurada → y comprueba que **la cadena de hashes del libro sigue íntegra** y que las
migraciones no se duplican.

**Salida real:** datos idénticos (113 donaciones, 1 asiento, 22 claves de configuración, 22
migraciones), arranque sin migrar de nuevo y **cadena verificada** tras la restauración.

**Problema de operación encontrado por el propio ensayo (y corregido):** `dropdb` falla si
queda alguna conexión abierta (el API recién parado deja conexiones del pool) → se usa
`DROP DATABASE ... WITH (FORCE)`. Es el fallo que habría aparecido en una recuperación real.

---

## 27. Apéndice — Incremento V7-15 (claves foráneas ausentes, B-2 / DB-04)

**Completado.** Siete tablas tenían referencias a campaña/donante/mascota como **columnas
sueltas sin clave foránea**: la base permitía donaciones, gastos, evidencias, imágenes,
novedades, bienes o presupuestos apuntando a campañas inexistentes, y borrar una mascota dejaba
sus solicitudes de adopción huérfanas (el borrado ni siquiera lo comprobaba).

- **Migración 023 (aditiva): 11 claves foráneas `NOT VALID`.** El `NOT VALID` es lo que
  desbloquea B-2 sin necesidad de decidir antes qué hacer con los huérfanos históricos: no se
  validan las filas existentes y **sí** se comprueban todas las escrituras nuevas. El camino
  para endurecerlo (contar huérfanos → `VALIDATE CONSTRAINT`) queda escrito en la migración.
- **`ON DELETE` caso por caso:** `RESTRICT` para todo lo que es historial (dinero, gastos,
  evidencias, imágenes, novedades, bienes, presupuesto) y `SET NULL` donde la fila debe
  sobrevivir (una donación sin el donante consolidado, un bien sin su donante, y **un reporte
  ciudadano** si se borra la campaña creada a partir de él).
- **`DELETE /admin/pets/:id`** responde **409** con el número de solicitudes si la mascota tiene
  alguna, en lugar de dejarlas huérfanas.

**Verificado contra PostgreSQL real:** **11/11** claves presentes; la base **rechaza** una
donación que apunta a una campaña inexistente y **acepta** las válidas; el flujo HTTP completo
sigue en verde (prueba positiva), 23 migraciones idempotentes y el ensayo de restauración pasa
con la cadena del libro íntegra.
