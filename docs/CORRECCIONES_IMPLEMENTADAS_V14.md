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
| 2 · Dashboard, conciliación e integridad financiera | Pendiente |
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
