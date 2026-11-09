# BUS-03 · Inventory browser Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Pantalla privada de inventario/evidencia y clasificación.

**Para ejecutar/completar:** Comparación cumple/pendiente/alternativa y fuentes reales; vacío mientrasprocesa no es mercado vacío. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: BUS-06/10/12; proyección de episodios BUS-01.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo documentación en esta sesión.

**Goal:** Ver el inventario común con publicaciones/evidencia y distinguir candidatos completos, pendientes y alternativas sin perder la revisión actual.

**Architecture:** Navegador privado nuevo y detalle paginado consumen BUS-06/10; tarjetas existentes consumen la proyección unificada BUS-01/BUS-12. Reutilizar componentes de revisión, sin duplicar almacenamiento o catálogo público.

**Tech Stack:** React/Vite actuales, JavaScript, D1, node:test y e2e actual; sin librería de tablas ni diseño nuevo.

**Spec:** [Diseño común, contratos6–7](../specs/2026-11-08-list2-market-batch-design.md); [BUS-01](2026-11-08-bus-01-inventory-matching.md), [BUS-10](2026-11-08-bus-10-property-identity.md).

## Global Constraints

- BUS-06/10/12 integrados; completar proyección BUS-01 antes de tarjetas de aplicantes. Se puede construir navegador global sin inventar resultados de matching.
- Ruta interna #/market y #/market/<property_id>; no publicar fichas externas ni fotos sin permiso. Una propiedad muestra todas sus publicaciones/operaciones separadas.
- Ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor/Georgia H1 26 yH2 19px, Montserrat/system-ui14px/1.5, label12 y tabla12/600.
- Contenedor1240/gutter16, card24px/r14, campo r10, botón10px20px/r999 y alto44; celdas10px12px, tabla a tarjetas bajo760, solo480/760/980 nuevos breakpoints, foco2px/offset2, contraste texto4.5/control3, zoom200 y reduced-motion. DESIGN.md vigente, no YAML histórico.
- Loading/vacío/error/parcial/conflicto accesibles, copy inglés. Staff/no-store/same-origin, safeHref y rel=noopener noreferrer; texto React, no dangerouslySetInnerHTML ni datos personales en localStorage.
- Listas50 con cursor, contactos solo detalle autorizado, poll30s solo visible/autenticado si hace falta progreso; ninguna librería/fuente/imagen nueva. Impeccable product/antislop/seguridad/rendimiento/ponytail del spec aplican; taste/redesign no aplican a estética de panel.

## Review Focus

1. Una publicación fuente falla y parece inmueble no disponible: tareas1–2, estados distintos.
2. Tres fuentes duplican tarjeta/contadores: tareas1 y3, CandidateKey común.
3. Cambio de filtro lento sobrescribe resultados nuevos: tarea2, descartar respuesta vieja.
4. ID legacy colisiona con market y revisa otra fila: tarea3, target discriminado.
5. Rechazo anterior y nuevo episodio aparecen como dos propuestas actuales: tarea3, solo generación activa con historial accesible.

## Tarea 1 · Lecturas privadas y paginación

Archivos: crear `server/routes/market-properties.js`, `tests/server/market-property-routes.test.mjs`; modificar server/api.js y proyección market-store según sea necesario, sin escritor paralelo.

API: GET `/api/admin/market-properties?after=&limit=50&operation=&source=&observed_state=&commercial_availability=` y `/api/admin/market-properties/:id?after=&limit=50`. Devuelven `{items,next_cursor,summary}` o `{property,publications,next_cursor,evidence_summary}`. El cursor es validado, acotado y consistente con filtros/orden.

- [ ] Escribir `private_list_requires_session`, `contacts_absent_from_list`, `three_publications_one_property`, `failed_source_not_unavailable`, `filter_cursor_stable` y `invalid_filter_rejected`.
- [ ] Consultar propiedades canónicas sin esconder operaciones/publicaciones; ordenar estable por fecha/ID, páginas50. Total/pendientes se calculan en SQL, sin cargar todos los contactos para contar.
- [ ] Detalle separa fecha observada y confirmación comercial con alcance; muestra original/derivado, evidencia, fuentes y anunciantes autorizados. Price_conflict/unknown tienen estados propios.
- [ ] Ejecutar `node --test tests/server/market-property-routes.test.mjs`; comprobar401 y que una lista no contiene teléfonos/textos de permisos privados. Commit de lectura.

