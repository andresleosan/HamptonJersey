# PUB-11 · Subida de fotos con control de calidad, plano y documentos Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task solo tras encargo de construcción y decisiones de producto resueltas. Steps use checkbox (`- [ ]`) syntax. Esta entrega no ejecuta el plan.

**Goal:** Completar avisos de calidad y PDFs privados manteniendo resolución y privacidad actuales.

**Architecture:** own-publication-completion conserva servicios existentes; límites y alternativas están en el diseño propietario. La tarea produce un módulo/continuidad/evidencia concreta según preparación, sin simular dependencias ausentes.

**Tech Stack:** JavaScript/React/Workers/D1 y almacenamiento existente, node:test/D1 local. Gestión/activación solo documentación y evidencia cuando no requiere código. Sin dependencias nuevas por defecto.

**Spec:** [Diseño propietario](../specs/2026-11-08-own-publication-completion-design.md), [tanda](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** PUB-01/04 y EST-18; PUB-12 requiere revisión atómica de medios; medios externos siguen SPR-03/AGE-10 separados.

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

1. full_resolution_16Mpx; thumb640; no_GPS_reencoded; warning_not_fake_improvement; malformed_image_rejected
2. public_media_cannot_serve_pdf; wrong_listing_denied; mime_spoof_reject; storage_partial_cleanup; no_auto_publication
3. stale_media_no_partial_order; last_public_photo_publish_race; external_reference_never_public; removed_file_no_restore
4. Cambios de permiso/fuente/revisión durante una operación impiden commit o dispatch y preservan historial mínimo sin restaurar contenido.
5. Ámbito de otra propiedad/persona/operación o dependencia ausente no se convierte en autoridad por un ID o fixture.

## Tarea 1 · Calidad local y metadatos mínimos

**Files:** Create admin/src/photo-quality.js; Modify admin/src/image.js y subida servidor; Test tests/photo-quality.test.js.

**Interfaces:** analysePhoto(bitmap)->{width,height,warnings,version}; resolución lado<1200 warning, exposición/enfoque orientativos calibrados, no bloqueo automático.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: full_resolution_16Mpx; thumb640; no_GPS_reencoded; warning_not_fake_improvement; malformed_image_rejected; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/photo-quality.test.js` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [x] Conservar límite10MiB servido/fuente40MiB y reencode del cliente, comprobar firmas/dimensiones servidor. Rechazar EXIF/GPS no permitido en subida no reencodada en vez de prometer que el frontend cubre API directa.
- [ ] Ejecutar `node --test tests/photo-quality.test.js` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 2 · PDF privado y staging durable

**Files:** Create server/listing-documents.js, server/routes/listing-documents.js y migración documentos; Test tests/server/listing-documents.test.mjs.

**Interfaces:** POST/GET staff documents por listing; PDF<=20MiB, signature, attachment/nosniff/no-store, visibility staff, intención R2 durable.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: public_media_cannot_serve_pdf; wrong_listing_denied; mime_spoof_reject; storage_partial_cleanup; no_auto_publication; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/listing-documents.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] No usar media.document como permiso público, no ejecutar contenido. Confirmar bytes/huella/row antes de dar stored, reconciliar huérfanos sin descargar otros archivos.
- [ ] Ejecutar `node --test tests/server/listing-documents.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 3 · Orden/visibilidad y versión atómicos

**Files:** Modify server/routes/media.js, server/listing-events.js, ListingEditor; Test tests/server/media-save-atomic.test.mjs.

**Interfaces:** Orden/public/portada y media_revision se actualizan en mismo batch contextual/CAS; PUB-12 consume versión.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: stale_media_no_partial_order; last_public_photo_publish_race; external_reference_never_public; removed_file_no_restore; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/media-save-atomic.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Integrar guards reales de publicación cuandoP01 resuelta. Mostrar parcial y reintento por archivo; HEICmanualsinconversion oculta o ficticia.
- [ ] Ejecutar `node --test tests/server/media-save-atomic.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Cierre futuro

- [ ] Resolver las decisiones humanas que afectan la tarea y actualizar spec/plan/readiness antes de construir ese tramo. Una investigación/gestión/activación no se declara código completo por estar planificada.
- [ ] Si hay código, npm test, npm run build y npm run check:release más regresiones focales. UI modificada: e2e y Playwright1280/390 con vacío/error/conflicto/teclado/foco/zoom200/consola/red; documentos puros no requieren producto artificial.
- [ ] Evidencia separado construido/integrado/verificado/activado, ledger de tarea y checklist/ESTADO al construir; revisión independiente futura y publicación/activación bajo autorización real de esa sesión. Nada ejecutado en estas casillas.

## Ejecución parcial · 14-nov-2026

Base comprobada: main `2b4c224bf3ac48c44d470a396090d37dab39b2b2`; copia aislada `/tmp/hampton-avanzar-20261114`. Se retoma Tarea 1 en la ruta de subida real, conservando el árbol de Luis.

- [x] Verificar firmas, estructura de contenedor, dimensiones reales, límites de 16 Mpx/10 MiB y miniatura de lado máximo 640. Rechazar metadatos personales, MIME contradictorio y formatos fuera del flujo estático antes de escribir en R2/D1.
- [x] Probar ruta completa con datos sintéticos y validar compatibilidad con el reencode real del navegador en el lanzador aislado.
- [x] Revisión independiente, suite integrada, build/release, catálogo y paquetes; registrar limitaciones antes de commit/push.

Decisión de alcance: se rechaza metadata no admitida y se conservan los bytes aceptados; no se instala un decodificador ni se certifica la integridad semántica de cada bitstream. Los documentos privados, staging durable, guardado atómico de orden/visibilidad, calibración con material representativo y activación/configuración remota quedan abiertos. Esta entrega no cierra PUB-11.

Verificación de este lote: 2275 JavaScript/29 Python, build/release, catálogo/paquetes y E2E sintético Chromium/WebKit 1280/390/zoom aprobados; revisión independiente de módulo/ruta y ajuste canvas sin hallazgos pendientes. La inspección de contenedor no equivale a decoder completo. El resto de Tarea 1 y Tareas 2/3 permanece abierto.
