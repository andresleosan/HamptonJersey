# PRE-10 purpose-aware communication permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Encargo actual solo documental; no ejecutar este plan sin autorización de construcción, revisión de alcance y reserva build propias.

**Goal:** Preparar avisos y autorización/revocación por canal y finalidad sin rehacer oposición manual ni habilitar campañas sin revisión.

**Architecture:** Ledger pequeño de permisos y políticas allowlist; guardSQL y fence final amplían AUT17 y conectan productores REG15/REG16 sin mezclar identidades.

**Tech Stack:** JavaScript ESM, React/CSS existente, Cloudflare Pages/Workers y D1, node:test y Playwright locales; sin dependencias nuevas.

**Spec:** [Diseño](../specs/2026-11-08-l1b-communication-permissions-design.md).

## Global Constraints

- Base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1` verificada por coordinación. Nombres de migración propuestos se reconcilian con main al construir, sin ocupar0032 por inercia ni editar una migración aplicada.
- Estado producto sin cambios: un plan preparado no es validación legal, activación ni tarea completada.
- Actor de sesión o productor interno autenticado; nunca actor, permiso o aprobación legal enviados por un navegador público. Rutas privadas llevan flag auth=true y validación servidor.
- Sin datos/credenciales reales en fixtures, sin red/servicios/DNS/configuración o secretos. Salidas React escapadas; no dangerouslySetInnerHTML ni HTML de correos/políticas.
- El CSS real de main prevalece sobre la cabecera histórica de DESIGN.md: panel ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui 14px/1.5; Tenor Sans/Georgia/serif H1 26px y H2 19px, peso400; labels12px. Página1240px, padding24px16px120px; tarjetas blancas padding24px/radio14px/borde1px line/sombra `0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22)`; campos `#fbfaf8`, radio10px, padding9px12px, borde field-line. Botones600 12px/tracking .08em/padding10px20px/radio999px, hover bronze-dk, disabled opacity .45; `.inline` gap12px, `.seg` gap2px/padding3px, badges11px/padding3px10px. Foco2px bronze/offset2px. Tabla apila a760px y editor vigente a900px; piezas nuevas se apilan a760px, sin inventar breakpoints globales. Reusar `.card/.warn/.err/.muted/.btn/.inline/.kv/.badge`, no estadísticas decorativas. Copy visible/API en inglés, documento en español. Estado con texto además de color; normal≥4.5:1, foco/borde≥3:1; errores asociados mediante aria-invalid/describedby, status/alert, foco útil tras confirmación/error. Verificación futura1280/390, teclado, zoom200%, reduced-motion. Sin librerías, fuentes, polling o imágenes nuevos; lecturas paginadas y queries batch, sin N+1 ni PII en URL/storage/logs.

## Review Focus

- Marketing false usado como bloqueo universal o como permiso para valuation (Task1).
- Email/ID iguales mezclan contacto y suscripción o destino antiguo (Task1).
- Una nueva template omite el hook y envía con aprobación de fila genérica (Task2).
- Unsubscribe/supresiónABA trasclaim y antes del binding (Task2).
- Aviso primer canal marcado delivered por queued/unknown, con token expuesto (Task3).

## Archivos y alcance

Crear `server/communication-permissions.js`, `server/routes/communication-preferences.js`, `migrations/NNNN_communication_permissions.sql`, `tests/server/communication-permissions.test.mjs`, `tests/server/communication-send-fence.test.mjs`, `tests/communication-preferences.e2e.cjs`; modificar `server/api.js`, `server/email.js`, `server/routes/email.js`, `server/routes/applicants.js`, `server/routes/public.js`, `admin/src/Email.jsx`, `admin/src/EmailSettings.jsx`, `admin/src/styles.css`. Ajuste mínimo en `admin/src/ApplicantDetail.jsx` únicamente para que la acción manual previa aporte el comando scope explícito cuando corresponda; no reconstruir su flujo/botón ni invadir REG16. `site/communication-preferences.js` nuevo solo si el enlace genérico es necesario; REG15 conserva su frontend/ruta y consume el builder compartido. Integrar `server/search-alerts.js` y `server/valuation-consent.js` solo cuando sus productores existan, sin crear sustitutos dentro de PRE10. Ampliar pruebas existentes `tests/server/email.test.mjs`, `tests/server/email-admin.test.mjs`, `tests/server/email-inbound.test.mjs`, `tests/server/applicants-public.test.mjs`, `tests/server/applicants.test.mjs` y `tests/server/chats-admin.test.mjs`.