## Tarea 2 · Navegador global y detalle

Archivos: crear `admin/src/MarketInventoryBrowser.jsx`, `admin/src/MarketPropertyDetail.jsx`, `admin/src/MarketEvidence.jsx`, `tests/market-inventory-browser.test.js`; modificar `admin/src/App.jsx`, estilos solo para componentes nuevos sin remaquetar otras pantallas.

Interfaces: Browser sin props de datos globales; Detail `{id}` obtiene su página privada; MarketEvidence `{facts,issues,publications}`. Navegación por hash existente; link Market inventory y aria-current correcto.

- [ ] Probar render de vacío, error/reintento, parcial, unknown, conflictos de precio y respuesta tardía tras cambiar filtro. Mantener filtro/posición al volver del detalle.
- [ ] Tabla compacta: propiedad/tipo, operación, precio original, ubicación, observación y disponibilidad comercial separadas; no cards estadísticas de decoración. Filtros por operación/fuente/estados, Load more nativo con recuento vivo.
- [ ] Detalle enumera publicaciones con enlace seguro, fechas, términos originales/derivados, anunciante y evidencia. Usar MarketIdentityReview/MarketLegacyReview/MarketAmbiguityReview existentes, no formularios duplicados.
- [ ] Sin descargar galerías o thumbnails externos; si existe medio propio permitido, usar miniatura autorizada con tamaño y alt. La ausencia de foto no bloquea navegar o revisar.
- [ ] Ejecutar `node --test tests/market-inventory-browser.test.js` y build; medir número de peticiones/payload50, sin descargar inventario completo. Commit del navegador.

## Tarea 3 · Integrar tarjetas y revisión por aplicante

Archivos: modificar `admin/src/MatchCard.jsx`, `admin/src/ApplicantDetail.jsx`, `admin/src/Review.jsx`; crear `tests/market-match-cards.test.js`; consumir GET y POST market-matches de BUS-01 y rutas legacy conservadas.

Interfaz de tarjeta: match.target `{kind,id,version}`, propiedad/op/CandidateKey, clasificación/evidencia/disponibilidad, status y reviewed_at. `onReview` elige endpoint según target y manda versión del aplicante/episodio.

- [ ] Probar `legacy_and_market_ids_do_not_collide`, `pending_not_counted_as_meets`, `alternatives_separate`, `active_episode_hides_old_rejection`, `closed_search_blocks_action`, `keyboard_focus_and_undo`.
- [ ] Mantener Found/Shortlisted/Rejected; dentro separar Meets stated must-haves, Details to confirm e Internal alternatives. Historial muestra rechazo previo y razón de nueva generación; no dos propuestas actuales por la misma operación.
- [ ] Preservar decisión humana, texto de criterios, reason/evidence/fechas. Un botón Shortlist no afirma disponibilidad confirmada ni dispara consulta/envío.
- [ ] Atajos A/R/S solo dentro de la región de cola, nunca en inputs; conservar Undo y foco tras refrescar, conflicto409 obliga a recargar sin aplicar acción a la siguiente tarjeta.
- [ ] Ejecutar test de tarjetas y regresiones existentes de MatchCard/Review/ApplicantDetail; verificar contadores/API con las mismas fixtures. Commit de integración.

## Tarea 4 · Flujo completo y cierre

Archivos: crear `tests/bus03-e2e.cjs` con fixtures sintéticos compatibles con el entorno e2e vigente; actualizar documentación de tarea al cerrar realmente.

- [ ] Recorrer inventario->detalle->fuentes->aplicante->pending/meets->Shortlist/Reject/Undo; una propiedad en tres webs y dos unidades en una dirección.
- [ ] Cargar error de fuente, precio conflictivo, ninguna publicación y sesión expirada; acciones recuperables y sin contactos en lista/log/storage.
- [ ] Ejecutar npm test/build/check:release, test:e2e y MCP1280/390, teclado/foco/zoom200/reduced-motion/consola/red. No dos e2e generales simultáneos en el mismo host.
- [ ] Registrar capturas y límites reales, revisión independiente futura y actualización BUS-03/checklist/ESTADO/ledger. Publicación e integración externa solo con autorización de la sesión constructora.
