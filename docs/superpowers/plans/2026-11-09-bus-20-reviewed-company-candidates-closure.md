# BUS-20 · Reviewed company candidates Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Sólo planificación aquí; otra sesión construye.

**Goal:** Concretar Investigación manual y candidaturas empresariales revisadas.

**Architecture:** Complemento del plan anterior: ambos se leen juntos. El original define la funcionalidad completa; este cierre fija contratos compartidos, etapas y casos que no pueden suponerse. Reutilizar el servicio dueño sin otro motor.

**Tech Stack:** JavaScript ESM, D1/R2 y React existentes; módulos de repo para runtime sólo cuando se indique, sin instalar servicios en este encargo.

**Spec:** [Diseño de cierre](../specs/2026-11-09-list2-market-contracts-design.md); [plan anterior](2026-11-08-bus-20-separate-company-research.md); [tanda](2026-11-09-list2-build-ready-github.md).

**Estado del plan:** specified. Diseño de código no equivale a activación real ni a terminar el original entero.

**Integrar antes:** AGE-04, AGE-14, BUS-19

**Decisiones pendientes:** Ninguna nueva elección de producto de esta tanda.

## Global Constraints

- Sólo documentos. No código, cuenta, inferencia, envíos, scraping, migración o publicación desde esta sesión. Base4858fdbf7a537990ac63559be8a6ead39884c563; al construir revisar main/contratos/ordinal libre despuésde0036. Protocolo antiguo de reservas retirado; la regla posterior de progreso compartido requiere activity cuando esté disponible. Esta copia devuelve activity_unavailable: planificación local permitida, sin afirmar visibilidad en vivo. Un escritor por copia y turnos para construcción compartida.
- Maestro vigente: Hermes/Pro central y propósitos verificados; C3 nunca Hermes/Pro/Telegram. Meta/WhatsApp/Places-Properties/modeloslocales fuera de esta fase. Ninguna API pagada alternativa automática. Acuerdos los gestiona Hermes con instrucciones existentes; no pedirlos ni buscarlos aquí. L2C01 yL2C02 están resueltas: respuestas de la app y reenvíos seleccionados desde Gmail; derivación humana con un aviso por incidencia si la IA no puede actuar. La dirección concreta se configura por canal privado, no en Git.
- 01:00Jersey para mercado; fotos/permisos/identidad y disponibilidad separados; mascotas MUST cuando existen, parking flexible nuevo sin rebajar MUST confirmado. Presentación exige revisión extra y enlace hasta revocación; no heredar ese enlace para otros datos. Código, dependencia integrada, cobertura y activación son estados distintos.
- Seguridad: staff/same-origin/no-store, CAS/revisión, operation_id, actor/origen por servidor, enums y pertenencia. Sin PII/prompts en logs/storage/Telegram/jobs90días. Contenido conserva retención de origen. Límites JSON128KiB/listas50, polling30s sólo visible, sin URL/fetch/SQL arbitrarios del modelo.
- Panel: ink#141414,paper#ffffff,mist#f2efe9,line#e2ddd4,stone#6b665e,bronze#8a6a3b,ok#1f6b3a,err#a32020,warn#fff6e5. TenorSans26/19px,Montserrat14px/1.5,label12px,1240/gutter16,card24/r14,inputr10,button10x20/r999,celdas10x12,reflujo760,foco2offset2,contraste4.5/3,zoom200/reducedmotion.44pxmóvil propuesta local. Inglés/labels/status/alert y carga/vacío/parcial/error/conflicto. Widget conserva CSS de chat; documentación sin UI no requiere prueba visual.
- Ponytail reutiliza reloj/correo/NOT11; impeccable/antislop mantiene feedback y controles concretos. Seguridad valida fronteras/PII; rendimiento usa SQL/cursor/stream sin librerías nuevas. Taste/redesign no aplican a continuidad de estas pantallas. Ninguna prueba de un fake acredita canal o proveedor real.

## Review Focus

1. Versión, caso o canal equivocados: rechazar sin efectos ni datos de otro sujeto.
2. Respuesta tardía, borrado o revocación: no restaurar datos o permisos antiguos.
3. Duplicado y resultado incierto: no repetir efectos ni llamadas al modelo.
4. Ausencia de datos o evidencia: unknown/pending, nunca éxito, permiso o mercado vacío.
5. Activación real: pruebas locales y diseño no demuestran cuenta, cobertura, recepción o latencia.

## Task 1: Candidatos con procedencia y revisión

**Files:**
- Create: `server/company-research.js`.
- Modify: `admin/src/Advertisers.jsx`.
- Create: `docs/roadmap/work/BUS-20/candidate-contract.md`.