### Task1: protocolo de política/permisos y retirada (sin habilitar nuevos fines)

**Interfaces:** RecipientRef/PermissionSourceRef/EvidenceRef/CommunicationPermissionV1 y read/resolve/grant/revoke/guard de spec. SQLguard es función síncrona composable, nunca Promise. Configuración manual exacta por purpose/channel/recipientkind; no DSL ni base jurídica inferida. ComunicaciónPolicyConfig del spec, sin paquete profesional. Builder interno `recordCommunicationGrantStatements(env,input,actor):D1PreparedStatement[]` usa mismos campos y expectedRevision del wrapper + evidence_guard SQL/binds solo de productor autenticado; proof+grant+evento comparten DB.batch y guard perdido aborta todo. Productor REG16 posee texto/prueba específica, REG15 posee subscription/request; este módulo guarda solo refs y revisiones.

- [ ] Escribir P1/P2/P3/P4/P8: NULLlegacy no oposición histórica; newsoptin no valuationgrant; marketingfalse no bloquea servicio que tenga política/autoridad vigente; transporte suprimido sí bloqueaemail incluso servicio. contact1/sub1/advertiser1 mismoemail no heredan grant; destinationchange no transfiere permiso. Política no validada/duplicada/revocada/caducada/noticeausente=>review_required o denied, nunca allowed; falloDB lanza error. Consent requestrevision/notice/policy/sourceexactos y actor de sesión.
- [ ] Añadir tests grant/revoke CAS y replay: misma key/hash un evento; key distinto scope409; retirada verificada sin expectedRevision gana sobre grant anterior; nueva grant no levanta transporte ni retirada posterior; scopepurpose frente all_marketing/canales. Público duplicate unchecked retira solo casilla news actual; privado manual con scope explícito aplica ese alcance. No inventar canales de eventos antiguos.
- [ ] Ejecutar `node --test tests/server/communication-permissions.test.mjs`; esperarRED por contrato ausente.
- [ ] Implementar migración/heads/eventos/lookup y validación de configuración manual con estado validado al guardar datos completos, sin contenido o grants de cliente inventados. Extraer builder interno compartido para integrar privatecontact/publicduplicate/suppressions dentro de sus batch existentes; no commit posterior a marketingfalse. Mantener saveVersioned y captura de borradores del plan manual.
- [ ] Repetir tests nuevos y regresiones de contacts/public/emailadmin. Confirmar ausencia de datos personales en DTO/logs y que tablas no se unen por rawemail. Preparar revisión futura de este tramo sin afirmar que el contenido manual ya esté cargado o que el producto esté implementado.

### Task2: fence de envío sin bypass en AUT17

**Interfaces:** communicationPermissionGuard con todas revisiones de spec; authorizeCommunicationForSend({outboundId,claimToken,at}) resuelve propósito/ref del mapping servidor y ejecuta CAS provider_started_at. No acepta permiso/purpose falseado del body. Team_summary mantiene settings actuales; nuevas templates requieren outbound_permissions válido. Consumir OutboundPermissionScopeV1/recordOutboundPermissionStatements y tablas head/members/item_members del spec; digest requiere todos los members y cobertura real de cada item, con un único fence de head.

