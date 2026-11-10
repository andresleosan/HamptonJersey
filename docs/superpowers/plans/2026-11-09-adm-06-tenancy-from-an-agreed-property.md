# ADM-06 · Tenancy from an agreed property Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta sesión sólo planifica; otra construye.

**Goal:** Vínculo humano desde Let agreed, contrato único e inventario con evidencia.

**Architecture:** Extender servicios y tablas propietarios existentes según el diseño, con una sola autoridad de datos, versiones y efectos laterales acreditados. No reconstruir lo ya integrado ni completar dependencias con mocks.

**Tech Stack:** JavaScript ESM, Cloudflare D1/R2, React existente y node:test; sin proveedor/infra nuevo activado. Gestión documental cuando corresponda.

**Spec:** [Diseño de foundation](../specs/2026-11-10-tp03-case-evidence-design.md); [índice de tanda](2026-11-10-tp05-construction-index.md).

**Preparación:** Contrato definido para el alcance indicado; dependencias técnicas y activación no se suponen integradas.

**Dependencias:** EST-17; ADM-18-capabilities (componente independiente) y evidencia externa revisada.

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

## Task 1: Preparación y commit del origen del contrato

**Files:**
- Create: `server/tenancy-origins.js`.
- Modify: `server/routes/rent.js`.
- Create: `migrations/<ordinal_libre>_tenancy_origins.sql`.
- Test: `tests/server/adm-06-1.test.mjs`.

**Interfaces:** prepareTenancyFromAgreement(env,{listing_id,applicant_id,expected_listing_at,expected_applicant_at},actor)->{preview,source_versions,eligible}; commitTenancyOrigin(env,{rental_id,source_versions,tenancy_draft,operation_id},actor)->{tenancy_id,replayed}.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `external_listing_cannot_become_managed_by_inference`.
  - `stale_let_agreed_409`.
  - `double_commit_one_tenancy_and_ref`.
  - `active_tenancy_blocks_second`.
  - `manual_new_tenancy_unchanged`.
- [ ] Ejecutar `node --test tests/server/adm-06-1.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: El empleado selecciona los vínculos; no unir por domicilio o nombre parecido. Ejecutar las guardas y la creación existente del contrato en un batch. Conservar collect_from, opening_balance, referencia HE-T y generación idempotente de cobros. Extraer el helper necesario sin crear otro motor ni convertir una ficha externa en gestión de Hampton.
- [ ] Ejecutar `node --test tests/server/adm-06-1.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Task 2: Contrato e inventario de entrada

**Files:**
- Create: `server/tenancy-origins.js`.
- Create: `server/routes/tenancy-origins.js`.
- Modify: `server/api.js`.
- Create: `admin/src/RentalOrigin.jsx`.
- Modify: `admin/src/RentalDetail.jsx`.
- Modify: `admin/src/App.jsx`.
- Test: `tests/server/adm-06-2.test.mjs`.

**Interfaces:** POST /admin/tenancy-origins/preview; POST /admin/tenancy-origins/commit; saveEntryInventory(env,{tenancy_id,expectedRevision,rooms,meter_readings,evidence_refs},actor)->{inventory_id,revision}.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `preview_has_no_side_effects`.
  - `refs_belong_to_correct_tenancy`.
  - `signed_file_not_replaced_by_date`.
  - `meter_reading_units_are_explicit`.
  - `draft_preview_does_not_publish_listing`.
- [ ] Ejecutar `node --test tests/server/adm-06-2.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Antes de confirmar, presentar origen, partes, condiciones y referencias externas revisadas. El inventario tiene versión, estancias, observaciones y lecturas con unidad. Una fecha no sustituye un contrato firmado. Registrar evidencia de una firma externa no requiere integrar un proveedor de firma; la elección de fase corresponde a ADM-19/R02.
- [ ] Ejecutar `node --test tests/server/adm-06-2.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Cierre futuro

**Condición exacta de cierre:** Origen transaccional, referencias externas e inventario estructurado completos; no depende de proveedor de firma para registrar documento firmado fuera.

- [ ] Reconciliar spec/plan/contratos con main real; comprobar dependencias por código/migraciones/pruebas, no por estado remoto histórico ni nombre deplan. Revisar alcance antes de construir; no usar coordinador por la decisión posterior9nov, no tocarreservasantiguas.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release`. Interfaz: e2e/MCP a1280 y390 con datos sintéticos, teclado, foco, zoom200%, carga, error, conflicto, consola y red. Documentación: validar referencias/estructura sin tests de producto.
- [ ] Registrar evidencia en ledger propio, task/checklist/ESTADO sólo cuando se construya y con estado real; no declarar gestiónexterna/modelo/contrato/correo real comprobado con fixtures.
- [ ] Revisión independiente y correcciones antes de publicación; commit/migración/despliegue requieren autorización aplicable alSHAexacto. Este plan no autoriza ejecución.


## Contrato vigente de continuidad TP-05

[Forma exacta de referencias, dependencias y aceptación](../specs/2026-11-10-tp05-continuity-scope-design.md). Prevalece sobre la redacción histórica incompatible: no repositorio/archivos/llaves/bancos ADM-05 ni comisiones OFE-08. No nuevo servicio de documentos bajo otro nombre.
