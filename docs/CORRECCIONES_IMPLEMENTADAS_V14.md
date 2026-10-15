# CORRECCIONES IMPLEMENTADAS V14 — Entrega 1 (seguridad crítica)

Rama `feat/implementacion-integral-2026`.

## Línea base (antes de tocar nada)

| Comprobación | Resultado |
| --- | --- |
| `tsc` en `lib/db`, `api-server`, `red-solidaria`, `scripts` | Sin errores |
| API (unitaria + HTTP) | 594/594 ok |
| Frontend (pura) | 226/226 ok |
| E2E PostgreSQL 17.7 real | 201 comprobaciones ok, 0 fallos |
| Migraciones aplicadas | 29 |

## Hallazgos corregidos

### V14-01 · Fuga de datos privados y de fichas no aprobadas (mascotas) — CRÍTICA

**Módulo:** Adopciones · **Archivo:** `artifacts/api-server/src/routes/pets.ts`

**Evidencia (código anterior):**

```ts
const filters: any[] = [eq(petsTable.status, (status as string) || "available")];
...
const [pet] = await db.select().from(petsTable).where(eq(petsTable.id, id));
res.json(pet);   // fila COMPLETA
```

**Impacto:** la ruta pública `GET /pets` aceptaba **cualquier** `?status=`, así que
`?status=reviewing` (o `inactive`, o un valor inventado) listaba fichas **sin aprobar**.
Y las tres rutas públicas devolvían la **fila entera**, incluidos
`contactName`, `contactPhone` y `contactEmail` de la persona que envió la ficha
(datos personales de un tercero), más la marca interna `submittedByPublic`.
`GET /pets/:id` no filtraba por estado **en absoluto**: cualquiera podía recorrer IDs y
extraer todas las fichas privadas con su contacto.

**Severidad:** Crítica (exposición de PII de terceros + contenido no aprobado).
**Corrección aplicada:**
- `PUBLIC_PET_STATUSES` como **allowlist**; el `?status=` del cliente se valida y, si no
  es público, responde **400** (no se puede manipular el filtro).
- El filtro por estado público **no depende del cliente**.
- Nuevo **DTO público** `formatPublicPet` construido **por inclusión** (22 campos): sin
  contacto ni marcas internas.
- `GET /pets/:id` filtra por `id` **y** estado público → 404 si no es publicable.
- `POST /pets/submit` responde con el DTO público (no repite lo enviado ni lo interno).
- El **DTO administrativo sigue siendo la fila completa** (el panel necesita el contacto
  para gestionar la adopción).

**Prueba:** E2E `7decies` (7 comprobaciones) — ver más abajo.

### V14-02 · El registro público de voluntarios devolvía campos administrativos — ALTA

**Módulo:** Voluntarios · **Archivo:** `artifacts/api-server/src/routes/volunteers.ts`

**Evidencia (código anterior):** `POST /volunteers` (ruta **pública**) terminaba con
`res.status(201).json(formatVolunteer(volunteer))`, y `formatVolunteer` incluye
`adminNotes` (notas internas del equipo) y `approvedBy` (quién la aprobó), además de
`allowedTransitions` (el mapa interno de estados).

**Impacto:** el formulario público revelaba campos administrativos y la estructura
interna del flujo de aprobación. `adminNotes` nace vacío, pero el campo se expone y
cualquier nota añadida después por el equipo viajaría en ese contrato.
**Severidad:** Alta (fuga de información interna por una ruta pública).
**Corrección aplicada:** nuevo `formatPublicVolunteer` con **divulgación mínima**:
`id`, `name`, `status`, `statusLabel`, `publicToken` (el enlace propio que la interfaz
debe mostrarle) y `createdAt`. Sin `adminNotes`, sin `approvedBy`, sin
`allowedTransitions`. El listado administrativo sigue usando `formatVolunteer` completo.

**Prueba:** E2E `7decies` — la respuesta trae exactamente
`["id","name","status","statusLabel","publicToken","createdAt"]`.

## Prueba de la entrega (E2E `7decies`, PostgreSQL real)

```
ok  la ficha enviada por el público se registra en revisión (201)
ok  la respuesta del envío NO repite los datos de contacto ni marcas internas
ok  una ficha EN REVISIÓN no es consultable públicamente (404)
ok  la ficha en revisión no aparece en el listado público
ok  un estado no público se RECHAZA (400): no se puede manipular el filtro
ok  tampoco cuela un estado inventado (400)
ok  la administración publica la ficha (200)
ok  ya publicada, la ficha se consulta públicamente (200)
ok  el DTO público NO expone contacto ni marcas internas
ok  el DTO público SÍ lleva lo que la web necesita
ok  el DTO ADMINISTRATIVO conserva los datos de contacto
ok  el registro de voluntario responde 201
ok  el registro público NO devuelve notas internas ni quién aprobó
ok  el registro público devuelve lo mínimo (estado y enlace de seguimiento)
```

