# NOT-11 · ledger de construcción · PAQ-01

9-nov-2026. Diseño iniciado sobre main/GitHub b565121 en /tmp/hampton-paq01-build-9cur86yp. Construcción vigente en /tmp/hampton-not11-build-enuundiz sobre main dd37cf5, identidad VPS propia y reserva NOT-11 build. Incorporación resuelta antes de construir; secretos solo almacén privado. Motor/modelo/esfuerzo de sesión no modificados ni expuestos de forma verificable por la herramienta.

## Preflight

Autenticación status comprobada. Reserva legacy propia BUS-21 recuperada por handoff/accept oficiales generación4, cinco documentos reconstruidos/revisados sin importantes, evidencia design real y complete solo plan. BUS-21 producto sigue pendiente; directorio SHA256 intacto y trabajo Hermes1 ed566943 no adoptado. Catálogo actualizado de main publicado b565121. Sin otras reservas abiertas al preparar este diseño.

NOT-11 previo f98532a/8e65d7a ausente en rutas/objetos inspeccionados; requisitos reconstruidos explícitamente desde M13, catálogo, notas NOT-01 y decisiones F0/EST-09. No se finge recuperar código ni repetir su integración. Regresión focal inicial events/notifications/listing-events:41pruebas,41PASS,0FAIL, Node24.22.1. Log privado baseline-events-tests.log. No se atribuye ese resultado a código nuevo.

Ruling: ampliar notifications y conservar contratos legacy mediante metadata/recibos e historial, sin cola nueva; coste si es incorrecto: migración aditiva deberá revisarse antes de producción. Ruling: preferencias afectan solo informativos y nunca ocultan trabajo pendiente/completado, para mantener Inbox común A9. Ruling: solo canales y productores existentes se certifican, aunque las APIs admitan sus futuros consumidores.

## Estado

Construcción implementada y revisada. Migración0032 aplicada solamente a fixtures locales, sin push ni activación de producto. El mantenimiento del coordinador sí fue aprobado y publicado por separado. Este ledger distingue ese mantenimiento de la entrega NOT-11 todavía local.

## Evidencia pendiente

Verificaciones locales y revisión completadas; entrega preparada para commit/submit del SHA final. Pendientes: aprobación de migración/publicación y comprobación real del despliegue. Playwright MCP bloqueado antes de abrir página por sandbox/root; conservar ese pendiente. Sin envíos ni activación de canales externos.

## Reanudación tras mantenimiento aprobado

Arreglo dd37cf5 publicado y coordinador versión625ded7f-5f75-4d05-899b-389224d398a7 activo100%, bindings/Access/previews conservados. Reintento exacto de EST-09 correcto, una evidencia y sin pending. Copia actualizada por fast-forward al main dd37cf5, borradores preservados. Catálogo actualizado y base EST-18 integrada certificada sin cerrar productores futuros. Revisor legacy_plan_review cierra los dos importantes del diseño; dos menores editoriales corregidos. Lista de archivos/recursos se atesta antes de claim; ningún código de producto escrito aún.

## Núcleo implementado y regresiones

Copia activa /tmp/hampton-not11-build-enuundiz: init limpio sobre dd37cf5, después claim NOT-11 build confirmado y documentos incorporados desde copia de planificación; el primer intento desde el commit del plan fue rechazado por preflight sin crear reserva. Watch en primer plano renueva; no servicio instalado. Tests iniciales RED6API+7productores observados. Núcleo y casos adicionales:20PASS/0FAIL; regresión ampliada previa75PASS antes del último caso edit. Migración0032 solo local, ninguna migración remota.

Ruling: interfaz guarda responsable y deadline juntos mediante acción edit en una única revisión/CAS, preservando acciones assign/deadline individuales para compatibilidad. Evita guardados parciales de un mismo formulario; coste si incorrecto: conflicto visible y borrador conservado. Es una operación de metadata, no un cambio al negocio. Lectura personal no cierra tarea. Public duplicate-after-delete limpia razón y cierra trabajo sin destinatario.

