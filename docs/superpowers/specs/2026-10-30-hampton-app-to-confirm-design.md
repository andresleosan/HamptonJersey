# Hampton App · Fichas por confirmar (ADM-04)

Fecha: 2026-10-30 · Estado: aprobado por Luis en el chat («si», 30-oct) · Base: `main` en producción (`a9e0fe9`)
Parte de F4 en la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §4.4 y §5.10: «Tu regla de los 3 meses queda como `To confirm`»). Punto ADM-04 del checklist.

## 1. Intención

Texto de Luis: «Cada 3 meses si alguna propiedad no obtiene ninguna venta o no cambia el estado de la propiedad, pasa directamente a el estado "por confirmar" para que un agente se comunique con los encargados de la propiedad para ver si la propiedad sigue disponible para venta o renta.» Si nadie confirma una ficha publicada durante meses, la casa puede estar ya vendida o alquilada. La web la sigue ofreciendo y el equipo atiende a interesados en una casa que ya no está disponible.

**Éxito (verificable):**
- Una ficha cuenta como «To confirm» si cumple todo esto:
  - está publicada (`published = 1`) y sin archivar;
  - su disponibilidad es For sale, To let, Lease o Not stated;
  - su última confirmación tiene más de 3 meses, o más de 1 mes si es un alquiler.
- Esas fichas se ven en el panel: el número junto a Listings en la barra, la pestaña «To confirm» de Listings con su contador, una etiqueta en su fila y un aviso arriba de su ficha.
- «Still available» la confirma al momento. Está en la ficha y en el menú … de la fila. Al pulsarlo, la ficha sale de «To confirm» y el número de la barra baja.
- También la confirman: publicarla, cambiar su disponibilidad o su precio, y los cambios de disponibilidad que hace Sales. Editar textos, fotos, la especificación u otros campos no la confirma.
- La web pública no cambia.
- El número de la barra lee solo las fichas publicadas y sin archivar (índice parcial). Nunca recorre la tabla entera de unas 300 fichas en cada sondeo de 30 s.

**No-objetivos:**
- Un aviso en el Inbox. Decisión de Luis: llega más adelante con NOT-01, porque obliga a rehacer las tablas `events` y `notifications`, cuyos CHECK no admiten fichas.
- Avisos fuera del panel: Telegram con Hermes (AUT-14) y correo.
- Plazos editables en el panel. Llegan con la pantalla Automations (AUT-01).
- Guardar el contacto del propietario.
- Las casas de otras agencias: el inventario de F1-B detecta solo cuándo desaparecen.
- Un historial de quién confirmó y cuándo. El panel enseña fechas, no nombres del equipo.

**Anti-objetivos:**
- Ocultar o cambiar una ficha en la web sin que nadie lo decida.
- Que corregir una errata dé por confirmada una ficha.
- Que el número de la barra encarezca el sondeo del panel.
- Datos personales nuevos.

## 2. Decisiones

