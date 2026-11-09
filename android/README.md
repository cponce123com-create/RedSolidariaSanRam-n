# Red Solidaria San Ramón — Android nativo

Primer módulo en Kotlin y Jetpack Compose, sin WebView. Comparte la API pública
de la web; no crea ni copia una base de datos. Android 8.0 o superior.

## Incluido

- Campañas: filtros Todas/Activas/Completadas, páginas de 20 y cargar más.
- Detalle consultado de nuevo al abrir; imagen, descripción, meta, recaudación,
  aportes de dinero y desglose histórico/verificado.
- Actualizar, estados de carga, lista vacía, errores y reintentar.
- Compartir la dirección pública de una campaña con el selector de Android.
- Modo oscuro del sistema, márgenes para barras del sistema y texto adaptable.
- Pruebas del contrato HTTP, paginación, respuestas vacías, errores y cifras.

La sincronización ocurre al abrir, actualizar o cargar otra página. Este módulo
no tiene notificaciones en tiempo real ni caché offline.

## Compilar y probar

Abrir esta carpeta como proyecto en Android Studio. Requiere JDK 17, Gradle 8.9,
Android SDK 35 y Build Tools 34.0.0. La combinación AGP 8.7 / Gradle 8.9 / JDK 17
está documentada en https://developer.android.com/build/releases/agp-8-7-0-release-notes.
Con Gradle 8.9 instalado:

```sh
gradle -p android testDebugUnitTest lintDebug assembleDebug
```

Desde esta carpeta se puede ejecutar `gradle testDebugUnitTest lintDebug assembleDebug`.
El APK de prueba queda en `app/build/outputs/apk/debug/app-debug.apk`.
La compilación de GitHub Actions instala estas herramientas y publica el archivo
`RedSolidaria-Android-debug` cuando las verificaciones terminan correctamente.
Se puede ejecutar desde Actions → Android native APK → Run workflow, una vez que
el workflow exista en main. También se ejecuta al abrir o actualizar el PR.

La URL de producción está definida en `app/build.gradle.kts`. Las consultas son
`GET /api/campaigns?status=...&limit=20&offset=...` y `GET /api/campaigns/:id`.
La aplicación no contiene contraseñas ni credenciales de PostgreSQL.

## Prueba manual en un dispositivo

1. Instalar el APK, abrir Campañas y comparar título/importes con la web.
2. Probar los tres filtros y Cargar más cuando existan al menos 20 campañas.
3. Abrir una campaña, regresar con el gesto de Android y comprobar la lista.
4. Probar Actualizar y compartir una campaña en otra aplicación.
5. Desactivar Internet, actualizar, esperar el error y reintentar al reconectar.
6. Probar tema oscuro, orientación horizontal y tamaño de fuente grande.

El APK debug sirve para evaluación; la publicación requiere firma de lanzamiento
y configuración de distribución. No se ha verificado visualmente en un teléfono
hasta completar la prueba manual anterior.

## Pendientes de la migración completa

Adopciones, reportes ciudadanos, voluntariado, noticias, mapa, donaciones y
comprobantes, transparencia detallada, panel administrativo y autenticación con
sesiones/2FA, push inmediato, acceso offline, identidad gráfica final y firma de
publicación. No hay botones simulando estas funciones en este primer módulo.


## Versión 0.2.0 — avisos importantes

Campanita con contador, historial local persistente, marcar como leído y preferencias
por categoría: campañas nuevas, aportes confirmados agrupados por campaña/hora,
casos urgentes aprobados y campañas finalizadas. La primera sincronización establece
una línea de base y guarda el historial como leído: no avisa por novedades antiguas.
Los cambios menores, borradores y aportes pendientes no producen eventos.

**No es push inmediato.** WorkManager consulta con conexión en intervalos mínimos
programados de 15 minutos, que Android puede retrasar. La persona debe activar los
avisos y aceptar el permiso del teléfono. Forzar la detención de la aplicación puede
impedir las tareas hasta volver a abrirla. El historial muestra las últimas 100
novedades agrupadas de los últimos 90 días, según la visibilidad pública vigente.
Los casos urgentes abren su sección pública web; las campañas se abren dentro del APK.

