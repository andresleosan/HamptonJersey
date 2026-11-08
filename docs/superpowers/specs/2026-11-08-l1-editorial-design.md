# Lista 1: Ready for review, Let agreed y Let

Fecha: 8-nov-2026. Estado: diseño técnico propuesto de planificación, no producto. Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, GitHub14:14 UTC comprobado por coordinación. Código EST-17 y productores correspondientes EST-18; no confundir estado editorial y disponibilidad comercial.

## Contexto y opción elegida

`listings` representa ficha propia HE-*. `published`, `archived_at` y `admin/src/format.js:stateOf` producen Draft/Published/Archived. `server/listing.js` enum disponibilidad permite for_sale/under_offer/sold/to_let/lease/not_stated/withdrawn y TO_CONFIRM es indicador derivado: publicado en mercado, confirmed_at+3 meses venta/+1 mes alquiler. El formulario permite disponibilidad legacy y `server/routes/listings.js` modifica confirmed_at por publicación/precio. EST-16 tendrá confirmación comercial propia; no tomar confirmed_at editorial como evidencia nueva.

`server/routes/sales.js` acepta offer→sale in_progress/under_offer, complete→sold, fallen_through→for_sale con guardas; `server/routes/rentals.js` mantiene rentals/tenancies/rental_events, sin enlace canónico listings→rentals hoy. No crear tenancy, contrato activo ni movimiento financiero por cambiar marketing de alquiler. Tampoco cerrar search_state de EST-09.

Alternativas: añadir estados editoriales al availability (rechazada: mezcla dimensiones); construir aprobación jerárquica y contrato de alquiler nuevo (fuera del pendiente); agregar Ready for review al circuito existente y dos hechos comerciales manuales de alquiler con CAS/evidencia (elegida). Los permisos actuales permiten actuar a empleados autorizados de admins; no se introduce aprobador especial ni doble control. Es decisión técnica de este plan dentro del encargo, no aprobación expresa adicional atribuida a Luis.

EST-17 catálogo es parcial y no declara dependencias. El cambio editorial manual es planificable/implementable de forma independiente sobre código actual. Integración comercial con inventario EST-15/16 y productores de contratos de alquiler puede venir después, sin añadir a catálogo una dependencia nueva ficticia. No declarar ese futuro integrado por tener DTOs. EST-18 publicado se reutiliza y solo se amplía en nuevos campos/productores; sin nueva vista.

## Estado editorial

Guardar `review_requested_at TEXT NULL` y `review_requested_by TEXT NULL` con ambos nulos o ambos presentes, solo con published=0 y archived_at NULL; no tabla nueva de aprobaciones. `editorialState(listing)` produce archived si archived_at, published si published, ready_for_review si review_requested_at, draft en otro caso. El enum UI STATUS_LABEL añade “Ready for review”; nunca se escribe en availability.

Transiciones:

| Acción | Precondición | Cambio |
|---|---|---|
| Submit for review | draft, ficha no archivada; validación mínima de campos requerida actual | establecer review_requested_at/by; seguir oculta y sin alterar disponibilidad/matchable |
| Return to draft | ready_for_review | limpiar marcadores; seguir oculta |
| Publish | draft o ready_for_review, validadores actuales satisfechos, import queue resuelta | publicar y limpiar marcadores; mantener published_at y confirmed_at legacy como hoy |
| Edit ready ficha | ready_for_review | guardar edición con CAS, mantener ready; cola ve revisión nueva, no aprobación congelada |
| Unpublish | published | published=0, limpiar marcadores; vuelve draft |
| Archive/Restore | reglas actuales (ofertas/venta bloquean archive) | limpiar marcadores; restore vuelve draft y no solicita review ni disponibilidad |

No exigir pasar por ready para publicación si hoy se permite publicar directamente. Import Drive sigue su cola y “Approve and publish” como validación propia; ready manual no evita `drive_imports.status='review'`. Cambios de contenido mientras ready permanecen en ready con nueva updated_at, para que nadie publique versión anterior. En todos los comandos CAS contra updated_at: publicar con versión vieja409 y cero evento. Acciones repetidas misma versión no simulan edición nueva; devolver estado actual o409 según cambió versión, sin duplicar evento.

## Estado comercial de alquiler

