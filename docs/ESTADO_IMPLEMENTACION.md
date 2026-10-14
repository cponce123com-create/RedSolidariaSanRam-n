# ESTADO DE IMPLEMENTACIÓN — Prompt Maestro 2026

**Rama:** `feat/implementacion-integral-2026` (publicada en `origin`)
**Última actualización:** 14 de octubre de 2026
**Incremento en curso:** 2 (cierre de la Fase 1) — **terminado y verificado**. El siguiente es el incremento 3 (ChocoFest 2026).

---

## 1. Progreso por fase

| Fase del Prompt Maestro | Estado | Evidencia |
|---|---|---|
| 0 — Auditoría y preparación | ✅ Completada | `docs/AUDITORIA_INICIAL.md` |
| 1 — Administrador y frontend | ✅ Completada (incrementos 1 y 2) | Este documento §2 y §3 |
| 2 — ChocoFest 2026 protagonista | ⏳ Siguiente (necesita metas reales) | Incremento 3 |
| 3 — Sistema de donantes | 🟡 Parcial (base sólida existente) | Incremento 4 |
| 4 — Certificados con QR | ⏳ Pendiente | Incremento 5 |
| 5 — Voluntarios y equipos | 🟡 Parcial (registro, equipos y participación hechos) | Incremento 6 |
| 6 — Insignias y marcos | ⏳ Pendiente | Incremento 7 |
| 7 — Embajadores | ⏳ Pendiente | Incremento 8 |
| 8 — Empresas y auspiciadores | 🟡 Parcial (aliados existentes) | Incremento 9 |
| 9 — WhatsApp Business | ⏳ Pendiente | Incremento 10 |
| 10 — Casos sociales | 🟡 Parcial (`community_reports` reutilizable) | Incremento 11 |
| 11 — Transparencia financiera | 🟡 Parcial (libro, hashes, informes hechos) | Incremento 12 |
| 12 — Identidad visual | ⏸️ Bloqueada (faltan archivos oficiales) | Incremento 13 |
| 13 — Dashboard unificado | ⏳ Pendiente | Incremento 14 |
| 14 — Seguridad/privacidad/rendimiento | 🟡 Parcial (base ya endurecida) | Incremento 15 |
| 15 — Pruebas integrales | 🟡 Parcial (unitarias e integración de rutas en verde) | Incremento 16 |

Leyenda: ✅ hecha y verificada · 🟡 parcial, se amplía · ⏳ pendiente · ⏸️ bloqueada por dependencia externa.

---

## 2. Incremento 1 (Fase 1 núcleo) — cerrado

### Eliminación y archivado de campañas

- **`draft → archived`** permitido: un borrador con dependencias (imágenes, novedades, reportes) ya no queda atrapado sin salida.
- Acción **Archivar** disponible para borradores, con confirmación explícita.
- Los **reportes ciudadanos** cuentan como dependencia (sin clave foránea, borrar dejaba huérfanos).
- Mensajes de bloqueo accionables; se conserva `ON DELETE RESTRICT` del libro contable (`23503` → `409`).
- La campaña protagonista se limpia al archivar/eliminar y ya no acepta campañas ocultas (`409` explicado).

### Sincronización administrador → web pública

- `src/lib/query-keys.ts` (nuevo): fuente única de verdad de claves y predicados por entidad.
- `src/lib/query-invalidation.ts` (nuevo): invalidación por entidad, reutilizada por campañas, donaciones, aliados y donantes.
- `cache-control.ts`: petición con sesión → `private, no-store`; anónima → `public, max-age=60` + `Vary: Cookie`.
- `App.tsx`: `refetchOnWindowFocus: true`.
- `PUT /admin/settings` (batch) pasa a upsert (antes descartaba claves nuevas en silencio).

---

## 3. Incremento 2 (cierre de la Fase 1) — cerrado

### 3.1 Monto recaudado con fuente única (RC-S8)

El backend publica `raised = max(columna manual, donaciones confirmadas)`, así que el campo manual del formulario no tenía efecto cuando ya había donaciones y el administrador creía que «no se guardaba». Ahora, en `pages/admin/campaign-detail.tsx`:

