# Ledger: chat de la web con respuesta humana (MSG-02)

Ejecución del [plan](2026-11-06-hampton-app-web-chat.md) el 6-nov-2026, en esta sesión (sin subagentes por tarea), con una revisión de cuatro revisores al final.

## Tareas
- Tarea 1 (migración 0022): hecha; prueba de esquema.
- Tarea 2 (rutas públicas): hecha; `tests/server/chat.test.mjs` (10 casos). La prueba de `INSERT … RETURNING` en batch no funciona con el doble de D1 de las pruebas: se usa `meta.last_row_id`.
- Tarea 3 (panel, contador, interruptor, `news`): hecha; `tests/server/chats-admin.test.mjs` y un caso en `hermes.test.mjs`. Las pruebas que comparaban `counts` y `news` enteros se pusieron al día con `chats` y `chats_waiting`.
- Tarea 4 (borrado a 30 días): hecha; `retention_run.chats`.
- Tarea 5 (Messages y Automations): hecha.
- Tarea 6 (web y aviso): hecha; `tests/chat.test.js`.
- Tarea 7 (e2e y documentos): paso `webChat` en `tests/e2e.cjs`. En el taller el envío del formulario se queda esperando a `siteverify` (el Worker local no sale por el proxy); con un arnés que solo sustituye ese envío por un chat creado en la base local (`/home/taller/encargos/capturas/web-chat/run.cjs`), el resto del paso pasa. Recorrido con Playwright MCP a 1280 y 390. Tras la segunda revisión de Codex, también el paso `webChatTabs` (dos pestañas; sin Turnstile, escribe los chats en la base), que pasa entero en el taller. Tras la tercera, el paso `webChatRecovers` (sin conexión al abrir el chat), que también pasa entero.

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
  - **Menor:** con dos pestañas abiertas que empiezan chats distintos, la última en guardar gana la llave. *Corrección:* lo apunté como aplazado; la segunda revisión de Codex mostró que además mezclaba las dos conversaciones, y quedó arreglado (abajo, punto 1 de la segunda revisión).
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

## Revisión de Codex sobre `0639e4e` (6-nov-2026)

Dos importantes, arreglados con su prueba:
- **a. Una respuesta podía llegar a otro visitante.** Sin `AUTOINCREMENT`, SQLite reutiliza el id del último chat borrado. Un panel que aún mostraba el chat viejo contestaba dentro del nuevo.
  - Arreglo: `chats.id INTEGER PRIMARY KEY AUTOINCREMENT` en la propia 0022, que no estaba aplicada en remoto.
  - Prueba: `a deleted chat's id is never given to a new one…` en `tests/server/chats-admin.test.mjs`.
  - Los ids de `chat_messages` siempre se leen dentro de su chat, así que no lo necesitan.
- **b. Reabrir un chat viejo no volvía a sondear.** Si el último mensaje tenía más de 2 h, abrir el chat leía una vez y ya no programaba más lecturas.
  - Arreglo: `nextPoll(now, lastAt, openedAt)`. El periodo de sondeo cuenta desde lo más reciente entre el último mensaje y la última vez que el visitante abrió el chat en esa página.
  - También deja de pararse en `handled`: una respuesta a un chat cerrado también llega, siempre dentro de las 2 h.
  - Pruebas en `tests/chat.test.js`: el ciclo de sondeo con `init()`, un navegador falso y temporizadores simulados, y la regla de reapertura con `nextPoll()`. Comprobado en Chromium con `/home/taller/encargos/capturas/web-chat/reopen/run.cjs`, que abre el chat de verdad.
  - *Corrección (segunda revisión de Codex, punto 5):* aquí ponía «pruebas del planificador entero». No es exacto: ninguna prueba del repo abre el chat (`toggle()`), así que no detectaría que dejara de poner `openedAt`. Solo lo cubre la comprobación de Chromium, que está fuera del repo.

Cuatro menores, comprobados en el código y **aplazados** (Luis pidió solo anotarlos):
- **c. Otra pestaña puede deshacer «End chat».** *Arreglado en la segunda ronda (punto 2 de abajo).* `load() ?? store` (en `toggle`) recupera la llave que esta pestaña tiene en memoria y `remember()` la vuelve a guardar después de que otra pestaña la borrara. Contradice «la olvida en ese aparato».
  - Arreglo propuesto: distinguir «almacenamiento inaccesible» de «llave borrada» y escuchar el evento `storage` para sincronizar las pestañas.
- **d. Una ruta codificada pierde `no-store`.** `/api/%63hat` llega a las rutas del chat, porque el router decodifica los segmentos. La política de caché de `server/api.js` mira el segmento sin decodificar.
  - Arreglo propuesto: decidir las dos cosas sobre la misma ruta decodificada.
  - Codex no demostró una filtración por una caché compartida.
- **e. El borrado tiene tope diario.** La pasada diaria borra como mucho 500 chats (`RETENTION_CAP`), igual que con contactos y visitas, y da el día por hecho: lo que sobra espera al día siguiente. Con más de 500 vencidos, alguno pasa de los 30 días que prometen el aviso, ESTADO y el checklist.
  - Arreglo propuesto: seguir en lotes hasta agotarlos, o decir el margen real en el aviso.
  - Con el tráfico previsto (unos 150 chats al mes) no se llega.
