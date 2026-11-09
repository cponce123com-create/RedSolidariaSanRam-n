# Auditoría de cableado: adopciones y arranque compartido

Fecha: 9 de noviembre de 2026. Origen comprobado: https://redsolidariasanram-n.onrender.com.

## Resultado y evidencia

La portada sí consulta la API del mismo origen. La API pública responde con seis mascotas de ejemplo: Rex (45), Tobi (47), Luna (43), Mochi (44), Kira (46) y Nala (48). Todas tienen `createdAt=2026-11-09T15:20:16.418Z` (10:20:16 a. m., Perú). La respuesta incluye `Cache-Control: public, no-cache`.

Esto demuestra que los registros visibles existen actualmente en el servidor; no es solamente una captura o una caché vieja del navegador. El código de arranque contiene una causa reproducible: `seedIfEmpty()` se ejecuta en cada inicio y `seedPets()` inserta los seis ejemplos cuando la tabla está vacía. No se consultó el historial administrativo de producción, por lo que no se atribuye una operación de borrado concreta a un usuario o instante.

## Hallazgos y correcciones

| Prioridad | Conexión | Hallazgo | Cambio |
|---|---|---|---|
| Alta | Arranque → base de datos | Las tablas vacías se interpretaban como nuevas instalaciones y se repoblaban con ejemplos. Afecta mascotas, noticias, campañas, reportes y otros módulos del mismo seed. | En producción se omite toda la siembra demo y sus backfills. No se insertan ejemplos ni se reemplazan fotos por coincidencia de nombre. |
| Alta | Fallo API → actualización pública | `query.state.error` desactivaba permanentemente el polling, hasta una nueva acción de navegación/foco/reintento. | Cliente de consultas compartido mantiene los intervalos públicos tras errores. Las consultas administrativas siguen sin polling por esta regla. |
| Media | API → portada | La API envía `gato`, pero Inicio comparaba con `cat`; Mochi aparecía como perro. | Se usa el valor español del contrato de mascotas. |
| Media | Error API → contenido visible | La portada podía conservar tarjetas anteriores tras fallar la revalidación y confundía un fallo inicial con una lista vacía. | Oculta tarjetas desactualizadas ante error, muestra un mensaje y permite reintentar. La recuperación periódica continúa. |
| Media | Foto remota → tarjeta de Inicio | Sin manejo de error, quedaba una imagen rota; sin foto se mostraba una fotografía de perros ajenos. | Marcador local neutral para foto ausente o fallida, sin atribuir la imagen de otro animal. |

## Conexiones revisadas que ya existen

| Tramo | Comprobación |
|---|---|
| Panel → DELETE `/api/admin/pets/:id` | El panel comprueba la respuesta antes de mostrar éxito. El servidor exige que el borrado afecte una fila; devuelve 404 si no existe. |
| Mascota con solicitudes → conservación de historial | DELETE devuelve 409 y el panel ofrece despublicar; no se borran solicitudes para forzar la retirada. |
| Despublicación → API pública | Listado y detalle públicos filtran `status=available`; una ficha retirada responde 404. |
| Mutación → portada/listado/ficha | `invalidatePetQueries` reconoce la clave especial de Inicio y las claves de listado, detalle y panel. Hay aviso entre pestañas del mismo origen. |
| API → HTTP cache | Producción devuelve `public, no-cache` para el listado anónimo; con sesión, el middleware aplica `private, no-store`. |
| Web → servidor | La portada y el panel usan rutas relativas `/api/...`; no se encontró un segundo servidor fijo en ese recorrido web. |

## Validación

- Regresión de arranque: se ejecuta el seed real con una base simulada que falla ante cualquier acceso. Dos arranques de producción no realizan ninguna operación; desarrollo conserva la inicialización demo.
- Componentes: eliminación reflejada en Inicio usando la misma invalidación del panel; gato etiquetado correctamente; error con datos anteriores y recuperación manual; foto fallida; recuperación automática tras un fallo con el cliente real de la aplicación.
- Se conserva la prueba existente de retirada de la ficha tras 404.
- Se ejecutan TypeScript, pruebas API y frontend, y builds de producción antes de presentar el PR. Los resultados exactos se documentan en su descripción.

## Operación pendiente y límites

1. Fusionar y desplegar, manteniendo `NODE_ENV=production` (ya declarado en `render.yaml`).
2. Revisar en el panel las seis fichas recreadas. Eliminarlas si son ejemplos; si hay solicitudes asociadas, despublicarlas para conservar el historial. Este cambio no elimina registros existentes automáticamente.
3. Confirmar que desaparecen de `/api/pets`, Inicio y Adopciones, y que sus fichas públicas responden 404. Reiniciar el servicio y comprobar que no reaparecen.

No se usaron credenciales administrativas ni se escribió en producción. No se ejecutó el flujo E2E con PostgreSQL real ni se probó un APK nuevo. La evidencia en vivo es de lectura; las pruebas automatizadas de esta corrección son locales y no sustituyen la comprobación posterior al despliegue.

La auditoría cubre adopciones y la inicialización/sincronización compartidas, no todos los módulos del repositorio. Como mejora adicional, `featuredOnHome` existe en la API pero no gobierna la selección de Inicio ni tiene control en el panel de mascotas revisado: Inicio muestra las primeras cuatro disponibles. No se cambia esa política de selección en esta corrección.
