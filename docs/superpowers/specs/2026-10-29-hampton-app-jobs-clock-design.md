# Hampton App · El reloj: Worker `hampton-jobs` con cron cada 10 minutos (AUT-07)

Fecha: 2026-10-29 · Estado: aprobado por Luis en el chat (29-oct: descripción aprobada; «Conectarlo a GitHub» para actualizarlo; «Nada por ahora» en /admin) · Base: `main` en producción (`d19b8b2`)
Parte de la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md`): §2 «Un solo reloj», P-08 y §8 («Un motor de flujos para esperas y recordatorios → Un cron cada 10 minutos y consultas de lo vencido»). Donde este documento no dice nada, manda el spec del borrado a los 12 meses (`2026-10-25-hampton-app-retention-design.md`, reglas E6 y E7).

## 1. Intención

Hoy lo que tiene que pasar a su hora solo pasa cuando alguien abre el panel: el borrado de 12 meses (G2) lo reclama el primer sondeo de cada día de Jersey (E6). Si nadie abre el panel (un fin de semana, unas vacaciones), no corre. Y las automatizaciones periódicas que vienen (fichas sin cambios en 3 meses a «To confirm», búsquedas en pausa a los 30 días, recordatorios de visitas, seguimientos a agencias, la pasada diaria de Places.je) necesitan un reloj que no dependa de que alguien tenga el panel abierto. AUT-07 pone ese reloj y le da su primer trabajo: el borrado diario.

**Éxito (verificable):**
- Un Worker `hampton-jobs`, en la misma cuenta de Cloudflare que la web, se ejecuta cada 10 minutos (cron `*/10 * * * *`, hora UTC) sin que nadie abra el panel.
- Cada vuelta deja su hora en `app_settings` (clave `clock`, valor `{"at": "<hora ISO de la vuelta>"}`). En producción esa hora nunca tiene más de unos 10 minutos.
- La primera vuelta de cada día de Jersey (la de las 00:00) reclama y hace el borrado de 12 meses: la misma pasada de G2, con el mismo tope de 500 por pasada y los mismos 3 intentos al día. Su resultado queda en `retention_run` con la forma de hoy.
- Si la pasada falla, la reintenta la vuelta siguiente o un sondeo del panel, hasta 3 intentos ese día, como hoy.
- El panel sigue igual: sus sondeos siguen reclamando el día si el reloj no lo hizo (respaldo). El reclamo es una sola sentencia atómica, como hoy: un segundo reclamo solo gana mientras la pasada en curso no ha anotado su resultado (milisegundos) o después de un fallo, y una segunda pasada solo borra lo que ya tocaba borrar (sin cerrojo, decidido el 27-oct).
- El Worker no tiene dirección en internet (ni `workers.dev` ni URL de versión o de vista previa) ni manejador HTTP: solo `scheduled`.
- Cada push a `main` despliega también el Worker (Workers Builds conectado al repo), con el mismo commit que la web.

**No-objetivos:** nada visible en `/admin` (Luis, «Nada por ahora»: la pantalla Automations, AUT-01, enseñará la última vuelta y los fallos); trabajos nuevos (ADM-04, AGE-13, recordatorios: cada uno con su tarea); mover los cobros mensuales de alquiler (K9); un registro de ejecuciones o avisar a Luis al tercer fallo (§6.1 de la arquitectura; llega con AUT-01 o con el correo); colas y Email Workers.

**Anti-objetivos:**
- Que el borrado borre algo distinto de lo que borra hoy, o que el reloj lo lance más de una vez al día.
- Una puerta nueva a internet: el reloj no acepta peticiones de nadie.
- Que el reloj y la web lleven versiones distintas del código más allá de lo que tarda un despliegue.
- Datos personales en los registros del Worker: solo cuántos borró y los errores.
- Que el borrado deje de correr si el reloj se para.

## 2. Decisiones

| # | Decisión | Quién y dónde |
|---|---|---|
| K1 | **Un Worker aparte**, `hampton-jobs`, que comparte la D1 `hampton` con la web (binding `DB`). Pages no tiene cron; un Worker sí | Arquitectura P-08 y §2; Luis aprobó la descripción (29-oct) |
| K2 | **Cada 10 minutos** (`*/10 * * * *`; Cloudflare usa UTC). Cada vuelta hace lo que vence a esa hora: hoy, solo el borrado diario | Arquitectura §2 |
| K3 | **El código del reloj vive con el de la web** (`server/`), así que usa las mismas reglas (`server/retention.js`) y las mismas pruebas. Su configuración va en una carpeta propia, `jobs/wrangler.toml` (`name = "hampton-jobs"`, `main = "../server/jobs.js"`), que Pages no lee. Se despliega con Workers Builds conectado al repo, con carpeta raíz `jobs`, comando de compilación `cd .. && npm ci --ignore-scripts`, comando de despliegue `../node_modules/.bin/wrangler deploy` y la variable de compilación `SKIP_DEPENDENCY_INSTALL=1`. Esa compilación tiene la clave con la que Cloudflare publica en la cuenta, así que instala solo lo que fija el `package-lock.json` del repo (las mismas versiones que la web) y sin ejecutar scripts de instalación: nada se descarga sin fijar (revisión del 29-oct; la primera versión usaba `npx wrangler@4.148.0 deploy`, que bajaba las dependencias de wrangler sin fijar). Cada push a `main` lo despliega; las compilaciones de otras ramas quedan apagadas. **Por qué una carpeta propia**: Workers Builds compara el nombre del Worker con el `name` del archivo de Wrangler de su carpeta raíz y, si no coinciden, abre solo un pull request para «arreglarlo». En la raíz del repo ese archivo es el de la web (`name = "hamptonjersey"`): el pull request crearía otra rama en el repo público, Pages la publicaría como vista previa contra la base de datos de producción, y aceptarlo rompería la web. En `jobs/` el nombre coincide y no pasa nada de eso | Luis, «Conectarlo a GitHub» (29-oct); la carpeta y el comando, Claude, tras la revisión del spec |
| K4 | **Sin puerta a internet**: `workers_dev = false`, `preview_urls = false` y sin manejador `fetch`. Descartado: un Worker mínimo que despierte a la web por HTTP con un secreto compartido. No necesitaría GitHub, pero abriría una ruta pública protegida solo por el secreto | Claude: mínimo privilegio |
| K5 | **El borrado, a las 00:00 de Jersey**: la primera vuelta del día de Jersey lo reclama con el mismo `claimRetentionDay` (3 intentos al día) y lo hace con `runRetention` (tope de 500). `retention_run` no cambia de forma. La cadena «reclamar, borrar, anotar el resultado» queda en un solo sitio, que usan el reloj y el panel | Claude; reglas E6 y E7 de G2 |
| K6 | **El panel queda de respaldo**: sus sondeos siguen reclamando el día. Gana uno y el otro no hace nada | Claude, aprobado con la descripción («Si el reloj fallara, el panel lo sigue haciendo al abrirse») |
| K7 | **Latido**: cada vuelta escribe `app_settings.clock = {"at": <hora programada de la vuelta, ISO>}` con `updated_at` = hora real. Es la prueba de que el reloj corre y lo que leerá AUT-01. Son 144 escrituras al día; el plan gratuito de D1 permite 100.000 | Claude |
| K8 | **Registros**: Workers Logs activado (`[observability] enabled = true`). El Worker solo escribe cuántos contactos y visitas borró y los errores; nunca nombres, emails ni teléfonos | Claude; anti-objetivo de privacidad |
| K9 | **Los cobros mensuales de alquiler se quedan donde están**: los crea cada pantalla que los enseña y el contador de Rentals (P19), así que moverlos no cambia nada visible. Pasarán al reloj con los avisos automáticos de atrasos (F5-B) | Claude |
| K10 | **Puesta en marcha sin migración**. Antes del push, Luis publica el Worker una vez desde su terminal (`npx wrangler deploy -c jobs/wrangler.toml` en la raíz del repo: crea `hampton-jobs` con su cron), comprueba el latido y lo conecta a GitHub en el panel de Cloudflare (K3). Después, el push despliega la web y, por primera vez desde GitHub, el Worker. Así el commit no afirma nada que no se haya comprobado, salvo esa primera compilación desde GitHub, que se mira justo después del push | Claude; Luis lo ejecuta (los comandos remotos de Claude están bloqueados) |
| K11 | **Límites del plan gratuito** (docs de Cloudflare, 29-oct): 5 cron por cuenta (este usa 1); 10 ms de CPU por vuelta (el trabajo es SQL en D1, y esperar a D1 no cuenta como CPU); un `batch` de D1 cuenta como una sola consulta. Si la cuenta ya tuviera 5 cron, el despliegue lo dice y se decide entonces | Claude |

## 3. Lo que decide quien construye

- Los nombres de funciones y la forma de compartir la cadena de K5, siempre que haya un solo sitio con ella.
- Qué hora usa la vuelta para el borrado (la programada o la real), siempre que el día de Jersey reclamado sea el de la vuelta.
- Cómo se prueba el Worker en local: `wrangler dev` con `--test-scheduled` contra la misma D1 local que el e2e.
- Una prueba barata que avise si la configuración del Worker se separa de la de la web (otra base de datos, otra frecuencia, una URL pública).