MCP Playwright intentado contra about:blank: falla por Chromium sandbox/root antes de abrir página. No se modifica configuración/permisos/red/sandbox del MCP. Se usa además el runner e2e local existente y su patrón de launch, con PW/CHROME instalados y fixtures sintéticas; no afirmar que el MCP pasó. Resultado del recorrido local todavía pendiente.

## Ampliación revisada por not11_code_review

La revisión independiente confirma que un cierre por dominio posterior a Done debe impedir Reopen también en productores legacy. Se amplía exactamente a server/events.js y server/match-store.js: marcar cierre de fuente aun si ya estaba cerrado por una persona, conservando fecha/autor originales, guards y evento real; revisión/historia solo ante cambio material. Regresiones en tests/server/notification-task-producers.test.mjs cubren ambas rutas. También se amplía a tests/server/applicants.test.mjs, tests/server/matches.test.mjs y tests/server/rentals-overview.test.mjs exclusivamente para expectativas de columnas aditivas y contador task, sin relajar contratos. Revisor confirma ampliación sin bloqueos y alcance se atesta antes de editar esos cinco archivos.

## Revisión y pruebas de aceptación

Revisor independiente not11_code_review, sin contexto de implementación heredado: detectó cierre por dominio después de Done, desaparición de detalle sucio al cambiar de bandeja un colega, GET tardío que pisa edición recién iniciada, dependencia de visita borrada y pérdida de UUID ante navegación o respuesta2xx truncada. Corregidos; tres regresiones de cierre primero RED8PASS/3FAIL, después PASS. Revisión del diff corregido sin hallazgos pendientes y ejecución independiente44/44 backend. Sin menores aceptados pendientes.

| Criterio | Evidencia ejecutada |
| --- | --- |
| T01 | Migración poblada preserva IDs/eventos, FK e índices; backfill sin historia inventada. |
| T02–T03 | Dos cookies y misma revisión en Claim y Done dejan200/409 y un recibo/evento; replay igual y payload distinto. Creación manual concurrente deja una tarea. |
| T04–T05 | Versiones nueva/igual/vieja, destino distinto, resolución entre lectura y Done, y tres caminos de cierre posterior a Done. Guarda responsable/plazo omitido y no reabre fuente implícitamente. |
| T06 | Fallo inyectado de historial o evento revierte negocio, tarea y recibo. |
| T07 | Lectura personal, revisión obsoleta409 y preferencias propias; ninguna oculta pendientes ni completados. |
| T08 | Auth/same-origin, targets/campos/deadlines inválidos, edición atómica, borrado/anonimización y fuente tardía. E2e muestra título HTML como texto literal. |
| T09 | GET de visita exacta fuera de500, ID inválido/ausente, pestaña y borrado posterior; nunca selecciona otra visita al fallar apertura inicial. |
| T10 | Runner local separado del MCP:1280/390, zoom200%, foco/teclado, validación requerida, vacío/error503 y recuperación, conflicto con borrador conservado, GET en vuelo, cambio de bandeja por colega, replay503 y JSON200 truncado con el mismo UUID, bloqueo de navegación/signout/hash durante incertidumbre. |

Suite completa final:954JavaScript+14Python PASS, incluidos los dos casos adicionales de CAS. Build/release/team:check/check:packages correctos;250tareas y23paquetes conservados. Build mantiene advertencia existente de chunk>500kB (Firebase/panel, sin dependencia nueva); bundle final739.29kB/gzip207.99kB. No ocultar esa advertencia ni afirmar mejora de rendimiento medida.

Prueba de navegador: la primera ejecución falló por fixture, pues APIRequestContext omite cookie Secure en loopback y Chromium sí la envía. Se corrigió la prueba para usar fetch del navegador, sin cambiar auth, cookie, red ni permisos. Otro fallo era selector exacto que incluía opciones/badge. No se atribuyen esos fallos al producto ni se inventa un RED de interfaz previo a construir. Backend sí tuvo RED antes de implementar; e2e se incorporó posteriormente como comprobación de aceptación.

