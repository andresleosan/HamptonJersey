# SPR-02 A: revisión de diseño y alcance

9-nov-2026 · clon h1 · base `f2113769903548f4c5a4763a51c7962e84e80aef`.
Solo etapa A; SPR-02 sigue parcial después de A. Luis respondió «Si» para construir primero History con eventos ya registrados y dejar matches, visitas, ofertas y productores futuros para etapas posteriores. No autorizó publicación, despliegue ni migración.

## Evidencia revisada

- Diseño y plan: `docs/superpowers/specs/2026-11-09-spr-02-h1-history-design.md`, `docs/superpowers/plans/2026-11-09-spr-02-h1-history.md` y su ledger.
- Revisión GPT independiente de los tres documentos y de `migrations/0029_listing_events.sql`, `migrations/0034_listing_editorial.sql`, `server/listing-events.js`, `server/listing-editorial.js`, `server/routes/listings.js`, `admin/src/ListingEditor.jsx`, `server/retention.js`, DESIGN y contrato coordinado: no halló error de contrato que invalide A. Detectó que `events_listing_revision` (0029:18-19) impide insertar JSON malformado de listing en D1 y que el builder-check informado por Codex no tiene resultado adjunto verificable. Spec/plan se corrigieron: D1 prueba data nula/válida inesperada, mock aislado prueba JSON roto; el builder-check no se cuenta como aprobación.
- Contraste adicional de Hermes: `server/api.js:29-61` exige sesión para ruta admin y aplica no-store; `server/routes/listings.js:9,24-27,243-249` separa listing vivo de tombstone y mantiene eventos por lote; `server/listing-events.js:12-31` usa contexto transaccional; `server/listing-editorial.js:65-90` vincula evidencia al evento. `admin/src/ListingEditor.jsx:64-85,97-158,198-209` carga ficha, conserva borrador y reúne acciones; History se incorpora sin alterar esas operaciones. Una prueba SQL en memoria con el índice real devolvió `OperationalError: malformed JSON` al insertar `data='{'`.
- Dependencia EST-18 integrated registrada por el coordinador con SHA `cf0c86dc8a18dc4e1cd71aee822f5d657e0b176e`. El coordinador no reportó dependencias o conflictos de recursos para SPR-02, pero exige `review_required`; revalidar status justo antes del claim. `NOT-08` tiene reserva/turno ajeno sobre Inbox y documentos globales, por lo que este alcance no los toca.

## Alcance revisado para atestación design y build

Recursos mínimos de SPR-02 (sin rebajar aunque A sea de lectura): `events-contract` write, `listings-schema` write, `path:docs/roadmap/tasks/SPR-02.json` write, `path:docs/roadmap/work/SPR-02/` write. La revisión cubre estas rutas exactas para los cambios de A:

- `server/listing-history.js` (nuevo), `server/routes/listings.js`.
- `admin/src/ListingHistory.jsx` (nuevo), `admin/src/listing-history.css` (nuevo), `admin/src/ListingEditor.jsx`.
- `tests/server/listing-history.test.mjs` (nuevo), `tests/listing-history.e2e.cjs` (nuevo).
- Los tres documentos spec/plan/ledger indicados y `docs/roadmap/work/SPR-02/h1-history-design-review.md`, `docs/roadmap/work/SPR-02/h1-history-validation.md`, `docs/roadmap/tasks/SPR-02.json`.

No incluye migración nueva, cambios de productores, notificaciones, `docs/roadmap/work-units.json`, catálogo, documentos globales, Inbox o archivos de NOT-08. ESTADO, checklist y documentos generados exigen revisión/ampliación posterior, una vez liberados los recursos de NOT-08; no editar antes ni dejar la entrega sin actualizar estado. El e2e del host requiere recurso propio `e2e:<hostId>` antes de usar fixtures o puertos compartidos.

## Criterios de aceptación de A

A01-A09 del plan: autenticación/no-store, datos permitidos sin PII, paginación estable, ausencia de dependencia de R2, retención, borrador intacto, fechas Jersey y evidencia sin afirmaciones falsas, UI completa a 1280/390/zoom y lectura sin efectos laterales. `npm test`, build, release, e2e focal/general y recorrido MCP son gates posteriores, no resultados de esta revisión. La revisión independiente del código futuro será separada. El modelo/esfuerzo exactos de Codex no fueron visibles durante la planificación; no se infieren de la configuración.

**Conclusión:** diseño A revisado para solicitar evidence design y reserva build limitada a estas rutas. No supone producto construido ni aprobación para publicar. Si el coordinador rechaza alcance/dependencia o aparece una ruta adicional, detener edición, revisar ampliación y volver a atestar el diseño correspondiente.

**Resultado del intento:** h1 ejecutó `evidence --unit SPR-02 --kind design` con esta referencia y el alcance anterior; el servidor respondió HTTP 403 `COORDINATOR_REQUIRED`. Status posterior conserva `review_required`, sin evidencia nueva ni operación incierta. Solo una identidad coordinadora autorizada puede atestar este diseño; hasta entonces no hay claim build ni edición de producto. El sí de Luis para A no cambia el rol del actor.

**Reanudación de base:** a las 12:28 UTC main h1 avanzó sin solapamiento de `f211376` a `2084cb9` por la publicación ajena de NOT-08. Se conservan los cuatro documentos SPR-02 sin seguimiento; status posterior mantiene `review_required` sin evidencia design. Esta nota no altera el alcance revisado ni crea atestación remota.

**Decisión posterior confirmada:** Luis autorizó los cambios locales de instrucciones del 9-nov-2026 que retiran el coordinador del avance. El review documental anterior sigue siendo revisión de alcance y riesgos, no atestación remota; no se intentará otra evidencia. Construir A conserva candado, exclusividad de clon, base comprobada, TDD, pruebas y revisión independiente. Publicar y migrar conservan el sí de Luis para SHA exacto y wrappers.
