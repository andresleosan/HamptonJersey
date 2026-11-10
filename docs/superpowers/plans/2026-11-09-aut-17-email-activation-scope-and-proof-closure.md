# AUT-17 · Email activation scope and proof Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Sólo planificación aquí; otra sesión construye.

**Goal:** Concretar Cierre operativo del correo construido, no nuevo motor.

**Architecture:** Complemento del plan anterior: ambos se leen juntos. El original define la funcionalidad completa; este cierre fija contratos compartidos, etapas y casos que no pueden suponerse. Reutilizar el servicio dueño sin otro motor.

**Tech Stack:** JavaScript ESM, D1/R2 y React existentes; módulos de repo para runtime sólo cuando se indique, sin instalar servicios en este encargo.

**Spec:** [Diseño de cierre](../specs/2026-11-09-list2-model-message-contracts-design.md); [plan anterior](2026-11-08-aut-17-email-operational-completion.md); [tanda](2026-11-10-tp05-construction-index.md).

**Estado del plan:** activation_only. Diseño de código no equivale a activación real ni a terminar el original entero.

**Integrar antes:** Contratos actuales y main verificado; sin otro código nuevo obligatorio.

**Decisiones pendientes:** Ninguna nueva elección de producto de esta tanda.

## Global Constraints

- Sólo documentos. No código, cuenta, inferencia, envíos, scraping, migración o publicación desde esta sesión. Base4858fdbf7a537990ac63559be8a6ead39884c563; al construir revisar main/contratos/ordinal libre despuésde0036. Protocolo antiguo de reservas retirado; la regla posterior de progreso compartido requiere activity cuando esté disponible. Esta copia devuelve activity_unavailable: planificación local permitida, sin afirmar visibilidad en vivo. Un escritor por copia y turnos para construcción compartida.
- Maestro vigente: Hermes/Pro central y propósitos verificados; C3 nunca Hermes/Pro/Telegram. Meta/WhatsApp/Places-Properties/modeloslocales fuera de esta fase. Ninguna API pagada alternativa automática. Acuerdos los gestiona Hermes con instrucciones existentes; no pedirlos ni buscarlos aquí. L2C01 yL2C02 están resueltas: respuestas de la app y reenvíos seleccionados desde Gmail; derivación humana con un aviso por incidencia si la IA no puede actuar. La dirección concreta se configura por canal privado, no en Git.
- 01:00Jersey para mercado; fotos/permisos/identidad y disponibilidad separados; mascotas MUST cuando existen, parking flexible nuevo sin rebajar MUST confirmado. Presentación exige revisión extra y enlace hasta revocación; no heredar ese enlace para otros datos. Código, dependencia integrada, cobertura y activación son estados distintos.
- Seguridad: staff/same-origin/no-store, CAS/revisión, operation_id, actor/origen por servidor, enums y pertenencia. Sin PII/prompts en logs/storage/Telegram/jobs90días. Contenido conserva retención de origen. Límites JSON128KiB/listas50, polling30s sólo visible, sin URL/fetch/SQL arbitrarios del modelo.
- Panel: ink#151515,paper#ffffff,mist#f4f3f0,line#e3e0da,stone#6b665e,bronze#a56b3d,ok#2f6b4f,err#a32020,warn#fff6e5. TenorSans26/19px,Montserrat14px/1.5,label12px,1240/gutter16,card24/r14,inputr10,button10x20/r999,celdas10x12,reflujo760,foco2offset2,contraste4.5/3,zoom200/reducedmotion.44pxmóvil propuesta local. Inglés/labels/status/alert y carga/vacío/parcial/error/conflicto. Widget conserva CSS de chat; documentación sin UI no requiere prueba visual.
- Ponytail reutiliza reloj/correo/NOT11; impeccable/antislop mantiene feedback y controles concretos. Seguridad valida fronteras/PII; rendimiento usa SQL/cursor/stream sin librerías nuevas. Taste/redesign no aplican a continuidad de estas pantallas. Ninguna prueba de un fake acredita canal o proveedor real.

## Review Focus

1. Versión, caso o canal equivocados: rechazar sin efectos ni datos de otro sujeto.
2. Respuesta tardía, borrado o revocación: no restaurar datos o permisos antiguos.
3. Duplicado y resultado incierto: no repetir efectos ni llamadas al modelo.
4. Ausencia de datos o evidencia: unknown/pending, nunca éxito, permiso o mercado vacío.
5. Activación real: pruebas locales y diseño no demuestran cuenta, cobertura, recepción o latencia.