Capturas sintéticas privadas: /tmp/hampton-paq01-admin-f00w_1vm/not11-shots. Inspección1280/390 correcta; zoom detectó controles recortados aunque scrollWidth pasaba, por lo que se añadió comprobación real de límites de controles y contenedor responsive para corregirlo. Recorrido y capturas finales repetidos tras el ajuste: PASS1280/390/zoom200, con teclado desde botón habilitado, foco visible y sin errores JavaScript. El encabezado sticky en capturas fullPage conserva la posición de scroll durante el recorrido. Logs privados not11-*.log, sin datos reales.

La primera regresión general se interrumpió en reload de #h-interest después de recompilar assets mientras su fixture seguía activo: posible invalidación del manifiesto estático. Segunda pasada en secuencia, sin recompilar ni ejecutar otro e2e concurrente: PASS `e2e OK (public, urls, admin, reg17)`, salida0 confirmada03:49UTC. No se atribuye al producto el intento fallido ni se oculta. Sin fallos generales pendientes.

Consulta remota de solo lectura `wrangler d1 migrations list hampton --remote`: únicamente0032_notification_tasks.sql pendiente. Ninguna migración remota ejecutada; Time Travel y autorización del SHA se comprobarán en el mandato de publicación separado.

Último recorrido focal final: PASS, salida0, incluida creación manual con respuesta200 truncada que reintenta exactamente el mismo UUID y deja una sola tarea. Enlace explícito vacío validado antes de peticiones con mensaje Invalid viewing ID, sin convertirse en listado ni seleccionar otra visita. Revisor independiente sin hallazgos también en este delta. Capturas1280/390/zoom200 renovadas con scroll0; capturas adicionales inbox-focus-390/1280 muestran el foco real durante navegación por teclado.

## Gate antislop y recorrido

- Hard Gate PASS para la superficie NOT-11: controles nativos con acciones reales, título HTML escapado, validación required, vacío/loading/error503 y recuperación; pruebas de límites de controles1280/390/zoom200 y teclado/foco. Tokens existentes conservan contraste de texto stone/ink y foco bronze-dk; controles disabled mantienen la excepción estándar de contraste. Sin contenido/estadísticas de clientes inventados ni assets nuevos.
- Purpose Gate PASS: contorno bronze-dk identifica la selección, separadores organizan formulario/historial; conserva radio/tipografía/sombra de tarjeta del panel para no crear una pantalla ajena. Sin iconos, gradientes, marketing o animaciones añadidas.
- Liveliness PASS: ENERGY1/RHYTHM1/MOTION1 declarados antes de construir; título/estado de tarea como foco, campos y acciones agrupados, acento solo para selección/foco y tipografía Hampton vigente.
- Craftsmanship PASS: editar responsable/plazo juntos, Claim, Done→Feed→Reopen, follow-up con contexto, preferencias guardar/descartar, historial desplegable y enlaces exactos ejercitados. Borradores sobreviven GET tardío/409/cambio por colega; respuesta503 o JSON2xx truncado reintenta exactamente la misma operación y bloquea salida mientras incierta. Sin dependencias nuevas, WebStorage ni controles simulados.

Estos PASS corresponden al runner local separado. El recorrido exigido mediante Playwright MCP sigue bloqueado por arranque Chromium sandbox/root y se conserva explícito; no se declara MCP aprobado ni se cambia su sandbox.

Siguiente: publicación/migración de este NOT-11 revisado; después PAQ-01/NOT-01, contrato y diseño de8-nov sobre eventos EST-18. NOT-08 conserva dependencias; no certificar productores ausentes ni canales externos. Recomendación Codex gpt-6.1-sol, high por concurrencia y coordinación de productores, coherente con preferencia de Luis. Hermes mantiene GPT Sol/Codex y solo respalda en DeepSeek v4 max/OpenCode al perder acceso GPT.
