# Hampton App · Pantalla Automations (AUT-01)

Fecha: 2026-11-01 · Estado: aprobado por Luis en el chat («1, 1, 1, sí», 1-nov) · Base: `main` en producción (`ced1e8e`)
Arquitectura §6.2 (pantalla Automations del panel) y §6.6 (Hermes). Punto AUT-01 del checklist; cierra el plazo de borrado de los trabajos de Hermes que AUT-13 dejó pendiente.

## 1. Intención

Texto de Luis: «Cada vez que se pide una automatización nueva, debe tener alguna interfaz fácil de usar». Hoy la app tiene tres cosas que corren solas y ningún sitio donde verlas: el reloj (AUT-07), el borrado de 12 meses (G2) y los borradores de textos de Hermes (AUT-13). Además, la pausa de los envíos solo la puede pedir Hermes. Si el reloj o Hermes se paran, nadie del equipo se entera.

**Éxito (verificable):**
- En Settings → Automations hay una tarjeta por automatización:
  - el reloj;
  - el borrado de 12 meses;
  - los borradores de Hermes;
  - los envíos a clientes y agencias.
- Si el reloj lleva más de 30 minutos sin dar una vuelta, o Hermes más de 15 sin pedir nada (solo si ya se conectó alguna vez):
  - su tarjeta lo dice en rojo;
  - el botón Settings de la barra lleva un número, desde cualquier pantalla, en el sondeo de 30 s que ya existe.
- «Pause all outbound» pausa los envíos desde el panel. Sale la barra de pausa de siempre, que dice quién la pidió, y «Resume sending» la quita.
- El borrado diario quita también los trabajos de Hermes a los 90 días: los cerrados y los que nadie tomó. Solo se cuentan, nunca se dice cuáles.
- Ningún dato de personas nuevo en pantalla ni en las respuestas: solo horas, números y títulos de fichas.

**No-objetivos (llegan con la primera automatización que los necesite):**
- Los modos Draft/Approve/Auto (AUT-10). Hoy lo único que propone algo es Hermes, y siempre lo aprueba una persona.
- El coste del mes. Hermes usa el plan de ChatGPT de Luis y no hay pago por llamada.
- Las plantillas de correo y de WhatsApp. No sale ningún envío automático (AUT-11).
- El interruptor de cada automatización. El reloj y el borrado de 12 meses no se apagan: el borrado es una obligación de privacidad. Para Hermes, Luis eligió no ponerlo ahora.
- Plazos editables, ni los de ADM-04 ni los de esta pantalla. Luis eligió la versión sin ellos.
- La ficha estándar de cada automatización (AUT-09).

**Anti-objetivos:**
- Que la pantalla enseñe nombres, emails o teléfonos de clientes, o los textos de las fichas.
- Que el número de Settings encarezca el sondeo del panel: como mucho, una lectura más de `app_settings`, y por clave.
- Que Hermes vea los avisos de la pantalla en su `status`: su respuesta no cambia.
- Que los avisos salten antes de que Hermes se conecte por primera vez. Antes de instalarlo no es una avería.

## 2. Decisiones

