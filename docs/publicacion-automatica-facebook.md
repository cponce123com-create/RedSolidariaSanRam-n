# Publicación automática en Facebook

## Conexión de los módulos públicos (migración 038)

| Módulo | Momento del envío | Contenido del anuncio |
|---|---|---|
| Noticias | Al guardar/publicar | Título, resumen, imagen y enlace a la noticia. |
| Campañas | Al activar una campaña real | Presentación y enlace a la campaña. |
| Aportes de dinero | Al aprobar o conciliar un importe positivo | Agradecimiento, monto confirmado y enlace a transparencia. |
| Productos, servicios y logística | Con estado contable confirmado y entrega verificada | Tipo de colaboración; productos con cantidades realmente recibidas. El valor estimado no se anuncia como dinero recibido. |
| Mascotas | Al aprobarlas como disponibles | Nombre, descripción pública, foto y enlace a adopción. |
| Casos ciudadanos | Al aprobar su publicación | Título, descripción y foto públicos, con enlace a casos urgentes. |
| Novedades de campaña | Al guardar en una campaña pública real | Título, novedad e imagen pública de la campaña. |
| Cierres de campaña | Al marcar una campaña real como completada | Agradecimiento y enlace a sus resultados/transparencia. Es un envío distinto al anuncio inicial. |

Cada registro muestra su estado y una **Vista previa de Facebook** dentro del panel correspondiente. El servidor decide si es publicable, incluso si alguien intenta solicitar el envío manualmente. Las consultas y reintentos de aportes respetan los permisos financieros: los supervisores pueden consultar y los moderadores quedan fuera; los envíos manuales financieros corresponden al administrador/superadmin.

### Ejemplo de un aporte de S/50

1. Registrar el aporte: permanece pendiente, sin anuncio.
2. Comprobarlo y aprobarlo/conciliarlo: se registra un único envío.
3. Facebook recibirá un mensaje similar a «Confirmamos un aporte de S/50.00 para ChocoFest. Gracias a una persona solidaria por sumarse», junto con el enlace a la transparencia. La imagen será la portada pública de la campaña.
4. Si la donación no es anónima y existe una autorización explícita vigente de `public_name`, el agradecimiento puede incluir su nombre. Sin una autorización positiva, se mantiene anónimo aunque el registro antiguo no tenga marcada la casilla de anonimato.
5. El estado pasa de pendiente a enviado/publicado o muestra el motivo de rechazo y permite reintentar según las reglas de abajo.

El anuncio del aporte no incluye comprobantes, correos, teléfonos, notas internas ni mensajes privados. Antes de cada intento se relee la última decisión de consentimiento; una revocación anterior al envío vuelve anónimo el anuncio. En productos se publican cantidades recibidas, no las prometidas. Rechazos, anulaciones y entregas sin verificar no se anuncian.

La migración 038 es aditiva y no envía el historial en bloque. Los cambios de notas/contactos internos no desencadenan publicaciones de los nuevos módulos. Los registros anteriores pueden enviarse individualmente si siguen cumpliendo los requisitos. Los trabajos nuevos utilizan una cola compatible con despliegues graduales para que una instancia antigua no interprete un aporte como una campaña.

La configuración, los mensajes de contacto, los usuarios y las solicitudes de voluntariado permanecen como operaciones internas. El flujo social corresponde al contenido aprobado y público de la tabla anterior.

Si se revoca un consentimiento, se anula un aporte o se retira contenido **después** de haberse publicado en Facebook, la copia externa debe revisarse/retirarse allí. El panel advierte cuando el registro enviado deja de cumplir los requisitos. Las ediciones posteriores no modifican automáticamente una publicación ya enviada.

## Uso

- **Noticias:** al guardar una noticia en el panel, queda pública en la web y se registra su envío a Facebook en la misma transacción de base de datos.
- **Campañas:** los borradores no se envían. Al activar una campaña real se registra su envío. Las campañas marcadas DEMO no se publican en Facebook.
- Si hay imagen HTTPS se publica como foto con título, resumen y enlace de la web en el pie. Si no hay imagen válida, se publica texto y enlace.
- El proceso revisa la cola cada 15 segundos mientras el servicio está en ejecución. Noticias y Campañas muestran **Pendiente**, **Enviando**, **Publicado**, **No se pudo publicar**, **Requiere revisión** o **Cancelado**. Cuando se conoce el resultado correcto se ofrece el enlace de Facebook.
- Una noticia/campaña ya enviada no se vuelve a publicar al editarla, reactivarla o reiniciar Render. Los cambios posteriores del texto o imagen en la web no editan la publicación ya existente en Facebook.
- El contenido anterior a esta instalación no se envía en bloque. Puede enviarse individualmente con **Enviar a Facebook**; guardar una noticia antigua sin registro de envío también genera su primer envío.

