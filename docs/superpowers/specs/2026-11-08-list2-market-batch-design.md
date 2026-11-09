# Lista 2 · Tanda de planes del inventario y su actualización

**Alcance vigente8-nov:** [decisiones posteriores de Luis](../../roadmap/2026-11-09-list2-published-scope.md) y [preparación por tarea](../plans/2026-11-09-list2-build-ready-github.md) sustituyen propuestas incompatibles de este diseño: conexión centralPro/Hermes, no planes individuales, Meta fuera, WhatsApp/conectores/local posteriores y enlace privado hasta revocación. No asumir habilitación del proveedor ni ejecutar ramas históricas excluidas.

Fecha: 8-nov-2026. Estado: diseño para planificación; no construcción ni activación. Base comprobada: `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, main de GitHub, 14:22 UTC. Los documentos locales de BUS-06 y BUS-21–23 se conservan. Un borrador no demuestra que otra sesión haya integrado su código.

## Encargo y decisiones de Luis

Preparar la mayor tanda coherente de planes siguientes de la lista 2, para que otra sesión construya después. Se incluyen nueve tareas nuevas: BUS-19, BUS-11, BUS-09, BUS-10, BUS-07, BUS-08, BUS-01, BUS-03 y BUS-04. Las dependencias permiten redactarlas ahora; se comprueban de nuevo antes de construir cada una. No se ejecutan reservas, capturas, inferencias, migraciones, pruebas de producto, publicaciones ni envíos en esta sesión.

Respuestas expresas de este turno:

- Lectores automáticos por fuente, empezando por mayor cobertura comprobada y acceso permitido; carga manual como alternativa.
- IA para textos ambiguos, condicionada al carril y tratamiento de datos ya autorizados.
- Pasada diaria a las **01:00, Europe/Jersey**, incluidos los cambios de horario.
- Una propiedad rechazada por precio cuya bajada permita volver a encajar produce automáticamente **un nuevo match para aprobación humana**. No basta un aviso sobre el rechazo anterior. El historial se conserva y la nueva propuesta no se aprueba sola.

Las cifras de límites, las tablas auxiliares, los nombres de funciones y la selección técnica descrita abajo son propuestas del planificador. No se atribuyen a Luis como respuestas literales.

## Base reutilizada y alcance

Leer conjuntamente el [diseño BUS-06](2026-11-08-bus-06-initial-market-inventory-design.md), el [diseño del directorio](2026-11-08-bus-21-23-property-directory-gaps-design.md), la [reconciliación](../../roadmap/2026-11-07-reconciliacion-automatizacion.md), [AGE-04](2026-11-07-age-04-directory-design.md) y [DESIGN.md](../../../DESIGN.md).

Property Directory ya contiene un directorio investigado, no un inventario de inmuebles. Reutilizar sus IDs, evidencias y trabajo previo. Los activos originales siguen en `/root/HamptonJersey/Assets/property-directory/`; los importadores y pruebas Python locales deben recuperarse por el procedimiento ya documentado en BUS-06, sin copiar credenciales ni modificar la base original. La referencia recuperada de Hermes `handoff-hermes1/main` es un antecedente conservado, no una integración de main.

`server/listing-features.js` ya extrae características con evidencia; `server/match-store.js` ya cruza fichas propias y protege decisiones/búsquedas cerradas; `server/routes/matches.js` y MatchCard/Review ya implementan revisión humana. `server/jobs.js` tiene el reloj único de diez minutos. AGE-04 ya tiene tablas/rutas/pantalla de anunciantes; `advertisers.details.source_ids` referencia `research_sources`, no los nuevos IDs de fuentes de mercado.

El código de BUS-06 todavía no existe en la base observada: sus nombres son contratos propuestos. Al recibir el trabajo de la sesión constructora, adaptar estos planes al código realmente integrado. No crear otro almacén, otro reloj, un duplicado de `properties` o otro directorio de anunciantes.

## Orden y dependencias

| Etapa | Plan | Entrada que debe existir para construir/cerrar |
| --- | --- | --- |
| Acceso | BUS-19 | Investigación/evidencias disponibles por fuente; no exige resolver todas las fuentes |
| Complemento | BUS-11 | BUS-23 aceptada; casos especiales concretos, sin investigación por alta de cliente |
| Lectura | BUS-09 | BUS-06 integrado; política BUS-19 por fuente; carril apto solo para activar IA |
| Identidad | BUS-10 | BUS-06 integrado; coordinar contrato de observaciones con BUS-09 |
| Legado | BUS-07 | BUS-10 y AGE-04 integrados |
| Cruce inicial | BUS-01 | BUS-06, BUS-12 y EST-09 integrados; identidad BUS-10 y enlaces BUS-07 para deduplicar legado |
| Pantalla | BUS-03 | BUS-06, BUS-10 y BUS-12 integrados; consumir proyección común de BUS-01 |
| Barrido | BUS-08 | BUS-06/09/10, EST-16 y AUT-07 integrados; EST-15 verificada antes de activación |
| Recálculo | BUS-04 | BUS-08, BUS-12 y EST-09 integrados; consumir proyección/episodios de BUS-01 |

BUS-11 puede investigarse aparte sin escribir código compartido. El resto toca recursos comunes: una tanda de planes no autoriza nueve constructores simultáneos, ni una reserva múltiple. La otra sesión debe integrar y comprobar cada entrega antes de tomar la siguiente. BUS-19 se puede resolver antes de BUS-06 por fuente; su política se adapta al registro de BUS-06 en vez de duplicarse. AGE-04 no se reconstruye. BUS-12, EST-15, EST-16 y EST-18 pertenecen a otras listas y siguen siendo entregas externas, no se declaran terminadas aquí.

BUS-02 y BUS-05 son antecedentes replanteados; no se reactivan. BUS-20 sigue condicionado a su carril y revisión propios. Los planes de mensajería, consultas AGE-03 en adelante e infraestructura de IA son tandas diferentes; incluirlos aquí alteraría el alcance del inventario.

## Contratos compartidos

### 1. Política de fuente, propiedad de BUS-19

`SourceAccessDecision = {source_id,channel_id,version,status,method,reviewed_at,reviewed_by,evidence_refs,allowed_hosts,min_interval_seconds,robots_checked_at,terms_checked_at}`.

`status`: `review_required | approved | manual_only | restricted | excluded`. `method`: `internal | feed | public_html | manual | none`. Las revisiones son por canal/método; permiso de leer no es permiso de republicar fotografías. Evidencia de permiso privado se guarda como referencia protegida, nunca en documentos públicos.

Propuesta aditiva: `market_source_policies` y su historial por fuente/canal/versión. Puede existir antes de las tablas BUS-06; el validador exige IDs presentes en el manifiesto aceptado. Si BUS-06 ya guardó políticas equivalentes, migrar/reutilizar su autoridad con historial y convertir las rutas existentes en delegados, sin mantener dos decisiones vigentes.

Funciones en `server/market-source-policy.js`:

- `reviewSourceAccess(env,input,actor,expectedVersion) -> Promise<SourceAccessDecision>`.
- `getSourceAccess(env,sourceId,channelId) -> Promise<SourceAccessDecision>`.
- `assertSourceReadAllowed(decision,{method,host,at}) -> void`, rechaza cualquier uso fuera del canal, método o versión aprobados.

Homely permanece excluido por política del proyecto. Properties.je necesita referencia de permiso escrito y revisión del método. Revisar condiciones vigentes antes de declarar permitido el acceso a las demás webs; aquí no se ha hecho esa revisión. Robots permisivo por sí solo no equivale a autorización. Un fallo de acceso nunca significa cero anuncios. No pedir claves por chat ni automatizar login, cookies o evasión.

### 2. Lectores y normalización, propiedad de BUS-09

Se reutilizan MarketRecord/MarketPage y los límites BUS-06. Adaptadores con ID y hosts fijos; nada de fetch de una URL arbitraria recibida del navegador. Separar adquisición, extracción y escritura. JSON-LD/feed autorizado antes de HTML específico; nada de navegador autenticado o motor universal de scraping.

`SourcePayload = {source_id,channel_id,observed_at,request_url,content_type,body,body_hash,policy_version}`. El cuerpo es transitorio, máximo 1048576 bytes leídos en streaming, timeout diez segundos. No almacenar HTML completo por defecto; guardar huella, localizador y fragmentos mínimos de evidencia. Cualquier captura de fixture se sanea antes de incorporarse al repositorio.

`ExtractedFact = {field,value,unit,evidence_text,evidence_url,observed_at,method,reader_version,status}`; `status`: `stated | unknown | contradictory | proposed`. El texto que no dice nada sobre mascotas no permite `no`. Una cantidad de parking ambigua no permite un número exacto. Moneda/periodo ausentes no se adivinan. Precio de venta, renta, premium, negocio y gastos se conservan separados. £24000/año mantiene 2400000 unidades menores/año y deriva 200000/mes; semana×52/12 es equivalencia, no renta mensual declarada.

Funciones en `server/market-extraction.js`:

- `extractMarketRecords(payload,reader) -> {items:[{record,facts,issues}],next_cursor,exhausted,issues}`. El lector proporciona `parse(payload) -> {items:[{raw,listing_url,external_id?}],next_cursor,exhausted,issues}` y `extract(item,context) -> {record,facts,issues}`; una página puede contener varios anuncios, sin fingir un único record.
- `normalizeMarketRecord(record,facts) -> {record,facts,issues,version}`.
- `resolveMarketFacts({observations,humanFacts}) -> {effective,issues}`.

El ranking de fuentes usa recuentos de anuncios realmente comprobados, fecha, capacidad y permiso. Recuento desconocido sigue desconocido. Crear `docs/roadmap/work/BUS-09/readers.json` con cada fuente aprobada, cobertura, prioridad, reader ID, fixture, pruebas y estado. El número de lectores surge del directorio revisado; no fijar dos lectores como si cerraran todo el mercado. Cada fuente priorizada debe acabar con lector probado o motivo/tarea manual concreta. Fuente utilizable sin lector no se etiqueta restringida.

### 3. IA selectiva y revisión

La extracción determinista procesa campos explícitos; solo las contradicciones o textos ambiguos generan solicitudes IA. No se exigen dos modelos para cada anuncio. No se elige proveedor, modelo comercial ni se crean suscripciones/claves en estos planes.

`AmbiguityRequest = {observation_id,observation_hash,fields,excerpt,classification:'C0',reviewed_by,reviewed_at,policy_version}`. Propuesta: excerpt máximo 4000 caracteres, campos en allowlist, una solicitud abierta por observación/huella/campos/modelo. Revisión humana del extracto garantiza que no incluye personas/contactos, datos de aplicantes o datos C1/C2/C3. Que un teléfono sea público no lo convierte en un extracto permitido. No basta una expresión regular para certificar anonimización.

`ModelClient.propose({request_id,excerpt,fields,schemaVersion,signal}) -> Promise<{facts,model_id,usage}>` es una interfaz inyectada por el carril autorizado, sin acceso a DB, shell, herramientas ni red de fuentes. `model_id` identifica la respuesta efectiva, no una selección inventada. Una solicitud registra versión, huella, fecha y consumo comunicado; consumo desconocido no equivale a coste cero. Límites propuestos: máximo10 campos/hechos, respuesta JSON32768 bytes, una llamada por solicitud y30 segundos. Registrar dispatched antes de llamar; un timeout/caída con resultado incierto queda manual_pending y no se despacha de nuevo automáticamente. Sin fallback a otro proveedor ni bucle de gasto. Reutilizar el cupo del carril si existe; en otro caso máximo diario configurable de solicitudes, default0 hasta configurar activación/cupo explícitos. Un lease recuperado no autoriza repetir una llamada ya despachada.

`requestAmbiguityDraft(env,input,actor,expectedVersion)`, `runAmbiguityDraft(env,id,modelClient)` y `reviewAmbiguityDraft(env,id,{version,decision,facts},actor)` pertenecen a `server/market-ambiguities.js`. Estados: `needs_data_review | queued | working | draft | accepted | rejected | manual_pending | failed`. Desactivar o carecer de carril deja `manual_pending`; no simular una inferencia. Validar esquema, campos y citas como subcadenas del extracto; una cita válida no prueba que la conclusión sea correcta. Todo resultado es propuesta hasta revisión humana y nunca confirma disponibilidad comercial.

La puerta actual de Hermes solo admite `listing_text` sobre fichas propias; **no sirve todavía para estas solicitudes**. No ampliar su llave ni reutilizar su tabla CHECK por inferencia. AUT-13/PRE-32 deben entregar el adaptador específico y autorizado. Se construyen almacenamiento, validación y revisión con cliente falso local; la integración real y prueba del modelo quedan pendientes explícitas hasta disponer del carril. No cerrar el tramo IA como operativo solo por pasar fixtures.

### 4. Identidad, propiedad de BUS-10

`properties` de BUS-06 es la identidad física; `market_listings` son publicaciones por fuente/URL/operación. Compra, alquiler y negocio conservan términos, anuncios y decisiones separados aunque compartan inmueble.

`IdentityProposal = {id,left_property_id,right_property_id,evidence,status,version}`. Prueba inequívoca puede ser URL original acreditada de la misma unidad o vínculo ya verificado. Dirección, título, fotografías parecidas o referencia sin ámbito no bastan. Dos pisos del mismo edificio no se fusionan.

`resolvePropertyIdentity(env,observation) -> Promise<{property_id,proposal_id,method}>`; `decideIdentityProposal(env,id,{version,decision,reason},actor)`; `undoIdentityDecision(env,id,{version,reason},actor)` en `server/market-identity.js`.

Añadir aliases, decisiones y candidatos de identidad; no borrar propiedades ni reescribir observaciones originales. Fusión lógica redirige la proyección actual a un ID canónico, conserva IDs previos y puede deshacerse. Prevenir ciclos. Decisiones incompatibles de matches quedan en revisión, nunca se transforma un rechazo en shortlist por una fusión. Identidad mínima/marca de baja debe poder impedir reimportación de una observación histórica tras EST-19, sin conservar nombres, teléfonos ni descripciones como tombstone.

### 5. Legado, propiedad de BUS-07

`market_legacy_links = {listing_id,property_id,market_listing_id?,status,evidence_refs,version,linked_by,linked_at}`. Estados `verified | needs_review | not_linkable`. Una ficha sin URL original conserva su ID y procedencia histórica; no fabricar una publicación web ni fecha de captura actual. Los paquetes y `research_sources`, no el número del título, determinan el universo real. El rango HE-R028–HE-R285 contiene 258 IDs posibles, mientras el título dice 264: medir en la copia de datos autorizada y explicar discrepancias, sin modificar el título para aparentar cobertura.

`buildLegacyLinkProposals(env,{after,limit:50}) -> {items,next_cursor,counts}`; `applyLegacyLinkDecision(env,listingId,input,actor,expectedVersion)` en `server/market-legacy.js`. No ejecutar `scripts/import_agencies.py` de nuevo: también escribe fichas y fotos. No cambiar IDs, publicadas/archivadas, matchable, textos, medios ni permisos históricos. `media.provider` es pista, no prueba suficiente de identidad del anunciante. Permisos históricos se circunscriben a archivos y usos acreditados.

### 6. Cruce y episodios de revisión, propiedad de BUS-01

`CandidateKey = property_id + ':' + operation`. Para fichas propias aún sin vínculo físico, usar temporalmente `legacy:<listing_id>:<operation>` sin inventar equivalencia. BUS-12 mantiene criterios, exclusiones y orden; no reimplementar ese motor aquí.

Adaptador propuesto para acordar con su constructor: `evaluateMarketCandidate(applicant,candidate,{facts,availability}) -> {requirements_status,checks,requirements_rank,score,budget_result}`. `requirements_status`: `meets | pending | alternative | excluded`. No imponer umbrales nuevos; reutilizar reglas/constantes de BUS-12. Clasificación de requisitos y disponibilidad comercial son dimensiones diferentes. Stated must-haves met no significa disponibilidad confirmada.

`market-match-store.js` proporciona `enqueueInventoryMatch(env,{applicant_id,applicant_version,reason},actor)`, `inventoryMatchTick(env,ts)` y `getUnifiedMatches(env,applicantId,{cursor,limit:50,group})`. Devuelve `{items,next_cursor,summary,run}`. Una proyección reúne fichas propias y externas por CandidateKey sin insertar fichas externas ficticias en `listings`.

`market_match_runs` conserva progreso, versión de aplicante, versión de reglas e inventario. `market_match_episodes` conserva `id,applicant_id,candidate_key,property_id,operation,generation,previous_episode_id,legacy_match_id,observation_revision,applicant_version,classification,checks,status,reject_reason,reviewed_by,reviewed_at,price_snapshot,active,version`. Un episodio activo por aplicante/CandidateKey y generación única; las decisiones previas siguen en historial. Guardar importes en unidades menores. No modificar datos de la solicitud para hacerla encajar.

Reutilizar registros `matches` antiguos y sus eventos; solo crear episodio nuevo cuando corresponde un candidato de mercado o reapertura por precio. La unión prioriza el episodio activo actual y oculta duplicados de presentación, sin borrar filas antiguas. Estados propios de revisión siguen `found | shortlisted | rejected`; clasificación de requisitos va en otro campo. Alternativas y pendientes no se cuentan como requisitos satisfechos.

Eventos y revisión de episodios se autorizan en servidor, con versión del episodio, versión actual del aplicante y search_state activo. `POST /api/admin/market-matches/:id/review` admite transiciones humanas equivalentes a las actuales; no autoaprobar. La API legacy permanece para sus filas, pero debe rechazar una edición obsoleta si un episodio actual la ha sustituido. No mezclar IDs numéricos de ambas tablas: tarjetas llevan `target:{kind:'legacy'|'market',id,version}`.

Alta pública/panel y cambio de requisitos encolan cruce, no investigación ni scraping. La restauración respeta EST-09: no reabre una búsqueda resuelta. Mostrar versión/progreso/error reales; ausencia de resultados mientras se procesa no se presenta como mercado vacío. Página de 50 candidatos, cinco páginas y 20 segundos entre páginas por tick; persistir cursor para continuar. No imponer el límite de 25 fichas antiguas como pérdida silenciosa de inventario: límites de presentación no borran candidatos pendientes o decisiones humanas.

### 7. Pantalla, propiedad de BUS-03

Navegador interno `#/market` y detalle `#/market/<property_id>`, nombre visible `Market inventory`, separados del catálogo público. Integrar tarjetas/Review existentes sin convertir una propiedad externa en ficha publicada.

