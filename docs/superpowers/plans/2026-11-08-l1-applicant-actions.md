# SAP-09 applicant quick actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega autoriza solo planificación; no iniciar implementación. La coordinación conserva la revisión independiente final.

**Goal:** Abrir presentación o propuesta de visita desde la búsqueda con contexto autorizado.

**Architecture:** Adaptadores consumidores verifican capabilities/versiones de AGE11/VIS17 y abren sus gestores canónicos, conservando reserva local explícita.

**Tech Stack:** React19, JavaScript ES modules, Cloudflare Pages/Workers y D1/SQLite; pruebas Node y harness e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1-applicant-actions-design.md).

## Global Constraints

- Base comprobada main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo documentos ahora; construir exige alcance/reserva build y aprobación del diseño según el flujo vigente.
- No cambiar estados del catálogo durante la planificación; las dependencias indicadas son las vigentes, no nuevas filas del catálogo.
- Toda API privada usa rutas autenticadas existentes (flag `true`) y validación servidor; no resolver autorización en el navegador.
- Una lectura fallida no equivale a cero resultados; escrituras obsoletas responden409, desaparecidas404, inválidas400, sin repetir efectos por reintento ciego.
- **UI vigente comprobada, no la cabecera antigua de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, stone `#6b665e`, mist `#f4f3f0`, line `#e3e0da`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, paper `#ffffff`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui 14px/1.5; Tenor Sans/Georgia H1 26px, H2 19px, peso400; labels12px; botones600 12px tracking `.08em`, padding10px20px, radio999px, hoverbronze-dk, disabled opacity`.45`. `.card` padding24px/radio14px/borde1px line/sombra `0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22)`; campos fondo`#fbfaf8`, borde field-line, radio10px, padding9px12px. `.page`1240px padding24px16px120px; `.seg` gap2px/padding3px, botones7px16px; `.inline` gap12px; `.badge`11px/padding3px10px; miniatura72×54/radio8px. Foco2px bronze offset2px. Tabla apila a760px; editor actual a900px. Mantener estos umbrales; para piezas nuevas apilar a760px, sin nuevas fuentes/colores/sombras. Texto normal≥4.5:1; foco/borde≥3:1; estado con etiqueta además del color. Copy público/API/panel en inglés. Reusar `.btn/.card/.seg/.badge/.empty/.warn/.actionbar`; navegación de pestañas con flechas/Home/End; mensajes status/alert; foco restaurado y errores asociados; zoom200%, reduced-motion. Sin librerías nuevas, sin PII en storage/URLs/logs; React escapado, enlaces internos por ID y externos con helpers seguros. Imágenes dimensionadas/lazy, CLS<0.1; sin N+1 ni polling nuevo.

## Review Focus

- Cambio material tras leer eligibility vuelve a verificar al abrir (Task1).
- Acuse perdido o dos empleados no duplican gestión ni envío (Task1).
- Casa externa no se confirma por hueco local (Task2).
- Datos de contacto/franjas de otra búsqueda y tokens en URL nunca pasan (Task2).
- D05 aprobada: cada presentación exige revisión humana final y click Enviar; preparar/abrir no envía (Task2).

## Frontera y archivos

Crear `server/applicant-actions.js`, `admin/src/ApplicantQuickActions.jsx`, `tests/server/applicant-actions.test.mjs`, `tests/applicant-actions.e2e.cjs`; modificar `server/routes/applicants.js`, `admin/src/ApplicantDetail.jsx`, `admin/src/MatchCard.jsx` o componente canónico SAP03, `admin/src/App.jsx` y `admin/src/Viewings.jsx` para contexto de preparación seguro. Sin migración propia: gestión/idempotencia pertenece a AGE11/VIS17. Releer contrato real productor antes de modificar consumidor; no modificar sus workflows solo para hacer pasar fixtures.

### Task1: contratos y resolución autenticada

**Interfaces:** readApplicantActions/resolveApplicantAction y DTO/rutas exactos de spec; fixtures implementan capacidades completas de AGE11/VIS17, diferenciadas de wrappers reales pendientes.

- [ ] Tests A1/A2/A3/A4 y A7: eligibility completa/incompleta, imagen prohibida, evidencia expirada, legado shortlisted, candidato de otra búsqueda 404, search_version caducada 409, dos aperturas misma gestión, pérdida acuse reintento mismo ID, canal manual real y servicio ausente con error claro. Sin sesión401/403; no reenviar tokens/PII.
- [ ] Ejecutar `node --test tests/server/applicant-actions.test.mjs`, esperarRED por adaptador ausente.
- [ ] Integrar adaptadores contra productores presentes, lectura y POST con versiones esperadas. Verificar escrituras condicionales del productor; si requiere API contract change registrar pendiente y no adivinar targets. Reutilizar ID canónico ya existente.
- [ ] Reejecutar prueba y pruebas productores reales; esperarPASS. No basta probar un mock que siempre devuelve ready; añadir test contrato con fixtures D1 productores integrados.

