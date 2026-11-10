# AUT-17 · Cerrar operatividad del correo ya construido Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **P · Tramo condicionado**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Cierre operativo del correo construido, no nuevo motor.

**Para ejecutar/completar:** Dominio/routing/bindings/destinos reales, configuración revisada y envío/respuesta autorizados. No suponer falta de plan o credenciales por no haber consultado. Decisiones: Q09. Verificaciones: V03, V05, V09, V13. Dependencias: Código existente email/outbound/inbound y jobs; responsable de cuenta.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Cerrar operatividad del correo ya construido.

**Architecture:** Ampliar servicios existentes con el contrato propietario definido en el diseño; mantener estado y evidencia por canal sin duplicar autoridades.

**Tech Stack:** JavaScript, D1, React y servicios existentes; documentación/evidencias para configuración, node:test para código.

**Spec:** [Diseño común](../specs/2026-11-08-list2-messaging-batch-design.md), [índice](2026-11-10-tp05-construction-index.md).

**Dependencies:** Plan/código de AUT-17 existentes; cuenta/dominio/runtimes y autorización futura.

## Global Constraints

- Solo planificación. Reconciliar código real y dependencias del spec antes de construir. Migraciones con siguiente ordinal libre entonces, ruta exacta registrada en alcance/ledger; no modificar aplicadas ni duplicar chat/correo/reloj/bandeja.
- Canal pendiente es pendiente, no operativo ni vacío. WhatsApp, Meta y proveedor IA conservan decisiones/permisos externos. No activar infraestructura, bots, modelos o envíos por este documento.
- C13 vigente: reply humano explícito del chat web sigue permitido durante pausa; automático y correo respetan AUT-11. Origen lo determina servidor. No convertir excepción en bypass de otro canal.
- Panel y superficies privadas: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion. Widget conserva identidad de su CSS actual.
- Inglés, labels/status/alert, loading/vacío/error/parcial/conflicto; staff/same-origin/no-store, chat bearer actual/Turnstile, safeHref/texto escapado. JSON131072bytes salvo límites específicos más restrictivos, lista50/poll30s visible; no PII/token de proveedor en storage/logs/Telegram. Excepción storage actual solo llave opaca del webchat, no contactos/drafts.
- Ponytail evita duplicados; impeccable product y antislop conservan flujo/copy; seguridad valida identidad/canales/versiones; rendimiento acota payloads/sondeo. Taste/redesign no aplican a estética nueva; sin assets/fuentes/dependencias nuevas. Documentación pura sin UI no necesita MCP o suite de producto.

## Review Focus

1. Lectura de preparación: casos de tarea1.
2. Propuesta concreta de activación: casos de tarea2.
3. Prueba real y conciliación: casos de tarea3.
4. Entrada no autorizada/origen/sesión/versión equivocada: rechazo sin efecto; pruebas de rutas correspondientes.
5. Caída/replay/respuesta tardía: no duplicar ni restaurar estado anterior; verificar en pruebas focales o evidencia operativa según superficie.

## Tarea 1 · Lectura de preparación

**Files:** docs/roadmap/work/AUT-17/readiness.md; server/email.js; jobs/wrangler.toml como referencia.

**Interfaces:** Checklist cuenta/plan/dominio/sending/routing/binding/recepción sin secretos.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Comprobar por canal autenticado existente, sin asumir ausente por no acceder. No mostrar env/bindings secretos ni cambiar cuenta. Distinguir código publicado de EMAIL_SERVICE_READY y servicio real; documentación oficial Email Workers API como referencia.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Validar sintaxis JSON cuando aplique, enlaces/fechas/evidencias y consistencia con contrato; no crear pruebas artificiales de app para este paso documental.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 2 · Propuesta concreta de activación

**Files:** docs/roadmap/work/AUT-17/activation-proposal.md.

**Interfaces:** Diff previsto y reversión de DNS/runtimes con valores privados fuera del repositorio.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Subdominio literal de recepción sin tocar MX del buzón habitual. Revisar snapshot privado y preparación de ambos runtimes antes de EMAIL_SERVICE_READY=true. Cambios reales solo con aprobación aplicable de sesión constructora, no aquí; no recrear motor de correo ni tocar proveedores alternativos.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Validar sintaxis JSON cuando aplique, enlaces/fechas/evidencias y consistencia con contrato; no crear pruebas artificiales de app para este paso documental.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Tarea 3 · Prueba real y conciliación

**Files:** docs/roadmap/work/AUT-17/acceptance.md; tests/server/email.test.mjs; tests/server/email-inbound.test.mjs.

**Interfaces:** Envío al destinatario aprobado y respuesta enlazada visible en Email.

- [ ] Leer fuente/contrato vigente y preparar casos de aceptación siguientes. Para código escribir las pruebas y demostrar fallo por comportamiento ausente, no por entorno.
- [ ] Verificar recepción real/identificador/respuesta privada, no solo accepted. Fallo o unknown no reintenta a ciegas. Resumen se revisa/activa en Automations, supresiones/pausa vigentes; registrar entrega y limitaciones reales. No habilita envío masivo o consultas/clientes no aprobados.
- [ ] Implementar/documentar la interfaz indicada y sus estados con control servidor/versión. Si la parte depende de cuenta/VPS/proveedor, preparar resultado concreto revisable y conservar su pendiente; no ejecutar cambios por inferencia ni inventar una capacidad.
- [ ] Validar sintaxis JSON cuando aplique, enlaces/fechas/evidencias y consistencia con contrato; no crear pruebas artificiales de app para este paso documental.
- [ ] Revisar diff, evidencia y alcance; guardar entrega acotada de archivos concretos. Sin secretos, datos personales, relevo privado ni git add general.

## Cierre futuro

- [ ] Contrastar task JSON AUT-17 con evidencia real y registrar construido/integrado/activado por separado en ledger/tarea/checklist/ESTADO. AUT-17 es cierre operativo de implementación existente, no otra implementación desde cero.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. Documentos puros: validación documental, sin suite de producto artificial.
- [ ] Revisión independiente futura, corregir hallazgos y conservar bloqueos externos. Servicios externos/infra/envíos reales solo con autorizaciones de la sesión ejecutora; fixture/fake no acredita entrega real ni permisos.