`GET /api/admin/market-properties?after=&limit=50&operation=&source=&observed_state=&commercial_availability=`; `GET /api/admin/market-properties/:id?after=&limit=50`; `GET /api/admin/applicants/:id/market-matches?cursor=&group=&limit=50`. Paginación keyset con orden estable y filtro validado; no devolver toda la base o contactos en una lista. Detalle y panel de anunciantes usan autorización staff existente. Mostrar anuncios, operación, precios originales/derivados etiquetados, fechas, evidencia y todas las procedencias; contacto solo en detalle autorizado. Unknown conserva su significado.

En Matches/Review mantener Found/Shortlisted/Rejected como estado humano y separar Meets stated must-haves / Details to confirm / Internal alternatives como clasificación. No colocar alternativas en un grupo de coincidencias completas. Acciones sobre el target correcto, foco y Undo vigentes. Reutilizar controles de revisión de identidad, legado y ambigüedad donde correspondan; evitar tres implementaciones del mismo formulario.

### 8. Pasada diaria y cambios, propiedad de BUS-08

Configuración propuesta: `market_daily={enabled:false,local_time:'01:00',time_zone:'Europe/Jersey',version}`. El reloj AUT-07 continúa cada diez minutos. La primera ejecución elegible desde las 01:00 locales inicia como máximo un run diario por fecha local; el manifiesto queda congelado dentro del run y no forma parte de la clave de unicidad diaria. Cambiar el directorio no inicia otro diario el mismo día; espera al siguiente o a una ejecución manual explícita. La hora efectiva depende del tick. Usar hora de procesamiento, no el timestamp antiguo de un evento retrasado.

