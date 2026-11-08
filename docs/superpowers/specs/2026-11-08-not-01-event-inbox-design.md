# NOT-01 · Avisos del recorrido en el Inbox compartido

Fecha: 8-nov-2026. **Solo planificación**, por elección reiterada de Luis. Ninguna reserva, construcción, migración o publicación de NOT-01 en este encargo. Base de producto observada: main/GitHub `6d2f779`; ajuste local del procedimiento sin reservas `32e06e6`.

## Objetivo y decisiones existentes

Cada novedad relevante de un módulo deja un aviso con contexto y enlace; el trabajo pendiente mantiene responsable, plazo, revisión e historial del contrato NOT-11. Una respuesta o transición útil actualiza/cierra la gestión correspondiente, sin duplicados ni cierre de otra búsqueda. Se conserva el Inbox común de F0 A8/A9, Needs action/Feed y polling cada30s con pestaña visible/sesión activa.

Esta spec desarrolla M13 y el alcance de `docs/roadmap/tasks/NOT-01.json`. No cambia la decisión de Luis de planificar sin construir dependencias. NOT-11 y EST-18 son requisitos de **integración futura**, no de estos documentos. EST-18 ya tiene registro interno de propiedades en main; faltan sus futuros productores. El código local NOT-11 está conservado en `/tmp/hampton-not11` (`f98532a`) y su plan de continuidad en `/tmp/hampton-lista3-planes-F9MZzqRo` (`8e65d7a`); no se importan ni se afirman publicados.

## Enfoque propuesto

Ampliar el Inbox existente y proyectar los hechos de negocio en tareas mediante el contrato común de NOT-11. Los escritores existentes producen avisos en el mismo batch que su evento; los módulos futuros consumen un adaptador documentado y probado, y se conectan cuando existan. Crear otra bandeja duplicaría las fuentes de trabajo; una cola externa o WebSocket no se justifican para este equipo.

Las decisiones funcionales existentes se conservan. Las firmas y distribución siguientes son propuestas técnicas del plan, no aprobaciones nuevas atribuidas a Luis. La aprobación de este diseño y la habilitación de construcción se revisarán cuando se solicite implementar.

## Qué existe y qué se conecta

| Fuente | Evidencia actual | Proyección propuesta |
|---|---|---|
| Alta/repetición de aplicante, solicitud pública de visita, matches | events + notifications existentes | Preservar categorías, episodios, enlaces y cierres; no emitir otro aviso por introducir el adaptador |
| Visita reservada por empleado, confirmada/cancelada/reprogramada/completada | `server/routes/inbox.js`, events | Reserva/confirmación/cambio efectivo al Feed con enlace a la visita; solicitud todavía pendiente sigue en su tarea actual, sin duplicar |
| Ofertas e hitos de venta | `server/routes/sales.js`, events del comprador con offer_id/sale_id | Hechos al Feed; una acción que la lógica Sales actual identifica pendiente va a Needs action, ligada a oferta/venta exacta |
| Cobros, pasos de atraso, cumplimiento, renovación, reparación | `server/routes/rent.js`, `rentals.js`, rental_events y colas actuales | Adaptar esos hechos y pendientes existentes, sin recalcular dinero o inventar plazos; episodio por contrato/cargo/paso, obligación o reparación |
| Estado de ficha, disponibilidad, To confirm | EST-18, listing-events y TO_CONFIRM | Cambios materiales al Feed; tarea de confirmación por ficha/episodio, actualizada al confirmar o retirar del alcance |
| MUST desconocido, fuente fallida, llamada, respuesta útil, captura parcial/completa, día21, dictado | Productores futuros en sus módulos | Definir sus descriptores/contratos y fixtures; activar cada adaptador real solo cuando el productor exista y sea integrado |

No se consideran ejecutados los módulos futuros por aceptar un descriptor sintético. Registrar un evento informativo no decide disponibilidad ni crea necesariamente una acción. NOT-08 añade las pestañas específicas; NOT-09 añade Approve/Reply/Call/Snooze. NOT-01 entrega avisos navegables y la proyección común, sin duplicar esos controles o construir canales.

## Contrato de aviso y episodios

