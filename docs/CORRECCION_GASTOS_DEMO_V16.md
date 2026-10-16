# Corrección GASTOS DEMO V16 — Gastos reales sin asiento y regularización

Rama `feat/implementacion-integral-2026`.

## 1. El síntoma

15 gastos de Chocofest 2025 por **S/ 2,912.80** aparecían en Mantenimiento → Gastos DEMO
como **«Real confirmado»** y con la acción **«Corrección autorizada (le falta asiento)»**,
sin forma de resolverlo desde el panel.

## 2. La causa, confirmada

| Comprobación | Resultado |
|---|---|
| ¿El módulo lista solo DEMO? | **No.** `/admin/mantenimiento/gastos` lista TODOS los `campaign_expenses` y les asigna una acción. Es un diagnóstico, no un listado de ficticios. |
| ¿Son los 15 de Chocofest 2025? | **Sí.** Coinciden exactamente con `CHOCOLATADA_2025_EXPENSES` (`lib/chocofest-2025-data.ts`) y su suma es **S/ 2,912.80**. |
| ¿Por qué «Real confirmado»? | Su clasificación efectiva es `real` (declaración manual REAL o comprobante en el almacenamiento propio). |
| ¿Por qué «le falta asiento»? | **No tienen fila en `campaign_movements`.** |
| **¿Por qué no tienen asiento?** | **`scripts/src/apply-chocofest-2025.ts` insertaba los gastos con Drizzle DIRECTAMENTE**, sin pasar por `POST /campaigns/:id/expenses`, que es el ÚNICO sitio donde se crea el asiento (`if (exp.isPublic) appendMovement(...)`). El script creaba campaña, donaciones, updates, galería, gastos, evidencias y sobrantes… pero **nunca los asientos de los gastos**. |
| ¿Es caché o dato corrupto? | **No.** Es un asiento que nunca se escribió. |
| ¿Por qué no se resolvía? | `regularize` **no tenía ninguna acción ejecutable** (ni endpoint ni botón). |

## 3. Lo que se corrigió

1. **Herramienta «Regularizar gastos reales» (nueva).**
   - `GET /admin/maintenance/expenses/regularize/preview` — plan de solo lectura.
   - `POST /admin/maintenance/expenses/regularize` — apila el asiento que falta.
   - Exige superadmin, `confirm`, motivo (10+), referencia de evidencia y reautenticación
     (contraseña + 2FA). Todo queda en la auditoría (`EXPENSE_REGULARIZED`).
2. **Idempotencia y no duplicación.** Dentro de la transacción se vuelve a comprobar que
   cada gasto sigue existiendo y **sin asiento**; si alguno ya lo tiene, no se escribe
   NADA. El índice único `(source_type, source_id)` es la guarda final.
3. **Diagnóstico de la relación gasto↔libro (nuevo).** Antes solo se distinguía «tiene /
   no tiene asiento». Ahora se reporta `missing | ok | wrong_campaign | amount_mismatch |
   duplicate | wrong_kind`, y un asiento mal relacionado **no se regulariza** (se revisa).
4. **Solo gastos REALES.** Un gasto DEMO o pendiente **nunca** se regulariza: no se
   convierten ficticios en reales. La puerta es la clasificación efectiva `real`.
5. **Separación en el panel.** Segmentos **«DEMO y pendientes»** (por defecto), **«Reales»**
   y **«Pendientes de regularización»**. Los gastos reales ya regularizados **desaparecen
   del listado DEMO** y permanecen en «Reales» y en los reportes del libro.
6. **Causa raíz corregida.** `apply-chocofest-2025.ts` ahora crea el asiento de cada gasto
   público al insertarlo, igual que la API.

## 4. Integridad

- **Sin migración.** La operación es **aditiva**: apila un asiento; no borra ni edita
  historial (el libro es append-only). No requiere respaldo destructivo; la **vista previa**
  es la validación previa y la **re-verificación dentro de la transacción** garantiza que
  la comprobación y la escritura son la misma foto.
- **Totales intactos.** `verifyRegularizationTotals` comprueba que el número y el total de
  gastos, el total de donaciones y el saldo **no cambian**, y que los asientos suben
  exactamente N. Si algo más cambió, la interfaz lo avisa en rojo.

## 5. Pruebas

| Comprobación | Resultado |
|---|---|
| `node --test` API (incluye `expense-regularization`) | **676/676** ✅ |
| `node --test` frontend | **236/236** ✅ |
| typecheck API / frontend / scripts | **sin errores** ✅ |
| build web + build API | **OK** ✅ |

Pruebas clave de `tests/expense-regularization.test.mjs`: relación correcta/incorrecta,
**nunca regulariza DEMO**, **no duplica** (idempotencia), huérfano sin campaña, validación,
y **totales invariantes**.

## 6. Cómo regularizar en producción (requiere Neon)

1. Entrar como superadmin → **Mantenimiento → Gastos DEMO**.
2. Grupo **«Pendientes de regularización»** → seleccionar (o «seleccionar todos los visibles»).
3. **«Regularizar gastos reales…»** → revisar la vista previa → motivo + evidencia
   (p. ej. «informe de rendición Chocofest 2025») + contraseña + 2FA → **Regularizar**.
4. Comprobar el resumen ANTES→DESPUÉS: gastos/donaciones/saldo **iguales**, asientos +N.
5. Verificar en el libro: `GET /admin/ledger/audit` sin discrepancias nuevas y cadena
   verificada. Los gastos ya **no** aparecen como pendientes y siguen en transparencia.

## 7. Riesgos

- El asiento se crea con la **fecha original** del gasto (conserva cronología); queda al
  final de la cadena por `id`, y como la verificación es por orden de `id`, la cadena sigue
  verificando.
- Un gasto con asiento **mal relacionado** no se regulariza: se marca para revisión manual.
- Los registros ya insertados en producción los resuelve la herramienta; la corrección del
  script solo evita que vuelva a ocurrir en cargas futuras.
