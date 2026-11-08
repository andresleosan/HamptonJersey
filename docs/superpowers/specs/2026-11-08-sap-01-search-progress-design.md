# SAP-01 · Estado comprobable de búsqueda y prerrequisito EST-01

Fecha:8-nov-2026. Lista1. Diseño funcional aprobado por Luis («esta bien si»). Entrega exclusivamente documental: no autoriza código, migraciones, publicación o activación.

## Intención y situación comprobada

El equipo debe distinguir ausencia de comprobaciones registradas, comprobación real en curso, última comprobación completa sin coincidencias y fallo del último intento. La búsqueda comercial/humana sigue activa hasta resolución explícita; la ejecución de un cruce no cambia ese ciclo.

Base verificada:main93f8f25c0aa029f1850f0c46855fb89fd524a8e3, 8-nov-2026, /tmp/hampton-lista1-plan-20261108. La copia limpia se actualizó por fast-forward conservando otras copias y entregas. Catálogo local de SAP-01 consultado con plan --list1 --taskSAP-01: reserved:false, buildAuthorized:false; sin reserva ni credencial.

Hoy Applicants muestra Queue=No matches y la ficha explica vacíos; no hay registro de último intento o éxito. recomputeForApplicant cruza el inventario residencial al guardar/reabrir y Recalculate all lo llama por tandas. El alta pública difiere el matching mediante waitUntil. recomputeForListing actualiza una vivienda para múltiples búsquedas: no es una comprobación de todo el inventario. afterSave conserva el guardado aunque falle el matching. EST-09 aporta search_state, resolución y protección de búsquedas activas.

## Enfoque y alcance aprobado

Dos fases identificadas, EST-01 → SAP-01. EST-01 aporta el contrato persistido mínimo para comprobaciones completas del inventario guardado de Hampton; SAP-01 presenta ese contrato en Applicants y la ficha. No simular horas a partir de created_at, updated_at, eventos de nuevos matches o la última modificación de una vivienda.

Alternativas descartadas: inferir búsqueda desde Stage/Queue daría estados falsos; introducir crawler, cola o servicio nuevo amplía indebidamente este trabajo. Se instrumentan los recálculos completos existentes y se reutilizan API, componentes y polling.

Fuera del alcance: ampliar inventario/fuentes externas, matching comercial, puntuación/top25 de BUS-14, datos de confirmación de SAP-02/EST-13, automatizaciones de reintento, nuevos canales y cambios al cierre humano/retención. El módulo solo declara scope=hampton_inventory. No promete haber consultado fuentes, hablado con agencias o confirmado disponibilidad.

## D1 · Registro y responsabilidades

Tabla nueva applicant_search_progress, una fila por búsqueda, FK applicant_id → applicants(id) ON DELETE CASCADE. Campos mínimos:

- applicant_id INTEGER PRIMARY KEY; attempt_seq INTEGER NOT NULL positivo; last_attempt_at TEXT NOT NULL UTC ISO; last_attempt_version TEXT NOT NULL; attempt_state TEXT NOT NULL en running/succeeded/failed; attempt_finished_at TEXT nullable; error_code TEXT nullable, único código público permitido check_failed.
- last_success_at TEXT nullable, last_success_version TEXT nullable, last_success_seq INTEGER nullable y last_success_checked_count INTEGER nullable no negativo. Preservar el último éxito cuando un intento posterior inicia o falla.
- No datos personales, textos de requisitos, excepciones crudas, stack traces ni credenciales. Alta y responsable proceden de applicants.created_at/assigned_to y el join de admins existente; no asignar responsable automáticamente ni usar al actor de ejecución como propietario.

No backfill de fechas ni éxitos. Una fila ausente significa «ninguna comprobación registrada», no prueba de que nunca se ejecutara un cruce histórico. Los updates de esta tabla no cambian applicants.updated_at ni contactos.last_activity_at/last_contact_at; la actividad automática no reinicia el plazo de conservación personal. FK/cascadas siguen el borrado real existente.

