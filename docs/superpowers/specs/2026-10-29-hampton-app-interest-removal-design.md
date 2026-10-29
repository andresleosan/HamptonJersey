# Hampton App · Quitar a alguien del contador de interesados (VIS-02)

Fecha: 2026-10-29 · Estado: aprobado por Luis en el chat («si», 29-oct; los repetidos se unen, también el 29-oct) · Base: `main` en producción (`5a5d676`)
Parte de F3 en la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §5.9: «El equipo puede quitar a alguien, con motivo, y el interés caduca solo. La web lo muestra solo si es 2 o más y es real»). Donde este documento no dice nada, mandan el spec de F3-A (regla C10) y el de VIS-03 (`2026-10-28-hampton-app-public-interest-design.md`).

## 1. Intención

Luis lo pidió en su texto: «hacer que se haga un conteo de la cantidad de personas que estan interesadas en esa propiedad especifica. Y que los empleados mas adelante permita eliminar a los usuarios interesados. Para que en la landing page muestre si existen personas que estan interesadas». Desde VIS-03 (28-oct) la ficha de la web enseña «N people interested», así que el equipo necesita corregir el número cuando no es real. Hay tres casos: alguien que ya no está interesado pero tiene una visita marcada Proceed; la misma persona contada dos veces (una reserva por la web con email y otra apuntada por teléfono sin email); y alguien que no busca comprar ni alquilar (otra agencia, un vecino, familia del propietario). Hoy solo se puede cancelando o borrando la visita, y eso cambia la agenda o borra el historial.

**Éxito (verificable):**
- En Viewings filtrado por una casa (`#/viewings?listing=<id>`), una tarjeta «Interested now: N people» lista una vez a cada persona que cuenta, con su nombre, su email (o su teléfono si no dejó email) y la visita por la que cuenta.
- «Remove from count», con un motivo de la lista, saca a esa persona del número del panel y, en menos de un minuto, del de la web. La visita no cambia: siguen igual su estado, día, hora, negociador, notas, email, teléfono y `updated_at`.
- La persona quitada aparece en «Not counted» con su motivo, su nota y la fecha, y «Count again» la devuelve al número.
- «Counted twice» une a esa persona con otra de la lista: desde entonces cuentan como una sola, aunque una de sus reservas se cancele, caduque o se borre. «Count separately» lo deshace.
- Una visita de una persona quitada creada después de quitarla vuelve a contar.
- El número de la tarjeta, el del editor de la ficha, el del detalle de la visita y el de la web son siempre el mismo, porque salen de una sola regla.
- La consulta del número sigue leyendo por el índice `(listing_id, date)` de `viewing_requests`, sin recorrer la tabla.

**No-objetivos:** pedir motivo al cancelar una visita (cancelar ya la saca del número); detectar o juntar repetidos automáticamente (los une el equipo, uno a uno); editar el email o el teléfono de una visita; cambiar la web, que solo recibe otro número; un informe de motivos.

**Anti-objetivos:**
- Un número que no es real, ni hacia arriba ni hacia abajo (§5.9: «el contador nunca se infla»). Quitar a una persona nunca quita a otra, y unir a dos nunca deja a ninguna fuera.
- Que la web, la API pública o el Owner report enseñen quién fue quitado o unido, o por qué.
- Que quitar o unir cambie la visita, sus datos de contacto o la agenda del negociador.

## 2. Decisiones

