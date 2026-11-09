# Lista2 · Consultas, presentación privada y controles compartidos

**Alcance vigente8-nov:** [decisiones posteriores de Luis](../../roadmap/2026-11-09-list2-published-scope.md) y [preparación por tarea](../plans/2026-11-09-list2-build-ready-github.md) sustituyen propuestas incompatibles de este diseño: conexión centralPro/Hermes, no planes individuales, Meta fuera, WhatsApp/conectores/local posteriores y enlace privado hasta revocación. No asumir habilitación del proveedor ni ejecutar ramas históricas excluidas.

Estado: diseño de planificación, sin construcción/activación/publicación. Base main comprobada8-nov18:55:35UTC `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`. Actualizada por fast-forward conservando por SHA256 los21 Markdown locales previos. Este cambio remoto trata tours y no demuestra integración de los planes BUS locales.

## Alcance y decisiones

Catorce planes: AUT-09, AUT-10, AUT-11, AUT-01, PRE-22 y AGE-03/05/06/08/09/10/11/12/14. Reutilizar [la tanda BUS](../plans/2026-11-09-list2-build-ready-github.md), [AGE-04](2026-11-07-age-04-directory-design.md), [correo](2026-11-06-hampton-app-email-design.md), [franjas REG-17](2026-11-07-reg-17-availability-design.md) y la reconciliación de roadmap. Cada código conserva dependencias, aceptación y cierre propios.

Respuestas de Luis en este turno:

1. Disponibilidad general reutilizable hasta información nueva, mostrando siempre fecha. No caduca por7/30 días. Condiciones concretas de cada cliente siguen independientes.
2. Dos días laborables de lunes a viernes, misma hora de Jersey, desde envío real sin respuesta útil. No48horas naturales. No se solicitó excluir festivos entre semana.
3. Presentación privada requiere una revisión adicional del empleado antes de enviarla, además de match aprobado/disponibilidad/fotos aptas. Auto no salta esa revisión.

Propuestas técnicas del planificador, no respuestas atribuidas a Luis: límites/paginación, contratos siguientes, sesión privada de enlace7días revocable y pasos de integración. La política de duración del enlace no es la política de vigencia comercial.

Consultas específicas para MUST desconocido siguen fuera de los envíos de esta tanda, como decisión abierta del roadmap; no se contacta automáticamente por un match aún sin aprobar. No se añaden cadenas24/72h, llamadas automáticas, negociación IA, porcentaje de comisión, portal de documentos ni borrado automático. Los ajustes de infraestructura/modelos/Meta y activación de correo siguen con sus responsables. AGE-04 no se reconstruye y AUT-17 no se vuelve a implementar.

## Autoridad y contratos

Todas las firmas son propuestas a reconciliar con código integrado real antes de construir. JavaScript/D1/R2/React existentes; sin nuevas dependencias por defecto. Toda migración toma siguiente ordinal libre entonces; no reservar números ni modificar una ya aplicada. No usar una plantilla o reserva para eludir una dependencia. Planificación local sin coordinador/reserva.

### A. AUT-09/10/11/01, controles

`AutomationDefinition={id,version,purpose,trigger,input_class,operations,human_gates,limits,failure_policy,acceptance,owner}`. Registro de IDs conocidos en `server/automation-contracts.js`, nunca scripts/reglas arbitrarias de entrada. Definiciones de toda automatización real del catálogo; configuración externa bloqueada se documenta, no se inventa como operativa.

AUT-09 define fichas y criterios; AUT-10 es único escritor de configuración por operación: `getOperationPolicy(env,automationId,operation)` y `setOperationPolicy(env,{automation_id,operation,mode,version,params},actor)`. Modos `draft|approve|auto`, con gates humanos inmutables del registro. No hay interruptor del reloj/retención ni nuevo interruptor Hermes contrario a decisiones existentes. Match, criterios dictados, presentación y cierre conservan sus puntos humanos.

