# Plan de Implementación — ChocoFest 2026 y Estabilización

> Fase 1 (plan) del *Prompt Maestro*. Deriva de `docs/AUDITORIA_INTEGRAL_2026.md`.
> Regla: **una unidad de trabajo = implementar → probar → verificar no-regresión → documentar**.

---

## 1. Principios

1. No reconstruir; no eliminar funcionalidad operativa; no tocar datos históricos.
2. No ejecutar migraciones destructivas ni `push` automático.
3. Cada cambio de código va acompañado de su prueba.
4. Diferenciar siempre **Implementado / Probado / Pendiente / Bloqueado**.
5. ChocoFest 2026 tiene prioridad sobre mejoras secundarias.

---

## 2. Secuencia de trabajo

### Bloque A — Estabilización crítica (Fase 2)

Orden pensado para **no requerir datos ni autorización** y evitar operaciones destructivas.

| UW | Hallazgo | Acción | Archivos | Prueba |
|---|---|---|---|---|
| A1 | API-01 (CRÍTICO) | `asc` → `desc` en `prev_hash` del ledger | `artifacts/api-server/src/lib/ledger.ts` | test integración: 3 `appendMovement` ⇒ `verifyChain.verified === true` |
| A2 | DB-01 (CRÍTICO) | Quitar `pnpm --filter db push` de `post-merge.sh`; sustituir por migraciones versionadas no interactivas | `scripts/post-merge.sh` | dry-run; verificar que no hay `DROP` |
| A3 | DB-02 (CRÍTICO) | FK `campaign_movements→campaigns` a `RESTRICT` + borrado lógico de campañas | `lib/db/src/schema/campaign-movements.ts`, `routes/campaigns.ts` | borrar campaña con movimientos ⇒ rechazo/soft-delete |
| A4 | INF-01 (ALTO) | Migrar **antes** de `listen`; `process.exit(1)` si falla | `artifacts/api-server/src/index.ts` | forzar fallo ⇒ no escucha |
| A5 | INF-02 (ALTO) | `/readyz` con `SELECT 1` + timeout | `routes/health.ts` | BD caída ⇒ 503 |
| A6 | FE-02 (ALTO) | Validación Zod de `amount`/`paymentMethod` en `POST /donations` | `routes/donations.ts`, `lib/donation-validation.ts` | `POST amount:-10` ⇒ 400 |
| A7 | API-05 (MEDIO) | Invocar `approvalRequiresProof` al aprobar | `routes/donations.ts` | aprobar `yape` sin proof ⇒ 400 |
| A8 | API-02/03/04 (MEDIO) | Envolver en `db.transaction` | `donations.ts`, `community-reports.ts`, `pets.ts` | forzar fallo intermedio ⇒ rollback |

**Fuera de este bloque (requiere autorización / datos):** migraciones de tipos (DB-06), `UNIQUE(title)` (DB-05),
`CHECK` de estados (DB-08), *backfill* del ledger (DB-09), índices (DB-07) — todos requieren plan de respaldo/conciliación
y se documentan en `docs/MIGRACIONES_Y_RESPALDOS.md` antes de ejecutarse.

### Bloque B — Importadores idempotentes (Fase 2)

| UW | Hallazgo | Acción |
|---|---|---|
| B1 | IMP-01/02 | Rediseñar `apply-*.ts` a reconciliación idempotente en transacción (upsert por clave natural, sin `DELETE`) |
| B2 | IMP-04 | Añadir `source`/`dedupKey` única a `donations` (migración **aditiva**, no destructiva) |
| B3 | IMP-06 | `UPDATE` solo de campos derivados; excluir `featured`/`status`/`raised` |
| B4 | IMP-03/08 | Unificar criterio de idempotencia por campaña |
| B5 | IMP-09 | Tests de integración del importador (2 ejecuciones = mismo estado) |

> B2 es una migración **aditiva** (añade columna + índice único). No borra datos. Aun así, se documenta y respalda antes de aplicar.

### Bloque C — ChocoFest 2026 (Fase 3)

| UW | Entregable |
|---|---|
| C1 | Modelo/datos de campaña 2026 (metadatos editables: lema, fechas, metas) — **sin inventar cifras** |
| C2 | Ruta pública `/campanas/chocofest-2026` (13 secciones del prompt) con portada navideña responsive |
| C3 | i18n es/en para ChocoFest 2026 |
| C4 | Donaciones monetarias con estados (pendiente/en revisión/confirmada/rechazada/anulada) |
| C5 | Donaciones en especie + inventario con movimientos (entrada/salida/reserva/devolución/ajuste/saldo) |
| C6 | Voluntariado y planificación por localidades |
| C7 | Panel admin de ChocoFest 2026 con permisos por función y auditoría |
| C8 | Transparencia pública (separar dinero de valorización estimada; ocultar datos personales) |

### Bloque D — Diseño, calidad y docs (Fases 4-8)

Accesibilidad (FE-06), rendimiento (FE-08), SEO (FE-09), consolidación `ui`/sandbox (FE-07/INF-04),
`optimizeDeps` (INF-03), pruebas de aislamiento entre campañas, y la documentación obligatoria restante.

---

## 3. Documentación obligatoria (estado)

| Documento | Estado |
|---|---|
| `docs/AUDITORIA_INTEGRAL_2026.md` | ✅ Creado |
| `docs/PLAN_IMPLEMENTACION_CHOCOFEST_2026.md` | ✅ Este documento |
| `docs/ARQUITECTURA_ACTUALIZADA.md` | ⏳ Pendiente |
| `docs/MIGRACIONES_Y_RESPALDOS.md` | ⏳ Pendiente (antes de Bloque A4/DB-*) |
| `docs/PRUEBAS_Y_RESULTADOS.md` | ⏳ Pendiente |
| `docs/DESPLIEGUE_RENDER.md` | ⏳ Pendiente |
| `docs/AVANCES_CHOCOFEST_2026.md` | ⏳ Pendiente |

---

## 4. Criterios de aceptación (del prompt)

Compila · pruebas críticas pasan · campañas previas conservan datos · ChocoFest 2026 administrable ·
portada destaca la campaña · donaciones correctas · pendientes ≠ confirmadas · inventario con trazabilidad ·
gastos verificables · voluntarios inscribibles · permisos funcionan · transparencia coherente · móvil y escritorio ·
migraciones verificadas · despliegue documentado.

---

## 5. Riesgos y bloqueos

- **Requiere autorización:** cualquier migración que altere tipos/columnas existentes (DB-05/06/07/08/09) o datos en producción.
- **Requiere datos reales:** fechas oficiales, metas y cifras de ChocoFest 2026 (no se inventan).
- **Requiere infraestructura:** credenciales de Render/Cloudinary/DB para verificación end-to-end.
- **Bloqueo actual:** la suite y el build aún no se han ejecutado como línea base (ver `docs/PRUEBAS_Y_RESULTADOS.md`).