- **f. El e2e no prueba el sondeo del contador.** *Corrección (segunda revisión de Codex, punto 6):* aquí ponía que, al navegar a Messages, «la primera lectura ya cumple la aserción». Es falso. Pasar de Automations a Messages solo cambia el fragmento: no recarga la página ni hace una lectura nueva del contador. «Messages 1» solo puede llegar por el sondeo de 30 s, así que el paso sí lo probaba, aunque sin decirlo. Ahora `webChat` cuenta las peticiones a `/api/admin/notifications/counts` y exige una posterior al chat.
  - Arreglo propuesto: dejar el panel abierto antes de crear el chat y esperar el cambio sin navegar, dentro de los 30 s.

## Segunda revisión de Codex sobre `0639e4e..5ad9add` (6-nov-2026)

Un hallazgo importante y cinco menores. Luis pidió arreglar el 1 y el 2, con pruebas que reproduzcan los dos, y corregir el ledger.
1. **Importante, arreglado: se mezclaban conversaciones entre pestañas.** Una pestaña que tomaba de `localStorage` la llave de otro chat conservaba el historial anterior y le añadía el nuevo, y el siguiente envío iba al chat nuevo.
   - Arreglo: `adopt()` en `site/chat.js`. Al abrir el chat, con el evento `storage` y antes de guardar cada respuesta, la pestaña sigue al chat que guarda el navegador. Si cambió, para el sondeo, borra lo pintado y reconstruye la conversación desde cero. `call()` ya descartaba las respuestas de una llave anterior.
2. **Menor, arreglado: otra pestaña podía deshacer «End chat».** `load() ?? store` desaparece.
   - `peek()` distingue el almacenamiento ilegible (`ok: false`: se queda el chat de la página) de la llave borrada (`s: null`: el chat termina aquí también).
   - `persisted` indica si el chat de la página es el guardado: un chat que no se pudo guardar no se pierde por lo que hagan otras pestañas.
   - Pruebas en `tests/chat.test.js`:
     - «another tab's End chat ends it here too…» (con una respuesta en vuelo cuando la otra pestaña lo termina);
     - «a chat started in another tab replaces this one…».
     - Las dos fallan con el `site/chat.js` de `5ad9add` y pasan ahora.
   - Paso `webChatTabs` del e2e en Chromium, con dos pestañas: el historial nunca se mezcla y «End chat» en una termina el chat en la otra. Falla con el código anterior (la primera pestaña no pasa al chat nuevo) y pasa ahora.
3. **Menor, aplazado:** `/api/%63hat` sin `no-store`. Es el mismo que el d de arriba.
4. **Menor, aplazado:** el tope de 500 borrados al día. Es el mismo que el e de arriba.
5. **Menor, aplazado:** la prueba de reapertura no abre el chat. Corregido el texto del punto b de arriba. Arreglo propuesto: un paso del e2e que abra un chat de hace 3 h y espere una respuesta posterior, como `reopen/run.cjs`.
6. **Menor, arreglado:** el ledger explicaba mal la prueba del contador (punto f de arriba, corregido). El e2e ahora exige una petición del sondeo posterior al chat.

## Tercera revisión de Codex sobre `527d365` (6-nov-2026)

Un hallazgo importante y seis menores. Luis autorizó una ronda más: arreglar el importante con una prueba reproducible y anotar los menores con precisión.

1. **Importante, arreglado: el chat no se recuperaba de un fallo inicial.** El fallo estaba en dos sitios:
   - `refreshChat()` (al abrir) e `init()` (al cargar la página) solo trataban el 401. Cualquier otro error (sin red, un 500) se tragaba sin aviso.
   - `schedule()` no programaba nada mientras `chat` siguiera vacío.

   Con eso, si fallaban las primeras lecturas, el chat abierto quedaba en blanco para siempre, aunque volviera la conexión.

   Arreglo, con `failed(e)`:
   - 401: el chat termina aquí, como antes.
   - Respuesta de otro chat (-1): se ignora.
   - Cualquier otro error: el chat abierto dice «We couldn't reach our server. Trying again…» (en `.chat-load`, `role="status"`) y se reintenta con el calendario de sondeo, también mientras no se ha cargado nada.
   - Una lectura buena borra el aviso.
   - En segundo plano, un chat sin abrir y viejo (más de 2 h) no se reintenta hasta que se abra.

   Pruebas que ejercitan el fallo real:
   - `tests/chat.test.js`, «a chat whose first reads fail keeps trying and recovers when the connection is back». Pasa por `init()`, con `fetch` que falla primero sin red (`TypeError`) y luego con un 500, y temporizadores simulados. Falla con `527d365`, porque tras el primer error no hay más lecturas.
   - Paso `webChatRecovers` del e2e, en Chromium. Es el camino que vio Codex: `page.route` aborta todo `GET /api/chat` como `internetdisconnected` antes de cargar la página y de abrir el chat. Exige el aviso y que no haya mensajes. Al quitar el corte, la conversación aparece sin reabrir (12 s como mucho) y el aviso desaparece.
     - Con el `site/chat.js` de `527d365` falla en el aviso, que nunca sale.
     - Con una variante sin esa comprobación (`/home/taller/encargos/capturas/web-chat/run-recovery-only.cjs`, fuera del repo), también falla al recuperar: la conversación nunca aparece.
     - Pasa con el código nuevo.