### Task2: acciones contextuales y flujo entero

**Interfaces:** ApplicantQuickActions props de spec; recibir candidate_id/property_key por SAP03/EST13, no listar matches legacy como aprobaciones. Contexto local de prellenado se recupera con GET autenticado por applicant/candidate ID y versiones, no query PII. POST de booking real conserva slotguard existente y enlace SAP08 si integrado.

- [ ] Escribir e2e A5/A6/A8/A9 más revisión final D05 aprobada: externa ready abre propuesta, local abre formulario sin INSERT automático, datos y franjas correctas, un hueco perdido devuelve 409, cancelación conserva búsqueda activa, información pendiente visible. Contar sideeffects:click Prepare no correo/visita.
- [ ] Conectar acciones a ficha y tarjeta sin deshabilitar criterios/otros canales; no botón enviar genérico. Texto inglés y reasons visibles, focus restaurado al volver; error y reload conservan cambios sin guardar. Resolver capability ausente como blocked, no fallback a mailto con paquete privado.
- [ ] Ejecutar pruebas nuevas, `npm test`, `npm run build`, `npm run check:release`; e2e según cabecera actual con fixtures locales. No entrega externa real para probar.
- [ ] MCP Playwright 1280/390, zoom200%, teclado/carga/vacío/error/partial, consola/red y dos pestañas version conflict. Confirmar no PII en hash/storage/logs, sin recarga entera de ficha por botón.
- [ ] Actualizar documentación producto solo tras construcción y revisión independiente: SAP09 parcial hasta ambas acciones reales, AGE11/VIS17 no completados por consumirlos. Publicación/migración/activación requieren autorización separada.

## Actualización posterior: cierre Q01 / D05

- [ ] Añadir caso de que match aprobado y disponibilidad vigente no envían automáticamente; preparar/abrir tampoco. Solo revisión final y click Enviar explícito por empleado llaman el comando AGE11. Afirmar actor, instante y versión de presentación registrados; cambio material antes del click exige nueva revisión, y doble click/reintento no duplica envío. Ejecutar mediante el harness local y mocks de transporte de AGE11 cuando el productor esté integrado.

Decisión aprobada por Luis el8-nov en entrevista; no se ha ejecutado el caso ni construido el flujo.

## Corrección de alcance: presentación por email preparada por Hermes

Luis aclara en la entrevista: al cliente se le mandarán las fotos directamente por correo y Hermes dejará preparada la presentación. El email es la presentación; no se exige que el cliente entre a un portal para verla. Permanece D05 aprobada: el empleado revisa y pulsa Enviar cada vez. Esta aclaración no concede a Hermes envío autónomo.

El target presentation de SAP09 abre la preparación/revisión del email en el panel. AGE11 es dueño del borrador y del snapshot de fotos autorizadas con sus IDs/revisiones/procedencia y disponibilidad vigente; Hermes prepara ese borrador según el carril autorizado. La app resuelve destinatario y compone los archivos/fotos autorizados, y AUT17 ejecuta el envío aprobado. La frontera vigente de datos de Hermes se conserva: no implica darle email, identidad o criterios privados del cliente, ni fotografías privadas si el carril no los admite. Usar hechos de vivienda y referencias permitidas para preparación; si el formato requiere datos de otra clase, registrar el requisito y validar el carril antes de activarlo. No ampliar silenciosamente la puerta actual de jobs listing_text.

El transporte actual server/email.js usa subject/text para el resumen del equipo; no se afirma que ya soporte el formato de fotos. El productor AGE11/AUT17 debe integrar texto breve y fotos como adjuntos descargables: formato confirmado por Luis en Q11, detallado abajo. No presentación en portal ni fotos inline. Respuesta ordinaria por email adoptada por el planificador para mantener el flujo sencillo, sin inferir acciones automáticamente.

Pruebas futuras: el cliente recibe la presentación por email sin login/portal; el borrador procede de preparación de Hermes dentro de su autorización; abrir/preparar/aprobar match no envía; el empleado revisa snapshot y confirma; versiones/fotos/permisos obsoletos bloquean; acuse perdido/doble click no duplica; no se publica una URL de fotos internas para eludir permisos. Recipient/destino se resuelve en servidor y queda fuera de prompts si el carril no lo admite. Fotos no aptas/no autorizadas impiden su incorporación.

