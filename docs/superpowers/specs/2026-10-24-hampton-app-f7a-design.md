# Hampton App · F7-A: Insights en el panel

Fecha: 2026-10-24 · Estado: decisiones de Claude (Luis: «sigue con tus propuestas analizando lo mejor para la web», «sigamos con lo que podamos») · Base: `main` después de F3-A
Parte de la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §5.14, §9 F7). Donde este documento no dice nada, mandan la arquitectura y los specs de F0, F1-A y F3-A.

## 1. Intención

Hoy nadie en Hampton sabe qué fichas mira la gente, qué piden los aplicantes que el inventario no cubre ni cuánto tarda el equipo en contestar. F7-A pone esas respuestas en una pantalla **Insights** del panel, sin servicios externos:

- **Demanda sin cubrir**: qué buscan los aplicantes activos (operación, parroquia, dormitorios, presupuesto) frente a las casas disponibles. Sirve para captar propietarios: «we have tenants waiting for a home like yours».
- **Fichas más vistas**: la web empieza a contar, sin cookies ni datos personales, cuántas veces se abre cada ficha, su galería y su tour 3D. Conviene que cuente cuanto antes: cada día sin contar es un día de datos perdido.
- **Embudo**: de los aplicantes que llegaron en el periodo, cuántos llegaron a visita, a oferta, a acuerdo y a cierre.
- **Tiempos del equipo**: cuánto tarda en atender a un aplicante nuevo, en contestar una petición de visita y en revisar la primera lista de casas.

F7-B añadirá lo que necesita servicios externos: el resumen semanal por email y el tráfico de Cloudflare Web Analytics dentro del panel.

**Éxito (verificable):**
- La dirección ve en Insights la demanda sin cubrir por parroquia (el «hecho cuando» de F7 en §9), separada en alquiler y compra.
- Abrir una ficha publicada en la web suma una vista a esa ficha y a ese día; abrir su galería o su tour suma lo suyo. Nada se guarda en el navegador y la petición no lleva cookies ni datos personales.
- El embudo y los tiempos salen de datos que ya existen (`applicants`, `events`, `viewing_requests`, `matches`), y sus números se comprueban en pruebas con datos sembrados.

**No-objetivos de F7-A:** el resumen semanal por email; integrar Cloudflare Web Analytics (es un interruptor en el panel de Cloudflare que Luis puede activar cuando quiera, sin código); contar búsquedas y filtros de la web (la portada no muestra filtros mientras haya pocas fichas); el contador público «N people interested»; tiempos de respuesta de agencias (F2); actividad por persona; exportar a CSV; gráficos con librerías.

