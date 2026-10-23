# Hampton App · F3-A: agenda de visitas con huecos reales

Fecha: 2026-10-23 · Estado: decisiones de Claude (Luis: «sigue con tus propuestas analizando lo mejor para la web», «sigamos con lo que podamos») · Base: `main` después de F1-A
Parte de la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §4.5, §5.9, §9 F3). Donde este documento no dice nada, mandan la arquitectura y los specs de F0 y F1-A.

## 1. Intención

Hoy la web ofrece cinco horas fijas (10:00, 11:30, 14:00, 15:30, 17:00) para cualquier agente y cualquier día, aunque ese agente no trabaje o ya tenga otra cita. El equipo recibe una petición, la confirma a mano y reza para que no choque. F3-A hace que cada negociador marque cuándo está disponible, que la web y el panel solo ofrezcan huecos reales, que los ocupados se vean como «Booked» sin datos de nadie (lo que pediste: que el usuario vea que otros ya tienen cita y se anime), y que dos personas nunca se queden con el mismo hueco.

F3-B añadirá lo que necesita servicios externos: Google/Outlook Calendar, invitaciones, recordatorios por email o WhatsApp, el formulario post-visita enviado al aplicante y las notas de voz.

**Éxito (verificable):**
- La web solo ofrece horas dentro del horario del negociador elegido, sin sus excepciones (vacaciones, horas bloqueadas) y sin las citas ya reservadas; las reservadas se ven como «Booked».
- Dos reservas simultáneas del mismo hueco: una entra y la otra recibe «That time was just booked» con los huecos actualizados. Cero dobles reservas, probado con concurrencia en el motor real de D1 local.
- El equipo confirma, reprograma, cancela y cierra una visita con su resultado (Proceed, Need more information, Not interested) desde el panel, y reserva por teléfono desde el panel con los mismos huecos.
- Cada ficha muestra en el panel cuántas personas tienen interés activo en ella.

**No-objetivos de F3-A:** sincronizar con Google u Outlook Calendar, enviar invitaciones o recordatorios, el formulario post-visita al aplicante, notas de voz, el informe semanal al propietario, restricciones por casa (inquilino, llaves, aviso previo), visitas en bloque u «open viewing», margen extra por cambio de parroquia, máximo de visitas por día, el contador público «N viewings booked this week», ofertas y expediente de venta (F3 completa).