`automation_runs` guarda referencias/contadores/estado/entrada-salida resumidas sin PII, modelo efectivo y uso/coste/currency si se conocen. Coste desconocido es null, no0; no sumar monedas distintas. Configurar un tope no autoriza gastar. Comparar en unidades monetarias menores y reservar cupo antes de llamada cuando exista lector de coste apto. Al llegar al tope pasar a Draft; uso incierto requiere revisión, no inventar exactitud. Sin cuota/carril configurado no activar IA. AUT-01 muestra/configura estas capacidades en Automations existente, páginas50, historial redactado y detalle solo autorizado. No instrumentar todos los sistemas con datos completos por llamarlo log.

AUT-11 produce `authorizeOutbound(env,{kind,entity_id,revision,recipient_hash},at) -> {allowed,reasons,authorization_revision}`. Revalidar al preparar, reclamar y justo antes de llamar al proveedor: modo, pausa global, supresión, aprobación/versiones, búsqueda activa, propiedad/operación, disponibilidad y permiso del canal. No mantener dos motores de envío: adaptar AUTHORIZED y dispatchEmail actuales. Aprobación atada a contenido/destinatario/revisiones; un cambio material deja needs_review.

Mantener límite compartido actual de100intentos de correo por día y límite propuesto por anunciante de una consulta general abierta por propiedad/operación/contexto. Otros topes por canal parametrizables con default que impide envío si el canal no está integrado. No crear WhatsApp/SMS ni sus horarios sin esa integración. Pause all outbound afecta productores automáticos y correo, y solo staff reanuda. Se conserva la excepción C13 existente: reply humano explícito en chat web activo no queda bloqueado por pausa; no se extrapola a otros canales. Una pausa no puede retirar un mensaje que ya llegó al proveedor; registrar ese límite y estado incierto.

### B. AGE-03, consulta compartida

`Consultation={id,property_id,operation,scope,context_hash,status,revision,advertiser_ids,channel,selected_case_id?,snapshot,approved_by,approved_at}`; scope general o caso concreto explícito. Estados draft/approved/queued/sent/awaiting_response/answered/manual_pending/needs_review/cancelled. Tablas aditivas `consultations`, `consultation_matches`, `consultation_attempts`, `consultation_responses`, `consultation_call_tasks`.

`prepareConsultation(env,{property_id,operation,approved_match_ids,selected_case_id?,channel},actor)`; `approveConsultation(env,id,{revision,snapshot_hash},actor)`; `getConsultationContext(env,id)` en `server/consultations.js`. Matches ya aprobados, vigentes y misma propiedad/operación; no aceptar el checkbox cliente como prueba. Una consulta general sirve a cinco matches; receptor múltiple no significa envío a varias agencias sin revisar: snapshot contiene destinatario/canal específico y no CC de familias.

Mensaje de consulta: identificar inmueble, interés y preguntar disponibilidad/horarios. Si se incluyen ocupantes, usar solo el caso concreto seleccionado, mínimo número/tipo permitido; sin nombres, contactos, presupuesto, documentos o suma de hogares. Negocio/comercial no inventa residentes. Cambiar caso/destinatario/contenido invalida aprobación. No incluir comisiones. La disponibilidad general no prueba aceptación de todos los hogares. Restricción/desconocimiento se conserva y cada condición faltante va a revisión. Al salir debe quedar al menos un match aprobado con búsqueda vigente: cerrar una de cinco no cancela la consulta general útil a los otros cuatro; perder el caso concreto cuyos ocupantes se incluyeron sí invalida ese snapshot.

### C. AGE-05, envío

`enqueueConsultation(env,id,{revision},actor)` en `server/consultation-delivery.js` crea una acción durable con identidad consulta/revisión/canal/destinatario. Correo integra outbound actual mediante nueva plantilla específica, sin puerta pública de envío. Correlación HE-OUT y recepción actuales son pistas, no autenticación.

Estado accepted del proveedor es evidencia de aceptación para envío, no de lectura ni respuesta; fijar `sent_at` al acuse inequívoco del proveedor o evidencia manual de envío real. Si proveedor ofrece entrega confirmada posterior, mantenerla distinta. Resultado incierto deja unknown, sin reintento automático ni plazo de llamada fingido. Reintentos solo tras rechazo inequívoco reintentable; conservar límites actuales. Tras timeout de resultado incierto no afirmar entrega exactamente-una-vez: no se repite automáticamente y se revisa.

