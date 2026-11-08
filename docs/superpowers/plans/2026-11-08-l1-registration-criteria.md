# SAP-10 REG-06 REG-12 explicit registration criteria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega autoriza solo planificación; no iniciar implementación. La coordinación conserva la revisión independiente final.

**Goal:** Guardar respuestas de zona explícitas, confirmar cambios humanos y informar alta/resultados sin promesas falsas.

**Architecture:** Tres unidades independientes amplían validación compartida y UI existente; cada una conserva la frontera de duplicados, versiones y estado de búsqueda.

**Tech Stack:** React19, JavaScript ES modules, Cloudflare Pages/Workers y D1/SQLite; pruebas Node y harness e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1-registration-criteria-design.md).

## Global Constraints

- Base comprobada main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo documentos ahora; construir exige alcance/reserva build y aprobación del diseño según el flujo vigente.
- No cambiar estados del catálogo durante la planificación; las dependencias indicadas son las vigentes, no nuevas filas del catálogo.
- Toda API privada usa rutas autenticadas existentes (flag `true`) y validación servidor; no resolver autorización en el navegador.
- Una lectura fallida no equivale a cero resultados; escrituras obsoletas responden409, desaparecidas404, inválidas400, sin repetir efectos por reintento ciego.
- **UI vigente comprobada, no la cabecera antigua de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, stone `#6b665e`, mist `#f4f3f0`, line `#e3e0da`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, paper `#ffffff`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui 14px/1.5; Tenor Sans/Georgia H1 26px, H2 19px, peso400; labels12px; botones600 12px tracking `.08em`, padding10px20px, radio999px, hoverbronze-dk, disabled opacity`.45`. `.card` padding24px/radio14px/borde1px line/sombra `0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22)`; campos fondo`#fbfaf8`, borde field-line, radio10px, padding9px12px. `.page`1240px padding24px16px120px; `.seg` gap2px/padding3px, botones7px16px; `.inline` gap12px; `.badge`11px/padding3px10px; miniatura72×54/radio8px. Foco2px bronze offset2px. Tabla apila a760px; editor actual a900px. Mantener estos umbrales; para piezas nuevas apilar a760px, sin nuevas fuentes/colores/sombras. Texto normal≥4.5:1; foco/borde≥3:1; estado con etiqueta además del color. Copy público/API/panel en inglés. Reusar `.btn/.card/.seg/.badge/.empty/.warn/.actionbar`; navegación de pestañas con flechas/Home/End; mensajes status/alert; foco restaurado y errores asociados; zoom200%, reduced-motion. Sin librerías nuevas, sin PII en storage/URLs/logs; React escapado, enlaces internos por ID y externos con helpers seguros. Imágenes dimensionadas/lazy, CLS<0.1; sin N+1 ni polling nuevo.

**Web vigente:** `site/index.html`: ink`#151515`, paper`#ffffff`, mist`#f4f3f0`, line`#e3e0da`, stone`#77736c`, bronze`#a56b3d`, bronze-dk`#86542d`, ok`#2f6b4f`, campo`#fbfaf8`; cuerpo Montserrat/Helvetica Neue/Arial15px/1.65; Tenor Sans/Gill Sans/Optima; contenedor1240px, gutter`clamp(16px,4vw,40px)`, sección`clamp(56px,8vw,104px)`, botones13px28px/radio999px, campo13px14px/radio12px, tarjeta16px/grandes24px. En los controles tocados adoptar explícitamente stone`#6b665e`, texto bronce pequeño/fondo de botón hover`#86542d` y borde`#8f8a82` para contraste; son cambios propuestos de pantalla, no tokens públicos globales ya existentes. Mantener `.opts` con radios nativos y foco visible, no chips sin semántica. Tipos de controles/formulario existentes; errores junto a cada dato, aria-invalid/describedby y status/alert. Layout nuevo a760px y revisión390/1280. No ampliar la tipografía hero ni trasladar valores obsoletos de reconciliación. Mantener presupuestos de imagen y carga diferida, ninguna fuente/librería nueva.

## Review Focus

- Vacío legado no acredita Anywhere ni preferencia (Task1).
- Cambiar un valor después de marcar confirmación invalida la declaración (Task2).
- Dos empleados/recálculo tardío no sobrescriben una versión posterior (Tasks2/3).
- Email repetido/contactos cruzados no exponen identidad o resultados (Task3).
- Cero real, inventario no comprobado y motor comercial no soportado son distintos (Task3).

## Archivos y fronteras

REG06: crear `migrations/0033_l1_area_answers.sql` propuesta (verificar secuencia al construir); modificar `site/requirements.js`, `site/apply.js`, `site/index.html` (controles), `server/applicants.js`, `server/matching.js`, `server/requirements.js`, `server/match-store.js`, `server/routes/matches.js`, `server/routes/applicants.js`, `admin/src/ApplicantFields.jsx`, `admin/src/ApplicantDetail.jsx`, `admin/src/format.js`. No existe exportador de aplicantes; no crearlo aquí. SAP10: validador/ruta/ficha citados. REG12: crear `server/registration-result.js`; modificar `server/routes/public.js`, `server/routes/applicants.js`, `site/apply.js`, `admin/src/ApplicantDetail.jsx` para consumo del productor EST01/SAP01 integrado; sin otra migración ni cambios de retorno de recomputeForApplicant. Tests: ampliar `tests/apply.test.js`, `tests/server/applicants-validate.test.mjs`, `tests/server/requirements-matching.test.mjs`, `tests/server/applicants.test.mjs`, `tests/server/applicants-public.test.mjs`; crear `tests/server/registration-result.test.mjs`, `tests/registration-criteria.e2e.cjs`.

