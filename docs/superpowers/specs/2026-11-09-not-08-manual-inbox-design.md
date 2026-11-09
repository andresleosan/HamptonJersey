# NOT-08 · Categorías y enlaces del Inbox

9-nov-2026. Tramo manual solicitado de PAQ-01, construido sobre EST-17 publicado `f2113769903548f4c5a4763a51c7962e84e80aef`, con reserva propia y revisión independiente. El borrador comenzó sobre79ddcb0; su bloqueo inicial quedó resuelto antes de código. Publicación y migración0035 requieren autorización del SHA final de NOT-08. Las precisiones de implementación son decisiones técnicas, no nuevas citas de aprobación de Luis.

## Necesidad y decisiones existentes

El equipo necesita distinguir las tareas sin abrir otra bandeja: Agency replies, Messages y Compliance se añaden a All, New applicants, Matched, Viewings y Tasks. Needs action y Feed conservan su significado. NOT-11 ya aporta tareas compartidas; NOT-01 aporta proyección, destinos y preferencias. EST-18 base y NOT-11 tienen evidencia integrated en el coordinador, aunque sus ampliaciones futuras sigan parciales.

La ficha canónica de NOT-08 permite construir tareas manuales antes de activar correo y Meta. Esta propuesta no activa canales ni implementa los productores futuros de consultas, llamadas, captura, fuentes, revisión de 21 días o dictado. Sus tareas mantienen su registro común y enlace a la gestión existente. Historial visual de fichas sigue aplazado.

## Alternativas examinadas y propuesta

1. Filtrar solo en React los primeros 200 avisos actuales perdería tareas fuera de esa ventana y produciría contadores incoherentes. Se descarta.
2. Crear bandejas separadas duplicaría asignación, lectura y cierre. Se descarta.
3. Ampliar el contrato cerrado de categorías del Inbox, sus consultas y preferencias conserva una tarea, un contador y su destino. Es la propuesta técnica para este tramo; no se atribuye como aprobación nueva de Luis.

## Comportamiento propuesto

- Añadir `agency_reply`, `message` y `compliance` al catálogo compartido de categorías y a la restricción de la base. Etiquetas inglesas Agency replies, Messages y Compliance. Mantener códigos e IDs anteriores.
- Reutilizar la creación de follow-up en la ficha de tarea. Permitir elegir Tasks, Agency replies, Messages o Compliance; el valor omitido sigue siendo `task`. El título describe trabajo registrado por el equipo; seleccionar una categoría no certifica recepción por un canal externo.
- Mantener destinos manuales actuales `applicant` y `viewing`. Permitir además crear follow-up desde un aviso de `rental` ya existente, conservando su contexto validado de contrato, reparación o check. No añadir búsqueda global de contactos, selector de URLs o una pantalla de tareas independiente.
- Validar categorías, IDs y contexto en servidor; comprobar destino, contexto y responsable en el INSERT inicial de task.created y dentro del mismo batch. Un contexto rental ajeno debe devolver409 sin evento, tarea o recibo nuevos. Un registro borrado, responsable retirado o versión obsoleta no genera una tarea huérfana. `Done` solo cierra el aviso, no una obligación de Compliance ni una búsqueda.
- Enlazar cada tarea al destino existente mediante `noticeDto` y helpers del panel. Para un destino inexistente, mostrar el estado de registro no disponible, sin enlace activo ni acción Done. No crear destinos ficticios de consultas o mensajes todavía inexistentes.
- Reclasificar los descriptores actuales de checks/plazos de Rentals como Compliance al reconciliar su pendiente, mediante UPDATE de categoría de pendientes ya existentes, aunque su signature no cambie, conservando task_key, event_id, ID de aviso, asignación, cierre y recibos. El trigger registra la revisión y el historial; conserva filas de lectura, pero una revisión nueva requiere volver a leer la tarea. No crear notification.observed por esta reclasificación. Los nuevos eventos informativos `compliance.updated` se proyectan a Compliance. No rehacer el Feed histórico ni convertir cierres antiguos en nuevas tareas.
- Mantener los tipos futuros de trabajo en Tasks y su contrato interno `futureTaskStatements`; sus productores reales decidirán los destinos al integrarse. No declarar integración por fixtures.
- Contadores obtenidos por SQL sobre todas las tareas abiertas, antes del límite 200. All cuenta tareas únicas; categorías son disjuntas. No sumar Sales/Rentals/To confirm al total Inbox otra vez.
- Preferencias solo ocultan información del Feed. Needs action y tareas completadas continúan visibles. Conservar elecciones antiguas: nuevas categorías empiezan desactivadas para usuarios con preferencias guardadas; sin preferencias se aplica el catálogo completo. La migración no cambia silenciosamente elecciones ni revisiones.
- Conservar borrador, selección y recibo de retry incierto al refrescar o recibir un cambio de categoría de un compañero. Cambiar categoría con un borrador exige el aviso existente. Crear follow-up selecciona la categoría y tarea creadas, no presupone siempre `task`.
- Vacíos por categoría y caja, errores con Try again, estados de carga y etiquetas visibles. Agency replies/Messages vacíos no prometen conectividad real. Reusar los estados existentes en lugar de crear indicadores de canal.

