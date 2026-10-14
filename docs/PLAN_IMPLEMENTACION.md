# PLAN DE IMPLEMENTACIÓN — Red Solidaria San Ramón 2026

**Rama:** `feat/implementacion-integral-2026`
**Base:** `main` @ `9691340` (backend de voluntariado cerrado)
**Regla de trabajo:** un incremento = un commit. Ningún incremento se declara terminado sin `typecheck`, build y pruebas en verde, y sin comprobar frontend + API + base de datos.

Las 16 fases del Prompt Maestro se ejecutan como **incrementos acumulativos sobre lo existente**. Nada se reconstruye: cada incremento declara qué reutiliza.

---

## Fase 0 — Auditoría y preparación ✅ COMPLETADA

**Entregable:** `docs/AUDITORIA_INICIAL.md`
**Resultado:** arquitectura mapeada, inventario por funcionalidad (verificada / parcial / defectuosa / pendiente / obsoleta), causas raíz de los dos problemas reportados y riesgos abiertos. Sin cambios de código.

---

## Incremento 1 — Fase 1 (núcleo): campañas y sincronización ✅ COMPLETADO

**Problema 1 — «no puedo eliminar la campaña».**
Causa: la eliminación solo se permitía en borradores vacíos y un borrador con contenido no podía ni eliminarse ni archivarse (callejón sin salida).

Correcciones:
1. `draft → archived` permitido (`lib/campaign-lifecycle.ts`): el borrador con dependencias ya tiene salida segura.
2. La acción **Archivar** aparece en la UI para borradores (`lib/campaign-admin.ts`), con confirmación explícita.
3. Los **reportes ciudadanos** cuentan como dependencia: sin clave foránea, borrar dejaba huérfanos (`routes/campaigns.ts`).
4. Mensajes de bloqueo accionables que explican la salida («Archívalo para conservar la traza»).
5. Se mantiene intacta la protección del libro contable (`campaign_movements` `ON DELETE RESTRICT`; el `23503` se traduce a `409`).

**Problema 2 — «los cambios del panel no se ven en la web».**
Causa: la invalidación no alcanzaba las claves reales del cliente generado, y la caché HTTP servía respuestas viejas al propio administrador.

Correcciones:
6. `lib/query-keys.ts`: **fuente única de verdad** de claves y predicados por entidad (campañas, donaciones, aliados, configuración).
7. `lib/query-invalidation.ts`: invalidación por entidad; campañas, aliados y donaciones dejan de tener listas de claves paralelas.
8. `middleware/cache-control.ts`: cualquier petición **con sesión** responde `private, no-store`; la anónima, `public, max-age=60` + `Vary: Cookie`.
9. `App.tsx`: `refetchOnWindowFocus: true` (la web pública revalida al volver a la pestaña).
10. `PUT /admin/settings` (batch) pasa a **upsert**: antes descartaba en silencio las claves nuevas.
11. `PUT /admin/protagonist-campaign` rechaza campañas ocultas con `409` y mensaje accionable.

**Pruebas:** `api-server` 272/272 (+7), `red-solidaria` 90 node:test (+8) + 22 vitest, typecheck 0 en libs/api/frontend.
**Reutilizado:** todo el módulo de campañas, el libro contable, `settings`, el cliente Orval, los patrones de hooks existentes.

---

## Incremento 2 — Fase 1 (cierre): administración y experiencia ✅ COMPLETADO

- **Monto recaudado con fuente única** (RC-S8): el formulario del detalle de campaña lee la transparencia real; con donaciones confirmadas el campo pasa a solo lectura y se explica el total, y sin donaciones sigue siendo manual con aviso. **Hecho.**
- **Borrado desde el detalle** con confirmación explícita y explicación de por qué una campaña con historial se archiva en lugar de eliminarse (RC3). **Hecho.**
- **Búsqueda, filtrado y ordenación** en la lista de campañas (más recientes, más antiguas, título A-Z, meta y recaudado). **Hecho.**
- **Botón discreto de acceso al panel**: ya existía (`AdminAccessLink`, barra de navegación escritorio/móvil y pie) y se verificó que reutiliza la sesión existente. **Verificado, sin cambios.**
- **Claves separadas admin/público** (RC-S9): revisado; el riesgo queda neutralizado por `private, no-store` con sesión y la invalidación por entidad. **Decisión documentada, sin cambios.**
- **Pruebas de integración con base real** (borrado `204`, `409` por dependencias, limpieza del protagonista al archivar): requieren una base PostgreSQL accesible; en este contenedor las suites usan un `DATABASE_URL` ficticio, así que se ejecutan en el entorno de despliegue. **Trasladado al incremento 16.**