**Interfaces:** previewCompanyCandidates(env,page,actor); acceptCompanyCandidate(env,{candidate_key,candidate_version,decision,advertiser_id?},actor).

**Test:** `tests/server/bus-20-closure-1.test.mjs`.

- [ ] Escribir casos de comportamiento con estas aserciones:
  - `owner_manager_developer_not_equivalent`.
  - `jfsc_source_rejected`.
  - `public_contact_not_c0`.
  - `conflicting_claims_preserved`.
  - `tombstone_blocks_reimport`.
- [ ] Ejecutar `node --test tests/server/bus-20-closure-1.test.mjs` y verificar fallo por comportamiento ausente, no por el entorno.
- [ ] Implementar la interfaz del servicio dueño: Priorizar alta y vínculo de AGE-04. Sólo añadir módulo si hacen falta candidaturas versionadas, sin otro importador general. Máximo20candidatos y10fuentes por tanda;10porpágina yextracto1000caracteres. Una persona revisa antes del alta.
- [ ] Ejecutar `node --test tests/server/bus-20-closure-1.test.mjs` y regresiones del módulo; todos los casos deben pasar con fixtures locales sintéticos.
- [ ] Revisar diff y registrar commit de archivos concretos tras validación; nunca añadir secretos, datos reales o relevo privado.

## Task 2: Asistente aislado yresultadoaceptable

**Files:**
- Create: `docs/roadmap/work/BUS-20/assistant-boundaries.md`.
- Create: `server/company-research.js`.

**Interfaces:** ResearchAssistantApproval={source_policy_versions,data_lane,legal_review_ref,purpose,allowed_outputs,retention,reviewer_role}.

**Test:** `tests/server/bus-20-closure-2.test.mjs`.

- [ ] Escribir casos de comportamiento con estas aserciones:
  - `researcher_has_no_app_or_bot_key`.
  - `candidate_never_available_property`.
  - `unverified_lane_no_model_call`.
  - `accepted_candidate_not_outbound_contact`.
- [ ] Ejecutar `node --test tests/server/bus-20-closure-2.test.mjs` y verificar fallo por comportamiento ausente, no por el entorno.
- [ ] Implementar la interfaz del servicio dueño: Investigador sin llavesHampton/bot/D1, sinC3 y sin fuentes prohibidas. Hermes gestiona acuerdos según instrucciones existentes. Si la IA no puede actuar, continuar manualmente con permiso de fuente y aviso único de incidencia, sin afirmar que el asistente está operativo.
- [ ] Ejecutar `node --test tests/server/bus-20-closure-2.test.mjs` y regresiones del módulo; todos los casos deben pasar con fixtures locales sintéticos.
- [ ] Revisar diff y registrar commit de archivos concretos tras validación; nunca añadir secretos, datos reales o relevo privado.


Pruebas adicionales obligatorias de la tarea2: `model_unavailable_hands_to_human`, `same_incident_notifies_once`, `uncertain_dispatch_not_retried`.

## Decisiones confirmadas ·9-nov-2026

L2C01: Messages recibe respuestas de correos de la app y reenvíos seleccionados del Gmail elegido. No se conecta todo el buzón ni se importa su historial por esta elección. La dirección concreta queda sólo en el relevo privado y en la futura configuración autorizada. L2C02: si la vía no está verificada, la IA está caída o alcanza su límite, continuar mediante el equipo con un aviso único por incidencia. No esperar una respuesta fabricada ni contratar otra API. Unknown después de dispatch se concilia antes de cualquier nueva operación.

## Cierre de construcción futuro

**Aceptación completa:** Candidaturas y continuación manual definidos. El asistente necesita propósito, vía y permiso acreditados; ninguna candidatura equivale a inmueble disponible.

- [ ] Reconciliar este complemento, plan anterior y main real. Entregar la funcionalidad pendiente completa; no limitarse a añadir un test o una interfaz vacía. Las verificaciones externas permanecen identificadas hasta acreditarse.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, teclado/foco/zoom200%, éxito/validación/vacío/error/conflicto, consola/red. Sólo documentación: revisar estructura/enlaces/evidencias, sin tests de producto.
- [ ] Registrar evidencia de tarea/ledger y actualizar estado sólo con lo construido, integrado y activado realmente. Borrador no es envío; inferencia propuesta no es decisión humana; recepción técnica no es respuesta útil.
- [ ] Revisión independiente antes de publicación; autorizar SHA y migraciones aplicables. Esta entrega no autoriza construir, instalar o publicar nada.
