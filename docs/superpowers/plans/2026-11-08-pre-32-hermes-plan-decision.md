# PRE-32 · Plan y condiciones del Hermes operativo Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **G · Gestión**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Expediente de conexión central Pro y tratamiento.

**Para ejecutar/completar:** Plan/vía elegidos; falta verificar entrenamiento, contrato técnico/desatendido/central, propósitos/clases y acuerdos. Una suscripción no acredita por sí misma permiso de integración. Decisiones: Q01, Q02, Q09. Verificaciones: V08, V09. Dependencias: Respuesta deLuis: Pro, suscripción central; comprobaciones de proveedor/cuenta y resultado deHermes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Dejar un expediente verificable para decidir la vía de modelo de Hampton antes de habilitar fase1b.

**Architecture:** Decisiones separadas de producto/plan, uso para cliente, ejecución desatendida y controles de datos. Una referencia de aprobación habilita política AUT-05; no autentica al agente por sí misma.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §1](../specs/2026-11-08-list2-models-batch-design.md), [índice de tanda](2026-11-10-tp05-construction-index.md).

**Dependencies:** Confirmación de Luis y evidencia de condiciones/controles de cuenta; alternativa API solo si se elige expresamente con acuerdo/presupuesto.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. Plan exacto y producto/integración son campos distintos; desactivar entrenamiento no resuelve permisos comerciales; sesión Codex de desarrollo no demuestra autorización de agente de cliente; ninguna captura/token acaba en Markdown.
2. Suscripción personal habilita como máximo C0/contadores y no cuenta compartida; API no se selecciona al fallar suscripción; C3 no entra a Hermes por ninguna alternativa; Google queda sin conexión no elegida.
3. PRE-32 resuelta no significa fase1b instalada, ni borrador enviado, ni Hermes2 cambiado. Revocación invalida futuros dispatch y deja evidencia mínima; avisador1a sigue sin necesitar modelo.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Lista de comprobaciones sin credenciales

**Files:** Create: docs/roadmap/work/PRE-32/verification-template.md; Read: arquitectura §6.6 y doc oficial enlazado en spec.

**Interfaces:** HermesPlanDecision={plan,product,integration,client_use,unattended_use,data_controls,status,checked_at,evidence_ref,decision_ref}; pending por defecto.

- [ ] Preparar casos concretos: Plan exacto y producto/integración son campos distintos; desactivar entrenamiento no resuelve permisos comerciales; sesión Codex de desarrollo no demuestra autorización de agente de cliente; ninguna captura/token acaba en Markdown.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Preparar ficha vacía y pasos para que Luis o responsable autenticado aporte comprobaciones mínimas. Revalidar documentación oficial vigente antes de marcar condición como verificada; no presentar interpretación del agente como permiso legal.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Alternativas y cambio de política

**Files:** Create: docs/roadmap/work/PRE-32/lane-decision.md; Read: AUT-05 model policy y AUT-13 fase1b.

**Interfaces:** LaneDecision={selected_lane,status,allowed_classes,allowed_purposes,valid_until,approval_ref}; no secreto.

- [ ] Preparar casos concretos: Suscripción personal habilita como máximo C0/contadores y no cuenta compartida; API no se selecciona al fallar suscripción; C3 no entra a Hermes por ninguna alternativa; Google queda sin conexión no elegida.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Documentar tabla de decisión con ramas pendiente/suscripción verificada/API expresamente aprobada. Separar prueba técnica de login de aceptación del tratamiento y del uso desatendido. Registrar propietario del coste y fecha de revisión sin fijar importes no aprobados.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Criterio de cierre y activación independiente

**Files:** Create: docs/roadmap/work/PRE-32/acceptance.md; Modify al ejecutar: docs/roadmap/tasks/PRE-32.json y ESTADO.

**Interfaces:** PolicyApprovalReference para AUT-05/AUT-13; readiness:false si falta cualquier requisito del carril seleccionado.

- [ ] Preparar casos concretos: PRE-32 resuelta no significa fase1b instalada, ni borrador enviado, ni Hermes2 cambiado. Revocación invalida futuros dispatch y deja evidencia mínima; avisador1a sigue sin necesitar modelo.
- [ ] Contrastar cada caso con catálogo, spec y evidencia existente. Para entrega documental no crear tests que solo repitan la plantilla; marcar dato ausente pending y registrar responsable, sin inventar respuesta.
- [ ] Dejar paquete listo para decisión, sin cambiar configuraciones ni activar proveedores. Al obtener la decisión real, enlazar evidencia privada, actualizar estado exacto y pasar solo la rama elegida al constructor.
- [ ] Revisar una muestra sintética de los casos anteriores y el checklist documental: campos/evidencia/estados, enlaces válidos, ninguna decisión externa supuesta ni información privada en archivos públicos. Registrar resultado de revisión, sin atribuir pruebas de producto.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task PRE-32, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
