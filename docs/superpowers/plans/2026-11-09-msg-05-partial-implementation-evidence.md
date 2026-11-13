# MSG-05 · Evidencia de implementación parcial

Base de trabajo: `ee2ff14cbd4447d1901acc9f6cf1b34b77a568d3`. Esta entrega prepara la revisión privada del contacto del chat; **no habilita la conversión ni acredita activación**.

## Alcance construido

- Desde Messages, `Review chat contact` abre el formulario con solo el ID numérico del chat en el fragmento de URL. La lectura del borrador usa la ruta privada staff/no-store `GET /api/admin/chats/:id/applicant-draft`; rechaza Origin externo y Sec-Fetch-Site distinto de same-origin o none, permite la ausencia legítima de esas cabeceras y no crea registros ni enlaza contactos.
- Se proponen únicamente nombre, correo y teléfono actuales; no se copia la conversación, no se rellenan requisitos y no se infiere consentimiento. El borrador no se almacena en el navegador. El formulario muestra el contacto, advierte de la limitación y deja deshabilitados la edición y Save; el manejador tampoco deriva al alta ordinaria.
- Si falla la lectura o cambia el contacto, el borrador se invalida. Mientras la página es visible se comprueba cada 30 segundos y al recuperar visibilidad. Un 404 invalida también cuando llega después de otra respuesta; la limpieza al desmontar evita restaurar respuestas tardías al navegar.
- No se han añadido migraciones, activado canales ni invocado modelos, proveedores o servicios externos.

## Pendiente antes de habilitar Save

- Integrar la revisión semántica monotónica y la CAS compartida del servicio de chat de MSG-02. La base todavía no las expone: el borrador devuelve `chat_version: null`, no una versión inventada. Cambios de mensajes sin cambio de contacto no se detectan por esta comprobación temporal, pero tampoco pueden guardarse desde el borrador.
- Componer las reglas actuales de registro, modalidades, validación, consentimiento, deduplicación y prioridades de requisitos con el servicio dueño, junto con una intención de conversión emitida por servidor y una vinculación persistente. Verificar que revisión del origen, creación o selección del contacto, solicitud y vínculo se confirmen atómicamente. Conservar el registro guardado al expirar el chat.
- Cubrir antes de abrir Save las carreras entre pestañas, claves distintas de la misma intención, duplicados, borrado concurrente y reintentos inciertos; responder 409 a versión desactualizada. Campos derivados de IA y aviso de truncamiento, si se incorporan, requieren MSG-04 y revisión humana. Esta entrega no pretende satisfacer esos casos.
- Acordar el siguiente ordinal libre de migración con el coordinador al integrar las dependencias; no se reserva ordinal para este alcance de lectura.

## Comprobaciones locales

- `npm test`: 1.435 pruebas Node y 25 Python, aprobadas con datos sintéticos antes de la pasada correctiva. Después, 69 pruebas focales de chat, borrador, alta y validación aprobaron.
- `npm run build` y `npm run check:release`: aprobados. La compilación informa del aviso existente de tamaño de bundle.
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/msg-05-draft.e2e.cjs npm run test:e2e:isolated`: recorrido sintético Chromium en contenedor aislado en 1280 y 390 px; comprueba enlace por teclado, URL y storage sin los datos de la muestra, consentimiento sin marcar, imposibilidad de enviar, formulario ordinario, enlace inválido y borrado tardío. La comprobación de zoom es CSS al 200%, no zoom nativo. La instrumentación posterior identificó la hoja de Google Fonts como el recurso desconectado; el recorrido la reemplaza por CSS local vacío y usa fuentes de reserva, sin acreditar las fuentes remotas. En la última ejecución no hubo requests fallidos ni errores de consola inesperados. Se registra el 404 deliberado con código, origen y ruta sanitizados, y se excluye de errores HTTP solo ese objeto de solicitud. El alta ordinaria completó un POST 201 real en la base sintética. El servidor local de pruebas sigue emitiendo advertencias de certificado de su fixture; no se prueba producción.
- La revisión independiente detectó el rechazo de origen que se corrigió con una prueba de regresión; la integración de dependencias sigue pendiente. La cobertura de un fixture no demuestra recepción, autorización ni funcionamiento de ningún canal real.

## Integración posterior

Sobre `587f744901693801bf1ed0f2cc05bafdda09f8cf`, `npm test` aprobó 1.487 pruebas JavaScript y 25 Python; `build`, `check:release`, `team:check` y `check:packages` aprobaron. El E2E indicado arriba se repitió con Chromium en el contenedor aislado y pasó a 1280/390 con datos ficticios; mantuvo el aviso TLS del servidor local. No se ha comprobado el flujo autenticado de producción ni habilitado Save.
