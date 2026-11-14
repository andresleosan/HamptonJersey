# PUB-08 · Familia 5 · Marketing y contenidos de la ficha Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task solo tras encargo de construcción y decisiones de producto resueltas. Steps use checkbox (`- [ ]`) syntax. Esta entrega no ejecuta el plan.

**Goal:** Completar etiquetas y vídeo separado del tour solo para contenidos web.

**Architecture:** own-publication-completion conserva servicios existentes; límites y alternativas están en el diseño propietario. La tarea produce un módulo/continuidad/evidencia concreta según preparación, sin simular dependencias ausentes.

**Tech Stack:** JavaScript/React/Workers/D1 y almacenamiento existente, node:test/D1 local. Gestión/activación solo documentación y evidencia cuando no requiere código. Sin dependencias nuevas por defecto.

**Spec:** [Diseño propietario](../specs/2026-11-08-own-publication-completion-design.md), [tanda](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** PUB-04 extensión; PRE-11 carga de terceros; PUB-13 propuestas de texto; Meta excluido.

**Readiness:** defined. Integrar dependencias y acreditar los criterios del alcance; activación externa se verifica aparte. Decisiones pendientes: ninguna propia; respetar gates externos y decisiones transversales abiertas.

## Global Constraints

- Solo planificación. No construcción, reservas, migración, proveedor, campaña, WAF, DNS, cuenta o envío activos por crear estos documentos. Otra sesión revisa alcance/main/dependencias y obtiene reserva build. Elegir ordinal libre y no rehacer tablas o funciones existentes.
- Maestro vigente: mascotas no negociables/parking flexible salvo MUST; match/consulta/presentación y cierre humanos; enlace privado hasta revocación; disponibilidad general hasta información nueva; barrido01:00; visitas30/15/+15/8; purga6meses solo fotos. No informes a propietarios, Meta/WhatsApp/Places-Properties/local actuales. IA central solo por vía/purpose/acuerdos autorizados; C3 nunca Hermes/Pro/Telegram. Hermes gestiona acuerdos sin nuevas órdenes o búsqueda de contratos.
- Mantener listings/media/drive_imports/events/notifications/Insights existentes. No segundo inventario, motor, Inbox, reloj o cola. published_at/SEO/rango REG-08/servicios correo ya existen. Copias ajenas/env/secrets/bases privadas no se abren o copian; datos de pruebas sintéticos.
- DESIGN.md paleta verificada y CSS: ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d foco-decoración/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px400, Montserrat14px/1.5 label12; wrap1240/página24px16px120px/card24/r14/inputr10/botón10px20px-r999/gaps8/12/16/24; reflujo760 e Inbox820. Web15/1.65,input16,field13x14/r12,botón13x28.
- Copy inglés, labels/status/alert, ARIA/teclado/foco2-offset2/contraste4.5texto-3control/zoom200/reduced-motion; nuevos objetivos44pxmóvil propuestos,32escritorio. Sin fuentes, librerías, estilos o infra nuevos por defecto. Listas/historia50, Inbox200, JSON128KiB/poll30svisible; documentos20MiBstream, medios propios preservan16Mpx/10MiB y miniatura640, no1600obsoleto.
- Sesión staff/actor servidor/same-origin, client scopes aislados, SQLparametrizado/enums cerrados y React texto/esc/textContent/safeHref. PII/códigos/tokens/documentos fuera de URL/storage/logs/Telegram. Privado no-store/attachment/nosniff y firmas/tipos reales; eventos metadata/ref sin cuerpo privado. GET/prefetch sin mutación. Recursos e inferencia tardíos revalidan fuente/versión/política y borrado.
- Avanzar/writing-plans fijan archivos/contratos/evidencia; ponytail reutiliza; seguridad servidor/frontend aplica validación/permisos; impeccable/antislop conservan flujo/copy sin adornos; web-performance limita cardinalidad/queries/streams. Taste/redesign no suponen rediseño. Test reales por comportamiento y D1 para atomicidad, no tests espejo de texto o fixture como integración real.
- P01/P02/P03 están preguntadas: decisiones pendientes no se resuelven por silencio. Contratos afectados son borradores hasta respuesta y actualización del spec. Las propuestas técnicas están marcadas en diseños y no se atribuyen a Luis.

## Review Focus

1. tags_closed_enum; no_javascript_url; video_not_tour_overwrite; no_social_fields; unknown_tags_rejected
2. no_iframe_initial; separate_video_tour; blocked_host_message; English_copy; keyboard_load
3. Cambios de permiso/fuente/revisión durante una operación impiden commit o dispatch y preservan historial mínimo sin restaurar contenido.
4. Ámbito de otra propiedad/persona/operación o dependencia ausente no se convierte en autoridad por un ID o fixture.

## Tarea 1 · Contenido y URLs validados

**Files:** Modify server/listing-details.js, server/listing.js; Test tests/server/listing-content.test.mjs.

**Interfaces:** Content={tags:enum[],video_url?,tour_url_existing}; hosts embebibles del validador existente.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: tags_closed_enum; no_javascript_url; video_not_tour_overwrite; no_social_fields; unknown_tags_rejected; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/listing-content.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Mantener título/summary/description existentes; lista de etiquetas con versión y sin nuevos campos de piezas sociales.
- [ ] Ejecutar `node --test tests/server/listing-content.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 2 · Editor y preview seguro

**Files:** Modify admin/src/ListingEditor.jsx, site/lib.js y loader PRE-11; Test tests/listing-content-ui.test.js.

**Interfaces:** Preview y enlaces no cargan reproductor tercero antes del clic/autorización de propósito.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: no_iframe_initial; separate_video_tour; blocked_host_message; English_copy; keyboard_load; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/listing-content-ui.test.js` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Reutilizar URLde tour existente; sin cadena3D, traducción automática o estética nueva.
- [ ] Ejecutar `node --test tests/listing-content-ui.test.js` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Cierre futuro

- [ ] Resolver las decisiones humanas que afectan la tarea y actualizar spec/plan/readiness antes de construir ese tramo. Una investigación/gestión/activación no se declara código completo por estar planificada.
- [ ] Si hay código, npm test, npm run build y npm run check:release más regresiones focales. UI modificada: e2e y Playwright1280/390 con vacío/error/conflicto/teclado/foco/zoom200/consola/red; documentos puros no requieren producto artificial.
- [ ] Evidencia separado construido/integrado/verificado/activado, ledger de tarea y checklist/ESTADO al construir; revisión independiente futura y publicación/activación bajo autorización real de esa sesión. Nada ejecutado en estas casillas.

## Continuidad de ejecución · 14-nov-2026

El encargo vigente de Luis sustituye la restricción histórica de solo planificación y cualquier reserva de Hermes. La implementación ya integrada y revisada se conserva; no se fabrica una prueba RED para comportamiento existente. Los paths efectivos son `server/listing-content.js`, `server/routes/listings.js`, `server/routes/public.js`, `admin/src/ListingContentFields.jsx`, `site/tour-privacy.js` y las pruebas `pub-08-content.test.mjs`, `pub08-content-dom.test.js`, `pub08-integrated.e2e.cjs`.

- [x] Catálogo cerrado versión 1, validación de URLs y servidor, separación de tour, revisión de dirección, permisos, CAS e historial mínimo.
- [x] Editor y vista pública integrados mediante API/D1/R2 reales sintéticos, 400/409, borrador/descarte, ausencia de iframe o petición externa antes del clic, offline, teclado, escritorio/móvil y zoom. Chromium y WebKit en el contenedor aislado exigido.
- [x] Revisión independiente sin hallazgos pendientes y suite conjunta de 2.308 JavaScript/29 Python, build, release, catálogo, paquetes y contrato de esquema.
- [x] Autorización explícita de Luis para solo 0048 y PUB08; aplicación de 0048 con comprobación posterior de tabla vacía, dos validadores y registro de migración.
- [x] Publicación `faf43a3`, despliegue nativo exitoso, activación efectiva y HTTP 200 de la API pública; [evidencia final](../../roadmap/work/PUB-08/2026-11-14-integracion-activacion.md). Ficha y derivados se cierran con el siguiente push; el endpoint del tablero se comprueba después.

Las referencias P01/P02/P03 de la plantilla no crean una decisión nueva para el alcance web vigente. Se conserva el catálogo inicial cerrado y versionado; una ampliación posterior se revisa al existir una necesidad real. Las piezas y campañas sociales no pertenecen a este cierre. PUB-06/SPR-01 quedan preparadas y sin activación; Luis pidió detenerse después del primer cierre real con aumento público y commit/push guardados.
