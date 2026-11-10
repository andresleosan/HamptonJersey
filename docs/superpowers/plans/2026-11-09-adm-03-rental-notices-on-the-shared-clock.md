# ADM-03 · Rental notices on the shared clock Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta sesión sólo planifica; otra construye.

**Goal:** Completar avisos internos/reloj; no reconstruye productores integrados ni habilita comunicación externa.

**Architecture:** Extender servicios y tablas propietarios existentes según el diseño, con una sola autoridad de datos, versiones y efectos laterales acreditados. No reconstruir lo ya integrado ni completar dependencias con mocks.

**Tech Stack:** JavaScript ESM, Cloudflare D1/R2, React existente y node:test; sin proveedor/infra nuevo activado. Gestión documental cuando corresponda.

**Spec:** [Diseño de rental](../specs/2026-11-09-rental-lifecycle-completion-design.md); [índice de tanda](2026-11-10-tp05-construction-index.md).

**Preparación:** Contrato definido para el alcance indicado; dependencias técnicas y activación no se suponen integradas.

**Dependencias:** NOT-11, NOT-01, NOT-08

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

## Task 1: Completar productores existentes sin duplicarlos

**Files:**
- Modify: `server/notification-reconcile.js`.
- Modify: `server/routes/rent.js`.
- Modify: `server/routes/rentals.js`.
- Modify: `server/notification-query.js`.
- Test: `tests/server/adm-03-1.test.mjs`.

**Interfaces:** reconcileRentalNotices(env,{at,after,limit:100})->{next,processed}; consume taskStatements(env,descriptor,options) integrado.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `existing_arrears_check_notices_not_duplicated`.
  - `tick_without_panel_creates_due_task`.
  - `same_tick_is_idempotent`.
  - `resolved_check_closes_matching_task_only`.
  - `manual_task_done_is_preserved`.
- [ ] Ejecutar `node --test tests/server/adm-03-1.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Contrastar primero los productores ya integrados en main. Ampliar sólo los avisos que falten, con las claves y episodios del productor común. Usar fechas de Jersey y validar pertenencia de tenancy y reparación. No pasar un work inventado a futureTaskStatements ni copiar información sensible a títulos o eventos.
- [ ] Ejecutar `node --test tests/server/adm-03-1.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Task 2: Reloj, rutas y verificación de pendientes

**Files:**
- Modify: `server/jobs.js`.
- Modify: `server/notification-reconcile.js`.
- Modify: `admin/src/Inbox.jsx`.
- Modify: `admin/src/InboxTask.jsx`.
- Create: `tests/rental-notices.e2e.cjs`.
- Test: `tests/server/adm-03-2.test.mjs`.

**Interfaces:** notificationsPass(env,processingAt) conserva productor común; enlaces rental con context validado.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `job_failure_leaves_retention_and_email_behavior`.
  - `payment_during_pass_cannot_recreate_stale_debt`.
  - `deleted_repair_does_not_leave_actionable_link`.
  - `inactive_tab_stops_polling`.
  - `initial_reconcile_is_bounded`.
- [ ] Ejecutar `node --test tests/server/adm-03-2.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Conservar el único reloj. La gestión interna funciona con correo apagado. Las comunicaciones externas tienen sus propios planes y esperan R01/AUT-17; WhatsApp queda fuera. Registrar qué parte ya estaba integrada y cuál es la ampliación de ADM-03.
- [ ] Ejecutar `node --test tests/server/adm-03-2.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Cierre futuro

**Condición exacta de cierre:** Nuevos avisos reconciliados por SQL/versión, UI y contador coinciden; envío externo se valida separadamente.

- [ ] Reconciliar spec/plan/contratos con main real; comprobar dependencias por código/migraciones/pruebas, no por estado remoto histórico ni nombre deplan. Revisar alcance antes de construir; no usar coordinador por la decisión posterior9nov, no tocarreservasantiguas.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release`. Interfaz: e2e/MCP a1280 y390 con datos sintéticos, teclado, foco, zoom200%, carga, error, conflicto, consola y red. Documentación: validar referencias/estructura sin tests de producto.
- [ ] Registrar evidencia en ledger propio, task/checklist/ESTADO sólo cuando se construya y con estado real; no declarar gestiónexterna/modelo/contrato/correo real comprobado con fixtures.
- [ ] Revisión independiente y correcciones antes de publicación; commit/migración/despliegue requieren autorización aplicable alSHAexacto. Este plan no autoriza ejecución.