Canal no integrado produce tarea manual con destinatario/contenido; marcar enviado manualmente exige actor, fecha y evidencia, sin API oculta de envío. Dos empleados usan versión/acción única. Revalidar incluso manual antes de confirmar contenido actual; evidencia de envío antiguo se registra como hecho con advertencia, sin aprobarlo retrospectivamente. Guardar respuestas útiles aunque aún falte sent_at o esté sending/unknown. Un acuse tardío nunca devuelve answered a awaiting_response ni crea Call: registro de respuesta, acuse y vencimiento usan condiciones transaccionales actuales.

### D. AGE-06/08/09, respuesta, llamada y evidencia

`recordConsultationResponse(env,id,{revision,kind,evidence_ref,scope,availability,conditions,received_at},actor)` en `server/consultation-responses.js`; kind acknowledgement/ambiguous/useful/call_inconclusive. El personal valida vínculo/scope; From/subject no confirman identidad. IA no es requisito: si se añade luego, solo borrador por carril apto, nunca confirmación autónoma.

Consumir contrato de EST-13/16/15 para hechos comerciales con actor/fecha/origen/alcance. General available se reutiliza sin caducidad temporal hasta información nueva; mostrar checked_at siempre. Contradicción crea revisión y bloquea acciones pendientes afectadas sin convertir por scraping una confirmación humana en otra. Baja comercial confirmada propaga por alcance; no cerrar búsqueda, confirmar visita ni aceptar condiciones de otros clientes. Respuesta útil resuelve lo efectivamente confirmado; condiciones específicas pendientes siguen pendientes.

`callDueAt(sent_at,'Europe/Jersey')` en `server/consultation-calls.js` avanza dos fechas lunes-viernes a la misma hora local: jueves->lunes, viernes->martes, sábado->martes. Festivo entre semana cuenta por decisión lunes-viernes. Hora inexistente por DST: primer instante válido posterior; hora repetida: primera ocurrencia. Worker cada10min crea al vencer, no exactamente al segundo. Una Call por consulta/ciclo, con todos los teléfonos y titulares de AGE-04, historial, aprobaciones y clientes vinculados en vista staff. No copiar esos datos a Telegram/log general.

`consultationCallTick(env,ts)` crea/actualiza tarea NOT-11; `recordCallOutcome` usa misma autoridad de respuesta. Respuesta útil concurrente invalida/revisa la llamada; no llamar a una tarea ya resuelta por una pantalla vieja. Sin contestar/inconcluso no prueba indisponible. No segundo correo automático.

AGE-09 proporciona `getConsultationEvidence(env,id) -> {general_checks,presentations,approvals,attempts,responses,calls}`. Registrar solo datos compartidos realmente, evento atómico en EST-18 y evidencias protegidas. Una consulta general no es presentación identificable de un cliente. No hacer un historial global nuevo que Luis aplazó; detalle contextual sí. Evidencia técnica no certifica derechos de comisión.

### E. PRE-22/AGE-10, acuerdos y fotos

PRE-22 amplía referencia comercial privada de AGE-04 con `{advertiser_id,version,status,operation?,terms,currency?,rate?,evidence_ref,recorded_by,recorded_at}`. Ningún porcentaje por defecto; rates null no0, nunca insertar condiciones sugeridas por IA como acuerdo. No bloquear consulta/visita por comisión ni confundirla con permiso de fotos.

AGE-10 consume captura SPR-03, no vuelve a descargar el inventario. `ImagePermission={media_id,source_ref,original_hash,scope,allowed_variant_ids,reviewed_by,reviewed_at,status}`; status pending/private_approved/denied/revoked. `approvePrivateMedia(env,input,actor,expectedVersion)` y `getPrivateMediaForPresentation(env,mediaId,context)` en `server/private-media.js`.

Original con marca queda interno; foto propia o versión sin marca aportada/autorizada puede aprobarse. No borrar marcas automáticamente ni dar permiso a toda agencia por una imagen. Conservar hashes/variantes y evidencia privada, no reescribir original. Revocación bloquea entrega posterior y enlaces activos afectados; no puede retirar una copia ya descargada. Todo acceso R2 pasa por autorización staff o grant de presentación vigente; no reutilizar URLs de media públicas para originales externos privados.

