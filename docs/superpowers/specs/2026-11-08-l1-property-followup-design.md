# BUS-18: seguimiento por vivienda y operación

Estado: planificación documental, sin implementación, migración, reservas ni publicación. Base compartida autorizada `/tmp/hampton-lista1-batch-20261108`, main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, verificada por la sesión raíz el8-nov-2026 a14:14UTC. Catálogo `docs/roadmap/tasks/*.json` y reconciliación7-nov son fuentes; no se corrige aquí su estado ni se atribuye despliegue nuevo.

## Resultado y estado actual

Extender Matched applicants del editor Hampton a vivienda canónica con publicaciones externas. Cada búsqueda y operación conserva su fila: evaluación, decisión, consulta compartida, disponibilidad, interés privado y visita son dimensiones distintas. Comisión es gestión humana independiente, sin tasa ni importe inferido.

Hoy server/routes/listings.js:detail consulta matches porlisting_id y une applicants/contact. ListingEditor.jsx:MatchedApplicants muestra Found/Shortlisted/Rejected, score y enlace Matches. Inventario BUS-10 no existe en esta base; no crear HE-* para externos ni fusionar unidades por dirección. El interestSql público de server/viewings.js cuenta interés/visitas con reglas propias y no demuestra respuesta privada del match.

Añadir joins a publicaciones duplicaría solicitantes; construir otra ficha de inventario invade BUS-10. Propuesta técnica: componente reutilizable sobre property_id/operation y API de lectura sobre EST-13. ListingEditor lo monta tras resolver identidad; la futura ficha de inventario podrá usarlo sin construirse aquí.

## Contratos y responsabilidades

Consume `server/match-followup.js:propertyFollowupFactsQuery({propertyId,operation,asOf,cursor,limit}):{sql,args}` deEST-13. Una fila por búsqueda/operación con candidate_id, applicant_id, property_key, property_id, operation, search_state, search_version, material_version, revision, evaluation_status, decision_state, availability_state, enquiry_state, delivery_state, client_state, viewing_state, facts_valid, source_refs, total_rows, next_cursor. viewing_state admite none/requested/confirmed/cancelled/completed/no_show/unknown; solo completed se muestra “Viewed”, no_show muestra “No show” sin contar visita realizada. Enums según [EST-13](2026-11-08-l1-followup-states-design.md). La API admin añade nombre visible/id del contacto existente, sin correo/teléfono/cuerpos. Consulta común A/B no duplica filas ni comparte interés particular.

Puerto BUS-10 requerido `resolveListingProperty(env,{listingId:string}):Promise<{property_id:string,property_keys:Array<{property_key:string,operation:'rent'|'buy'|'transfer'}>,inventory_version:string}|null>` en nuevo server/property-followup.js como adaptador. No implementación de inventario aquí: cotejar firma real antes de código. Sin identidad resuelta mostrar “Property identity needs review” y conservar legado etiquetado como historia; nunca deducir vínculo por dirección o prefijo HE simulado.

`listPropertyFollowup(env,{propertyId,operation,cursor,limit,asOf}):Promise<PropertyFollowupResponseV1>` en server/property-followup.js orquesta builders. GET `/admin/property-followup/:propertyId?operation=rent|buy|transfer&cursor=<opaque>&limit=25` en server/routes/property-followup.js requiere admin existente. Respuesta `{version:1,property_id,operation_filter:null|operation,as_of,rows:PropertyFollowupRowV1[],total:number,next_cursor:null|string,commission_management:{state:'unavailable'|'not_recorded'|'recorded',record_id:null|string}}`. PropertyFollowupRowV1 es la fila anterior más name/contact_id mínimos, sin metadata de paginación por fila.

Validar propertyId según BUS-10 real, operation, limit1..100 y cursor ligado a propiedad/filtro/snapshot.400 formato,404 identidad inexistente,401 sesión,500 error SQL habitual; nunca array vacío porfallo. Orden operación, búsqueda activa antes histórica, applicant_id estable. total del mismo filtro anteslimit; keyset sinOFFSET sobre joins. Una respuesta lee un snapshot y un asOf UTC, queries acotadas sin N+1, sin escrituras de actividad/versiones/eventos.

Puerto propuesto `commissionManagementQuery({propertyId,asOf}):{sql,args}` requiere productor de gestión humana, solo state/record_id. Ausencia de productor ->unavailable; lectura correcta sin registro ->not_recorded; registro humano explícito ->recorded. No crear tabla de términos, porcentaje, importe o política no definida. “Commission: manual management” y enlace privado solo si existe registro seguro; no botón muerto que prometa captura. Su captura/campos/contrato quedan fuera de este tramo y pendientes de alcance propio. No declarar BUS-18 entero completado si catálogo conserva ese requisito.

`admin/src/PropertyFollowup.jsx:PropertyFollowup({propertyId,initialOperation=null,paused=false})` consume GET. ListingEditor recibe del detail `{canonical_property:resolved|null}`, nuevo campo mínimo, y monta componente al resolverlo. Pausa de sesión viene del host App; preservar historial legacy claramente etiquetado cuando falta identidad. No nueva página de inventario ni formulario de comisión.

## Presentación y actualización