2. **Menor, aplazado: el borrado puede pasar de los 30 días anunciados.** Es el mismo que el e y el 4 de las revisiones anteriores.
   - La sentencia `CHATS` de `server/retention.js` borra como mucho `RETENTION_CAP` (500) chats por pasada, y `recordRetentionDay` da el día por hecho. Con 501 vencidos, uno espera al día siguiente.
   - Contradice lo prometido en `ESTADO.md` (línea 107), en el checklist (MSG-02, «Se borra sola 30 días después…») y en el aviso público (`site/apply.js`, «We delete a conversation 30 days after its last message»).
   - Arreglo propuesto: repetir el lote hasta agotarlo antes de dar la pasada por hecha, o decir el margen real en los tres sitios.
3. **Menor, aplazado: la ruta codificada pierde `no-store`.** Es el mismo que el d y el 3 de antes.
   - `route()` decodifica los segmentos para elegir la ruta, pero `handleApi()` decide `no-store` con `segments[0]` sin decodificar. Por eso `/api/%63hat` devuelve la conversación de una llave válida sin esa cabecera.
   - Codex no demostró una filtración por una caché compartida.
   - Arreglo propuesto: decidir las dos cosas con la misma ruta decodificada.
4. **Menor, aplazado: borrar el chat durante un envío da un 500.** Reproducido fuera del repo con `/home/taller/encargos/capturas/web-chat/minor4.test.mjs`: el chat se borra entre `chatOf()` y el batch de `say()` (`server/routes/chat.js`).
   - El `INSERT … SELECT ?1 …` no comprueba que el chat siga existiendo, y la clave foránea falla («FOREIGN KEY constraint failed»).
   - El visitante recibe un 500 «Server error. Please try again.» en vez del 401 de chat terminado.
   - Arreglo propuesto: `… WHERE EXISTS (SELECT 1 FROM chats WHERE id = ?1) AND …` en el INSERT y, si no entra nada y el chat ya no existe, responder el 401 «This chat has ended».
5. **Menor, aplazado: el panel pierde una respuesta sin enviar.** En `admin/src/Messages.jsx` el detalle es `<Chat key={sel}>`. Cambiar de pestaña (`show()` pone `sel` a null) o pulsar otro chat desmonta el componente, y el texto escrito se pierde sin preguntar. Codex lo confirmó en Chromium.
   - El arreglo de la primera revisión solo protege del sondeo de la lista, no de los clics de la persona.
   - Arreglo propuesto: guardar el borrador por chat en el estado de Messages, o preguntar antes de descartarlo (como `confirmLeave`).
6. **Menor, aplazado: el interruptor no llega a las páginas ya abiertas.**
   - `index.html` lee `/api/config` una sola vez al cargar (`bootChat(on)`), y `chat.js` guarda `chatOn` en `init()`.
   - Tras apagar el chat, una página abierta sigue enseñando el botón y el formulario hasta que se recarga, y el envío acaba en el 404 «Not found».
   - La spec (C3) y la tarjeta de Automations dicen «hasta 5 minutos», pero eso solo vale para páginas que se cargan después (la caché de `/api/config`).
   - Arreglo propuesto: volver a leer `/api/config` al abrir el chat (o tratar el 404 de `POST /api/chat` como «chat no disponible», con el teléfono), y precisar el texto.
7. **Menor, aplazado: la prueba de reapertura no abre el chat.** Es el mismo que el 5 de la segunda revisión.
   - Codex anuló en memoria la línea `openedAt = Date.now()` de `toggle()` y las pruebas siguieron pasando. Sigue siendo cierto: ni las de `tests/chat.test.js` ni los pasos del e2e reabren un chat viejo.
   - Solo lo cubre `/home/taller/encargos/capturas/web-chat/reopen/run.cjs`, fuera del repo.
   - Arreglo propuesto: un paso del e2e que abra un chat de hace 3 h y espere una respuesta posterior.

Además, el `npm audit` de Codex da 9 entradas `high` en dependencias heredadas. Es el menor k del ledger de Widen criteria: no viene de este cambio.

## Cuarta revisión de Codex sobre `0639e4e..ee4fc29` (6-nov-2026)

Sin críticos ni importantes. Siete menores: uno nuevo y seis que ya estaban anotados. Luis pidió anotarlos antes de pedir el «sí», sin cambiar código.

1. **Nuevo, menor, aplazado: con más de 200 chats en una pestaña, algunos no se pueden abrir.** La lista de Messages (`list()` en `server/routes/chats.js`) tiene `LIMIT 200` y no pagina. Los contadores (`SELECT status, COUNT(*) … GROUP BY status`) cuentan todos, y el panel no avisa de que la lista está cortada.
   - Codex lo reprodujo con 201 chats Handled: el contador dice 201, y el más antiguo no sale ni en Handled ni en All. Sus datos siguen en la base, pero el equipo no puede abrirlo desde el panel (solo se borra a los 30 días).
   - Afecta a todas las pestañas, según su orden:
     - en Handled, Answered y All quedan fuera los más antiguos (`last_at` descendente);
     - en Waiting, ordenada de la espera más larga a la más corta, quedan fuera los que llevan menos rato esperando.
   - Con unos 150 chats al mes y el borrado a los 30 días, no se llega a 200 con el tráfico previsto.
   - Arreglo propuesto: paginar (`before`/`after` sobre el orden de cada pestaña) con «Show older», o al menos decir «Showing 200 of N».
