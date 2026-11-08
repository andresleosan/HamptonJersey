# REG-15 · Cierre de contratos y preparación de alertas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega solo redacta documentos; no ejecutar ahora.

**Goal:** REG-15 · Cierre de contratos y preparación de alertas.

**Architecture:** Ampliación de los módulos existentes con contratos explícitos y guardas dentro de la transacción. Las dependencias propuestas requieren prueba real antes de integrarse.

**Tech Stack:** JavaScript ES modules, React19, Cloudflare Pages/Workers, D1/SQLite y pruebas Node/e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1b-search-alert-readiness-design.md).

## Global Constraints

Base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`; solo documentos ahora. Construir exige revisión de alcance/diseño, dependencias y reserva build. Publicación/migración se autorizan aparte. No modificar el catálogo por terminar el plan.

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

## Review Focus

- Una dirección con grants diferentes no mezcla consentimiento, Task1.
- Digest agrupado no puede comprobar solo el primer item, Task1/2.
- Falta de conservación no se sustituye por valores indefinidos, Task2.
- Baja tras claim/acuse perdido no genera otro envío, Task2.
- Filtros no soportados no se convierten silenciosamente a residencial, Task2.

## Task1: Integrar autorización por item

**Files:** modificar futuros `server/search-alerts.js`, `server/email.js` y el módulo/tablas de permisos de PRE10. Añadir `tests/server/search-alert-permissions.test.mjs`; no crear otro dispatcher ni otra suscripción.

**Interfaces:** consume funciones y RecipientRef de PRE10; conserva requestSavedSearch/confirmSavedSearch/prepareSearchAlertDigests del plan anterior. Produce vínculos de permiso por item además del dedupe diario.

- [ ] Verificar PRE10 y AUT17 integrados; cotejar firma y esquema exactos, incluidos vínculos de digest multiitem. Usar el contrato cerrado OutboundPermissionScopeV1/recordOutboundPermissionStatements y las tablas head/members/item_members de PRE10; no usar permiso de primera suscripción.
- [ ] Tests `same_email_contact_grant_is_not_alert_grant`, `every_digest_item_needs_live_permission`, `unsubscribe_one_scope_does_not_touch_other_contact`, `revocation_before_claim_rebuilds_or_cancels_digest`, `revocation_after_claim_does_not_resend`, `missing_permission_link_never_calls_provider`; comprobar pruebas independientes por subscriptionrevision.
- [ ] Ejecutar `node --test tests/server/search-alert-permissions.test.mjs` → RED por conexión nueva.
- [ ] Implementar vínculos item→member→discovery con el builder PRE10, guardSQL para todos los miembros y pre-send recheck con un solo fence de head, cancelación/baja atómicas según spec; conservar key única por dirección/día. Un digest claimed no se reescribe durante sending.
- [ ] Ejecutar suite → PASS de fixture; no usar integración de correo real como requisito de prueba local. Commit futuro `feat: enforce permissions for each saved search alert item`.

## Task2: Readiness y gate de retención

**Files:** modificar `server/search-alerts.js` y rutassearchalerts propuestas; crear `tests/server/search-alert-readiness.test.mjs`. Actualizar spec/ledger anterior solo al resolver decisiones concretas, conservando registro histórico.

**Interfaces:** SearchAlertReadinessV1/readSearchAlertReadiness y política versionada del spec; configuración del lado servidor con referencia de aprobación.

- [ ] Tests AR01/06/07/08 y `missing_retention_never_creates_subscription`, `invalid_finite_positive_days_rejected`, `fixture_policy_not_activation_evidence`, `unsupported_scope_does_not_drop_filters`, `unsubscribe_does_not_extend_retention`; cubrir díaJersey/DST, cambios de términos/criterios y acuse perdido.
- [ ] Ejecutar `node --test tests/server/search-alert-readiness.test.mjs` → RED.
- [ ] Implementar gate con lista de razones fijas, sin secretos ni datos privados públicos. Falta un requisito→readyfalse; no aceptar escritura persistente ni mandar confirmación/digest. Conservar criterio/draft solo en memoria según formulario existente.
- [ ] Aplicar D1 y D3 aprobadas: comportamiento del servicio fijado, plazos en campos configurables con validación antes de activar; contenido/copy manual de Hampton. No convertir vigencia6meses en un plazo de borrado de evidencia. Probar flujo completo con política de prueba y correo fixture cuando readytrue local.
- [ ] Ejecutar suitesREG15/PRE10 y e2e del plan anterior → PASS; registrar explícitamente activaciónrealpendiente. Construcción y habilitación continúan separadas.

## Autorrevisión

AR01/07/08→Task2; AR02–05→Task1; AR06→ambas. Esta ampliación resuelve contratos técnicos y deja decisiones de negocio/jurídicas como gates, no añade un consentimiento supuesto por email coincidente.

## Entrega futura

- [ ] Ejecutar las suites focales, `npm test`, `npm run build`, `npm run check:release` y e2e relevante en fixture local, sin tocar producción. Registrar PASS/FAIL real.
- [ ] Para cambios UI, Playwright MCP local1280/390: camino correcto, vacíos, error, permisos, conflicto, teclado/foco/zoom200%, consola/red; corregir hallazgos y repetir solo pruebas afectadas. Para unidad sin UI, registrar no aplica.
- [ ] Revisión independiente; actualizar estado por tramo con evidencia, ledger y relevo privado. Preparar commit con rutas explícitas y SHA revisable, sin publicar ni migrar por inferencia.

Skills y alcance aprobable se detallan en el spec. Las casillas abiertas son trabajo futuro: no constituyen pruebas ejecutadas.

## Actualización Q06: caducidad y renovación del servicio

- [ ] Incorporar estado expired, ciclo y service_expires_at de seis mesescalendarioJersey, distinto de expiración del token; extender migración propuesta REG15 sin reservar número. expiry revoca elegibilidad de digest en prepare/claim/pre-call.
- [ ] Implementar expireSavedSearchCycles/prepareSavedSearchRenewal/renewSavedSearch del spec; una invitación por ciclo vía propósito saved_search_renewal/política aprobada y snapshot de destino. No repetir por día nuevo o unknown. GET nunca renueva, token24h único y baja posterior invalida el anterior.
- [ ] Añadir pruebas de29/30/31mes/DST, dos ticks/unainvitación, no renovación→sin alertas, token viejo vs baja, doble confirmación idempotente, baseline de ciclo nuevo y ausencia de duplicados. Ejecutar con fixture del transporte sin emails reales.

Vigencia de servicio aprobada; conservación posterior sigue pendiente y no se activa producción por estos tests futuros.

## Cierre final de D3

Luis elige dejar configurables los plazos de conservación y exigir su validación antes de activar el servicio. Los campos unsubscribed_pii_delete_after_days y evidence_keep_after_unsubscribe_days son enteros finitos no negativos;0 significa eliminación inmediata de ese grupo al llegar su ancla, y no autoriza eliminar pruebas de otro grupo aún vigente. Cada campo usa stopped_at del ciclo por baja/no renovación, no last_read o emailabierto. Nueva revisión validada se identifica por revision/validated_at/validated_by de servidor; UI público no puede declararse validado. Validación comprueba todos los campos, anclas y excepciones, y nunca rellena un plazo ausente. Cambiar configuración invalida preparación/guard de outbounds afectados sin otra dailykey.

Pruebas futuras: campos ausentes/NaN/negativos/no finitos o validación de otra revisión→serviciooff y0suscripcionespersistentes nuevas/0envíos; configuración completa y validada permite fixture; modificación de una revisión la vuelve no válida hasta guardar validación nueva; baja/no renovación anclan limpieza diferenciada de email/criterios y evidencia. No se borra ni se envía nada durante esta entrevista. Los datos/textos que declara disponibles Luis se añadirán manualmente; no hay solicitud nueva al abogado en el plan maestro.

## Ventana finita de renovación y ancla de limpieza

La vigencia de digests acaba exactamente en service_expires_at. Para cada ciclo, persistir `renewal_deadline_at=service_expires_at+24horas` (ventana técnica del planificador, no período legal), sin ampliarla por envío tardío, GET, error, unknown o reintento. La única invitación se prepara e intenta dentro de esa ventana; tokenexpires_at es renewal_deadline_at, nunca later. Si el reloj se recupera después del deadline, marcar intento no realizado/operativo para revisión interna y no mandar una nueva invitación automática fuera de ventana. Ninguna ausencia de respuesta extiende alertas.

Tabla propuesta `search_alert_cycles(subscription_id,cycle_id,confirmed_at,service_expires_at,renewal_deadline_at,stopped_at,stop_reason:'unsubscribed'|'not_renewed'|'renewed'|null,state:'active'|'renewal_pending'|'stopped'|'renewed')`, PK(subscription_id,cycle_id), con FK y enlace de tokens al ciclo. La suscripción stateexpired durante renewal_pending sigue sin digest. Baja explícita en cualquier momento fija stopped_at=at de baja y stop_reasonunsubscribed, invalida tokens/cancela invitaciónqueued en el mismo batch; ningún token viejo la revive.

Sin baja y sin renovar, stopped_at se fija lógicamente a renewal_deadline_at al terminar esa ventana, aunque la pasada de limpieza llegue después; stop_reasonnot_renewed. Antes del deadline, stopped_at de ese ciclo permaneceNULL pero el límite es persistido y finito. Retener únicamente email/criterios/prueba/token mínimos que hacen posible esta renovación hasta ese deadline; una retención configurada0 se aplica desde stopped_at y no borra antes datos necesarios de la invitación/confirmación. Los pins de esa renovación vencen exactamente en deadline y no se extienden por un intento desconocido. El transporte conserva sus propios metadatos según configuración del dominio, no promete que borrar la suscripción borre correos ya entregados.

Confirmar antes del deadline verifica estado/revisión/ciclo/token en el batch; consume token, marca ciclo viejo renewed con stopped_at=instante de confirmación y stop_reason=renewed, invalida los demás tokens viejos y crea ciclo activo nuevo con nueva prueba/permiso y seis meses desde confirmación. Un stopped_at de un ciclo viejo nunca autoriza borrar PII que usa el ciclo nuevo. Cleanup de datos de la suscripción solo actúa si no hay ciclo activo o ventana de renovación vigente y el último ciclo detenido cumple sus plazos configurados; prueba histórica por ciclo usa su ancla y referencias reales, sin arrastrar dependencias hacia pruebas ya borradas. El ciclo nuevo conserva su propia evidencia actual.

Pruebas futuras `expiry_retention_zero_keeps_renewal_until_deadline`, `explicit_unsubscribe_zero_invalidates_token_immediately`, `renewal_before_deadline_creates_one_new_cycle`, `deadline_stopped_at_zero_cleanup`, `late_tick_does_not_extend_window`, `old_cycle_stop_cannot_delete_active_subscription`, `unknown_invitation_cannot_extend_pins`. Afirmar0digests desde expiry,≤1invitaciónporciclo, enlace usable antes de deadline y no usable después; dobleconfirmación y baja concurrente no crean otro ciclo.