## D2 · Qué constituye un intento y un éxito

Solo recomputeForApplicant elegible, activa y residencial abre intento de comprobación completa; registro/cambios/reapertura y Recalculate all usan ese mismo punto. Si no se puede registrar el inicio, no ejecutar un cruce sin seguimiento; propagar al afterSave existente para conservar el guardado y permitir reparación posterior. Error de persistencia de la propia telemetría puede impedir registrar el fallo: nunca inventar su fecha, mostrar únicamente lo registrado y registrar código operativo fijo sin PII.

beginFullCheck obtiene attempt_seq nueva atómicamente con la versión guardada que se evaluará; nunca leer después una generación que pudiera pertenecer a otro ejecutor. El ticket contiene applicantId, seq, inputVersion y startedAt. La generación distingue ejecuciones simultáneas incluso si comparten timestamp.

Todas las escrituras del recálculo completo, incluida la restauración de avisos, y su sentencia final de éxito comparten batch, guard de búsqueda activa/versión y ticket vigente todavía running. La sentencia de éxito es la última mutación del batch. Repetir un cierre de ticket terminado no lo modifica. Éxito solo después de aplicar íntegramente los resultados. Si la versión cambió, se cerró la búsqueda o otro intento sustituyó el ticket, no escribir resultados ni éxito de la ejecución antigua. Mantener las salvaguardas de la vivienda evaluada que existan al integrar BUS-14; instrumentar no debe deshacerlas.

Un fallo de evaluación o del batch no cambia last_success*. finishFullCheckFailure actúa solo sobre el ticket todavía actual y su versión activa. El alta/cambio del cliente ya guardado no se revierte por fallar el cruce; mantener la semántica de afterSave y la respuesta pública no enumerante. No emitir éxito antes del commit ni convertir un guard fallido en éxito.

Un recálculo incremental de vivienda no actualiza estas marcas de comprobación completa. Estos datos no acreditan última observación de una fuente ni último contacto con un anunciante. Se mantiene la mecánica de coincidencias/avisos vigente; no reparar ni rediseñar su ranking dentro de SAP-01.

## D3 · Proyección API versionada

GET /admin/applicants conserva filtros y filas, añadiendo search_progress y match_counts={found,shortlisted,rejected} por LEFT JOIN 1:1 y consultas indexadas dentro del mismo SELECT, sin peticiones N+1. Su SELECT incluye internamente applicants.updated_at para proyectar, sin necesitar exponer esa versión adicional al listado. GET detalle añade el mismo objeto y contadores globales. Nueva GET autenticada /admin/applicants/:id/progress devuelve {applicant_id,search_progress,match_counts,server_time}; no devuelve contacto, requisitos, fichas o conversaciones y no escribe. Applicant actual, progreso y contadores se leen en una misma instantánea SQL/DB.batch; el estado y los counts siempre pertenecen a la misma respuesta, nunca a un formulario o una página anterior.

Progress v1 contiene: version:1; scope:hampton_inventory; lifecycle:active/resolved/needs_review/archived/unsupported; state:unrecorded/running/succeeded/failed/interrupted/needs_recheck/historical/unsupported/unverifiable; last_attempt_at, attempt_finished_at, last_success_at, last_success_checked_count; last_attempt_current y last_success_current. Fechas UTC ISO o null. Booleanos comparan versión registrada con applicants.updated_at guardada. No exponer ticket, emails de actor, error interno ni nuevos datos personales.

Precedencia: categoría comercial → unsupported; búsqueda cerrada/archivada/needs_review → historical si hay registro, unrecorded si no; activa sin fila → unrecorded; versión del último intento diferente de la búsqueda guardada → needs_recheck; running actual → running hasta120000ms desde inicio y después interrupted; failed actual → failed; succeeded actual → succeeded. interrupted solo indica falta de finalización registrada: no persiste un timeout ni cancela el proceso; si termina válidamente después, pasa a succeeded. Una fecha inválida/futura o una combinación cronológica incoherente fuera del contrato se degrada a unverifiable: no indicar éxito/running actual ni formatear la fecha inválida; conservar únicamente fechas válidas como historial no verificado. No convertir null legítimo en fecha inválida.

