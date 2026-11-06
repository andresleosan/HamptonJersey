# Ledger: chat de la web con respuesta humana (MSG-02)

Ejecución del [plan](2026-11-06-hampton-app-web-chat.md) el 6-nov-2026, en esta sesión (sin subagentes por tarea), con una revisión de cuatro revisores al final.

## Tareas
- Tarea 1 (migración 0021): hecha; prueba de esquema.
- Tarea 2 (rutas públicas): hecha; `tests/server/chat.test.mjs` (10 casos). La prueba de `INSERT … RETURNING` en batch no funciona con el doble de D1 de las pruebas: se usa `meta.last_row_id`.
- Tarea 3 (panel, contador, interruptor, `news`): hecha; `tests/server/chats-admin.test.mjs` y un caso en `hermes.test.mjs`. Las pruebas que comparaban `counts` y `news` enteros se pusieron al día con `chats` y `chats_waiting`.
- Tarea 4 (borrado a 30 días): hecha; `retention_run.chats`.
- Tarea 5 (Messages y Automations): hecha.
- Tarea 6 (web y aviso): hecha; `tests/chat.test.js`.
- Tarea 7 (e2e y documentos): paso `webChat` en `tests/e2e.cjs`. En el taller el envío del formulario se queda esperando a `siteverify` (el Worker local no sale por el proxy); con un arnés que solo sustituye ese envío por un chat creado en la base local (`/home/taller/encargos/capturas/web-chat/run.cjs`), el resto del paso pasa. Recorrido con Playwright MCP a 1280 y 390.

## Arreglado durante el recorrido
- Los mensajes del equipo salían casi invisibles en la web: la clase `team` chocaba con la sección «Our team». Clases `from-team` / `from-visitor`.
- Tras «Send reply» en Waiting, el chat salía de la lista y el aviso se perdía: los avisos van arriba de la lista (como el Inbox).
- En el ordenador, el botón Send quedaba cortado con conversaciones largas: la caja de escribir queda fija al pie.

## Revisión (4 revisores) y qué se hizo
- **Errores**:
  - una respuesta tardía resucitaba un chat terminado sin llave (se descarta si la llave cambió; Delete para el sondeo antes);
  - sin `localStorage`, reabrir el chat lo perdía (`load() ?? store`);
  - «Mark handled» podía tapar un mensaje nuevo del visitante (el panel manda el último id que ve; si hay uno más nuevo, 409 y se recarga);
  - el sondeo de la lista cambiaba de chat y borraba una respuesta a medio escribir (el chat abierto se queda; solo tras una acción propia pasa al siguiente);
  - detalle borrado entre dos consultas → 404, no 500.
  - **Menor (aplazado):** con dos pestañas abiertas que empiezan chats distintos, la última en guardar gana la llave.
- **Seguridad y privacidad**: nada alto.
  - El aviso decía que el visitante puede borrar el chat «at any time», pero solo puede mientras lo tiene abierto en su aparato: texto corregido («at any time, you can ask us to delete it»).
  - El aviso no decía que se guarda cuándo tuvo el chat abierto: añadido, y una línea en «Why we use it».
  - El navegador olvidaba la llave a los 7 días de su propia hora aunque una respuesta del equipo la alargara: ahora decide el servidor (el navegador la tira a los 30 días).
  - Límite del primer envío a 16 KB.
  - **Menores (aplazados):** el sondeo `GET /api/chat` no tiene tope propio (lo cubre la regla WAF de ANA-09); Automations enseña el email de quien encendió el chat, como ya hace la tarjeta de envíos.
- **Diseño y accesibilidad**:
  - el botón ya no tapa el final de la página (hueco abajo y `scroll-padding`) y se oculta con el chat abierto;
  - el plan B si `chat.js` no carga es «Call 01534 727582», que llama;
  - el aviso «Your chat was deleted.» recibe el foco;
  - los errores ya no quitan el enlace al contador;
  - la pista de email o móvil está enlazada a sus campos;
  - el estado vacío sigue en el árbol de accesibilidad;
  - en el panel, la conversación se puede desplazar con el teclado y abre en el último mensaje;
  - el aviso del interruptor recibe el foco.
  - **Menores (aplazados):** los botones Call / WhatsApp / Email `.sm` del panel miden menos de 32 px (igual que en la ficha del aplicante); la región viva anuncia también los mensajes propios.
- **Código de más**:
  - `KEEP_DAYS` se usa en el borrado;
  - `sha256` compartido en `http.js` (antes copiado en `rent.js`);
  - `TEAM_MAX` del panel importado del servidor;
  - «End chat» usa `ended()`;
  - fuera `headRef`, el envoltorio de `messageText` y el `export` de `STORE`;
  - texto C14 como en la spec («Visitor on the website now»).
  - La casilla dice «I have read the privacy notice», como la de Register your search, en vez de «I've read» (decisión del constructor).