Columnas “Search”,“Operation”,“Evaluation”,“Decision”,“Enquiry”,“Availability”,“Client response”,“Viewing”. Sin consulta “No enquiry”; sin disponibilidad acreditada “Not confirmed”; sin contacto privado “Not contacted”; búsqueda resuelta “Resolved search”; facts_valid0 “Needs review”. Unknown no se convierte en No/0. Fuentes inline con fecha y URL http(s) validada, sin mensajes/contactos del anunciante. Compra y alquiler del contacto son filas distintas; no deduplicar por nombre ni contact_id. Comisión no depende de estado de match/disponibilidad/visita.

Usar usePoll30s solo visible/sesión activa con generación por propiedad/filtro/cursor. Callback inicial verifica visibilidad; evitar dobleGET. Paused/401/desmontaje invalida respuestas. Operación nueva reinicia cursor. Loading “Loading property follow-up…”, vacío “No searches linked to this property.”, error “Could not load property follow-up.” con “Reload follow-up”; refresco fallido conserva snapshot “Showing the last loaded follow-up.”. Al cambiar filtro no etiquetar filas viejas como nuevas. Retry repite únicamenteGET, foco estable y anuncio live deerror/recuperación, no por fila.

## Dependencias, clasificación y aceptación

BUS-18 catálogo BUS-10/AGE-03/EST-13 integrated; EST-09 aporta cierre y AGE-11/VIS-17 dimensiones reales. Unknown legítimo mientras falta dimensión opcional no demuestra integración terminada. Tramo de seguimiento listo condicional a productores; legado Hampton ya construido se preserva. Gestión de términos de comisión queda fuera del tramo, sin decisión previa en esta sesión.

B18-1:3 publicaciones->1 vivienda, filas por búsqueda/operación y2 unidades misma dirección separadas. B18-2: dimensiones independientes, rechazarA no cambiaB. B18-3: resolverA conservaB/consulta común sin cierre automático. B18-4: externa sinlisting/imagen presenta hechos y enlaces válidos, sin HE ficticio. B18-5: comisión solo por registro humano independiente, sin importe/tasa inferidos; ausencia declarada. B18-6: auth/GETsin writes, totales globales/paginación sin N+1, errores/carreras/401/móvil/teclado seguros.

## Diseño, seguridad y skills aplicables

Lectura: PRODUCT.md, DESIGN.md y CSS vigente, interfaz operativa del equipo, ENERGY 1 / RHYTHM 1 / MOTION 1. Conservar la comparación y acciones existentes, sin dashboard, métricas inventadas, fuentes, imágenes, librerías ni animaciones nuevas. Todo texto visible/API en inglés.

Valores actuales comprobados en `admin/src/styles.css`: ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d, bronze-dk #86542d, ok #2f6b4f, err #a32020, warn-bg #fff6e5, field-line #8f8a82; cuerpo Montserrat/system-ui/sans-serif 14px/1.5, auxiliar12px, cabecera12px/600, H1 Tenor Sans/Georgia/serif26px y H2 19px peso400; page max1240px y padding24px 16px 120px; radio14px contenedor/10px campo/999px botón, tabla10px 12px, botón10px 20px, pequeño6px 14px, gaps8/12/16px, sombra0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22). Foco2px bronze/offset2px; hover bronze-dk, disabled opacity.45. No copiar antiguos tokens del YAML de DESIGN. Escala nueva4/8/12/16/24/32/48/64, radios globales16/12 y breakpoints480/760/980 siguen propuestas; esta entrega solo propone reflow a760px y objetivos32px escritorio/44px móvil en controles tocados. Mantener contraste texto4.5:1 y foco3:1, estados con texto, teclado, zoom200%,1280/390 y reduced motion.

Autenticación admin y sameOrigin de `server/api.js` existentes, SQL parametrizado y `cache-control:no-store`; no añadir rol ni cambiar auth. Actor siempre de sesión, IDs/versiones comprobados servidor, texto React sin HTML inyectado. No PII/cuerpos de correo en eventos, logs, URL ni almacenamiento del navegador; no exposición pública ni envío automático. GET no modifica actividad, versiones o estado. Las pruebas futuras usan exclusivamente fixtures ficticios locales.

Avanzar organiza evidencia y no reserva planificación; brainstorming/grill-me separan decisiones documentadas de propuestas; writing-plans concreta interfaces. Impeccable/product mantiene densidad, estados y foco; antislop aplica diales1/1/1 y exige validación real al construir; security-best-practices/frontend-security-coder aportan permisos, DTO mínimo y render seguro; web-performance-optimization evita N+1, consultas ilimitadas y refrescos ocultos; ponytail mantiene puertos pequeños. Taste-skill/redesign-skill no aplica crear página ni rediseñar identidad. Ningún gate runtime se declara aprobado por escribir Markdown.


## Fence de paginación acordado con EST-13

No hay snapshot D1 persistente entre GETs. Consumir FollowupCursorV1 sellado: mismo as_of, ámbito/posición, events_watermark y caducidad300000ms. Cada respuesta lee COALESCE(MAX(events.id),0), totales y filas en el mismo env.DB.batch readonly; discrepancia devuelve409CURSOR_STALE sin página. UI ofrece Reload de colección nueva, preservando borrador/foco; filtro nuevo invalida cursor. as_of viene validado del cursor, no de un timestamp libre del navegador. Preflight garantiza evento atómico para todo cambio de datos/config usados; si un productor no lo hace, no se integra la paginación. Cambio no relacionado puede invalidar conservadoramente, sin afirmar historia congelada.
