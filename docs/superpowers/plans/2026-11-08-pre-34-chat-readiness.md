# PRE-34 · Requisitos separados de chat humano e IA Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **G · Gestión**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Requisitos actuales de chat web humano y sombra/assist.

**Para ejecutar/completar:** Separar webhumano/IA; no requisitos Meta/WhatsApp ni proveedores alternativos. Titularidad destino acordada; configuraciones y coberturas reales pendientes de comprobar. Decisiones: Q02, Q05, Q06, Q09. Verificaciones: V03, V08, V09, V13. Dependencias: ANA-09 WAF de web; resultados PRE-03/13/33 porHermes; AUT-05/13 paraIA.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Requisitos separados de chat humano e IA.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-10-tp05-construction-index.md).

**Dependencies:** PRE-03/13/33, ANA-09 y responsables de cuenta/proveedor.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Matriz de requisitos: casos de tarea1.
2. Propuesta de configuración: casos de tarea2.
3. Decisión de proveedor y cierre: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Matriz de requisitos

**Files:** docs/roadmap/work/PRE-34/readiness.json.

**Interfaces:** {requirement,phase,status,evidence_ref,checked_at,responsible_ref}.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Separar humano WAF/previews/bot/aviso e IA proveedor/documentación/revisión de privacidad. No afirmar certificaciones, DPA, retención o trámites aprobados sin evidencia; no redactar dictamen jurídico. Exigir revisión por responsable antes de enviar texto real a modelo.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Validar sintaxis JSON cuando aplique, enlaces/fechas/evidencias y consistencia con contrato; no crear pruebas artificiales de app para este paso documental.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Propuesta de configuración

**Files:** docs/roadmap/work/PRE-34/change-proposal.md.

**Interfaces:** Snapshot privado y diff previsto WAF/previews/bot, sin valores secretos.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Reutilizar regla ANA-09 de chat/stats, no regla paralela. Token nuevo en mecanismo existente y bot sin tocar Hermes2; primero resultado concreto revisable, después autorización de cambio por sesión ejecutora. Nada de abrir servicios o editar infraestructura ahora.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Validar sintaxis JSON cuando aplique, enlaces/fechas/evidencias y consistencia con contrato; no crear pruebas artificiales de app para este paso documental.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Decisión de proveedor y cierre

**Files:** docs/roadmap/work/PRE-34/model-decision.md; readiness.json.

**Interfaces:** Registro del proveedor/modelo/clase/cupos/evidencia o pending.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Modelo histórico no es elección actual. Verificar capacidades/condiciones oficiales del elegido; fallback necesita decisión propia, no automático. Validar documentos/enlaces y fases; no declarar todo PRE-34 completo porque funciona chat humano.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Validar sintaxis JSON cuando aplique, enlaces/fechas/evidencias y consistencia con contrato; no crear pruebas artificiales de app para este paso documental.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

- [ ] Contrastar task JSON PRE-34 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
