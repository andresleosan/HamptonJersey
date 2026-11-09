# BUS-20 · Investigación separada de empresas, revisada Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Investigación manual y candidaturas empresariales revisadas.

**Para ejecutar/completar:** Manual según permiso; asistente necesita propósito/claseC1/C2 autorizado y evidencia de fuentes. Asistente investigador sigue sin llaveapp/bot/C3; central Hermes no le presta credenciales. Decisiones: Q02, Q09. Verificaciones: V01, V03, V08, V09. Dependencias: AGE-04/14 para ingreso/supresión; resultado de Hermes sobre acuerdos para asistente.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Preparar un flujo manual y un futuro asistente separado de investigación empresarial con revisión humana antes de entrar al directorio.

**Architecture:** Candidaturas con procedencia y contradicciones, sin llaves de la app/bot ni escritura automática. Contactos C1/C2 requieren carril y abogado; ninguna candidatura es inmueble disponible.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §3](../specs/2026-11-08-list2-connectors-completion-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** Manual disponible con políticas fuente; asistente depende PRE-33 y carril con acuerdo/purpose autorizado. AGE-04/14 para ingreso/supresión. No activar IA de investigación por inferencia.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. JFSC excluida por regla de proyecto; contacto público no C0; dueño/gestor/promotor no equivalentes; dos fuentes contradictorias conservadas; entidad individual no se disfraza de empresa para eludir C2. No listas de particulares ni fuentes compradas.
2. name_only_no_auto_merge; replay_same_candidate_same_preview; changed_payload_409; two_accepts_one_advertiser_link; rejected_same_batch_stays_rejected; suppressed_person_not_reimported; cross_origin_or_nonstaff_denied. Aceptación y alta/enlace atómicos, sin PII en historial genérico.
3. Asistente sin llaves no puede registrar candidatos por puerta Hermes; falta acuerdo o abogado -> solo manual; dato desconocido no inventa dueño o disponibilidad; candidato aceptado no crea match/publicación; rechazo no dispara outreach.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Contrato de candidaturas y fuentes permitidas

**Files:** Create: docs/roadmap/work/BUS-20/candidate-contract.md y manual-review.md; Read: BUS-19 y Property Directory sin modificarlo.

**Interfaces:** CompanyResearchCandidate={candidate_key,entity_kind,organization_name,public_company_ref?,sources,claims,conflicts,status};20candidatos/10fuentes por tanda,10candidatos/página/128KiB,extracto1000chars.

- [ ] Preparar casos concretos: JFSC excluida por regla de proyecto; contacto público no C0; dueño/gestor/promotor no equivalentes; dos fuentes contradictorias conservadas; entidad individual no se disfraza de empresa para eludir C2. No listas de particulares ni fuentes compradas.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Definir formulario y guía manual breve de revisión con evidencia directa y fecha/política de fuente. No visitar webs ni recopilar nuevos contactos en esta planificación. Fuentes y relación de propiedad sin evidencia quedan unknown y sin llamada/campaña.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Revisión manual y entrada idempotente mínima

**Files:** Modify cuando proceda: flujo staff admin/src/Advertisers.jsx; Create condicional por volumen: server/company-research.js, server/routes/company-research.js y tests/server/company-research.test.mjs; Read: AGE-14 tombstones.

**Interfaces:** previewCompanyCandidates(env,page,actor); acceptCompanyCandidate(env,{candidate_key,candidate_version,decision,advertiser_id?},actor). Si UI AGE-04 basta, usar alta/enlace manual existente, sin nuevo importador.

- [ ] Preparar casos concretos: name_only_no_auto_merge; replay_same_candidate_same_preview; changed_payload_409; two_accepts_one_advertiser_link; rejected_same_batch_stays_rejected; suppressed_person_not_reimported; cross_origin_or_nonstaff_denied. Aceptación y alta/enlace atómicos, sin PII en historial genérico.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Evaluar flujo manual con dos ejemplos sintéticos y conservarlo si suficiente. Solo si volumen real lo justifica, implementar endpoints staff/versiones y unicidad en D1, con siguiente migración libre para candidaturas mínimas; no duplicar directorio ni retener corpus entero. Validar supresión antes de sugerir/revisar/aceptar.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Expediente del asistente aislado y aceptación

**Files:** Create: docs/roadmap/work/BUS-20/assistant-boundaries.md y acceptance.md; no tocar runtime de Hermes ni infraestructura.

**Interfaces:** ResearchAssistantApproval={source_policy_versions,data_lane,legal_review_ref,purpose,allowed_outputs,retention,reviewer_role}; ningún secreto Hampton, bot, D1 o C3.

- [ ] Preparar casos concretos: Asistente sin llaves no puede registrar candidatos por puerta Hermes; falta acuerdo o abogado -> solo manual; dato desconocido no inventa dueño o disponibilidad; candidato aceptado no crea match/publicación; rechazo no dispara outreach.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Preparar contrato de entrada/salida privada minimizada, aislamiento y retención por responsable. Antes de construir/activar asistente requiere validación real del abogado/carril y esquema/versiones; transferir candidaturas por staff humano. Registrar manual listo y automatización pendiente sin presentarlos como investigación ejecutada.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task BUS-20, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
