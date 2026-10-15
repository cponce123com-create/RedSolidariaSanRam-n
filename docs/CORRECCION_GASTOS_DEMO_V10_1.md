# CORRECCIÓN DE GASTOS DEMO V10.1 — Informe de cambios y despliegue

Rama `feat/implementacion-integral-2026` · Commit de esta entrega en `git log -1`.

## 1. Qué estaba mal

| Hallazgo del enunciado | Estado | Qué se hizo |
| --- | --- | --- |
| 1 · `maintenance.ts` no ofrecía purga de gastos individuales | Cierto | Nuevo módulo `routes/maintenance-expenses.ts` con tabla, diagnóstico, vista previa y purga |
| 2 · `campaign-expenses.ts` borraba sin comprobar el libro | Cierto | El DELETE ahora **diagnostica** el gasto y solo destruye lo ficticio; además es **solo superadmin** |
| 3 · El dashboard sigue sumando `campaign_expenses` | Cierto (por diseño) | Al borrar de verdad, la suma cambia sola: verificado en el E2E (`5477.80 → 5277.80`) |
| 4 · Eliminar la campaña no elimina gastos sueltos | Cierto | El gestor elimina **gastos individuales o en lote**, sin depender de la campaña |
| 5 · La limpieza debe afectar a PostgreSQL | Cumplido | Borrado real en una transacción; el E2E comprueba que los registros ya no existen |

## 2. La herramienta

**Panel → Mantenimiento → Gastos DEMO** (`/admin/mantenimiento/gastos`, solo superadmin).

Tabla con: ID, campaña (con su ID, marca de protegida y de huérfano), descripción,
importe, fecha, categoría, clasificación DEMO/real, asiento contable, evidencia y
**acción permitida**. Con búsqueda, filtros por acción y por campaña, y selección
múltiple (solo se pueden marcar los gastos eliminables).

Flujo: seleccionar → *Eliminar seleccionados…* → vista previa (importe y asientos
exactos, por campaña) → motivo + contraseña (+ código 2FA si lo tiene) → eliminar.
Después muestra la comparación **ANTES → DESPUÉS** y si la diferencia coincide
exactamente con lo eliminado.

### API

| Método y ruta | Para qué |
| --- | --- |
| `GET /api/admin/maintenance/expenses` | Tabla completa + resumen (acepta `?campaignId=` y `?onlyDeletable=true`) |
| `GET /api/admin/maintenance/expenses/:id` | Diagnóstico individual con todas sus dependencias |
| `POST /api/admin/maintenance/expenses/purge` | `{ ids, preview: true }` → vista previa; `{ ids, confirm, reason, password, totpCode }` → **elimina de verdad** |
| `GET /api/admin/maintenance/orphans` | Gastos y donaciones cuya campaña ya no existe |
| `GET /api/admin/maintenance/financial-check` | Cifras, asientos, discrepancias e integridad de las cadenas |
| `DELETE /api/campaigns/:id/expenses/:expenseId` | (corregido) solo superadmin y solo si el gasto es ficticio |

## 3. Las cuatro situaciones (Fase 4)

`lib/expense-cleanup.ts` (puro) decide, con la evidencia a la vista:

| Situación | Acción | ¿Se borra? |
| --- | --- | --- |
| Ficticio **sin** asiento | Eliminación definitiva | **Sí** |
| Ficticio **con** asiento de prueba y **último de la cadena** | Purga controlada (con respaldo) | **Sí**, junto con su asiento |
| Ficticio con asiento que **no** es el último de la cadena | Revisión manual | No (rompería los hashes siguientes) |
| Real **sin** asiento | Corrección autorizada | No |
| Real **contabilizado** | Anulación trazable | No |
| Campaña **protegida** (ChocoFest) | Se conserva | No |
| **Huérfano** (campaña inexistente) | Revisión manual | No |

Además: `PUT /campaigns/:id/expenses/:expenseId` **rechaza (409)** cambiar el
importe, la fecha o la categoría de un gasto contabilizado (irían contra el hash del
asiento y descuadrarían el libro sin dejar rastro).

