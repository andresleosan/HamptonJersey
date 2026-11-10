# ADM-21 · Rental accounting CSV exports Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta sesión sólo planifica; otra construye.

**Goal:** Exportación manual CSVnormalizada para contabilidad, sin integración externa.

**Architecture:** Extender servicios y tablas propietarios existentes según el diseño, con una sola autoridad de datos, versiones y efectos laterales acreditados. No reconstruir lo ya integrado ni completar dependencias con mocks.

**Tech Stack:** JavaScript ESM, Cloudflare D1/R2, React existente y node:test; sin proveedor/infra nuevo activado. Gestión documental cuando corresponda.

**Spec:** [Diseño de finance](../specs/2026-11-10-tp03-finance-design.md); [índice de tanda](2026-11-10-tp05-construction-index.md).

**Preparación:** Contrato definido para el alcance indicado; dependencias técnicas y activación no se suponen integradas.

**Dependencias:** ADM-09, ADM-10

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

## Task 1: Proyecciones contables y snapshot estable

**Files:**
- Create: `server/rental-accounting.js`.
- Create: `server/statements.js`.
- Modify: `server/routes/rent.js`.
- Test: `tests/server/adm-21-1.test.mjs`.

**Interfaces:** prepareAccountingExport(env,{from,to,type},actor)->{snapshot_id,row_count,schema_version}; streamAccountingRows(env,{snapshot_id,cursor,limit:500})->{rows,next}.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `payments_charges_statements_separate_record_types`.
  - `writeoff_not_cash_income`.
  - `only_closed_statements_exported`.
  - `cutoff_excludes_later_mutation`.
  - `export_does_not_mark_paid`.
- [ ] Ejecutar `node --test tests/server/adm-21-1.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: Primera salida CSV normalizada, sin APIs de Sage, Xero u otro servicio. Rango máximo366días,50000filas y bloques500; rechazar exceso sin truncarlo. Usar peniques, monedaGBP, dirección y fechasISO. Materializar el corte en lectura consistente o controlar su versión antes de entregar filas; no mezclar páginas de estados distintos.
- [ ] Ejecutar `node --test tests/server/adm-21-1.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Task 2: Descarga segura y filtros

**Files:**
- Create: `server/routes/rental-accounting.js`.
- Modify: `server/api.js`.
- Create: `admin/src/RentalAccounting.jsx`.
- Modify: `admin/src/Rentals.jsx`.
- Modify: `admin/src/App.jsx`.
- Test: `tests/server/adm-21-2.test.mjs`.

**Interfaces:** GET /admin/rental-accounting/export?from&to&type -> attachment text/csv; csvAccountingCell(value,{trustedNumeric:false})->string.

- [ ] Escribir casos de comportamiento con estas aserciones, incluidos límites y rechazos, usando sólo fixtures locales sintéticos:
  - `formula_equals_plus_minus_at_tabs_escaped`.
  - `csv_quotes_and_newlines_roundtrip`.
  - `unauthorized_export_403_no_rows`.
  - `no_bank_income_aml_fields`.
  - `same_snapshot_reexport_same_rows`.
- [ ] Ejecutar `node --test tests/server/adm-21-2.test.mjs`; comprobar fallo por comportamiento ausente, sin confundir error de entorno con regresión.
- [ ] Implementar las interfaces y rutas de esta tarea: UTF-8 y RFC4180, con apóstrofo protector antes de texto externo que pueda convertirse en fórmula. No adjuntar documentos o bancos. La pantalla muestra filtros, rango, cantidad, vacío y errores. Descarga con sesión, capacidad financiera y no-store; no inicia movimiento de fondos.
- [ ] Ejecutar `node --test tests/server/adm-21-2.test.mjs` y las regresiones de los módulos modificados; todos los casos deben pasar, sin proveedor simulado presentado como real.
- [ ] Revisar diff/archivos concretos y registrar un commit acotado tras validación. No añadir relevo privado, contratos, cuentas o datos reales a Git.

## Cierre futuro

**Condición exacta de cierre:** CSV de rentas y liquidaciones conciliados con orígenes/snapshot/fórmulas/permiso. Sin comisión interagencia ni dependencia OFE-08.

- [ ] Reconciliar spec/plan/contratos con main real; comprobar dependencias por código/migraciones/pruebas, no por estado remoto histórico ni nombre deplan. Revisar alcance antes de construir; no usar coordinador por la decisión posterior9nov, no tocarreservasantiguas.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release`. Interfaz: e2e/MCP a1280 y390 con datos sintéticos, teclado, foco, zoom200%, carga, error, conflicto, consola y red. Documentación: validar referencias/estructura sin tests de producto.
- [ ] Registrar evidencia en ledger propio, task/checklist/ESTADO sólo cuando se construya y con estado real; no declarar gestiónexterna/modelo/contrato/correo real comprobado con fixtures.
- [ ] Revisión independiente y correcciones antes de publicación; commit/migración/despliegue requieren autorización aplicable alSHAexacto. Este plan no autoriza ejecución.


## Contrato vigente de continuidad TP-05

[Forma exacta de referencias, dependencias y aceptación](../specs/2026-11-10-tp05-continuity-scope-design.md). Prevalece sobre la redacción histórica incompatible: no repositorio/archivos/llaves/bancos ADM-05 ni comisiones OFE-08. No nuevo servicio de documentos bajo otro nombre.
