# PRE-09 · Aviso de privacidad con base legal en el registro y en el portal Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task solo tras encargo de construcción y decisiones de producto resueltas. Steps use checkbox (`- [ ]`) syntax. Esta entrega no ejecuta el plan.

**Goal:** Versionar avisos aprobados por propósito y mostrarlos en cada formulario y portal.

**Architecture:** public-acquisition-privacy conserva servicios existentes; límites y alternativas están en el diseño propietario. La tarea produce un módulo/continuidad/evidencia concreta según preparación, sin simular dependencias ausentes.

**Tech Stack:** JavaScript/React/Workers/D1 y almacenamiento existente, node:test/D1 local. Gestión/activación solo documentación y evidencia cuando no requiere código. Sin dependencias nuevas por defecto.

**Spec:** [Diseño propietario](../specs/2026-11-08-public-acquisition-privacy-design.md), [tanda](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** Hermes gestiona acuerdos y cobertura; PRE-03 datos reales; PRE-33 referencias/estado; no textos legales inventados.

**Readiness:** conditional. Mecánica definida; contenido/cobertura/datos corporativos deben acreditarse por Hampton/Hermes antes de activar propósitos nuevos. Decisiones pendientes: ninguna propia; respetar gates externos y decisiones transversales abiertas.

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

1. unapproved_unavailable; wrong_purpose_not_reused; current_notice_preserved; fabricated_registration_rejected
2. version_revoked_before_submit; owner_form_unavailable_until_allowed; portal_link_contextual; marketing_unchecked
3. Cambios de permiso/fuente/revisión durante una operación impiden commit o dispatch y preservan historial mínimo sin restaurar contenido.
4. Ámbito de otra propiedad/persona/operación o dependencia ausente no se convierte en autoridad por un ID o fixture.

## Tarea 1 · Registro y lector de política aprobada

**Files:** Create server/privacy-policy.js y migración privacy_policy_versions; Test tests/server/privacy-policy.test.mjs.

**Interfaces:** getPublishedPrivacyPolicy(env,{purpose,locale:en})->{version,content,approved_at,approval_ref}|unavailable.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: unapproved_unavailable; wrong_purpose_not_reused; current_notice_preserved; fabricated_registration_rejected; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/privacy-policy.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Contenido/configuración por responsable con evidencia; no cambiar aviso vigente a borrador ni suponer registro JOIC confirmado por catálogo.
- [ ] Ejecutar `node --test tests/server/privacy-policy.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 2 · Contexto y evidencia en submit

**Files:** Modify site/apply.js, widget visitas, formularios nuevos y portal; Test tests/server/privacy-notice-submit.test.mjs.

**Interfaces:** Cada submit recibe privacy_version vigente del propósito y servidor valida estado; marketing separado y opcional.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: version_revoked_before_submit; owner_form_unavailable_until_allowed; portal_link_contextual; marketing_unchecked; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/privacy-notice-submit.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] No impedir derecho por rechazar marketing, no mezclar base necesaria con consentimiento genérico ni recopilar datos reales desde formularios apagados.
- [ ] Ejecutar `node --test tests/server/privacy-notice-submit.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Cierre futuro

- [ ] Resolver las decisiones humanas que afectan la tarea y actualizar spec/plan/readiness antes de construir ese tramo. Una investigación/gestión/activación no se declara código completo por estar planificada.
- [ ] Si hay código, npm test, npm run build y npm run check:release más regresiones focales. UI modificada: e2e y Playwright1280/390 con vacío/error/conflicto/teclado/foco/zoom200/consola/red; documentos puros no requieren producto artificial.
- [ ] Evidencia separado construido/integrado/verificado/activado, ledger de tarea y checklist/ESTADO al construir; revisión independiente futura y publicación/activación bajo autorización real de esa sesión. Nada ejecutado en estas casillas.
