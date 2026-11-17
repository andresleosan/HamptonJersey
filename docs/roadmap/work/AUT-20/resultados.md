# AUT-20 · Resultados de la validación integral del recorrido de búsqueda

17-nov-2026. Suite: [`tests/server/aut-20-search-journey.test.mjs`](../../../../tests/server/aut-20-search-journey.test.mjs), ejecutada con `node --test tests/server/aut-20-search-journey.test.mjs` (17/17, tres ejecuciones seguidas sin fallos). Con `AUT20_REPORT=1` imprime la evidencia de cada comprobación.

## Cómo se ejecuta

Una sola base D1 local (node:sqlite, `tests/server/helpers.mjs`) con todas las migraciones y los módulos reales. Los interruptores se encienden **solo en el entorno de la prueba**: mercado, barrido diario, identidad, procedencia y rematch; disponibilidad e indisponibilidad; captura; papelera y purga; consulta, envío, respuestas y llamadas; fotos, presentación y su revisión; visitas VIS-08 y VIS-17; revisión BUS-17; dictado AUT-19; pestañas y acciones del Inbox.

El recorrido sigue este orden:

1. Directorio de tres fuentes y barrido diario.
2. Alta de dos búsquedas de un mismo contacto y de otros dos hogares.
3. Matching y revisión humana.
4. Consulta compartida, llamada y respuesta confirmada.
5. Captura, ficha y descargas.
6. Presentación privada y respuesta del cliente.
7. Visita multiparte y ciclo de la visita.
8. Dictado de criterios.
9. Cierre humano de una búsqueda e indisponibilidad confirmada.
10. Barrido y rematch del día siguiente.
11. Revisión interna del día 21 y su repetición a los 7 días.
12. Purga de fotos a los seis meses.

Los casos X2 y X3 usan un segundo entorno pequeño con los mismos módulos y el proveedor de correo simulado de las pruebas existentes (`env.EMAIL`). En todo el recorrido solo hay datos sintéticos: no se usa red, producción ni cuentas reales, y no se envía nada.

## Resultados

| Comprobación | Resultado | Prueba |
|---|---|---|
| A01 · Un parking imprescindible incumplido nunca da «completo», aunque la puntuación sea la máxima | pasa | `A01 · A02: a must-have parking not met is never complete…` |
| A02 · Si no se sabe si se admiten mascotas, el match queda pendiente | pasa | `A01 · A02: …` |
| A03 · Tres webs de una misma casa: tres publicaciones en un solo registro | pasa | `A04 · X4 · A03: the sweep keeps a failed source's adverts…` |
| A04 · Una fuente que falla no retira sus propiedades | pasa | `A04 · X4 · A03: …` |
| A05 · Sin decisión humana no hay contacto automático | pasa | `A05: without a person's approval…` |
| A06 · Consulta común sin mezclar datos ni sumar ocupantes | pasa | `A06 · X1: two people approve and prepare at once…` |
| A07 · A los dos días hábiles aparece la llamada con todos los teléfonos; la respuesta actualiza la tarea | pasa | `A07: two working days after sending…` |
| A08 · Una respuesta confirmada actualiza todos los matches de su alcance | pasa | `A08 · A09 · X4: the confirmed answer…` |
| A09 · La disponibilidad confirmada activa captura, ficha y descargas; una captura parcial no se declara completa | pasa | `A08 · A09 · X4: …` |
| A10 · La propuesta de la agencia espera todas las confirmaciones | pasa | `A10 · A11: the agency's proposal waits…` |
| A11 · Una visita confirmada o realizada mantiene activa la búsqueda | pasa | `A10 · A11: …` |
| A12 · El día 21 hay una revisión interna con 20 alternativas como máximo, sin envíos ni cambios | pasa | `A12 · X1 · X5: on Jersey day 21…` |
| A13 · Un dictado sin confirmación no cambia los criterios | pasa | `A13 · X1: a dictated change waits for a person…` |
| A14 · Lo confirmado como no disponible sale de las propuestas, y una lectura antigua de la web no lo reactiva | pasa | `A16 · A14: a person closes one search…` |
| A15 · A los seis meses solo se purgan los archivos definidos, nunca el historial | pasa | `A15 · X4 · X5: six calendar months…` |
| A16 · Cerrar una búsqueda conserva las demás y el barrido diario | pasa | `A16 · A14: …` |
| X1 · Dos empleados o dos ticks a la vez | pasa | `A06 · X1`, `A13 · X1`, `A12 · X1 · X5`, `X3` |
| X2 · Cambio material después de aprobar y antes de enviar | pasa | `X2: a material change after approval…` |
| X3 · El proveedor acepta el envío pero se pierde el acuse | pasa | `X3: the provider accepts but the acknowledgement is lost…` |
| X4 · Lectura, captura o purga parcial con reintento | pasa | `A04 · X4 · A03`, `A08 · A09 · X4`, `A15 · X4 · X5` |
| X5 · Límites de fecha de Jersey, cambios de hora y meses de distinta longitud | pasa | `X5: Jersey dates…`, `A12 · X1 · X5`, `A15 · X4 · X5` |