| Comprobación | Después |
| --- | --- |
| API | 594/594 ok |
| Frontend | 226/226 ok |
| E2E PostgreSQL real | **215 comprobaciones ok, 0 fallos** |
| Typecheck + build | Sin errores |

### V14-05 · El panel podía quedarse sin ningún superadministrador — CRÍTICA

**Módulo:** Usuarios · **Archivos:** `routes/admin-users.ts`, `lib/admin-user-guards.ts` (nuevo)

**Evidencia (código anterior):** ni el borrado ni la edición comprobaban nada más allá
de «eres superadmin»:

```ts
router.delete("/admin/users/:id", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403)...
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, userId));
```

**Impacto:** un superadmin podía **eliminar su propia cuenta** (fuera al instante) o
**eliminar, desactivar o degradar al último superadmin activo**, dejando el panel sin
nadie capaz de administrarlo. Bloqueo total y sin recuperación desde la interfaz.
Además, desactivar a alguien o cambiarle el rol **no revocaba su sesión**: seguía
trabajando con los permisos antiguos hasta que caducara la cookie.

**Severidad:** Crítica (pérdida de control del panel + permisos obsoletos activos).
**Corrección aplicada:**
- `lib/admin-user-guards.ts` (PURA): `guardDeleteAdminUser`, `guardUpdateAdminUser`
  (`self_deletion`, `self_deactivation`, `last_superadmin`, `invalid_role`) y
  `shouldRevokeSessions`. Las reglas viven en el **servidor**, no en botones.
- Ambos handlers se ejecutan dentro de una **transacción con `SELECT ... FOR UPDATE`**
  que bloquea las filas de administradores: el recuento y la escritura son la misma
  foto, así que dos peticiones simultáneas no pueden dejar el panel sin superadmin
  (condición de carrera cubierta).
- **Revocación de sesiones** (`revokeAdminSessions`, borra las filas de la tabla
  `session` cuyo `sess->adminUser->>id` coincide) al eliminar, desactivar o cambiar el
  rol: el efecto es inmediato.
- Auditoría ampliada: `previousRole`, `revokedSessions` y `revokeReason`.
- Un rol inventado se rechaza con 400 (no hay escalada a roles inexistentes).

**Prueba:** 12 pruebas puras (`tests/admin-user-guards.test.mjs`) + E2E `7undecies`
(10 comprobaciones, PostgreSQL real). La guarda saltó incluso contra mi propia prueba de
limpieza: al quedar un solo superadmin, su borrado devolvió 409.

### V14-06 · Defensa CSRF por origen (defensa en profundidad) — MEDIA

**Módulo:** Sesiones/autenticación · **Archivos:** `app.ts`, `lib/csrf-origin.ts` (nuevo)

**Auditoría previa (lo que YA estaba bien, con evidencia):**

| Punto | Estado | Evidencia |
| --- | --- | --- |
| Cookie de sesión | ✅ | `httpOnly: true`, `secure` resuelto por entorno, `maxAge` 24 h, `rolling: true` |
| CSRF (base) | ✅ | `sameSite: "lax"`: un formulario cross-site **no** envía la cookie en un POST |
| Store de sesiones | ✅ | PostgreSQL (`connect-pg-simple`), no `MemoryStore`: sobrevive a reinicios y escala |
| Fijación de sesión | ✅ | `establishAdminSession` usa `req.session.regenerate()` al iniciar sesión |
| CORS | ✅ | `resolveCorsOrigin`: origen explícito o el dominio del sitio; `true` **solo** en desarrollo. Sin comodín con credenciales |
| `SESSION_SECRET` | ✅ | Obligatorio en producción (si falta, el arranque falla) |
| Cabeceras | ✅ | `helmet`, `trust proxy` para la IP real, `x-powered-by` fuera |
| Secretos en logs | ✅ | Ningún `req.log` registra `password`, `token`, `secret` ni el cuerpo completo |
| Fuerza bruta en login | ✅ | `loginLimiter` + bloqueo de 2FA (5 intentos por origen y cuenta) |

