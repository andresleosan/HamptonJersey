# AGE-12 · Acceso y respuesta acotados al cliente sin repetir su solicitud Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Grant/enlace/sesiones y respuesta acotada.

**Para ejecutar/completar:** Enlace sin caducidad hasta revocación; parent revocation invalida sesiones; canje POST y no interés en GET. PRE-12 necesario solo para portal general completo. Decisiones: Q10. Verificaciones: V03. Dependencias: AGE-10; REG-17 preferencias; EST-13 estados; contrato de presentación que consumirá AGE-11.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Acceso y respuesta acotados al cliente sin repetir su solicitud.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AGE-10/REG-17/EST-13; PRE-12 queda explícita para declarar portal completo.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Grant y sesión: casos enumerados en tarea1.
2. Respuestas explícitas: casos enumerados en tarea2.
3. Página privada: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Grant y sesión

**Files:** server/presentation-access.js; migración presentation_grants/sessions/responses; prueba `tests/server/presentation-access.test.mjs`.

**Interfaces:** createPresentationGrant(env,{presentation_id,applicant_id,expires_at:null},actor); revokePresentationGrant; getPresentedOptions(env,grant).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] hash_only, dormant_link_denied, active_after_send_only, unknown_send_inactive, bootstrap_redeemable_until_revoked, session_7d_redeem_same_valid_link, revoke_all_sessions, other_client_denied. 256bits y expires_at:null hasta revocación del equipo; sesiones técnicas máximo7días renovables usando el mismo enlace vigente; grant dormant antes del envío para incluir enlace. Token en fragmento eliminado antes de recursos; canje POST same-origin a cookie HttpOnly/Secure/SameSite, no analytics/log/storage/referrer; rate limit y error genérico.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/presentation-access.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Respuestas explícitas

**Files:** server/routes/presentations.js; server/api.js; server/presentation-access.js; prueba `tests/server/presentation-responses.test.mjs`.

**Interfaces:** recordPresentationResponse(env,grant,{presentation_id,version,choice,reason}); POST /api/presentations/respond.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] GET_prefetch_no_action, not_for_me_only_own_match, visit_request_not_appointment, criteria_unchanged, revoked_during_post_rollback, double_click_single_response. interested/request_viewing/not_for_me/call_me; grant/versiones y scope en transacción. Reutilizar franjas REG-17, no confirmar visita ni cerrar búsqueda.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/presentation-responses.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Página privada

**Files:** site/presentations.html; site/presentations.js; site/presentations.css; tests/age12-e2e.cjs; prueba `tests/presentation-page.test.js`.

**Interfaces:** Página con opciones enviadas y POST explícito de elección.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] no_third_parties, no_personal_storage, revoked_or_deleted_generic, no_shared_cache, keyboard_mobile, no_full_application_form. Identidad compacta del spec, inglés, no-store/no-referrer y tamaños de medios. Canal existente de derechos, no inventar descarga/borrado PRE-12; dejar pendiente portal completo. Checks/MCP con dos clientes, revoke y respuesta retenida.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/presentation-page.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de AGE-12 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.



## Precisión de integración · Grants de visita (tanda posterior)

El [diseño de visitas](../specs/2026-11-08-viewings-coordination-design.md) §9 añade un consumidor distinto: VIS-17 posee createViewingGrant/resolveViewingScope para reservas generales sin presentation_id/applicant_id. Extraer mecánica de tokens/sesiones a server/private-access.js conservando API/audience de presentación; audience viewing no permite ver matches u opciones privadas de presentación. No crear una presentación ficticia para enviar recordatorio/feedback. Revocación del parent de presentación, cuando exista, invalida acceso hijo. Revisiones de propuesta se verifican por VIS-17; enlace hasta revocación y sesiones técnicas7días se conservan. Coordinar alcance compartido antes de construir; esta nota no implementa el helper ni modifica permisos ahora.
