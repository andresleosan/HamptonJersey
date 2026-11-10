# ADM-17 · Versioned tenancy rules Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta sesión sólo planifica; otra construye.

**Goal:** Parámetros/configuración y verificación de ámbito; no confirma registros o contratos externos.

**Architecture:** Extender servicios y tablas propietarios existentes según el diseño, con una sola autoridad de datos, versiones y efectos laterales acreditados. No reconstruir lo ya integrado ni completar dependencias con mocks.

**Tech Stack:** JavaScript ESM, Cloudflare D1/R2, React existente y node:test; sin proveedor/infra nuevo activado. Gestión documental cuando corresponda.

**Spec:** [Diseño de rental](../specs/2026-11-09-rental-lifecycle-completion-design.md); [índice de tanda](2026-11-10-tp05-construction-index.md).

**Preparación:** Contrato definido para el alcance indicado; dependencias técnicas y activación no se suponen integradas.

**Dependencias:** Sin otro código previo obligatorio; leer fuentes y maestro vigente.

**Decisiones pendientes:** Ninguna elección de producto nueva para el núcleo indicado; verificar puertas de activación del spec.

## Global Constraints

- Sólo planificación. Base main comprobada: f0d8eb73905e32b3f283c180cfc12f9149a3cb93. Al construir, revisar contratos reales y escoger el siguiente ordinal libre después de0036; no se reserva un ordinal ahora. Preservar entregas previas.
- Maestro vigente: informes a propietarios excluidos; documentos económicos y contractuales conservan su alcance separado. Meta, WhatsApp, Places/Properties, tours y modelos locales quedan fuera de esta fase. C3 nunca pasa por Hermes/Pro/Telegram. R01/R02/R04/R05 resueltas; R03/R06 cerradas por retirada. PRE-06 incluye Access. El índice TP-05 y maestro vigente prevalecen sobre el estado histórico de esta tanda.
- Sesión, same-origin, no-store, autorización por entidad/capacidad, revisión esperada y operation_id. Sin un nuevo rol owner/staff ni autoasignación de capacidad sensible. Eventos mínimos; ningún dato C3 en logs, localStorage o correo general. R2/D1 se concilian mediante intents, sin prometer atomicidad entre servicios.
- UI del panel: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d, ok#2f6b4f, err#a32020 y warn#fff6e5. Tenor Sans26/19px, Montserrat14px/1.5 y label12px; contenedor1240px/gutter16px, card24px/r14, inputr10, botón10x20px/r999 y celdas10x12px. Reflujo760px, foco2px/offset2px, contraste4.5texto/3controles, zoom200% y reduced-motion. Objetivo móvil44px propuesto para esta UI. Inglés, etiquetas/ARIA y estados de carga, vacío, validación, error y conflicto. La parte documental sin interfaz no necesita comprobación visual.
- Ponytail reutiliza AUT-07/AUT-17/NOT-11; impeccable y antislop mantienen controles y feedback concretos. Seguridad valida pertenencia, origen y formatos en servidor. Rendimiento: SQL indexado, lista50/cursor, streaming y sin polling de pestaña oculta. Taste/redesign no aplican a la continuidad de formularios existentes. PDF sólo usa las dependencias justificadas en el diseño; no instalar ahora.

## Review Focus

1. Identidad/capacidad/caso equivocados: denegar sin datos y sin efectos.
2. Versión o respuesta retenida de otra pestaña:409/revalidar, nunca restaurar dato retirado.
3. Repetición/resultado incierto: idempotencia, no doble contrato/envío/ajuste.
4. Datos ausentes/históricos: unknown y evidencia, nunca0/validación ficticia.
5. Efecto externo/financiero: proyección y registro difieren de acuse, cumplimiento o pago real.

## Task 1: Política versionada sin validar históricos por defecto

**Files:**
- Create: `server/tenancy-policy.js`.
- Modify: `server/rentals.js`.
- Create: `migrations/<ordinal_libre>_tenancy_policy.sql`.
- Test: `tests/server/adm-17-1.test.mjs`.

**Interfaces:** readTenancyPolicy(env,{as_of,agreement_on,regime,accommodation_scope})->{version,status,rules,source_refs}; saveTenancyPolicy(env,{expectedRevision,rules,source_refs,approved_evidence_ref,effective_from},actor)->PolicyVersion.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `legacy_defaults_are_unverified`.
  - `stale_policy_409_no_write`.
  - `date_range_selects_only_effective_version`.
  - `approval_requires_evidence`.
  - `unknown_scope_needs_review`.
- [ ] Ejecutar `node --test tests/server/adm-17-1.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Crear rental_policy_versions con versiones inmutables, fuente, ámbito, fecha y estado unverified|approved|retired. Una versión anterior conserva su historia y nunca recibe aprobación sintética. La capacidad de editar políticas la concede Hampton por un canal administrado; Users no permite autoasignarla.
- [ ] Ejecutar `node --test tests/server/adm-17-1.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Task 2: Aplicación y vista de evidencia

**Files:**
- Create: `server/routes/tenancy-policy.js`.
- Modify: `server/api.js`.
- Create: `admin/src/RentalPolicy.jsx`.
- Modify: `admin/src/App.jsx`.
- Test: `tests/server/adm-17-2.test.mjs`.

**Interfaces:** GET /admin/tenancy-policy?as_of=YYYY-MM-DD; POST /admin/tenancy-policy/versions; validateTenancyOperation({operation,tenancy,policy,today})->{allowed,issues}.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `unauthorized_policy_edit_403`.
  - `draft_allowed_without_legal_approval`.
  - `unverified_policy_blocks_legal_emission`.
  - `old_obligations_remain_collectable`.
  - `policy_view_has_sources_not_legal_certification`.
- [ ] Ejecutar `node --test tests/server/adm-17-2.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Registrar las rutas autenticadas en ROUTES y una vista dentro de Settings. Preservar datos y cálculos existentes con validación pendiente identificada. Una política aprobada sólo cubre sus actividades y operaciones; no activa correo ni autoriza administrar fondos.
- [ ] Ejecutar `node --test tests/server/adm-17-2.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Cierre futuro

**Condición exacta de cierre:** Motor, ruta, UI y consumidores reconciliados; aprobación legal/operativa real sigue siendo verificación de activación.

- [ ] Reconciliar spec/plan/contratos con main real; comprobar dependencias por código/migraciones/pruebas, no por estado remoto histórico ni nombre deplan. Revisar alcance antes de construir; no usar coordinador por la decisión posterior9nov, no tocarreservasantiguas.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release`. Interfaz: e2e/MCP a1280 y390 con datos sintéticos, teclado, foco, zoom200%, carga, error, conflicto, consola y red. Documentación: validar referencias/estructura sin tests de producto.
- [ ] Registrar evidencia en ledger propio, task/checklist/ESTADO sólo cuando se construya y con estado real; no declarar gestiónexterna/modelo/contrato/correo real comprobado con fixtures.
- [ ] Revisión independiente y correcciones antes de publicación; commit/migración/despliegue requieren autorización aplicable alSHAexacto. Este plan no autoriza ejecución.