En primavera, si 01:00 local no existe, usar el primer instante válido posterior de ese día; en otoño, cuando se repite, ejecutar solo una vez. `dailyRunDue(settings,now,lastRun) -> {due,local_date,due_at}` en `server/market-daily.js`, sin cambiar el cron UTC ni sumar siempre 24 horas. No recuperar días perdidos con una ráfaga; registrar fechas omitidas y ejecutar la de hoy. Si el run anterior continúa, reanudarlo y mostrar atraso; no solapar dos barridos sobre un canal ni marcar el día nuevo cubierto por trabajo del anterior.

Reutilizar tareas, cursores, leases, límites y importación idempotente de BUS-06; permitir más de un tipo de run sin romper la ejecución inicial única. Nuevas tablas auxiliares solo para planificación diaria y cambios si las actuales no los soportan. Diario completo requiere fuente recorrida hasta exhausted con éxito; una página parcial no permite declarar anuncios ausentes.

404/no localizado registra observación de publicación, no disponibilidad comercial. 403/login/fallo conserva inventario y last_success; parsing roto no produce cero. Política denegada bloquea solo la fuente afectada. No descargar todas las fotos. EST-16 decide prioridad/vigencia comercial; ningún umbral histórico de 7/30 días se adopta sin esa decisión. EST-15 y su prioridad humana son obligatorias antes de activar el automático.