- [ ] Añadir `digest_all_members_need_current_permission`, `digest_item_requires_own_discovery_link`, `same_destination_does_not_inherit_grant`, `revocation_finds_member_outbounds`, `digest_single_head_fence_two_ticks`, `queued_recomposition_is_atomic`, `claimed_digest_is_immutable`, `single_scope_has_one_member`; probar dos suscripciones, una retirada, propiedad compartida y otra exclusiva, sin filtrar ni duplicar correo.
- [ ] Tests P3/P5/P6/P9: nuevo template sin mapping o sin link no llega al binding aunque approved_at exista; propósito falsificado/ID de otro kind no permite send; cambio de notice/policy/destino trasqueue exige revisar snapshot. Callback controlado retira después de claim y antes de fence: cero llamadas provider. Si fence gana y luego llega baja, registrar in-flight/unknown sin recall ficticio. Dos ticks mismo row, replay, suppress→unsuppressABA y idempotencia de baja producen una transición y contador correcto.
- [ ] Tests del proveedor: accepted con acuse/persistencia perdidos=>unknown y sin reenvío; E_RECIPIENT_SUPPRESSED inserta transporte y revisión en mismo batch; quitar transporte no recrea grant/outboundcancelled. Midnight/DST conservan100 intentos díaJersey y política de retries explícitos existente. Settings/globalpause/readiness siguen bloqueando independientemente del permiso por finalidad.
- [ ] Ejecutar `node --test tests/server/communication-send-fence.test.mjs`; esperarRED en casos nuevos.
- [ ] Extender AUTHORIZED actual en selección/UPDATEclaim/SELECTfinal con mapping+guardSQL; conservar todos los guards anteriores. Justo antes de env.EMAIL.send llamar authorizeCommunicationForSend con reloj nuevo, sin await ajeno entre fence y binding. Si no permitido no llamar proveedor; aplicar cancelación/unknown según provider_started_at y carrera, sin devolver falseaccepted.
- [ ] Conectar receipts accepted y revocación a cola existente; conservar dedupe_key, cuotas, attempts y revisiónunknown AUT17. No añadir transporte SMS/Meta ni bypass manual promocional; registrar channel_not_ready hasta implementación/activación real.
- [ ] Repetir pruebas nuevas y `node --test tests/server/email.test.mjs tests/server/email-admin.test.mjs tests/server/email-inbound.test.mjs tests/server/chats-admin.test.mjs`; PASS sin envíos reales ni cambios al chat humano. Prueba de contrato consumidores REG15/REG16: mismos tipos/ref y withdrawal compartida en batch, no segundo ledger.

### Task3: avisos, baja y gates de activación

**Interfaces:** renderCommunicationNotice de spec; copy/configuración los añadirá manualmente Hampton; no se genera texto de relleno ni se construye un circuito de abogado. Notice receipt solo tras accepted y por canal/destino/purpose/version. Baja pública POSTtoken genérica, builder compartido con REG15 y no GET con efectos.

- [ ] Tests P7/P8/P10: primer email no cuenta como primerWhatsApp; queued/unknown no acreditan avisoentregado; agenciafooter obligatorio ausente bloqueaqueue; textoexacto/hash validado y ningún HTML ejecutable. Token válido/usado/caducado misma200sinPII, scopelimitado y no enumeración, sinemail/query/storage/log/referrer; GETprefetch no revoca. Callback de invalidación conserva borrador/foco y401no aplica respuesta tardía.
- [ ] Implementar previews compactos en EmailSettings/Email con estados Awaiting validation/Channel not ready/Withdrawn/Suppressed for email y razones legibles; no dashboard ni segundo editor de consentimiento. Reusar flujo manual previo; añadir solo metadata explícita del comando, sin inventar scope retrospectivo.
- [ ] Integrar enlace público solo si necesario; usar token32bytes/hash/expiry de política y propósito, sameOrigin/no-store, fragmento retirado antes de terceros. REG15 conserva su enlace scoped y llama el mismo builder; no generalizar la baja a noticias o transporte por suposición.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y e2e según harness vigente más nuevo recorrido local. MCPPlaywright1280/390, zoom200%, teclado/foco/carga/vacío/error/parcial, consola/red, dos pestañas y versiones cambiadas. Sin fixtures reales ni lectura de helpers de credenciales.
- [ ] Antes de activar una combinación canal/finalidad, verificar configuración manual completa, copy/notice/alcance, prueba específica/request vigentes y canal activado. Si falta alguno mantener denied/review_required/unsupported, sin campaña ni mensaje real. Revisión independiente, actualización PRE10 por tramo al construir y publicación/migración/activación con autorización separada.

