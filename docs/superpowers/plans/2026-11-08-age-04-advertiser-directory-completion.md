# AGE-04 · Completar directorio de anunciantes y teléfonos Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

**Preparación vigente · revisión 8-nov-2026:** **D · Diseño definido**. [Matriz por tarea](2026-11-09-list2-build-ready-github.md) y [decisiones](2026-11-09-list2-build-ready-github.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Directorio base actual y enlaces tipados ampliados.

**Para ejecutar/completar:** Separar base de nuevos enlaces: no ciclo con BUS-06. Todos los teléfonos/titulares en llamada y supresión AGE-14 respetada. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V03, V11. Dependencias: Base0030/Advertisers ya existente se verifica; enlaces nuevos consumen BUS-06/BUS-10; llamada final con AGE-08.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Otra sesión ejecutará; solo planificación aquí.

**Goal:** Completar enlaces tipados entre anunciantes e inventario y ofrecer todos los teléfonos vigentes a la tarea de llamada, reutilizando directorio construido.

**Architecture:** Misma entidad advertisers y proyección sin copias de PII. Backfill tipado conserva IDs de namespaces antiguos/nuevos; AGE-14 mantiene supresión.

**Tech Stack:** JavaScript, Cloudflare D1/Workers/Pages y React existentes cuando corresponda; Node test para código; documentos y evidencia privada para decisiones/configuración. Sin nuevas dependencias.

**Spec:** [Diseño propietario §1](../specs/2026-11-08-list2-connectors-completion-design.md), [índice de tanda](2026-11-09-list2-build-ready-github.md).

**Dependencies:** Código/migración0030 reales se reconcilian primero; BUS-06/10 para kinds de inventario cuando existan; AGE-08 para llamada final; publicación autorizada del SHA/migración para activación.

## Global Constraints

- Solo planificación: otra sesión ejecuta. Reconciliar base/código real, scope propio y dependencias antes de construir; este documento no reserva ni autoriza publicar, instalar servicios, activar modelos o enviar mensajes.
- No duplicar jobs C0, reloj, directorio, fichas/modes/outbound. Migraciones aditivas con siguiente ordinal libre comprobado al ejecutar, registrar ruta exacta en alcance/ledger; no editar migraciones aplicadas.
- Datos: conexión central Pro/Hermes con C0 revisado; C1/C2 solo tras verificar vía/condiciones/acuerdos y purpose; C3 solo local y nunca Hermes/Telegram. Quitar teléfono/email no certifica anonimización. Cuota inicial0; unknown tras dispatch sin reintento/fallback automático.
- UI actual: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d foco/decoración, bronze-dk#86542d texto pequeño, ok#2f6b4f, err#a32020, warn#fff6e5, field-line#8f8a82. CSS vigente prevalece sobre colores históricos de DESIGN.md; Typography/Hierarchy(panel), Layout y Components: Tenor26/19px400, Montserrat14px/1.5, label12px, card24px/r14, inputr10, botón10px20px/r999, página1240/gutter16/24arriba/120abajo, celdas10px12px, reflujo760. Acción nueva44px es propuesta; foco2/offset2, contraste4.5texto/3control, zoom200/reduced-motion.
- UI inglesa existente con loading/empty/error/pending/disabled/conflict y labels/status/alert, sin fuentes/assets/dependencias nuevas. Staff/same-origin/no-store y salida escapada/React/safeHref. JSON128KiB salvo específico más restrictivo, lista50/poll30s visible. No secretos/PII/prompts en URL/storage/logs/Telegram; no leer almacenes privados para planificar.
- Avanzar mantiene catálogo; writing-plans interfaces/pasos; ponytail reutiliza; seguridad y frontend-security validan; impeccable/antislop aplican al flujo existente; web-performance acota carga. Taste/redesign no requieren nueva estética. Playwright no aplica a documentación pura. C13 humana web conserva excepción; ningún automático/correo/Meta la hereda.

## Review Focus

1. same_id_different_namespace_distinct; existing_arrays_preserved; missing_target_rejected; tombstone_reference_not_resurrected; absent_market_tables_pending; conflicting_old_new_write_409. Unique(advertiser_id,kind,target_id), no sobrescritura parcial por PUT concurrente.
2. two_agencies_all_phone_labels; shared_number_two_holders_preserved; different_unit_not_mixed; no_phone_clear_empty; suppressed_contact_excluded; old_put_cannot_restore; commission_or_photo_unknown_still_callable. Misma propiedad con distinta operación usa alcance correcto.
3. keyboard_phone_holder_visible; stale_get_after_suppression_hidden; save_conflict_preserves_input; multiple_listing_same_property_all_phones; retained_deleted_listing_context_minimal. MCP1280/390 + zoom200 y muestra de llamada multiagencia; migración local no prueba producción.
4. Actor/purpose/origen/versión distintos no permiten heredar autorización ni sobrescribir datos; comprobar en la tarea propietaria del servicio o matriz documental.
5. Una dependencia externa desconocida, un fake o una respuesta incierta conserva su estado pendiente; no se convierte en conectado, enviado, permitido o activado. Cubrir en aceptación de tarea3.

## Tarea 1 · Enlaces tipados y backfill compatible

**Files:** Create: server/advertiser-links.js; Modify: server/routes/advertisers.js; Create migración aditiva advertiser_reference_links, no reescribir0030; Test: tests/server/advertiser-links.test.mjs.

**Interfaces:** AdvertiserRefLink={kind:'research_source'|'hampton_listing'|'market_source'|'market_listing'|'property',id}; updateAdvertiserLinks(env,advertiser_id,{version,links},actor).

- [ ] Preparar casos concretos: same_id_different_namespace_distinct; existing_arrays_preserved; missing_target_rejected; tombstone_reference_not_resurrected; absent_market_tables_pending; conflicting_old_new_write_409. Unique(advertiser_id,kind,target_id), no sobrescritura parcial por PUT concurrente.
- [ ] Escribir esas pruebas en `tests/server/advertiser-links.test.mjs` y ejecutar `node --test tests/server/advertiser-links.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Migrar arrays con tipos expresos y compatibilidad de lectura, una autoridad para escribir links/versiones. Validar targets con dueño real; kinds BUS no integrados deshabilitados. Conservar listado y revisiones11/12meses; no reconstruir pantalla ni borrar datos.
- [ ] Ejecutar `node --test tests/server/advertiser-links.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 2 · Proyección de teléfonos de todas las agencias

**Files:** Create: tests/server/advertiser-call-contacts.test.mjs; Modify: server/advertiser-links.js y consumidor AGE-08 cuando esté integrado.

**Interfaces:** listAdvertiserCallContacts(env,{property_id,operation_key})->{advertisers:[{id,kind,contacts,channels}],version_refs}; solo staff y lectura actual, sin snapshot permanente de teléfonos.

- [ ] Preparar casos concretos: two_agencies_all_phone_labels; shared_number_two_holders_preserved; different_unit_not_mixed; no_phone_clear_empty; suppressed_contact_excluded; old_put_cannot_restore; commission_or_photo_unknown_still_callable. Misma propiedad con distinta operación usa alcance correcto.
- [ ] Escribir esas pruebas en `tests/server/advertiser-call-contacts.test.mjs` y ejecutar `node --test tests/server/advertiser-call-contacts.test.mjs`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Resolver links de publicaciones/fuentes a inmueble/operación con identidad BUS-10 y mostrar titular/etiqueta junto a cada número. Deduplicación limitada dentro del mismo contacto sin perder original. Consumidor AGE-08 consulta vigente y respeta invalidación/supresión AGE-14, no registra PII en logs.
- [ ] Ejecutar `node --test tests/server/advertiser-call-contacts.test.mjs`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Tarea 3 · Pantalla y cierre operativo parcial existente

**Files:** Modify: admin/src/Advertisers.jsx y superficie llamada AGE-08; Test: tests/advertiser-directory-ui.test.js; Create: docs/roadmap/work/AGE-04/completion-acceptance.md.

**Interfaces:** Detalles actuales conservan comisión/nota de fotos como antecedentes, sin sustituir PRE-22/AGE-10; links y contactos versionados.

- [ ] Preparar casos concretos: keyboard_phone_holder_visible; stale_get_after_suppression_hidden; save_conflict_preserves_input; multiple_listing_same_property_all_phones; retained_deleted_listing_context_minimal. MCP1280/390 + zoom200 y muestra de llamada multiagencia; migración local no prueba producción.
- [ ] Escribir esas pruebas en `tests/advertiser-directory-ui.test.js` y ejecutar `node --test tests/advertiser-directory-ui.test.js`. Esperar fallo por comportamiento ausente, no por dependencias/entorno. Fixtures sintéticos, sin credenciales/datos de personas.
- [ ] Añadir referencias y teléfonos en vistas existentes con error/pending/conflicto; verificar qué ya está integrado/publicado antes de pedir migración. Sin eliminación nueva aquí. Cierre exige evidencia de flujo real y autorización del SHA/migración, separadas de preparación de plan.
- [ ] Ejecutar `node --test tests/advertiser-directory-ui.test.js`; todos los casos deben pasar. Añadir la suite existente de rutas/proxy afectadas, sin activar proveedores para hacer verde la prueba. Registrar aceptación externa por separado.
- [ ] Revisar diff/evidencia y guardar entrega acotada con archivos concretos y mensaje en inglés cuando corresponda al flujo de construcción. No `git add .`, ni secretos, relevo privado o originales de Luis en Git.

## Cierre futuro

- [ ] Registrar evidencia por requisito y estado construido/integrado/configurado/activado en ledger propio, task AGE-04, checklist/ESTADO. Permisos/decisiones pendientes permanecen explícitos; un plan no los satisface.
- [ ] Para código: `npm test`, `npm run build`, `npm run check:release` y pruebas focales anteriores. Para UI: e2e/MCP local1280/390, éxito/validación/vacío/error/conflicto, teclado/foco/zoom200/consola/red. Documentación pura: revisión de contenido/enlaces/whitespace, sin suite de app ni MCP.
- [ ] Revisión independiente futura y corrección de hallazgos. Infraestructura/cuenta/credenciales/envíos/migración/publicación solo con alcance y autorizaciones reales de la sesión ejecutora; aprobación de esta tanda no activa servicios. Si un contrato de proveedor sigue sin concederse, registrar preparada la rama condicional, no implementación operativa completa.
