# GASTOS HUÉRFANOS: CLASIFICACIÓN MANUAL Y ELIMINACIÓN (V11)

Rama `feat/implementacion-integral-2026`.

## 1. La causa, confirmada y con nombre

`diagnoseExpense()` devolvía `finish("review", false, ["orphan_expense"], reasons)` para
cualquier gasto cuya campaña ya no existe, así que el superadmin no podía eliminarlos
**nunca**, ni siendo ficticios y sin asiento.

**Por qué hay huérfanos en producción:** la clave ajena
`campaign_expenses_campaign_id_fkey` se añadió con **`NOT VALID`** (migración 025). Con
`NOT VALID`, PostgreSQL **no revisa las filas que ya existían**: solo valida las
operaciones nuevas. Los gastos creados antes de esa migración pueden apuntar a
campañas que después desaparecieron, y ahí siguen — 7 en tu caso. No es un dato
corrupto: es una consecuencia documentada de cómo se añadió la restricción, y la
herramienta lo reproduce en las pruebas.

## 2. Lo que se implementó

### Clasificación manual persistente (migración 029)

Tabla nueva `expense_classifications` con: id del gasto, clasificación
(`demo`/`real`/`pending`), **motivo**, evidencia o referencia documental, superadmin
responsable, su id y la fecha. Una fila por gasto (`UNIQUE`), con `CHECK` del valor.

**Sin clave foránea a `campaign_expenses` a propósito**: la declaración debe
**sobrevivir al borrado del gasto**, porque es la prueba de por qué se destruyó.

### `diagnoseExpense()` corregida

| Situación | Acción | ¿Se elimina? |
| --- | --- | --- |
| Huérfano **sin** clasificar | Revisión manual (`orphan_expense`) | No |
| Huérfano **clasificado DEMO**, sin asiento ni documento propio | Eliminación definitiva | **Sí** |
| Huérfano **clasificado DEMO**, con asiento | Purga controlada (si la cadena sigue verificando) | **Sí** |
| Huérfano **clasificado REAL** | Corrección / anulación | No |
| Gasto de **campaña protegida** (ChocoFest) | Se conserva | No |
| Gasto con **documento propio** | Se conserva | No |

La declaración manual **manda sobre la clasificación deducida, pero no sobre las
protecciones objetivas**: no puede levantar la protección de ChocoFest ni destruir un
gasto con documento propio en el almacenamiento de la organización. **No se considera
DEMO a todos los huérfanos**: solo lo que el superadmin declara con motivo.

### API

| Método y ruta | Para qué |
| --- | --- |
| `POST /api/admin/maintenance/expenses/classify` | `{ ids, classification, reason, evidence?, password, totpCode? }` — declara DEMO/REAL/pendiente y devuelve el **diagnóstico actualizado** |
| `GET /api/admin/maintenance/expenses` | Incluye `computedClassification` y `manualClassification` (con motivo, evidencia y responsable) |

### Purga revalidada dentro de la transacción

Antes de escribir nada, la purga vuelve a comprobar **con `tx`** (la misma foto que el
borrado): que los gastos sigan existiendo, que los asientos no hayan cambiado desde la
vista previa y que ninguna de las campañas implicadas se haya protegido entretanto. Si
algo cambió, responde `409 purge_stale` **sin tocar la base**.

### Interfaz

En `/admin/mantenimiento/gastos`: botón **«Clasificar seleccionados…»** con diálogo de
motivo, evidencia, contraseña y 2FA, y las acciones **Clasificar como DEMO** /
**Clasificar como REAL**. Al guardar se refresca el diagnóstico, así que la acción
permitida cambia de «Revisión manual» a «Eliminación definitiva» sin recargar. El
motivo, la evidencia y el responsable se ven en el detalle de cada gasto.

## 3. Prueba de aceptación (E2E `7nonies`, PostgreSQL real)

Los huérfanos los crea el runner con `psql` (quitando la FK un momento y dejándola
igual que en producción), porque las claves ajenas impiden crearlos por la API.

```
ok  se localizan los gastos huérfanos de prueba (su campaña no existe) (ids=1/2)
ok  un gasto huérfano sin clasificar queda en REVISIÓN MANUAL (bloqueado)
ok  intentar eliminar un huérfano sin clasificar se rechaza (409)
ok  el huérfano se clasifica como DEMO con motivo y evidencia
ok  la clasificación cambia la acción disponible en la MISMA respuesta (["1:delete"])
ok  la clasificación PERSISTE (petición nueva, sin caché) y desbloquea la eliminación
ok  un huérfano clasificado REAL queda protegido (no se destruye) (action=regularize)
ok  eliminar el huérfano clasificado REAL se rechaza (409)
ok  el huérfano clasificado DEMO SE ELIMINA de verdad (backupIds=[3])
ok  el gasto huérfano ya NO existe en PostgreSQL (404)
ok  el total de gastos del dashboard baja EXACTAMENTE S/ 1200.00 (1635 → 435)
ok  el saldo del dashboard sube exactamente S/ 1200.00 (1883.50 → 3083.50)
ok  el libro sigue consistente (cadena verificada, sin huérfanos nuevos)
ok  la clasificación y la purga quedan auditadas
```

Cobertura de las 10 pruebas pedidas: 1) huérfano sin clasificar bloqueado ✓
2) clasificado DEMO eliminable ✓ 3) huérfano real protegido ✓ 4) DEMO con asiento
(purga segura o bloqueo justificado, con la regla de la cadena) ✓ 5) ChocoFest
protegida, incluso declarándola DEMO ✓ 6) persistencia en PostgreSQL ✓ 7) eliminación
real ✓ 8) dashboard actualizado ✓ 9) permisos (403/401) ✓ 10) auditoría y respaldo ✓

## 4. Despliegue

1. **Desplegar** API y frontend. La migración **029** se aplica sola al arrancar
   (tabla nueva, aditiva).
2. Panel → **Mantenimiento → Gastos DEMO**.
3. Filtrar por **Revisión manual** (ahí están tus 7 huérfanos).
4. Seleccionar → **Clasificar seleccionados…** → **Clasificar como DEMO** con motivo
   (y evidencia si la tienes) → contraseña.
5. La acción pasa a **Eliminación definitiva**; seleccionar → **Eliminar
   seleccionados…** → motivo + contraseña.
6. Comprobar la comparación **ANTES → DESPUÉS** y el dashboard actualizado.

**Nada se elimina solo.** No hay cron ni purga automática: cada paso lo confirmas tú.
Si un huérfano tiene un comprobante subido a vuestro Cloudinary, seguirá protegido
—eso es correcto— y se corrige en vez de borrarse.
