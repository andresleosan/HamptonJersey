# BUS-07 · Legacy agency links Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Vínculos verificados de fichas históricas sin reimportar.

**Para ejecutar/completar:** Universo real conciliado con procedencia/identidad; no cambiar publicaciones/textos/fotos ni permisos por un título histórico. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V04. Dependencias: BUS-10 y AGE-04.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No ejecutar el importador antiguo por leer este plan.

**Goal:** Vincular fichas históricas con propiedad, procedencia y anunciante verificados sin perder datos o ampliar permisos.

**Architecture:** Backfill aditivo y paginado de relaciones. Propuestas trazables y revisión humana de identidades dudosas; nunca reimportación de fichas/fotos ni invención de publicaciones web.

**Tech Stack:** JavaScript, D1, React existente, node:test; JSON técnico para conciliación sin datos personales públicos.

**Spec:** [Diseño común, contrato5](../specs/2026-11-08-list2-market-batch-design.md); [BUS-10](2026-11-08-bus-10-property-identity.md) y [AGE-04](../specs/2026-11-07-age-04-directory-design.md).

## Global Constraints

- Construcción tras BUS-10 y AGE-04 integrados. Tabla de relaciones, no sustitución de listings ni advertiser details.
- No cambiar IDs, published/archived/matchable, textos, fotos, cover, decisiones previas ni derechos históricos. No ejecutar scripts/import_agencies.py: también escribe medios y fichas.
- Título264 no es un recuento fiable; rango028–285 tiene258 IDs posibles. Medir universo y explicar discrepancias con evidencia del paquete/base autorizados.
- Enlaces nuevos a market_sources no se insertan en advertisers.details.source_ids, que referencia research_sources. Una pista media.provider no acredita identidad por sí sola.
- Panel tokens ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d/bronze-dk#86542d/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82; Tenor26/19, Montserrat14/1.5, label12, card24/r14, campo r10, botón10px20px/r999, controles44, celdas10px12px, breakpoint760, foco2/offset2, zoom200. DESIGN.md y skills comunes del spec.
- Staff/same-origin/no-store/versionado, lista50; contactos solo en detalle autorizado. Comisiones no bloquean el enlace; consultar disponibilidad sigue AGE-03, fotos nuevas AGE-10.

## Review Focus

1. Ficha histórica sin URL: tarea1, vínculo necesita revisión sin inventar anuncio.
2. Rango y número del título discrepan: tarea1, universo medido sin cuotas.
3. Reintento duplica anunciante o enlace: tarea2, idempotencia sin merge por nombre.
4. Autorización antigua se extiende a una foto nueva: tarea2, prohibición probada.
5. Edición simultánea sobrescribe un enlace humano: tarea3, conflicto409 y recarga.

## Tarea 1 · Universo y propuestas de backfill

Archivos: crear `server/market-legacy.js`, `tests/server/market-legacy.test.mjs`, `docs/roadmap/work/BUS-07/reconciliation.md`; leer research_properties/research_sources y referencias históricas/paquetes autorizados sin copiarlos a Git.

Interfaz: `buildLegacyLinkProposals(env,{after,limit:50}) -> {items,next_cursor,counts}`. Propuesta devuelve IDs, procedencia y razones; nunca todos los contactos en lista.

- [ ] Escribir `missing_source_url_remains_unknown`, `id_range_not_universe`, `provider_hint_not_verified_advertiser`, `two_units_not_one` y `cursor_stable`.
- [ ] Medir universo por evidencia de importación, IDs presentes y relaciones de investigación; rango solo ayuda al diagnóstico. Publicar conteos agregados y discrepancias, no volcado de fichas o personas.
- [ ] Consultar relaciones existentes y resolver propuestas con BUS-10; ausencia de URL mantiene market_listing_id nulo. Fecha de importación no se cambia por hoy.
- [ ] Ejecutar `node --test tests/server/market-legacy.test.mjs`; comparar IDs antes/después, todavía sin escritura de vínculos confirmados. Commit de propuestas.

## Tarea 2 · Relaciones aceptadas e idempotencia

Archivos: ampliar market-legacy.js y test; crear migración nominal `migrations/0036_market_legacy_links.sql` con siguiente ordinal libre real; pruebas `tests/server/market-legacy-links.test.mjs`.

Interfaz: `applyLegacyLinkDecision(env,listingId,input,actor,expectedVersion)` consume `{property_id,market_listing_id?,advertiser_ids,evidence_refs,status,reason}`; status verified/needs_review/not_linkable.

- [ ] Probar `retry_keeps_ids`, `name_alone_cannot_link`, `research_source_namespace_preserved`, `legacy_permission_not_extended`, `listing_media_unchanged` antes de implementar.
- [ ] Crear market_legacy_links e historial con versión; validar FK de ficha, propiedad, anunciante y publicación si existe. Conservar todos los anunciantes acreditados sin inventar contacto principal.
- [ ] Aplicar enlaces solo con evidencia de identidad y alcance; no crear nuevos anunciantes verificados por una coincidencia de nombre ni trasladar permiso de fotos a otra captura.
- [ ] Probar rollback atómico y reconciliación de una relación humana existente. Comparar hashes/conteos de listings/media/matches y IDs antes/después del fixture.
- [ ] Ejecutar `node --test tests/server/market-legacy-links.test.mjs tests/server/advertisers.test.mjs`; esperar cero modificaciones de fichas/medios y un enlace por ficha vigente. Commit de backfill aditivo.

## Tarea 3 · Revisión e integración con el inventario

Archivos: crear `server/routes/market-legacy.js`, `admin/src/MarketLegacyReview.jsx`, `tests/server/market-legacy-routes.test.mjs`, `tests/market-legacy-ui.test.js`; modificar server/api.js y MarketInventory existente. BUS-03 reutiliza componente.

API: GET `/api/admin/market-legacy?cursor=&limit=50`; POST `/api/admin/market-legacy/:listing_id/link` con versión. Component props `{listingId?,onChange}`.

- [ ] Probar sesión/origen/versión y que dos revisores no sustituyan datos; validar IDs de la operación que se muestra.
- [ ] Mostrar ficha histórica, evidencia y candidato a anunciante; acción `Link verified records` exige revisar la relación; `Needs review` y `Not linkable` visibles con razón.
- [ ] Un enlace aceptado permite a la proyección BUS-01 agrupar legacy/mercado; no inicia búsquedas, envía consultas ni modifica disponibilidad por sí mismo.
- [ ] Ejecutar checks comunes y recorrido e2e/MCP1280/390 con error, vacío, parcial, conflicto, foco/teclado/zoom. Conservar la procedencia visible en Research existente.
- [ ] Cerrar con universo conciliado y cada caso enlazado o pendiente nominal, no con264 enlaces fabricados. Actualizar tarea/checklist/ESTADO/ledger y revisión independiente futura antes de publicación autorizada.