## Presentación al cliente por email

Añadir purpose `client_presentation` para la plantilla futura de AGE11, con RecipientRef contact y snapshot de fotos/revisión final. Es distinto de saved_search_alert y valuation_offer. La política aprobada clasifica la finalidad; no heredar permiso por igualdad de email ni por newslegacy. La plantilla y su transporte de fotos requieren integración AUT17 y revisión humana por presentación; Hermes prepara pero no aprueba/envía por esta aclaración. Probar que template sin vínculo/permiso/actor/revisión vigente no llega al proveedor.

## Renovación de alertas aprobada en Q06

El servicio REG15 vence a seis meses y envía una sola invitación de renovación por ciclo. Añadir purpose saved_search_renewal, RecipientRef saved_search_subscription y autoridad del ciclo previamente confirmado/solicitud de renovación bajo política aprobada. Autorizar la invitación sobre el ciclo vencido elegible no autoriza digests vencidos ni reactiva automáticamente suscripción; requiere no baja/supresión/pausa, dedupe único por ciclo y pre-send guard. Su copy/política y conservación continúan gates separados.

## Cierre de configuración manual

- [ ] Añadir validate/read/saveCommunicationPolicyConfig y GET/PUT privados del spec con expectedRevision; guardar configuración manual y evento en mismo batch. Pruebas: config válida, duplicados, texto/entrada requerida ausente, canal no integrado,401/400/409, CAS de dos empleados y payload sin permiso de cliente. Reutilizar EmailSettings, sin gestor/importador de expedientes o paso de abogado.
- [ ] Confirmar que nombre institucional mostrado sea Hampton Estates LTD y que valuation_offer acepte solo email en esta entrega. Un texto/manualconfig válido no concede el opt-in: mantener los tests de evidencia y retiros.

Plan listo para construir tras dependencias técnicas; introducir datos/manualsettings y activar cada canal son pasos operativos posteriores, no preguntas de diseño abiertas.

## Token único de versión de configuración

`CommunicationPolicyVersion` es un string opaco producido por `communicationPolicyVersion({policy_id,revision,checksum}):string` con formato canónico `${policy_id}:${revision}:${checksum}`. policy_id debe cumplir `[A-Za-z0-9_.-]{1,64}` (sin dospuntos); revision entero positivo serializado decimal sin ceros iniciales; checksumSHA256 hexminúscula64. Los consumidores no lo descomponen ni lo convierten a número. `policy_hash` es exactamente checksum. Un cambio de cualquier componente cambia el token; checksum no se usa como aprobación externa.

`readCommunicationPolicyConfig(env,{at}):Promise<{config:CommunicationPolicyConfigV1,policy_version:CommunicationPolicyVersion,policy_hash:string}>` lee en el mismo DB.batch headappsettings y versión inmutable a la que apunta, valida igualdad de policy_id/revision/checksum y retorna esos tokens. Si no coinciden, error de configuración y ningún permisoallowed. Guardas SQL comparan la expresión canónica de los tres componentes del head con expectedPolicyVersion y la fila inmutable correspondiente; no aceptan comparar solo revision o solo config.version. `saveCommunicationPolicyConfig` calcula revision anterior+1 y checksum en servidor y guarda versión/head/evento juntos, sin confiar el token a un cliente.

readCommunicationPermission propaga exactamente policy_version/policy_hash de ese reader; recordCommunicationGrantStatements y communicationPermissionGuard comprueban contra la misma cabeza vigente. ValuationConsentConfig.communication_policy_version y command.policy_version contienen ese token exacto, mientras config.version solo versiona el texto específico y nunca lo sustituye. Preparadores REG15/PRE12 y PermissionBindingV1 usan la misma convención; no hay token privado alternativo por productor.

Prueba futura `manual_config_head_to_grant_preserves_exact_token`: guardarconfig→reader→permiso→pruebaREG16→buildergrant conserva token/hash; edición del head entre lectura/confirmación409. Añadir IDconseparador inválido, revision string ambigua, checksumdiscordante y bodyinmutableajeno al head:400/configerror sin grant ni llamada al proveedor.
