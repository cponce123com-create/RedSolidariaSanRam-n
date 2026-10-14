# AUDITORÍA INICIAL — Red Solidaria San Ramón (Prompt Maestro 2026)

**Fecha:** 14 de octubre de 2026
**Rama de trabajo:** `feat/implementacion-integral-2026` (parte de `main` @ `9691340`)
**Alcance:** monorepo completo (`artifacts/api-server`, `artifacts/red-solidaria`, `lib/db`, `lib/api-client-react`, `lib/api-zod`, `lib/api-spec`, `scripts`, `docs`)
**Método:** inspección directa del código con evidencia `archivo:línea`, ejecución de `typecheck` y de las suites reales (`api-server` 265→272, `red-solidaria` 82→90 node:test + 22 vitest). No se ha modificado ningún dato de producción ni se ha ejecutado ninguna operación destructiva.

Este documento es el diagnóstico de la **Fase 0**. Las correcciones de la Fase 1 ya están implementadas y verificadas (ver `ESTADO_IMPLEMENTACION.md`); aquí se documentan las causas raíz encontradas antes de cambiarlas.

---

## 1. Arquitectura real del monorepo

| Paquete | Rol | Tecnología |
|---|---|---|
| `artifacts/api-server` | API REST + arranque de migraciones | Express 5, Drizzle ORM, PostgreSQL (Neon), pino, express-session, bcrypt, TOTP |
| `artifacts/red-solidaria` | SPA pública + panel admin | React 18 + Vite, `wouter`, TanStack Query, Tailwind v4 + shadcn/ui, i18next |
| `lib/db` | Esquema y migraciones | Drizzle + migrador embebido (`src/migrate.ts`) que corre al arrancar |
| `lib/api-spec` + `lib/api-client-react` + `lib/api-zod` | Contrato | OpenAPI + cliente Orval generado (`generated/api.ts`) |
| `scripts` | Semillas puntuales | ChocoFest 2025, Chocolatada 2024, voluntarios |

**Hallazgo de infraestructura (DB-03):** existen dos fuentes de verdad del esquema en conflicto. El migrador que **realmente** se aplica al arrancar es `lib/db/src/migrate.ts`; los archivos `lib/db/drizzle/0000_*.sql` y `0001_*.sql` son artefactos generados que **nunca se aplican**. Consecuencia: las cláusulas `ON DELETE` reales de la base no coinciden con el esquema Drizzle (p. ej. `campaign_movements` es `CASCADE` en el artefacto y `RESTRICT` en la base real, migración 010). Cualquier razonamiento sobre borrados debe partir de `migrate.ts`, no de `drizzle/`.

> **✅ Resuelto en V7-16:** los artefactos y su carpeta `meta/` **se eliminaron del repositorio**, y `drizzle.config.ts` documenta que la única fuente de verdad es `lib/db/src/migrate.ts` (sin `generate`, y su salida no se commitea). Ya no hay dos esquemas en conflicto.

---

## 2. Inventario por funcionalidad

### 2.1 Campañas — **DEFECTUOSA (causa raíz de la Fase 1)**

| Capacidad | Estado |
|---|---|
| Crear / editar / buscar / filtrar / ordenar | Implementada y verificada |
| Publicar, pausar, reanudar, finalizar, despublicar, restaurar | Implementada y verificada (`PATCH /api/campaigns/:id/status`) |
| Archivar | Implementada, pero **inalcanzable desde borrador** |
| Eliminar | Implementada solo para borradores **sin ninguna** fila dependiente |
| Campaña protagonista | Implementada; aceptaba campañas ocultas (corregido en Fase 1) |
| Sincronización con el frontend público | **Defectuosa** (caché e invalidación) |

**Causas raíz del «no puedo eliminar la campaña»:**

- **RC1** — `DELETE /api/campaigns/:id` solo procede con `status === "draft"`; cualquier otro estado responde `409` (`routes/campaigns.ts:380`, `lib/campaign-lifecycle.ts:130-133`). Es una restricción por diseño, no un fallo de base de datos.
- **RC2** — Un borrador se bloquea si tiene **cualquier** fila dependiente (una sola imagen de galería, una novedad, un reporte): `countCampaignDependencies` + `deleteBlockReason`.
- **RC3** — La UI oculta la papelera salvo en borradores y el detalle no ofrece borrado: el administrador no ve ninguna salida (`pages/admin/campaigns.tsx:253-263`).
- **RC4 (callejón sin salida)** — Un borrador con contenido no podía eliminarse (dependencias) **ni** archivarse (`draft → archived` no estaba permitido). Quedaba atrapado para siempre. **Corregido en Fase 1.**
- **RC5** — Barrera dura de PostgreSQL: `campaign_movements.campaign_id` es `ON DELETE RESTRICT` (migración 010). Es la protección correcta del libro contable y se mantiene; el `23503` se traduce a `409` con mensaje accionable.
- **RC6** — Divergencia documentación↔código: `docs/MIGRACIONES_Y_RESPALDOS.md` describe el `DELETE` como borrado lógico y cita un `DELETE /admin/campaigns/:id` que **no existe**.

