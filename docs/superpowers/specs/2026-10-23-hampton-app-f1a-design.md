# Hampton App · F1-A: matching con el inventario propio

Fecha: 2026-10-23 · Estado: decisiones de Claude (Luis: «sigue con tus propuestas analizando lo mejor para la web») · Base: `main` después de F0
Parte de la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §5.5, §5.6, §9 F1). Donde este documento no dice nada, mandan la arquitectura y el spec de F0.

## 1. Intención

Hoy el equipo busca a mano qué casas encajan con cada aplicante. F1-A hace que, en cuanto un aplicante queda registrado o cambia sus requisitos, el sistema le proponga al momento las casas del **catálogo de Hampton** que cumplen lo imprescindible. Cada propuesta lleva su lista de requisitos (Meets / Fails / Unknown) con la frase que lo prueba, y el equipo la revisa en segundos con el teclado.

F1-B añadirá el inventario del mercado (Places.je, cuando llegue la clave) sobre esta misma base. F1-A se diseña para que eso sea añadir una fuente, no rehacer el matching.

**Éxito (verificable):**
- Al guardar un aplicante, sus coincidencias aparecen en su ficha en la misma respuesta, cada una con su lista de requisitos.
- Cambiar el precio, la disponibilidad, los dormitorios o la parroquia de una ficha actualiza sus coincidencias con todos los aplicantes activos.
- Una coincidencia rechazada no vuelve a proponerse para ese aplicante, y una revisada (Shortlisted o Rejected) nunca se pierde al recalcular.
- El equipo revisa 20 coincidencias en menos de 5 minutos solo con el teclado.

**No-objetivos de F1-A:** Places.je y anuncios de otras fuentes, deduplicación entre fuentes, Worker con cron, correos a agencias (F2), portal del aplicante (F2), filtro por estatus de vivienda (las fichas no tienen categoría de vivienda todavía), Deep Research, IA para convertir requisitos libres en etiquetas.

**Anti-objetivos:**
- Proponer una casa que incumple un requisito imprescindible conocido.
- Volver a proponer algo que el equipo ya rechazó.
- Perder una revisión del equipo al recalcular.
- Que guardar un aplicante o una ficha se note lento.
- Pestañas, columnas o botones que no hacen nada.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| B1 | El inventario de F1-A es la tabla `listings` | Son las casas que Hampton comercializa, incluidas las 264 de agencias que se comercializan juntas (A4). `properties` y `market_listings` llegan con F1-B, cuando haya una segunda fuente que deduplicar |
| B2 | Candidatas: fichas con `availability` en `for_sale`, `to_let` o `lease`, operación `sale` (para To Buy) o `rent` (para To Let), uso `residential`, país Jersey o vacío, **publicadas o no y archivadas o no** | Las archivadas co-listed siguen siendo casas a la venta o en alquiler (A4). La tarjeta indica «Not on website» cuando la ficha no está publicada |
| B3 | Nueva columna `listings.parish` (una de las 12 o NULL), rellenada por la migración a partir de `location` y `road_name`, y editable en el editor de fichas | Sin parroquia no se pueden respetar las zonas excluidas |
| B4 | El matching es una función pura en el servidor, sin IA | Son reglas exactas: SQL/JS no se equivoca y no cuesta (P-01) |
| B5 | Se recalcula de forma síncrona al guardar un aplicante (alta en el panel o en la web, cambio de requisitos, restauración) y al guardar o restaurar una ficha | Con cientos de aplicantes y ~300 fichas, cruzarlos cuesta milisegundos; no hace falta cola ni cron |
| B6 | Estados de la coincidencia en F1-A: `found` → `shortlisted` o `rejected` (con motivo); se puede deshacer a `found` | Los estados de agencia y aplicante (Waiting for agent confirmation…) llegan con F2 |
| B7 | Un aviso `matched` por aplicante: «N new matches for <name>», que se actualiza en vez de duplicarse y se cierra solo cuando no quedan coincidencias `found` | Es la pestaña Matched de tu texto, sin ruido |
| B8 | La cola de trabajo del aplicante (§4.1 de la arquitectura) aparece ahora en la lista como columna Queue | G3 la dejó para F1 |
| B9 | **Qué fichas se ofrecen**: nueva columna `listings.matchable` (0/1). La migración la pone a 1 en las publicadas y en las 264 importadas de agencias (ids `HE-R028` a `HE-R285`); el resto del catálogo antiguo (archivado por Luis el 7-oct) queda en 0. Archivar una ficha desde el panel la pone a 0. En el editor es un interruptor «Offer to applicants» | «Archivada» no distingue entre co-listed vigente y casa muerta; un indicador explícito evita proponer casas que ya no existen |
| B10 | **Rasgos precalculados**: al guardar una ficha (y con «Recalculate all») se guardan en columnas `feat_pets` (`yes`/`no`/NULL), `feat_parking` (plazas o NULL), `feat_furnished` (`yes`/`no`/NULL), `feat_outdoor` (lista o NULL), `feat_type` (`flat`/`house`/`cottage`/`studio` o NULL) y la evidencia de cada uno. El matching no vuelve a leer descripciones | En el plan gratuito de Workers cada petición tiene 10 ms de CPU; leer ~300 descripciones en cada guardado no cabe. Con columnas, el cruce es SQL + comparaciones |
| B11 | **Cuántas y cuáles**: solo se crea una coincidencia con puntuación ≥ 35, y como mucho las 25 mejores `found` por aplicante. El precio puntúa por cercanía al tope, no por barato: 20 si está entre `budget_min` (o el 60 % del tope si no lo hay) y el tope; 8 si está por debajo; 10 si se desconoce. Un precio por debajo del 75 % de `budget_min` excluye la casa | Con ~200 ventas activas, sin tope ni suelo un comprador recibiría 90 coincidencias, y una casa de 300 k no es lo que busca quien tiene 1 M |
| B12 | **Aplicantes que ya existen**: acción «Recalculate all» en la pantalla Review (por tandas de 50, la página repite hasta terminar) que rellena los rasgos de las fichas y recalcula a todos los activos. Se usa una vez tras el despliegue | Una migración SQL no puede ejecutar el matching |
| B13 | **Cola de un aplicante, una sola etiqueta por orden de prioridad**: `New properties found` (hay `found` creadas después de `applicants.first_reviewed_at`) → `Waiting for review` (hay `found` y nunca se revisó ninguna) → `In process` (hay `shortlisted`) → `No matches` (todo lo demás, también si todo está rechazado). `first_reviewed_at` se fija en la primera revisión y no se borra con Undo | Una columna y un filtro necesitan una etiqueta; la prioridad nunca esconde casas nuevas |
| B14 | **Aviso `matched`**: es de Needs action. Cada recálculo que crea coincidencias nuevas escribe un evento `applicant.matched` (`{new: N}`, visible en el Timeline). Si el aplicante ya tiene un aviso `matched` abierto, se actualiza su título con el total de `found`; si no, se crea uno nuevo colgado de ese evento. Se cierra al quedar 0 `found` o con Done | Cumple el `event_id` obligatorio y no duplica avisos |
| B15 | Sin aprobación en lote en F1-A, y sin preparar una salida separada de la Entrega 2 (todo en `main`; si hiciera falta adelantarla, sería con `wrangler pages deploy` de un commit concreto) | La puntuación aún no tiene datos de aciertos para fijar un umbral |

