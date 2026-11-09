# AUT-04 · Readiness de automatizaciones en Cloudflare Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Proyección de readiness por automatización.

**Para ejecutar/completar:** Código de proyección completo; cierre operativo necesita caso real autorizado, titularidad/config real verificada y WAF del canal afectado. Decisiones: Q02, Q05. Verificaciones: V03, V08, V09, V13. Dependencias: AUT-09/01, AUT-05; PRE-28 y ANA-09 según operación real.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Mostrar requisitos verificables de cada automatización sin confundir pruebas locales, configuración y activación del modelo.

**Architecture:** Proyección de dueños existentes, no otro motor ni nuevo reloj. Política, modo y fichas vienen de AUT-05/10/09; PRE-28 y ANA-09 mantienen sus gestiones.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §8](../specs/2026-11-08-list2-models-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AUT-09/01 integración, AUT-05 modelo; PRE-28 titularidad y ANA-09 WAF según operación real, no para impedir diseño/fakes. Cierre exige caso IA real autorizado.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. missing_not_verified; historical_timestamp_not_current_evidence; local_build_can_be_ready_while_activation_pending; revoked_model_blocks_activation; no_case_activated_no_aut04_complete. Evidencia se obtiene de fuentes servidor autorizadas, no afirmación del cliente.
2. loading_pending_disabled_error_distinct; mode_auto_does_not_bypass_human_gate; quota_zero_not_active; revocation_shows_reason; keyboard_focus_zoom. No nuevo dashboard ni duplicar contadores/interruptores; no turn on desde un link sin permisos.
3. Una tarjeta verde/fake no sustituye automatización IA real; cambio de versión invalida evidencia afectada; falta WAF no exige apagar controles para probar; traslado de cuenta PRE-28 separado de este plan.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Proyección de requisitos por automatización

**Files:** Create: server/automation-readiness.js; Test: tests/server/automation-readiness.test.mjs.

**Interfaces:** getAutomationReadiness(env,automation_id)->{build_ready,activation_ready,requirements:[{key,status,checked_at,evidence_ref}]}; status pending/verified/blocked/revoked.

- [ ] Preparar casos concretos: missing_not_verified; historical_timestamp_not_current_evidence; local_build_can_be_ready_while_activation_pending; revoked_model_blocks_activation; no_case_activated_no_aut04_complete. Evidencia se obtiene de fuentes servidor autorizadas, no afirmación del cliente.
- [ ] Escribir esas pruebas en `tests/server/automation-readiness.test.mjs` y ejecutar `node --test tests/server/automation-readiness.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Mapear por automatización requisitos reales y responsable sin encadenar WAF/traspaso de cuenta a toda entrega local. Fuente unavailable produce pending/error verificable, no verified por timeout. No guardar un boolean global ready que ignore versiones.
- [ ] Ejecutar `node --test tests/server/automation-readiness.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Integrar en Automations actual

**Files:** Modify: server/routes/automations.js, admin/src/Automations.jsx; Test: tests/automation-readiness-ui.test.js.

**Interfaces:** automation.readiness por id fijo de AUT-09; sección Requirements con causa y fecha, sin prompts, secretos o enlaces privados expuestos al público.

- [ ] Preparar casos concretos: loading_pending_disabled_error_distinct; mode_auto_does_not_bypass_human_gate; quota_zero_not_active; revocation_shows_reason; keyboard_focus_zoom. No nuevo dashboard ni duplicar contadores/interruptores; no turn on desde un link sin permisos.
- [ ] Escribir esas pruebas en `tests/automation-readiness-ui.test.js` y ejecutar `node --test tests/automation-readiness-ui.test.js`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Extender tarjeta existente con estado y siguiente paso concreto; respetar valores CSS/labels/foco del spec. Integración de carril fuera de Cloudflare se identifica como tal, sin decir que lo ejecuta Pages. Poll30s solo visible y no-store autenticado.
- [ ] Ejecutar `node --test tests/automation-readiness-ui.test.js`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Expediente de activación y cierre transversal

**Files:** Create: docs/roadmap/work/AUT-04/activation-matrix.md y acceptance.md; Modify al ejecutar: task AUT-04 y ESTADO.

**Interfaces:** ActivationEvidence={automation_id,policy_version,release_sha,checks,actual_run_ref,owner_decision_ref}; datos personales y cuentas concretas en registro privado.

- [ ] Preparar casos concretos: Una tarjeta verde/fake no sustituye automatización IA real; cambio de versión invalida evidencia afectada; falta WAF no exige apagar controles para probar; traslado de cuenta PRE-28 separado de este plan.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Registrar por requisito construido/integrado/configurado/activado y caso autorizado; ejecutar aceptación real solo con permisos del responsable y scope concreto. Mantener pendientes de cuenta/modelo/WAF explícitos, sin declarar cerrada AUT-04 por otras tareas documentadas.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task AUT-04, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
