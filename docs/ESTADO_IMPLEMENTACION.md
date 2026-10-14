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

## 5. Próximos pasos (incremento 3 — Fase 2: ChocoFest 2026)

1. **Portada:** ChocoFest 2026 en el primer bloque visual mientras esté configurada como protagonista y publicada, sin desplazar de forma permanente la identidad de Red Solidaria (reutiliza `protagonist_campaign_id` y `resolveProtagonist`, ya existentes).
2. **Información del evento editable:** fecha, lugar, horario, descripción, objetivos, metas, galería, programa de actividades, responsables y estado de organización (sobre `campaign_updates`, `campaign_images` y las claves `settings` de la allowlist pública).
3. **Chocolatada, regalos y canastas:** metas de niños/raciones, insumos con recibido/usado/restante, clasificación y entrega de juguetes, composición y entrega de canastas con evidencia — reutilizando inventario y sobrantes existentes, **sin crear una campaña por producto**.
4. **Presupuesto:** por categoría, meta de recaudación, donaciones verificadas, gastos aprobados, saldo y avance.

**Dependencia de datos:** este incremento necesita que la organización apruebe y proporcione las **cifras reales** (metas de niños, raciones, canastas, presupuesto). No se introducirá ninguna cifra inventada: el panel quedará listo para cargarlas y, mientras no existan, la interfaz mostrará el estado «sin metas definidas».

## 6. Riesgos y bloqueos

- **R-1 / R-2** (claves foráneas ausentes y doble migrador): ver `docs/AUDITORIA_INICIAL.md` §3. Ningún incremento realizado hasta ahora toca la base de datos.
- **Fase 12 (identidad visual)** bloqueada hasta disponer de los archivos oficiales del logo y de Piñito; no se generará ningún diseño sustituto.
- **Pruebas de integración con base real** (borrado `204`, `409` por dependencias, restauración de respaldos): requieren una base PostgreSQL accesible; en este contenedor las suites usan un `DATABASE_URL` ficticio, por lo que se ejecutarán en el entorno de despliegue (incremento 16).
- **Producción:** no se ha ejecutado ninguna operación destructiva ni se han modificado datos reales.