## Persistencia y compatibilidad

La restricción de `notifications.category` de 0032 sigue limitada a cuatro valores después de 0033. Hace falta una migración nueva que preserve datos, FKs, vistas, triggers e índices actuales. Se propone `0035_notification_categories.sql` solo después de integrar la 0034 de EST-17; comprobar número libre y revisar el alcance si main cambia. Nunca editar migraciones aplicadas.

La creación antigua calcula el hash con target/title/reason/assigned/due. Una petición que omite categoría debe conservar exactamente esa serialización para reproducir recibos anteriores. Las categorías nuevas entran en la identidad de la petición; reutilizar operation_id con una categoría distinta devuelve conflicto. Mantener actor desde sesión autenticada y no aceptar actor, SQL, task_key o destino arbitrario desde HTTP.

Migración remota y publicación requieren autorización del SHA final. Ensayar primero base local poblada con avisos de las cuatro categorías, preferencias, lecturas, recibos y acciones anteriores. Conservar también vistas/triggers añadidos por 0033 y EST-17; no copiar a ciegas el DDL de 0032.

## Reglas visuales y skills

Superficie: Inbox, preferencias y follow-up existentes. DESIGN.md contiene una cabecera de paleta antigua; prevalecen los valores vigentes cotejados en `admin/src/styles.css`: ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d, bronze-dk #86542d, ok #2f6b4f, err #a32020, warn-bg #fff6e5, field-line #8f8a82. No se propone cambiar la paleta.

Tenor Sans/Georgia, H1 26px y H2 19px, peso 400; Montserrat/system-ui cuerpo 14px/1.5 y labels 12px. `.page` 1240px, padding 24px 16px 120px; `.card` padding 24px/radio 14px; campos padding 9px 12px/radio 10px; `.btn` padding 10px 20px/radio 999px, hover bronze-dk y disabled .45. Espacios 8/12/16/24px. Reusar `.seg`, `.field`, `.btn`, `.warn`, `.empty` y `.inbox-list`.

El Inbox apila a container 820px y formularios a viewport 760px. Controles de tarea actuales mínimo 36px escritorio y 44px móvil; categorías nuevas mínimo 44px en móvil, ajuste sin overflow a 390px y zoom 200%. Foco 2px bronze-dk/offset 2px en controles tocados; texto 4.5:1, límites/foco 3:1, teclado, labels nativos, aria-pressed y status/alert. No nuevas fuentes, iconos, librerías o animaciones; reduced motion conserva la regla vigente. ENERGY 1, RHYTHM 1, MOTION 1.

Brainstorming y grill-me identifican alternativas, permisos, compatibilidad y dependencias leyendo el código antes de preguntar. Writing-plans convierte este contrato en casos verificables. Impeccable/register product conserva jerarquía y foco; security-best-practices y frontend-security-coder restringen categoría/contexto/actor y salida escapada; antislop se aplica durante planificación y construcción según la instrucción explícita de avanzar, sin instalar ni modificar sus entradas. Web-performance-optimization conserva límite 200, SQL agregado y polling actual de 30s solo visible, sin nuevas peticiones por aviso. Ponytail reutiliza consultas, formularios, recibos y destinos. Taste-skill y redesign-skill no aplican: no hay página nueva ni rediseño de pantallas.

No datos personales en URL nueva, storage, logs o evidencia pública; React escapa título/motivo, enlaces tipados internos. Sin HTML del proveedor, permisos nuevos ni cambios en controles del VPS.

## Aceptación

1. Siete categorías coherentes en API, UI, preferencias y contadores; validación de categoría desconocida y permisos existentes.
2. Crear follow-up en categorías nuevas conserva asignación, plazo, destino válido y replay; petición antigua reproduce recibo sin cambios de hash.
3. Compliance abre el check/plazo correcto, sin confundir cerrar aviso con resolver la fuente.
4. Migración poblada preserva IDs, historial, FKs, triggers, lecturas y preferencias; ninguna tarea antigua reaparece por migrar.
5. Filtros correctos con más de 200 tareas; sin duplicados ni contadores tomados solo de la página.
6. Borradores/selección sobreviven a polling, cambio de categoría por compañero, errores y retries; creación selecciona su categoría real.
7. Recorrido local 1280/390 y zoom 200%, teclado/foco, vacío/error, destino borrado, consola/red y capturas. Suite completa, build y release comprobados antes de revisión/publicación.

## Bloqueo inicial y resolución

Al iniciar, la identidad VPS conservaba EST-17 submitted y turno held para `f2113769903548f4c5a4763a51c7962e84e80aef`. Se conservó esa entrega hasta publicar con autorización expresa y cerrar su reserva. Después se verificó main, se revisó el alcance y se obtuvo build propia NOT-08. No se publicaron planes para poder reservar ni se eludió la exclusión por actor.