Capturar nowIso/server_time después de obtener la instantánea de applicant/progreso/counts y usar esa misma hora en toda la proyección/respuesta. Así un begin concurrente entre el inicio de la petición y el SELECT no se degrada por una hora capturada demasiado pronto. El servidor decide el estado con ese reloj; server_time permite formatear relativo sin asumir que el reloj del dispositivo es correcto. Cero entries comprobadas puede ser éxito de inventario vacío, pero no prueba ausencia de propiedades en el mercado.

## D4 · Presentación y copy

Componente reutilizable SearchProgress con variante compacta bajo Queue en Applicants y variante completa junto a SearchLifecycle en la ficha, visible también en Matches sin duplicar regiones live. Mantener Stage, Queue, lifecycle y contadores; no inventar columnas de confirmación ni modificar el filtro No matches.

| Estado | Texto funcional en inglés |
| --- | --- |
| unrecorded | No inventory check recorded |
| running actual | Checking saved Hampton inventory… |
| succeeded, sin Found/Shortlisted ni rechazadas | No matches yet in the saved Hampton inventory. |
| succeeded, sin Found/Shortlisted pero con rechazadas | No matches left to review. |
| succeeded, con coincidencias propuestas | Inventory check completed. |
| failed, con éxito anterior válido | Last inventory check failed. The last successful check is shown below. |
| failed, sin éxito anterior | Last inventory check failed. No successful inventory check has been recorded. |
| interrupted | A check started, but its completion has not been recorded. |
| needs_recheck | The current saved search has not been checked yet. |
| unsupported | Commercial matching is not available yet. Review this search manually. |
| unverifiable | Inventory check status cannot be verified. |

Etiquetas Last recorded attempt y Last successful inventory check; no mostrar fecha vacía como cero o «now». En la vista completa: Scope: saved Hampton inventory. External sources and availability confirmations are not covered by this check. Solo si existe last_success_at válido y last_success_current=false, añadir For an earlier version of this search. Sin éxito registrado no mostrar etiqueta o nota de un éxito anterior. En histórico, mostrar Search resolved/Archived search/Search needs review según ciclo real y fechas conservadas sin animación ni frase de búsqueda continua.

Los contadores Found/Shortlisted/Rejected usados para el vacío son del servidor y globales, nunca created del último recálculo ni tamaño de una página. No anunciar «no matches» durante fallo/carga/cambio de versión. Revisar todas no convierte un inventario con rechazadas en una búsqueda que no encontró nada.

Fechas en Europe/Jersey, Intl en-GB, día/mes/año/hora/minuto y zona identificada como Jersey time; <time dateTime> conserva UTC. Relativo calculado con server_time; fecha exacta disponible junto al relativo o en texto accesible, no solo hover. No cambiar globalmente fmtDate para otras pantallas: helper específico fmtSearchCheckTime.

## D5 · Actualización y fallos de lectura

Reutilizar usePoll cada30000ms con guard visible/sesión/componente activo, sin peticiones solapadas ni actualización de otra búsqueda por respuestas tardías. En Applicants conservar debounce200ms de filtros y usar una petición del listado, nunca una por fila. En detalle pedir solo /progress y actualizar juntos search_progress/match_counts/server_time, sin recargar contacto/formulario ni reemplazar borradores, foco o razón de resolución. No usar los counts del detalle inicial con un progreso posterior. No introducir intervalos paralelos ni tocar la frecuencia de otros módulos.