| # | Decisión | Quién |
|---|---|---|
| A1 | **Alcance:** las cuatro tarjetas de arriba, sin interruptores, modos, coste, plantillas ni plazos editables | Luis, opción 1 (1-nov) |
| A2 | **Dónde está:** en el menú Settings, como cuarta entrada después de Users. Ruta `#/automations` | Claude, aprobado con la descripción |
| A3 | **Avisos:**<br>• en la tarjeta, en rojo;<br>• número en el botón Settings y en la entrada Automations del menú: cuántas automatizaciones están paradas (0, 1 o 2). | Luis, opción 1 (1-nov) |
| A4 | **Umbrales:**<br>• reloj parado = su última vuelta tiene más de 30 minutos, o no hay ninguna (`clock` falta en `app_settings`);<br>• Hermes parado = su última petición tiene más de 15 minutos;<br>• sin ninguna petición de Hermes (`hermes` falta), no hay aviso y la tarjeta dice «Not connected yet». | Luis, «sí» a 30 y 15 (1-nov). Contar como parado un reloj sin ninguna vuelta lo decidió Claude: en producción la tiene desde el 29-oct |
| A5 | **Borrado de trabajos de Hermes:** en la pasada diaria de 12 meses, misma tanda y mismo tope de 500. Se borra todo trabajo que no esté en `draft` y cuya última actividad (`COALESCE(decided_at, claimed_at, created_at)`) tenga más de 90 días: usados, descartados y fallidos a los 90 días de cerrarse, y los que siguen en cola a los 90 días de pedirse. `retention_run` guarda también `jobs`, cuántos borró | Luis: 90 días (opción 1) y «también los que lleven 90 días en cola sin que Hermes los tome» (1-nov). Que entren también los `working` abandonados (Hermes los tomó y no volvió) y que un `draft` espere siempre a una persona lo decidió Claude |
| A6 | **Pause all outbound desde el panel:** cualquier persona con sesión, como «Resume sending». Si ya está pausado, se conservan quién y cuándo, igual que la pausa de Hermes. El botón está en la tarjeta de envíos y pide confirmación | Claude, aprobado con la descripción |
| A7 | **% de éxito de Hermes:** trabajos cerrados en los últimos 30 días; éxito = usados ÷ (usados + descartados + fallidos). Se enseñan los tres números además del porcentaje. Sin trabajos cerrados, «—». Son 30 días y no el mes de calendario: sin saltos el día 1. La hora de cierre es la de A5: un fallido no tiene `decided_at` | Claude |
| A8 | **Registro de Hermes:** los 20 trabajos más recientes, con ficha (referencia y título, enlace a su editor), estado, pedido por (persona del equipo o Hermes) y fechas. Ni los textos del borrador ni el email completo: «Team» o «Hermes». Los borradores que esperan a una persona salen aparte, con su enlace | Claude. Que no salga el email lo decidió Claude: la pantalla no necesita saber quién del equipo pidió el borrador |
| A9 | **Una ruta nueva, `GET /admin/automations`**, con sesión y mismo origen, como todo `/admin`. Lee solo `app_settings` (por clave) y `jobs`; los títulos salen de un JOIN con `listings` | Claude |
| A10 | **El sondeo de contadores** (`openCounts`) añade `stalled`: cuántas automatizaciones están paradas. La puerta de Hermes lo quita de su `status` (anti-objetivo) | Claude |
| A11 | **Detalles tras la revisión del diseño:**<br>• «asked by» en la tarjeta de envíos sale del contador `outbound` que ya usa la barra de pausa, sin datos nuevos en la ruta;<br>• el número `contacts` de `retention_run` se enseña como «applicants», y una pasada antigua sin `jobs` cuenta 0;<br>• una pasada en curso (unos segundos) se ve como «failed (attempt 1 of 3)»: se acepta;<br>• sin migración: `retention_run` es JSON. | Claude |

## 3. Textos (D19: en inglés)

| Dónde | Texto |
|---|---|
| Título y entrada del menú | «Automations» |
| Subtítulo | «What runs on its own, and when it last ran.» |
| Reloj | «Clock» · «Wakes every 10 minutes to run what is due.» · «Last run {fecha y hora}» · parado: «Stopped: no run for over 30 minutes.» / «Stopped: no run recorded.» |
| Borrado | «12-month clean-up» · «Once a day, deletes applicants and viewing requests inactive for 12 months, and Hermes jobs closed or untouched for 90 days.» · «Last run {fecha}: {n} applicants, {n} viewing requests, {n} Hermes jobs deleted.» · fallida: «Last run {fecha} failed (attempt {n} of 3).» · nunca: «No run yet.» |
| Hermes | «Hermes text drafts» · «Writes listing texts for a person to approve.» · «Last asked for work {fecha y hora}» · «Not connected yet» · parado: «Stopped: no request for over 15 minutes.» · «Last 30 days: {n} used, {n} discarded, {n} failed ({p}% used)» · «Waiting for approval» · «Recent jobs» · vacío: «No jobs yet. Once Hermes is connected, ask for a draft in a listing's editor.» (tras la revisión de diseño: un vacío dice su causa y su siguiente paso) |
| Envíos | «Sending to clients and agencies» · «Nothing is sent automatically yet; this switch stops any future sending.» · activo: «Active» + botón «Pause all outbound» (confirmación: «Pause all sending to clients and agencies?») · pausado: «Paused since {fecha} (asked by {quién})» + «Resume sending» |
| Número en Settings (lector de pantalla) | «{n} stopped» |

## 4. Lo que queda al constructor

- La forma de las tarjetas, con las reglas de DESIGN.md del panel: `card`, `warn` y `err` existentes, píldoras y `muted`.
- Cómo se pinta la tabla de trabajos recientes en el móvil (390 px). Sin desbordar en horizontal.
- Los nombres de los campos de `GET /admin/automations`.