## 3. Datos (migración `0009_matches.sql`)

- `listings.parish TEXT` con CHECK a las 12 parroquias (mismos valores que `OPTIONS.parishes`). La migración la rellena buscando el nombre de la parroquia en `location`, y si no en `road_name`. Admite «St Helier», «St. Helier» y «Saint Helier», sin distinguir mayúsculas. Si aparecen dos parroquias distintas o ninguna, queda NULL.
- `matches`:
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`.
  - `applicant_id` referencia a applicants con `ON DELETE CASCADE`, y `listing_id` referencia a listings con `ON DELETE CASCADE`.
  - `score` (entero de 0 a 100) y `checks` (JSON, ver §4).
  - `status` (`found` | `shortlisted` | `rejected`), `reject_reason` (`price` | `area` | `size` | `condition` | `other`, solo si `rejected`), `reviewed_by`, `reviewed_at`.
  - `created_at`, `updated_at`.
  - `UNIQUE(applicant_id, listing_id)`; índices en `(status, applicant_id)` y `(listing_id)`.
- `notifications.category` admite también `matched`. SQLite no deja cambiar un CHECK, así que la migración reconstruye la tabla: la crea nueva, copia las filas, borra la antigua, la renombra y recrea sus índices. Va con prueba de que conserva filas e índices.
- Eventos nuevos: `match.reviewed` (`entity_type 'applicant'`, data `{listing_id, from, to, reason}`) para que el Timeline muestre las revisiones. Los recálculos automáticos no escriben eventos por cada coincidencia: llenarían el historial.

## 4. Reglas del matching

**Filtros imprescindibles.** Si uno falla, no hay coincidencia:
- La operación encaja (To Let con `rent`, To Buy con `sale`).
- El precio está dentro del presupuesto. El tope es `budget_stretch` si existe; si no, `budget_max`. Las rentas anuales se pasan a mensuales (÷12). Si la ficha no tiene precio o el aplicante no tiene tope, el requisito queda **Unknown** y la casa pasa.
- Dormitorios ≥ `bedrooms_min` y baños ≥ `bathrooms_min`. Si la ficha no lo dice, queda Unknown y pasa.
- La parroquia no está en `parishes_excluded`. Si la ficha no tiene parroquia, queda Unknown y pasa.
- Mascotas: si el aplicante tiene alguna y el texto de la ficha dice que no se admiten («no pets», «pets not permitted/allowed»), no hay coincidencia.

**Lista de requisitos** que se muestra en cada coincidencia, cada uno `meets`, `fails` o `unknown`, con una evidencia corta (la frase o el dato, máximo 120 caracteres):
- Budget, Bedrooms, Bathrooms y Area (parroquia deseada).
- Pets, Parking (si pide plazas), Furnished (si es alquiler y lo indicó) y Outdoor (si pidió jardín, terraza o balcón).
- Type (si pidió tipos).

Pets, Parking, Furnished y Outdoor se deducen del texto de `specs`, `summary` y `description` con patrones simples en inglés. Lo que no aparece es Unknown, nunca Fails. Ejemplos: «pets considered» o «pet friendly» cuentan como meets; «unfurnished» frente a «furnished»; «garage» o «parking for N» cuentan como meets si N ≥ las plazas pedidas.

**Puntuación de 0 a 100:**

| Componente | Puntos |
|---|---|
| Parroquia deseada (o el aplicante no indicó ninguna) | 30; si la parroquia de la ficha es desconocida, 15 |
| Dormitorios ≥ ideales | 15 |
| Posición del precio dentro del presupuesto | 20 × (1 − precio/tope), con un mínimo de 0; si se desconoce, 10 |
| Exterior, tipo y amueblado | 10 + 10 + 5 si encajan; la mitad si se desconoce |
| Ficha publicada en la web de Hampton | 10 |

La fórmula exacta y sus pesos viven en un solo sitio con su prueba.

**Recálculo:**
- Aplicante: si no está activo (archivado, `lost` o `completed`), se borran sus coincidencias `found` y no se calculan nuevas.
- Para cada candidata que pasa: si no existía, se inserta como `found`; si existía y está `found` o `shortlisted`, se actualizan `score` y `checks`; si está `rejected`, no se toca.
- Coincidencias `found` que ya no pasan: se borran, porque nunca se revisaron. Las `shortlisted` que ya no pasan se quedan, con su lista actualizada para que se vea qué falla ahora.
- Todo para un aplicante en un solo batch. Al guardar una ficha, lo mismo para cada aplicante activo afectado. Comentario `ponytail:` con el techo: un bucle en JS sobre todos los aplicantes activos, que pasaría a una cola si fueran decenas de miles.

## 5. Panel

- **Applicants (lista):**
  - Nueva columna **Queue**, calculada: `Waiting for review` (tiene coincidencias `found` y aún ninguna revisada), `New properties found` (tiene `found` creadas después de su primera revisión), `In process` (tiene alguna `shortlisted`), `No matches` (ninguna coincidencia).
  - Nueva columna **Matches**: «N found · M shortlisted».
  - Filtro por Queue.
- **Ficha del aplicante:**
  - Nueva pestaña **Matches** (tablist con las otras dos), agrupada en Found, Shortlisted y Rejected.
  - Cada tarjeta lleva: foto de portada (thumb), título, precio con su periodo, parroquia, dormitorios y baños, puntuación, lista Meets / Fails / Unknown con su evidencia, «Not on website» si aplica y enlace a la ficha.
  - Acciones: **Shortlist**, **Reject** (motivo en un toque) y **Undo**.
  - El Timeline muestra los `match.reviewed`.
- **Review** (`#/review`, en la barra con el contador de `found`): la cola de revisión por teclado de DESIGN.md.
  - Una coincidencia cada vez, de todos los aplicantes: primero el aplicante más antiguo, y dentro de cada uno, la puntuación más alta.
  - A = Shortlist, R = Reject (motivo con 1-5), S = Skip, todos también como botones; con Undo.
