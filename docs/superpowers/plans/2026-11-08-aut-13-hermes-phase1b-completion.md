# AUT-13 · Hermes fase1b: identidad y despacho seguro Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Identidades agente/avisador, jobs y despacho central de fase1b.

**Para ejecutar/completar:** Cliente real autorizado Pro/custodio, purpose/class/quota y cuentas verificados. API dispatch/snapshot/legacy implementadas y borrador real con humano; módulo listing_text no cubre todos los propósitos. Decisiones: Q01, Q02, Q08, Q09. Verificaciones: V03, V06, V08, V09, V12, V13, V14. Dependencias: AUT-05; PRE-32/vía aprobada; AUT-14 conserva avisador; AUT-15 permisos operativos actuales; PUB-21 D2 preservado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Completar la puerta y fase1b sobre jobs existentes, separando agente/avisador y evitando reinvocaciones de modelo por resultados inciertos.

**Architecture:** Identidades servidor con custodios separados; claim generation/snapshot y dispatch durable antes de invocar. Borrador nunca equivale a publicación ni autoaprobación.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §6](../specs/2026-11-08-list2-models-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** PRE-32 o carril API aprobado, AUT-05, entorno operativo privado autorizado; AUT-14 conserva avisador, AUT-15 drafters y PUB-21 sus imports. Pruebas locales no necesitan activar VPS.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. notifier_cannot_pause_or_claim; role_header_cannot_escalate; notifier_poll_not_agent_health; agent_cannot_read_imports; invalid_route_not_heartbeat; redirect_not_followed. Identidad legacy conserva compatibilidad solo con alcance revisado y fuera de jaula C0; nunca asumir que el viejo secreto queda revocado por editar config.
2. two_claims_one_winner; old_generation_409; same_draft_idempotent_other_hash_409; accepted_dispatch_lost_ack_no_model_retry; late_grant_discarded; crashed_before_call_stays_uncertain; expired_lease_dispatched_not_reclaimed; never_dispatched_can_reclaim; source_changes_between_check_and_update_rejected; unknown_requires_staff_reconciliation. Cuota y dispatch atómicos, no token ni prompt en logs.
3. heartbeat_notifier_still_agent_not_connected; stale_draft_use_disabled; unknown_no_retry_button_that_spends; human_pause_only_resume_in_panel. MCP1280/390 teclado/zoom; prueba real futura entrega borrador y uso humano con drafters autorizado, memoria/auto-skills apagadas, conversaciones30d.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Separar identidad y heartbeat en app/custodio

**Files:** Modify: server/routes/hermes.js, server/routes/automations.js, hermes/key-proxy.mjs; Test: tests/server/hermes-identities.test.mjs y tests/server/key-proxy.test.mjs.

**Interfaces:** authenticateHermes(request,env)->{role:notifier|agent|legacy}; secretos distintos y perfiles fijos; hermes_agent/hermes_notifier separados. Legacy solo operaciones históricas explícitas, nunca dispatch/state/outcome/search nuevos. Actualizar heartbeat solo para operación válida autenticada.

- [ ] Preparar casos concretos: notifier_cannot_pause_or_claim; role_header_cannot_escalate; notifier_poll_not_agent_health; agent_cannot_read_imports; invalid_route_not_heartbeat; redirect_not_followed. Identidad legacy conserva compatibilidad solo con alcance revisado y fuera de jaula C0; nunca asumir que el viejo secreto queda revocado por editar config.
- [ ] Escribir esas pruebas en `tests/server/hermes-identities.test.mjs` y ejecutar `node --test tests/server/hermes-identities.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Implementar allowlists exactas método/ruta y claves independientes sin exponerlas a agente. Dejar HERMES_KEY histórico en compatibilidad delimitada hasta migración/revocación autorizada; desplegar app capaz de nuevo perfil antes de cambiar custodios. Mantener existentes hasta confirmar cada consumidor sin ampliar permisos. PUB-21 D2 ya está aprobado: conservar su flujo de carpetas preparadas/limpiadas sin pedir otro permiso; solo una diferencia real de datos/carril requiere resolverla con su dueño.
- [ ] Ejecutar `node --test tests/server/hermes-identities.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Toma, despacho único y resultado con guardia

**Files:** Create: server/hermes-dispatch.js; Modify: server/routes/hermes.js y rutas de aplicar borrador; Create migración aditiva job_model_dispatches y campos claim_generation/input_snapshot/input_hash/result_hash en jobs; Test: tests/server/hermes-dispatch.test.mjs.

**Interfaces:** POST jobs/:id/dispatch {claim_generation,input_hash,operation_key,policy_version}->{granted,dispatch_ref?,state}; GET jobs/:id/state sin texto; POST jobs/:id/outcome {claim_generation,dispatch_ref,state:unknown}; draft exige generación/huella y resultado. AUT-05 statements se incluyen en mismo batch.

- [ ] Preparar casos concretos: two_claims_one_winner; old_generation_409; same_draft_idempotent_other_hash_409; accepted_dispatch_lost_ack_no_model_retry; late_grant_discarded; crashed_before_call_stays_uncertain; expired_lease_dispatched_not_reclaimed; never_dispatched_can_reclaim; source_changes_between_check_and_update_rejected; unknown_requires_staff_reconciliation. Cuota y dispatch atómicos, no token ni prompt en logs.
- [ ] Escribir esas pruebas en `tests/server/hermes-dispatch.test.mjs` y ejecutar `node --test tests/server/hermes-dispatch.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Implementar estados durables e invariantes del §6. Solo primer dispatch válido concede una ejecución; replay nunca vuelve a conceder. Fuente se compara dentro de transacción SQL por campos snapshot/version real, no solo check JS. Draft y dispatch se completan juntos; pausa/política y publicación actual se revalidan. Mantener10min/3intentos/90d y revisar aplicabilidad también en Use this text/guardar. Desplegar campos aditivos antes de cliente nuevo; enforcement apagado solo durante transición documentada, activarlo tras actualizar consumidor y conciliar working antiguos; rama nueva jamás acepta draft legacy sin generación. Probar old_consumer_works_before_cutover y old_draft_denied_after_cutover; retirar flag de bypass al completar transición.
- [ ] Ejecutar `node --test tests/server/hermes-dispatch.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Paquete fase1b y aceptación del borrador

**Files:** Create: docs/roadmap/work/AUT-13/phase1b-deployment.md y acceptance.md; Modify: admin/src/Automations.jsx y admin/src/ListingEditor.jsx para estados identity/unknown/stale; Test: tests/hermes-phase1b-ui.test.js.

**Interfaces:** Agente usa grant inequívoco una vez y jamás permiso guardado tras reinicio; unknown/reconciliar solo panel staff. Custodio y runtime operativo se localizan en entorno autorizado antes de editar, sin rutas de host asumidas.

- [ ] Preparar casos concretos: heartbeat_notifier_still_agent_not_connected; stale_draft_use_disabled; unknown_no_retry_button_that_spends; human_pause_only_resume_in_panel. MCP1280/390 teclado/zoom; prueba real futura entrega borrador y uso humano con drafters autorizado, memoria/auto-skills apagadas, conversaciones30d.
- [ ] Escribir esas pruebas en `tests/hermes-phase1b-ui.test.js` y ejecutar `node --test tests/hermes-phase1b-ui.test.js`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Preparar expediente de despliegue coordinado de claves/perfiles/clientes y rollback sin secretos; verificar aislamiento/red/controles bajo responsable del entorno. Integración de imports fuera de esta tarea y sin retirar el flujo PUB-21 D2 aprobado; datos fuera del carril C0 no se incorporan al agente nuevo. Hermes2 intacto. No añadir Luis al drafters ni activar modelo por este plan; no cerrar por fixture de borrador.
- [ ] Ejecutar `node --test tests/hermes-phase1b-ui.test.js`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

**Entrega técnica obligatoria para nuevos propósitos:** `server/central-model-dispatch.js` posee `runCentralModelTask(env,{task_id,purpose,source_ref,source_version,policy_version,deadline_at},modelClient)` y capability de propósito/clase para el consumidor. BUS-09/MSG-04 son dueños de sus esquemas y contenido. Dispatcher guarda referencias/metadatos mínimos y no cuerpos personales/resultados en jobs90d; borrar/revocar fuente limpia referencias y rechaza callbacks tardíos. `tests/server/central-model-dispatch.test.mjs`: `old_c0_profile_cannot_claim_personal_task`, `policy_revoked_between_claim_and_input`, `source_deleted_cancels`, `late_delivery_rejected`, `usage_unknown_no_second_model_call`, `no_private_content_in_jobs90d`. V14 exige transporte de chat verificado con deadline total9s; no se acredita con el polling C0 existente. Implementar contrato/fake y coordinar adapter real tras V08; no abrir una ruta al VPS ni inventar interfaz de suscripción para aparentar completitud.

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task AUT-13, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