- Se lee la transparencia real de la campaña (`GET /api/campaigns/:id/transparency`), que ya era la fuente pública.
- Si hay **donaciones confirmadas** (`approved` o `reconciled`), el campo pasa a **solo lectura** y se muestra el total y el número de donaciones que lo componen.
- Si no hay ninguna, el campo manual sigue editable con el aviso de que se reemplazará al aprobar la primera donación.
- `data-testid="campaign-raised-input"` para poder automatizar la comprobación.

### 3.2 Eliminación desde el detalle de la campaña (RC3)

- Botón **«Eliminar borrador»** visible solo en borradores, con confirmación explícita que enumera qué registros impiden el borrado y recuerda la alternativa segura (**Archivar**).
- Si el backend responde `409`, el mensaje real se muestra en el aviso: la salida ya no es un callejón sin salida.
- Tras el borrado se vuelve al listado.

### 3.3 Búsqueda, filtrado y ordenación (Fase 1.2)

- La lista ya tenía pestañas por estado y búsqueda por título/categoría; se añade **ordenación**: más recientes, más antiguas, título (A-Z), meta (mayor) y recaudado (mayor), con `aria-label` y sin nuevas dependencias.

### 3.4 Acceso discreto al panel desde la web pública (Fase 1.3)

- Verificado: ya existía y está integrado (`components/layout/AdminAccessLink.tsx`), usado en la barra de navegación (escritorio y menú móvil) y enlazado desde el pie. Reutiliza la sesión existente (`GET /api/admin/me`) sin crear un login paralelo. **No se ha modificado.**

### 3.5 Claves admin/público (RC-S9) — revisado, sin cambio necesario

El panel y el público comparten la clave `["/api/campaigns"]` aunque la API devuelve contenido distinto según la sesión. Se comprobó que el riesgo queda neutralizado por dos cambios del incremento 1: con sesión no hay caché HTTP (`private, no-store`) y la invalidación es por entidad. Separar las claves exigiría reescribir el cliente generado por Orval sin beneficio funcional; se documenta la decisión.

### 3.6 Archivos modificados en el incremento 2

```
artifacts/red-solidaria/src/pages/admin/campaign-detail.tsx  fuente de verdad de la recaudación + borrado con confirmación
artifacts/red-solidaria/src/pages/admin/campaigns.tsx         ordenación de la lista
docs/ESTADO_IMPLEMENTACION.md                                este archivo
docs/PLAN_IMPLEMENTACION.md                                  incremento 2 marcado como completado
```

**Migraciones:** ninguna. Ninguna operación de este incremento toca la base de datos ni requiere migración.

---

## 4. Verificación ejecutada (resultados reales)

| Comprobación | Comando | Resultado |
|---|---|---|
| Typecheck — libs | `npx tsc --build` | 0 errores |
| Typecheck — API | `npx tsc -p tsconfig.json --noEmit` (en `artifacts/api-server`) | 0 errores |
| API — pruebas | `pnpm --filter @workspace/api-server test` | **272/272** ✅ |
| Typecheck — frontend | `npx tsc -p tsconfig.json --noEmit` (en `artifacts/red-solidaria`) | 0 errores |
| Typecheck — scripts | `npx tsc -p tsconfig.json --noEmit` (en `scripts`) | 0 errores |
| Frontend — lógica pura | `node build-tests.mjs && node --test tests/*.test.mjs` | **90/90** ✅ |
| Frontend — componentes | `npx vitest run` | **22/22** ✅ |
| Build de producción | `npx vite build --config vite.config.ts` | OK |

> Nota de entorno: el script raíz `pnpm run typecheck` invoca `pnpm` de forma recursiva y en este contenedor `pnpm` no está en el `PATH` de los subprocesos. Los comandos de la tabla son los equivalentes directos y cubren libs, API, frontend y scripts. En Render, donde `pnpm` sí está disponible, el script raíz funciona tal cual.

### Comandos de continuación

```bash
cd /home/user/bot-descargador
git checkout feat/implementacion-integral-2026

# Validación completa antes de cada commit
npx tsc --build
(cd artifacts/api-server && npx tsc -p tsconfig.json --noEmit && pnpm test)
(cd artifacts/red-solidaria && npx tsc -p tsconfig.json --noEmit && node build-tests.mjs && node --test tests/*.test.mjs && npx vitest run && npx vite build)
```

---

## 5. Incremento 3A (Fase 2, base) — cerrado

### 5.1 Lo que ya existía y se verificó (sin cambios)