`market_changes`: `id,property_id,operation,before_revision,after_revision,kind,fields,semantic_hash,created_at`, única por transición semántica. `market_change_deliveries`: consumidor/ID/cursor/lease/version/estado. Escribir cambio y observación efectiva en una transacción; BUS-04 confirma consumo solo tras registrar/enlazar los trabajos de recálculo. Errores no pierden cambios. La normalización inicial establece baseline sin una avalancha de avisos de nuevas propiedades.

### 9. Cambios materiales y nuevos matches por precio, propiedad de BUS-04

Materiales: alta de propiedad/operación, precio comparable real, campos que evalúa BUS-12 y confirmación comercial con alcance. Espacios, orden de atributos, marca de revisión, mismo valor normalizado o fallo HTTP no son bajada ni cambio de criterios. Comparar términos de la misma operación, clase, moneda y periodo: £24000/año y £2000/mes no son una bajada. Un premium menor no equivale a una renta menor.

El precio efectivo lleva `publication_id,source_id,operation,term_kind,currency,period,amount_minor,observation_revision,observed_at,confirmed_by?`. No escoger automáticamente el mínimo entre fuentes ni interpretar el cambio de publicación seleccionada como una rebaja. Mantener la referencia de precio aprobada para comparar con su revisión posterior; discrepancia material entre publicaciones vigentes deja price_conflict pendiente de revisión y suspende esa reapertura automática. La selección o corrección humana del precio es un hecho distinto, con su propia evidencia.

