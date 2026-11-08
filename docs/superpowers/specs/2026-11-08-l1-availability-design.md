# Lista 1: observación, disponibilidad confirmada y papelera

Fecha: 8-nov-2026. Estado: diseño de planificación; cero producto construido. Base compartida comprobada por coordinación: `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, GitHub observado 14:14 UTC. Códigos: EST-16, EST-15 (sustituye EST-07), EST-19; conexión de sus futuros productores a EST-18. Este documento propone contratos que todavía no existen.

## Propósito y límites

El empleado debe distinguir lo visto en una web de lo confirmado comercialmente, aplicar una baja solo al alcance acreditado y conservar el historial mientras los archivos llegan al plazo de purga. Se entregará primero el camino manual con exclusión real y prioridad humana; el barrido/contacto posterior no podrá activarse antes. El archivado editorial es independiente: no constituye prueba comercial, no crea papelera de no disponibles y no activa seis meses. No hay vista nueva de historial EST-18, nueva política de personas PRE-12 ni construcción de BUS-10 en este grupo.

Se compararon tres enfoques: reutilizar `listings.availability/confirmed_at` (pierde procedencia y confunde publicación con confirmación); añadir un único estado a la propiedad (propaga de más a operaciones/anunciantes); observaciones inmutables más confirmaciones con alcance (seleccionado como propuesta técnica por satisfacer la reconciliación). El encargo autoriza planificar esta tercera opción, no construir ni activar la purga.

## Evidencia actual y dependencias reales

- `server/listing.js`: `availability` comercial legacy y `TO_CONFIRM` editorial, tres meses venta/un mes alquiler. `confirmed_at` también se actualiza por publicar/precio en `server/routes/listings.js:129`; jamás se migra como prueba del anunciante.
- `server/match-store.js`: `CANDIDATES_SQL` y recálculo borran Found no elegibles; Shortlisted sobreviven. El nuevo inventario debe conservar match/evidencia y excluir propuestas afectadas sin borrar su identidad.
- `server/routes/listings.js:setState`: archivar apaga hoy `matchable`. Este efecto de catálogo se conserva como legacy y se etiqueta editorial, no como confirmación de indisponibilidad.
- EST-18 publicado: `server/listing-events.js`, `migrations/0029_listing_events.sql`; `events.entity_type` permite applicant/contact/viewing/admin/listing. `listingBatch` valida IDs HE-* y no sirve para una nueva propiedad de mercado. No fingir que ya acepta property/match.
- `server/jobs.js` AUT-07 ya tiene reloj UTC cada diez minutos. `server/retention.js` gestiona otras retenciones; no sustituirlas ni extender aquí borrado de personas.
- BUS-10 pendiente (depende BUS-06): deberá producir propiedades, operaciones y publicaciones separadas e identidad persistente mínima. No hay esas tablas hoy. EST-16 depende BUS-10; EST-15 depende BUS-10, EST-16 y EST-18, con NOT-11 de alcance parcial para avisos; EST-19 depende EST-15, SPR-03, BUS-10, EST-18 y AUT-07, y diseño PRE-12 para separación de políticas. SPR-03 sigue pendiente: sus originales/derivados/paquetes no pueden darse por almacenados.

La dependencia no construida no impide este plan. Antes de construir, verificar entregas integradas y adaptar la frontera BUS-10 sin crear inventario paralelo. El camino manual EST-15 puede preceder al barrido; avisos completos esperan NOT-11, sin mostrar una propagación completada inexistente.

## Decisiones expresas de Luis, 8-nov-2026

**D02 aprobada en esta sesión:** disponibilidad compartida válida 48 horas para alquiler y 7 días para compra, ambas configurables; una contradicción material obliga a reconfirmar antes de volver a usarla. El plazo arranca en el hecho de confirmación comercial, no en cada lectura, envío o importación. Cambiar configuración recalcula vigencia desde ese mismo hecho y no la renueva. Una confirmación caducada pasa a no utilizable para nuevos envíos/revisión; nunca se convierte sola en baja. No aplicar históricos 7/30 días. Operación sin política acordada (por ejemplo traspaso) se marca pendiente de revisión y no hereda automáticamente compra 7 días.

**D10 aprobada en esta sesión:** a los seis meses purgar solo originales, derivados y paquetes de presentación **sin uso activo**, conservando identidad mínima, referencias, evidencia necesaria e historial de clientes, consultas y visitas. Uso activo desconocido o evidencia cuya necesidad no se puede determinar bloquean el borrado. Este acuerdo fija la política para el plan y no autoriza ejecutar borrados ahora. El manifiesto/pins/fence que se detalla más abajo concreta técnicamente su implementación futura.

## Contratos propuestos y propiedad de cada dato

IDs de BUS-10 opacos y no convertidos a HE-*; el adaptador confirma existencia y coherencia de relaciones. JSDoc en ESM, sin añadir TypeScript.

```ts
type ScopeRef = {kind:'property'|'operation'|'advertiser'|'publication', property_id:string,
  operation_id?:string, advertiser_id?:string, publication_id?:string};