La prueba final, `AUT-20: A01–A16 and X1–X5 passed together over one journey`, falla si alguna de las 21 comprobaciones no registró su resultado como «pasa».

## Evidencia por comprobación

### Matching y contacto (A01, A02, A05)

- **A01.** HE-R002 tiene una plaza de parking y el hogar exige dos. Obtiene 90 puntos, los mismos que HE-R001, pero queda como `alternative`: la comprobación de parking da `fails`/`must` y `requirements_rank` es 2.
- **A02.** HE-R003 no dice nada de mascotas y el hogar tiene un perro. El match queda `pending`, con la comprobación de mascotas `unknown`, y se conserva (`found`, rango 1).
- **A05.** Después del recálculo y de un rematch de BUS-04 no hay consultas ni correos salientes (0 en `consultations` y 0 en `outbound`), y todos los matches siguen en `found`. Preparar una consulta sobre un match no aprobado devuelve 409.

### Mercado (A03, A04)

- **A03.** Una persona decidió que los tres anuncios son la misma casa. `GET /admin/market/homes` devuelve una sola casa con las publicaciones de agency-a, agency-b y agency-c: hay 3 filas en `market_listings` y 2 en `market_identity_aliases`.
- **A04.** El día 1, agency-b queda bloqueada tras agotar sus intentos. Aun así:
  - su anuncio sigue con `gone = 0`;
  - `market_sweep_missing` queda a 0, sin lápidas ni confirmaciones;
  - la casa conserva sus 3 publicaciones;
  - el aviso del barrido dice «0 adverts not found, 1 sources not read in full».

### Consulta, llamada y respuesta (A06, A07, A08)

- **A06.** Hay una sola consulta (`general:HE-R001:rent`) para dos matches aprobados de dos hogares. La prepararon a la vez dos personas.
  - El texto indica «household of 3 people» para el hogar elegido, nunca 4 ni 7 (la suma).
  - Ni la consulta, ni sus enlaces, eventos o tareas contienen nombres, correos, teléfonos, presupuesto o mascotas.
- **A07.** Antes de los dos días hábiles no hay tarea. A partir de ese momento hay una sola, por muchas pasadas que haga el reloj:
  - `consultation:<op>:call`, con su fecha límite y el texto «3 phone numbers»;
  - los números se leen en vivo del directorio y nunca se copian a la tarea;
  - en el Inbox aparece como `agency_reply` con la acción Call;
  - la reclama una segunda persona (NOT-11);
  - una respuesta «sin contestar» mantiene abierta la misma tarea.