Los rechazos legacy no tienen snapshot monetario estructurado. Reconstruirlo solo desde historial fechado/estructurado que acredite el precio vigente al rechazar; no extraerlo por intuición del texto de checks ni usar el precio actual como si fuera histórico. Si falta esa prueba, guardar baseline trazable al activar y esperar una bajada posterior, con `baseline_pending` visible para revisión de los casos previos. Registrar desde ahora el snapshot completo al rechazar. Esta limitación de recuperación no impide el comportamiento automático para nuevos rechazos.

`consumeMarketChanges(env,ts,{limit:50}) -> {queued,done,pending}` y `reconsiderPriceRejection(env,{applicant_id,candidate_key,change_id},actor) -> {created,episode_id,reason}` en `server/market-rematch.js`. Acotar búsquedas por estado, operación y campos afectados; si falta un índice seguro, ampliar el conjunto candidato y evaluar con BUS-12 para evitar falsos negativos. Páginas reanudables; no recorrer toda la población en una petición.

Regla expresa nueva: rechazo cuyo motivo fue `price`, bajada real desde el precio de ese rechazo, nueva observación efectiva y búsqueda aún activa. Recalcular requisitos actuales: si el precio ahora cumple y no hay otra exclusión, crear episodio `found` nuevo; los imprescindibles desconocidos lo mantienen en el grupo `pending`, nunca en meets. Si todavía falla un imprescindible no se presenta como nuevo match válido. La bajada tomada como referencia debe superar la comprobación normalizada y cualquier anulación/corrección posterior, no un pico intermedio que ya dejó de ser vigente.

