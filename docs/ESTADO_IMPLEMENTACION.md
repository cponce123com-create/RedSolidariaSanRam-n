# ESTADO DE IMPLEMENTACIÓN — Prompt Maestro 2026

**Rama:** `feat/implementacion-integral-2026`
**Última actualización:** 14 de octubre de 2026
**Incremento en curso:** 1 (Fase 1 núcleo) — **terminado y verificado**; el siguiente es el incremento 2.

---

## 1. Progreso por fase

| Fase del Prompt Maestro | Estado | Evidencia |
|---|---|---|
| 0 — Auditoría y preparación | ✅ Completada | `docs/AUDITORIA_INICIAL.md` |
| 1 — Administrador y frontend (núcleo) | ✅ Completada | Este documento §3 |
| 1 — Administrador y frontend (cierre/UX) | ⏳ Pendiente | `docs/PLAN_IMPLEMENTACION.md` incremento 2 |
| 2 — ChocoFest 2026 protagonista | ⏳ Pendiente | Incremento 3 |
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

## 2. Qué se ha hecho en el incremento 1

### 2.1 Eliminación y archivado de campañas

- **`draft → archived`** permitido: un borrador con dependencias (imágenes, novedades, reportes) ya no queda atrapado sin salida.
- La acción **Archivar** se ofrece en la UI para borradores, con confirmación explícita.
- Los **reportes ciudadanos** cuentan como dependencia (no tienen clave foránea; borrar dejaba huérfanos).
- Mensajes de bloqueo accionables; se conserva la protección `ON DELETE RESTRICT` del libro contable (el `23503` se traduce a `409`).
- La campaña protagonista se limpia al archivar o eliminar y ya no puede fijarse a una campaña oculta (`409` con explicación).

### 2.2 Sincronización administrador → web pública

- **`src/lib/query-keys.ts`** (nuevo): fuente única de verdad de claves y predicados por entidad. Corrige la causa raíz: el detalle del cliente generado usa `["/api/campaigns/5"]` y nunca coincidía con el predicado anterior.
- **`src/lib/query-invalidation.ts`** (nuevo): invalidación por entidad (`campaigns`, `donations`, `allies`, `settings`), reutilizada por campañas, donaciones, aliados y el panel de donantes.
- **`middleware/cache-control.ts`**: petición con sesión → `private, no-store`; anónima → `public, max-age=60` + `Vary: Cookie`.
- **`App.tsx`**: `refetchOnWindowFocus: true`.
- **`PUT /admin/settings`** (batch) pasa a upsert: antes descartaba claves nuevas en silencio.

### 2.3 Archivos modificados

```
artifacts/api-server/src/lib/campaign-lifecycle.ts      draft→archived, reportes, protagonistError
artifacts/api-server/src/routes/campaigns.ts            conteo de reportes ciudadanos
artifacts/api-server/src/routes/settings.ts             protagonista visible + batch upsert
artifacts/api-server/src/middleware/cache-control.ts    no-store con sesión + Vary: Cookie
artifacts/api-server/tests/campaign-lifecycle.test.mjs  +5 pruebas y expectativas nuevas
artifacts/api-server/tests/performance.test.mjs         +2 pruebas de caché con sesión
artifacts/api-server/tests/settings-upsert.test.mjs     +3 pruebas de protagonista
artifacts/red-solidaria/src/lib/query-keys.ts           NUEVO
artifacts/red-solidaria/src/lib/query-invalidation.ts   NUEVO
artifacts/red-solidaria/src/lib/campaign-admin.ts       invalidación compartida + Archivar en borrador
artifacts/red-solidaria/src/lib/donors-admin.ts         predicados compartidos
artifacts/red-solidaria/src/pages/admin/allies.tsx      invalidación de entidad
artifacts/red-solidaria/src/pages/admin/donations.tsx   invalidación de entidad
artifacts/red-solidaria/src/App.tsx                     refetchOnWindowFocus
artifacts/red-solidaria/build-tests.mjs                 nuevos módulos puros
artifacts/red-solidaria/tests/query-keys.test.mjs       NUEVO (8 pruebas)
docs/AUDITORIA_INICIAL.md                               NUEVO
docs/PLAN_IMPLEMENTACION.md                             NUEVO
docs/ESTADO_IMPLEMENTACION.md                           NUEVO (este archivo)
```

**Migraciones:** ninguna en este incremento. Todo el cambio de ciclo de vida usa la columna `campaigns.status` existente (texto libre), así que no hay riesgo de migración.

---

## 3. Verificación ejecutada (resultados reales)

| Comprobación | Comando | Resultado |
|---|---|---|
| Typecheck — libs | `npx tsc --build` | 0 errores |
| Typecheck — API | `npx tsc -p tsconfig.json --noEmit` (en `artifacts/api-server`) | 0 errores |
| API — pruebas | `pnpm --filter @workspace/api-server test` | **272/272** ✅ |
| Typecheck — frontend | `npx tsc -p tsconfig.json --noEmit` (en `artifacts/red-solidaria`) | 0 errores |
| Typecheck — scripts | `npx tsc -p tsconfig.json --noEmit` (en `scripts`) | 0 errores |
| Frontend — lógica pura | `node build-tests.mjs && node --test tests/*.test.mjs` | **90/90** ✅ |
| Frontend — componentes | `npx vitest run` | **22/22** ✅ |
| Build de producción | `npx vite build --config vite.config.ts` | OK (41s) |

> Nota de entorno: el script raíz `pnpm run typecheck` invoca `pnpm` de forma recursiva y en este contenedor `pnpm` no está en el `PATH` de los subprocesos (`sh: pnpm: command not found`). Los comandos de la tabla son los equivalentes directos y cubren libs, API, frontend y scripts. En Render, donde `pnpm` sí está disponible, el script raíz funciona tal cual.

### Comandos de continuación

```bash
cd /home/user/bot-descargador
git checkout feat/implementacion-integral-2026

# Validación completa antes de cada commit
pnpm run typecheck
pnpm --filter @workspace/api-server test
cd artifacts/red-solidaria && node build-tests.mjs && node --test tests/*.test.mjs && npx vitest run
pnpm run build
```

---

## 4. Próximos pasos (incremento 2)

1. **Monto recaudado con fuente única** (RC-S8): el formulario de campaña debe mostrar el valor calculado desde las donaciones confirmadas como fuente de verdad y explicar cuándo el valor manual no aplica.
2. **Borrado desde el detalle de la campaña** con confirmación explícita y explicación de por qué una campaña con historial se archiva (RC3).
3. **Claves separadas admin/público** para `/api/campaigns` si se confirma la colisión (RC-S9).
4. **UX administrativa**: tablas, filtros, ordenación, estados de carga, alertas, errores, responsive, accesibilidad y botón discreto de acceso al panel desde la web pública.
5. **Pruebas de integración con base real**: borrado `204`, `409` por dependencias y limpieza del protagonista al archivar.

## 5. Riesgos y bloqueos

- **R-1 / R-2** (claves foráneas ausentes y doble migrador): ver `docs/AUDITORIA_INICIAL.md` §3. Ninguna operación de este incremento toca la base de datos ni requiere migración.
- **Fase 12 (identidad visual)** está bloqueada hasta disponer de los archivos oficiales del logo y de Piñito; no se generará ningún diseño sustituto.
- **Cifras**: no se ha introducido ninguna meta, donación, beneficiario ni resultado inventado. Las metas de ChocoFest 2026 se cargarán desde el panel cuando la organización las apruebe.
- **Producción**: no se ha ejecutado ninguna operación destructiva ni se han modificado datos reales.
