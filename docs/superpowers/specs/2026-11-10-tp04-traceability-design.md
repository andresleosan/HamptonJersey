# TP-04 · Trazabilidad propia y publicación externa retirada

## Enfoque y evidencia

PUB09 sigue con fecha/motivo/historial de publicación propia; PUB15 queda retirada por decisión expresa posterior de Luis; el [plan anterior de portales](../plans/2026-11-08-pub-15-portales.md) se conserva como antecedente histórico. No diseñar ahora feed, adaptergenérico, infraestructura común oIDportalplaceholder. Otraalternativa deconector nominal necesita proveedor/destino/contratoyformato real yencargo dereanudación; no se inventan XML/API. Leer estados editoriales de EST17 y eventos EST18/SPR02 ya integrados, incluyendo avanceSPR02 del9/10novmain; no reescribirsu historial.

## PUB09 · Cambios y fechas con autoridad clara

listings.published_at existe y published_at deprimerpasoa publishedsolo cambia al pasardesdehiddensegúncódigoactual; Publishrepetido nocrea fecha nueva. Noañadir otra fecha públicaequivalente, backfillestimado ni migrar antiguas a hoy. Eventos listing.published/unpublished/archived/restored,availability_changed conservanrevisionycontexto. La fecha/motivo de retirada puede serdesconocido enhistórico, se muestra Unknown, nodeducirdesold/archivo.

Propuesta additiva enserver/listing-traceability.js: `recordListingWithdrawal(env,{listing_id,expected_at,reason_code,note,operation_id},actor)->{event_id,withdrawal_id,replayed}` y `readListingTraceability(env,{listing_id,cursor,limit:50},actor)->TraceabilityDto`. Tabla listing_withdrawals UUID/listing_id/occurred_at/source_revision/event_id/reason_code nullable/private_note/revision/operation_idactorunique; reason owner_request|let_elsewhere|sold_elsewhere|data_correction|other,other requirenota≤1000chars (no cliente/cuerpo legal libre). Operación usada para retirada explícita de laweb: consumidor alunpublish delservicioexistente, versiónCAS ylistingBatch/evento/recibo enmismobatch; nounpublish automático deotrasfichas/fuentes. Si está oculto yusuario soloañadecorrección demotivo, acto recordado como corrección denotaprivada nootraretirada; requiereid/version ypreservaoriginal. No cambiar disponibilidad física aldetallarretiradaeditorial.

PUB02 posee guardiasPublish; PUB09 no lasduplica. Integrar into setState/unpublish yarchivo solo si corresponde a acciónexplícita deocultarconmotivo; accionesautomáticasexistentes no obligannuevofree-text yguardanreason_code=null reservado al servidor +authorityref, no inventarrazón. Momento real nowUTC enservidor; nofecha pasadainventada. Actor noURLbodypermitId. Nota privada no entra aeventosgenerales ni payloadtoPublic, metadatossociales,sitemap,Insights público oCSVsinpropósito. Eventos mínimos withdrawal_id/reasoncode, sinnota. Escribir source_revisionreal; currupdatedAt conflict409 no guardado parcial.

DTO: current_publication={published,published_at,visible_with_photo,editorial_state}; withdrawal_history con referenciayfecha/motivo alStaff ynota soloenlecturaprivadaautorizada; metrics {views:{unit:'recorded_actions',source},saved:{state:'not_tracked',value:null},calls:{state:'not_tracked',value:null}} hasta productoresreales. Telclick no llamadaefectiva ni pageviewguardado. No portal_ids/portalreceipts enDTOv1: subtramoportal excluded_by_user_current_scope. No bloquea trazabilidadpropia.

Interfaz en ListingEditor yListingHistory existentes, enlazando historiaSPR02 con cursor/50 yfuente real; nosustituirelcomponente ni inferir eventos antiguosinexistentes. Form deunpublish motivo concreto+nota siother, teclado/focoyerrores; conservarSave/Discard/estadoactual ystale409. Datos desconocidosdate0 jamás. Vistapública igual respecto aprivateinformation; ninguna nueva integraciónMeta ni informespropietario.

## PUB15 · Retirada del alcance vigente

