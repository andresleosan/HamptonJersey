# Lista 1: ciclo de interés, visita, oferta y acuerdo del match

Fecha: 8-nov-2026. Estado: diseño propuesto para planificación; sin producto. Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobada por coordinación contra GitHub14:14 UTC. Códigos EST-14, alias histórico EST-08, futuros productores EST-18. No cerrar EST-09 ni construir portal AGE-12 o coordinación VIS-17 desde este grupo.

## Problema y evidencia

`matches` en `migrations/0009_matches.sql` y `server/routes/matches.js` solo guarda found/shortlisted/rejected y revisión del empleado. Ese rechazo existente no acredita una respuesta del cliente. `server/routes/inbox.js` maneja citas requested/confirmed/completed/no_show/cancelled sobre `viewing_requests`; `server/routes/sales.js` y `migrations/0012_sales.sql` manejan offers y sales y ajustan stage/availability legacy. `server/routes/rentals.js` y `rental_events` existen, pero no hay enlace automático de inventario canónico a una tenancy que pueda inventarse aquí. Ninguna etiqueta nueva debe sobrescribir estos históricos.

EST-09 ya publicado separa `search_state` de stage. Una visita realizada, oferta o acuerdo no resuelve la búsqueda. No modificar criteria/MUST ni disponibilidad global por descarte del cliente. EST-14 depende del catálogo EST-13, AGE-12 y VIS-17 (todos pendientes); EST-08 está replanteado, no es tarea adicional. Planes de esas dependencias no equivalen a implementación. EST-18 está parcial/publicado; solo conectar productores y conservar vista de historial aplazada.

Se compararon extender el enum legacy matches.status (mezcla decisión empleado con respuesta/visita), crear otro match por cada paso (rompe identidad), y mantener dimensiones de seguimiento sobre el match canónico (opción técnica elegida). La identidad debe venir de EST-13/BUS-12/BUS-10 integrados, no se crea pareja alternativa.

## Contratos de integración propuestos

El plan hermano de matching propone `match_candidates` con id, applicant_id, property_key, property_id, operation rent|buy|transfer, search_version, material_version, inventory_version, candidate_current/evaluation_valid/revision; `match_decisions` append-only mantiene aprobación independiente. Estos nombres son contratos de planificación por integrar. No declarar `match_candidates` existente hoy. `material_version` es token opaco string/TEXT, igual al contrato BUS-12: comparar igualdad exacta al validar y en la guarda CAS; no convertir a número ni ordenar numéricamente. La `revision` del candidate/head sí es entero.

```ts
type MatchRef={candidate_id:number,applicant_id:number,property_key:string,
  search_version:string,material_version:string};
type VerifiedMatchActor={kind:'staff',id:string}|{kind:'applicant',applicant_id:number,grant_id:string};
type InterestCommand={request_id:string,expected_revision:number,match:MatchRef,
  action:'interested'|'not_interested'|'needs_call'|'request_viewing'|'reopen_interest',
  reason_code?:'price'|'area'|'size'|'condition'|'other',evidence_refs:string[]};
type MatchFollowup={candidate_id:number,revision:number,
  interest:'awaiting_response'|'interested'|'not_interested'|'needs_call',
  viewing:{id:number|null,state:'none'|'requested'|'confirmed'|'completed'|'no_show'|'cancelled'},
  offer:{id:number|null,state:'none'|'pending'|'countered'|'accepted'|'rejected'|'withdrawn'},
  agreement:{id:string|null,state:'none'|'agreed'|'completed'|'fallen_through'},
  labels:string[],availability_warning:boolean,search_state:string};
type SourceTransition={source:'portal'|'viewing'|'sales'|'staff',source_event_id:string,
  candidate_id:number,expected_revision:number,kind:string,source_version:string,
  evidence_refs:string[]};
```

`recordMatchInterest(env,command,verifiedActor):Promise<{followup:MatchFollowup,event_id:number,replayed:boolean}>` es la entrada de respuesta; `recordMatchLifecycleTransition(env,input,staffActor):Promise<...>` consume hechos comprobados, nunca un nombre de estado arbitrario enviado por navegador. `matchLifecycleProjection(row,facts):MatchFollowup` calcula labels sin mezclar dimensiones. `matchLifecycleStatements(env,transition):D1PreparedStatement[]` permite a VIS-17/sales incluir seguimiento y evento en su mismo batch. `requestViewingForMatch` pertenece a VIS-17 y devuelve `{viewing_id,state:'requested',revision}`; no confirmar aquí. AGE-12 verifica enlace vigente/revocable y applicant correcto antes de llamar; esta función revalida el vínculo applicant-candidate y deniega otro match aunque se conozca su ID.