**Servidor requerido:** fusionar y desplegar estos cambios del servidor antes de
probar nuevos eventos. El arranque aplica la migración aditiva 036 y publica
`GET /api/notifications`. Si aún no se desplegó, la app muestra que falta publicar
el módulo; instalar el APK por sí solo no actualiza el servidor.
La migración no envía avisos retroactivos por todas las donaciones existentes.

El artifact nuevo se llama `RedSolidaria-Android-0.2.0-debug`. Si Android rechaza la
actualización por conflicto de firma de los APK debug de distintos runners,
desinstalar el piloto anterior e instalar esta versión. Esto borra sus preferencias
locales; no borra ningún dato del servidor. La firma estable de publicación sigue
pendiente de configurar.

Prueba del módulo: abrir Avisos una vez (línea de base), habilitar avisos, publicar
una nueva campaña desde el panel, actualizar el historial y abrir el aviso. Aprobar
un aporte y comprobar agrupación, marcarlo como leído y verificar el contador.
Archivar la campaña y actualizar: sus avisos deben desaparecer. Para la prueba en
segundo plano, dejar la app sin forzar detención y permitir tiempo al planificador.


## Versión 0.3.0 — interfaz basada en la web

La aplicación abre en Inicio y reutiliza los recursos originales del sitio:
logotipo de respaldo, fotos de comunidad e historia, colores y tipografías
DM Sans/Outfit (licencias OFL adjuntas). Consulta además la identidad institucional
publicada para actualizar logo y portada desde el mismo servidor de la web.

| Sección | Implementación Android |
| --- | --- |
| Inicio | Portada, presentación, campaña protagonista, formas de ayudar, urgencias, transparencia, historia y adopciones |
| Campañas | Listado con filtros/paginación, detalle, aportes, gastos, evidencias y novedades |
| Noticias | Listado paginado y lectura de la publicación |
| Adopciones | Búsqueda, filtros de especie, ficha y envío de solicitud |
| Transparencia | Estadísticas públicas, campañas y registro de ingresos/gastos paginado |
| Casos urgentes | Casos aprobados y acceso a campaña o contacto |
| Contacto | WhatsApp configurable y envío de mensaje al servidor |
| Necesito ayuda | Formulario de reporte para revisión, con anonimato público |
| Voluntariado | Envío de postulación al mismo equipo |
| Más | Nosotros, ayuda animal, formas de ayudar y catálogo informativo |
| Avisos | Historial y preferencias del módulo 0.2.0 |

La barra inferior reproduce las cinco entradas de la web: Inicio, Campañas,
Noticias, Adopciones y Contacto. El menú superior abre el resto de secciones;
los botones de colaboración conservan el flujo de coordinación por WhatsApp.
Las solicitudes solo muestran éxito tras la confirmación HTTP del servidor.

### Límites que quedan identificados

El panel administrativo se abre explícitamente en el navegador y no se anuncia
como un panel Android implementado. Faltan mapa embebido, QR, carga de fotos desde
formularios, publicación de fichas de mascotas desde Android, seguimiento de la
postulación dentro de la app y traducción completa al inglés. El catálogo es
informativo y pide confirmar disponibilidad: no representa inventario en tiempo
real. Las estadísticas y fichas usan la API; no se agregan cifras ficticias.
La lista de campañas de la portada corresponde a la página pública cargada.

El workflow Android incluye pruebas de navegación en un emulador y publica
capturas de las pantallas reales. La revisión final en el teléfono del usuario
continúa siendo necesaria. El archivo de esta versión es
`RedSolidaria-Android-0.3.0-debug`.


## Versión 0.3.1 — correcciones de conexiones

- Lee `proofUrl` del DTO público y respeta comprobantes no autorizados; PDFs y videos se abren como adjuntos.
- Aportes paginados de 20 en 20 con Cargar más.
- Transparencia tiene su propio listado de campañas y paginación independiente del filtro principal.
- Adopciones y fichas se revalidan al volver a la pantalla y cada 30 segundos mientras están visibles. Los errores de detalle dejan de mostrar la ficha anterior.
- WhatsApp explica la falta de configuración y permite reintentar o abrir Contacto.
- La postulación conserva localmente el enlace público de seguimiento y permite consultarlo en la web.
- Reconoce el HTML de un servidor sin el módulo de avisos y muestra un mensaje claro.

Los cambios de servidor/web siguen requiriendo despliegue. Este APK no publica el servidor ni convierte las consultas periódicas en push inmediato.
