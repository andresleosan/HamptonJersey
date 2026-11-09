# AUT-05 · Política de datos, carriles y cuota de modelo Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Política central de datos/purpose/cuota y registro mínimo.

**Para ejecutar/completar:** Código de guardias/cuota completo; para invocar Pro falta V08/V09. C1/C2 solo tras evidencia explícita de esa vía/purpose, C3 siempre fuera de Hermes. Decisiones: Q01, Q02, Q08, Q09. Verificaciones: V03, V08, V09, V13. Dependencias: Contratos AUT-09/10; PRE-32 para vía suscripción operativa; no dependencia de PRE-30/AUT-12.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Aplicar una autoridad mínima que impida llamadas de modelo incompatibles con dato, propósito, permiso o cuota.

**Architecture:** Módulo puro de autorización más reserva durable de uso. Los adapters llaman a esa autoridad; AUT-09/10 mantienen fichas/modos y ningún modelo decide permisos.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §2](../specs/2026-11-08-list2-models-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** PRE-32 para carril personal; acuerdo/purpose para API; PRE-30/AUT-12 para plan de empleado. Fakes y denegaciones construibles antes de activación.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. missing_policy_denies; expired_policy_denies; unverified_subscription_c0_only; verified_personal_data_requires_exact_purpose_contract; mixed_class_takes_strictest; forged_client_class_ignored; c3_never_hermes. Comprobar que cada denegación produce cero llamadas de red; no basta borrar email para rebajar clase.
2. default_zero_denies; concurrent_limit_one_grants_once; same_operation_no_second_grant; jersey_midnight_quota; unknown_not_refunded; policy_revoked_before_dispatch_denies. No prompts, input ni output en fila/log. Fecha deriva servidor Europe/Jersey, nunca body cliente.
3. revocation_between_prepare_and_call; disabled_lane_blocks_live_fetch; msg04_does_not_inherit_c0_approval; bus09_excerpt_requires_human_review; unknown_result_does_not_switch_provider. No implementar aquí adaptadores de tareas no integradas; registrar consumidores pendientes.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Autorizar por clase, propósito y vigencia

**Files:** Create: server/model-policy.js; Test: tests/server/model-policy.test.mjs.

**Interfaces:** authorizeModelUse(policy,request,now)->{allowed,reason,lane,policy_version}; request servidor {purpose,data_class,actor_kind,automation_id}.

- [ ] Preparar casos concretos: missing_policy_denies; expired_policy_denies; unverified_subscription_c0_only; verified_personal_data_requires_exact_purpose_contract; mixed_class_takes_strictest; forged_client_class_ignored; c3_never_hermes. Comprobar que cada denegación produce cero llamadas de red; no basta borrar email para rebajar clase.
- [ ] Escribir esas pruebas en `tests/server/model-policy.test.mjs` y ejecutar `node --test tests/server/model-policy.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Implementar evaluación pura con allowlists/versión, estado y valid_until; policy del despliegue autorizado. Conservar campos desconocidos como rechazo y devolver motivo técnico sin contenido del prompt.
- [ ] Ejecutar `node --test tests/server/model-policy.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Reservar cuota y registrar resultado sin contenido

**Files:** Create: server/model-usage.js; Create al construir: migración aditiva con siguiente ordinal libre para model_usage; Test: tests/server/model-usage.test.mjs.

**Interfaces:** reserveModelUsage(env,{lane_id,operation_key,policy_version,local_date})->{granted,state,usage_ref}; modelUsageStatements(env,{lane_id,operation_key,policy_version,local_date,limit,dispatch_ref})->D1PreparedStatement[] permite incluir reserva en batch de AUT-13; finishModelUsage(env,usage_ref,{state,cost_known,cost_minor?}).

- [ ] Preparar casos concretos: default_zero_denies; concurrent_limit_one_grants_once; same_operation_no_second_grant; jersey_midnight_quota; unknown_not_refunded; policy_revoked_before_dispatch_denies. No prompts, input ni output en fila/log. Fecha deriva servidor Europe/Jersey, nunca body cliente.
- [ ] Escribir esas pruebas en `tests/server/model-usage.test.mjs` y ejecutar `node --test tests/server/model-usage.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Definir unicidad lane/operation_key, reserva atómica con cuota/estado y transición terminal compatible con dispatch. AUT-13 incluye statements en su transacción, sin reserva huérfana que parezca autorización de otro job. Coste desconocido sigue unknown, no cero.
- [ ] Ejecutar `node --test tests/server/model-usage.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Conectar consumidores y proyección de uso

**Files:** Modify al construir: server/routes/hermes.js, server/routes/automations.js y consumidores BUS-09/MSG-04 cuando existan; Test: tests/server/model-policy-integration.test.mjs.

**Interfaces:** ModelUseDecision común consumida antes de adapter; Automations recibe vía/contadores/estado, nunca payload o token.

- [ ] Preparar casos concretos: revocation_between_prepare_and_call; disabled_lane_blocks_live_fetch; msg04_does_not_inherit_c0_approval; bus09_excerpt_requires_human_review; unknown_result_does_not_switch_provider. No implementar aquí adaptadores de tareas no integradas; registrar consumidores pendientes.
- [ ] Escribir esas pruebas en `tests/server/model-policy-integration.test.mjs` y ejecutar `node --test tests/server/model-policy-integration.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Conectar módulo a dispatch Hermes y a interfaces concretas presentes; dejar integración de consumidor inexistente como pendiente. Añadir pruebas contractuales de que el caller solo puede usar lane resuelto en servidor, sin selector libre de proveedor en UI.
- [ ] Ejecutar `node --test tests/server/model-policy-integration.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task AUT-05, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