Puerto de disponibilidad de este lote: `server/market-availability.js:availabilityFactsQuery({asOf,policy}):{sql,args}` produce por property_key disponibilidad actual para búsqueda; EST-13 consume esa proyección y `matchSummaryFactsQuery({asOf})` publica hechos normalizados. No se fabrica evidencia en lifecycle ni se renueva por responder interesado.

## Persistencia y estados

Nuevas tablas propuestas `match_followup_heads(candidate_id PRIMARY KEY,revision,interest,updated_at,updated_by)`; `match_followup_actions(id,candidate_id,actor_kind,actor_ref,action,reason_code,evidence_refs,source,source_event_id,source_version,at,revision)` append-only; `match_followup_operations(actor_key,request_id UNIQUE junto actor_key,request_hash,event_id,receipt)`; enlaces únicos de `viewing_requests`/offers/sales por candidate_id o tabla de relación con FK sin cascade. Reusar tablas de EST-13 si ya cubren esos campos; no duplicar estado comercial ni consultas.

El interés del cliente no es aprobación del empleado. `awaiting_response→interested|not_interested|needs_call`; `interested|needs_call→not_interested` exige motivo; `not_interested→interested` requiere `reopen_interest` explícito con nueva evidencia y actor (no recálculo automático). `request_viewing` guarda interés y solicita coordinación, conservando resultado requested. `other` sigue siendo código; cualquier aclaración libre queda en mensaje privado existente con referencia, fuera de events.

Visitas y ofertas son hechos relacionados, pueden coexistir y no siguen una escalera rígida. `Viewing booked` solo deriva de confirmaciones completas VIS-17; `Viewed` solo de completed; requested o no_show no equivale a viewed. Al cancelar/reprogramar se actualiza misma visita con su versión; las anteriores quedan registradas. La proyección conserva “Interested” aunque la última cita se cancele y permite una nueva cita sin borrar la anterior.

`Offer` deriva de oferta pending/countered comprobada y enlazada; `Agreed` de accepted/sale in_progress o hecho comercial manual acreditado para operación soportada. No crear venta ficticia para alquiler/traspaso ni tenancy por marcar Agreed. `completed` y `fallen_through` son hechos de acuerdo, mantienen el histórico y permiten revisión/interés según nueva acción; no reabren/cambian disponibilidad en inventario sin productor comercial autorizado. El mapping lossless de ventas conserva pending/countered/accepted/rejected/withdrawn e in_progress/completed/fallen_through, IDs, timestamps, notas privadas y condiciones; las etiquetas son una proyección, nunca sustituto de status original. Match con varias ofertas selecciona la vigente para etiqueta y conserva todas, no una unión por dirección.

Si un hecho legacy carece de candidate_id, enlazar solo por correspondencia única verificable applicant×propiedad×operación. Ambigüedad/unidad no identificada queda `link_review_required`; no adivinar match ni cambiar historial anterior. No crear acciones retroactivas EST-18 por el backfill; registrar únicamente nueva vinculación/revisión cuando ocurra.

## Actor, concurrencia y errores

Staff toma identidad de currentAdmin; applicant llega solo de contexto verificado AGE-12 con grant_id, jamás de payload. Respuestas de portal limitadas al match de esa búsqueda y su versión, enlace vigente y opción presentada realmente. Un grant revocado/caducado no modifica estado; respuesta genérica de acceso denegado sin revelar existencia de otros clientes. Un enlace de captura vieja exige recargar/revisión, no remapear a otra casa.

CAS de head y búsqueda se repite dentro del batch con versión leída: tras resolver/archivar búsqueda, comandos nuevos de interés/visita se rechazan409; un hecho real de visita/oferta ya ocurrido puede guardarse como histórico tardío sin generar nuevos trabajos ni reabrir búsqueda. Diferenciar el comando de iniciar trabajo del evento factual tardío. Una búsqueda needs_review tampoco inicia automáticamente gestiones. El evento incluye search_version y causa; nunca actualizar `search_state` desde este módulo.