- **A08.** Queda una sola confirmación de EST-16 (agencia, teléfono, alcance de la propiedad).
  - Las tarjetas de las dos búsquedas muestran `answered_available`, `confirmed` y `approved`.
  - La tarea de llamada queda resuelta y las búsquedas siguen activas.

### Captura (A09)

- La confirmación capturó HE-R001 una sola vez. Al faltar P2, la captura queda parcial (1 de 2 archivos), con `data.json` en `complete:false` y su tarea.
- Cuando llega el archivo y se vuelve a comprobar, la misma captura y los mismos archivos pasan a completos: `data.csv` dice `complete,yes`.
- Las descargas son adjuntos con `no-store`.

### Visita (A10, A11)

- **A10.** Se propone la visita desde la búsqueda (SAP-09/VIS-17) con cliente, anunciante y personal.
  - Tras aceptar el cliente y el personal, sigue en `requested`, y Confirm devuelve 409.
  - Solo se confirma cuando acepta el anunciante, con un único evento `viewing.confirmed`.
- **A11.** Después de confirmar, completar y registrar la opinión, todas las búsquedas conservan su estado, su etapa y su archivo.

### Revisión del día 21 (A12)

- La búsqueda de compra no tiene revisión antes del tick del día 21 de Jersey. En ese tick se abre una, aunque lleguen dos ticks a la vez.
- Contiene 1 alternativa interna (el máximo es 20) y su tarea dice «Nothing was sent and the criteria did not change.».
- Los criterios, los matches, `outbound` y `criteria_proposals` quedan sin cambios.
- Cerrada con Done el día 21, la siguiente se abre 7 días después (ciclo 2).

### Dictado (A13)

- La propuesta de Hermes (presupuesto de 2.200) no cambia ni los criterios ni los matches, y crea la tarea «Confirm proposed criteria changes».
- Dos personas confirman a la vez: se aplica una sola vez, la revisión sube en 1 y los demás imprescindibles no cambian.

### Indisponibilidad, cierre y purga (A14, A15, A16)

- **A14.** La agencia confirma que HE-R001 está alquilada.
  - El match `found` del hogar tres desaparece, y la tarjeta aprobada del hogar dos muestra `confirmed_unavailable`.
  - La lectura antigua de agency-a sobre la casa no genera cambio.
  - Tras el barrido, el rematch y el recálculo, no vuelve como match, ni como match de mercado, ni como propuesta.
- **A15.** La purga corre exactamente en la fecha límite de seis meses naturales de Jersey; un milisegundo antes no borra nada.
  - Se borran solo las 22 fotos externas y sus miniaturas, en dos tandas (20 y 2), con dos eventos `listing.photos_purged`.
  - Se conservan las fotos propias capturadas y el PDF.
  - Las confirmaciones, los archivos de la captura, la consulta, la visita, las búsquedas y los eventos anteriores no cambian.
- **A16.** Una persona resuelve la búsqueda de alquiler del hogar uno.
  - Su búsqueda de compra y las de los otros hogares siguen activas.
  - El barrido del día siguiente cruza el anuncio de venta S-1 solo con la búsqueda de compra (un aviso), y el piso R-1 solo con las búsquedas de alquiler abiertas.
  - La búsqueda cerrada conserva sus matches y no recibe nada.

### Casos transversales (X1–X5)

- **X1.** En cada caso de concurrencia gana una sola acción:

  | Qué ocurre a la vez | Resultado |
  |---|---|
  | Preparar la misma consulta | 200 + 201: una consulta, una tarea y un evento |
  | Confirmar el mismo dictado | 200 + 409 |
  | Dos ticks de la revisión | una revisión y una tarea; nunca dos abiertas por búsqueda |
  | Done sobre la misma tarea | 200 + 409 |
  | Enviar el mismo correo | una sola fila en `outbound` |

