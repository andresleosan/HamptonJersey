> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# Tanda 3 · Estados y trazabilidad (PUB-09 + SPR-02)

8-nov-2026 · base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo diseño local, no integración ni permiso de construcción. [Índice de tandas](../plans/2026-11-08-lista-4-tandas-de-planificacion.md).

## Contratos existentes y alcance

`listings.published_at` ya existe desde 0021 y se actualiza al publicar una ficha antes oculta; datos previos publicados tienen backfill de `updated_at`, no prueba de fecha exacta. Mostrarlo en panel como `Published / last published`, con etiqueta `Date imported from earlier record` si se puede distinguir origen; como no hay tal marca en filas antiguas, no afirmar exactitud histórica ni prometer distinguirlas. No crear columna duplicada. `confirmed_at` cambia al publicar/precio y no es prueba de confirmación por anunciante. Los eventos de EST-18 ya están publicados mediante 0029: la vista sigue aplazada y los productores posteriores no están completos. No inventar historial anterior ni sustituir su esquema con un segundo diario.

PUB-09: añadir `withdrawal_reason` opcional texto privado recortado <=500, independiente de `availability`, editable al estar Withdrawn o si ya hay valor. Se conserva al cambiar estado y se borra solo explícitamente. No publicar ni copiar texto a eventos: solo nombre en changed. Puede estar desconocido y no exige cierre ni archiva la ficha. Se registra con save normal, `updated_at`, 409, sin alterar `confirmed_at` salvo cambios de campos que ya lo hacen. La tarea queda parcial por estados Let agreed/Let (EST-17), guardados, llamadas y portales. No llamar hechos a recuentos sin fuente ni deducir llamadas de confirmaciones.

Los estados de alquiler corresponden a EST-17: al construir ese tramo, reusar su contrato integrado para DB CHECK, API, UI, clasificación ON_MARKET, publicación, matching, alquileres y eventos. Nunca ampliar solo un enum sin migración compatible; no asumir cuándo un contrato pasa a Let ni activar redes (PUB-16). PUB-15 define IDs/feeds solo cuando Hampton identifique cuentas y exista contrato; no crear ID genérico ambiguo. Guardados/calls requieren productores con identidad, permiso y definiciones propios; no usar vistas o notas como sustitutos. `published_at` y motivo son fases independientes de ellos.

## SPR-02 y relación con M13

El acceso a vista de historial se mantiene según la decisión de Luis; su diseño es separado de la captura de eventos, y no se activa por este plan sin resolver ese alcance. Independientemente, todo productor futuro debe emitir actor, instante, origen, operación y vínculo estable con propiedad/evidencia, con cambio y evento atómicos, event id estable para replay. No reconstruir pasado, exponer texto libre en payload ni generar avisos por cada cambio sin contrato. Las fuentes actuales deben conservar sus eventos: creación/edición/publicación/archivado/ventas/medios/recálculo, con revisión secuencial; PUT sin cambios y 409 no crean evento, pero `confirmed` y `published` pueden producir eventos deliberados aunque no cambien campos. Productores futuros de observaciones, llamadas, capturas y consultas requieren contratos M02/M06/M07, no se consideran implementados aquí.

Para conservar acceso tras purga futura, la vista y la purga EST-19 deben acordar identificador mínimo/tombstone, retención, permisos y pruebas antes de activar borrado; no prometer preservación ilimitada ni mantener archivos o datos personales automáticamente. La ruta de ficha borrada actualmente no garantiza UI del historial; no marcar SPR-02 completa hasta la vista, productores y prueba de purga aprobadas.

## Aceptación

P1 Mostrar `published_at` existente y no atribuir exactitud al backfill histórico; republish conserva semántica actual. P2 Motivo opcional se guarda/limpia con 409 y no aparece en web, SEO ni texto de evento; cambiarlo no confirma disponibilidad. P3 Sin nuevos estados ni feeds fuera de EST-17/PUB-15; campos dependientes quedan pendientes. H1 Eventos existentes preservan orden, procedencia y atomicidad sin datos sensibles; H2 productores por dependencia y prueba de purga permanecen pendientes, sin inventar pasado. H3 La presentación del historial queda sujeta a decisión de Luis.