**Regla de la cadena:** un asiento solo se retira si al quitarlo la cadena de su
campaña **sigue verificando** (comprobado con la `verifyChain` real). Nunca se
reescribe un hash.

## 4. Garantías de la operación

1. Solo **superadmin** (403 para el resto).
2. `confirm: true` + **motivo** (10+ caracteres) + **reautenticación** (contraseña, y TOTP si está activo).
3. **Respaldo verificable** por campaña en `campaign_purge_backups` (instantánea + manifiesto SHA-256 recomputable) **dentro de la misma transacción**.
4. **Una transacción PostgreSQL**: asientos primero, gastos después. Si algo falla, no se borra nada.
5. **Auditoría** permanente: `EXPENSE_DEMO_PURGED` con motivo, ids, importe y la comparación de cifras.
6. **Nunca** se tocan registros de otras campañas ni se desactivan claves ajenas.

## 5. Pruebas ejecutadas

```bash
cd artifacts/api-server && node ./build-tests.mjs && node --test tests/*.test.mjs
cd artifacts/red-solidaria && node ./build-tests.mjs && node --test tests/*.test.mjs
bash artifacts/api-server/tests/e2e/run-e2e.sh
```

**Prueba de aceptación** (E2E `7octies`, PostgreSQL real, sección completa en el log):

```
ok  un gasto ficticio SIN asiento se propone para eliminación definitiva (action=delete)
ok  un gasto ficticio CON asiento se propone para purga controlada (isTail=true)
ok  un gasto REAL con documento propio NO es eliminable
ok  eliminar un gasto REAL se rechaza (409)
ok  la vista previa dice exactamente qué se borraría (2 gastos, 200.00, 1 asiento)
ok  la eliminación se ejecuta y cuadra con lo purgado (matches=true, backupIds=[2])
ok  los gastos purgados YA NO existen en la base
ok  el total de gastos del dashboard baja EXACTAMENTE lo eliminado (5477.80 → 5277.80)
ok  el saldo del dashboard sube exactamente lo eliminado (-1959.30 → -1759.30)
ok  el gasto auténtico SIGUE intacto
ok  la cadena del libro sigue verificando tras retirar el asiento
ok  no quedan asientos huérfanos tras la purga
ok  la purga de gastos queda registrada en la auditoría
```

Cobertura del enunciado: 1) gasto sin asiento ✓ 2) varios gastos ✓ 3) rechazo de
gasto real ✓ 4) detección de huérfanos ✓ 5-6) ChocoFest protegida ✓ 7) permisos ✓
8) respaldo ✓ 9) auditoría ✓ 10) transacción ✓ 11) dashboard recalculado ✓
12) gastos purgados desaparecidos ✓ 13) gastos auténticos intactos ✓ 14) sin
referencias inconsistentes (0 asientos huérfanos) ✓

## 6. Instrucciones de despliegue

1. **Desplegar** API y frontend (no hay migración nueva: se reutiliza
   `campaign_purge_backups` de la migración 026).
2. Entrar como **superadmin** (si el 2FA está activo, hará falta el código).
3. Panel → **Mantenimiento → Gastos DEMO**.
4. Filtrar por campaña (las DEMO) o por acción *Eliminación definitiva*, seleccionar
   y eliminar con motivo y contraseña.
5. Comprobar la comparación ANTES → DESPUÉS que aparece al terminar y el dashboard
   actualizado (se invalidan las cachés automáticamente).

### Notas para producción

- Los gastos de **ChocoFest 2025/2026** aparecerán como *Revisión manual* mientras
  las campañas estén protegidas: eso es lo correcto, no un fallo.
- Un gasto con **comprobante en el almacenamiento propio** (Cloudinary de la
  organización) no se puede borrar: se corrige o se anula. Las fotos de relleno del
  seed (`unsplash`) sí se pueden eliminar.
- Si un gasto ficticio tiene un asiento que **no** es el último de su cadena, el
  gestor lo bloquea y propone la purga de la campaña completa (que retira la cadena
  entera) o la anulación.
- **Ninguna eliminación se ejecuta sola**: no hay cron ni purga automática.