| # | Decisión | Quién y dónde |
|---|---|---|
| R1 | **Dónde**: una tarjeta «Interested now: N people» en Viewings filtrado por casa, encima de las pestañas. Los enlaces «Active interest: N people» del editor de la ficha e «Interest in this listing» del detalle de una visita ya llevan ahí. Lista a cada persona que cuenta, con «Remove from count», y debajo «Not counted», con «Count again» | Luis, «Lista por casa» con su vista previa (29-oct) |
| R2 | **Motivo de una lista**: `No longer interested` · `Counted twice` · `Not a buyer or tenant` · `Other`. Con los tres que quitan (todos menos `Counted twice`) se puede añadir una nota de hasta 200 caracteres, obligatoria con `Other` | Luis, «Elegir de una lista» (29-oct). Los textos exactos y el límite de 200, Claude |
| R3 | **Si vuelve a reservar, cuenta**: quitar a alguien solo afecta a las visitas de esa casa que tiene en ese momento; una visita creada después cuenta | Luis, «Vuelve a contar» (29-oct) |
| R4 | **Se quita a la persona, no una visita**: todas las visitas de esa casa que la regla del contador (C10) reconoce como esa persona, sea cual sea su estado. La regla la reconoce por su email; una visita sin email, por el email de otra visita de la casa con el mismo teléfono, y si no lo hay, por el teléfono (últimos 10 dígitos). Una visita con otro email y el mismo teléfono es otra persona y no se toca. **Revisión del 29-oct:** si ese teléfono lo dieron con email dos personas distintas en la casa (una pareja con un móvil), la regla no adivina de quién es la visita sin email: cuenta por su teléfono, sale aparte en la tarjeta y el equipo la une a quien sea con «Counted twice». Antes se asignaba a quien tuviera la visita más temprana, y quitar o unir esa visita escribía el motivo en la ficha de la otra persona | Claude, aprobado con la descripción |
| R5 | **La visita no cambia**: ni su estado, ni su hora, ni sus notas, ni su email o teléfono, ni su `updated_at`, para que quitar o unir no invalide lo que otra persona del equipo tenga abierto (el bloqueo optimista de Viewings usa `updated_at`) | Claude |
| R6 | **Se puede deshacer**: «Count again» devuelve al número todas las visitas quitadas de esa persona en esa casa; «Count separately» separa a las personas unidas | Claude, aprobado con la descripción y con la pregunta de los repetidos |
| R7 | **Lo que cuenta no cambia** salvo por lo quitado y lo unido: visitas pedidas o confirmadas de hoy (día de Jersey) en adelante, y completadas de los últimos 30 días con Proceed o Need more information | Regla C10 de F3-A, P4 de VIS-03 |
| R8 | **«Not counted» solo enseña a quien contaría** si no se le hubiera quitado. Cuando sus visitas dejan de cumplir la regla, sale de la lista sola, igual que el número caduca solo | Claude |
| R9 | **Quitar dura hasta «Count again»**, aunque después se confirme, se mueva o se cierre esa visita (también con Proceed): nada vuelve a contar sin que el equipo lo decida, salvo una visita nueva (R3). Por eso el detalle de una visita quitada dice que no cuenta para el interés de la casa, con su motivo, su nota, la fecha y el botón «Count again», como aviso encima del formulario del resultado. Solo sale en visitas que todavía pueden contar (pedidas, confirmadas o con buen resultado en los últimos 30 días): en una cancelada o un no-show no cambiaría nada | Claude, tras la revisión del spec (los lectores preguntaron qué pasa si alguien quitado dice luego Proceed) |
| R10 | **Fechas, no nombres**: el panel enseña cuándo se quitó a alguien, no quién, como el resto del panel. Quién lo hizo queda en el registro de eventos de la visita pulsada: quitar, devolver, unir y separar escriben cada uno su evento, con el código del motivo y nunca la nota ni un email o teléfono. El evento solo se escribe si cambió alguna visita, en la misma operación | Claude; las fechas sin nombres son decisión de Luis (8-oct) |
| R11 | **Privacidad**: el motivo, la nota y la unión viven en cada visita de la persona y se borran con ella (12 meses después del día de la visita, o con Delete viewing, que además deja sin datos sus eventos). La unión guarda en las visitas de una persona la clave con la que cuenta la otra (su email, o los últimos 10 dígitos de su teléfono): es la misma persona según el equipo, y no se enseña como su contacto. Quitar, devolver, unir o separar no es actividad del contacto: no reinicia sus 12 meses (G2). El aviso de privacidad ya cubre este uso («keeping an accurate record of our dealings with you» y el número sin nombres), así que no cambia | Claude, aprobado con la descripción |
| R12 | **Datos**: migración 0016 con cuatro columnas nuevas en `viewing_requests`: `interest_removed_at` (hora ISO o NULL), `interest_reason` (`no_longer_interested`, `not_buyer` u `other`, con CHECK), `interest_note` (hasta 200, con CHECK) e `interest_same_as` (la clave de la persona con la que cuenta, hasta 254, con CHECK). Se aplica en remoto **antes** del push | Claude |
| R13 | **Pruebas pendientes de VIS-03**: los bordes de la regla. Una visita de hoy cuenta todo el día aunque ya haya pasado su hora; un no-show nunca cuenta; la medianoche que manda es la de Jersey (también en horario de verano); y el día 30 cuenta mientras que el 31 ya no | Relevo del 28-oct |
| R14 | **Unir («Counted twice»)**: el formulario pide `Same person as` y ofrece a las demás personas que cuentan en esa casa. Todas las visitas de la persona pulsada pasan a contar como la elegida, y las de la elegida quedan fijadas a esa misma clave (revisión del 29-oct): así la unión no depende de la visita que enlazaba un teléfono con un email, y si esa visita se borra, las dos siguen contando como una. Si después la persona elegida se une a una tercera, las ya unidas la siguen. La clave guardada se interpreta con la misma regla que el resto: si es un teléfono y otra visita de la casa da ese teléfono con un email, cuenta como ese email. Unir a alguien consigo mismo, o con alguien de otra casa, se rechaza. «Count separately» devuelve a cada visita unida de esa persona su propia identidad | Luis, «Unirlas en una» (29-oct); el detalle, Claude |
| R15 | **Lo que se ve de una unión**: en la tarjeta, la persona unida sale una vez, con `Also booked as <email o teléfono>` y el botón `Count separately`. Una visita creada después de unir con el contacto de la persona unida cuenta por separado (como R3), y el equipo la vuelve a unir | Claude, coherente con R3 |