El episodio anterior queda rechazado en historial. La nueva generación referencia el rechazo y el cambio. Misma transición semántica en tres fuentes/reintentos crea un solo episodio/aviso. Si la nueva propuesta ya está encontrada o shortlisted, actualizar evidencia sin crear una segunda. Una bajada posterior que no cambia una propuesta actual no duplica avisos. Rechazos por otros motivos no se reabren por una bajada de precio. La consulta, visita o negociación no cierran search_state ni suspenden este consumo. Un cierre humano concurrente impide el nuevo episodio dentro de la transacción.

Un único aviso abierto de matches por búsqueda, agregando los nuevos episodios; ampliar los contadores actuales con los episodios vigentes, sin exponer nombres en Telegram ni duplicar notificaciones. La aprobación humana nueva usa el endpoint del episodio. No enviar consultas ni propuestas externas al crear el match.

## Diseño y comprobaciones comunes

Superficie: panel privado existente y un navegador interno nuevo. DESIGN.md §Colors, apartado verificado 7-nov y CSS actual prevalecen sobre el YAML histórico. Valores aplicables: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d` solo no-texto/display >=24px, bronze-dk `#86542d` texto pequeño/hover, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Sin colores adicionales.

DESIGN.md §Typography/Shapes/Components: Tenor Sans/Georgia para H1 26px y H2 19px; Montserrat/system-ui cuerpo 14px/1.5; etiquetas y cabeceras 12px, cabeceras600; contenedor1240px y gutter16px; tarjeta padding24px/radio14px, campo radio10px, botón radio999px/padding10px20px; celdas10px12px. Tabla a tarjetas bajo760px; no nuevos breakpoints distintos de480/760/980. Controles nuevos44px de alto es propuesta accesible de esta tanda. Foco2px bronze/offset2px, texto>=4.5:1 y controles/foco>=3:1, teclado, zoom200%, movimiento reducido. Estados loading/vacío/error/parcial/conflicto visibles y recuperables, role=status/alert y etiquetas asociadas. Copy y errores visibles en inglés.