## Task 1: Propuesta acotada de recepción

**Files:**
- Create: `docs/roadmap/work/AUT-17/list2-reception-proposal.md`.

**Interfaces:** EmailReceptionDecision={scope,source_mailbox_provider?,routing_method,permissions,backfill_policy,retention,evidence_ref,status}.

- [ ] Preparar el expediente concreto: Preparar el reenvío selectivo desde el Gmail confirmado hacia el receptor autorizado de la app, además de las respuestas de la app. Configuración por el operador y titular mediante su canal privado, sin cambiar el buzón, remitente, MX o credenciales por esta decisión. No backfill masivo ni lectura general de Gmail.
- [ ] Revisar estos criterios de evidencia: existing_mailbox_mx_preserved; no_credentials_in_public_proposal; forwarded_from_not_verified_sender; scope_not_assumed_by_sending_ready. No ejecutar cuentas/envíos desde este encargo documental ni escribir pruebas artificiales para un formulario de verificación.
- [ ] Registrar resultado desconocido/pendiente hasta comprobación real autorizada; conservar responsable, fecha, versión y límite de alcance sin secretos.

## Task 2: Aceptación de correo existente

**Files:**
- Create: `docs/roadmap/work/AUT-17/list2-acceptance.md`.
- Modify: `server/email.js`.
- Modify: `server/email-inbound.js`.

**Interfaces:** EmailActivationEvidence={release_sha,scope,readiness_checks,approved_test_recipient_ref,send_receipt_ref,reply_ref,checked_at}.

- [ ] Preparar el expediente concreto: El operador comprueba bindings, servicio y recepción mediante el canal autorizado. Aprobar el destinatario de prueba antes de enviar, fuera de esta sesión. El resumen del equipo ya construido no implementa todas las plantillas de chat o agencia; no crear otro motor.
- [ ] Revisar estos criterios de evidencia: accepted_not_human_receipt; reply_visible_with_correct_thread; unknown_send_not_retried; scope_includes_only_approved_mail. No ejecutar cuentas/envíos desde este encargo documental ni escribir pruebas artificiales para un formulario de verificación.
- [ ] Registrar resultado desconocido/pendiente hasta comprobación real autorizada; conservar responsable, fecha, versión y límite de alcance sin secretos.


Criterios adicionales de la tarea1: `selected_forwarding_not_full_mailbox_access`, `forwarded_origin_not_auto_verified`, `forwarding_loop_does_not_duplicate`, `no_bulk_history_import`.

## Decisiones confirmadas ·9-nov-2026

L2C01: Messages recibe respuestas de correos de la app y reenvíos seleccionados del Gmail elegido. No se conecta todo el buzón ni se importa su historial por esta elección. La dirección concreta queda sólo en el relevo privado y en la futura configuración autorizada. L2C02: si la vía no está verificada, la IA está caída o alcanza su límite, continuar mediante el equipo con un aviso único por incidencia. No esperar una respuesta fabricada ni contratar otra API. Unknown después de dispatch se concilia antes de cualquier nueva operación.

## Cierre de construcción futuro

**Aceptación completa:** Conservar el motor existente. Activar respuestas de la app y reenvíos seleccionados desde Gmail sólo tras configurar y probar la recepción autorizada, sin cambiar el buzón ni su remitente por inferencia.

- [ ] Reconciliar este complemento, plan anterior y main real. Entregar la funcionalidad pendiente completa; no limitarse a añadir un test o una interfaz vacía. Las verificaciones externas permanecen identificadas hasta acreditarse.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, teclado/foco/zoom200%, éxito/validación/vacío/error/conflicto, consola/red. Sólo documentación: revisar estructura/enlaces/evidencias, sin tests de producto.
- [ ] Registrar evidencia de tarea/ledger y actualizar estado sólo con lo construido, integrado y activado realmente. Borrador no es envío; inferencia propuesta no es decisión humana; recepción técnica no es respuesta útil.
- [ ] Revisión independiente antes de publicación; autorizar SHA y migraciones aplicables. Esta entrega no autoriza construir, instalar o publicar nada.