Un descriptor interno contiene `taskKey`, `eventId`, `sourceVersion`, `category`, `target:{kind,id}`, `title`, `reason`, `requiresAction`, `resolved`, `dueAt` y `urgency`. El actor procede de la operación autenticada o system; estos descriptores no se aceptan desde una nueva API pública.

- `taskKey` es estable por tipo/entidad/operación/episodio. No incluye revisión de presentación. `sourceVersion` es monotónica, preferiblemente ID/revisión real del evento; no se usa hora de recepción para sobrescribir hechos nuevos con reintentos viejos.
- Cada evento informativo distinto puede tener su entrada Feed; repetir el mismo evento no la duplica. Una gestión abierta se actualiza en el mismo ID. Un episodio cerrado no revive por repetir un evento o recalcular una puntuación.
- Conservar assigned_to/due_at al recibir contexto nuevo, salvo modificación expresa y válida del dominio. Un productor no puede saltarse el control de versión de NOT-11 ni restaurar contenido eliminado.
- Si una acción todavía no tiene regla de responsable/plazo en su módulo, permanece Unassigned/No deadline; no inventar reparto,48h,días laborables o cadencia del día21.
- Done solo cierra el aviso. Un pago se concilia en Rentals, una oferta se resuelve en Sales, una visita en Viewings y una búsqueda mediante EST-09. La proyección observa ese resultado; no sustituye su validación.
- Una respuesta útil retira o cambia únicamente la llamada del mismo episodio. Consultas útiles a otras búsquedas sobreviven. Los vínculos múltiples y política de cierre compartido se implementan en M06.

## Datos, enlaces y atomicidad

Reutilizar events para hechos comunes y conservar rental_events como historial de alquiler. Para referenciar alquiler desde notifications, crear un evento puente mínimo identificado de forma única por rental_event_id, sin copiar su data libre; incorporar `rental` al enum de entidades si el esquema integrado todavía lo exige. No reconstruir historial antiguo ni emitir avisos masivos de datos anteriores.

`target.kind` admite applicant/contact/viewing/offer/sale/rental/listing; ID y existencia se validan según tipo. Enlaces del servidor: búsqueda/contacto según contrato actual; visitas a `#/viewings` con selección exacta; ofertas a `#/sales?applicant=<id>` con selección de oferta y ventas a `#/sales/<saleId>`; alquiler a `#/rentals/<rentalId>` con selección de contrato/obligación; ficha a su editor admin existente. Los parámetros de selección se implementan en sus pantallas si aún no existen; no crear un href que la pantalla ignore. Nunca URLs libres ni rutas de archivos privados.

La mutación efectiva, evento y aviso se guardan en un único batch, o se revierten juntos. `syncTask` de NOT-11 ejecuta su propio batch: **no llamarlo después de guardar y afirmar atomicidad**. Extraer una variante componible `taskStatements` que devuelve las sentencias; conservar syncTask como wrapper para sus consumidores actuales. Guardas changes()/last_insert_rowid() existentes no se alteran por intercalar escrituras.

Los eventos de listing se generan mediante triggers. Proyectar antes de retirar listing_event_context, comprobando la revisión nueva frente a previous_revision; no identificar el evento de trigger por el último ID insertado por la sentencia exterior. Extender de forma opcional listingEventStatements para insertar la proyección después de los guardas del escritor y antes de su cleanup, preservando las firmas de consumidores actuales.

Para vencimientos derivados del paso del tiempo, un reconciliador acotado lee las colas existentes y genera/cierra por claves estables. Reutilizar ARREARS_SQL/deadlines/complianceStatus/TO_CONFIRM y reglas actuales; NOT-05 define grace_days y comisiones cuando se construya. Cada pass procesa un máximo50 entidades y persiste cursor por tipo; reintento retoma sin tareas diarias repetidas. El cierre debe considerar también episodios abiertos cuyo dominio dejó de estar pendiente, evitando tareas huérfanas.

## Tiempo de actualización y avisos del navegador

Para hechos guardados por rutas, el aviso queda confirmado con el evento; con pestaña visible llega en el siguiente poll de30s, objetivo observado menor de60s. El reloj actual ejecuta cada10min: un plazo que vence sin una escritura puede tardar hasta un tick más el poll en reflejarse. No prometer menos de un minuto para ese caso ni cambiar cron/infraestructura en NOT-01; una exigencia de menor latencia requerirá una decisión explícita.

