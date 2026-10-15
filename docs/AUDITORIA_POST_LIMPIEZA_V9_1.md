# AUDITORÍA POST-LIMPIEZA V9.1 — Red Solidaria San Ramón

Se ejecuta **después** de la limpieza confirmada por el superadmin. Este documento
es el procedimiento y los criterios de aceptación; los resultados se rellenan con la
salida de los comandos contra la base real.

## 1. Campañas: solo ChocoFest 2025 y 2026

```bash
curl -s -b cookies.txt https://<host>/api/campaigns | jq -r '.[] | "\(.id)	\(.status)	\(.title)"'
```

- [ ] Solo quedan **Chocofest 2025** y **Chocofest 2026** (más lo que el superadmin
      decida conservar explícitamente).
- [ ] Ninguna campaña tiene `is_demo = true`.
- [ ] `GET /api/admin/maintenance/inventory` → `inventory.totals.demo` = **0**.

## 2. Cifras del panel

```bash
curl -s -b cookies.txt https://<host>/api/admin/dashboard | jq .summary
curl -s -b cookies.txt https://<host>/api/admin/maintenance/reconciliation | jq .summary
```

- [ ] La conciliación **reproduce exactamente** la recaudación, los gastos y el
      saldo del panel (el E2E lo comprueba en cada ejecución).
- [ ] `demoRaised` y `demoSpent` = **0**: no queda importe DEMO en ninguna cifra.
- [ ] El saldo es la diferencia entre ingresos y gastos **reales**; si es negativo,
      cada gasto que lo explica está identificado con su id y su comprobante.
- [ ] `pendingRaised`/`pendingSpent` = 0 **o** está documentado qué registro queda
      pendiente y por qué.

## 3. Consistencia de las gráficas

- [ ] La gráfica mensual suma **solo donaciones confirmadas** (mismo criterio que la
      cifra de cabecera: antes incluía pendientes, rechazadas y anuladas).
- [ ] El top de campañas usa la **misma regla de conciliación** que el sitio público.
- [ ] No hay importes duplicados: el histórico solo cuenta en campañas **sin**
      donaciones registradas.
- [ ] No existe ningún filtro por **nombre** de campaña en el código del panel
      (ninguna cifra se oculta por llamarse «DEMO»).

## 4. Libro contable

```bash
curl -s -b cookies.txt https://<host>/api/admin/ledger/audit | jq '{status, movementCount, healthy}'
curl -s -b cookies.txt https://<host>/api/admin/ledger/audit | jq '{donationsWithoutMovement, movementsWithoutSource, amountMismatches, campaignMismatches, duplicateMovements, zeroAmountMovements, unbalancedCampaigns}'
```

- [ ] `status` es `healthy` o, si la cadena está vacía, `empty` (la interfaz muestra
      **«Libro sin movimientos»**, nunca «cadena verificada»).
- [ ] `movementsWithoutSource` = 0: no quedan asientos huérfanos de campañas DEMO.
- [ ] `zeroAmountMovements` = 0: no hay asientos de importe cero.
- [ ] `donationsWithoutMovement` = 0 **o** cada caso es una donación real
      regularizada con su asiento (nunca un hallazgo oculto).
- [ ] `unbalancedCampaigns` vacío. Los descuadres preexistentes del seed (DB-09) se
      regularizan con asiento compensatorio; **no** se reescribe ningún hash.
- [ ] La cadena verifica (`chain.verified = true`) y el número de asientos coincide
      con el de orígenes confirmados.

## 5. Contenido y datos compartidos

- [ ] Mascotas y adopciones: sin contenido DEMO confirmado; ninguna mascota con
      solicitudes quedó huérfana.
- [ ] Reportes comunitarios, certificados y participaciones: **desvinculados**, no
      borrados (`campaign_id = NULL`).
- [ ] Donantes, voluntarios y noticias: **intactos** (nunca se tocan).
- [ ] Aliados, noticias y evidencias: sin medios de relleno.

## 6. Respaldo y auditoría

- [ ] Cada purga tiene su fila en `campaign_purge_backups` con manifiesto SHA-256
      **verificable**.
- [ ] `audit_logs` conserva: `CAMPAIGN_DEMO_MARKED`, `CAMPAIGNS_DEMO_DECLARED_BULK`,
      `CAMPAIGNS_PROTECTED`, `CAMPAIGN_DEMO_PURGED`, `ADMIN_REAUTH_FAILED`, con
      motivo y actor.
- [ ] Ningún registro de auditoría ni respaldo fue eliminado.

## 7. Permisos

- [ ] Todas las rutas de mantenimiento responden **403** a un `administrador` y
      **401** sin sesión.
- [ ] Declarar DEMO, proteger y purgar exigen **reautenticación** (contraseña + TOTP
      si está activo) y **motivo** de 10+ caracteres.
- [ ] Una campaña **protegida** no se puede declarar DEMO ni purgar (`409`).

## 8. Pruebas automáticas (ejecutadas en esta entrega)

```bash
cd artifacts/api-server && node ./build-tests.mjs && node --test tests/*.test.mjs
cd artifacts/red-solidaria && node ./build-tests.mjs && node --test tests/*.test.mjs
bash artifacts/api-server/tests/e2e/run-e2e.sh
```

- [x] API: **578 / 578** ok (incluye clasificación DEMO, conciliación, protección y
      autorización de mantenimiento).
- [x] Frontend: **215 / 215** ok.
- [x] E2E contra PostgreSQL real: **todo OK**, incluida la sección `7sexies`
      (inventario, protección por ID, `409` en la purga de una campaña protegida y
      **igualdad exacta** entre la conciliación y el panel).

## 9. Qué falta (declarado, no ocultado)

1. **Interfaz del panel** para las rutas de mantenimiento: hoy se usan con la API
   (los `curl` de este documento). El backend está probado y listo.
2. **Borrado individual del contenido suelto** (mascotas, aliados, noticias,
   reportes): el inventario ya lo clasifica con su motivo; falta la ejecución
   selectiva con respaldo.
3. **Ejecución en producción**: pendiente de la confirmación del superadmin. Este
   documento no se rellena con cifras inventadas: se completa con la salida real de
   los comandos.
