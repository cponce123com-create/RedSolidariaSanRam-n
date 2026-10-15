# INVENTARIO DEMO V9.1 — Red Solidaria San Ramón

Fecha: 2026-10-15 · Repositorio: rama `feat/implementacion-integral-2026`

## 1. Cómo se obtiene este inventario

El inventario **no se escribe a mano**: lo produce la herramienta de mantenimiento a
partir de la base real. Para reproducirlo:

```bash
# Inventario clasificado completo (JSON)
curl -s -b cookies.txt https://<host>/api/admin/maintenance/inventory | jq .inventory.byTable

# Conciliación de las cifras del panel, línea a línea (JSON)
curl -s -b cookies.txt https://<host>/api/admin/maintenance/reconciliation | jq .summary

# La misma conciliación en CSV, para conciliar en una hoja de cálculo
curl -s -b cookies.txt "https://<host>/api/admin/maintenance/reconciliation?format=csv" -o conciliacion-demo.csv
```

En el panel: **Administración → Mantenimiento → Limpieza de datos DEMO**.

> Este documento fija el MÉTODO, las reglas de clasificación y la composición
> verificable desde el repositorio. Las cifras de producción deben salir del comando
> de arriba: **no se copian de aquí**.

## 2. Reglas de clasificación (no se inventa ningún «DEMO»)

| Clasificación | Evidencia exigida |
| --- | --- |
| **DEMO confirmado** | La campaña está **declarada DEMO** (`campaigns.is_demo`, afirmación explícita y auditada del superadmin) **o** el registro lleva una **firma de relleno documentada** (medio alojado en un servicio de imágenes de ejemplo). |
| **Real confirmado** | Evidencia positiva de autenticidad: donación **conciliada con el banco** (`status = reconciled` o fecha de conciliación) o gasto con **documento alojado en el almacenamiento propio**. |
| **Protegido / compartido** | Campaña **protegida por ID** (ChocoFest 2025/2026) y todo su contenido; donante que aporta en **varias campañas**; mascota con **solicitudes de adopción**; certificado **emitido**. |
| **Pendiente de clasificación** | Todo lo demás. **No se borra nunca por decisión de la herramienta**: lo selecciona el superadmin. |

Regla explícita del enunciado, implementada y probada: **una campaña antigua NO se
clasifica DEMO por ser antigua.** Una campaña archivada sin dinero conciliado y sin
declaración DEMO queda «pendiente de clasificación».

### Firma de relleno (por qué existe esta regla)

El seed usa `images.unsplash.com/...` para TODAS las imágenes de ejemplo, **también
como comprobante de gastos de Chocofest 2025** (la campaña real que hay que
conservar). Por eso:

- un comprobante en un servicio de imágenes de ejemplo (`images.unsplash.com`,
  `picsum.photos`, `placehold.co`, `res.cloudinary.com/demo/`) **no es un documento**
  → no bloquea nada; se destruye con la campaña y queda en el respaldo;
- un comprobante alojado en el almacenamiento **propio** sí puede ser una obligación
  de conservación → **bloquea la purga** y clasifica el gasto como real.

> Corrección V9.1: antes bastaba con que `receipt_url` no estuviera vacío para
> bloquear. Eso dejaba atrapadas las campañas DEMO (sus comprobantes son fotos de
> relleno) sin proteger ningún documento real.

## 3. Qué analiza la herramienta

14 conjuntos de datos: `campaigns`, `donations`, `campaign_expenses`,
`campaign_movements`, `donors`, `pets`, `adoption_requests`, `allies`, `news`,
`community_reports`, `certificates`, `volunteers`, `campaign_evidence`,
`campaign_images`.

Se devuelve, por cada registro: tabla, id, etiqueta, clasificación, **motivo**
(evidencia concreta), campaña e importe. Más el resumen por tabla
(`inventory.byTable`) y por clasificación (`inventory.totals`).

## 4. Composición conocida de los datos sembrados (verificable en el repositorio)

Estos valores son constantes del código, no mediciones de producción. Sirven para
**interpretar** el informe, no para sustituirlo.

| Origen | Dato | Valor | Fichero |
| --- | --- | --- | --- |
| Chocofest 2025 | Recaudación en efectivo | **S/ 2 818.50** | `lib/chocofest-2025-data.ts` → `CHOCOLATADA_2025_CASH_TOTAL` |
| Chocofest 2025 | Gastos | **S/ 2 912.80** | `lib/chocofest-2025-data.ts` → `CHOCOLATADA_2025_EXPENSES_TOTAL` |
| Seed | Campañas DEMO | 6 | `lib/seed.ts` (Escolar 2025, Rescate Animal, Techado, Brigada Médica, Calor Adultos Mayores, Agua Limpia) |
| Seed | Gastos DEMO (ejemplos) | Escolar 1 500 + 80 + 200 · Rescate 450 | `lib/seed.ts` |
| Seed | Comprobantes | Foto de relleno `RECEIPT_DEMO` | `lib/seed.ts` |

## 5. Origen de las cifras reportadas (diagnóstico)

Las tres cifras encajan con la composición conocida:

```
Recaudación  ≈ 2 818.50   →  donaciones confirmadas de Chocofest 2025 (DINERO REAL)
Gastos       ≈ 6 963.00   →  2 912.80 (Chocofest, real) + ~4 050.20 (campañas DEMO)
Saldo        = 2 818.50 − 6 963.00 = −4 144.50  →  ≈ −4 144
```

**Conclusión:** la recaudación es dinero real de Chocofest 2025 y **debe quedarse**;
el saldo negativo lo provocan los **gastos de las campañas DEMO**, que es
exactamente lo que hay que retirar. No hay que ocultar nada con filtros: al purgar
las campañas DEMO sus gastos desaparecen y el saldo pasa a ser el de Chocofest.

La herramienta confirma o corrige esto línea a línea: cada importe se atribuye a su
campaña, id, fecha, estado y clasificación, y el CSV cierra con el saldo publicado y
su fórmula.

## 6. Discrepancias del libro contable

El informe (`GET /api/admin/ledger/audit`) distingue ahora:

| Hallazgo | Significado | Tratamiento |
| --- | --- | --- |
| `donationsWithoutMovement` | Donación confirmada sin asiento | Regularizar **si es real**; si es de una campaña DEMO, desaparece con la purga |
| `movementsWithoutSource` | Asiento cuyo origen no existe | Investigar; nunca reescribir el hash |
| `amountMismatches` / `campaignMismatches` | Importe o campaña incoherentes | Corregir con **asiento compensatorio**, jamás reescribiendo el histórico |
| `unbalancedCampaigns` | El neto del libro no cuadra con el de sus orígenes | Conciliar (ver §6 de `AUDITORIA_POST_LIMPIEZA_V9_1.md`) |
| `zeroAmountMovements` | Asiento de importe 0 | No debe existir: no corrige nada |
| `status: "empty"` | La cadena no tiene movimientos | La interfaz muestra «Libro sin movimientos», **no** «cadena verificada» |

El hallazgo DB-09 del seed (donaciones confirmadas sin asiento) es **preexistente**:
no lo provocan la purga ni la anulación. Se regulariza, no se «oculta».