2. **Ya anotado:** el tope de 500 borrados al día, que puede pasar de los 30 días anunciados. Es el e (primera revisión) y el 2 (tercera); Codex lo volvió a reproducir con 501 vencidos.
3. **Ya anotado:** `/api/%63hat` sin `no-store`. Es el d y el 3.
4. **Ya anotado:** borrar el chat durante un envío da un 500 por la clave foránea. Es el 4 de la tercera.
5. **Ya anotado:** el panel pierde una respuesta sin enviar al cambiar de chat o de pestaña. Es el 5 de la tercera.
6. **Ya anotado:** el interruptor no llega a las páginas ya abiertas. Es el 6 de la tercera.
   - Codex lo precisó: tras apagarlo y adelantar el reloj 301 s, una página abierta sigue enseñando el botón y el formulario, y crear el chat da 404.
   - El texto que lo contradice es el de la tarjeta «Web chat» de `admin/src/Automations.jsx` («The button leaves the website within 5 minutes»), además de la spec (C3).
7. **Ya anotado:** la prueba de reapertura no abre el chat. Es el 5 de la segunda y el 7 de la tercera. Codex volvió a anular la asignación de `openedAt` en `toggle()`, y las 8 pruebas de `tests/chat.test.js` siguieron pasando.

Codex confirmó los siete comportamientos con reproducciones. Además:
- `webChatTabs` y `webChatRecovers` pasan ejecutados por separado;
- el e2e completo sigue parado en Turnstile en el taller (`tests/e2e.cjs:147`);
- `npm audit` da 9 entradas `high` heredadas y 0 críticas. Las dependencias no cambian en estos commits: es el menor k de Widen criteria.

## Integración local con GitHub (6-nov-2026)

Autorización de Luis: integrar y hacer commit **solo en el taller**. Sin aplicar migraciones, push, publicación, marcas de aprobación ni excepciones a los bloqueos. El permiso anterior correspondía a otro SHA y no sirve para publicar este resultado. El candado de HamptonJersey ya estaba tomado y se conserva.

Historial conservado mediante merge con dos padres, sin reescribir commits:
- `main` local: `7701acae4143d72080f81c68f428e9181e5ef8f3`, cinco commits de MSG-02.
- `origin/main`: `52681bba5bf5146b6eece92256a803125a44d00b`, nueve commits de GitHub. Confirmado con fetch y de nuevo con `git ls-remote` antes del commit.

Conflictos y archivos:
- `docs/roadmap/ESTADO.md`: cabecera de migraciones, fila F6 y cierre de la hoja de ruta. Se conserva el orden de trabajo de GitHub, PRE-34, AUT-18 y las fases futuras; MSG-02 figura como construido e integrado localmente, pendiente de publicación y del trabajo restante.
- `docs/roadmap/checklist-hampton-app.html`: estado y alcance de MSG-02, Messages en MSG-03, Create applicant pendiente en MSG-05 y regla WAF de ANA-09. Se mantiene la regla concreta de GitHub y sus requisitos del bot nuevo y VPS. Todos los 241 IDs se conservan; solo cambian MSG-02, MSG-03 y MSG-05 respecto a GitHub. Se explicitan las diferencias entre el documento de ideas y la spec implementada, sin dar por hechas las partes pendientes.
- Combinaciones automáticas revisadas: `admin/src/styles.css`, `site/apply.js`, `site/index.html` y `tests/e2e.cjs`. Conservan el chat junto con Properties, las fotos y el nuevo Register your search. Los otros 29 archivos exclusivos de GitHub son idénticos byte por byte a `origin/main`.
- `migrations/0021_published_at.sql` queda idéntica a GitHub. `0021_chats.sql` pasa a `0022_chats.sql`, siguiente número libre, con SQL idéntico al local original. Ajustadas las referencias en spec, plan, este ledger, ESTADO, checklist, prueba de esquema y relevo privado `.claude/relevo-avanzar.md` (excluido del repo).
- `tests/server/schema.test.mjs`: añade una regresión de números únicos y actualización en SQLite en memoria desde la 0020: comprueba el backfill de `published_at`, preservación de las fichas al crear chats, tablas vacías, chat apagado y claves foráneas. Con la colisión 0021 falla con «migration numbers must not collide» (exit 1); con 0022 pasa (exit 0).

