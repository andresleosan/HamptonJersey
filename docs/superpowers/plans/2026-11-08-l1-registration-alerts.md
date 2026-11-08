# REG-15 requested search alerts (conditional proposal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega autoriza solo planificación; no iniciar implementación. La coordinación conserva la revisión independiente final.

**Goal:** Preparar alertas con dirección confirmada y resumen diario idempotente de casas nuevas.

**Architecture:** Suscripción separada de contacts, criterios compartidos y snapshots en AUT17; servicio off hasta decisiones y activación verificadas.

**Tech Stack:** React19, JavaScript ES modules, Cloudflare Pages/Workers y D1/SQLite; pruebas Node y harness e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1-registration-alerts-design.md).

## Global Constraints

- Base comprobada main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo documentos ahora; construir exige alcance/reserva build y aprobación del diseño según el flujo vigente.
- No cambiar estados del catálogo durante la planificación; las dependencias indicadas son las vigentes, no nuevas filas del catálogo.
- Toda API privada usa rutas autenticadas existentes (flag `true`) y validación servidor; no resolver autorización en el navegador.
- Una lectura fallida no equivale a cero resultados; escrituras obsoletas responden409, desaparecidas404, inválidas400, sin repetir efectos por reintento ciego.
- **UI vigente comprobada, no la cabecera antigua de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, stone `#6b665e`, mist `#f4f3f0`, line `#e3e0da`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, paper `#ffffff`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui 14px/1.5; Tenor Sans/Georgia H1 26px, H2 19px, peso400; labels12px; botones600 12px tracking `.08em`, padding10px20px, radio999px, hoverbronze-dk, disabled opacity`.45`. `.card` padding24px/radio14px/borde1px line/sombra `0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22)`; campos fondo`#fbfaf8`, borde field-line, radio10px, padding9px12px. `.page`1240px padding24px16px120px; `.seg` gap2px/padding3px, botones7px16px; `.inline` gap12px; `.badge`11px/padding3px10px; miniatura72×54/radio8px. Foco2px bronze offset2px. Tabla apila a760px; editor actual a900px. Mantener estos umbrales; para piezas nuevas apilar a760px, sin nuevas fuentes/colores/sombras. Texto normal≥4.5:1; foco/borde≥3:1; estado con etiqueta además del color. Copy público/API/panel en inglés. Reusar `.btn/.card/.seg/.badge/.empty/.warn/.actionbar`; navegación de pestañas con flechas/Home/End; mensajes status/alert; foco restaurado y errores asociados; zoom200%, reduced-motion. Sin librerías nuevas, sin PII en storage/URLs/logs; React escapado, enlaces internos por ID y externos con helpers seguros. Imágenes dimensionadas/lazy, CLS<0.1; sin N+1 ni polling nuevo.

**Web vigente:** `site/index.html`: ink`#151515`, paper`#ffffff`, mist`#f4f3f0`, line`#e3e0da`, stone`#77736c`, bronze`#a56b3d`, bronze-dk`#86542d`, ok`#2f6b4f`, campo`#fbfaf8`; cuerpo Montserrat/Helvetica Neue/Arial15px/1.65; Tenor Sans/Gill Sans/Optima; contenedor1240px, gutter`clamp(16px,4vw,40px)`, sección`clamp(56px,8vw,104px)`, botones13px28px/radio999px, campo13px14px/radio12px, tarjeta16px/grandes24px. En los controles tocados adoptar explícitamente stone`#6b665e`, texto bronce pequeño/fondo de botón hover`#86542d` y borde`#8f8a82` para contraste; son cambios propuestos de pantalla, no tokens públicos globales ya existentes. Mantener `.opts` con radios nativos y foco visible, no chips sin semántica. Tipos de controles/formulario existentes; errores junto a cada dato, aria-invalid/describedby y status/alert. Layout nuevo a760px y revisión390/1280. No ampliar la tipografía hero ni trasladar valores obsoletos de reconciliación. Mantener presupuestos de imagen y carga diferida, ninguna fuente/librería nueva.

## Estado y decisiones previas

Propuesta pendiente de REG15-D1/D3. No ejecutar código definitivo ni presentar diseño acordado. Cadencia08:00 Jersey y límites son defaults técnicos propuestos; actualizar spec/plan con decisiones antes de construir. AUT17 activated condiciona entrega real, no fixtures locales.