### F. AGE-11/12, presentación y respuesta privada

`preparePresentation(env,{match_target,property_id,operation,media_ids},actor) -> {presentation_id,revision,status}` en `server/private-presentations.js`. Estados draft/needs_review/approved/queued/sent/manual_pending/revoked. Revisión adicional humana obligatoria con snapshot de match aprobado, disponibilidad confirmada/condiciones, contenido, medios autorizados y destinatario. Un cambio de versión invalida aprobación pendiente. Alternativas internas/top20 no entran por Auto.

`approvePresentation` y `queuePresentation` consumen AUT-11 y AGE-05 como infraestructura compartida de acción, sin fingir que una plantilla consulta es plantilla cliente. Correo depende AUT-17 real; canal manual conserva evidencia. No crear una cadena24/72h ni pedir flexibilizar MUST.

AGE-12 es propietario de grants/sesiones y respuesta: `createPresentationGrant(env,{presentation_id,applicant_id,expires_at},actor)`, `revokePresentationGrant`, `getPresentedOptions(env,grant)`, `recordPresentationResponse(env,grant,{presentation_id,version,choice,reason?})` en `server/presentation-access.js`. Permitir grant preparado/dormant para incorporar su enlace al snapshot antes de enviar; solo se activa tras acuse inequívoco de aceptación del envío o evidencia manual. Unknown lo mantiene inactivo hasta conciliación. Un grant ve solo ese cliente y opciones enviadas, nunca futuras opciones/otros hogares. Un enlace a un borrador aprobado todavía no enviado no presenta opciones por adelantado.

Propuesta técnica de enlace:256bits aleatorios, solo hash en DB, vigencia hasta revocación expresa, expires_at:null y versionado; token de arranque en fragmento eliminado de la URL antes de cargar recursos. Canje POST same-origin a cookie HttpOnly/Secure/SameSite estricta, sesión técnica máximo7días renovable por nuevo canje del mismo enlace mientras el grant padre siga válido; no consumir definitivamente la validez del enlace al primer canje; revocar padre invalida todas las sesiones. No registrar tokens ni meterlos en analytics/referrer/storage; páginas privadas sin analytics/terceros y Cache-Control:no-store/Referrer-Policy:no-referrer. Rate limit de canje con contador acotado y fallo genérico, sin IP cruda persistida. Nunca usar un GET/prefetch de correo para registrar interés.

Respuestas permitidas interested/request_viewing/not_for_me/call_me. POST explícito, grant/versión/alcance vigentes dentro de transacción. GET e imágenes son pasivos. Not_for_me afecta solo ese match/cliente, sin cambiar MUST o disponibilidad; motivo es texto privado y propuesta de cambio requiere confirmación empleado. Request_viewing crea coordinación, no cita. Reutilizar franjas REG-17 sin pedir solicitud completa. No inferir pausa/retirada/resolución de estas respuestas.

PRE-12 conserva descarga/supresión del portal como dependencia explícita antes de declarar un portal completo: esta tanda no inventa un borrado de solicitudes/contratos. En esta entrega el enlace es acceso acotado a presentaciones; indicar canal existente para solicitud de derechos y no afirmar funcionalidad de export/borrado inexistente. No se construye un portal general sin resolver ese requisito.

### G. AGE-14, supresión de anunciantes

No reconstruir la acción retirada a partir de un ledger histórico favorable: el código actual carece de ella. Revisión humana a11meses y decisión/justificación a12; no borrado automático ni extrapolar a aplicantes/documentos/gestiones.

`previewAdvertiserSuppression(env,id) -> {version,affected_fields,related_materializations,blockers}`; `suppressAdvertiserPersonalData(env,id,{version,reason,preview_hash},actor)`. Enumerar nombres de particulares/contactos, teléfonos, emails y copias materializadas en esta función. Conservar IDs/FK/evidencia técnica no personal y acuerdos necesarios bajo justificación expresa. Si una referencia no puede depurarse sin alterar otro historial/política, bloquear con próximo paso concreto; no prometer supresión completa mientras queden copias accesibles. No almacenar una copia personal de antes en audit JSON.

