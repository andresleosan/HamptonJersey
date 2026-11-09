# AUT-16 · Asistente de Luis sobre fichas públicas Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Asistente privado de Luis sobre fichas públicas/contadores.

**Para ejecutar/completar:** Bot/custodio y dos identidades deLuis verificados; probar consulta/pausa y denegar otra cuenta. Conexión central no autoriza datos personales por Telegram ni acceso de todo el equipo al bot. Decisiones: Q01, Q02. Verificaciones: V03, V06, V08, V13. Dependencias: AUT-13fase1b autorizado; AUT-05; PRE-34 solo bot/gestión aplicables.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Permitir consultas generales de catálogo/estado, borradores públicos y pausa por un bot privado restringido, sin criterios de clientes en Telegram.

**Architecture:** API de búsqueda determinista/proyección C0 y portero que reduce comandos a estructura allowlist antes de cualquier modelo. Token real queda fuera del agente.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §7](../specs/2026-11-08-list2-models-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AUT-13 operativo, PRE-32 o carril aprobado y decisión del bot en PRE-34; correo/Drive son fases aparte, no bloqueo artificial de búsqueda pública.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. draft_or_archived_excluded; private_applicant_filter_rejected; only_hampton_https_links; beds_three_and_parish_filters; no_results_register_link; notifier_denied; output_has_no_contacts_or_staff_notes. Precios y filtros usan semántica del normalizador/matching, no cálculo del modelo.
2. other_user_or_group_denied; forward_and_edited_forward_denied; attachment_voice_contact_denied; email_phone_name_free_text_not_external; local_three_beds_query_structured; allowed_user_cannot_override_origin_or_urls; malicious_listing_text_cannot_pause. No pasar raw free text al modelo tras filtrar solo regex.
3. model_invents_price_or_link_discarded; no_private_client_search; pause_allowed_resume_denied; no_direct_email_send; response_revalidates_listing_unpublished; two_allowed_accounts_one_denied. Sin publicación de IDs/chat/token; Telegram conserva su propia copia.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Búsqueda de fichas públicas con filtros cerrados

**Files:** Create: server/hermes-search.js; Modify: server/routes/hermes.js; Test: tests/server/hermes-search.test.mjs.

**Interfaces:** searchPublicListings(env,{operation,beds_min,parish,budget_max})->{items:[{ref,title,price,url}],register_url}; GET /api/hermes/search solo agent, máximo10, sin applicant_id.

- [ ] Preparar casos concretos: draft_or_archived_excluded; private_applicant_filter_rejected; only_hampton_https_links; beds_three_and_parish_filters; no_results_register_link; notifier_denied; output_has_no_contacts_or_staff_notes. Precios y filtros usan semántica del normalizador/matching, no cálculo del modelo.
- [ ] Escribir esas pruebas en `tests/server/hermes-search.test.mjs` y ejecutar `node --test tests/server/hermes-search.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Reutilizar evaluate/normalización y SQL de fichas publicadas para consultas generales; validar enums/números/rangos antes de consulta y generar URL con host fijo. No usar perfiles de aplicantes ni dar acceso a inventario privado multifuente por compartir ref.
- [ ] Ejecutar `node --test tests/server/hermes-search.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Contrato del portero y parser local

**Files:** Create propuesta en repo: hermes/telegram-guard.mjs y tests/server/telegram-guard.test.mjs; Create: docs/roadmap/work/AUT-16/telegram-runtime-contract.md; montaje VPS fuera de alcance sin autorización.

**Interfaces:** parseLuisCommand(update,{allowed_user_ids,expected_bot})->{action,args}|{denied,reason}; produce status/search/draft(public_ref)/pause; runtime IDs privados y token custodiado fuera del agente.

- [ ] Preparar casos concretos: other_user_or_group_denied; forward_and_edited_forward_denied; attachment_voice_contact_denied; email_phone_name_free_text_not_external; local_three_beds_query_structured; allowed_user_cannot_override_origin_or_urls; malicious_listing_text_cannot_pause. No pasar raw free text al modelo tras filtrar solo regex.
- [ ] Escribir esas pruebas en `tests/server/telegram-guard.test.mjs` y ejecutar `node --test tests/server/telegram-guard.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Implementar módulo puro sin dependencias con allowlist numérica runtime, chat privado y gramática/local parser que solo produce filtros seguros. Si falla comprensión, ayuda fija para reformular/panel, sin llamada externa. Conservar texto crudo fuera de logs/almacenamiento; identidad se comprueba antes de parsear contenido.
- [ ] Ejecutar `node --test tests/server/telegram-guard.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Respuesta derivada y prueba real restringida

**Files:** Create: tests/server/luis-assistant.test.mjs; Modify: runtime Hampton solo en entorno localizado/autorizado; Create: docs/roadmap/work/AUT-16/acceptance.md.

**Interfaces:** renderLuisReply(command,publicResult)->texto fijo/idioma permitido y enlaces validados; invocar modelo opcional solo sobre estructura C0 autorizada, resultado final anclado a datos vigentes.

- [ ] Preparar casos concretos: model_invents_price_or_link_discarded; no_private_client_search; pause_allowed_resume_denied; no_direct_email_send; response_revalidates_listing_unpublished; two_allowed_accounts_one_denied. Sin publicación de IDs/chat/token; Telegram conserva su propia copia.
- [ ] Escribir esas pruebas en `tests/server/luis-assistant.test.mjs` y ejecutar `node --test tests/server/luis-assistant.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Conectar búsqueda/status y acciones explícitas a puerta/custodio, sin MCP/SQL/red libres. Definir limpieza30d y memoria/skills apagadas. Registrar aceptación real desde dos cuentas y denegación de otra después de autorización; no ampliar a correos/Drive ni dar acceso a Hermes2.
- [ ] Ejecutar `node --test tests/server/luis-assistant.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task AUT-16, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