Agregar `let_agreed` y `let` al CHECK/ENUMS de listings.availability y a mappings públicos/panel. `let_agreed` etiqueta “Let agreed”, `let` “Let”. Solo operation=rent; no reinterpretar `lease` legacy como Let ni migrar to_let a ninguno sin evidencia. `under_offer` y `sold` legacy permanecen intactos, incluso históricos inusuales; no inferir su traducción. La validación nueva prohíbe introducir let* en sale/business, conservando legibilidad y corrección explícita de históricos.

```ts
type EditorialCommand={action:'submit_review'|'return_draft'|'publish'|'unpublish'|'archive'|'restore',
  updated_at:string};
type RentalMarketingCommand={request_id:string,updated_at:string,
  action:'let_agreed'|'let'|'return_to_market',reason_code:'agreement'|'completed'|'fell_through'|'correction',
  occurred_at:string,evidence_refs:string[]};
type EditorialReceipt={listing:Listing,event_id:number|null};
type RentalMarketingReceipt={listing:Listing,event_id:number,replayed:boolean};
```

`recordRentalMarketingState(env,{id,command,actor}):Promise<RentalMarketingReceipt>` comprueba operation rent y ficha accesible, evidencia registrada realmente perteneciente a ficha/operación, fecha no futura, motivo allowlist y updated_at CAS. El actor viene de currentAdmin. `let_agreed` desde to_let/lease/not_stated (no from withdrawn sin revisión explícita de inventario); `let` desde let_agreed o directamente desde estado en mercado con evidencia de hecho ya completado; `return_to_market` desde let_agreed/let solo mediante reconfirmación humana acreditada, pasa a to_let sin crear nueva tenancy ni reabrir búsqueda. Un cambio a withdraw usa mecanismo comercial actual/EST-15 y no se llama “Return to market”.

Nuevo endpoint protegido POST `/api/admin/listings/:id/rental-marketing`; no endpoint público ni actor/availability arbitraria en JSON. Edición genérica PUT conserva valores cargados y no permite cambiar hacia/desde let_agreed/let: debe dirigir al endpoint acreditado para evitar bypass de evidencia. Verificar también creación/import/manual/queue: pueden conservar dato legacy leído de origen como observación, pero no introducir confirmación manual let* sin ruta/evidencia; import crea draft con valor observado separado por su productor o requiere revisión, no fabrica confirmación. Validación compartida cubre cambios de operation que harían incoherente el let* actual.

La elegibilidad legacy `CANDIDATES_SQL` no incluye let_agreed/let, y los nuevos estados se excluyen de propuestas actuales como under_offer/sold. El módulo availability futuro mantiene alcance/evidencia y prioridad humana separados; la integración con él exige identidad BUS-10 y no se sustituye por confirmed_at. Mostrar disponibilidad comercial sin marcar automáticamente papelera EST-19 si aún no está integrado ese productor; tampoco afirmar que se retiró todo el inventario de mercado porque se cambió una ficha HE-*.

## Preservación de ventas, alquileres y eventos

El concepto “currentSales” se refiere al comportamiento actual de ventas; no existe export con ese nombre en código. Mantener offers.status pending/countered/accepted/rejected/withdrawn, sales.status in_progress/completed/fallen_through, IDs, importes/condiciones/notas privadas y eventos intactos. No renombrar availability antiguas para generalizar alquiler. Probar ciclo actual completo y rechazo del intento de usar ruta rental en sale. Sin cambio de política financiera/legal ni creación de cobros.

Reutilizar `listingBatch/listingEventStatements` para review y `updateListingEvent` para acción comercial idempotente, con source panel y action availability_changed ya admitidas. `updateListingEvent` permite operationId interno; exponer solo el request_id de esta nueva ruta validada y mapearlo internamente. No añadir idempotencia HTTP genérica al panel existente (aplazada EST-18). La evidencia vinculada debe ser atómica con cambio/evento/recibo: el helper actual `updateListingEvent` no acepta statements extra. Ampliarlo solo internamente con `additionalStatements:D1PreparedStatement[]=[]`, insertados después del UPDATE y su evento, antes de recibo/cleanup; cada statement exige contexto de esta ejecución y revision>previous_revision, de modo que replay no lo reejecuta. Los callers existentes conservan comportamiento por default vacío; HTTP nunca puede aportar SQL ni este parámetro. Los links apuntan al event_id de esa ejecución, no MAX(id) global sin guardas. Probar rollback si insertar evidencia falla. Para transición editorial usar CAS y evento `listing.review_requested` / `listing.review_returned` en allowlist explícita; snapshots estructurados incluyen review_requested_at/by y campos cambiados. Actor ya existe como email del empleado en events; no duplicar texto libre o evidencia sensible. Evidencia refs nuevas se validan y adjuntan como IDs, no cuerpos; ampliar related allowlist exclusivamente `evidence_ref` requiere formato propio, no forzar un UUID al validado de offer_id entero. Preferible `listing_marketing_evidence(listing_id,event_id,evidence_id)` con FK sin cascade sobre eventos y data con IDs de vínculo tipado; no inventar related.rental_id sin soporte actual.

