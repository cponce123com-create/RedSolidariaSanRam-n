# Publicación automática en Facebook

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

La cola tiene una clave única por tipo e ID de contenido. Los disparadores de PostgreSQL garantizan que una operación revertida no envíe nada. Los procesos reclaman trabajos con `FOR UPDATE SKIP LOCKED`, por lo que dos instancias no envían el mismo trabajo a la vez.

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
