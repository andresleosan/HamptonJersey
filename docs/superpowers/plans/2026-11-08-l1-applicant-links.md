# SAP-08 applicant resource links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Esta entrega autoriza solo planificación; no iniciar implementación. La coordinación conserva la revisión independiente final.

**Goal:** Relacionar visitas, chats y correo con búsquedas explícitas y mostrar las dos pestañas.

**Architecture:** Relaciones pequeñas con FK alimentan listas paginadas y deep links a editores actuales; canales se verifican de forma independiente.

**Tech Stack:** React19, JavaScript ES modules, Cloudflare Pages/Workers y D1/SQLite; pruebas Node y harness e2e existentes.

**Spec:** [diseño](../specs/2026-11-08-l1-applicant-links-design.md).

## Global Constraints

- Base comprobada main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo documentos ahora; construir exige alcance/reserva build y aprobación del diseño según el flujo vigente.
- No cambiar estados del catálogo durante la planificación; las dependencias indicadas son las vigentes, no nuevas filas del catálogo.
- Toda API privada usa rutas autenticadas existentes (flag `true`) y validación servidor; no resolver autorización en el navegador.
- Una lectura fallida no equivale a cero resultados; escrituras obsoletas responden409, desaparecidas404, inválidas400, sin repetir efectos por reintento ciego.
- **UI vigente comprobada, no la cabecera antigua de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, stone `#6b665e`, mist `#f4f3f0`, line `#e3e0da`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, paper `#ffffff`, warn-bg `#fff6e5`, field-line `#8f8a82`. Montserrat/system-ui 14px/1.5; Tenor Sans/Georgia H1 26px, H2 19px, peso400; labels12px; botones600 12px tracking `.08em`, padding10px20px, radio999px, hoverbronze-dk, disabled opacity`.45`. `.card` padding24px/radio14px/borde1px line/sombra `0 1px 2px rgba(20,20,20,.04),0 12px 32px -18px rgba(20,20,20,.22)`; campos fondo`#fbfaf8`, borde field-line, radio10px, padding9px12px. `.page`1240px padding24px16px120px; `.seg` gap2px/padding3px, botones7px16px; `.inline` gap12px; `.badge`11px/padding3px10px; miniatura72×54/radio8px. Foco2px bronze offset2px. Tabla apila a760px; editor actual a900px. Mantener estos umbrales; para piezas nuevas apilar a760px, sin nuevas fuentes/colores/sombras. Texto normal≥4.5:1; foco/borde≥3:1; estado con etiqueta además del color. Copy público/API/panel en inglés. Reusar `.btn/.card/.seg/.badge/.empty/.warn/.actionbar`; navegación de pestañas con flechas/Home/End; mensajes status/alert; foco restaurado y errores asociados; zoom200%, reduced-motion. Sin librerías nuevas, sin PII en storage/URLs/logs; React escapado, enlaces internos por ID y externos con helpers seguros. Imágenes dimensionadas/lazy, CLS<0.1; sin N+1 ni polling nuevo.

## Review Focus

- Dos búsquedas y teléfono coincidente no autorizan vínculo (Task1, isolation).
- Recurso borrado entre preview y guardar no deja huérfanos (Task1, delete race).
- Unlink/relink evita ABA mediante UUID (Task1, relink race).
- Mensaje más reciente o deep link fuera de primera página abre contexto correcto (Task2, selection race).
- Correo no activo y cuerpos purgados preservan lectura honesta sin bloquear otros canales (Task3, channel state).

## Mapa y orden

Task1 V: crear `migrations/0032_l1_applicant_links.sql` según nombre propuesto de spec, `server/applicant-links.js`, `admin/src/ApplicantLinks.jsx`, `tests/server/applicant-links.test.mjs`; modificar `server/routes/applicants.js`, `server/routes/inbox.js`, `admin/src/ApplicantDetail.jsx`, `admin/src/Viewings.jsx`, `admin/src/App.jsx`, `admin/src/styles.css`; crear `tests/applicant-links.e2e.cjs`. Task2 C: extender módulo/migración propuestas (si aún no aplicada; si aplicada crear siguiente migración aditiva), `server/routes/chats.js`, `admin/src/Messages.jsx`, pruebas `tests/server/chats-admin.test.mjs`. Task3 E: extender relaciones y `server/routes/email.js`, `admin/src/Email.jsx`, `tests/server/email-admin.test.mjs`. Revisar nombres de migración antes de construir junto con resto de Lista1; nunca editar una migración ya aplicada.

### Task1: vínculos y pestaña Viewings

