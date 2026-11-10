# ADM-11 · Rental obligations and evidence Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta sesión sólo planifica; otra construye.

**Goal:** Catálogo de obligaciones y evidencia, sin certificar automáticamente cumplimiento ni enviar avisos externos.

**Architecture:** Extender servicios y tablas propietarios existentes según el diseño, con una sola autoridad de datos, versiones y efectos laterales acreditados. No reconstruir lo ya integrado ni completar dependencias con mocks.

**Tech Stack:** JavaScript ESM, Cloudflare D1/R2, React existente y node:test; sin proveedor/infra nuevo activado. Gestión documental cuando corresponda.

**Spec:** [Diseño de rental](../specs/2026-11-09-rental-lifecycle-completion-design.md); [índice de tanda](2026-11-10-tp05-construction-index.md).

**Preparación:** Contrato definido para el alcance indicado; dependencias técnicas y activación no se suponen integradas.

**Dependencias:** ADM-17, ADM-03; ADM-18-capabilities (componente independiente) y evidencia externa revisada.

**Decisiones pendientes:** Ninguna elección de producto nueva para el núcleo indicado; verificar puertas de activación del spec.

## Global Constraints

- Sólo planificación. Base main comprobada: f0d8eb73905e32b3f283c180cfc12f9149a3cb93. Al construir, revisar contratos reales y escoger el siguiente ordinal libre después de0036; no se reserva un ordinal ahora. Preservar entregas previas.
- Maestro vigente: informes a propietarios excluidos; documentos económicos y contractuales conservan su alcance separado. Meta, WhatsApp, Places/Properties, tours y modelos locales quedan fuera de esta fase. C3 nunca pasa por Hermes/Pro/Telegram. R01/R02/R04/R05 resueltas; R03/R06 cerradas por retirada. PRE-06 incluye Access. El índice TP-05 y maestro vigente prevalecen sobre el estado histórico de esta tanda.
- Sesión, same-origin, no-store, autorización por entidad/capacidad, revisión esperada y operation_id. Sin un nuevo rol owner/staff ni autoasignación de capacidad sensible. Eventos mínimos; ningún dato C3 en logs, localStorage o correo general. R2/D1 se concilian mediante intents, sin prometer atomicidad entre servicios.
- UI del panel: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, ok#2f6b4f, err#a32020 y warn#fff6e5. Tenor Sans26/19px, Montserrat14px/1.5 y label12px; contenedor1240px/gutter16px, card24px/r14, inputr10, botón10x20px/r999 y celdas10x12px. Reflujo760px, foco2px/offset2px, contraste4.5texto/3controles, zoom200% y reduced-motion. Objetivo móvil44px propuesto para esta UI. Inglés, etiquetas/ARIA y estados de carga, vacío, validación, error y conflicto. La parte documental sin interfaz no necesita comprobación visual.
- Ponytail reutiliza AUT-07/AUT-17/NOT-11; impeccable y antislop mantienen controles y feedback concretos. Seguridad valida pertenencia, origen y formatos en servidor. Rendimiento: SQL indexado, lista50/cursor, streaming y sin polling de pestaña oculta. Taste/redesign no aplican a la continuidad de formularios existentes. PDF sólo usa las dependencias justificadas en el diseño; no instalar ahora.

## Review Focus

1. Identidad/capacidad/caso equivocados: denegar sin datos y sin efectos.
2. Versión o respuesta retenida de otra pestaña:409/revalidar, nunca restaurar dato retirado.
3. Repetición/resultado incierto: idempotencia, no doble contrato/envío/ajuste.
4. Datos ausentes/históricos: unknown y evidencia, nunca0/validación ficticia.
5. Efecto externo/financiero: proyección y registro difieren de acuse, cumplimiento o pago real.

## Task 1: Obligaciones con procedencia y ámbito

**Files:**
- Create: `server/rental-obligations.js`.
- Modify: `server/routes/rentals.js`.
- Create: `migrations/<ordinal_libre>_rental_obligations.sql`.
- Test: `tests/server/adm-11-1.test.mjs`.

**Interfaces:** readObligations(env,{rental_id,today})->{items,next}; applyObligationEvidence(env,{id,expectedRevision,evidence_ref,performed_on,delivered_on,reason},actor)->Obligation.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `existing_four_checks_not_duplicated`.
  - `tenant_delivery_differs_from_certificate_date`.
  - `recommended_check_not_shown_as_statutory`.
  - `unknown_due_date_requires_review`.
  - `wrong_case_file_403`.
- [ ] Ejecutar `node --test tests/server/adm-11-1.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Cada obligación conserva regla, disparador, ámbito y evidencia. Los29riesgos forman un checklist versionado y validado, sin certificar cumplimiento por marcar una casilla. Emisión, realización y entrega son fechas distintas. Si falta política o evidencia, mostrar pendiente de revisión, nunca compliant.
- [ ] Ejecutar `node --test tests/server/adm-11-1.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Task 2: Avisos y vista operativa

**Files:**
- Modify: `server/notification-reconcile.js`.
- Modify: `server/notification-query.js`.
- Modify: `shared/notification-categories.js`.
- Modify: `admin/src/RentalDetail.jsx`.
- Modify: `admin/src/InboxTask.jsx`.
- Test: `tests/server/adm-11-2.test.mjs`.

**Interfaces:** rentalObligationDescriptor(obligation,{at})->TaskDescriptor; target rental/context obligation_id con pertenencia comprobada.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `same_obligation_once_in_inbox_and_count`.
  - `60_30_7_boundaries_jersey`.
  - `revoked_ref_invalidates_evidence`.
  - `stale_evidence_update_409`.
  - `cannot_open_other_rentals_obligation_context`.
- [ ] Ejecutar `node --test tests/server/adm-11-2.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Ampliar enum, contexto, guardas y destino de interfaz en el mismo cambio. Usar las tareas integradas. Mostrar fuente, fecha de verificación y estado; diferenciar una alerta administrativa de una certificación. La evidencia de otra vivienda o contrato no sirve para completar esta obligación.
- [ ] Ejecutar `node --test tests/server/adm-11-2.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Cierre futuro

**Condición exacta de cierre:** Reglas/ámbito validados paraactivación, SQL/UI/notices sin duplicados y evidencia inaccesible aotroscasos.

- [ ] Reconciliar spec/plan/contratos con main real; comprobar dependencias por código/migraciones/pruebas, no por estado remoto histórico ni nombre deplan. Revisar alcance antes de construir; no usar coordinador por la decisión posterior9nov, no tocarreservasantiguas.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release`. Interfaz: e2e/MCP a1280 y390 con datos sintéticos, teclado, foco, zoom200%, carga, error, conflicto, consola y red. Documentación: validar referencias/estructura sin tests de producto.
- [ ] Registrar evidencia en ledger propio, task/checklist/ESTADO sólo cuando se construya y con estado real; no declarar gestiónexterna/modelo/contrato/correo real comprobado con fixtures.
- [ ] Revisión independiente y correcciones antes de publicación; commit/migración/despliegue requieren autorización aplicable alSHAexacto. Este plan no autoriza ejecución.


## Contrato vigente de continuidad TP-05

[Forma exacta de referencias, dependencias y aceptación](../specs/2026-11-10-tp05-continuity-scope-design.md). Prevalece sobre la redacción histórica incompatible: no repositorio/archivos/llaves/bancos ADM-05 ni comisiones OFE-08. No nuevo servicio de documentos bajo otro nombre.