- **X2.** Una persona aprueba y encola el correo, y luego cambia el alquiler.
  - El tick no envía nada: `outbound` queda `cancelled` y la consulta vuelve a `manual_pending`, revisión 2, sin fecha de envío.
  - Enviar la revisión 2 sin una nueva aprobación devuelve 409.
- **X3.** El proveedor aceptó el correo, pero falló la escritura `accepted`.
  - `outbound` queda `unknown` y la consulta pasa a `needs_review`.
  - Reenviar y dos ticks más siguen dejando 1 correo y 1 fila.
  - La persona confirma que salió (`sent` por email); una segunda respuesta devuelve 409.
- **X4.** Tres reintentos tras un fallo parcial, todos sin duplicados:
  - **Lectura:** la página 2 de agency-a falla una vez y se reintenta desde el cursor 10, sin observaciones duplicadas.
  - **Captura:** parcial, y después completa sobre la misma captura (eventos `partial` y `complete`, una tarea).
  - **Purga:** 22 fotos se borran en tres pulsaciones (20, 2 y 0).
- **X5.** Las fechas se calculan en tres relojes:

  | Reloj | Casos cubiertos |
  |---|---|
  | `searchReviewClock`, 8 casos | ambos cambios de hora, febrero de 28 y de 29 días, fecha de Jersey frente a fecha UTC, hueco de primavera, repetición de otoño, fin de año, repetición a los 7 días y límite de 1 ms |
  | `callDue`, 4 casos | ambos cambios de hora y un fin de mes |
  | `purgeDueAt`, 5 casos | 31 de agosto → 28 o 29 de febrero, cambio de hora, hueco y repetición |

  Además se comprobaron en el recorrido real los límites del día 21 de BUS-17 y de los seis meses de EST-19.

## Defectos de producción

Ninguno. Ninguna comprobación necesitó cambiar código de producción.

## Observaciones (no invalidan el recorrido)

Las cuatro están en [MEJORAS](../../MEJORAS.md), cada una con su tarea:

- **EST-19.** Si falla el almacenamiento, la purga ya borró las filas y deja los archivos huérfanos, anotados en `listing.photo_files_left`; el reintento no los borra. El comentario de cabecera de `server/property-photo-purge.js` decía lo contrario y ya está corregido (solo el comentario).
- **AGE-08.** `callDue` cuenta de lunes a viernes, sin los festivos de Jersey: del jueves 30 de abril de 2026 pasa al lunes 4 de mayo, que es festivo.
- **EST-15.** La regla de que una lectura web antigua no reactiva se cumple por la estructura: la propiedad vinculada nunca es candidata de mercado, y una lectura con `source_at` anterior ni pasa a ser la última ni escribe cambios. `server/est-15-scoped-unavailability.js`, que formula esa regla de forma pura, no tiene llamadas.
- **NOT-11.** Las tareas de BUS-17 y AUT-19 nacen sin responsable ni plazo; los asigna una persona (reclamar o editar). Solo la llamada de AGE-08 trae plazo propio.

La suite de servidor deja AGE-09 apagado, porque no es una de A01–A16. El recorrido de navegador sí lo enciende y muestra su evidencia ([acceptance.md](acceptance.md)).

## Qué no se verificó aquí

- **Interfaz.** Está cubierta aparte, en el recorrido de navegador `tests/aut20-journey.e2e.cjs`: capturas a 1280 y 390, teclado, zoom del 200 %, y consola y red sin errores. Ver [acceptance.md](acceptance.md) y [evidence-index.json](evidence-index.json).
- **Servicios reales.** No se probaron el envío real de correo, el proveedor real ni producción: el transporte es el simulado, que demuestra el contrato local pero no una entrega real.
- **Relojes del servidor.** Los pasos que usan la hora real (envío manual, respuestas, VIS-17) se ejecutan con la fecha del momento. Las fechas futuras de los relojes (día 21, seis meses) se inyectan o se simulan con `t.mock.timers`, como en las pruebas de cada módulo.
