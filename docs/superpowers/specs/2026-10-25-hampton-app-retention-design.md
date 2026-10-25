# Hampton App · G2: borrado a los 12 meses sin actividad

Fecha: 2026-10-25 · Estado: decisiones de Claude (Luis: «si, empieza con el borrado a los 12 meses»; antes delegó las decisiones: «sigue con tus propuestas analizando lo mejor para la web») · Base: `main` después de la Entrega 2 (`49fdaa3`, en producción)
Cumple G2 del spec F0 (§2, «12 meses desde la última actividad del contacto… anonimiza a los 12») y lo que ya promete el aviso de privacidad publicado: «We keep your details for 12 months from the last activity on your record… After that we delete them or make them anonymous». Donde este documento no dice nada, mandan los specs de F0, F3-A y F3-C.

## 1. Intención

El aviso de privacidad ya está en la web y promete el borrado. Hoy solo existe el borrado a mano (F0 §3.4). Esta fase hace que se cumpla solo, avise antes y deje al equipo mantener a quien sigue activo.

**Éxito (verificable en pruebas con fechas fijas):**
- Un contacto cuya última actividad tiene más de 12 meses desaparece con todas sus búsquedas, coincidencias y ofertas, igual que con el borrado manual: sus eventos se quedan sin datos y sus avisos sin nombre.
- Un contacto con una búsqueda que tiene una venta (en cualquier estado) no se borra (F3-C, V14: 5 años).
- Una petición de visita cuya fecha tiene más de 12 meses se borra igual que con el botón Delete del Inbox.
- Entre los 11 y los 12 meses el contacto sale como «Expiring» en el panel, con la fecha de borrado, y el equipo puede apuntar una conversación, que reinicia el plazo.
- El proceso corre una vez al día como mucho y su coste no depende de cuántas veces se consulte el panel.

**No-objetivos:** avisar al contacto por email a los 11 meses (G2 lo pedía, pero no hay servicio de correo; G1 = avisos solo en el panel); el borrado de las ventas a los 5 años (la primera caduca en 2031: se hace antes de esa fecha); propietarios, inquilinos y contratos de F5-A (su retención es de 6 años, R19, y viven en otras tablas).

**Anti-objetivos:**
- Borrar a alguien que sigue en contacto con Hampton (por eso la visita y la conversación cuentan como actividad).
- Un borrado a medias: cada pasada es un único `batch`; o se borra todo lo de esos contactos o nada.
- Que el panel vaya más lento o lea toda la tabla en cada consulta del contador.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| E1 | **Inactivo** = `contacts.last_activity_at` anterior a «ahora menos 12 meses» (meses de calendario, `strftime(…, '-12 months')` sobre el ISO UTC guardado) | Es el reloj que F0 ya mantiene (`touch`) |
| E2 | **Cuenta como actividad**, además de lo que ya llama a `touch` (alta, cambios del equipo, envío repetido, ofertas y ventas): (a) una petición de visita, desde la web o el panel, de alguien cuyo email (en minúsculas) o móvil normalizado coincide con un contacto: se actualiza su `last_activity_at` en el mismo `batch`; (b) el botón **Log conversation** de la ficha del aplicante | El aviso dice «a conversation with us»; quien pide visitas sigue activo |
| E3 | **Exento**: el contacto con alguna búsqueda que tiene una fila en `sales`, en cualquier estado | V14 (5 años); la clave foránea `sales.applicant_id` ya impide borrarlo |
| E4 | **Qué se hace**: borrado definitivo, igual que F0 §3.4 (no anonimizar): se borran sus búsquedas (en cascada, `matches` y `offers`) y el contacto; los eventos de ambos quedan con `data = NULL`; sus avisos se cierran (`resolved_by = 'system'`) y pasan a «Deleted applicant»; se escribe `applicant.deleted` y `contact.deleted` con `actor = 'system'` | El aviso permite borrar o anonimizar. Borrar reutiliza lo que ya está probado, y Insights solo mira 90 días atrás, así que no pierde nada |
| E5 | **Visitas**: se borra cada `viewing_requests` cuya `date` es anterior a la fecha de Jersey de hoy menos 12 meses, como `DELETE /admin/viewings/:id`: avisos cerrados y con título «Deleted viewing request», eventos con `data = NULL` | Una visita guarda nombre, email y teléfono sin estar enlazada a un contacto |
| E6 | **Cuándo corre**: la primera vez cada día de Jersey que el panel pide `GET /admin/notifications/counts` (lo consulta cada pocos segundos mientras está abierto). Se reclama el día con un upsert condicional en `app_settings` (`retention_run` = `{"date": "YYYY-MM-DD"}`, solo si la fecha guardada es anterior); quien lo reclama ejecuta la pasada con `waitUntil`, después de responder | Pages no tiene cron. El equipo abre el panel cada día laborable; si nadie lo abre, la pasada siguiente recupera lo pendiente |
| E7 | **Tope por pasada**: 500 contactos y 500 visitas, los más antiguos primero; lo que sobra va en la pasada del día siguiente. El trabajo son unas 10 sentencias SQL por conjuntos, no una por persona | Mantiene el `batch` dentro de los límites de D1 Free con cualquier volumen |
| E8 | **Aviso previo**: «Expiring» = contacto no exento con la última actividad entre 12 y 11 meses atrás. El contador `expiring` va en `openCounts` y se muestra en el enlace **Applicants** («N expiring»). La lista de Applicants gana el filtro **Expiring** (`expiring=1`) y una etiqueta «Deletes 12 Nov» en cada fila que esté en ese tramo | G1 = A: los avisos van solo en el panel |
| E9 | **Ficha del aplicante**: una línea «Kept until 12 Nov 2027» (fecha de borrado = última actividad + 12 meses), o «Kept for 5 years: it has a sale» si está exento, y el botón **Log conversation** (`POST /admin/contacts/:id/conversation`, sin cuerpo): llama a `touch` y escribe `contact.conversation`; en la historia sale «Conversation logged» | Así el equipo mantiene a quien ha hablado con Hampton |
| E10 | **Migración `0014_retention.sql`**: `CREATE INDEX contacts_activity ON contacts(last_activity_at)` y `CREATE INDEX sales_applicant ON sales(applicant_id)` (la exención E3 se comprueba por contacto; `sales` solo tenía un índice parcial) | El contador del panel y la pasada leen solo las filas del tramo, no toda la tabla |
| E11 | **Aviso de privacidad**: «How long we keep it» añade la petición de visita a la lista de actividades y dice que una petición de visita se borra 12 meses después del día de la visita | Que el texto publicado diga exactamente lo que hace el sistema |
| E12 | **Textos del panel** en inglés (D19) | |

## 3. Lo que decide quien construye

- Dónde vive la lógica: un `server/retention.js` con la pasada, que se pueda llamar con una fecha fija desde las pruebas.
- Cómo se expresa el conjunto de contactos en cada sentencia del `batch` (por ejemplo, la misma subconsulta con `ORDER BY last_activity_at LIMIT 500` repetida; dentro del `batch` es una transacción y devuelve el mismo conjunto).
- El diseño exacto de la etiqueta, el filtro y la línea de la ficha, siguiendo `DESIGN.md` y lo que ya usan Sales y Rentals.

## 4. Despliegue

Migración `0014` en remoto antes del push. La primera pasada en producción no borra nada (los primeros contactos son de octubre de 2026), pero borrará visitas antiguas de antes de octubre de 2025 si existieran: hoy hay 0 peticiones de visita en producción.