type ConfirmationContext = {kind:'general'}|{kind:'search',search_id:number,search_version:string,
  requirements_version:string,occupants_version:string};
type EvidenceRef = {id:string, kind:'call'|'message'|'document'|'observation', recorded_at:string};
type ObservationInput = {source_id:string, external_key:string, observed_at:string,
  publication_id:string, outcome:'visible'|'modified'|'not_found'|'failed',
  fingerprint:string|null, evidence_ref:string|null, failure_code:string|null};
type AvailabilityCommand = {request_id:string, expected_version:number, scope:ScopeRef,
  action:'confirm_available'|'confirm_unavailable'|'request_review'|'reactivate',
  reason_code:string, effective_at:string, evidence_refs:string[],confirmation_context:ConfirmationContext};
type AvailabilityFact = {scope:ScopeRef, version:number,
  state:'unconfirmed'|'available'|'unavailable', review_required:boolean,
  observed_at:string|null, confirmed_at:string|null, valid_until:string|null,evidence_valid:boolean,
  confirmation_id:string|null, confirmed_by:string|null, origin:string|null};
type AvailabilityReceipt = {fact:AvailabilityFact, event_id:number, replayed:boolean,
  propagation_state:'pending'|'done'|'failed'};
```

`recordMarketObservation(env,input,actor)` identifica importación por `(source_id,external_key,observed_at,fingerprint,outcome)` o ID durable de ejecución productor; reintento mismo ID/mismo hash devuelve el anterior y distinto hash da 409. Un fallo tiene `failure_code` allowlist, no cuerpo remoto. `confirmMarketAvailability(env,command,actor)` toma actor de sesión o productor interno autenticado, nunca del JSON. `availabilityForScope(env,scope,at,policy)` retorna `AvailabilityFact`; `availabilityProjectionStatements(env,{confirmation_id,scope,expected_version})` produce guardas SQL de exclusión y outbox. `availabilityFactsQuery({asOf,policy}):{sql,args}` es el puerto SQL normalizado: una fila por `(property_key,confirmation_id)` con `property_id,operation,commercial_state,evidence_valid,review_required,confirmed_at,valid_until,availability_version,confirmation_context,scope_search_id,scope_search_version,requirements_version,occupants_version`. TTL/contradicción y exclusiones aplicables se resuelven aquí, sin PII en salida. `confirmation_context='general'` no acredita aceptación del hogar; contexto search solo vale para búsqueda/versiones exactas. EST-13 consume este puerto y calcula `availability_current_for_search`; no se expone un booleano específico de cliente a partir de una fila general. Ausencia de evidencia=0, nunca baja inferida. La consulta devuelve solo cabezas vigentes para cada alcance/contexto, no una confirmación available histórica que ya fue reemplazada. Un bloqueo humano de ámbito más amplio hace evidence_valid=0 para toda alternativa afectada; una aceptación search más específica nunca lo levanta. Cabezas de contextos search distintos no se sobreescriben entre sí ni sustituyen la cabeza general. Este productor no depende de `match_candidates`, evitando ciclo EST-16→EST-13. El plan hermano matching propone `property_key` canónica; no construir otra identidad.

`loadInventoryScope(env,scope)` y `scopeAffectedMatchesQuery(scope)` son fronteras propuestas BUS-10, a integrar con su implementación real; no APIs presentes.

Nueva persistencia lógica:

| Tabla propuesta | Campos e invariantes |
|---|---|
| `market_observations` | id, publication_id, source_id, source_key, producer_run_id, canonical_hash, outcome, observed_at, received_at, fingerprint, evidence_ref, failure_code; inmutable y clave única de productor |
| `availability_confirmations` | id, scope_kind y IDs de alcance, state, effective_at, recorded_at, actor, origin, reason_code, evidence_refs JSON, confirmation_context, scope_search_id/version, requirements_version, occupants_version, supersedes_id; inmutable |
| `availability_heads` | clave normalizada de alcance+confirmation_context+scope_search_id/version, version entero, confirmation_id, review_required, valid_until, eligibility_revision; CAS monotónico |
| `availability_operations` | actor + request_id UNIQUE, canonical_hash, receipt; mismo request no duplica evento ni efectos |
| `availability_effects` | confirmation_id + effect_kind + target_id UNIQUE, state, attempts, next_attempt_at, lease_until; trabajo durable de propagación |
| `market_trash` | scope_key + episode_id, entered_at, purge_due_at, confirmation_id, state `waiting|blocked|purging|partial|purged|restored`, version; una baja no reinicia fecha en reintentos |
| `market_media_pins` (o referencias equivalentes SPR-03) | object_id + media_revision + owner_kind + owner_id UNIQUE, active, required_as_evidence, checked_at; creación de pin y fence comprobados en la misma transacción, uso desconocido bloquea |
| `market_purge_objects` | episode_id + object_id UNIQUE, storage_key interno, media_revision, state, attempts, error_code, next_attempt_at, fence_token, lease_until; cada objeto con recibo verificable |

No duplicar estas tablas si BUS-10 aporta equivalentes. No FK con cascade de propiedad a eventos, consultas, visitas, match o identidad. El mínimo de identidad se define con BUS-10; conserva IDs, alias y huellas para no recrear importaciones viejas.

## Transiciones y resolución de contradicciones

1. Observación `visible|modified` registra fuente y fecha, sin confirmar comercialmente. `not_found` afirma solo que no se localizó en esa publicación. `failed` registra intento fallido, jamás inventario vacío ni baja.
2. Confirmar disponible/no disponible exige empleado autorizado o evidencia útil de productor previamente validado, motivo estructurado, fecha real y referencias existentes del mismo alcance. Nunca usar disponibilidad de una operación para otra sin evidencia de ese alcance.
3. Una confirmación humana posterior conserva prioridad sobre observación anterior aunque esta llegue tarde. Comparar tiempos del hecho y secuencia del servidor, no solo recepción. Fecha futura inválida (> reloj actual) se rechaza 400; un dato antiguo se conserva como evidencia, no reemplaza cabeza actual.
4. Observación nueva contradictoria a confirmación vigente registra revisión; ni reabre ni borra la confirmación. D02 aprobada invalida inmediatamente su aptitud para nuevos envíos ante contradicción material y exige reconfirmación humana antes de volver a usarla. Una indisponibilidad humana no pierde su exclusión por vencer un TTL: solo reactivación humana explícita, nueva evidencia y CAS la levanta.
5. Alcance propiedad afecta todas sus operaciones acreditadas; operación afecta esa operación en todos sus anunciantes/publicaciones; anunciante requiere operación y afecta solo sus publicaciones; publicación requiere operación+anunciante y afecta solo esa publicación. IDs faltantes o relaciones cruzadas devuelven 400. Una alternativa comercial sigue elegible si mantiene disponibilidad útil fuera del alcance dado. La confirmación más específica no revoca una exclusión más amplia: hay que revisar/levantar explícitamente cada exclusión aplicable.
6. Reactivar exige evidencia nueva revisada por empleado, motivo y versión; cierra episodio de papelera pero no restaura archivos ya borrados. Una web vieja o una captura repetida nunca reactiva.

## Atomicidad, concurrencia y propagación

Dentro de un único `env.DB.batch`: registrar operación, insertar confirmación, CAS de cabeza con versión y guard de existencia, actualizar elegibilidad y estado afectado de propuestas, insertar evento EST-18 y outbox; si falla cualquier guarda, rollback íntegro y 409 con versión actual. No SELECT-then-write sin repetir guard en UPDATE. Actor/request/hash se validan antes; replay recupera recibo anterior incluso si versión ya avanzó, reutilizar ID con payload distinto da 409.

Excluir de resultados nuevos al consultar inventario y al escribir un match, no depender solo de un job posterior. Preservar Found/Shortlisted como historial con exclusión visible; no borrar filas que sustentan acciones. Shortlisted afectados dejan de ser enviables y muestran causa/alcance; otros clientes/operaciones no se tocan. Captura de cliente ya emitida no se modifica silenciosamente: invalidar su aptitud y avisar mediante su productor.

Visitas confirmadas o propuestas, ofertas y consultas afectadas reciben un efecto por gestión que actualiza NOT-11 y el aviso de disponibilidad; no cancelar automáticamente una cita ni cerrar búsqueda, oferta o venta. Publicación alterna útil puede permitir continuar y evita afirmar baja global. `propagation_state` permanece pending/failed mientras exista algún efecto sin recibo. Worker reclama por lease con CAS; recupera lease vencido, reintenta 1/5/30 minutos y luego cada día con error visible y sin duplicados. Una respuesta nueva revisa la misma gestión, no crea una tarea cada cron.

Eventos propuestos `property.availability_observed`, `property.availability_confirmed`, `property.availability_review_required`, `property.trash_entered`, `property.reactivated`, `property.files_purged`: entity_type property, entity_id canónico, actor, at servidor, revision, source, before/after estructurado, scope, confirmation_id, evidence_refs, operation_id. Ampliar `events` CHECK de forma coordinada conservando índices/IDs/notificaciones y productores actuales. Sin texto libre/HTML, cuerpos de correo, teléfonos, tokens, claves R2 o URLs firmadas en eventos. No reconstruir historial anterior ni añadir UI de historial.

## Papelera y purga conforme a D10 aprobada

Entrada a papelera en la misma transacción de baja, por alcance/episodio, preservando identidad. Una baja de publicación no manda a purgar archivos compartidos de propiedad; evaluar cada objeto por referencias y dueño comercial. La fecha técnica de purga es `entered_at + 6 meses de calendario`, UTC, día limitado al último del mes (31-agosto → 28/29-febrero), conservando hora; no 180 días. Reusar la aritmética de fin de mes de `server/rentals.js:addMonths` adaptada a timestamp y probarla. UTC y el límite de fin de mes son decisiones técnicas del plan; la regla comercial aprobada son seis meses de calendario.

En cada pasada AUT-07: seleccionar por índice `(state,purge_due_at)`, máximo 50 episodios y 100 objetos; reclamar lease/version, volver a comprobar indisponibilidad y referencias activas. Original/derivado/ZIP solo borrable si su categoría pertenece a originales/derivados/paquetes de presentación y sin referencias activas (ficha vigente, propuesta/portal útil, visita/consulta u obligación de conservar evidencia). Añadir pins durables por evidencia, propuesta/portal/consulta/visita activa y requerimiento de conservación; el productor dueño mantiene/retira cada pin. Referencias o uso desconocidos bloquean con `usage_unknown`; no inferir cero por fallo de consulta, inventario parcial o productor caído. Si la evidencia precisa el contenido se bloquea ese objeto; no basta conservar un hash ilegible para afirmar evidencia conservada. El mínimo conservado queda fijado con BUS-10: property_id/property_key, IDs de operación/publicación/anunciante, aliases/claves externas y huellas suficientes para deduplicar unidad física sin copiar PII; fechas/motivo/alcance de baja, IDs/hash/origen de evidencia y contenido pinneado cuando sea necesario, referencias de clientes/consultas/visitas y events intactos. El acceso a objeto pasa primero a `deleting` en CAS de media_revision+version con fence_token monotónico; nuevos consumidores no pueden enlazarlo ni crear pins sobre esa revisión. Una vez empezado el borrado externo no se permite devolverla a reusable: toda reutilización/recaptura crea una revisión y storage_key nuevos. El worker verifica fence_token antes de cada delete y antes de guardar recibo; un lease expirado no habilita reuso de la misma clave mientras un delete anterior pueda seguir en vuelo. Solo el dueño del fence reconcilia esa revisión. Esto cubre que un delete remoto termine después de perder lease. Esto evita reactivación/referencia creada entre chequeo y R2.delete. Una reactivación en `purging` detiene objetos pendientes y muestra parciales; archivos borrados requieren recaptura.

R2 y D1 no comparten transacción: manifiesto durable → bloquear nuevos usos mediante CAS → borrar por storage_key interno → verificar ausencia o respuesta de éxito → registrar resultado/bytes y evento. Un fallo deja partial y reintento por objeto; timeout tras borrar se reconcilia con head/get y un 404 del objeto se considera ya borrado. No marcar episodio purged hasta todos los objetos elegibles resueltos; bloqueados se muestran y reevalúan, no se declaran borrados. Referencias históricas muestran “File removed under retention policy” y metadata no sensible. Purga no ejecuta DELETE de propiedades, contactos, searches, consultas, visitas ni events.

## Interfaz y diseño aplicable

En detalle de propiedad del inventario BUS-10, un bloque “Publication observation” y otro “Commercial availability”, con fecha, origen y alcance; acción “Confirm availability” exige motivo/evidencia/alcance y previa vista del número de matches/visitas afectados. La papelera muestra estado de purga y bloqueos, sin acciones de borrado físico manual nuevas. Hasta que BUS-10 entregue su detalle, se integra componente enfocado y no una segunda lista de propiedades.

Valores **vigentes** de `admin/src/styles.css` y DESIGN: ink #141414, paper #fff, mist #f2efe9, line #e2ddd4, stone #6b665e, bronze #8a6a3b, ok #1f6b3a, err #a32020, warn #fff6e5; Montserrat 14px/1.5, H1 Tenor Sans 26px/400; página `24px 16px 120px`, card 24px, radio 14px, input 10px, botón píldora 999px `10px 20px`, pequeño `6px 14px`/11px; gaps 8–16px, celdas `10px 12px`, tarjetas bajo 760px, foco 2px bronce offset 2px, disabled opacity .45. Reusar `.card/.field/.badge/.btn/.seg/table.list/.actionbar`, mensajes inline role status/alert, sin toast, fuentes o librerías nuevas. Estados con texto, no solo color; error no badge comercial. Propuesta DESIGN de paleta unificada y nuevos tonos no se presenta como CSS existente.

Labels reales, aria-invalid/describedby, foco primer error y vuelta a disparador al cancelar; 1280/390 y zoom 200%, teclado y reduced-motion. Metadatos con spans, copy inglés funcional. Lista usa miniatura con dimensiones/aspect-ratio y lazy; no originales. Obtener solo metadatos paginados con cursor estable y revisión, límite 50; índices de alcance/fecha; cero fetch de fotos originales para decidir estado.

Seguridad: rutas admin autenticadas mediante currentAdmin y SameOrigin de `server/api.js`; actor derivado servidor, no privilegios nuevos. Toda referencia de evidencia y alcance se comprueba server-side. URL origen validada https y safeHref, `rel=noopener noreferrer`; React texto, nunca HTML sin escapar; no PII en localStorage ni logs. Internos no se exponen por HTTP público. 401 sesión, 403 origen/permiso, 404 no existe, 400 validación, 409 versión/conflicto, 503 dependencia temporal; se conserva el formulario y no se anuncia éxito si falla.

## Aceptación por código y revisión del constructor

| Código | Resultado verificable futuro |
|---|---|
| EST-16 | `not_found` y `failed` no causan baja; fechas observación/confirmación separadas; importación vieja no gana al humano posterior; contradicción exige revisión; 48h rent/7d buy configurables y contradicción material exige reconfirmar |
| EST-15 / EST-07 | Baja de una operación excluye sus nuevas propuestas, marca Shortlisted, avisa gestiones sin cerrar búsqueda; venta/alquiler no afectados continúan; manual funciona antes de automatización; archivo editorial no baja |
| EST-19 | Solo originales/derivados/paquetes de presentación D10 aprobados y sin uso activo se purgan al sexto mes calendario; parciales/reintentos visibles; identidad, referencias e historial legibles; anuncio antiguo no recrea/reabre |
| EST-18 parcial | Cada productor nuevo añade evento atómico y revision/origen/actor/evidencia; purga conserva eventos; ninguna vista nueva |

Autorrevisión: cubiertas cronología, concurrencia, alcance y R2/D1; D02/D10 registradas como decisiones expresas de Luis 8-nov. Las versiones y los pins de evidencia mínima y el contrato BUS-10 se verifican al construir. No declarar completos estos códigos por tener documentos.