## Review Focus

- Prefetch/replay no activa ni revive baja (Task1).
- Petición repetida no enumera direcciones ni consume cuota ilimitada (Task1).
- Baseline, precio cambiado y publicación duplicada no son nueva casa (Task2).
- Baja/pause/versión después de claim y acuse perdido no producen retry ciego (Task3).
- Token/cuerpo no entran en URL pública/log/storage ni exponen identidad (Task4).

## Archivos y frontera

Crear `migrations/0035_l1_search_alerts.sql` propuesta, `server/search-alerts.js`, `server/routes/search-alerts.js`, `site/search-alerts.js`, `tests/server/search-alerts.test.mjs`, `tests/server/search-alert-email.test.mjs`, `tests/search-alerts.e2e.cjs`. Modificar `server/api.js`, `server/applicants.js` (validación pura), `server/email.js`, `server/jobs.js`, `server/email-retention.js`/`server/retention.js` solo según política acordada, `site/index.html` (CTA/dynamic import/estilos), `site/apply.js` (privacidad), `admin/src/Email.jsx` y `admin/src/EmailSettings.jsx` solo para revisión/capacidad existentes. No nuevo backend, librerías o cron por formulario. Nombre de migración sujeto a secuencia antes de construir.

### Task1: suscripción y posesión

**Interfaces:** tipos/firmas y POST/códigos/DTO de spec. Validación pura compartida, UUID/hash/revisión/tokens con ámbito y TTL acordados. Sin contactFK ni contacto ficticio.

- [ ] Test A1/A2/A3/A8: email normalizado, criterio inválido400, nueva/existente/suprimida misma202; ningún cambio contacts/newsletter ni IDs. Turnstile, CSRF y16KiB. Hash solo, token expire/replay/doble confirm/baja luego confirmación antigua no revive; GET sin efectos. Límites concurrentes5IP/h,1confirm/address/day y20confirm global dentro de100 si se mantienen defaults; policyoff si falta conservación.
- [ ] Ejecutar `node --test tests/server/search-alerts.test.mjs`; esperarRED por módulo ausente.
- [ ] Implementar migración/rutas/validador puro, transiciones/tokens atómicos y no-store. Fallos DB genéricos sin dirección; sin email inline ni GET por identidad.
- [ ] Repetir prueba nueva y `node --test tests/server/applicants-validate.test.mjs tests/server/applicants-public.test.mjs`; esperarPASS sin cambios al flujo de duplicados.

### Task2: novedades por motor compartido

**Interfaces:** eligibleAlertListings/prepareSearchAlertDigests de spec, evaluate/requirementsSummary real integrado, readLive/toPublic/lib.shownOnSite y property_key canónica del inventario. No inventar API/productor ni forzar comercial residencial.

- [ ] Test A4/A7/A10: cumple/falla/must desconocido, max0/beds0, moneda/periodo/región, comercial unsupported, foto privada/publicación archivada nunca sale. Baseline, pricechange, misma casa con dos anuncios, revisión criterios sin backfill.0/4/30 casas=>0/4/20 en snapshot,10 pendientes; no MAX_FOUND25 del applicant.
- [ ] Implementar baseline atómico al confirmar y discoveries UNIQUE; páginas50subs/cursor, consultas batch/indexadas. Preparar20 por destinatario/día, agrupar búsquedas sin duplicar propiedad. No acreditar disponibilidad ni enviar en esta unidad.
- [ ] Ejecutar prueba nueva y `node --test tests/server/matching.test.mjs tests/server/requirements-matching.test.mjs`; PASS, querycount acotado y error de lectura distinto de cero.

### Task3: pipeline y carreras

**Interfaces:** templates search_alert_confirm/search_alert_digest, authorizeSearchAlertEmail y dispatchEmail/emailPass existentes; una fila por recipient/day con dedupe_key independiente de revisiones/snapshot, e items atómicos. Actor/revisión de política del sistema solo después de aprobar servicio.