- **Portada:** `HomeHero` (identidad de Red Solidaria) → `ProtagonistCampaignSection` (ChocoFest) justo después, y solo si la campaña está configurada como protagonista, `active` y no vencida. No desplaza la identidad y no inventa cifras (`components/home/ProtagonistCampaignSection.tsx`).
- **Página pública** `/campanas/chocofest-2026` con 12 secciones (presentación, metas, avance, donaciones, inventario, voluntariado, aliados, cronograma, localidades, galería, transparencia, resultados).
- **Panel** `/admin/chocofest`: KPIs, interruptor de protagonista, creación guiada de la campaña y datos del evento (lugar, horario, lema) guardados en `settings` con allowlist pública.

### 5.2 Lo que faltaba y ahora está implementado

**Modelo de bienes e insumos del evento (migración 015, aditiva y reversible).**
No se crea una tabla por producto: se reutiliza `campaign_leftovers` y se le añaden `category`, `target_qty`, `received_qty` y `used_qty`.

- **Regla única del saldo** (`resolveStock`, función pura en `src/lib/inventory.ts`): con flujo registrado, `disponible = recibido − usado`; en filas antiguas, el propio `quantity`. La usan el panel y la página pública, así que no pueden discrepar.
- **Metas por producto sin inventar cifras** (`goalProgress`): si no hay meta devuelve `hasTarget: false` y la interfaz muestra «Sin meta definida todavía» en lugar de un porcentaje inventado.
- **Agrupación por producto** (`groupInventoryByCategory`): chocolatada y raciones, regalos y juguetes, canastas de víveres, otros bienes.
- **Panel** (pestaña «Bienes e insumos»): se registra lo recibido y lo usado; el servidor calcula el saldo; validación cruzada «lo usado no puede superar lo recibido» con mensaje real; tabla con recibido/usado/disponible y avance de meta.
- **Página pública:** inventario agrupado por producto con recibido, usado, disponible y barra de avance de meta (o el estado «sin meta definida»).
- **API** (`campaign-leftovers.ts`): validación con mensajes accionables (antes era un 400 genérico), `quantity` normalizado al saldo cuando hay flujo, y **PUT con merge** para que cambiar un solo campo (p. ej. la visibilidad) no borre el resto.
- **i18n:** cinco claves nuevas en `es` y `en`; el test de claves pasa.

### 5.3 Archivos modificados en el incremento 3A

```
lib/db/src/migrate.ts                                      migración 015 (aditiva)
lib/db/src/schema/campaign-leftovers.ts                    category, target_qty, received_qty, used_qty
artifacts/api-server/src/routes/campaign-leftovers.ts      validación real, saldo normalizado, PUT con merge
artifacts/red-solidaria/src/lib/inventory.ts               resolveStock, goalProgress, agrupación por categoría
artifacts/red-solidaria/tests/inventory.test.mjs           +7 pruebas (flujo, metas, agrupación)
artifacts/red-solidaria/src/hooks/use-phase3.ts            tipo Leftover ampliado + mensaje real del servidor
artifacts/red-solidaria/src/pages/admin/campaign-detail.tsx  pestaña de bienes e insumos
artifacts/red-solidaria/src/pages/chocofest-2026.tsx       inventario público por producto con metas
artifacts/red-solidaria/src/lib/i18n/locales/es.ts|en.ts   etiquetas nuevas
```

### 5.4 Verificación del incremento 3A

`api-server` **272/272** · `red-solidaria` **97/97** node:test (+7) + **22/22** vitest · typecheck 0 en libs, API, frontend y scripts · build de producción OK.

## 6. Incremento 3B (Fase 2, cierre) — cerrado

### 6.1 Presupuesto por categoría, saldo y avance

**Migración 016 (aditiva).** Crea `campaign_budgets` (campaña, categoría, monto previsto, notas, visibilidad) con índice único `(campaign_id, lower(category))`: una sola partida por categoría y campaña, sin duplicados. No modifica ninguna tabla existente.