**Lo que faltaba (y se ha añadido):** ninguna capa comprobaba el **origen** de una
petición de escritura. Si algún día se relajara `sameSite`, o llegara una petición desde
un navegador antiguo, no había red de seguridad.

**Corrección aplicada:** `createCsrfOriginGuard` montado en `/api` **antes** de la sesión,
los limitadores y las rutas. Para POST/PUT/PATCH/DELETE:
`Sec-Fetch-Site: cross-site` → 403; `Origin` ausente → se acepta (no es un navegador);
`Origin` con el **mismo host** que la petición → se acepta (el panel consigo mismo, así no
se rompen los despliegues que entran por la URL de Render); `Origin` en la lista de CORS →
se acepta; cualquier otro → **403**.

**Prueba:** 12 pruebas (`tests/csrf-origin.test.mjs`): lecturas nunca restringidas, origen
ajeno rechazado, `Sec-Fetch-Site: cross-site` rechazado, mismo host aceptado, lista de CORS
aceptada, sin `Origin` aceptado, `Origin` mal formado no cuela, y el middleware sobre un
servidor real (bloquea la escritura cross-site y deja pasar la del panel). El E2E completo
sigue verde (227 ok), que es la prueba de que **no rompe nada**.

## Entrega 2 · Integridad financiera (en curso)

### V14-07 · Semántica de fechas del panel, sin declarar — MEDIA

**Módulo:** Dashboard · **Archivos:** `routes/dashboard.ts`, `lib/dashboard-filters.ts`

**Auditoría (resultado real, no el esperado):** las tarjetas y la gráfica mensual **ya
usan el mismo criterio** para cada cifra —donaciones por `d.created_at` en ambas, gastos
por `e.date` en ambas—, así que **no había divergencia tarjeta/gráfica**. Lo que sí había
era un problema **semántico**: donaciones y gastos se filtran por campos con significados
distintos (fecha de **registro** vs fecha de **operación**) y la API no lo decía, así que
cualquiera que intentara conciliar dos informes con el mismo rango de fechas llegaba a
conclusiones equivocadas.

No es un descuido del código: la tabla `donations` no guarda una fecha de operación
aparte del registro. La corrección honesta es **declararlo**.

**Corrección aplicada:** `DASHBOARD_DATE_SEMANTICS` (constante pura) expuesta en
`filters.dateSemantics` de la respuesta del panel, junto a `filters.description`. El panel
y los informes pueden ahora declarar sobre qué fechas están calculadas las cifras.

**Prueba:** E2E `7sexies` — la respuesta del panel incluye la semántica con los campos
`donations`, `expenses`, `historical` y `note`.

### Estado de la Entrega 2

| Punto | Estado |
| --- | --- |
| 2.1 Dashboard (tarjetas vs gráficas vs informes) | **Criterios ya coincidentes** (verificado) + semántica de fechas declarada. La igualdad **exacta** entre la conciliación y el panel ya se comprueba en el E2E desde V9.1 (`7sexies`) |
| 2.2 Libro contable | **Ya completado en V9.1**: estados `empty`/`healthy`/`issues`, asientos de importe cero, asientos huérfanos, cadenas por campaña |
| 2.3 Cierre financiero de campañas | **Pendiente: módulo nuevo.** Requiere decisiones funcionales (ver informe) |

### V14-08 · Cierre financiero de campañas (módulo nuevo) — ALTA

**Módulo:** Campañas · **Archivos:** `lib/campaign-closure.ts` (puro),
`routes/campaign-closure.ts`, `routes/campaign-expenses.ts`, migración **030**

**Qué faltaba:** no existía ninguna forma de cerrar financieramente una campaña: los
gastos y las donaciones se podían seguir tocando para siempre, sin acto de cierre ni
bloqueo posterior.

**DECISIONES QUE TOMÉ** (documentadas en el código, `CLOSURE_DECISIONS`):

| # | Decisión | Motivo |
| --- | --- | --- |
| D1 | El cierre es un **evento fechado y firmado con historial append-only** (tabla `campaign_closures`), no un campo de estado | Reabrir no borra la prueba de que se cerró ni quién lo autorizó; el informe queda congelado con su SHA-256 |
| D2 | **Bloquea** solo lo que rompe la contabilidad (cadena sin verificar, asientos huérfanos). Lo pendiente (gasto sin comprobante, donación sin asiento) **avisa** y queda como **salvedad** | Obligar a un estado perfecto empujaría a falsear los datos; cerrar «con salvedades» es la verdad de muchas campañas |
| D3 | **Cerrar**: administrador o superadmin con reautenticación. **Reabrir**: solo superadmin con reautenticación y motivo | Reabrir rompe el histórico |
| D4 | Tras el cierre se bloquean **alta, edición y borrado de gastos**; los **asientos compensatorios siguen permitidos** | Prohibir corregir un error no lo arregla: lo esconde |
| D5 | El informe se expone como **JSON con su SHA-256 verificable**; el PDF llega con la Entrega 3 | No duplicar el motor de PDF |