## 3. Textos (D19: en inglés)

- Título de la tarjeta: `Interested now: N people` (`1 person`, `0 people`). Nota: `Upcoming viewings, and those of the last 30 days that went well. Each person counts once; the website shows the number from 2 people.`
- Cada persona: nombre; email, o teléfono si no hay email; y su visita: `Requested · Sat 2 Nov`, `Confirmed · Sat 2 Nov`, `Viewed 25 Oct · Proceed`, `Viewed 25 Oct · Need more information`. Si está unida: `Also booked as <email o teléfono>` y botón `Count separately`.
- Botón por persona: `Remove from count`. Formulario: leyenda `Why remove <name> from the count?`; opciones `No longer interested`, `Counted twice`, `Not a buyer or tenant`, `Other`. Con `Counted twice`, un desplegable `Same person as` con las demás personas (nombre · contacto); sin nadie más, la opción no se ofrece. Con las otras tres, el campo `Note (optional)`. Errores: `Choose a reason`, `Choose who they are` y `Add a note for Other`. Botones `Save` y `Close`.
- Sección `Not counted`: nombre, contacto, `<motivo> · <nota> · <fecha>` y botón `Count again`.
- Mensajes: `<name> no longer counts. The website shows the new number within a minute.`, `<name> counts again.`, `<name> now counts as the same person as <name>.` y `The bookings joined to <name> count separately again.` (el nombre es el de la persona que se queda).
- Vacío: `No one counts yet. People count from the moment they book a viewing, and for 30 days after one that went well.`
- Detalle de una visita quitada: `Not counted in this listing's interest: <motivo> · <nota> · <fecha>` y botón `Count again`, con el estilo de aviso (`.warn`) encima de los formularios.

## 4. Lo que decide quien construye

- Los nombres de funciones, de los eventos y la forma exacta de la ruta y de su respuesta, siempre que el número y las dos listas salgan de la misma expresión de «persona» que usa el contador.
- El orden de las listas y de las opciones de `Same person as`, siempre que sea estable.
- Cómo se refresca el número del detalle abierto tras quitar, devolver, unir o separar, siempre que nunca quede en pantalla un número viejo.
- Qué responde la ruta si dos personas del equipo hacen a la vez lo mismo sobre la misma persona (sin escribir dos eventos ni cambiar el motivo de la primera).
- El marcado y el foco, con los patrones que ya existen: `OutcomeForm`, `.view-form`, `.choices-set`, mensajes `role="status"` / `role="alert"`.

## 5. Restricciones

- **DESIGN.md**: textos en inglés (D19); cuerpo del panel de 14px; solo clases existentes (`.card`, `.btn.ghost.sm`, `.view-form`, `.choices-set`, `.choices`, `.check`, `.muted`, `.warn`); ningún color, fuente ni atributo `style=` nuevo; el estado se dice con texto (*Text-Not-Color*); densidad del panel (gaps de 8 a 16px); sin emoji.
- **Accesibilidad**: controles nativos (radio, select, textarea, button); cada campo con su etiqueta; errores con `aria-invalid` y `aria-describedby`; mensajes con `role="status"` o `role="alert"`; el foco va al formulario al abrirlo y vuelve a un sitio lógico al cerrarlo o guardar; a 390px nada se sale ni queda tapado.
- **Seguridad**: rutas solo para el equipo (sesión) y del mismo origen, como exige ya `server/api.js`; el servidor valida el id, la acción, el motivo (lista cerrada), la nota (texto de hasta 200) y que la otra persona sea de la misma casa; la base de datos refuerza motivo, nota y clave con CHECK; ningún dato personal en la API pública; React escapa todo el texto (nada de `dangerouslySetInnerHTML`).
- **Rendimiento**: la consulta de la web no empeora (índice `viewing_listing`); la tarjeta hace una sola petición al abrirse y una tras cada cambio.
- **`/avanzar`**: un solo commit al final con código, pruebas, `docs/roadmap/ESTADO.md`, el checklist, este spec, el plan y el ledger.
- **Despliegue**: la 0016 va en remoto antes del push. Si el código nuevo llegara a producción sin ella, `GET /api/listings` fallaría y la web no enseñaría las casas.