API401 conserva mecanismo hs:signed-out; detener actualización al desmontar/caducar sesión. Invalidar también la generación de lecturas pendientes tras Save/Apply, resolver/reabrir/archivar/restaurar y revisión/Undo locales, aunque el ID no cambie. Una respuesta iniciada antes de la acción no puede sustituir sus resultados. Al fallar lectura mostrar Couldn't refresh search status. y Reload status, conservar última instantánea rotulada Last recorded status y dejar de representar su running como estado actual. Reintentar solo lectura; no ejecutar matching por GET, polling o botón Reload status. No nuevo botón de recálculo automático ni aviso externo.

## D6 · Diseño, accesibilidad y skills

Reglas vigentes del panel en DESIGN.md Colors/Hierarchy(panel)/Layout/Components y CSS: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, bronze-dk#86542d, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. Bronce pequeño=bronze-dk. Tenor Sans/Georgia/serif H1 26px/H2 19px peso400; Montserrat/system-ui cuerpo14px/1.5, secundario12px. Página1240px, padding24px 16px 120px, tarjeta radio14/padding24. Espacios nuevos8/12/16/24; variante compacta texto12px. Reutilizar .muted/.badge/.err/.inline, sin tarjeta dentro de tarjeta.

Foco2px/offset2px. Reload status min32px escritorio y44px móvil; reflow bajo760px como Applicants vigente. Texto≥4.5:1, controles/foco≥3:1, estado siempre textual. Una sola región polite para cambios reales de estado en detalle, separada de los textos de fecha relativa; no anunciar cientos de filas ni cada tick relativo. Sin mover foco al refrescar, sin shimmer/spinner decorativo. Keyboard y zoom200%, controles visibles a1280/390 sin overflow ni solape de actionbar.

impeccable/antislop: estados operativos, copy exacto, sin métricas decorativas, ENERGY1/RHYTHM1/MOTION1 por continuidad del panel. ponytail: una tabla1:1, un proyector, componente y polling existentes; sin jobs nuevos. web-performance-optimization: LEFT JOIN, sin N+1, lectura pequeña en detalle,30s visible. security-best-practices/frontend-security-coder: sesión y same-origin existentes, validación server de IDs, SQL parametrizado, escape React, errores de código fijo y cero PII nueva en storage/logs. taste-skill no aplica: no página nueva. redesign-skill no aplica: ampliación de estados, no rediseño de pantallas.

## D7 · Dependencias, construcción y activación

Planificar no requiere reservas ni evidencia del coordinador. La fase EST-01 conserva dependencias canónicas BUS-01 y EST-09: verificar su evidencia al construir; este documento no declara integrado el inventario común ni termina todo BUS-01. Si el catálogo considera insuficiente el alcance local, concretar/revisar la unidad antes de build, sin fabricar evidencia ni omitir el bloqueo. SAP-01 requiere EST-01 integrado; validar la atestación del contrato v1.

BUS-14 es planificado, no prerrequisito funcional de esta UI, pero toca match-store/Applicants: al integrar conservar su orden, paginación y guards si ya existen. Si la implementación SAP-01/EST-01 se construye antes, BUS-14 deberá mantener esta instrumentación. No depender de data.matches completo; consumir contadores/progreso explícitos.

No requiere activar fuentes, cron, correos o puertos. La migración se aplicará por el flujo autorizado y el SHA de código se revisará antes de publicar. Verificar telemetría con fixtures locales; producción solo mediante acciones expresamente autorizadas. No ejecutar recálculos masivos remotos para verificar este plan.

## Aceptación

A1 fila legacy ausente sin fechas inventadas; A2 intento real y éxito solo tras batch; A3 fallo conserva éxito; A4 intento antiguo/cierre/edición no sobrescribe; A5 parcial de vivienda no acredita full; A6 lista/detalle/progress comparten contrato sin N+1 ni escrituras GET; A7 cero resultados frente a revisadas y fallidas correctamente; A8 polling no pierde borrador/foco ni aplica respuestas tardías; A9 DST Europe/Jersey/fechas nulas/futuras y120s honrados; A10 retención/roles/respuesta pública y decisiones de matching conservados. Plan y ledger enlazados describen las comprobaciones futuras y la revisión documental real.
