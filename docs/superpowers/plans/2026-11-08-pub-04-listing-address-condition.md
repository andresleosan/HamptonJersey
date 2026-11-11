# PUB-04 · Familia 1 · Identificación y ubicación de la ficha Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.

> **Revalidación · 11-nov-2026:** sobre `main` `37d0287a67d9776f050400bab595bd681ee43b39`, Luis autorizó publicar dirección exacta solo tras revisión explícita por ficha: consentimiento del propietario, referencia de evidencia y preview completo. El hash cubre DTO público, title/summary/description/media alt, SEO/JSON-LD y título actual de carpeta Drive; cualquier cambio requiere revisión nueva. Después autorizó push, unión a `main` y publicación en producción. La migración `0040` es necesaria antes de activar el código; el estado de ejecución se debe verificar. `property_condition` sigue compartido con PUB-05. Evidencia en [ledger](2026-11-11-pub-04-internal-details-ledger.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. La decisión posterior del 11-nov permite publicación exacta solo con revisión por ficha y autoriza integrar en `main`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Completar los datos internos de identificación y mantenerlos separados de los campos que ya son públicos.

**Architecture:** `property_condition` vive en `listings` como campo único compartido con PUB-05, para conservar sus valores enum en el historial existente. Inmueble/unidad, código postal y promotor viven en una extensión `listing_details`. La ruta admin aplica validación y CAS de `listings.updated_at` en el mismo batch de historia. La proyección pública sigue usando su whitelist actual.

**Tech Stack:** JavaScript/React/Workers/D1 y almacenamiento existente, node:test/D1 local. Gestión/activación solo documentación y evidencia cuando no requiere código. Sin dependencias nuevas por defecto.

**Spec:** [Diseño propietario](../specs/2026-11-08-own-publication-completion-design.md), [tanda](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** PUB-01 consume; BUS-10 identifica propio/externo; EST-18 versiona.

**Readiness:** datos internos, editor y revisión de dirección exacta construidos y revisados localmente. La integración y activación se ejecutan con la autorización posterior de Luis y requieren comprobar `0040` y el despliegue real.

## Global Constraints

- La regla original de solo planificación quedó superada por la construcción, push e integración autorizados el 11-nov. La activación usa `0040`; no implica cambios de proveedor, campaña, WAF, DNS, cuenta o envíos. No rehacer tablas o funciones existentes.
- Maestro vigente: mascotas no negociables/parking flexible salvo MUST; match/consulta/presentación y cierre humanos; enlace privado hasta revocación; disponibilidad general hasta información nueva; barrido01:00; visitas30/15/+15/8; purga6meses solo fotos. No informes a propietarios, Meta/WhatsApp/Places-Properties/local actuales. IA central solo por vía/purpose/acuerdos autorizados; C3 nunca Hermes/Pro/Telegram. Hermes gestiona acuerdos sin nuevas órdenes o búsqueda de contratos.
- Mantener listings/media/drive_imports/events/notifications/Insights existentes. No segundo inventario, motor, Inbox, reloj o cola. published_at/SEO/rango REG-08/servicios correo ya existen. Copias ajenas/env/secrets/bases privadas no se abren o copian; datos de pruebas sintéticos.
- DESIGN.md paleta verificada y CSS: ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d foco-decoración/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px400, Montserrat14px/1.5 label12; wrap1240/página24px16px120px/card24/r14/inputr10/botón10px20px-r999/gaps8/12/16/24; reflujo760 e Inbox820. Web15/1.65,input16,field13x14/r12,botón13x28.
- Copy inglés, labels/status/alert, ARIA/teclado/foco2-offset2/contraste4.5texto-3control/zoom200/reduced-motion; nuevos objetivos44pxmóvil propuestos,32escritorio. Sin fuentes, librerías, estilos o infra nuevos por defecto. Listas/historia50, Inbox200, JSON128KiB/poll30svisible; documentos20MiBstream, medios propios preservan16Mpx/10MiB y miniatura640, no1600obsoleto.
- Sesión staff/actor servidor/same-origin, client scopes aislados, SQLparametrizado/enums cerrados y React texto/esc/textContent/safeHref. PII/códigos/tokens/documentos fuera de URL/storage/logs/Telegram. Privado no-store/attachment/nosniff y firmas/tipos reales; eventos metadata/ref sin cuerpo privado. GET/prefetch sin mutación. Recursos e inferencia tardíos revalidan fuente/versión/política y borrado.
- Avanzar/writing-plans fijan archivos/contratos/evidencia; ponytail reutiliza; seguridad servidor/frontend aplica validación/permisos; impeccable/antislop conservan flujo/copy sin adornos; web-performance limita cardinalidad/queries/streams. Taste/redesign no suponen rediseño. Test reales por comportamiento y D1 para atomicidad, no tests espejo de texto o fixture como integración real.
- P01/P02/P03 están preguntadas: decisiones pendientes no se resuelven por silencio. Contratos afectados son borradores hasta respuesta y actualización del spec. Las propuestas técnicas están marcadas en diseños y no se atribuyen a Luis.

## Review Focus

1. JE_structure_by_country; international_not_forced_JE; developer_only_new_build; unknown_not_resale; existing_ref_stable
2. full_address_private_default; explicit_public_choice; stale_keeps_draft; postcode_error_focus; no_geocoder_fetch
3. Cambios de permiso/fuente/revisión durante una operación impiden commit o dispatch y preservan historial mínimo sin restaurar contenido.
4. Ámbito de otra propiedad/persona/operación o dependencia ausente no se convierte en autoridad por un ID o fixture.

## Tarea 1 · Extensión tipada de identificación

**Files:** Create server/listing-details.js y migration `0040_listing_address_details.sql`; modify server/routes/listings.js y server/listing-events.js; test tests/server/listing-address.test.mjs.

**Interfaces:** readListingDetails(env,id); validateListingDetails(input,{partial,country}); PUT admin con `details` parcial, CAS `updated_at` y escritura de extensión en el mismo batch.

- [x] Escribir pruebas de formato Jersey/extranjero, condición unknown/existing, retención de promotor, CAS, fallo atómico, y restricción a lectura admin.
- [x] Ejecutar RED inicial: seis pruebas fallaron por comportamiento ausente antes de implementar.
- [x] Una extensión por listing para textos de dirección; `property_condition` único en `listings`; CAS `updated_at`, revisión por cambio efectivo y sin cambio de `confirmed_at` o matching. No duplicar road/parish/country ni guardar dirección personal de propietario.
- [x] `node --test tests/server/listing-address.test.mjs` PASS 11/11; junto con History y Events, PASS 59/59. Incluye carrera con `updated_at` adelantado y restricción del promotor a obra nueva.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 2 · DTO público mínimo y editor

**Files:** Modify server/routes/listings.js, server/listing-events.js, server/listing-history.js, admin/src/ListingEditor.jsx and admin/src/ListingHistory.jsx; test tests/server/listing-address.test.mjs and tests/listing-address.e2e.cjs.

**Interfaces:** Dirección completa interna por defecto. La publicación requiere revisión por ficha del snapshot completo, aceptación explícita y referencia de evidencia; `Location` conserva su regla vigente.

La API de dirección pública solo añade `exactAddress` cuando coincide el snapshot autorizado con el contenido actual. Si el edificio y la calle ya aparecen juntos en texto público sin autorización vigente, la ficha pública se oculta. El editor permite previsualizar DTO/SEO/JSON-LD y el nombre de la carpeta Drive antes de autorizar. No renombra carpetas ni migra datos remotos.

- [x] Pruebas cubren dirección privada por defecto, consentimiento/ref, snapshot obsoleto, título que contiene dirección, metadata/OG/JSON-LD y cambio de nombre Drive.
- [x] API GET/POST admin para preview, autorización y revocación con CAS; cambios de contenido invalidan el hash y no se actualiza carpeta Drive automáticamente.
- [x] Editor con preview completo y autorización deliberada; los campos internos mantienen Guardar/Descartar y enlace manual a Jersey Post.
- [x] Las pruebas focales pasan; el E2E queda escrito y con sintaxis validada, sin navegador Playwright disponible.
- [x] Decisión humana: publicación permitida por ficha tras revisión explícita. Una orden posterior autorizó integrar en `main` y publicar en producción.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Cierre futuro

- [ ] Resolver las decisiones humanas que afectan la tarea y actualizar spec/plan/readiness antes de construir ese tramo. Una investigación/gestión/activación no se declara código completo por estar planificada.
- [x] `npm run build`, `npm run check:release`, 14 pruebas Python y regresiones focales de servidor PASS. `npm test` reportó 1.142/1.148 PASS; seis pruebas UI no arrancaron por dependencia local ausente `jsdom`.
- [ ] E2E/Playwright a 1280/390, foco/teclado/zoom200 y revisión visual: bloqueados en este entorno por ausencia local de `playwright-core`; el navegador conectado rechazó el arranque con sandbox como root. No se desactivó el sandbox.
- [x] Actualizados ledger de ejecución, checklist y ESTADO con diferencias entre el checkpoint local, la integración y la activación por verificar.


**Snapshot público:** implementado con revisión hashada por ficha. Ninguna ficha existente se autorizó automáticamente; las carpetas Drive no se renombraron. En el checkpoint previo al despliegue, `0040` era la única migración pendiente y se comprobó un punto de recuperación D1. La publicación y su resultado deben verificarse por separado de esta preparación.