## Configuración de Render

En el servicio del API:

| Variable | Valor |
|---|---|
| `FACEBOOK_PAGE_ID` | `914513275073067` |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Token de la página; secreto, nunca del usuario ni del navegador. |
| `SITE_URL` | Dirección pública HTTPS sin rutas, por ejemplo `https://redsolidariasanram-n.onrender.com`. Usar el dominio propio solo si ya funciona públicamente. |
| `FACEBOOK_AUTO_PUBLISH_ENABLED` | `true`; si falta, se activa cuando las otras variables son válidas. `false` pausa el envío, conservando los pendientes. |

La identidad debe comprobarse en Configuración → Facebook. El token necesita autorización de publicación (`pages_manage_posts`) y los permisos de acceso a la página. Una consulta de identidad correcta no sustituye el resultado del primer envío real. Meta puede rechazar permisos o invalidar el token; el panel mostrará el fallo sin exponer secretos.

Mantener el Build Command y Start Command ya configurados. La migración **037_facebook_publications.sql** se ejecuta al arrancar mediante el migrador existente; no usar `drizzle-kit push`, no truncar tablas. Es una migración aditiva: añade la cola y los disparadores; no elimina contenido ni modifica publicaciones anteriores.

## Entrega y duplicados

La cola tiene una clave única por tipo e ID de contenido. Los disparadores de PostgreSQL garantizan que una operación revertida no envíe nada. Los procesos reclaman trabajos con `FOR UPDATE SKIP LOCKED` y solo sus tipos compatibles, por lo que dos instancias no envían el mismo trabajo a la vez.

El resultado de Meta se guarda antes de considerar el envío publicado. Un error de permisos o token queda como fallo con reintento manual. Los rechazos explícitos por límite de uso pueden reintentarse automáticamente hasta cinco intentos acumulados, con espera creciente. Los intentos se cuentan de forma monotónica incluso al reintentar manualmente.

Una desconexión, respuesta inválida, error de servidor de Meta o interrupción del proceso puede ocurrir **después** de que Facebook haya creado la publicación. En ese caso se marca **Requiere revisión** y no se repite automáticamente. Hay que revisar la página y confirmar expresamente que la publicación no existe antes de reintentar. No se promete entrega exactamente una vez frente a una respuesta perdida: sin esa comprobación humana puede haber duplicados.

La publicación web se conserva aunque Meta rechace el envío. Antes de enviar se vuelve a leer la noticia/campaña; si se borró o la campaña dejó de estar activa/publicable se cancela el trabajo. Retirar contenido de la web después de haberlo enviado no elimina la publicación de Facebook: debe retirarse allí por separado.

Los supervisores no pueden ejecutar acciones de publicación; superadmin, administrador y moderador pueden gestionar contenido y solicitar envíos/reintentos. La comprobación de credenciales sigue reservada al superadmin. Las rutas de estado son privadas y no almacenables; los tokens nunca se guardan en la cola, los enlaces ni los mensajes de error.

## Validación y cierre del despliegue

Las pruebas de envío simulan Meta y cubren texto, foto, identidad incorrecta, credenciales, permisos, límites de uso y resultados ambiguos. Las pruebas de componentes cubren estados, reintentos y confirmación de resultado incierto. El workflow **Facebook publication integration** usa PostgreSQL 17 aislado y respuestas simuladas para comprobar disparadores, rollback, concurrencia, cancelación, reintentos y reinicios sin duplicar.

Después de fusionar y desplegar:

1. Confirmar en Configuración → Facebook que identidad, dirección de la web y publicación automática están configuradas.
2. Crear una noticia real o activar una campaña real y comprobar su estado en el panel. No es necesario publicar ejemplos de prueba en la página.
3. Abrir **Ver publicación en Facebook** y comprobar el enlace y la imagen. Si hay rechazo de Meta, corregir la causa y usar **Reintentar envío**.

No se usaron tokens reales ni se hicieron publicaciones desde el entorno de desarrollo. La primera entrega real debe comprobarse tras desplegar. En un servicio de Render que se suspende por inactividad, los reintentos se pausan mientras duerme y se retoman al arrancar; para entrega continua se necesita un servicio siempre activo.

