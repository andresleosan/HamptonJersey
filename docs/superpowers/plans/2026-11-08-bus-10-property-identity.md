# BUS-10 · Property identity Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Identidad física y aliases/fusiones reversibles.

**Para ejecutar/completar:** Unidad/operación separadas; coincidencia solo por dirección no basta; decisiones conservadas al fusionar/deshacer. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: BUS-06 y contrato de observaciones acordado BUS-09.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Este documento no inicia construcción.

**Goal:** Reconocer una propiedad física entre publicaciones conservando fuentes, operaciones y decisiones humanas.

**Architecture:** Extender properties/market_listings de BUS-06 mediante aliases y decisiones lógicas reversibles. Evidencia inequívoca enlaza; señales débiles crean propuestas de revisión, sin eliminar registros ni historial.

**Tech Stack:** JavaScript, D1, React existente, node:test; sin reconocimiento de imágenes ni modelos nuevos.

**Spec:** [Diseño común, contrato4](../specs/2026-11-08-list2-market-batch-design.md); [BUS-06](2026-11-09-list2-build-ready-github.md) y [BUS-09](2026-11-09-list2-build-ready-github.md).

## Global Constraints

- BUS-06 integrado; reconciliar el código recibido antes de crear tablas. No crear una segunda properties ni usar dirección/título como identidad segura.
- Una propiedad puede tener varias operaciones/publicaciones; fusión física no fusiona renta/venta/negocio, términos, consultas ni decisiones de matches.
- Decisiones con actor/fecha/versión/evidencia; sin borrado físico ni reescritura del original. Undo revierte enlaces actuales y conserva el evento.
- Panel: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d no-texto, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. Tenor26/19; Montserrat14/1.5; label12; card24/r14, input r10, button10px20px/r999, controles44px; celdas10px12px y reflujo760; foco2/offset2, teclado y zoom200. DESIGN.md §Colors/Typography/Components y skills comunes del spec.
- API staff/same-origin/no-store; consultas parametrizadas y safeHref; listas50, sin contactos en propuestas de lista ni datos personales en tombstones.

## Review Focus

1. Dos unidades de la misma dirección: prueba tarea1, nunca fusión por dirección sola.
2. Venta y alquiler en la misma URL: prueba tarea1, operaciones distintas.
3. Dos decisiones simultáneas o ciclo de aliases: prueba tarea2, conflicto atómico.
4. Shortlisted y Rejected incompatibles al unir: prueba tarea2, preservar y pedir revisión.
5. Reimportación antigua después de purga futura: prueba tarea3, tombstone mínimo sin PII.

## Tarea 1 · Resolver identidad y registrar candidatos

Archivos: crear `server/market-identity.js`, `tests/server/market-identity.test.mjs`; extender fixtures market-inventory; migración nominal `migrations/0035_market_identity.sql`, usar siguiente ordinal libre real. Leer estructura BUS-06 antes de fijar columnas.

Interfaces: `resolvePropertyIdentity(env,observation) -> Promise<{property_id,proposal_id,method}>`; `IdentityProposal` del spec4.

- [ ] Escribir `three_publications_one_unit`, `same_address_two_units`, `same_url_sale_and_rent`, `reference_scoped_to_source` y `retry_same_identity`; comprobar que fallan antes de servicio.
- [ ] Reutilizar propiedad/identidad estable ya atribuida por BUS-06. URL original acreditada debe identificar esa unidad, no un índice o edificio; evidencia insuficiente produce propuesta, no match por similitud.
- [ ] Crear registro de claves/aliases y propuestas con unicidad por par canónico. No confiar en una URL aportada por un anuncio sin acreditar la relación original.
- [ ] Mantener URL/ref/advertiser/operation por publicación, todos los teléfonos en AGE-04 y observaciones inmutables; variantes de tracking se normalizan solo según reglas específicas comprobadas.
- [ ] Ejecutar `node --test tests/server/market-identity.test.mjs`; comprobar cantidades de propiedades/publicaciones antes/después. Commit de identidad básica.

