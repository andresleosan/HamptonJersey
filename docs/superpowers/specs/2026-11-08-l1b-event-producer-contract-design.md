# EST-18 · Conformidad de productores y proyecciones · diseño

Lista 1 · 8-nov-2026 · base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1` comprobada con GitHub a19:30:56UTC. Solo planificación; sin reserva, construcción, migración, envío ni publicación.

**Estado:** Plan de integración listo en su alcance; cada productor requiere estar integrado antes de certificarlo. Historial visual e idempotencia HTTP genérica siguen fuera por decisión vigente.

## Hechos y alcance

La base interna EST-18 ya está publicada según evidencia histórica:0029 y cf0c86d; `listingEventStatements`, `listingBatch`, `updateListingEvent` y triggers cubren los escritores actuales de listings. El catálogo deja pendiente conectar productores futuros y mantiene la vista de historial aplazada por Luis. Este plan no reconstruye historial, no crea timeline ni añade idempotencia HTTP genérica al panel.

Los planes de la tanda1 asignan eventos a cada productor. Falta una aceptación transversal que demuestre atomicidad y avance del watermark de EST13 antes de integrar paginación. Se propone cerrar ese contrato mediante pruebas de integración reales y arreglos mínimos del escritor que falle, sin crear un bus de eventos, otra cola o un marco de workflows. Esta es una nueva unidad de integración, no una reimplementación0029.

**Construcción:** mantener EST18base/0029 y los productores del tramo que se va a certificar integrados. El catálogo EST18 no promete que estén construidos; antes de claimbuild registrar desglose exacto de recursos/archivos y dependencias reales. Con productor ausente se puede preparar caso de prueba local, pero se registra «no integrado», sin stub presentado como prueba. **Activación:** ningún emisor de comunicaciones/purga se habilita por esta certificación; conserva gates de cada módulo.

## Propiedad de eventos y migraciones

| Productor | Función/archivo real o propuesto | Evento y entidad |
|---|---|---|
| Ficha HE-* actual | server/listing-events.js y0029 | listing.*; entitylisting, IDHE-* |
| EvaluaciónBUS12 | upsertCandidateEvaluations en server/match-candidates.js propuesto | match.evaluation_changed; applicant |
| DecisiónBUS15 | recordMatchDecision en módulo del planBUS15; cotejar nombre integrado | match.decision_recorded; applicant |
| Disponibilidad/indisponibilidadEST16/15/19 | server/market-availability.js y módulos del planavailability propuestos | property.availability_observed/confirmed/review_required, property.trash_entered/reactivated/files_purged; property |
| Interés/visita/ofertaEST14 | matchLifecycleStatements en server/match-lifecycle.js propuesto | match.interest_changed/viewing_changed/offer_changed/agreement_changed; applicant |
| EditorialEST17 | server/listing-events.js y adaptador del planeditorial | listing.review_requested/review_returned y availability_changed; listing |
| RevisiónBUS17 | módulo del planreview21days integrado | revisión/episodio; applicant, tipo exacto cotejado con productor |
| CriteriosSAP10/AUT19 | commitApplicantCriteria propuesto y PUT existente | applicant.updated/criteria_confirmed; applicant |
| Fuente/consulta/presentación/visita | BUS10/AGE03/11/VIS17 de otras listas | tipos/entidad definidos por sus contratos reales, sin inventar DDL aquí |
| Política que afecta proyección | save de app_settings del dueño de política | configuration.availability_policy_changed; admin, entity_id availability_policy |

El nombre en contratos no publicados se coteja antes de construcción; si difiere se adapta la prueba al contrato integrado, sin crear una función paralela solo para satisfacer este documento. Disponibilidad es dueña de la única ampliación CHECK de events para `property`; **no se ejecuta ni se duplica en EST18**. Hasta integrarla, logEventproperty no funciona y el caso se registra bloqueado. Mantener IDs/índices/notificaciones/triggers de0029 y extensionesNOT11; nunca ampliar CHECK sin conservar contenido y FKs en una base local poblada.

`listingEventStatements` solo acepta IDsHE-* y campos/listingcontext actuales; no pasar property_id externo a ese helper ni convertirlo a IDlocal ficticio. `logEvent` genera sentencias para applicant/property/admin con binds. Un batch de productor contiene mutación, evento y su recibo/acciones cuando proceda; su guard debe abortar entero ante CAS inválido o no mutación. Si usa changes()/last_insert_rowid(), probar que el orden de statements conserva el valor previsto: insertar un evento antes de un guarddependiente puede romperlo. No registrar éxito antes de una llamada remota; un envío/captura/purga parcial informa estado parcial real y evidencia por objeto.

## Contrato de proyección y configuración

EST13 sigue `events_watermark=COALESCE(MAX(events.id),0)` y lectura de watermark/filas/totales en el mismo env.DB.batch readonly. La continuación conserva as_of del cursor firmado y compara watermark: cambio→409CURSOR_STALE sin filas; caducidad5min; ninguna promesa de snapshot histórico. Cada mutación DB/config que afecte candidate_current/approval_current/availability_current/esperas/filas/totales debe aumentar el watermark **en la misma transacción efectiva**. Contacto/criterios/cierre, hechos de inventario, decisiones, disponibilidad, eventos de consulta/presentación/visitas y políticasTTL/vivienda están en esa matriz. Cambiar solo el paso del tiempo usa el as_of fijo; toda acción revalida actualidad y permisos al ejecutar.

`projectionPolicyEventStatements(env,{policyKey:'availability_policy',beforeRevision:number,afterRevision:number,actor:string,at:string}):D1PreparedStatement[]` en `server/projection-events.js` (nuevo helper mínimo) produce un evento admin con data `{version:1,policy_key,previous_revision,revision}` y type configuration.availability_policy_changed. Solo acepta availability_policy y revisiones positivas crecientes y actor ya autenticado/sistema interno. El caller condiciona UPDATEconfig al beforeRevision y compone evento tras guard exitoso, no acepta SQL/actor/tipo desde HTTP. No copiar JSON completo de app_settings ni valores sensibles en events. Otra política nueva exige caso explícito, no «cualquier ajuste del sistema».

No crear otra tabla de watermark ni polling. Un evento no relacionado puede invalidar conservadoramente la página. Si un productor no puede unir DB+evento, debe tener outboxdurable cuyo pending invalide lectura por contrato real; este plan prefiere adaptación transaccional directa y **bloquea integración mientras falte**. Un callback afterSave sin garantía no satisface el contrato.

## Evidencia y privacidad

Los eventos conservan actor, UTC, origen cerrado, IDs tipados, versión/revisión y campos estructurados aprobados por cada dueño; textos libres solo nombres de campo, no cuerpo. Sin tokens, URLs firmadas, direcciones/emailcliente/teléfono/prompt/audio ni claves de objetoR2. Identificador staff ya usado en events no se duplica en payload. Capturas, consultas y modelos conservan su evidencia privada en su dominio con referencias permitidas. Borrado del contacto conserva/anonimiza según política existente, no lo impide un recibo personal nuevo; purga de archivos propiedad conserva historia y referencias mínimas ya acordadas.

## Aceptación

EV01mutación efectiva incrementa watermark y registra una revisión, replay/nop no repite; EV02fallo de CAS/evento revierte entidad+acciones+recibo; EV03listingexterno nunca usa HEhelper; EV04propertyCHECK integrado conserva FKs/IDs/notices al migrar; EV05cada escritor de proyección invalida cursor entre páginas, policyincluida; EV06acciones/lecturas fallidas no crean éxito; EV07mismo milisegundo/versiones diferentes siguen ordenadas; EV08privacyallowlistnoPII; EV09R2parcial registra parcial, sin fingir borrado; EV10vista aplazada y panel legacy conservados. Cada productor tiene evidencia individual; EST18no cierra por una prueba de un único módulo.

## Diseño y skills

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

avanzar delimita lista/reserva y base; brainstorming y grill-me distinguen hechos, propuestas y decisiones externas; writing-plans fija contratos y pruebas. Impeccable/product register ordena revisión y foco; redesign-existing-projects conserva los componentes existentes; taste-skill no aplica a una página nueva porque esta unidad amplía la ficha existente. Security-best-practices y frontend-security-coder acotan datos, permisos, CAS y salida escapada; antislop conserva identidad Hampton sin decoración y exige estados reales; web-performance-optimization acota cargas; ponytail reutiliza validación, matching y eventos, sin otro motor. No se instala ninguna skill o dependencia.