| # | Decisión | Quién |
|---|---|---|
| T1 | **Plazo:** 3 meses en venta y en traspaso de negocio, y 1 mes en alquiler (`operation = 'rent'`). Son meses de calendario, no 90 y 30 días | Luis eligió «Venta 3 meses, alquiler 1 mes» (30-oct). Que el traspaso cuente como venta y que sean meses de calendario lo decidió Claude |
| T2 | **Qué confirma** (pone `confirmed_at` a la hora del cambio): Publish; un guardado del editor que cambia `availability`, `sale_price`, `rent` o `premium`; los cambios de disponibilidad de Sales (oferta aceptada → Under offer, venta caída → For sale, venta completada → Sold); y el botón «Still available». Nada más | Luis eligió «Confirmar, o cambiar estado o precio» (30-oct). La lista exacta de campos es de Claude |
| T3 | **Qué fichas entran:** publicadas (aunque todavía no tengan foto pública), sin archivar y con `availability` en `for_sale`, `to_let`, `lease` o `not_stated`. Under offer, Sold y Withdrawn no entran: las ofertas y las ventas se siguen en Sales | Claude, aprobado con la descripción |
| T4 | **Se calcula al leer**, sin el reloj (AUT-07) y sin guardar el estado. Una ficha deja de estar «To confirm» en el mismo momento en que se confirma, y sigue funcionando aunque el reloj se pare | Claude, aprobado con la descripción |
| T5 | **Dónde se ve:**<br>• número junto a Listings en la barra, como el de Sales y el de Rentals, y no suma en el Inbox;<br>• pestaña «To confirm» con su contador en Listings, después de Published;<br>• etiqueta «To confirm» en la columna Availability de la fila;<br>• «Still available» en el menú … de la fila;<br>• en la ficha, la etiqueta junto al estado y, arriba de la columna principal, un aviso con el botón (tras la revisión: en el lateral tapaba sus enlaces bajo la barra de guardado) | Luis eligió «Contador en Listings + pestaña» (30-oct). El sitio exacto de cada cosa es de Claude |
| T6 | **La web no cambia** | Luis, «Sigue igual en la web» (30-oct) |
| T7 | **Sin contacto del propietario** en la ficha | Claude, aprobado con la descripción |
| T8 | **«Still available» no cambia `updated_at`**, como el orden de la portada y la estrella. Así un editor abierto con cambios sin guardar no da un falso 409 | Claude |
| T9 | **Migración 0017:**<br>• columna `listings.confirmed_at`;<br>• rellenada con el `updated_at` de cada ficha, la mejor fecha que se conoce hoy;<br>• índice parcial `listings_live` de las fichas publicadas y sin archivar.<br>En producción, tras aplicar la 0017 el 30-oct, las tres publicadas pedirán confirmación el 7-ene-2027 (HE-R003), el 8-ene-2027 (HE-R027) y el 27-ene-2027 (HE-R001) | Claude, aprobado con la descripción |
| T10 | Una ficha con `confirmed_at` en NULL no cuenta. Solo puede pasar con una ficha que no se ha publicado desde la 0017, por ejemplo una insertada con SQL. La importación de `Hampton_Database` (`scripts/import_hampton.py`), que se puede repetir y publica fichas, pone `confirmed_at` igual que `updated_at` | Claude (la importación, tras la revisión de la spec) |
| T11 | «Still available» aparece en el menú de la fila solo si la ficha está «To confirm». La ruta acepta cualquier ficha: confirmar una que no está vencida no hace daño. En la ficha, el botón cambia solo `confirmed_at` y conserva lo que se esté editando | Claude, tras la revisión de la spec |
| T12 | «Availability confirmed {fecha}» sale solo en una ficha publicada que está en el mercado y no está vencida | Claude, tras la revisión de la spec |

## 3. Textos (D19: en inglés)

| Dónde | Texto |
|---|---|
| Pestaña, etiqueta | «To confirm» |
| Botón | «Still available» |
| Aviso en la ficha | «Last confirmed {fecha}: call the owner to check it is still available.» (tras la revisión: «No change since» contradecía la línea «Edited» de la ficha, que cambia con cualquier edición) |
| Ficha publicada y al día | «Availability confirmed {fecha}» |
| Pestaña vacía | «No listings to confirm. A listing on the website asks for a call to its owner 3 months after its last confirmation, or 1 month for a rental.» |
| Tras confirmar | «{título}: confirmed as still available.» |
| Barra (lector de pantalla) | el número seguido de « to confirm» |

## 4. Diseño (DESIGN.md)

- La etiqueta es `.badge.attention` (bronze-dk). «To confirm» está en la fila *attention* de «Badges de estado».
- El aviso usa `.warn` (fondo warn-bg y borde bronce) con un botón `.btn.sm`. El número de la barra usa `.count`, como Sales y Rentals.
- El estado siempre lleva su texto, no solo color (*Text-Not-Color*).
- Sin tokens, fuentes ni atributos `style=` nuevos.

## 5. Lo que decide quien construye

- Los nombres y el sitio donde vive la regla, siempre que una sola expresión SQL sirva a la lista, a la ficha y al número de la barra.
- El marcado exacto del aviso y de la etiqueta.
- Qué fichas del seed del e2e llevan una confirmación antigua para probarlo.
