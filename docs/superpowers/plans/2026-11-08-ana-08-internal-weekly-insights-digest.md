# ANA-08 · Resumen semanal de Insights por email a la dirección Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task solo tras encargo de construcción y decisiones de producto resueltas. Steps use checkbox (`- [ ]`) syntax. Esta entrega no ejecuta el plan.

**Goal:** Preparar resumen semanal de Insights para dirección interna con muestra y destinatarios autorizados.

**Architecture:** measurement-completion conserva servicios existentes; límites y alternativas están en el diseño propietario. La tarea produce un módulo/continuidad/evidencia concreta según preparación, sin simular dependencias ausentes.

**Tech Stack:** JavaScript/React/Workers/D1 y almacenamiento existente, node:test/D1 local. Gestión/activación solo documentación y evidencia cuando no requiere código. Sin dependencias nuevas por defecto.

**Spec:** [Diseño propietario](../specs/2026-11-08-measurement-completion-design.md), [tanda](2026-11-10-tp05-construction-index.md), [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

**Dependencies:** AUT-17/07 activados y datos reales ANA-04/05/06, preferencias del equipo; sin propietario como destinatario.

**Readiness:** conditional. Resumen definido; configurar horario/destinatarios y correo real con muestra/recepción aprobadas antes de activación. Decisiones pendientes: ninguna propia; respetar gates externos y decisiones transversales abiertas.

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

1. disabled_no_recipients; one_snapshot_period; no_PII_feedback; coverage_included; not_daily_digest_duplicate
2. unknown_no_repeat; paused_respected; old_period_not_backlog; recipients_verified; owner_not_recipient
3. Cambios de permiso/fuente/revisión durante una operación impiden commit o dispatch y preservan historial mínimo sin restaurar contenido.
4. Ámbito de otra propiedad/persona/operación o dependencia ausente no se convierte en autoridad por un ID o fixture.

## Tarea 1 · Snapshot y elegibilidad semanal

**Files:** Create server/insights-digest.js y configuración por destinatario/período; Test tests/server/insights-digest.test.mjs.

**Interfaces:** prepareInsightsDigest(env,{period,policy_version},actor)->preview; weekday/time Jersey se configuran antes de activar.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: disabled_no_recipients; one_snapshot_period; no_PII_feedback; coverage_included; not_daily_digest_duplicate; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/insights-digest.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Defaults disabled/sin horario ni destinatarios elegidos por inferencia; no IA, no adjuntos de clientes o informe propietario.
- [ ] Ejecutar `node --test tests/server/insights-digest.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Tarea 2 · Envío revisado y cierre operativo

**Files:** Modify AUT-17 sender/jobs y panel de ajustes; Test tests/server/insights-digest-delivery.test.mjs.

**Interfaces:** Recibo único por destinatario/período, muestra aprobada y recepción real antes de cerrar activación.

- [ ] Escribir/ajustar pruebas con aserciones de estos casos: unknown_no_repeat; paused_respected; old_period_not_backlog; recipients_verified; owner_not_recipient; cubrir scope equivocado y revocación durante acción en el dueño de la ruta.
- [ ] Ejecutar `node --test tests/server/insights-digest-delivery.test.mjs` y verificar fallo por comportamiento ausente, o evidencia actual si es continuidad; no fabricar RED de una función ya construida.
- [ ] Compartir transporte sin otro cron; sin envíos ahora, no marcar recibido por respuesta fake.
- [ ] Ejecutar `node --test tests/server/insights-digest-delivery.test.mjs` hasta PASS y regresiones de servicios afectados. Fixture de proveedor no acredita cuenta/permiso/envío/control activo.
- [ ] Revisar diff/evidencia de unidad y guardar archivos concretos con mensaje inglés cuando se construya; no gitaddgeneral/relevo/secretos.

## Cierre futuro

- [ ] Resolver las decisiones humanas que afectan la tarea y actualizar spec/plan/readiness antes de construir ese tramo. Una investigación/gestión/activación no se declara código completo por estar planificada.
- [ ] Si hay código, npm test, npm run build y npm run check:release más regresiones focales. UI modificada: e2e y Playwright1280/390 con vacío/error/conflicto/teclado/foco/zoom200/consola/red; documentos puros no requieren producto artificial.
- [ ] Evidencia separado construido/integrado/verificado/activado, ledger de tarea y checklist/ESTADO al construir; revisión independiente futura y publicación/activación bajo autorización real de esa sesión. Nada ejecutado en estas casillas.