**Riesgo de integridad detectado y corregido:** `community_reports.campaign_id` no tiene clave foránea y **no se contaba** entre las dependencias: borrar la campaña dejaba reportes ciudadanos huérfanos apuntando a un id inexistente (Fase 1).

### 2.2 Sincronización administrador → web pública — **DEFECTUOSA**

- **RC-S1 (el bug principal)** — `invalidateCampaignQueries` invalidaba con `queryKey[0] === "/api/campaigns"`, pero el cliente generado por Orval guarda el detalle y sus subrecursos como **un solo string** (`["/api/campaigns/5"]`, `["/api/campaigns/5", "donors"]`). Esas claves **nunca** coincidían: la ficha pública de la campaña seguía mostrando datos viejos. El comentario del propio archivo afirmaba lo contrario.
- **RC-S2** — `middleware/cache-control.ts` añadía `public, max-age=60` a todo GET público y el cliente hacía `fetch()` sin `cache: "no-store"`: el navegador del administrador podía servir su propia respuesta cacheada durante 60s (afectaba a `/api/settings`, `/api/allies`, `/api/news`, `/api/stats`). Solo `/api/campaigns` y `/api/campaigns/:id` se exceptuaban con `private, no-store` cuando la sesión era admin.
- **RC-S3** — `QueryClient` con `refetchOnWindowFocus: false` y `staleTime: 60_000`: un visitante anónimo con la pestaña abierta no veía ningún cambio hasta recargar a mano.
- **RC-S4** — El panel de aliados invalidaba solo `["/api/admin/allies"]` mientras la página pública lee `["/api/allies"]`: entidades distintas para la misma información.
- **RC-S5** — Aprobar o rechazar una donación invalidaba solo donaciones y estadísticas; el monto recaudado de la campaña y el panel público de transparencia quedaban obsoletos.
- **RC-S6** — `PUT /admin/settings` (batch) hacía solo `UPDATE`: una clave nueva se descartaba **en silencio** y el administrador creía haberla guardado. **Corregido en Fase 1.**
- **RC-S7** — `PUT /admin/protagonist-campaign` validaba que la campaña existiera, pero no su estado: se podía fijar un borrador o una archivada como protagonista y la portada quedaba vacía sin explicación. **Corregido en Fase 1.**
- **RC-S8** — `formatCampaign` publica `raised = max(columna raised, suma de donaciones confirmadas)`: si hay donaciones, el valor que el administrador escribe en el formulario no se ve. **Pendiente** (incremento 2: el formulario debe mostrar el valor calculado como fuente de verdad y explicar cuál es manual).
- **RC-S9** — Colisión de claves: el panel y el público usan la misma clave `["/api/campaigns"]` aunque la API devuelve contenido distinto según la sesión (el público no ve borradores). Resuelto en la práctica por RC-S2 (con sesión no hay caché HTTP) y por la invalidación por entidad; conviene revisar en el incremento 2 si merece claves separadas.

### 2.3 Donaciones y donantes — **PARCIAL**

- Verificada: registro público, estados (`pending`/`approved`/`rejected`/`reconciled`), comprobantes, conciliación con el libro contable en transacción, detección de duplicados, panel de donantes, anonimato y datos privados separados.
- Pendiente: donaciones familiares como nombre colectivo (`Familia Quispe`), certificados/reconocimientos, preferencias de privacidad y consentimientos explícitos por donante, donaciones en especie/servicios/apoyo logístico como tipos de primer nivel.

### 2.4 Voluntariado y equipos — **IMPLEMENTADA (último incremento cerrado)**

Registro permanente con token público, aprobación trazable, ciclo de vida con transiciones validadas en servidor, panel con ficha, equipos con historial de pertenencia (la baja no borra), participaciones con resumen de horas y auditoría. Pendiente respecto al Prompt Maestro: tareas, turnos, asistencia, evaluación de actividades, certificados de participación, brigadas de recolección con zona/entregas/incidencias.

### 2.5 Aliados/empresas — **PARCIAL**

