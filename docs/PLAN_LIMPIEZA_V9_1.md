# PLAN DE LIMPIEZA V9.1 — Red Solidaria San Ramón

Objetivo: que solo permanezcan **Chocofest 2025** y **Chocofest 2026**, sin ocultar
cifras mediante filtros, y con el libro contable consistente.

## 1. Orden de operaciones (importa)

```
1. Proteger ChocoFest            (por ID real, resuelto de la base)
2. Inventariar                   (clasificar todo: real/DEMO/pendiente/protegido)
3. Conciliar                     (atribuir cada cifra del panel a su registro)
4. Declarar DEMO en bloque       (afirmación explícita del superadmin, auditada)
5. Vista previa de la purga      (registros exactos que se van a destruir)
6. Purga por campaña             (transacción única + respaldo verificable)
7. Contenido suelto              (mascotas, reportes, aliados, noticias…)
8. Re-auditar                    (libro, saldos, hashes, dashboard)
9. Regularizar                   (solo operaciones auténticas, con asiento compensatorio)
```

Cada paso es reversible hasta el 6 (todo lo anterior solo lee o marca). El 6 es
irreversible y por eso exige reautenticación, motivo y respaldo.

## 2. Protección de ChocoFest (Fase 2)

```bash
curl -s -X POST -b cookies.txt -H 'Content-Type: application/json' 
  -d '{"confirm":true,"reason":"Proteger ChocoFest 2025 y 2026 antes de la limpieza","password":"<tu contraseña>"}' 
  https://<host>/api/admin/maintenance/protect-campaigns | jq .protectedCampaignIds
```

- Las candidatas se **resuelven contra la base** por patrón documentado
  (`chocofest`/`chocolatada` + año 2025/2026) y se guardan **por ID** en
  `settings.protected_campaign_ids`.
- A partir de ahí **ninguna purga ni declaración DEMO** puede tocar esas campañas:
  responden `409 protected_campaign`. La comprobación la hace el servidor antes de
  la reautenticación, no depende de la interfaz.
- Es **acumulativo**: proteger no desprotege. Quitar una protección exige una acción
  explícita.

## 3. Limpieza de campañas (Fase 4)

Por cada campaña que deba desaparecer:

1. **Vista previa** (`POST /api/campaigns/:id/demo-purge/preview`): devuelve el
   veredicto, los **bloqueos** con su motivo, los avisos y los recuentos exactos.
2. **Declaración DEMO** (`POST /api/campaigns/:id/demo-mark`, o en bloque con
   `POST /api/admin/maintenance/declare-demo`): afirmación explícita + motivo +
   reautenticación. Queda auditada.
3. **Purga** (`POST /api/campaigns/:id/demo-purge`): reautenticación, motivo,
   confirmación, **una sola transacción PostgreSQL** con bloqueo de filas y
   `campaign_purge_backups` (instantánea + manifiesto SHA-256) **antes** de borrar.
   Los activos externos (Cloudinary) se limpian **después** del commit.

Bloqueos que impiden la purga (el servidor los recalcula, no se fían de la
declaración): `reconciled_donations`, `expenses_with_receipt` (documento propio),
`leftovers_with_flow`, `evidence_documental`, `ledger_chain_broken`,
`ledger_foreign_movements`. Avisos que no bloquean: `placeholder_receipts`,
`donation_annulled`.

Orden de borrado impuesto por las claves ajenas: `campaign_movements` **primero**,
`campaigns` **al final**. Nunca se borran donantes, voluntarios ni noticias; los
reportes, certificados y participaciones se **desvinculan** (FK a NULL).

## 4. Contenido suelto (Fase 7)

El inventario presenta mascotas, adopciones, aliados, noticias, reportes,
certificados, voluntarios, evidencias e imágenes con su clasificación y su motivo.
Se seleccionan **individualmente**; la herramienta nunca decide sola.

Reglas ya activas en el inventario:

- mascota con **solicitudes de adopción** → protegida (no se borra sin resolverlas);
- certificado **emitido** → protegido (se **revoca**, no se borra);
- donante que aporta en **varias campañas** → protegido (dato compartido);
- contenido cuya única firma es un medio de relleno → DEMO confirmado.

## 5. Estado de la entrega

| Fase | Estado |
| --- | --- |
| 1 · Inventario integral | **Hecho** (`GET /api/admin/maintenance/inventory`) |
| 2 · Protección de ChocoFest | **Hecho** (por ID, aplicada en las purgas) |
| 3 · Diagnóstico de las cifras | **Hecho** (`/reconciliation` + CSV) |
| 4 · Limpieza segura de campañas | **Hecho** (reutiliza la purga DEMO, ya probada) |
| 5 · Dashboard | **Hecho** (gráfica mensual alineada con la cifra de cabecera) |
| 6 · Libro contable | **Hecho** (estado `empty`, asientos de importe 0, conciliación) |
| 7 · Inventario de contenido | **Hecho** (clasificado y con motivos) |
| 7 · Borrado individual de contenido | **Pendiente** (siguiente iteración) |
| 8 · Pruebas | **Hecho** (unitarias, HTTP y E2E contra PostgreSQL real) |
| — · Interfaz del panel | **Pendiente** (siguiente iteración; hoy se usa la API) |

**Nada se ejecuta automáticamente**: no hay cron, ni purga al arrancar, ni al
archivar. La limpieza la confirma el superadmin.

## 6. Reversión

- Antes del paso 6, todo es lectura o marcas: se deshace quitando la declaración.
- Tras el paso 6, la campaña y sus datos están en `campaign_purge_backups`
  (instantánea JSON + manifiesto SHA-256 verificable con
  `verifyDemoPurgeManifest`). El respaldo **no tiene FK a `campaigns`**, así que
  sobrevive a la purga.
- Los asientos del libro **nunca** se reescriben: las correcciones son asientos
  compensatorios (`donation_reversal`).