### Task1: REG-06 respuesta explícita de zona

**Interfaces:** locationAnswer/hasAnswer/notApplicable/prioritiesFor y campos area_answer/preferred_parish de spec; validateApplicant mantiene firma; toForm/toBody preservan NULL legado y listas. Integración REG08/0031 verificada antes de activar.

- [ ] Añadir tests REG06-A1–A7: selected con varias/preferida válida; any+exclusión; unknown imprescindible pendiente; vacío NULL legado; preferida fuera de selección/excluida400; presupuesto/mascotas/parking conservados; duplicate público sin overwrite; desempate de preferida solo con mismo grupo/score. Filtro parish de Applicants no presenta vacío legado como respuesta consciente.
- [ ] Ejecutar `node --test tests/server/applicants-validate.test.mjs tests/server/requirements-matching.test.mjs tests/apply.test.js`; esperarRED por contrato nuevo.
- [ ] Implementar migración NULL sin backfill, validación y helpers compartidos; propagar campos a SELECTs de evaluación/recálculo/rutas. Integrar desempate con compareRequirements/BUS14 sin alterar grupo/score; transportar preferred_parish al ranking actual, sin pesos nuevos.
- [ ] Añadir radios/selector a web y panel. Restauración de sesión antigua no inventa respuesta. Cambio any/unknown avisa antes de retirar selección/preferencia; cancelar conserva datos, vetos y prioridades. Duplicados públicos mantienen revisión existente.
- [ ] Repetir pruebas y E2E REG06-A1–A7:390/1280, teclado/labels/foco/errores/contraste y zoom200%. No publicar REG08/0031 como consecuencia de esta planificación.

### Task2: SAP-10 confirmación humana del cambio

**Interfaces:** criteriaDiff(before,after):string[]; PUT admite criteria_confirmation como comando, no campo persistente de búsqueda. Estado de reconocimiento en ApplicantDetail ligado al diff canónico: cualquier mutación lo revoca, no boolean global permanente.

- [ ] Añadir tests SAP10-A1–A6: Use this sin requests; Save de criterios sin confirmación400; confirmación válida registra actor/at/fields del servidor; versión obsoleta409 sin recálculo; cambio/Reload revoca reconocimiento; contacto/stage/owner/solo idioma-franjas no lo exigen; borrador AUT19 sin aplicar.
- [ ] Ejecutar `node --test tests/server/applicants.test.mjs`; esperarRED de casos nuevos.
- [ ] Validar comando después de calcular diff y antes del batch; usar LOCK/saveVersioned, evidencia dentro de evento existente y recálculo tras commit. Log conversation no se dispara por propuesta, alternativa o dictado.
- [ ] Añadir resumen guardado→borrador, checkbox y errores accesibles en Save de Requirements. Use this solo rellena formulario; top20 permanece interno.409 conserva borrador y ofrece Reload sin sobreescribir otra versión.
- [ ] Repetir pruebas/E2E dos pestañas: solo ganador escribe y recalcula; actividad/search_state no cambian al crear borrador. No modificar política Paused/D12 ni cerrar por interés.

### Task3: REG-12 acuse y consumo de progreso

**Interfaces:** `missingSearchEssentials(applicant):MissingSearchEssential[]` y `toRegistrationResult(applicant,searchProgress,classifiedCounts):RegistrationResultV1` en server/registration-result.js; DTO de spec con search_progress exactamente SearchProgressV1 del productor EST01/SAP01. Consumir detail/progress actual, tabla applicant_search_progress y CheckTicket del plan previo; no nueva telemetría, timestamps, tickets o API de reintento. Post público conserva201{ok:true} en ambos caminos.

- [ ] Tests REG12-A1–A6: alta/repetida/contactos cruzados misma respuesta; succeeded actual con0 distinto running/failed/unsupported/unrecorded/unverifiable/needs_recheck; faltantes solo must/priority unknown aplicables. Dos operaciones independientes, sin nueva alta o exposición de matches previos. Prueba de contrato: registro abre exactamente un CheckTicket por recompute y no existen dos marcadores incompatibles; fallo conserva alta y productor registra failed, no guardado revertido ni0 ficticio.
- [ ] Ejecutar `node --test tests/server/registration-result.test.mjs tests/server/applicants-public.test.mjs`; esperarRED por proyección nueva.
- [ ] Implementar proyección pura y añadirla al detail con la misma instantánea/versión del productor; clasificación actual no verificable=>null. Conservar waitUntil/afterSave y `{created}` de recomputeForApplicant, sin ruta paralela. Productor integrado protege generación/versión/actividad y éxito atómico; no asumir progreso por evento o longitud de matches.
- [ ] Añadir aviso compacto de esenciales con enlaces a campos. Reusar componente SearchProgress/copy «Inventory check» y polling existentes, sin duplicar regiones live ni requests. Reload status es solo lectura, nunca matching. Sustituir acuse público por literal de spec igual para ambos caminos, sin IDs/resultados privados/promesa de disponibilidad.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y e2e por cabecera vigente más nuevo harness, con fixtures locales. MCP Playwright 1280/390 zoom200%, teclado/foco/errores/carga/parcial, consola/red, fallo del productor y dos empleados. Sin llamadas reales ni cambios de producción.
- [ ] Comparar consultas y carga diferida apply.js, CLS<0.1. Tras construcción/revisión independiente actualizar cada código por sus criterios en JSON/ESTADO y renderizar catálogo; no completar upstream ni publicar/migrar sin autorización separada.