**API:** `GET /admin/campaigns/:id/closure` (revisión previa con las 10 comprobaciones),
`POST .../closure` (cerrar), `POST .../closure/reopen` (reabrir),
`GET .../closure/report` (informe congelado + verificación del sello).

**El bloqueo es real, no un botón deshabilitado:** `assertCampaignOpen` se aplica con un
`router.use` a todas las escrituras de gastos de la campaña. Ante un fallo al comprobar
el estado **se rechaza la escritura** (503), en vez de dejar pasar una modificación a
ciegas.

**Prueba:** 15 pruebas puras (`tests/campaign-closure.test.mjs`) + E2E `7duodecies`
(13 comprobaciones, PostgreSQL real): las 10 revisiones, el cierre firmado con su hash,
**409 `campaign_closed` al intentar escribir tras el cierre**, las lecturas siguen
funcionando, no se puede cerrar dos veces, el informe verifica su sello, la reapertura
devuelve la escritura y el historial conserva el cierre anterior.

## Entrega 3 · Documentos PDF (en curso)

### V14-09 · Informe de cierre financiero en PDF real — ALTA

**Archivos:** `lib/pdf-closure-report.ts` (nuevo), `routes/campaign-closure.ts`

**Qué faltaba:** el cierre se firmaba y se guardaba, pero no producía ningún documento.
Un cierre sin papel firmado es una fila en una tabla.

**Corrección aplicada:** `GET /admin/campaigns/:id/closure/report.pdf` genera un **PDF A4
horizontal** con:
- las cifras congeladas del cierre;
- las diez revisiones del procedimiento, con `[OK]` / `[AVISO]` / `[BLOQUEANTE]`;
- las salvedades registradas;
- el **motivo**, quién lo firmó y la fecha;
- el **sello SHA-256** y un **QR**.

**Dependencias añadidas:** `pdf-lib` y `qrcode` (ambas **MIT**, JS puro, sin binarios
nativos → compatibles con Render Free), más `@types/qrcode` como dependencia de
desarrollo. Sin ellas no hay PDF real: solo un `print()` del navegador.

**DECISIÓN (documentada en el código):** el QR apunta a la página del cierre **en el
panel autenticado**, no a una URL pública. El informe de cierre es información financiera
interna: publicarla abierta expondría ingresos, gastos y saldos a quien diera con el
enlace. La verificación pública de autenticidad es cosa de los **certificados**.

**Robustez:** `toWinAnsi` sanea el texto antes de dibujarlo. `pdf-lib` **lanza una
excepción** con cualquier carácter fuera de WinAnsi (comillas angulares, viñetas, tics),
así que sin ese saneado un informe con «comillas» o un ✓ sería un 500 en producción. Los
acentos y la ñ sí se conservan (Latin-1 está en WinAnsi).

**Prueba:** 5 pruebas (`tests/pdf-closure-report.test.mjs`) que **abren el PDF generado
con pdf-lib**: cabecera `%PDF-`, cierre `%%EOF`, tamaño, A4 horizontal verificado por
geometría, **relectura del documento** (la prueba de fuego de que la estructura es
válida), metadatos con la campaña, saneado de caracteres tipográficos y que un título con
«comillas», emoji y tics no tumba la generación. E2E `7terdecies`: descarga real por HTTP
con cabecera `%PDF-` y 404 en una campaña sin cierre.

**PENDIENTE (documentado en el código, no escondido):** el bloqueo del cierre en la
**purga DEMO** y en la **anulación en bloque** se retiró tras comprobar que un guarda
pre-registrado (`router.use`/`router.all`) se ejecuta **antes** de la validación de la
ruta y rompe el contrato «400 sin tocar la base» que fijan 19 pruebas existentes. La
comprobación debe ir **dentro** de cada manejador, después de validar. Sí está aplicado y
probado en las escrituras de **gastos** y en la anulación **individual**, que es por donde
entra el dinero.

### V14-10 · Certificado en PDF con revocación visible — ALTA

**Archivos:** `lib/pdf-certificate.ts` (nuevo), `routes/certificates.ts`

