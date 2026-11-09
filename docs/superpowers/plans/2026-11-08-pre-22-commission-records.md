# PRE-22 · Registrar acuerdos comerciales aportados, separados de acceso y fotos Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Registro humano de acuerdos comerciales conocidos.

**Para ejecutar/completar:** Campos permiten unknown/null y equipo aporta evidencia por acuerdo. No inventar comisión ni bloquear inventario/contacto/fotos por falta de acuerdo comercial. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03. Dependencias: AGE-04 base.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión construirá; esta entrega solo planifica.

**Goal:** Registrar acuerdos comerciales aportados, separados de acceso y fotos.

**Architecture:** Consumir servicios existentes y contratos propietarios del spec, con cambios aditivos, versiones y pruebas por tarea. No duplicar reloj/correo/inventario o autoridad.

**Tech Stack:** JavaScript, D1/R2, React o página privada según superficie; node:test/e2e de Hampton. Sin infraestructura nueva.

**Spec:** [Diseño compartido](../specs/2026-11-08-list2-agency-batch-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** AGE-04 integrado; información/documentos los aporta el equipo.

## Global Constraints

- Solo planificación; construcción futura en copia verificada y alcance propio. Migración aditiva: calcular siguiente ordinal libre y registrar ruta exacta antes de editar, sin renumerar las aplicadas. Adaptar tablas/servicios existentes en vez de duplicarlos.
- Disponibilidad general hasta información nueva, con fecha; llamada dos fechas lunes-viernes misma hora Jersey; revisión adicional para presentación. Auto no aprueba matches, criterios dictados o cierres. Respetar las dependencias externas del spec.
- UI de esta tanda: DESIGN.md Colors vigente7-nov, ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d no-texto/bronze-dk#86542d texto pequeño/ok#2f6b4f/err#a32020/warn#fff6e5/field-line#8f8a82. Tenor26/19px, Montserrat14px/1.5, label12/tabla12-600; card24/r14, inputr10, botón10px20px/r999/44px propuesto, celdas10px12px, contenedor1240/gutter16/reflujo760, foco2/offset2, contraste texto4.5/control3, zoom200/reduced-motion.
- Inglés, label/aria-describedby, status/alert, loading/vacío/error/parcial/conflicto. Staff/same-origin/no-store; portal grants por fila/medio. JSON131072bytes/lista50/poll30s visible; safeHref y texto escapado; no PII en logs/Telegram/localStorage ni HTML recibido activo.
- Ponytail reutiliza correo/reloj; impeccable product y antislop mantienen controles concretos; seguridad valida origen/versión/datos; rendimiento acota páginas. Taste/redesign no aplican a formularios de datos; sin assets/dependencias nuevas. Si no hay UI, reglas visuales/MCP no aplican a esa parte.

## Review Focus

1. Acuerdos tipados: casos enumerados en tarea1.
2. Detalle privado: casos enumerados en tarea2.
3. Separación funcional: casos enumerados en tarea3.
4. Sesión/origen inválidos o versión antigua: pruebas de rutas,401/403/409 y cero escritura.
5. Error/respuesta tardía: pruebas de conflicto/recarga sin restaurar el estado anterior. Si módulo es documental, validar su referencia/versionado, sin prueba web artificial.

## Tarea 1 · Acuerdos tipados

**Files:** server/advertiser-agreements.js; esquema aditivo solo si details actual no basta; prueba `tests/server/advertiser-agreements.test.mjs`.

**Interfaces:** recordAdvertiserAgreement(env,{advertiser_id,version,status,operation,terms,currency,rate,evidence_ref},actor).

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] missing_rate_null_not_zero, agreement_not_inferred, permission_not_implied. Importe original/moneda y términos explícitos, sin porcentaje inventado ni negociación IA. Evidencia privada, actor/fecha e historial; borrador no es confirmado.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/advertiser-agreements.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 2 · Detalle privado

**Files:** server/routes/advertisers.js; admin/src/AdvertiserAgreement.jsx; prueba `tests/server/advertiser-agreement-routes.test.mjs`.

**Interfaces:** GET/POST /api/admin/advertisers/:id/agreements con version.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] staff_only, stale_version_409, attachment_ref_not_public. Mostrar estado y fecha si aportada, sin afirmar contrato firmado por una casilla; validar FK/operación, no modificar contactos o permisos.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/server/advertiser-agreement-routes.test.mjs` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Tarea 3 · Separación funcional

**Files:** tests/advertiser-agreement-ui.test.js; docs/roadmap/tasks/PRE-22.json; prueba `tests/advertiser-agreement-ui.test.js`.

**Interfaces:** Consultar acuerdo como referencia privada de AGE-04.

- [ ] Crear pruebas de comportamiento con los casos/aserciones siguientes; verificar fallo que demuestre comportamiento ausente, no un fallo de entorno.
- [ ] consultation_without_agreement_allowed, photo_permission_independent, commission_not_in_initial_message. Formulario existente y pruebas de controles, checks/MCP. Ningún acuerdo se vuelve requisito general de inventario/contacto/visita.
- [ ] Implementar la interfaz indicada con validación/versión en servidor y reglas del spec. Si el contrato real integrado difiere, reconciliar nombres y consumidores antes de editar; no crear funciones proveedoras ficticias.
- [ ] Ejecutar `node --test tests/advertiser-agreement-ui.test.js` y pruebas de rutas/regresiones relacionadas; esperar éxito de todos los casos. Si solo cambia documentación, validar sintaxis/enlaces/evidencias en vez de suite artificial.
- [ ] Revisar diff y commit acotado de archivos concretos tras validación. No git add general, relevo privado ni datos reales.

## Cierre futuro

- [ ] Contrastar aceptación de PRE-22 en task JSON con evidencias reales; ledger propio y actualización tarea/checklist/ESTADO solo al construir, no durante esta planificación. Distinguir código, integración, aceptación de proveedor y activación real.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e con datos sintéticos y MCP1280/390, éxito/validación/vacío/error/parcial/conflicto/teclado/foco/zoom200/consola/red. No dos e2e generales simultáneos en el host.
- [ ] Revisión independiente futura y corrección de hallazgos; publicación/migración bajo autorización constructora. Fake no acredita envío/modelo/canal real ni una ficha acredita activación.