## Incremento 3 — Fase 2: ChocoFest 2026 como campaña principal 🟡 CASI COMPLETA (3A y 3B cerrados)

**3A — cerrado:** portada verificada (identidad → bloque protagonista, solo si está publicada y vigente), modelo de bienes e insumos del evento con **metas por producto** y **flujo recibido/usado** (migración 015 aditiva, sin una tabla por producto), panel de registro con validación cruzada, inventario público agrupado por producto con avance de meta y estado «sin meta definida» cuando no hay meta aprobada.

**3B — cerrado:** **presupuesto por categoría** (migración 016 aditiva): previsión administrada por rubro cruzada con los gastos reales mediante la función pura `buildBudget`, con saldo por rubro, saldo general, avance frente a la meta y una fila «Sin presupuesto asignado» para que ningún gasto quede oculto. Panel dentro de la pestaña de gastos y sección pública de presupuesto. Detalle en `docs/ESTADO_IMPLEMENTACION.md` §5 y §6.

**3C-1 — cerrado:** **estado de organización con datos reales** (se elimina el punto del checklist fijado en `false`; ahora los 12 puntos se derivan de la base de datos, con progreso «X de 12») e **información del evento ampliada** (objetivos y equipo responsable editables desde el panel y publicados con allowlist explícita; la página pública no muestra nada si aún no se han definido). Detalle en `docs/ESTADO_IMPLEMENTACION.md` §6.4.

**3C-2 — pendiente:** programa de actividades con responsables; regalos ligados a su donante y a la evidencia de entrega; composición de canastas y meta de preparadas/entregadas.

**Regla de datos:** las metas y los textos del evento se cargan desde el panel cuando la organización los aprueba. No se introduce ninguna cifra ni texto inventado.

## Incremento 4 — Fase 3: sistema profesional de donantes

- Unificación de tipos (persona, familia, empresa, organización, anónimo) reutilizando el panel de donantes y `donor-identity`.
- Tipos de colaboración: Yape, transferencia, productos, servicios, apoyo logístico.
- Estados completos con `reverted` trazable; las pendientes nunca cuentan como ingreso.
- Reconocimientos a nombre colectivo («Familia Quispe») sin publicar identidades individuales.
- Preferencias de privacidad y consentimientos por donante; separación estricta público/privado.

## Incremento 5 — Fase 4: certificados digitales con QR

- Migración aditiva: certificados (persona, familia, empresa, voluntario) con identificador único, estado y revocación.
- Emisión administrativa, historial, revocación y página pública de verificación (`Red Solidaria San Ramón certifica que …`), sin monto por defecto.
- Tres formatos (horizontal, 1080×1080, 1080×1920) generados en el cliente con vista previa y descarga.
- QR de verificación independiente del QR de campañas.

## Incremento 6 — Fase 5 (cierre): voluntariado permanente

- Tareas, turnos, asistencia, evaluación de actividades y certificados de participación sobre lo ya construido (equipos, pertenencias, participaciones).
- Brigadas de recolección: responsable, integrantes, zona general, materiales recibidos, donaciones recolectadas, entregas al inventario e incidencias — sin exponer recorridos ni datos personales.

## Incremento 7 — Fase 6: insignias y marcos

- Marcos aprobados: selección, subida de foto, ajuste, vista previa y descarga 1080×1080 (canvas en el cliente).
- Insignias por categoría con diseños administrables. **No se inventan diseños oficiales**: se usan los archivos aprobados.

## Incremento 8 — Fase 7: embajadores solidarios

- Solicitud, aprobación, perfil, enlace y código de referencia, captaciones (donantes/voluntarios), campañas apoyadas, métricas y reconocimientos.
- Sin publicar datos de personas invitadas y sin mecánicas de presión indebida.