**Anti-objetivos:**
- Guardar en `daily_stats` o en el navegador cualquier cosa que identifique a una persona (IP, cookie, email, id de sesión).
- Que una vista de la web falle o retrase la página si el contador falla.
- Números que no se pueden reproducir con una consulta: cada cifra de la pantalla dice de dónde sale.
- Mostrar en Insights nombres o datos de aplicantes: solo recuentos y medianas.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| I1 | Nueva tabla `daily_stats (day, listing_id, metric, n)`, una fila por ficha, día y métrica que se incrementa (`INSERT … ON CONFLICT DO UPDATE SET n = n + 1`). Métricas: `view` (se abre la ficha), `photos` (se abre la galería a pantalla completa), `tour` (se abre el tour 3D de la ficha). `day` es la fecha de Jersey | Es el diseño de la arquitectura (§5.14): pocas filas y ninguna persona. Las reservas no se cuentan aquí: ya están en `viewing_requests` |
| I2 | Endpoint público `POST /api/stats` con `{listing_id, metric}`. Solo cuenta fichas publicadas y no archivadas, en una sola sentencia (`INSERT … SELECT … WHERE EXISTS`). Responde 204 siempre que el cuerpo sea válido, cuente o no; 400 si la métrica o el id no tienen forma válida. Sin Turnstile. La comprobación de mismo origen que ya protege todos los POST se aplica igual | Un contador no debe costar un captcha. Si la ficha no está publicada no se cuenta nada y no hace falta decirlo |
| I3 | En la web, el aviso se manda con `fetch(…, {method: "POST", keepalive: true})` y se ignora cualquier error. Cada página cuenta una vez por ficha y métrica mientras no se recargue (un `Set` en memoria; nada en `localStorage` ni `sessionStorage`). Volver a la ficha tras recargar cuenta otra vez | Más simple que deduplicar por visitante, y no exige guardar nada en el navegador. Es «aperturas», no «personas»: la pantalla lo dice así |
| I4 | Riesgo aceptado: alguien con un script puede inflar los contadores y gastar escrituras de D1 (100.000 al día en el plan gratuito). Mitigación: la regla de límite de peticiones de Cloudflare WAF que ya está pendiente se amplía a `POST /api/stats`. No se construye un límite propio | Un límite en D1 costaría una escritura por petición, que es justo lo que se quiere ahorrar |
| I5 | Pantalla **Insights** (`#/insights`) con selector de periodo: 7, 30 o 90 días (30 por defecto). El periodo termina hoy (fecha de Jersey) e incluye hoy | Tres periodos cubren «esta semana», «este mes» y «este trimestre» |
| I6 | **Demanda sin cubrir** (no depende del periodo: es la foto de hoy), una tabla para alquiler y otra para compra. Filas: las 12 parroquias más «Anywhere» (aplicantes sin parroquia preferida). Columnas: aplicantes activos que la quieren, de ellos **sin ninguna coincidencia** (ningún match `found` ni `shortlisted` sobre una casa disponible según I8; los matches sobre casas archivadas o retiradas no cuentan), mediana de su presupuesto máximo y casas disponibles en esa parroquia. Un aplicante con varias parroquias cuenta en cada una. Las casas sin parroquia van a una fila «Parish unknown» (solo con el recuento de casas). Las filas con todo a cero no se muestran | «Por parroquia» es el «hecho cuando» de F7. Los matches de F1-A ya dicen si alguien tiene casas o no |
| I7 | Debajo, **Top unmet requests**: los aplicantes activos sin coincidencias, agrupados por operación, parroquia y dormitorios mínimos, ordenados por número de aplicantes (máximo 10 filas), con la mediana de su presupuesto máximo. Como en I6, un aplicante con varias parroquias cuenta en el grupo de cada una (cada fila es cierta por sí sola; las filas no se suman). Sin parroquia: «Anywhere»; sin dormitorios mínimos: «Any bedrooms»; sin presupuesto máximo: no entra en la mediana. Ejemplo: «4 applicants · Rent · St Helier · 2+ bedrooms · median budget £1,900 / month» | Es la frase que el equipo usa para llamar a propietarios |
| I8 | «Activo» es lo mismo que en F1-A (`activeSql`: sin archivar y sin etapa `lost` ni `completed`). «Disponible» es una ficha que cumple `CANDIDATES_SQL` de `server/match-store.js` (se reutiliza esa constante, no se copia), sin archivar, con `operation = 'rent'` para alquiler y `operation = 'sale'` para compra | Las mismas reglas que el matching: la pantalla no contradice la cola de Review |
| I9 | **Fichas más vistas** del periodo: las 10 con más vistas, con aperturas de galería y de tour, visitas creadas en el periodo para esa ficha (de `viewing_requests`, cualquier origen y estado) y enlace a la ficha en el panel. Encima, el total de vistas del periodo. Si aún no hay datos: «Views are counted from <fecha del primer día con datos>» o, sin ninguno, «No views counted yet. The website counts them from the next release.» | La arquitectura pide fichas más vistas; las reservas por ficha ya existen |
| I10 | **Embudo** del periodo, sobre los aplicantes creados en él (sin archivar): Registered → Viewing → Offer → Agreed → Completed, más Lost aparte (los de la cohorte cuya etapa actual es `lost`). «Llegó a una etapa» = su etapa actual o cualquier etapa a la que pasó según sus eventos `applicant.stage_changed`, y una etapa posterior implica las anteriores (quien llegó a Offer cuenta también en Viewing). `new`, `searching` y `paused` no son barras. La revisión de matches no es una barra: es el tiempo (c) de I11. Barras horizontales hechas con CSS | La etapa actual sola escondería a quien llegó a visita y luego se perdió. Una barra de «Reviewed» podría ser menor que la de Viewing (aplicantes por teléfono que pasan directo a visita), y un embudo que sube confunde |
| I11 | **Tiempos del equipo** del periodo, como mediana y con el número de casos: (a) aplicante nuevo de la web → la primera atención del equipo: el primer evento `applicant.stage_changed` o `applicant.updated` de ese aplicante con un actor del equipo (no `public` ni `system`), o su `first_reviewed_at` si es anterior (`applicant.matched` no cuenta: lo genera guardar una ficha); (b) petición de visita de la web → su primer `viewing.confirmed`, `viewing.cancelled` o `viewing.rescheduled`; (c) aplicante nuevo (cualquier origen) → `first_reviewed_at`. Entran los casos que **empezaron** en el periodo; «siguen esperando» son los que empezaron en el periodo y aún no tienen respuesta (no entran en la mediana). Tiempo de reloj (no laboral), en horas si es menos de 48 h y en días si no | Son los tres tiempos de §5.14 que existen hoy. Contar horas laborables exigiría un calendario de festivos que no hay |
| I12 | Todo se calcula al leer, en un solo `GET /admin/insights?days=7|30|90` que lanza un batch de D1 y devuelve solo recuentos y medianas. Las medianas y la agrupación se calculan en JS, en funciones puras con sus pruebas (`server/insights.js`) | Con cientos de aplicantes y miles de eventos sobra; una tabla de resúmenes sería optimizar sin necesidad |
| I13 | `daily_stats` no caduca: no tiene datos personales y crece como mucho fichas publicadas × 3 filas al día | La retención de 12 meses (G2) es para datos personales |

