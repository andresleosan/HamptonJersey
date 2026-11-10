# PRE-32 · Pro route verification Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Sólo planificación aquí; otra sesión construye.

**Goal:** Concretar Expediente de conexión central Pro y tratamiento.

**Architecture:** Complemento del plan anterior: ambos se leen juntos. El original define la funcionalidad completa; este cierre fija contratos compartidos, etapas y casos que no pueden suponerse. Reutilizar el servicio dueño sin otro motor.

**Tech Stack:** JavaScript ESM, D1/R2 y React existentes; módulos de repo para runtime sólo cuando se indique, sin instalar servicios en este encargo.

**Spec:** [Diseño de cierre](../specs/2026-11-09-list2-model-message-contracts-design.md); [plan anterior](2026-11-08-pre-32-hermes-plan-decision.md); [tanda](2026-11-10-tp05-construction-index.md).

**Estado del plan:** external_verification. Diseño de código no equivale a activación real ni a terminar el original entero.

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

## Task 1: Expediente y dueño por requisito

**Files:**
- Create: `docs/roadmap/work/PRE-32/list2-verification.md`.

**Interfaces:** Verification={requirement,scope,phase,status,checked_at,responsible_ref,evidence_ref,version}.

- [ ] Preparar el expediente concreto: El responsable comprueba vía, controles y condiciones de la conexión centralPro. Hermes gestiona los acuerdos según instrucciones existentes. Registrar ámbito, fecha y estado; no buscar contratos, pedir credenciales, enviar mensajes o configurar cuentas desde este encargo.
- [ ] Revisar estos criterios de evidencia: unknown_not_verified; no_credentials_in_public_record; agreements_assigned_not_approved. No ejecutar cuentas/envíos desde este encargo documental ni escribir pruebas artificiales para un formulario de verificación.
- [ ] Registrar resultado desconocido/pendiente hasta comprobación real autorizada; conservar responsable, fecha, versión y límite de alcance sin secretos.

## Task 2: Resultado y puertas por fase

**Files:**
- Create: `docs/roadmap/work/PRE-32/list2-acceptance.md`.

**Interfaces:** ActivationDecision={phase,purpose,allowed_classes,policy_version,actual_evidence_ref,status}.

- [ ] Preparar el expediente concreto: Documentar evidencia privada y un estado público mínimo. Incluir entrenamiento, uso central/desatendido y propósitos permitidos; la latencia se verifica para el consumidor que la necesite. Si la vía preferida resulta incompatible, volver a Luis con alternativas concretas, sin sustituir proveedor automáticamente.
- [ ] Revisar estos criterios de evidencia: human_chat_not_blocked_by_model_absence; c3_not_authorized_by_general_contract; old_provider_choice_not_reactivated. No ejecutar cuentas/envíos desde este encargo documental ni escribir pruebas artificiales para un formulario de verificación.
- [ ] Registrar resultado desconocido/pendiente hasta comprobación real autorizada; conservar responsable, fecha, versión y límite de alcance sin secretos.

## Cierre de construcción futuro

**Aceptación completa:** Resultado real del responsable; plan/suscripción no equivale a permiso de integración.

- [ ] Reconciliar este complemento, plan anterior y main real. Entregar la funcionalidad pendiente completa; no limitarse a añadir un test o una interfaz vacía. Las verificaciones externas permanecen identificadas hasta acreditarse.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, teclado/foco/zoom200%, éxito/validación/vacío/error/conflicto, consola/red. Sólo documentación: revisar estructura/enlaces/evidencias, sin tests de producto.
- [ ] Registrar evidencia de tarea/ledger y actualizar estado sólo con lo construido, integrado y activado realmente. Borrador no es envío; inferencia propuesta no es decisión humana; recepción técnica no es respuesta útil.
- [ ] Revisión independiente antes de publicación; autorizar SHA y migraciones aplicables. Esta entrega no autoriza construir, instalar o publicar nada.