Un batch guarda acción, proyección, evento y recibo de operación; guardas con rollback impiden evento huérfano. `(source,source_event_id,candidate_id)` único elimina duplicados de webhook/proveedor; validar source_version para que evento antiguo no regrese el estado actual. Mantenerlo como evidencia histórica sin vencer revisión más reciente. Dos empleados misma revision: uno200, otro409; mismo request/hash devuelve recibo aun con revision antigua; distinto hash409. El caller no puede declarar source sales/viewing ni actor: las funciones internas lo fijan tras verificar FK y estado.

Integrar ventas existentes antes de agregar writes separados: una aceptación que crea sale y cambia listing debe registrar match en el mismo env.DB.batch; si falla cualquiera, rollback. No hay side effect remoto en esta transacción. Si el productor no puede integrar batch, outbox único durable con reconciliación y pending visible; no afterSave silencioso como garantía de evento. NOT-11 maneja tareas del equipo aparte, no crear otra bandeja ni cerrar consultas útiles de otros clientes.

Eventos EST-18 con `entity_type='applicant'` (ya permitido), `entity_id=applicant_id`, tipos `match.interest_changed`, `match.viewing_changed`, `match.offer_changed`, `match.agreement_changed`; data IDs canónicos, revision, actor_kind, source/source_event_id, search_version, antes/después estructurados, motivo código y evidence_refs. Sin contenido de mensajes, token privado, datos de pago ni inventario completo. El historial del match usa estos IDs; no nueva UI de timeline ni reconstrucción del pasado. Al cambiar ficha HE-* vía sales seguir además `listingEventStatements` vigente, sin duplicar listing events.

HTTP futuro autenticado: POST `/api/admin/matches/:candidate_id/lifecycle`, GET mismo recurso devuelve MatchFollowup; namespace distinto de revisión PUT existente. Ruta pública y protección token pertenecen AGE-12; no construirlas aquí. 400 enum/motivo/fecha inválidos;401 sesión;403 permiso/origen;404 recurso no accesible;409 versión/estado/búsqueda;503 dependencia temporal. El panel conserva lo escrito y ofrece Reload, no reintento de una acción diferente automático.

## Diseño de interacción

En MatchCard/Applicants actual, mostrar aprobación, disponibilidad e interés en filas separadas. Acciones staff “Mark interested”, “Not interested”, “Request viewing”, “Record offer” llevan a productores existentes, no botones que permiten elegir cualquier etiqueta. Not interested abre motivo nativo requerido; request viewing indica “Viewing requested. Waiting for confirmations.” y no fecha confirmada inventada. No añadir timeline aplazado.

CSS **vigente** panel #141414 ink, #fff paper, #f2efe9 mist, #e2ddd4 line, #6b665e stone, #8a6a3b bronze, #1f6b3a ok, #a32020 err; Montserrat14px/1.5, Tenor Sans H1 26px/400; `.card` radio14/padding24, campo radio10/fondo#fbfaf8, `.btn` radio999/padding10px20px, `.sm`6px14px11px; gaps8–16, celdas10px12px, corte760 y foco2px/offset2px, disabled opacity.45. Reusar badges vigentes con texto y componentes actuales, no asumir que todos los tonos propuestos en DESIGN existen. No toast, emoji, CSS inline, fuentes ni libs nuevas; ningún original de foto nuevo en lista. Copy inglés funcional, metadatos con spans, errors aria-invalid/describedby, status/alert junto acción, foco al motivo/primer error y vuelta al disparador al cancelar; teclado, 200% zoom, 1280/390 y reduced motion.

React escapa todos los datos, safeHref para enlaces, sin dangerouslySetInnerHTML ni PII/tokens en localStorage. No navegación pública por candidate_id sin permiso. UI requiere recarga tras409 y confirma solo éxito verificado servidor, con estado pending si hay productor pendiente.

## Aceptación

| Código | Prueba futura |
|---|---|
| EST-14 | Interés/descarte con motivo, visita y oferta guardan candidate_id correcto e historial; otra búsqueda/match no cambia; booked/viewed/agreed derivan hechos acreditados; resolución EST-09 solo por acción propia |
| EST-08 | Not interested afecta solo cliente×casa y no cambia MUST, disponibilidad general ni decisión del empleado; conserva motivo y actor |
| EST-18 parcial | Nuevo hecho y evento atómicos, con actor/origen/revision/evidencia; duplicado no repite; sin nueva vista timeline |

Autorrevisión: acciones, proyecciones y productores separados; búsqueda activa y late facts explícitos; legacy lossless; dependencias externas no completadas. Ninguna decisión de pausa/retirada D12 resuelta aquí.