Validación de esta integración:
- `npm test`: exit 0; **587/587 Node**, 0 fallidas, canceladas u omitidas; **14/14 Python**, OK.
- `npm run build`: exit 0; Vite 8.3.3, 76 módulos. Aviso de chunk mayor de 500 kB: JS 675,97 kB (gzip 190,96 kB). No se ha desactivado el aviso ni el gate.
- `npm run check:release`: exit 0, `No TO CONFIRM markers in site/.` El gate queda intacto.
- `node --test tests/server/chat.test.mjs tests/server/chats-admin.test.mjs tests/server/hermes.test.mjs tests/server/schema.test.mjs`: exit 0, **65/65**, 0 fallidas u omitidas. Cubre llave/huella, aislamiento de conversaciones, sesión obligatoria del panel, firma sin email, previews cerradas, Turnstile rechazado, borrado y Hermes con contadores sin datos de chats.
- Sintaxis de `tests/e2e.cjs`, `site/chat.js`, `site/apply.js` y scripts inline de la web: exit 0. JSON del checklist válido.
- Chromium local a 390 y 1280 px: navegación, Properties con filtros, orden por publicación, apertura del chat y pasos del nuevo Register con placeholders. Panel compilado: columnas Checked/Matched/Interested, contador de Messages por sondeo de 30 s, respuesta firmada, recarga, borrado y texto hostil mostrado literalmente sin ejecutarse. Las regresiones del repo `webChatTabs` y `webChatRecovers` también pasan. Arnés fuera del repo: `/tmp/hampton-integration-browser.mjs`, exit 0; API real con SQLite en memoria y datos ficticios, sin servicios externos ni bases persistentes. No equivale al e2e completo con Cloudflare.

Seguridad y privacidad revisadas:
- Barrido por patrones de los cinco commits locales y nueve remotos: sin candidatos nuevos de claves privadas, tokens GitHub/AWS/proveedores, JWT literales o secretos de producción. En el árbol rastreado, las cinco coincidencias son ejemplos de desarrollo/Turnstile y la plantilla que genera una clave ficticia en ejecución (`tests/server/fake-drive.mjs:12`), no llaves privadas guardadas. Revisión de literales de contacto: fixtures de pruebas; no se incorporan datos de clientes. `.dev.vars`, relevo, build, cookies y claves de los arneses permanecen fuera del índice. Este barrido no es una garantía exhaustiva.
- **SEC-01, alta, heredada:** `npm audit --json` termina con exit 1: **9 high, 0 critical, 0 moderate, 0 low**. Entradas: firebase, @firebase/firestore, @firebase/firestore-compat, @grpc/grpc-js, wrangler, miniflare, re2js, sharp y undici. Evidencia: `package-lock.json` (por ejemplo grpc-js:1231, firebase:2484, wrangler:3380). El lockfile es idéntico en ambos padres; no se han actualizado dependencias. El impacto depende del paquete y de su uso: este barrido no demuestra explotación en la app. Corregir y validar dependencias en trabajo separado; no usar `audit fix --force` ni publicar suponiendo una auditoría limpia.
- **SEC-02, baja, ya aplazada:** `server/api.js:34` decide `no-store` con el segmento crudo, mientras `route()` lo decodifica (`:43`). `/api/%63hat` puede carecer de esa cabecera. No se ha demostrado fuga por caché compartida. Sigue pendiente unificar ambas decisiones; no se presenta como corregido por el merge.
- **PRIV-01, baja, ya aplazada:** `server/retention.js:51` limita el lote a 500 chats; con más vencidos, el borrado puede superar los 30 días anunciados. Pendiente agotar lotes o ajustar el aviso. Se mantiene el hallazgo anterior, sin ocultarlo ni ampliar el alcance de esta integración.
- Siguen pendientes la regla WAF de PRE-34/ANA-09 y la CSP ya anotada. La prueba de texto hostil y los tests de permisos pasan, pero no sustituyen esos controles ni una auditoría exhaustiva.

No probado en este encargo: migraciones sobre bases persistentes o D1 remoto, estado de aplicación de la 0021 en producción, despliegues de Pages/Workers, login real de Google, envío real con Turnstile, reglas WAF/CSP en Cloudflare, avisador/DM del VPS y e2e completo. Este último necesita preparar una base persistente con migraciones y servicios externos; no se ha preparado ni ejecutado bajo la autorización actual. La limitación de red de Turnstile anotada en rondas anteriores no se ha vuelto a ensayar. Ningún bloqueo se ha saltado para obtener estos resultados.

## Seguimiento documental de la revisión independiente de `9e6ed97` (6-nov-2026)

Encargo de Luis: conservar el merge y todo el historial; sincronizar solo la privacidad y el borrado de la spec privada, completar este ledger e investigar las nueve entradas high sin actualizar dependencias. Commit solo local de documentos. No autoriza push, migraciones, publicación, rebase, reset, force ni excepciones a bloqueos. El permiso anterior no vale para el SHA resultante. Se conserva el candado existente y no se cambian las aprobaciones pendientes.

Fuente: `/home/taller/encargos/hampton-20261106-205737-revision.txt` e [informe completo](</home/taller/encargos/revision-msg02-9e6ed97/informe.md>). Según esa revisión, no hubo regresiones nuevas del merge; todos los hallazgos eran preexistentes. Su e2e completo terminó con exit 1 en `tests/e2e.cjs:191`, esperando la reserva: `POST /api/viewings` dio 500 porque workerd no resolvió `challenges.cloudflare.com`. No alcanzó el recorrido administrativo/MSG-02 ni Drive. Los pasos aislados `webChatTabs` y `webChatRecovers` sí pasaron. Estos son resultados de la revisión, no una nueva ejecución ni un e2e aprobado en este seguimiento.