## 3. Datos (migración `0011_daily_stats.sql`)

```sql
CREATE TABLE daily_stats (
  day TEXT NOT NULL,                        -- YYYY-MM-DD, Jersey
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('view','photos','tour')),
  n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (day, listing_id, metric)
) WITHOUT ROWID;
```

La clave primaria `(day, …)` sirve para leer un periodo. Ninguna otra tabla cambia. La 0011 se aplica en remoto después de la 0010 y antes del push, como las anteriores.

## 4. Web pública

- La ficha (`#/p/<id>`) avisa `view` al pintarse; abrir el `dialog` de la galería avisa `photos`; abrir el tour (pestaña «3D tour» o botón «Open the 3D tour») avisa `tour`.
- Un solo ayudante en `site/index.html` (`track(id, metric)`) con el `Set` de I3.
- Ningún cambio visible en la web.

## 5. Panel

- Enlace **Insights** en la navegación, después de Viewings. La barra ya oculta el email por debajo de 1440 px; con un enlace más debe seguir cabiendo en una línea a 1280 px, y en móvil se comporta como los demás enlaces.
- Pantalla en este orden: selector de periodo; cuatro cifras arriba (Listing views, Viewing requests, New applicants, Viewings completed, todas del periodo); Unmet demand (Rent, Buy) con Top unmet requests; Most viewed listings; Funnel; Team response times.
- Cada bloque lleva una línea pequeña que dice de dónde sale («Active applicants with no found or shortlisted match»).
- Textos en inglés (D19). Importes como en el resto del panel (GBP, «/ month» en alquiler).
- Estado vacío por bloque, nunca un bloque en blanco. Error de carga: el mensaje del servidor y un botón Retry.

## 6. Pruebas

- Servidor (`node:test`):
  - `POST /api/stats` cuenta en ficha publicada; no cuenta en borrador ni archivada y responde 204; 400 con métrica o id inválidos; 403 sin mismo origen; dos avisos el mismo día suman 2 en una fila.
  - `GET /admin/insights` exige sesión; con datos sembrados devuelve las cifras exactas de demanda, Top unmet requests, embudo (incluido quien llegó a Offer y luego se perdió) y tiempos (incluidos los que siguen esperando); `days` distinto de 7, 30 o 90 da 400.
  - Funciones puras de `server/insights.js` (mediana con par e impar y lista vacía, agrupación, etapa alcanzada).
- Web: la prueba de punta a punta abre una ficha y comprueba que la vista aparece en Insights.
- Navegador: Insights a 1280×800 y 390×844, sin desbordes, con estados vacíos y con datos.

## 7. Lo que queda al constructor

Nombres internos, la forma exacta del JSON de `/admin/insights`, el estilo de las barras dentro del lenguaje visual del panel y cómo se escribe cada consulta, siempre que cumpla las reglas de §2 y no lea más filas de las necesarias.