Aplicación de skills: `ponytail` conserva SQLite/D1, módulos y reloj existentes sin frameworks adicionales; `impeccable` product orienta el panel a revisar acceso, evidencia y decisiones; `antislop` durante el trabajo evita decoración/contadores sin decisión y mantiene copy concreto; `web-performance-optimization` fija páginas50, payloads acotados, sondeo30s solo visible/autenticado y miniaturas existentes; `security-best-practices`/`frontend-security-coder` fijan autorización por ruta, same-origin en escrituras, no-store, parámetros SQL, texto escapado y safeHref. `taste-skill` se ha consultado: no aplica a este panel de datos según su propio alcance; no impone estética de landing. `redesign-skill` no aplica: no se rehacen pantallas completas ni marca. No se generan imágenes ni fuentes nuevas.

URLs de enlaces solo tras safeHref y rel=noopener noreferrer; lectores externos HTTPS con host fijo aprobado, sin credenciales/localhost/IP privada/redirección no permitida. No dangerouslySetInnerHTML ni ejecución de HTML recibido. Datos personales fuera de logs/localStorage, Telegram, archivos públicos y payloads IA. API JSON privada limitada a131072 bytes salvo los límites ya acordados más restrictivos; listas50 y máximo10 registros por MarketPage. Un archivo manual de hasta1MiB se procesa en páginas en memoria. Ningún manifiesto concede permiso por incluir un campo approved.

Todas las migraciones se nombran con el siguiente ordinal libre en el momento de construir; `0032` es solo el nominal de BUS-06 y puede haber sido ocupado. No renumerar migraciones aplicadas. Acordar los contratos nuevos con BUS-12/AUT-13/EST-16 reales antes de implementarlos; no crear un helper ficticio cuyo proveedor no existe.

Cierre futuro: tests focales por tarea y `npm test`, `npm run build`, `npm run check:release` con el entorno actual. Para cambios UI: e2e con fixtures y recorrido Playwright MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. IA con cliente falso no demuestra proveedor real. Lectores con fixtures no demuestran permiso ni cobertura viva. Solo datos sintéticos/saneados; no pruebas de captura en producción por inferencia.

## Criterios de aceptación de la tanda

- Cada fuente tiene estado/método/evidencia o un pendiente explícito; las restringidas no bloquean las demás ni se convierten en vacías.
- Lectores priorizados por cobertura real generan observaciones trazables y reanudables; manual funciona por fuente. IA revisable para ambigüedades, sin datos fuera de clase ni disponibilidad inventada.
- Tres webs de una misma unidad conservan tres publicaciones; dos unidades de igual dirección siguen distintas. Fichas históricas y permisos no se pierden.
- Altas usan inventario disponible, preservan incógnitas y progresos y no disparan una investigación por cliente. Pantalla distingue clasificación, decisión y disponibilidad.
- Cada día a partir de01:00 Jersey se intenta una pasada única observable; caída de fuente conserva propiedades y confirmaciones humanas.
- Una bajada elegible genera nuevo match para decidir, con rechazo previo intacto en historial y sin duplicados ni autoaprobación.

## Estado de revisión

Planificación exclusivamente. Las cinco preguntas de producto de este turno están respondidas. Revisión independiente de diseño realizada: no quedan preguntas de producto imprescindibles. Se incorporan sus tres precisiones técnicas: snapshot legacy trazable/baseline, precio efectivo por publicación y unicidad diaria por fecha sin incluir manifiesto. Las interfaces propuestas deberán reconciliarse con la otra sesión antes de construir. No se afirma aprobación de publicación, reserva o revisión independiente de código.