Se incluye notificación nativa del navegador para avisos urgentes nuevos mientras el panel está abierto y consultando. Propuesta conservadora de urgencia inicial: reparaciones que el dominio ya clasifica emergency; otros módulos deben declarar su urgencia conforme a sus reglas, sin inferirla del título. No convertir automáticamente cada atraso/plazo en alerta urgente.

- Pedir permiso únicamente tras pulsar Enable browser alerts, nunca al cargar. Permiso denegado/no soportado mantiene el Inbox y muestra su estado, sin volver a preguntar automáticamente.
- Sin push/service worker ni promesa de avisos con panel cerrado o polling detenido. NOT-11 conserva como pendiente la política completa de canales; este indicador no crea preferencias de email/Telegram.
- Notificación genérica: título `Hampton needs your attention`, cuerpo `Open Inbox to review a task.` Sin nombres, teléfonos, direcciones, importes o texto de cliente en la pantalla del dispositivo.
- Usar tag por ID de aviso y control de episodio/revisión en memoria. Varias pestañas coordinan metadatos mínimos para no repetir; cerrar/reabrir la sesión no dispara alertas por todo el histórico. El baseline inicial se establece al primer poll correcto.
- Click lleva al Inbox autenticado, nunca a una URL recibida en texto. Sesión caducada conserva su flujo de login y no revela contenido.

## Interfaz, seguridad y rendimiento

Se mantiene la superficie de NOT-11. Añadir etiquetas legibles y enlaces de destino; futuras pestañas son NOT-08. Todos los avisos se encuentran en All; agrupación y contadores representan tareas únicas, no suma de eventos o lecturas personales. Conservan su significado los contadores propios Sales/Rentals/To confirm; no sumarlos otra vez al badge Inbox.

Aplicar los valores vigentes de DESIGN/CSS: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, field-line#8f8a82, warn-bg#fff6e5. Tenor Sans H1/H2 26/19px, Montserrat14px/1.5, etiquetas12px, pesos400/500/600. Contenedor1240px, página24px16px120px, tarjetas radio14/padding24, campos radio10, botones píldora/padding10px20px, gaps8/12/16/24. Inbox lista240–340px y detalle, apilado bajo820px. Nuevos radios/breakpoints genéricos de DESIGN son propuestas, no sustituciones de estos valores.

Texto inglés; estado siempre con texto además de color, contraste normal≥4.5:1 y foco/controles≥3:1, foco2px/offset2px, objetivos32px escritorio/44px móvil. Reutilizar mensajes status/alert, errores con campos asociados, foco y borradores conservados a1280/390 y zoom200%. Sin fuentes, adornos, dependencias o animaciones nuevas; reduced motion respetado.

Sesión admin/same-origin/actor desde sesión; SQL parametrizado y enums cerrados; React como texto sin HTML libre; datos personales fuera de almacenamiento del navegador y logs. Referencias privadas requieren autorización al abrir. Borrar/anonimizar limpia proyección y replay; historial mínimo no guarda contenido libre. Listas≤200, historial50, batch de reconciliación50, índices por identidad/evento/estado; sin N+1 ni barrer todo rental_events/events en cada poll.

## Aceptación y límites de ejecución

Cada fila de fuentes tiene fixture y prueba de transición/reintento/no-op/conflicto; respuesta útil y dos empleados/ticks simultáneos dejan una gestión coherente. Los enlaces abren la entidad correcta. Eventos de historial y tareas se distinguen. Migración conserva events/notifications/rental_events, índices y triggers en base poblada con FK activas.

Se probarán permisos del navegador, rechazo/ausencia de API, baseline, duplicados y datos sensibles ausentes; escritorio1280/móvil390, teclado/foco/zoom y consola/red. Pruebas futuras no se presentan como ejecutadas ahora. Estado: diseño/plan propuestos para revisión; construcción pendiente de encargo explícito, integración de NOT-11 y evidencia vigente de EST-18, alcance revisado y reserva build.