### Registro de aportes con imágenes y plantillas

En **Donaciones → Registrar aporte coordinado** se pueden registrar dinero, productos, servicios y apoyo logístico.

- **Comprobante privado**: JPG/PNG/WebP hasta 8 MB. Se guarda en la misma transacción que el aporte; no es la foto de Facebook. Yape, Plin y transferencia siguen exigiendo evidencia antes de aprobar.
- **Foto pública**: carga independiente y autorización explícita de uso. Se registra un consentimiento `public_photo`; el envío vuelve a consultar la última decisión. Si está revocado se omite la foto y se usa la portada pública de la campaña, si existe.
- **Plantillas de texto**: Agradecimiento, Impacto solidario e Invitación a la comunidad. Se guardan con el aporte y usan datos confirmados, sin inventar beneficiarios, entregas o resultados.
- **Nombre del donante**: autorización separada; sin ella el reconocimiento es anónimo. El panel financiero sigue mostrando la identidad interna y permite buscarla.
- **Vista previa**: usa el mismo generador del servidor que el envío final; no guarda ni publica. Para productos, el envío final incorpora las cantidades efectivamente recibidas.

Al guardar, el aporte queda pendiente. La publicación se activa con la aprobación del dinero o con aprobación y verificación del aporte en especie. Las notas internas y el valor estimado no se convierten en ingresos ni se incluyen en Facebook.

Ante un resultado de registro incierto por fallo de red, el formulario conserva la misma solicitud y clave de idempotencia: «Reintentar el mismo registro» recupera el aporte sin crear otro. Durante la subida o el guardado se bloquea el cierre del diálogo. Una validación rechazada permite corregir los campos.

La migración 039 añade columnas; no borra datos ni publica aportes anteriores. No se requieren nuevas variables de Facebook. Las subidas usan la configuración Cloudinary existente del servidor (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).


### Consultas del panel y subidas de imágenes

Cada fila ofrece **Ver estado de Facebook**: las filas cerradas no hacen consultas. Solo los envíos pendientes o en curso, con el panel abierto y la publicación automática activa, se actualizan una vez por minuto. Los registros sin envío, publicados o con errores no se consultan indefinidamente; un error 429 requiere reintento manual y no produce una tormenta de reintentos. Abrir una vista previa ya cargada no genera otra consulta.

Las lecturas autenticadas de `/admin` tienen un presupuesto independiente (180 por minuto por cuenta). Las escrituras y las firmas de subida conservan su límite anterior. Consultar estados de Facebook ya no consume la autorización para subir imágenes. La firma, la autorización por rol y las restricciones de formato de Cloudinary se mantienen.

Si la subida recibe 429, se informa del límite de solicitudes. Si falta la configuración de Cloudinary, se conserva el mensaje concreto del servidor en lugar de ocultarlo bajo un 503 genérico. No se requieren variables nuevas.


### Token rechazado y aportes de prueba

«Token caducado o revocado» requiere sustituir **FACEBOOK_PAGE_ACCESS_TOKEN en Render** por un token de página vigente y desplegar el cambio. La aplicación no puede renovar por sí sola una credencial revocada. Antes de volver a enviar contenido real, comprobar la identidad de la página y revisar el vencimiento en el depurador de Meta. No reintentar publicaciones de prueba que deben retirarse de contabilidad.

**Diagnosticar sin publicar** es una consulta de lectura, por solicitud del operador: distingue configuración incompleta, contenido no elegible y token rechazado. Una identidad correcta no demuestra el permiso de escritura; este se confirma en un envío real autorizado. Los rechazos nuevos guardan código y subcódigo numéricos de Meta, sin mensajes brutos que puedan contener credenciales.

Un aporte pendiente se puede rechazar. Si ya está aprobado o conciliado, usar **Anular contablemente** con un motivo de al menos 10 caracteres, contraseña y 2FA cuando corresponda. «Usar motivo: aporte de prueba» rellena una explicación válida, pero la confirmación sigue siendo explícita. El aporte deja de contar en las cifras y conserva la corrección en el libro; no se borra el historial.

La migración 040 cancela trabajos seguros no enviados (pendientes o fallidos) de aportes anulados/rechazados/retirados, incluidos los retirados antes del despliegue. No cambia importes ni asientos. Las publicaciones aceptadas, los envíos en curso y los resultados inciertos conservan su estado para revisión; no se afirma que se haya borrado un post de Facebook.