- [ ] Test A5/A6: dos cron/clicks cuota única y cambio de revisión de política no abre otro digest ese día; baja/suppression/pause/criteria revision trasclaim y antes de provider; settings revision caducada; timeout unknown sin retry automático; accepted con acuse perdido no digest nuevo mañana; explícito ratelimit usa política AUT17; readiness false/off no cola/accepted. Medianoche Jersey, DST y tick repetido08:00 generan un resumen.
- [ ] Ejecutar `node --test tests/server/search-alert-email.test.mjs`; esperarRED.
- [ ] Añadir builders escapados y queue autorizada viva en claim/presend; conservar team_summary, otros workflows y 100 global. Extender AUTHORIZED mediante allowlist. Baja queued cancelled/sending unknown, no recall ficticio ni baja newsletter global por baja search.
- [ ] Repetir prueba y `node --test tests/server/email.test.mjs tests/server/email-admin.test.mjs tests/server/email-inbound.test.mjs`; PASS sin servicio real y sin debilitar idempotencia/resumen.

### Task4: web, política y validación

**Interfaces:** `renderSearchAlert(root,{criteria,...helpers})` y `renderSearchAlertConfirmation(root,{token,action})` en site/search-alerts.js; solo tokens/dirección en memoria, router retira token de fragmento antes de terceros. Sin GET por email/listado público.

- [ ] E2E A1–A10 con mailbox fixture: CTA conserva filtros, selección de servicio no newsletter, confirmación explícita y replays genéricos, baja fácil, featureoff sin recoger email, comercial unsupported visible, XSS escapado, tokens fuera de query/storage/logs/referrer. Escáner GET y volver atrás no activan.
- [ ] Implementar UI y copy descriptivo/privacy tras revisión de política; no news preseleccionada, promesa de disponibilidad o followups24h/72h. Fallo de red conserva email solo en memoria sin cachearlo.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y e2e por harness vigente, servidor/base fixtures locales, sin correo externo.
- [ ] MCP Playwright 1280/390, zoom200%, teclado/foco/errores/carga/vacío/parcial, consola/red, carga diferida y no preload privado; CLS<0.1, links seguros y sin PII en historial.
- [ ] Revisión independiente y actualización REG15 hecho/falta/evidencia por tramo. Construcción local no equivale a activación. Entrega real solo con AUT17/política/retención/copy aprobados y destinatario de prueba autorizado. Migración/publicación/activación requieren autorización separada.

## Q06 aprobada: seis meses y una renovación

Luis aprueba alertas durante seis meses, con un único correo de renovación al terminar y detención si el cliente no renueva. Se trata de vigencia del servicio, distinta de plazos de conservación tras baja/no renovación, todavía pendientes. Seis meses son calendario Europe/Jersey desde confirmación/renovación efectiva: conservar hora local y ajustar al último día válido si el mes de destino no tiene el día de origen; guardar vence_atUTC y zona. No traducir a180días fijos.

Al vencer, pasar suscripción active→expired y dejar de preparar/enviar digests para ella, aunque tenga novedades. Emitir una sola invitación de renovación por subscription_id+cycle_id, usando la cola AUT17 y dedupe independiente de día/criterios/política para ese mismo ciclo. Preparar esa invitación es un servicio solicitado ahora por Luis; propósito específico `saved_search_renewal` de PRE10 con política/notice propios, sin reutilizar una autorización de digest ya caducada para saltar permisos. Estado unsubscribed/supresión/pausa impiden invitación; no reintentar unknown ni crear otra invitación porque cambió el día. No recordatorios adicionales de renovación.

Añadir cycle_id/confirmed_at/service_expires_at y estado expired; expires_at de tokens queda separado del vencimiento del servicio. `expireSavedSearchCycles(env,{at,limit:50})` y `prepareSavedSearchRenewal(env,{subscriptionId,cycleId,at})` son funciones propuestas en search-alerts.js, invocadas desde el reloj existente. `renewSavedSearch(env,{token,at})` valida propósito renew/subscripción/revisión/ciclo y estado actual antes de transición; GET no activa. Confirmación explícita con token de un solo uso con vencimiento al deadline fijo24h después de service_expires_at (valor técnico del planificador) abre ciclo nuevo y otros seis meses; no modifica criterios, marketing u otras búsquedas. Token viejo no revierte baja posterior. Si caduca el enlace, el usuario puede solicitar nuevamente el servicio por el flujo público normal; ningún envío adicional automático para recuperarlo.

