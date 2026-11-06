# Widen criteria: más casas cuando un aplicante tiene menos de 3 (BUS-17 + Widen de SAP-10)

Fecha: 6-nov-2026. Decisiones de Luis en el brainstorming del 6-nov («1 1 1»).

## Por qué
Un aplicante con 0, 1 o 2 casas se queda en «No matches» o se enfría («Gone quiet»). Hoy el equipo no sabe qué cambio en su búsqueda le daría más casas, ni cuántas. La arquitectura (§4 «Ampliar criterios», §5 acciones rápidas) pide calcular alternativas y sugerírselas al equipo. Es la primera automatización del matching que no necesita nada de fuera.

## Decisiones

| # | Decisión |
|---|---|
| W1 | **Cuándo sale.** En la pestaña Matches de la ficha del aplicante, si la búsqueda está activa (no archivada, ni Lost ni Completed; Paused incluida, la misma regla `isActive`) y tiene **menos de 3** matches entre Found y Shortlisted. Solo cuentan los de casas que siguen siendo candidatas (`CANDIDATES_SQL`): una Shortlisted de una casa ya vendida o alquilada no cuenta *(decisión del constructor)*. Con 3 o más, o cerrada, no sale. |
| W2 | **Tres alternativas**, cada una con cuántas casas nuevas daría: **presupuesto +10 %**, **una parroquia más** (la que más casas añade; empate por orden alfabético) y **un dormitorio menos**. Una sola alternativa cada vez, nunca combinadas. |
| W3 | **Cómo se cuenta.** Con `evaluate()` de `server/matching.js` sin cambiar ninguna regla: una casa cuenta si es candidata (`CANDIDATES_SQL` y la operación del aplicante), pasa los filtros duros con el cambio, llega a `MIN_SCORE` y **no tiene ya ninguna fila en `matches` con ese aplicante** (Found, Shortlisted ni Rejected: las rechazadas no se vuelven a proponer). El número son las casas **nuevas** que entrarían en Found, con el tope de `MAX_FOUND` (25) menos las Found que ya tiene; no resta las que pudieran salir *(decisión del constructor: sin `budget_min`, subir el tope sube también el inicio de la banda de precio, y una Found barata puede bajar de puntos; es raro y no cambia la decisión del equipo)*. Se calcula al abrir la ficha, sin guardar nada y sin reloj. |
| W4 | **Presupuesto +10 %.** Sube el tope que usa el matching: `budget_stretch` si lo hay, si no `budget_max`. El nuevo valor es el 10 % más, redondeado hacia arriba a £50 en alquiler (al mes) y a £1,000 en compra *(decisión del constructor)*. |
| W5 | **Una parroquia más.** Solo prueba las parroquias de la lista cerrada que no están en `parishes_wanted` ni en `parishes_excluded`. Hoy una casa fuera de las parroquias pedidas no se excluye, solo pierde 30 puntos (`area`); con la parroquia añadida los recupera y puede llegar a `MIN_SCORE`. |
| W6 | **Un dormitorio menos.** `bedrooms_min − 1`. `bedrooms_ideal` no cambia. |
| W7 | **Lo que no tiene sentido se oculta** (decisión 3 de Luis): sin tope de presupuesto, no hay alternativa de presupuesto; sin parroquias pedidas (le vale cualquiera), o sin ninguna parroquia libre, no hay alternativa de parroquia; con `bedrooms_min` vacío o de 1 o menos, no hay alternativa de dormitorios; si el nuevo presupuesto pasa del máximo que acepta la validación (`BUDGET` en `server/applicants.js`), tampoco. Si no queda ninguna, la tarjeta dice «Nothing to widen: this search already accepts any budget, parish and size.» (el texto exacto nombra solo lo que aplica; decide el constructor). |
| W8 | **Una alternativa que no añade casas** se muestra con «No more houses» y sin botón *(decisión del constructor: dice al equipo que ese cambio no sirve)*. |
| W9 | **El botón «Use this»** (decisión 1 de Luis) **no guarda nada**: cambia ese campo en el formulario de Requirements, abre esa pestaña y pone el foco en el campo cambiado; sale «Unsaved changes» como en cualquier edición. El equipo lo habla con el aplicante y pulsa Save (o Discard). Al guardar, el cambio queda en el historial como cualquier edición y el matching se recalcula como siempre. El valor nuevo sale de la búsqueda guardada; por eso, si el formulario tiene cambios sin guardar, los botones están desactivados con «You have unsaved changes in Requirements. Save or discard them to use these.», como Archive *(decisión del constructor)*. |
| W10 | **Solo en la ficha** (decisión 2 de Luis): ni en la lista de Applicants, ni en el Inbox, ni en el resumen de Telegram. |
| W11 | **Al aplicante no se le envía nada**: no hay canal (correo o Meta). Ninguna tabla ni migración nueva. |

## Dónde va (lo decidido)
- El cálculo es una función pura junto a `evaluate()` (la única fuente de las reglas del matching): recibe el aplicante, las casas candidatas y los ids ya emparejados, y devuelve las alternativas con su recuento y el valor nuevo del campo.
- `GET /admin/applicants/:id` la devuelve como `widen` (o `null` si W1 no se cumple). Lee las candidatas solo cuando W1 se cumple.
- El panel la pinta en `Matches` (`admin/src/ApplicantDetail.jsx`), encima del grupo Found.

## Lo que queda al constructor
- Nombres, estructura del JSON `widen` y textos exactos en inglés (sentence case, sin exclamaciones, sin «—» como separador).
- Cómo se ve: una `.card` con una fila por alternativa (qué cambia, de qué valor a cuál, «N more houses», botón `.btn ghost sm` «Use this» con texto `.sr` que diga cuál).
- El coste: con ~270 fichas candidatas son ~3 evaluaciones por ficha (presupuesto, dormitorios y una con su propia parroquia añadida, agrupando por parroquia). Medirlo en la prueba; debe caber en los 10 ms de CPU del Worker.

## Fuera
- Combinar alternativas, alternativas de baños, parking, mascotas o tipo.
- Avisos, lista de Applicants, Telegram y mensaje al aplicante (necesita canal).
- El botón Pause search (la otra mitad de SAP-10).
- Que el sistema cambie la búsqueda solo.

## Hecho cuando
- Un aplicante activo con menos de 3 matches ve la tarjeta con las alternativas que aplican y su recuento, y las casas contadas son las que aparecen nuevas en Found tras pulsar «Use this» y Save.
- Con 3 o más matches, o con la búsqueda cerrada o archivada, la tarjeta no sale.
- «Use this» no guarda nada hasta Save.

## Reglas de DESIGN.md que toca
- Componentes existentes: `.card`, `.btn ghost sm`, `.muted`, `.count`; nada de colores, fuentes ni librerías nuevas; sin emoji.
- Copy funcional en inglés, sentence case, sin exclamaciones; cada vacío con su causa.
- Accesibilidad: botones nativos con nombre accesible único (`.sr`); el foco va al campo cambiado; todo con teclado; nada tapado por la actionbar.
- Seguridad: el panel nunca usa `dangerouslySetInnerHTML`; la ruta sigue detrás del login de admin y no expone datos de otros aplicantes (solo recuentos de fichas).
- Rendimiento: el cálculo solo corre cuando se cumple W1, en el servidor y sin consultas por ficha.