## Tarea 2 · Decisiones lógicas, concurrencia y reversión

Archivos: ampliar market-identity.js y su test; crear `tests/server/market-identity-decisions.test.mjs`; aliases/historial en la misma migración solo si no se ha aplicado aún.

Interfaces: `decideIdentityProposal(env,id,{version,decision,reason},actor)`; `undoIdentityDecision(env,id,{version,reason},actor)`; decision `same_property | different_properties | needs_review`.

- [ ] Probar `concurrent_decision_conflict`, `alias_cycle_rejected`, `merge_preserves_observations`, `undo_restores_links`, `conflicting_human_matches_need_review`.
- [ ] Aplicar resolución dentro de transacción con versiones de ambas identidades. Resolver raíz canónica sin ciclos ni cadenas infinitas; no borrar IDs antiguos ni reasignar el autor/fecha de evidencias.
- [ ] Mantener decisiones previas al calcular la proyección común. Si existen episodios/matches incompatibles, crear conflicto visible; no escoger automáticamente shortlisted/rejected ni ejecutar envíos.
- [ ] Registrar cambios de identidad como eventos propios para invalidar proyecciones; no presentarlos como propiedad nueva o bajada de precio. Definir referencias de Undo a la decisión exacta.
- [ ] Ejecutar ambos tests de identidad y revisar integridad de claves foráneas/conteos. Commit de revisión reversible.

## Tarea 3 · Identidad mínima tras bajas

Archivos: ampliar market-identity.js; crear `tests/server/market-identity-retention.test.mjs`; consumir contrato EST-19 sin ejecutar su purga.

Interfaz: `findRetainedIdentity(env,{source_id,external_key,operation,observation_revision}) -> Promise<{property_id,status}>`; status `live | historical_tombstone | review_required`.

- [ ] Escribir `old_observation_does_not_resurrect`, `newer_reappearance_needs_review` y `tombstone_contains_no_personal_data`.
- [ ] Conservar solo clave mínima/hash de identidad, operación, fecha/revisión y referencia técnica de baja; no nombres, teléfonos, texto completo o fotos. Preservar evidencia detallada solo según política propietaria existente.
- [ ] La misma observación histórica se reconoce sin reabrir; nueva evidencia crea revisión y respeta EST-15. No implementar un borrado ni plazos de conservación nuevos.
- [ ] Ejecutar `node --test tests/server/market-identity-retention.test.mjs`; cierre de esta parte es compatibilidad de identidad, no aceptación de EST-19.

## Tarea 4 · Revisión staff e integración

Archivos: crear `server/routes/market-identity.js`, `admin/src/MarketIdentityReview.jsx`, `tests/server/market-identity-routes.test.mjs`, `tests/market-identity-ui.test.js`; modificar server/api.js y componente MarketInventory de BUS-06. BUS-03 reutiliza el componente en detalle.

API: GET `/api/admin/market-identity/proposals?cursor=&limit=50`; POST `/:id/decide` y `/:id/undo` con versión/razón. Component props `{propertyId?,onChange}`.

- [ ] Probar401/origen/versión409 y validación de decisión; no permitir IDs de otra clase ni borrar propiedad por la API.
- [ ] Mostrar ambas unidades/publicaciones y evidencia, `Same property`, `Different properties`, `Needs review`, `Undo decision`; ninguna opción preselecciona la fusión.
- [ ] Probar render seguro, foco tras decidir, recuperación409 y pérdida de red sin perder la selección. Reutilizar tokens/layout comunes y textos ingleses.
- [ ] Ejecutar pruebas focales, npm test/build/check:release, e2e y MCP1280/390 con estados/teclado/zoom; verificar tres fuentes/una unidad y dos pisos/una dirección.
- [ ] Revisión independiente futura, actualización BUS-10/checklist/ESTADO/ledger con estado real; no marcar BUS-07, BUS-12 o purga completados. Commit/publicación según autorización constructora.