## Incremento 9 — Fase 8: empresas y auspiciadores

- Registro de empresas, contactos privados, propuestas, compromisos, seguimiento, estados de negociación e historial sobre el módulo de aliados.
- Programa «Empresas que Regalan Sonrisas» con niveles configurables (sin beneficios tributarios) y **donaciones igualadas** mostrando compromiso, confirmado, pendiente y resultado.

## Incremento 10 — Fase 9: WhatsApp Business

- Botón de contacto y enlaces con mensajes predefinidos, formularios de interés, clasificación de contactos, solicitudes de ingreso a la comunidad con aprobación administrativa y seguimiento.
- Sin agregar personas automáticamente a grupos y sin simular integraciones inexistentes.

## Incremento 11 — Fase 10: casos sociales permanentes

- Sección «Historias que podemos cambiar» con flujo de 13 pasos, tipos de ayuda y transparencia por caso (código, descripción no identificativa, necesidad, estado, meta, recursos, resultado, evidencias autorizadas).
- Reutiliza `community_reports`; consentimiento y verificación; sin datos médicos, direcciones, documentos ni fotos sensibles.

## Incremento 12 — Fase 11: transparencia financiera avanzada

- Exportación PDF/Excel del libro, correcciones trazables, observaciones, inventario valorizado y roles (general, supervisor financiero, coordinador, voluntario, público) con permisos explícitos.

## Incremento 13 — Fase 12: identidad visual

- Preparar consumo de logo oficial, Piñito, videos y recursos por canal. Sin rediseñar automáticamente.

## Incremento 14 — Fase 13: dashboard administrativo unificado

- Tarjetas con enlace al módulo correspondiente: campañas activas/archivadas, donaciones pendientes/verificadas, ingresos, gastos, saldo, inventario, voluntarios pendientes, empresas interesadas, certificados, casos sociales, tareas y alertas. Sin estadísticas inventadas.

## Incremento 15 — Fase 14: seguridad, privacidad y rendimiento

- Migración aditiva de claves foráneas ausentes con `ON DELETE` conservador (R-1).
- Documentar/eliminar la divergencia de migradores (R-2) para que un `drizzle-kit push` no pueda aplicar `CASCADE` al libro contable.
- Revisión de rate limiting, exposición de información, consultas lentas, índices, caché, rendimiento móvil y accesibilidad; minimización de datos y consentimiento para menores.

## Incremento 16 — Fase 15: pruebas integrales

- Los 25 escenarios de extremo a extremo (campaña completa, donación, certificado y QR, voluntario, marco, empresa, caso social, informe financiero, permisos, móvil, migraciones y restauración de respaldos).
- `typecheck`, `build`, suites completas y verificaciones de seguridad. **Ninguna prueba esencial puede quedar en rojo.**

---

## Criterios de aceptación globales

1. Administrador y frontend sincronizados (incremento 1: cumplido y probado).
2. Campañas administrables de principio a fin, con historial protegido.
3. ChocoFest 2026 como protagonista de la portada cuando corresponda.
4. Registros históricos y contables nunca destruidos en cascada.
5. Donantes, voluntarios, empresas, embajadores y casos sociales gestionables.
6. Certificados emitidos y verificables por QR, con privacidad por defecto.
7. Contabilidad trazable y verificable; información privada protegida.
8. Suites en verde en cada incremento.

## Riesgos y bloqueos conocidos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Claves foráneas ausentes (R-1) | Huérfanos al borrar | Conteo en aplicación (hecho para campañas) + migración aditiva (incremento 15) |
| Doble migrador (R-2) | `CASCADE` accidental sobre el libro | No usar `drizzle-kit push`; documentar; unificar en incremento 15 |
| Sin archivos oficiales de logo/Piñito | Fase 12 bloqueada | Preparar consumo; no inventar diseños |
| `raised` manual vs donaciones (RC-S8) | Confusión en el panel | Incremento 2 |
| Operaciones destructivas en producción | Pérdida de datos | Ninguna migración destructiva; respaldo y autorización antes de tocar datos reales |