**Anti-objetivos:**
- Ofrecer un hueco que el negociador no tiene libre.
- Dos citas activas del mismo negociador que se solapan.
- Mostrar en la web el nombre, email o teléfono de quien reservó.
- Perder una petición antigua o su estado al migrar.
- Pantallas o botones que no hacen nada.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| C1 | Nueva tabla `negotiators` (nombre, cargo, activo, horario semanal), separada de `admins` | Quien enseña casas (Gilberto y Joshua, según `site/data/team.json`) no es quien entra al panel hoy (Luis y Andrés). Se siembra con los dos nombres de `team.json` |
| C2 | Horario semanal: **una franja por día** (o día libre). Siembra: lunes a viernes de 10:00 a 17:30 y sábado de 10:00 a 13:00, editable en el panel | Cubre las horas que la web ofrece hoy. El equipo debe revisarlo antes de publicar (lo dice ESTADO.md); no es un bloqueo legal |
| C3 | Excepciones por fecha: `block` (todo el día si no lleva horas, o de hora a hora) y `open` (una franja que sustituye al horario de ese día) | Vacaciones, una hora con el médico, un sábado por la tarde extra |
| C4 | Visitas de **30 minutos** con **15 minutos de margen** antes y después de cada cita, sobre una rejilla de 30 minutos que empieza en la hora de apertura. Constantes en un solo sitio | Es la propuesta de la arquitectura (§5.9). Una cita a las 10:00 deja libre la de las 11:00 |
| C5 | Una petición `requested` ya **ocupa** su hueco; `cancelled` lo libera | Si no, dos personas podrían pedir el mismo hueco antes de que el equipo confirme |
| C6 | **Sin dobles reservas**: la reserva (web o panel) y la reprogramación se guardan con un `INSERT … SELECT … WHERE NOT EXISTS (cita activa solapada)` o un `UPDATE … WHERE NOT EXISTS`, junto con su evento y su aviso en el mismo batch. Si el hueco se ocupó entre medias no se guarda nada y la respuesta es 409 | En SQLite una sentencia es atómica: la segunda reserva ve la primera |
| C7 | Estados (`viewing_requests.status`): `requested` → `confirmed` → `completed` o `no_show`; `requested`/`confirmed` → `cancelled`. Reprogramar no es un estado: cambia la fecha y escribe un evento. `Reminded` y `Feedback received` llegan con F3-B | Son los estados de §4.5 que tienen sentido sin recordatorios ni formulario enviado |
| C8 | Migración de las peticiones actuales: `new` → `requested`, `contacted` → `confirmed`, `closed` → `completed` si su fecha ya pasó y `cancelled` si no. El `agent` de texto se enlaza con el negociador del mismo nombre; la hora de fin es la de inicio + 30 minutos | La arquitectura propone «según sus notas», lo que no se puede automatizar. La fecha es la mejor señal disponible. Las citas antiguas activas bloquean su hueco desde el primer día |
| C9 | Resultado al cerrar una visita `completed`: `proceed`, `more_info` o `not_interested` (con motivo opcional de texto, máximo 500). Lo anota el equipo | Son las tres opciones de tu texto; el formulario al aplicante llega con F3-B |
| C10 | **Interés activo por ficha** (solo en el panel): visitas `requested` o `confirmed` de hoy en adelante, más `completed` con resultado `proceed` o `more_info` de los últimos 30 días, contando una vez cada email | Es el contador de interesados de tu texto. Se calcula al leer, así que el interés caduca solo |
| C11 | La web reserva desde **mañana** y muestra **12 días** (lunes a sábado, como hoy). El panel puede reservar desde hoy (horas aún no pasadas, hora de Jersey) y hasta un año vista | Igual que ahora para el público; el equipo reserva por teléfono también para hoy |
| C12 | Endpoint público `GET /api/availability?from=YYYY-MM-DD&days=N` (N ≤ 14) sin datos personales: negociadores activos (`id`, `name`, `role`) y, por día y negociador, sus horas con `booked: true/false`. `cache-control: no-store` | La web pinta los huecos; nunca ve quién reservó |
| C13 | El formulario público elige negociador entre los que devuelve la API (con la foto de `team.json` si coincide el nombre) y la hora entre sus huecos de ese día. Días sin huecos libres, desactivados. Si la API falla: «Online booking is unavailable right now. Please call 01534 727582.» | Elimina las 5 horas fijas (`TIMES`) |
| C14 | Reserva desde el panel (**New viewing**): ficha (cualquiera no borrada) o «General enquiry / valuation», negociador, tipo, día y hora libres, nombre y email **o** teléfono. Entra directamente como `confirmed` y sin aviso en el Inbox | Es el equipo quien la crea: no hay nada que revisar. `email` pasa a admitir NULL |
| C15 | Sin enlazar visitas a contactos con un `contact_id` | G4 ya las enlaza por email y teléfono al leer la ficha del aplicante (F0); añadir una columna no cambia lo que ve el equipo |
| C16 | Sin cambios automáticos de etapa del aplicante al reservar | El equipo ya cambia la etapa a mano; automatizarlo sin las reglas de F3-B es adivinar |

## 3. Datos (migración `0010_viewings.sql`)