Añadir privacy_version/tombstone técnico; servidor rechaza PUT/actividad/actualizaciones obsoletas que restauren datos suprimidos. Cancelar o depurar acciones salientes que dependan de los datos eliminados. Preview no altera nada; supresión futura exige confirmación humana específica en panel.

Entre pestañas: ningún dato en localStorage; usar epoch solo numérico y BroadcastChannel como mejora. Al perder foco/iniciar navegación/enviarse una invalidación ocultar datos hasta revalidar con servidor; descartar respuestas GET de epoch/request anterior y comprobar versión antes de reinsertar DOM. Si llega invalidación mientras POST está pendiente, no restaurar con su respuesta. Revalidar por polling visible y al recuperar foco; una pestaña sin conexión se bloquea/oculta, no conserva una vista editable personal garantizándola actual.

Límite explícito: una pestaña ajena no puede borrar instantáneamente una copia ya leída si está suspendida/desconectada o se pierde el evento. No afirmar borrado remoto del navegador ni de capturas. La aceptación exige no exposición al reanudar y no restauración en servidor/DOM tras revalidación, eventos perdidos, respuestas retenidas y503. Las políticas de otras copias/correos se concilian antes del cierre completo.

## Dependencias y secuencia de construcción futura

Orden: AUT-09->AUT-10->AUT-11; AGE-03->AGE-05->AGE-06->AGE-08/09; AGE-10 y AGE-12->AGE-11; AUT-01 integra controles al estar disponibles. PRE-22 y AGE-14 consumen AGE-04 sin impedir el resto. AGE-12 puede construir sus contratos con fixtures antes de AGE-11; en uso real crea grants dormant sobre presentaciones existentes antes del envío y solo activa acceso tras el acuse/evidencia manual. No exige envío previo para preparar el enlace ni muestra borradores a clientes.

Externas: BUS-10/15, EST-09/13/15/16/18, NOT-11, SPR-03, REG-17, PRE-12 y AUT-17 según cada task JSON. Se pueden planificar ahora todas. No se simula cumplimiento ni se construyen las otras listas aquí. AUT-17 no es requisito para preparar consultas/tareas manuales, sí para enviar correo real. EST-15 debe funcionar antes de envío automático. La vigencia elegida por Luis debe trasladarse al constructor EST-16, no mantener una expiración contradictoria allí. Revisión independiente de diseño realizada sin preguntas de producto restantes; se incorporan sus precisiones de grant dormant, respuesta anterior al acuse y al menos un match aprobado vigente.

## Diseño, seguridad y validación

Leer DESIGN.md vigente, Colors verificado7-nov: panel ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor Sans/Georgia26px H1 y19px H2; Montserrat/system-ui14px/1.5, label12 ytabla12/600. Card padding24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16 y reflujo760. Foco2/offset2, contraste texto4.5/controles3, zoom200 y reduced-motion. Páginas privadas reutilizan esa identidad compacta; no imitar hero del catálogo.

Copy visible en inglés, texto escapado/safeHref, no HTML recibido/modelo, no dangerouslySetInnerHTML. Rutas staff currentAdmin/same-origin/no-store; portal solo grants acotados por fila y medio. API JSON máximo131072bytes, listas50, polling30s visible/autenticado, errores/vacío/conflicto/busy visibles con role=status/alert, labels/aria-describedby. No PII en Telegram, logs, storage o modelos; registros de envío y respuesta quedan privados según política vigente.

Skills reutilizadas: writing-plans define archivos/interfaces/pruebas; ponytail evita otro reloj/proveedor/catálogos; impeccable product preserva controles y tareas concretas; antislop durante trabajo elimina decoración y copy ambiguo; seguridad frontend/backend valida origen, grants, SQL y datos; rendimiento fija páginas/límites/no originales en listas. Taste/redesign no aplican a estos formularios y paneles de datos existentes. No imágenes/fuentes nuevas ni instalación de infraestructura.

Construcción futura: pruebas focales por tarea y npm test/build/check:release; UI e2e y MCP1280/390, éxito/error/vacío/parcial/conflicto/teclado/foco/zoom200/consola/red. Datos sintéticos, correo fake para automatización; entrega real solo luego autorizada y separada. Esta entrega solo Markdown valida referencias y consistencia, no ejecuta tests de app.
