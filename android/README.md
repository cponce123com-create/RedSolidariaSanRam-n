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
sesiones/2FA, notificaciones, acceso offline, identidad gráfica final y firma de
publicación. No hay botones simulando estas funciones en este primer módulo.