Migración editorial añade marcadores y recrea triggers EST-18 para capturarlos. Ampliar CHECK availability requiere reconstrucción SQLite controlada de listings preservando columnas, IDs, valores, índices, FKs y triggers actuales. Seguir patrón de migraciones existentes y comprobar foreign_key_check antes/después con D1 local. No borrar y recrear datos mediante import, no desactivar integridad para ignorar huérfanos. Nuevos campos review no cambian historiales pasados; no backfill eventos ni nueva pestaña Timeline.

Cada mutación y su evento van en un batch con guard expected updated_at. Dos empleados: uno200 y otro409; falla evento⇒rollback. El recibo comercial request_id igual y mismo hash devuelve mismo event_id aunque ya avanzó updated_at; request_id distinto con versión vieja409; mismo ID/payload diferente409. Productores externos no se llaman desde el evento y no dan éxito ficticio de propagación. Fallo temporal503 conserva borrador;400 validación;401 sesión;403 origen;404 listing/evidencia inaccesible;409 estado/versión.

## Diseño y copy

En Listings añadir segmento/filtro “Ready for review” con contador; no cambiar Draft/Published/Archived en público. En ListingEditor usar acciones “Submit for review”, “Return to draft” y “Publish listing” bajo reglas actuales; ready badge separado del selector Availability. “Let agreed” y “Let” solo marketing alquiler, con formulario de fecha/motivo/evidencia y aviso de que no crea tenancy. To confirm sigue indicador derivado editorial de ADM-04, no un quinto estado comercial ni TTL de EST-16. Todas las superficies publiques muestran etiquetas nuevas y ocultamiento/propuestas según reglas, sin páginas nuevas.

CSS **vigente** panel: ink#141414/paper#fff/mist#f2efe9/line#e2ddd4/stone#6b665e/bronze#8a6a3b/ok#1f6b3a/err#a32020; Montserrat14px/1.5 y Tenor Sans H1 26px400; radio card14/input10/botón999; card24, botón10px20px y small6px14px11px; gaps8–16, tabla10px12px, página24px16px120px y fila→tarjeta bajo760. Foco2px bronce offset2, disabled opacity.45. Reusar `.seg/.badge/.btn/.card/.actionbar`; Ready usa tono attention ya usado en componentes cuando existe clase, no copiar como vigente la escala completa propuesta DESIGN. Web vigente ink#151515/mist#f4f3f0/bronze#a56b3d, pill999, fotos4:3 radio16; let puede reutilizar `.pill.sold` oscuro y let_agreed `.pill.offer` bronce mediante clases existentes, siempre texto. No unificar paletas sin encargo.

Labels/motivos asociados, aria-invalid/describedby, roles status/alert; teclado y foco en formulario/modal nativo según patrón actual, vuelta a disparador al cancelar; 1280/390, zoom 200%, reduced-motion. No toast, emoji, fuente/lib nueva ni foto original en lista; miniaturas dimensiones/aspect-ratio/lazy. React texto y safeHref, no HTML interpolado/PII en localStorage, origen y sesión verificados server-side. Loading “Saving changes…”; vacío ready “No listings are ready for review.”; errores “Couldn't save. Your changes are still here.” sin afirmar guardado.

## Aceptación

| Código | Prueba futura |
|---|---|
| EST-17 editorial | draft→ready→published y ready→draft con CAS; ready no publica/no cambia disponibilidad; import queue y archive busy actuales no se eluden |
| EST-17 alquiler | let_agreed/let solo operación rent con evidencia/actor/fecha; mapeo público/panel consistente; ninguna tenancy/venta/búsqueda creada/cerrada; venta actual lossless |
| EST-18 parcial | campos review y marketing dejan evento atómico con revision/origen/actor/evidencia; fallo del evento revierte; no timeline nuevo |

Autorrevisión: circuito editorial completo, contratos comerciales manuales, todos writers protegidos, migración lossless y pruebas de venta existentes. No decisiones comerciales/legal nuevas ni dependencia de una futura automatización de rentals para el tramo manual.