- **Una sola fuente de verdad por cifra:** lo previsto vive en `campaign_budgets`, el dinero gastado sigue viviendo **solo** en `campaign_expenses`, y el saldo se **deriva** (nunca se guarda) con la función pura `buildBudget` (`src/lib/budget.ts`).
- **Cruce tolerante:** la categoría se compara ignorando mayúsculas, acentos y espacios (`categoryKey`), y todo gasto cuya categoría no tenga partida aparece en la fila **«Sin presupuesto asignado»**: ningún gasto queda oculto ni se descuadra el total.
- **Saldo general y avance** (`campaignBalance`): recaudado confirmado − gastado, y avance frente a la meta de recaudación reutilizando `goalProgress`. Si no hay meta aprobada, la interfaz muestra «Sin meta de recaudación definida» en lugar de un porcentaje inventado.
- **Panel:** dentro de la pestaña «Gastos» (mismo asunto, sin pestaña nueva) hay ahora un bloque de presupuesto con formulario de partidas, tarjetas de previsto/gastado/saldo previsto/saldo general, aviso de partidas excedidas y tabla con previsto, gastado, saldo, avance y visibilidad. Al crear una partida duplicada el backend responde `409` con el motivo y el panel lo muestra.
- **Sitio público:** sección «Presupuesto y gastos» con previsión, gasto **publicado** (el sitio nunca muestra gastos privados), saldo por rubro y saldo general; los rubros sin partida se rotulan como tales.
- **API:** `GET /campaigns/:id/budgets` (público, solo `is_public`), `GET /admin/campaigns/:id/budgets`, `POST`, `PUT` (con merge) y `DELETE`, con validación de mensajes accionables y `409` por categoría duplicada.

### 6.2 Archivos del incremento 3B

```
lib/db/src/migrate.ts                                  migración 016 (aditiva)
lib/db/src/schema/campaign-budgets.ts                  tabla de presupuesto por categoría
lib/db/src/schema/index.ts                             export del esquema
artifacts/api-server/src/routes/campaign-budgets.ts     CRUD con validación y 409 por duplicado
artifacts/api-server/src/routes/index.ts                registro del router
artifacts/api-server/build-tests.mjs                    router añadido a las pruebas
artifacts/api-server/tests/campaign-budgets-auth.test.mjs  +7 pruebas (auth, gate, validación)
artifacts/red-solidaria/src/lib/budget.ts               buildBudget, categoryKey, campaignBalance
artifacts/red-solidaria/tests/budget.test.mjs           +7 pruebas
artifacts/red-solidaria/src/hooks/use-phase3.ts         hooks de presupuesto (panel y público)
artifacts/red-solidaria/src/pages/admin/campaign-detail.tsx  bloque de presupuesto en la pestaña de gastos
artifacts/red-solidaria/src/pages/chocofest-2026.tsx    sección pública de presupuesto
artifacts/red-solidaria/src/lib/i18n/locales/es.ts|en.ts    8 etiquetas nuevas
```

### 6.3 Verificación del incremento 3B

`api-server` **279/279** (+7) · `red-solidaria` **104/104** node:test (+7) + **22/22** vitest · typecheck 0 en libs, API, frontend y scripts · build de producción OK.

### 6.4 Lo que queda de la Fase 2 (incremento 3C)

1. **Programa de actividades con responsables** (hoy el «cronograma» son novedades).
2. **Estado de organización real:** el checklist del panel tiene un punto (`cronograma`) fijado en `false`; debe calcularse con datos reales.
3. **Regalos asociados a su donante y a la evidencia de entrega** (reutiliza `donations` en especie y `campaign_evidence`).
4. **Composición de canastas** (productos por canasta) y meta de canastas preparadas/entregadas.
5. **Información del evento ampliada:** objetivos, fecha y responsables editables desde el panel.

**Dependencia de datos:** las cifras (metas de niños, raciones, juguetes, canastas y montos presupuestados) las carga la organización desde el panel. No se ha introducido ninguna cifra inventada: mientras no existan, la interfaz muestra «sin meta definida» y el avance se calcula solo con lo realmente registrado.

## 7. Riesgos y bloqueos

- **R-1 / R-2** (claves foráneas ausentes y doble migrador): ver `docs/AUDITORIA_INICIAL.md` §3. Ningún incremento realizado hasta ahora toca la base de datos.
- **Fase 12 (identidad visual)** bloqueada hasta disponer de los archivos oficiales del logo y de Piñito; no se generará ningún diseño sustituto.
- **Pruebas de integración con base real** (borrado `204`, `409` por dependencias, restauración de respaldos): requieren una base PostgreSQL accesible; en este contenedor las suites usan un `DATABASE_URL` ficticio, por lo que se ejecutarán en el entorno de despliegue (incremento 16).
- **Producción:** no se ha ejecutado ninguna operación destructiva ni se han modificado datos reales.
