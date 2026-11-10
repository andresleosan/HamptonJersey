# REG-15 · Alertas «Save this search» para visitantes de la web Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task solo tras encargo de construcción y decisiones de producto resueltas. Steps use checkbox (`- [ ]`) syntax. Esta entrega no ejecuta el plan.

**Goal:** Preparar alertas verificadas de enlaces públicos sin autoaprobar matches o presentaciones.

**Architecture:** public-acquisition-privacy conserva servicios existentes; límites y alternativas están en el diseño propietario. La tarea produce un módulo/continuidad/evidencia concreta según preparación, sin simular dependencias ausentes.

**Tech Stack:** JavaScript/React/Workers/D1 y almacenamiento existente, node:test/D1 local. Gestión/activación solo documentación y evidencia cuando no requiere código. Sin dependencias nuevas por defecto.

**Spec:** [Diseño propietario](../specs/2026-11-08-public-acquisition-privacy-design.md), [tanda](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** BUS-12 motor; PRE-09/10/33 propósito; AUT-11/17; revisión humana obligatoria según maestro.

**Readiness:** conditional. Diseño de verificación/lote humano definido; correo/propósito/retención deben estar autorizados para activación real. Decisiones pendientes: ninguna propia; respetar gates externos y decisiones transversales abiertas.

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

1. GET_prefetch_not_verified; duplicate_not_overwrite_applicant; revoked_token_denied; criteria_schema_only; unknown_must_pending
2. only_public_own_homes; incomplete_not_meets; human_batch_approval_required; new_revision_invalidates_approval; no_external_capture
3. withdrew_before_dispatch_denies; old_listing_not_daily_resent; unknown_no_repeat; paused_no_send; revoked_policy_denies
4. Cambios de permiso/fuente/revisión durante una operación impiden commit o dispatch y preservan historial mínimo sin restaurar contenido.
5. Ámbito de otra propiedad/persona/operación o dependencia ausente no se convierte en autoridad por un ID o fixture.

## Tarea 1 · Suscripción separada y verificación

**Files:** Create server/saved-searches.js y migración saved_searches; Test tests/server/saved-searches.test.mjs.

**Interfaces:** requestSavedSearch(env,{email,criteria,privacy_version,source_code},context)->pending_verification; POST verificación token256bits/huella24h.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: GET_prefetch_not_verified; duplicate_not_overwrite_applicant; revoked_token_denied; criteria_schema_only; unknown_must_pending; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/saved-searches.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Confirmar dirección/propósito sin crear búsqueda completa ficticia; capacidad de baja no permite leer criterios y consentimiento separado por propósito.
- [ ] Ejecutar `node --test tests/server/saved-searches.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 2 · Elegibilidad y revisión del lote

**Files:** Create server/saved-search-digest.js; Test tests/server/saved-search-digest.test.mjs.

**Interfaces:** prepareSavedSearchDigest(env,{subscription_id,revision,period})->draft; empleado aprueba lote/snapshot antes de liberar envío.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: only_public_own_homes; incomplete_not_meets; human_batch_approval_required; new_revision_invalidates_approval; no_external_capture; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/saved-search-digest.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Usar BUS-12 sin segundo motor. No excepción implícita a aprobación humana por llamar al mensaje alerta; no tocar aprobación/consulta de clientes en búsqueda.
- [ ] Ejecutar `node --test tests/server/saved-search-digest.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 3 · Entrega, baja y evidencia

**Files:** Modify AUT-17 sender y UI staff; Test tests/server/saved-search-delivery.test.mjs.

**Interfaces:** Un envío diario propuesto09:00 Jersey configurable tras revisión/activación, receipt por suscripción/período, unsubscribe inmediato.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: withdrew_before_dispatch_denies; old_listing_not_daily_resent; unknown_no_repeat; paused_no_send; revoked_policy_denies; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/saved-search-delivery.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Default disabled/cupo0 y horario propuesto no atribuido a Luis. Entrega real requiere propósito/retención y correoverificados; preview no equivale a envío.
- [ ] Ejecutar `node --test tests/server/saved-search-delivery.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Cierre futuro

- [ ] Resolver las decisiones humanas que afectan la tarea y actualizar spec/plan/readiness antes de construir ese tramo. Una investigación/gestión/activación no se declara código completo por estar planificada.
- [ ] Si hay código, npm test, npm run build y npm run check:release más regresiones focales. UI modificada: e2e y Playwright1280/390 con vacío/error/conflicto/teclado/foco/zoom200/consola/red; documentos puros no requieren producto artificial.
- [ ] Evidencia separado construido/integrado/verificado/activado, ledger de tarea y checklist/ESTADO al construir; revisión independiente futura y publicación/activación bajo autorización real de esa sesión. Nada ejecutado en estas casillas.