### Hallazgos menores y excepciones pendientes

| Revisión | Estado en este ledger y resultado de este encargo |
|---|---|
| F2, borrado limitado a 500 | Ya registrado como PRIV-01 y en rondas anteriores. Sigue abierto: con 501 vencidos queda uno; ajustar la spec privada no corrige la promesa pública. |
| F3, interruptor en páginas abiertas | Ya registrado en tercera revisión, 6, y cuarta, 6. Sigue abierto; 301 s no retiran el botón/formulario de una página cargada. |
| F4, lista de 200 sin paginación | Ya registrado en cuarta revisión, 1. Sigue abierto; contador 201, lista 200. |
| F5, ruta codificada sin `no-store` | Ya registrado como SEC-02. Sigue abierto; fuga efectiva por caché compartida no demostrada. |
| F6, borrar durante envío produce 500 | Ya registrado en tercera revisión, 4. Sigue abierto; carrera entre `chatOf()` y el INSERT. |
| F7, pérdida de borrador al cambiar chat/pestaña | Ya registrado en tercera revisión, 5. Sigue abierto. |
| F8, cobertura insuficiente de reapertura | Ya registrado en segunda revisión, 5, y tercera, 7. Sigue abierto; anular `openedAt` deja pasar los 8 tests del módulo. |
| **F9 / DOC-01, privacidad desfasada en la spec** | **No constaba como pendiente documental separado. Corregido aquí:** transcripción del aviso implementado con actividad de lectura, finalidad y condiciones de autoservicio/solicitud de borrado; C5, C10, C11 y C14 precisan llave, IP enviada a Turnstile, sondeo y límite real de retención. `site/apply.js` no cambia. PRIV-01 y PRE-33/PRE-34 siguen pendientes. |
| **F10 / PRIV-02, emails de administradores en historial público** | **Excepción heredada de GitHub, antes no registrada aquí. Abierta:** dos direcciones reales en `d41b339:migrations/0001_init.sql:56–57`, retiradas del árbol actual en `2d171c3`, todavía alcanzables desde HEAD. Se verificó solo el recuento y la ascendencia, sin imprimir ni copiar las direcciones. Facilita identificar cuentas objetivo; no demuestra acceso autenticado. Una eventual limpieza histórica y de copias/referencias requiere un encargo y autorización específicos; no se realiza ni se autoriza en este seguimiento. |

Se mantienen los otros menores ya aplazados, WAF/ANA-09, requisitos de PRE-34, publicación, avisador del VPS y Create applicant. Los avisos high heredados (F1 / SEC-01) siguen abiertos tras la investigación siguiente; no se reclasifican como seguros ni como resueltos.

### SEC-01: investigación de las nueve entradas high de npm

Evidencia del 6-nov-2026 sobre el lockfile de `9e6ed97`: `npm audit --json` devuelve **exit 1, 9 high, 0 critical**; `npm audit --omit=dev --json` informa **5 high, 0 critical**. Los totales low/moderate son cero **por entrada de paquete**, aunque `via` contiene avisos de esas gravedades. No son nueve fallos independientes: hay cuatro paquetes con avisos propios y cinco entradas que heredan el impacto. Árbol confirmado con `npm ls firebase @firebase/firestore @firebase/firestore-compat @grpc/grpc-js wrangler miniflare re2js sharp undici`; versiones y clasificación `dev` contrastadas con `package-lock.json`. Informes JSON fuera del repo: `/home/taller/encargos/hampton-msg02-documentacion-audit-20261106/`.

«Runtime» en esta tabla significa instalado por `dependencies` (sin marca `dev`), no prueba de que se ejecute el código afectado en Hampton. «Dev» no excluye riesgo para el proceso local o CI.

| Entrada y versión instalada | Tipo / ruta de dependencia | Causa concreta y exposición observada |
|---|---|---|
| `firebase@12.19.0` | Runtime, directa (`package-lock.json:2484`) | Hereda de Firestore y compat. Hampton solo importa `firebase/app` y `firebase/auth` (`admin/src/firebase.js:1–2`). No hay import de Firestore en el código de la app revisado. |
| `@firebase/firestore@4.17.2` | Runtime, transitiva de Firebase (`:894`) | Hereda de `@grpc/grpc-js`. Además incorpora `re2js`, que tiene su propia entrada high. No se ha demostrado ejecución de estas rutas por Hampton. |
| `@firebase/firestore-compat@0.4.14` | Runtime, transitiva de Firebase (`:916`) | Hereda de Firestore; comparte la misma instalación. Sin uso compat localizado en la app. |
| `@grpc/grpc-js@1.9.16` | Runtime, Firebase → Firestore → grpc-js (`:1231`) | Avisos propios de autenticación por certificados (high) y exposición de errores (low); condiciones detalladas abajo. |
| `re2js@2.8.6` | Runtime, Firebase → Firestore → re2js (`:2992`) | Aviso propio de DoS cuadrático con lookbehind optativo y coincidencias repetidas. |
| `wrangler@4.148.0` | Dev, directa (`:3380`) | Hereda de Miniflare; se usa como herramienta de desarrollo/despliegue, no como import de la API desplegada. |
| `miniflare@5.20261006.0-alpha` | Dev, Wrangler → Miniflare (`:2869`) | Hereda de Sharp y Undici. La simulación local tiene llamadas reales a ambos paquetes. |
| `sharp@0.35.4` | Dev, Wrangler → Miniflare → Sharp (`:3104`) | Aviso propio en librsvg; posible RCE bajo condiciones concretas. |
| `undici@7.29.1` | Dev, Wrangler → Miniflare → Undici (`:3226`) | Ocho avisos propios: cuatro high y cuatro moderate; una sola entrada high. |