Renovar revalida requisitos/política/destino y crea baseline sobre inventario actual sin mandar como nuevas casas del pasado. Periodo no renovado no es actividad de otro contacto ni cierre de búsquedas de applicants. Datos/evidencias tras expiración se conservan o eliminan según configuración finita validada de Q07, cuya decisión ya está cerrada; no asumir que seis meses de alertas es también plazo legal de toda evidencia.

Pruebas futuras:29–31delmes/clamp/DST mantienen seis mesescalendario; expiry impide digest ya queued en claim/pre-call; dos ticks crean una sola invitación por ciclo; usuario que no renueva queda expired y sin alertas; renovación doble retorna mismo ciclo sin reiniciar dos veces; baja posterior gana a token antiguo; invitaciónfallida/unknown no duplica; nuevo ciclo no manda inventario previo como recién descubierto. Todo esto es diseño futuro, no ejecución de correo o limpieza.

Cierre de entrevista: implementar junto con la ampliación search-alert-readiness, que fija seis meses, renovación única y retención configurable validada antes de activar. No solicitar nuevas decisiones sobre proveedor o abogado para construir el núcleo ya delimitado.

## Ventana finita de renovación y ancla de limpieza

La vigencia de digests acaba exactamente en service_expires_at. Para cada ciclo, persistir `renewal_deadline_at=service_expires_at+24horas` (ventana técnica del planificador, no período legal), sin ampliarla por envío tardío, GET, error, unknown o reintento. La única invitación se prepara e intenta dentro de esa ventana; tokenexpires_at es renewal_deadline_at, nunca later. Si el reloj se recupera después del deadline, marcar intento no realizado/operativo para revisión interna y no mandar una nueva invitación automática fuera de ventana. Ninguna ausencia de respuesta extiende alertas.

Tabla propuesta `search_alert_cycles(subscription_id,cycle_id,confirmed_at,service_expires_at,renewal_deadline_at,stopped_at,stop_reason:'unsubscribed'|'not_renewed'|'renewed'|null,state:'active'|'renewal_pending'|'stopped'|'renewed')`, PK(subscription_id,cycle_id), con FK y enlace de tokens al ciclo. La suscripción stateexpired durante renewal_pending sigue sin digest. Baja explícita en cualquier momento fija stopped_at=at de baja y stop_reasonunsubscribed, invalida tokens/cancela invitaciónqueued en el mismo batch; ningún token viejo la revive.

Sin baja y sin renovar, stopped_at se fija lógicamente a renewal_deadline_at al terminar esa ventana, aunque la pasada de limpieza llegue después; stop_reasonnot_renewed. Antes del deadline, stopped_at de ese ciclo permaneceNULL pero el límite es persistido y finito. Retener únicamente email/criterios/prueba/token mínimos que hacen posible esta renovación hasta ese deadline; una retención configurada0 se aplica desde stopped_at y no borra antes datos necesarios de la invitación/confirmación. Los pins de esa renovación vencen exactamente en deadline y no se extienden por un intento desconocido. El transporte conserva sus propios metadatos según configuración del dominio, no promete que borrar la suscripción borre correos ya entregados.

Confirmar antes del deadline verifica estado/revisión/ciclo/token en el batch; consume token, marca ciclo viejo renewed con stopped_at=instante de confirmación y stop_reason=renewed, invalida los demás tokens viejos y crea ciclo activo nuevo con nueva prueba/permiso y seis meses desde confirmación. Un stopped_at de un ciclo viejo nunca autoriza borrar PII que usa el ciclo nuevo. Cleanup de datos de la suscripción solo actúa si no hay ciclo activo o ventana de renovación vigente y el último ciclo detenido cumple sus plazos configurados; prueba histórica por ciclo usa su ancla y referencias reales, sin arrastrar dependencias hacia pruebas ya borradas. El ciclo nuevo conserva su propia evidencia actual.

Pruebas futuras `expiry_retention_zero_keeps_renewal_until_deadline`, `explicit_unsubscribe_zero_invalidates_token_immediately`, `renewal_before_deadline_creates_one_new_cycle`, `deadline_stopped_at_zero_cleanup`, `late_tick_does_not_extend_window`, `old_cycle_stop_cannot_delete_active_subscription`, `unknown_invitation_cannot_extend_pins`. Afirmar0digests desde expiry,≤1invitaciónporciclo, enlace usable antes de deadline y no usable después; dobleconfirmación y baja concurrente no crean otro ciclo.