CRUD y visibilidad pública verificados. Pendiente: propuestas de colaboración, compromisos, estados de negociación, historial, perfil público autorizado, niveles del programa «Empresas que Regalan Sonrisas» y **donaciones igualadas** (compromiso/confirmado/pendiente/resultado).

### 2.6 Libro contable, inventario, reportes, transparencia — **IMPLEMENTADA Y VERIFICADA**

Cadena de hashes verificable (`/campaigns/:id/movements/verify`, `/ledger/root`), movimientos con `RESTRICT` hacia campañas, gastos, evidencias, sobrantes, inventario valorizado, informes CSV (Excel) e imprimible (PDF) sin dependencias, panel de transparencia público, observaciones y auditoría. Pendiente: exportación PDF/Excel unificada del libro completo y correcciones trazables guiadas desde el panel.

### 2.7 No implementado (fases 4, 6, 7, 9 del Prompt Maestro) — **PENDIENTE**

- **Certificados digitales con QR** (individuales, familiares, de empresa, de voluntario; verificación pública; 3 formatos) — no existe.
- **Insignias y marcos personalizados** (1080×1080, subida y ajuste de foto) — no existe.
- **Embajadores solidarios** (enlace/código de referencia, captaciones, métricas) — no existe.
- **WhatsApp Business** (botón, mensajes predefinidos, clasificación de contactos, solicitudes de comunidad) — no existe.
- **Casos sociales permanentes** («Historias que podemos cambiar»): existe `community_reports` (reportes ciudadanos) como base reutilizable, pero no el flujo de 13 pasos, ni tipos de ayuda, ni transparencia por caso.

### 2.8 Identidad visual (Piñito, logo, recursos) — **PENDIENTE DE ARCHIVOS OFICIALES**

No se rediseña nada automáticamente. La plataforma debe quedar preparada para consumir los archivos oficiales cuando estén disponibles.

---

## 3. Seguridad, privacidad y rendimiento (estado)

**Verificado y correcto:** Helmet + CSP, HSTS, `SESSION_SECRET` obligatorio, cookies de sesión, `requireAdmin`/`requireRole`, rate limiting con presupuesto anónimo y exención admin, TOTP con bloqueo, validación de entradas con Zod, sin exposición de correo/teléfono en listados públicos, `public-settings` con allowlist (todo lo nuevo es privado por defecto), comprobantes con subida firmada, auditoría de acciones administrativas.

**Riesgos abiertos:**
1. **R-1 (medio):** claves foráneas ausentes en el esquema (`donations`, `campaign_expenses`, `campaign_evidence`, `campaign_images`, `campaign_updates`, `community_reports`, `campaign_leftovers`). La única protección contra huérfanos es el conteo en la aplicación. Mitigado en Fase 1 para campañas; pendiente migración aditiva que añada FKs con `ON DELETE` conservador.
2. **R-2 (medio):** divergencia de migradores (DB-03). Un `drizzle-kit push` accidental podría aplicar `CASCADE` sobre el libro contable. Requiere documentación y/o eliminación de los artefactos.
3. **R-3 (bajo):** `PUT /admin/settings/:key` permite crear cualquier clave; no hay validación de formato por clave.
4. **R-4 (bajo):** sin Sentry ni Error Boundaries (Fase 2 del `PLAN_DE_TRABAJO.md`, aún pendiente).
5. **R-5 (bajo):** `stats` se sirve desde una tabla de valores manuales: debe quedar claro en el panel que son cifras administradas, no calculadas.

---

## 4. Pruebas: cobertura real y huecos

| Suite | Antes de Fase 1 | Después de Fase 1 |
|---|---|---|
| `api-server` (`node:test`) | 265 | **272** |
| `red-solidaria` (`node:test`) | 82 | **90** |
| `red-solidaria` (`vitest`) | 22 | 22 |

Huecos identificados y ya cubiertos en Fase 1: transiciones `draft → archived`, `deleteBlockReason` con reportes ciudadanos, `protagonistError`, invalidación de claves del detalle público, caché HTTP con sesión.

Huecos que permanecen (incrementos siguientes): borrado `204` real contra base de datos, `409` por dependencias con base real, restauración de respaldos, pruebas de extremo a extremo (Fase 15), accesibilidad automatizada.

---

## 5. Conclusión

La plataforma **no necesitaba reconstrucción**: la persistencia siempre funcionó. Los dos problemas reportados tenían causas concretas y acotadas —una regla de ciclo de vida demasiado rígida que dejaba borradores atrapados, y una invalidación de caché que no alcanzaba las claves reales del cliente generado— y ambas están corregidas y probadas. El resto del Prompt Maestro son módulos nuevos que se construirán por incrementos sobre lo existente, sin duplicar tablas ni endpoints.