Rutas plausibles y límites de la evidencia:

- **grpc-js:** [GHSA-m9gg-hp2v-232j, del mantenedor](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) requiere un servidor gRPC que cree credenciales con `requireClientCertificate: false` y use `getAuthContext` para autenticar: podría tratar certificados no autorizados como autorizados. [GHSA-f596-whhp-79r4](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4) permite que errores de handlers de un servidor revelen información en el estado enviado al cliente (low). Hampton no importa grpc-js ni crea ese servidor; Firestore es una dependencia instalada pero no importada por la app. No se ha demostrado una ruta desde las peticiones públicas de Hampton a esos handlers, ni se ha ejecutado una prueba de explotación. No equivale a certificar ausencia de riesgo.
- **re2js:** [GHSA-gg6h-894w-4m9c, del mantenedor](https://github.com/le0pard/re2js/security/advisories/GHSA-gg6h-894w-4m9c) afecta a `>=2.2.0 <2.8.7`. Texto controlado por un atacante podría agotar CPU si se compila un lookbehind con `LOOKBEHINDS` y se usa una API de coincidencias repetidas. En el módulo ESM de Firestore instalado, `dist/common-CLMydGSF.esm.js:15320–15350` compila sin ese flag y usa `matches`/`test`; no se localizó `LOOKBEHINDS` en esos archivos de Firestore. Hampton tampoco importa Firestore. Esa inspección acota la ruta observada; no demuestra seguridad de todos los consumidores ni sustituye la corrección del paquete.
- **Sharp:** [GHSA-wq5f-xc86-pv6w, del mantenedor](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) afecta a `<0.35.5`; librsvg puede permitir RCE en Linux/glibc bajo condiciones de ejecución específicas. Un SVG malicioso procesado por el simulador local de Images es una ruta plausible: Miniflare importa Sharp y entrega bytes a `sharp()` en `dist/src/index.js:119241–119261`. La app no importa Sharp; `server/routes/media.js:9–14,54–63` admite por firma JPG/PNG/WebP, y no se halló binding Images en `wrangler.toml`. No se probó que una carga de Hampton alcance ese decodificador, ni se verificaron las condiciones de explotación nativa. La exposición relevante es la herramienta local/CI; la marca dev no la elimina.
- **Undici:** Miniflare sí llama a `undici.fetch` (`dist/src/index.js:68210,79780`); una respuesta HTTP/TLS hostil o un destino comprometido alcanzado desde la simulación podría afectar al proceso local. No se reprodujo ninguno de los avisos en Hampton. Los `fetch` del código Worker no son por ello prueba de que la API desplegada use este paquete de npm; tampoco se auditó la versión integrada de Undici en Node.

Avisos concretos de `undici@7.29.1`, todos con corrección publicada para su rama en **7.30.1**:

| GHSA del mantenedor | Gravedad | Condición plausible; no demostrada en Hampton |
|---|---|---|
| [xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) | High | Respuesta con más de cinco codificaciones y cierre antes del cuerpo: error sin manejar y caída del proceso. El uso de fetch por Miniflare hace plausible esta clase de exposición. |
| [4w7w-5xrc-9h26](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26) | High | `Agent` sin origen fijo, caché compartida y `compose(redirect(), cache())`: redirección entre orígenes puede contaminar caché o revelar datos entre usuarios. No se localizó esa composición en el código de la app; no se ha probado su activación en el simulador. |
| [2m5v-pch6-74hx](https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx) | High | `Agent` pierde funciones de la opción `tls`, como `checkServerIdentity`; puede eludir validación adicional/pinning, sin requerir eludir necesariamente las comprobaciones TLS predeterminadas. No se demostró uso de esa configuración afectada en Hampton. |
| [qrxm-fqhp-jwvm](https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm) | High | Servidor TLS 1.2 renegocia con otro certificado válido cuyo nombre no coincide: aserción sin manejar y caída del cliente. Depende de alcanzar un endpoint malicioso/comprometido y negociar TLS 1.2. |
| [4qv8-2p9j-2685](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685) | Moderate | Consumo de memoria sin límite al analizar EventSource/SSE hostil. No se localizó uso de EventSource en la app. |
| [f72v-6w45-q472](https://github.com/nodejs/undici/security/advisories/GHSA-f72v-6w45-q472) | Moderate | Bypass de integridad SRI con nombres de algoritmo que no están en minúsculas; requiere usar esa comprobación con los tokens afectados. No demostrado aquí. |
| [9fm3-97px-rjf6](https://github.com/nodejs/undici/security/advisories/GHSA-9fm3-97px-rjf6) | Moderate | Servidor WebSocket causa acumulación ilimitada de PONG automáticos en el cliente. No se demostró una ruta al cliente WebSocket de Undici desde Hampton. |
| [55wc-3pg8-jfw6](https://github.com/nodejs/undici/security/advisories/GHSA-55wc-3pg8-jfw6) | Moderate | Excepción sin manejar en el interceptor de descompresión con respuesta hostil; activación del interceptor no demostrada en Hampton. |

### Opciones de actualización investigadas, sin aplicarlas

Se consultó el registro mediante `npm view` (versiones, dependencias y engines) y los avisos enlazados. Compatibilidad de rangos/engines no implica validación funcional. Entorno de comprobación: Node `v24.22.1`, npm `11.19.1`; `.node-version` pide 22. No se ejecutaron instalaciones, `npm update`, `audit fix`, overrides ni cambios al manifest/lockfile.

1. **re2js → 2.8.7:** parche del aviso y compatible con el rango `^2.8.3` declarado por Firestore 4.17.2. Pide Node >=20, compatible con el 22 del proyecto. Una futura actualización selectiva del lockfile puede resolver esta entrada sin cambiar Firebase; hay que repetir audit y validar, no basta modificar el número.
2. **grpc-js → 1.13.7 o 1.14.6 como candidatos para ambos avisos:** el aviso high publica correcciones en 1.13.6/1.14.5, pero el apartado Patches del aviso low indica 1.13.7/1.14.6, aunque audit sitúa el límite del low en `<1.13.6`. Se conserva esta discrepancia de fuentes y se proponen las versiones posteriores, sin certificar una corrección probada aquí. **No encajan** en `~1.9.0`, que Firestore 4.17.2 fija; ambas aceptan Node >=12.10.0, verificado con `npm view`. Un override selectivo sería de la misma major pero fuera del contrato del padre: exige pruebas de compatibilidad. `npm view 'firebase@^12.19.0'` solo devuelve 12.19.0; el latest 13.2.0 es cambio mayor y trae Firestore 4.19.1, que aún declara `~1.9.0`: actualizar al latest no acredita resolverlo. Audit propone **firebase 9.14.0**, un downgrade fuera de `^12.19.0`; no es una actualización compatible ni se adopta. Otra opción a estudiar es declarar solo los módulos App/Auth usados, ajustando imports y peers para no instalar Firestore: requiere trabajo y validación propios.
3. **Wrangler → 4.158.0:** encaja en `^4.148.0` y mantiene Node >=22. Su manifest declara **Miniflare 5.20261104.0-beta**, que declara exactamente **Sharp 0.35.5** y **Undici 7.30.1**, versiones corregidas de los avisos analizados. Puede resolver las cuatro entradas dev de esta cadena; verificar audit del árbol completo y pruebas del simulador en otro encargo. El cambio de Miniflare alpha a beta y workerd `1.20261006.1` → `1.20261104.1` merece validación aunque Wrangler conserve la major. No asumir que cualquier parche de Wrangler sirve: 4.149.0 declara otra alpha, `5.20261006.1-alpha`.
4. **Overrides dev alternativos:** Sharp 0.35.5 (Node >=20.9.0) y Undici 7.30.1 (Node >=20.18.1) conservan sus ramas, pero Miniflare instalado fija **versiones exactas**, 0.35.4 y 7.29.1; reemplazarlas por override exige validar Images, red y simulación. Preferible evaluar la combinación que declara el padre Wrangler. No cambiar Miniflare ciegamente a su etiqueta `latest`: el registro devuelve 4.20260730.0, con Sharp 0.35.2 y Undici 7.28.0, todavía en rangos afectados.

En un encargo posterior de dependencias habrá que escoger la opción, revisar el diff del lockfile, auditar el árbol resultante y validar autenticación Google, build y simulación pertinente, respetando el bloqueo de Turnstile y los requisitos de publicación. Este seguimiento identifica candidatos, no certifica compatibilidad funcional ni una app libre de vulnerabilidades.

### Validación del seguimiento documental

- `npm test`: **exit 0**, 587/587 Node, cero fallidas/canceladas/omitidas, y 14/14 Python, OK.
- `npm run build`: **exit 0**, Vite 8.3.3, 76 módulos; mantiene el aviso de chunk >500 kB (JS 675,97 kB, gzip 190,96 kB). Gate y aviso intactos.
- `npm run check:release`: **exit 0**, `No TO CONFIRM markers in site/.` No constituye aprobación de publicación ni resuelve los pendientes de PRE-34.
- `git diff --check`: **exit 0**. Solo cambian esta spec privada y este ledger; código, aviso público, dependencias, lockfile y migraciones quedan idénticos a `9e6ed97`.
- Logs de estas ejecuciones: `/home/taller/encargos/hampton-msg02-documentacion-audit-20261106/npm-test.log`, `npm-build.log` y `npm-check-release.log`. No se repite ni se declara aprobado el e2e completo.
- Verificada la ascendencia de `d41b339`, los dos padres de la integración (`7701aca`, `52681bb`) y el merge `9e6ed97`; se conservan. Este commit documental se añade como descendiente local del merge, sin reescribir historial. Sin push, migraciones ni publicación; cualquier autorización futura debe identificar el nuevo SHA y cumplir los bloqueos vigentes.