- `negotiators`:
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL UNIQUE` (1–80), `role TEXT` (≤ 80), `active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))`.
  - `hours TEXT NOT NULL`: JSON con las claves `mon` … `sun`, cada una `null` (libre) o `["HH:MM","HH:MM"]` con inicio < fin.
  - `created_at`, `updated_at`, `updated_by`.
  - Siembra: Gilberto Franco (Managing Director) y Joshua Franco (Negotiator) con el horario de C2.
- `negotiator_exceptions`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `negotiator_id` (referencia con `ON DELETE CASCADE`), `date TEXT NOT NULL`, `kind TEXT NOT NULL CHECK (kind IN ('block','open'))`, `start_time`/`end_time` (ambos NULL o ambos `HH:MM` con inicio < fin; `open` los exige), `note TEXT` (≤ 200), `created_at`, `created_by`. Índice `(negotiator_id, date)`.
- `viewing_requests` se reconstruye (SQLite no deja cambiar un CHECK), conservando ids, filas e índices, igual que `notifications` en 0009 y con su prueba:
  - `status` con el CHECK de C7 y `DEFAULT 'requested'`.
  - `negotiator_id INTEGER REFERENCES negotiators(id) ON DELETE SET NULL`.
  - `end_time TEXT` (`HH:MM`).
  - `outcome TEXT CHECK (outcome IS NULL OR outcome IN ('proceed','more_info','not_interested'))`, `outcome_note TEXT`.
  - `email` admite NULL; un CHECK exige email o teléfono.
  - Índices: el actual `(status, created_at)` y uno nuevo `(negotiator_id, date)` para el cálculo de huecos.
- Eventos nuevos (`entity_type 'viewing'`, sin datos personales en `data`): `viewing.booked` (panel), `viewing.confirmed`, `viewing.rescheduled` (`{from, to}` con fecha, hora y negotiator_id), `viewing.cancelled`, `viewing.completed` (`{outcome}`), `viewing.no_show`. `viewing.requested` sigue igual.

## 4. Reglas de los huecos

Función pura, un solo sitio, con sus pruebas: dados el negociador, sus excepciones, sus citas activas de ese día, la fecha y «ahora» en Jersey, devuelve sus horas del día con `booked`.

1. Franja del día: la excepción `open` de esa fecha si existe; si no, el horario semanal. Sin franja, no hay horas.
2. Horas candidatas: cada 30 minutos desde el inicio de la franja, mientras la cita de 30 minutos termine dentro de la franja.
3. Se quitan las que se solapan con una excepción `block` (sin horas = el día entero).
4. Se quitan las que ya pasaron, o las de hoy en la web (que reserva desde mañana, C11).
5. `booked: true` si la cita, con 15 minutos de margen por cada lado, se solapa con una cita activa (`requested` o `confirmed`) del mismo negociador ese día.
6. Una reserva o reprogramación solo se acepta si su hora sale de esta función con `booked: false`; la sentencia atómica de C6 cubre la carrera entre la lectura y la escritura.

Todo en hora local de Jersey (`date` `YYYY-MM-DD`, `time`/`end_time` `HH:MM`), como hoy.

## 5. Panel

- **Viewings** (`#/viewings`, la barra pasa a decir «Viewings»), con cuatro pestañas y su contador:
  - **Requests** (`requested`, la más antigua primero).
  - **Upcoming** (`confirmed` de hoy en adelante, agrupadas por día y con el negociador).
  - **Needs outcome** (`confirmed` cuya hora de fin ya pasó).
  - **Past** (`completed`, `no_show`, `cancelled`, la más reciente primero).
- **Detalle de la visita**:
  - Todo lo de hoy (email, teléfono, notas, borrar) y además negociador, hora de fin, estado e interés activo en la ficha («3 people interested»).
  - Acciones según el estado: Confirm, Reschedule (selector de negociador, día y hora con los mismos huecos), Cancel (con confirmación), Mark completed (con resultado y motivo), No-show.
- **New viewing**: el formulario de C14 en la pantalla Viewings.
- **Availability** (`#/availability`, nueva entrada de la barra):
  - Negociadores: alta, nombre, cargo y activo/inactivo; no se borran (D9: borrar = archivar).
  - Horario semanal por día (libre, o desde–hasta).
  - Excepciones próximas, con alta y borrado.
- **Ficha del aplicante**: el Timeline muestra el estado nuevo de cada visita (Requested, Confirmed…).
- **Editor de fichas**: «Active interest: N» con enlace a las visitas de esa ficha.
- **Inbox**: sin cambios. El aviso de una petición web se cierra al confirmarla o cancelarla.

## 6. API (resumen; el plan fija las formas)

- Público:
  - `GET /api/availability` (C12).
  - `POST /api/viewings` pide `negotiator_id`, `date` y `time` de un hueco libre, en lugar de `agent` libre. 409 si el hueco se ocupó.
- Panel:
  - `GET /admin/viewings?tab=requests|upcoming|outcome|past` (con contadores) y `GET /admin/availability` (huecos, con hoy incluido).
  - `POST /admin/viewings` (C14).
  - `PUT /admin/viewings/:id` con `{action: confirm|cancel|reschedule|complete|no_show, …}`, o con `notes`.
  - `GET/POST/PUT /admin/negotiators`, y `POST /admin/negotiators/:id/exceptions` y `DELETE /admin/negotiators/:id/exceptions/:eid`.
  - `GET /admin/listings/:id` añade `active_interest`.

## 7. Despliegue

F3-A se construye en `main` encima de F1-A y sale con la Entrega 2. La compilación de Pages sigue bloqueada por los `TO CONFIRM`. La migración `0010_viewings.sql` se aplica en remoto antes del push, después de la 0009. Antes de publicar, el equipo revisa en Availability los horarios sembrados de C2.

## 8. Ciclo y calidad

El mismo de F0 y F1-A: plan, construcción con subagentes (opus, effort high), revisión por tarea, revisión final, navegador en local, y push solo con el sí de Luis. Las Global Constraints de F0 siguen valiendo: textos en inglés (D19), borrar = archivar (D9) y nada personal en el almacenamiento del navegador.