**Interfaces:** Funciones/rutas/DTO de spec. `ApplicantLinks({applicantId,kind:'viewing',onChanged?}):JSX`; `Viewings({listing,viewingId,applicantId?})` consume query validada por App. En createViewing aceptar `applicant_id?:number` con búsqueda explícita y snapshot mostrado, validar servidor y escribir vínculo dentro del mismo DB.batch que bookStatement. Visita sin applicant_id sigue contrato actual.

- [ ] Escribir tests isolation, últimos9, sin backfill, FK cascade, shared resource, ID inexistente 404, body/enum/cursor 400, sesión401/403, archived 409, recurso cambia 409 y eliminación/relink ABA. Comprobar doble PUT idéntico no duplica y doble book hueco solo gana uno; vínculo solo existe si INSERT de visita gana. SQL 250 recursos => consultas constantes, página25+next.
- [ ] `node --test tests/server/applicant-links.test.mjs`; esperarRED por módulo ausente.
- [ ] Implementar migración, list/put/delete parametrizadas y rutas autenticadas. Auditoría atómica con linkage y labels explícitos applicant.resource_linked/unlinked en Timeline; si versión cambia dentro del batch rollback 409. Sacar correlaciones de Timeline a posibles; conservar compatibilidad sin llamar a ellas vinculadas. No duplicar PII de contacto ni alterar búsqueda/retención por una lectura.
- [ ] Añadir tab Viewings, preview/confirmación de asociación y unlink, deeplink selecciona visita exacta aunque esté fuera de filtro; nueva GET autenticada `/admin/viewings/:id` en server/routes/inbox.js y editor de Viewings, porque hoy no existe lectura individual de visita, con 404 cuando falta. Preservar notas/borrador de Viewings al navegar según guard unsaved existente.
- [ ] Ejecutar tests nuevos, `node --test tests/server/viewings-admin.test.mjs tests/server/applicants.test.mjs`; verificar PASS. E2E V1–V4 y G1–G3 de spec con fixtures locales.
- [ ] Preparar revisión/commit futuro V; marcar SAP08 parcial hasta C/E, no ejecutar en esta entrega.

### Task2: Messages · chat

**Interfaces:** mismo DTO/rutas kind chat; `Messages({chatId?:number,...existingProps})` con lectura autenticada `/admin/chats/:id` existente. No acceso al chat bearer ni key_hash en el cliente admin.

- [ ] Escribir pruebas C1/C2 y aislamiento multi búsqueda, chat borrado/retención y nueva respuesta durante vínculo 409. E2E selecciona chat answered fuera de waiting/primeros 200; Escape/cancel no guarda.
- [ ] Ejecutar `node --test tests/server/applicant-links.test.mjs tests/server/chats-admin.test.mjs`; verificar RED de nuevos casos.
- [ ] Completar FK chat/lista/attach y filtro Website chat en tab Messages; enlazar a editor existente con selección explícita y version preview, sin consulta heurística por email/teléfono y sin duplicar compositor/polling.
- [ ] Repetir pruebas; MCP Playwright 1280/390: enlaces correctos, foco/tab/flechas, borrado mientras abre 404, error/reintento, no mezcla de respuestas tardías al cambiar applicantId.

### Task3: Messages · correo y cierre por tramos

**Interfaces:** mismo DTO kind email/box; `Email({box?:'inbound'|'outbound',messageId?:number,...existingProps})`; lectura con `/admin/email/(inbound|outbound)/:id`, rutas existentes comprobadas en server/routes/email.js:112; mantener su autenticación y estados, sin un segundo mailbox.

- [ ] Tests E1/E2: correo explícito sí; sender/header igual no; dos búsquedas sin mezcla; inbound/outbound ID igual no se confunden; purga elimina body sin afirmar mensaje completo; unlink no borra email; estado EMAIL_SERVICE_READY false no impide V/C.
- [ ] Extender vínculo y deep links; extraer canal ready mediante settings existente, no flags inventados del cliente. No montar bandeja global ni enviar desde la pestaña SAP08.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release`; e2e por cabecera vigente más `tests/applicant-links.e2e.cjs`, con fixtures correo sin entrega real.
- [ ] MCP Playwright 1280/390 zoom200%, teclado/foco/error/parcial/carga/vacío/consola/red; medir consultas acotadas y no preload cuerpos/otros canales. Correo real se prueba solo cuando AUT17 activado y envío autorizado aparte.
- [ ] Al construir actualizar SAP08 por tramo en JSON/ESTADO y renderizar scripts; no marcar completo por V/C si E pendiente. Revisar migración antes de autorización separada de aplicación/publicación.