- **Inbox:** pestaña **Matched** (la categoría `matched`); el aviso enlaza a la pestaña Matches del aplicante.
- **Editor de fichas:**
  - Selector **Parish**.
  - Sección **Matched applicants**: cuántos aplicantes y cuáles, con su estado y su enlace.
- **Listings (lista):** filtro Parish y columna Parish.

## 6. API (resumen; el plan fija las formas)

- `GET /admin/applicants/:id` añade `matches` (con los datos de la ficha que pinta la tarjeta).
- `GET /admin/applicants` añade `queue`, `found` y `shortlisted` por fila, y acepta el filtro `queue`.
- `PUT /admin/matches/:id {status, reject_reason?}`: revisa la coincidencia, escribe `match.reviewed` y cierra el aviso `matched` si ya no quedan `found`.
- `GET /admin/review?after=<id>`: la siguiente coincidencia `found` en el orden de la cola, con el aplicante y la ficha.
- `GET /admin/listings/:id` añade `matched_applicants`; `PUT /admin/listings/:id` acepta `parish` y recalcula.
- Las altas y cambios de aplicante (panel y `POST /api/applicants`) y los cambios de ficha recalculan en la misma petición, después de guardar.

## 7. Despliegue

F1-A se construye en `main` encima de la Entrega 2. Mientras queden los `TO CONFIRM`, la compilación de Pages falla (G5), así que F1-A sale con la Entrega 2 cuando lleguen los datos legales. No se prepara una salida separada (B15). Tras el despliegue, Luis pulsa una vez «Recalculate all» (B12). La migración 0009 se aplica en remoto antes del push, como la 0008.

## 8. Ciclo y calidad

El mismo de F0 (spec §8): plan, construcción con subagentes (opus, effort high), revisión por tarea, revisión final con las skills, Playwright o chrome-devtools en local, y push solo con el sí de Luis. Las Global Constraints de F0 siguen valiendo.