No hay tareas de investigación, selección de portal, permisos o construcción pendientes para publicación externa. No crear feed/API/adapter/infra genérica ni IDportal. Solo una nueva decisión expresa de reincorporación abriría un alcance futuro; no reactivarlo desde PUB09.

## Condiciones comunes

Solo planificación, base main/GitHub80ad03df7e095750f455aa4aa668573e9aac5db4 verificada10-nov11:53:55UTC,45documentos propios preservados/reconciliados. Actividad compartida no disponible; sin exclusividadbuild ni captura real. Otra sesión construye. Migraciones aditivas con ordinal libre (0038ocupado), un solo escritor por módulo. No investigar fuentes, leerbases reales, hacer scraping, inferencia, envíos, cuentas, permisos, migración, commit/push o despliegue aquí.

[Maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md) retira ADM05/OFE08 y mantiene fuera Meta/tours, publicación en portales/PUB15 retirada; posteriores WhatsApp/Drive/Places/Properties/modeloslocales. Homely fuera. Pro/Hermes porpropósito/vía/acuerdos verificados, C3 nunca; sin APIpagada alternativa. Hermes gestiona acuerdos coninstruccionesexistentes, no nuevas búsquedas/órdenes. IA no disponible→humano+unaviso; dispatchincierto requiere conciliación, no retryciego.

01:00 Europe/Jersey para pasada diaria porfechalocal, no24hUTC. Cobertura, acceso y lectorconstruido sonestadosindependientes. MascotasstrictMUST, parkingflexiblenuevo sin rebajarMUST; disponibilidad confirmada/específica, matchhumano y presentación siguen susautoridades. Importar un anuncio no aprueba match ni confirma disponibilidad. Retirada editorial de web no equivale indisponibilidad de propiedad deotrafuente.

Staff/same-origin/no-store, JSON128KiB/10recordsmanual porpágina/description4000chars, listas50/cursor/poll30s solo visible. SQLparametrizado/enums cerrados, actor yversión servidor. Original/evidencia/huella preservados; unknown nofalse/0, retención pororigen real. Contactos/direcciones/anuncios pueden serpersonales aunque públicos; camposprivados fuera de logs, analytics, Telegram/localStorage/URL. TextoReact/esc/textContent yURLvalidada, no HTML/JS de anuncios ejecutados. Registros suprimidos no resucitan por reintento.

UI actual panel ink#151515,paper#fff,mist#f4f3f0,line#e3e0da,stone#6b665e,bronze#a56b3d foco,bronze-dk#86542d texto,err#a32020; Montserrat14/1.5 Tenor26/19 wrap1240 gutter16 card24-r14 inputr10 button10x20-r999 reflujo760. Copyinglés, teclado/foco2-offset2 contraste4.5/3 zoom200 reducedmotion;44móvil/32desktop propuestos. Sin rediseño/fuentes/librerías nuevas. Pruebas futuras de comportamiento yD1real paraatomicidad; documentos no necesitan npm/build/e2e ahora.

## Precisión revisada de desconocido y correcciones

reason_code admite cinco valores expresos oNULL **solo para registro automático/legacy delservidor**. Cliente de retirada explícita debe elegir una delas cinco; body reason_code null/unknown se rechaza400. No afirmar motivohistórico inferido. DTO null→Unknown. Nota yrazón original en listing_withdrawals inmutables. Corrección es append-only en listing_withdrawal_revisions(id,withdrawal_id,revision,previous_revision,reason_code,private_note,actor,at,operation_id), unique(parent,revision), conCAS delpuntero current_revision delpadre; jamás overwrite de original.

`correctListingWithdrawal(env,{withdrawal_id,expected_revision,reason_code,note,operation_id},actor)` verificaestado/capacidad, insertarevisión yrecibo enbatch, no vuelve a ejecutar unpublish ni emitir otro listing.unpublished. Historialprivado dePUB09 muestra correcciones enlazadas yactor/fecha, sin nuevo evento genérico connota ni introducir tipo que rompa validadoresSPR02. El evento originalunpublished conserva referencia mínima; laauditoría de revisión vive en tabla privada. Supresión por política de dato personal se trata porPRE12 sin restaurarnota desdeoriginal de otrafuente.
