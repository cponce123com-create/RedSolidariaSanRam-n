# Auditoría de conexión con Facebook

Fecha: 9 de noviembre de 2026. Página prevista: Red Solidaria San Ramón, ID `914513275073067`, https://www.facebook.com/redsolidariasr. Aplicación Meta utilizada durante la configuración: `2732777193806831`.

## Estado encontrado

Las variables `FACEBOOK_PAGE_ID` y `FACEBOOK_PAGE_ACCESS_TOKEN` habían sido añadidas a Render por el operador, pero el código de `main` no las leía. El router no tenía un cliente Graph ni rutas de integración. El pie de página y los botones de compartir son enlaces de navegación; no establecen una conexión autenticada con Meta.

El sitio desplegado responde a `/api/healthz`, pero eso solo demuestra salud del servidor. No demuestra que Meta acepte sus credenciales. La consulta anterior del operador en Graph Explorer verificó la identidad de la página en ese entorno, no las credenciales finalmente guardadas en Render. No se tuvo acceso a las variables reales ni a una sesión administrativa del servicio.

## Cableado implementado

1. El servidor lee las dos variables, sin exponer su contenido.
2. `GET /api/admin/integrations/facebook/status` exige sesión y rol superadmin; queda también detrás del gate global de administración.
3. Al solicitar la comprobación, el servidor hace exclusivamente `GET https://graph.facebook.com/v27.0/me?fields=id,name`, enviando el token en Authorization, con timeout de 10 segundos y sin seguir redirecciones.
4. Comprueba que el ID devuelto coincida con `FACEBOOK_PAGE_ID`. Un token de usuario o de otra página no se acepta como la identidad configurada.
5. Panel → Configuración → Conexión con Facebook contiene un botón para ejecutar la prueba. No consulta Meta automáticamente al abrir la pantalla y no crea publicaciones.
6. El resultado muestra configuración presente/ausente, errores accionables o la identidad verificada. Las respuestas no almacenables excluyen tokens, cabeceras y mensajes crudos de Meta.
7. `render.yaml` declara ambas variables como secretos proporcionados por el operador; no añade valores al repositorio.

## Qué demuestra cada resultado

| Resultado | Interpretación |
|---|---|
| Falta configuración | El proceso del servidor no encuentra uno o ambos valores. Revisar el servicio correcto en Render y desplegar tras guardar. |
| ID inválido | El valor debe ser solo el identificador numérico, sin enlace ni comillas. |
| Token rechazado | Meta devuelve código 190; puede ser expiración o revocación. |
| Permiso denegado | Meta rechaza el acceso de identidad; revisar autorización de la página. |
| Otra identidad | `/me` no coincide con el ID configurado; revisar token de página frente a token de usuario o de otra página. |
| Identidad verificada | El servidor llegó a Meta y el token identifica a la página configurada en ese momento. No prueba capacidad de publicación ni vigencia futura. |
| No disponible | Tiempo agotado, red, respuesta inválida u otro error de Meta; no equivale a conexión correcta. |

## Cierre en Render

Fusionar y desplegar esta corrección. Mantener los secretos en el servicio que ejecuta el API. Entrar como superadmin a `/admin/configuracion`, pulsar **Comprobar conexión con Facebook** y confirmar nombre **Red Solidaria San Ramón** e ID **914513275073067**. Si hay error, compartir solamente el mensaje del resultado, nunca el token ni una captura de los secretos.

## Validación y límites

Pruebas automatizadas con respuestas simuladas de Meta comprueban ausencia/configuración inválida, método GET y cabecera Bearer, identidad correcta y equivocada, rechazo de token, permisos, red/JSON inválido, exclusión de secretos y autorización por rol. Pruebas de componentes comprueban botón manual, identidad y permisos de publicación pendientes, configuración faltante y sesión inválida. La descripción del PR registra los resultados de las suites, TypeScript y builds ejecutados.

No se hicieron llamadas con credenciales reales desde este entorno ni publicaciones de prueba. No se afirma que el token de Render esté validado hasta obtener el resultado del panel en producción. La lectura de identidad no inspecciona todos los permisos ni la caducidad: para ello se mantiene la revisión del token en las herramientas de Meta.

La publicación de noticias/campañas desde la web hacia Facebook sigue sin implementar: faltan la acción de publicación, selección/vista previa del contenido, control de duplicados y registro de resultados. No se activa publicación automática como parte de esta auditoría.