**Qué faltaba:** los certificados se emitían y se podían revocar, pero no existía ningún
documento: el donante o el voluntario no tenía nada que enseñar.

**Corrección aplicada:** `GET /certificates/:code/pdf` genera un **PDF A4 horizontal** con
marco dorado, el nombre del destinatario, el título, la descripción, la fecha, el código,
el tipo y un **QR a la verificación PÚBLICA** (`GET /certificates/:code`).

**PÚBLICA a propósito:** al revés que el informe de cierre (interno), el certificado está
hecho para compartirse; el código es el secreto. La descarga **no se cachea**: si el
certificado se revoca, la siguiente descarga debe reflejarlo.

**REGLA QUE NO SE NEGOCIA:** un certificado **REVOCADO se sigue descargando, marcado como
ANULADO** con su motivo y con el sello en rojo, y el archivo se llama `…-anulado.pdf`. Si
devolviéramos 404 o un PDF limpio, quien tuviera el papel impreso podría seguir usándolo.
La revocación se reconoce por estado **o** por fecha, para que un registro revocado sin el
estado actualizado siga contando como anulado.

**Prueba:** 6 pruebas (`tests/pdf-certificate.test.mjs`) que abren el PDF con pdf-lib:
vigente (válido, A4, releíble, **sin** sello de anulado) y revocado (con el rojo de
anulación en el contenido, nombre `-anulado` y documento igual de válido). E2E
`7quaterdecies`: emisión, descarga **sin sesión**, 404 con un código desconocido, revocar
y seguir descargando marcado como anulado.

**MEJORA ANOTADA (decisión de producto, no fallo de seguridad):** la verificación pública
de un certificado anulado responde **404**, indistinguible de un código inexistente. No se
puede acreditar como válido (que es lo importante), pero sería más claro responder
«revocado» con su motivo.

## Hallazgos detectados y NO corregidos todavía (con motivo)

### V14-03 · Enumeración de correos en el registro de voluntarios — MEDIA (requiere decisión)

`POST /volunteers` responde **409** cuando el correo ya tiene una postulación. Eso
permite comprobar si una dirección concreta ha solicitado ser voluntaria. **No lo he
cambiado por mi cuenta** porque la corrección rompe el contrato con la interfaz:
- *Opción A (no enumerar):* responder siempre 201 con el mismo cuerpo. Deja de poder
  distinguirse, pero **ya no se puede avisar** a quien vuelve a postularse con el mismo
  correo.
- *Opción B (dejarlo):* mantener el aviso útil y asumir el riesgo, mitigado por
  `volunteerLimiter`.

El riesgo es bajo (no son cuentas, es una postulación) pero es una **decisión funcional**
tuya. Dime A o B y lo implemento con sus pruebas.

### V14-04 · Fuerza bruta sobre el token de seguimiento — BAJA

`GET /volunteers/status/:token` ya exige longitud mínima, devuelve el mismo 404 para
token inválido y usa `volunteerLimiter`, pero el token es la única credencial. Mitigado;
se puede endurecer con un límite específico por token/IP en una entrega posterior.

## Estado de las entregas V14

| Entrega | Estado |
| --- | --- |
| **1 · Seguridad crítica** | **✅ 1.1, 1.2, 1.3 y 1.4 completadas y probadas** |
| 2 · Dashboard, conciliación e integridad financiera | **✅ 2.1 auditada · 2.2 ya cerrada en V9.1 · 2.3 cierre financiero implementado** |
| 3 · Certificados PDF y cierre de campañas | Pendiente |
| 4 · Revisión de los 23 módulos | Pendiente |
| 5 · UX/UI, centro de control y herramientas | Pendiente |
| 6 · Optimización, pruebas integrales y producción | Pendiente |

Queda **una decisión funcional tuya** (V14-03) antes de dar la Entrega 1 por cerrada al
100 %: si el registro de voluntarios debe seguir avisando cuando el correo ya existe
(útil, pero enumerable) o dejar de hacerlo.

**No he escrito los seis documentos de la Fase 11** porque solo tengo material real de
la Entrega 1: rellenar `AUDITORIA_INTEGRAL_V14.md` o calificar los 23 módulos ahora
mismo sería inventar. Prefiero entregarte esto verificado y seguir por donde digas.

## Nota de seguridad

Hay un **token de GitHub expuesto** en el historial de esta conversación (el que usé para
subir). **Revócalo** si no lo has hecho ya y genera uno nuevo de ámbito limitado
(`Contents: read and write` solo en este repositorio). No reproduzco su valor.