AGE10/AGE12 figuran aún como dependencias del catálogo de otra lista. Registrar el cambio de diseño en su productor/coordinación antes de construir por tramos; este documento no elimina dependencias, adopta reservas o modifica código de esa lista. El acceso para copia de datos/solicitudes de privacidad de PRE12 es una función distinta y no queda aprobado ni descartado por esta aclaración.

## Q11 aprobado: texto sencillo y fotos adjuntas

Luis confirma un email sencillo con texto explicativo breve y fotografías como archivos adjuntos descargables. No imágenes insertadas en el cuerpo, galería web, PDF, ZIP o portal para esta presentación. Hermes prepara el borrador; el empleado revisa texto, selección y destinatario y confirma Enviar conforme a D05.

Contrato técnico propuesto para AGE11/AUT17, sin implementarlo en Lista1: `PresentationEmailSnapshotV1={version:1,presentation_id:string,presentation_revision:number,applicant_id:number,search_version:string,candidate_id:number,material_version:string,subject:string,text:string,attachments:PresentationAttachmentRefV1[]}`; `PresentationAttachmentRefV1={media_id:string,media_revision:string,sha256:string,mime:'image/jpeg'|'image/png',filename:string,byte_length:number,permission_revision:string}`. Actor y destinatario se resuelven en servidor. IDs/revisiones se adaptan al tipo real del productor antes de integrar; nunca tomar una URL arbitraria del modelo para descargar un archivo.

`preparePresentationEmailSnapshot(env,{presentationId,expectedRevision},actor):Promise<PresentationEmailSnapshotV1>` pertenece al productor AGE11; la app incorpora sus fotos autorizadas y conserva la versión que revisó el empleado. `buildPresentationEmailAttachments(env,snapshot):Promise<{content:string,filename:string,type:string,disposition:'attachment'}[]>` lee objetos privados autorizados, valida bytes/hash/MIME/revisión y codifica base64; content nunca se guarda en logs, eventos o JSON de la ficha. No contentId ni imágenes inline. Conservar el fallback textual y, si se mantiene el wrapper HTML actual, solo texto escapado sin diseño nuevo.

Cloudflare documenta `attachments` en el mismo binding `env.EMAIL.send`, con content/filename/type/disposition y límite total25MiB. Fuente oficial comprobada8-nov: [Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/). En el diseño se elige un límite local menor:1–20fotosJPEG/PNG, máximo8MiB de binarios sumados y máximo16MiB de mensaje codificado estimado. Son decisiones técnicas del planificador, no preferencias adicionales atribuidas a Luis. Si la selección supera límites, bloquear con motivo y permitir reducirla; no descartar fotos o dividir/reintentar correos automáticamente. Usar derivados autorizados ya disponibles del productor de medios; no instalar una librería ni inventar una variante no construida. Originales quedan intactos.

La preparación persiste referencias a adjuntos vinculadas al outbound y snapshot, no base64 duplicado; establecer pins de uso para queued/sending/unknown y borrador vigente según contrato EST19. Resolver bytes y validar límites antes del fence final, luego revalidar versiones, permiso, búsqueda/confirmación y manifest en el mismo claim/fence que envía. Un fallo al leer una foto no manda un correo incompleto. Cambio de fotos/texto/destino después de revisión exige revisión nueva. Reintento conserva el snapshot confirmado y dedupe del outbound, sin repetir por acuse desconocido. Tras accepted, conservar evidencia según política existente del dominio, sin declarar almacenamiento perpetuo de archivos ni borrado legal aprobado.

Pruebas futuras en consumidor y productor: texto breve y exactamente los adjuntos revisados; dispositionattachment sin contentId/inline/URLs públicas; cero fotos/foto ilegible/hash diferente/MIME inválido/permiso retirado bloquean; límite8MiB/20fotos no trunca;20permitidas frente21bloqueadas; fallo del adjunto antes del fence genera0llamadas al binding; doble clic y acuse perdido no duplican. Fixtures locales interceptan el binding sin email real. Correo efectivo sigue sujeto a AUT17 activado; consultar documentación no lo activa ni demuestra que el código tenga ya esta extensión.

Por simplicidad, se adopta como decisión del planificador la respuesta ordinaria del cliente al propio email mediante Reply-To existente y revisión del equipo. Vincular el hilo por ref persistida, sin inferir identidad/confirmar visitas/modificar criterios por texto recibido. No se añaden botones, portal ni interpretación automática por IA. Si Luis pide posteriormente otra respuesta, se revisa ese alcance.
