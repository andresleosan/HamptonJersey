# Instalar el lector del mercado de Hermes (BUS-09)

**Qué se consigue:** cada noche a las 02:00 de Jersey, Hermes abre las webs permitidas de las agencias, copia los anuncios y se los da al **custodio del mercado** (`hampton-mercado`). El custodio comprueba cada anuncio contra la web, sin IA, y se los pasa a la app de 10 en 10. Solo el custodio tiene la llave de la puerta del mercado.

**Cuántos pasos:** 35, en seis partes. Cada paso dice quién lo hace:
- 🤖 **Claude** en una sesión del VPS, después de tu «sí» (editar archivos; no reinicia nada).
- 👤 **Tú, Luis** (llaves, reinicios, Telegram, comprobaciones).
- 🧑‍💻 **El desarrollador**, con un commit (el interruptor del piloto).

**Antes de empezar hace falta:**
1. La puerta del mercado de la app (`/api/hermes/market/*`) ya publicada en producción, todavía apagada (`HERMES_MARKET_READY = "0"`).
2. Este cambio ya en `main` y en la copia `/root/HamptonJersey/.worktrees/avanzar`.
3. Wrangler con sesión abierta en el VPS (la misma que usas para D1).

Cómo queda montado:

```
Hermes (contenedor hermes) ── abre las webs ──▶ hermes-squid ──▶ webs de agencias permitidas
   │ su terminal corre en hermes-taller
   └─ curl con la llave CUSTODIO ─▶ hampton-mercado 172.16.47.20:8789 (red hampton_mercado_hermes)
                                      │ comprueba contra la web y entrega de 10 en 10
                                      └─▶ hampton-squid (172.16.46.2) ─▶ la app y las webs de agencias
```

---

## Parte A. Preparar los archivos (🤖 Claude, con tu «sí»)

Nada de esta parte reinicia ni corta ningún servicio.

### Paso 1. Copiar el custodio

📍 Terminal del VPS · usuario root · cualquier directorio

Crea la carpeta del custodio con su carpeta de estado (la cola que sobrevive a reinicios):

```bash
mkdir -p /root/hampton-hermes/mercado/estado
```

Da la carpeta de estado al usuario del contenedor (10500) y la cierra a los demás:

```bash
chown 10500:10500 /root/hampton-hermes/mercado/estado &&
chmod 700 /root/hampton-hermes/mercado/estado
```

Copia el código del custodio desde el repo:

```bash
cp /root/HamptonJersey/.worktrees/avanzar/hermes/mercado.mjs /root/hampton-hermes/mercado/
```

Deja el código legible para el usuario del contenedor:

```bash
chmod 644 /root/hampton-hermes/mercado/mercado.mjs
```

Salida esperada: ninguna.

### Paso 2. Guardar copias de seguridad

📍 Terminal del VPS · usuario root · cualquier directorio

Guarda los cuatro archivos que se van a cambiar, para la marcha atrás:

```bash
cp /root/hampton-hermes/compose.yaml /root/hampton-hermes/plan/compose.yaml.ANTES-MERCADO &&
cp /root/hampton-hermes/squid/squid.conf /root/hampton-hermes/plan/squid.conf.ANTES-MERCADO &&
cp /root/hermes/compose.yaml /root/hermes/compose.yaml.ANTES-MERCADO &&
cp /root/hermes/squid/allowlist.txt /root/hermes/squid/allowlist.txt.ANTES-MERCADO
```

Salida esperada: ninguna.

### Paso 3. Sacar la lista de dominios de las agencias

📍 Terminal del VPS · usuario root · directorio `/root/HamptonJersey/.worktrees/avanzar`

Entra en la copia del repo:

```bash
cd /root/HamptonJersey/.worktrees/avanzar
```

Guarda la consulta en una variable (los canales automáticos permitidos):

```bash
Q="SELECT allowed_hosts FROM market_sources WHERE access_status='allowed' AND method='http'"
```

Guarda dónde va la respuesta:

```bash
OUT=/root/hampton-hermes/mercado/hosts.json
```

Lee de producción (solo lectura) los dominios permitidos:

```bash
npx wrangler d1 execute hampton --remote --json --command "$Q" > "$OUT"
```

Guarda dónde va la lista para squid:

```bash
D=/root/hampton-hermes/squid/mercado-dominios.txt
```

Convierte la respuesta en líneas de squid (`.dominio`, cubre el dominio y `www.`), sin repetidos:

```bash
node scripts/market-hermes-allowlist.mjs < "$OUT" > "$D"
```

Muestra la lista:

```bash
cat /root/hampton-hermes/squid/mercado-dominios.txt
```

Salida esperada: una línea por agencia, cada una empieza por punto, por ejemplo «.gaudin.co». Si sale un error «7403», cierra y abre la sesión de wrangler (`npx wrangler logout`, luego `npx wrangler login --device`) y repite. Si sale «Not a public host», para y avisa: hay un dominio raro en el directorio.

### Paso 4. Añadir el custodio al compose de Hampton

📍 Archivo `/root/hampton-hermes/compose.yaml`

En el servicio `squid`, dentro de `volumes:`, añadir:

```yaml
      - ./squid/mercado-dominios.txt:/etc/squid/mercado-dominios.txt:ro
```

En el servicio `squid`, dentro de `networks:`, añadir:

```yaml
      hampton_mercado: { ipv4_address: 172.16.46.2 }
```

Después del servicio `lector`, añadir el servicio nuevo:

```yaml
  # El custodio del mercado (BUS-09): hermes/mercado.mjs del repo. Solo él tiene la llave de la puerta del mercado.
  # Hermes le entrega cada canal desde su taller; él lo comprueba contra la web y lo pasa a la app de 10 en 10.
  # Primera red compartida con el Hermes de /root/hermes (decisión de Luis del 23-nov: Hermes lee el mercado).
  mercado:
    image: node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
    container_name: hampton-mercado
    user: "10500:10500"
    init: true
    read_only: true
    command: ["node", "/app/mercado.mjs"]
    restart: unless-stopped
    depends_on: [squid]
    environment:
      APP_ORIGIN: https://www.hamptonestatesjersey.com
      HERMES_MARKET_KEY_FILE: /run/secrets/hermes_market_key
      CUSTODIO_KEY_FILE: /run/secrets/mercado_custodio_key
      ESTADO_DIR: /estado
      LISTEN_HOST: 172.16.47.20
      LISTEN_PORT: "8789"
      NODE_USE_ENV_PROXY: "1"
      HTTPS_PROXY: http://172.16.46.2:3128
    secrets: [hermes_market_key, mercado_custodio_key] # archivos 0400 de 10500
    volumes:
      - ./mercado/mercado.mjs:/app/mercado.mjs:ro
      - ./mercado/estado:/estado
    networks:
      hampton_mercado: { ipv4_address: 172.16.46.20 } # squid lo reconoce por esta IP
      hampton_mercado_hermes: { ipv4_address: 172.16.47.20 } # solo aquí escucha
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 256m
    cpus: 0.5
    pids_limit: 64
    logging: *registro
```

En `secrets:` (abajo), añadir:

```yaml
  hermes_market_key: { file: ./secretos/hermes_market_key }
  mercado_custodio_key: { file: ./secretos/mercado_custodio_key }
```

En `networks:` (abajo), añadir:

```yaml
  hampton_mercado: # mercado .20 y squid .2
    name: hampton_mercado
    internal: true
    driver_opts: { com.docker.network.bridge.gateway_mode_ipv4: isolated }
    ipam: { config: [{ subnet: 172.16.46.0/24 }] }
  hampton_mercado_hermes: # mercado .20 y el taller de Hermes .30, nadie más
    name: hampton_mercado_hermes
    internal: true
    driver_opts: { com.docker.network.bridge.gateway_mode_ipv4: isolated }
    ipam: { config: [{ subnet: 172.16.47.0/24 }] }
```

### Paso 5. Dejar salir al custodio por squid

📍 Archivo `/root/hampton-hermes/squid/squid.conf`

Debajo de `acl desde_custodio_cola …`, añadir:

```
acl desde_mercado src 172.16.46.20/32
```

Debajo de `acl para_lector …`, añadir (la app y los dominios del paso 3):

```
acl para_mercado dstdomain -n www.hamptonestatesjersey.com
acl para_mercado dstdomain -n "/etc/squid/mercado-dominios.txt"
```

Debajo de `http_access deny desde_custodio_cola !para_custodio`, añadir:

```
http_access deny desde_mercado !para_mercado
```

Cambiar la línea `http_access deny !desde_avisador !desde_custodio !desde_lector !desde_custodio_cola` por:

```
http_access deny !desde_avisador !desde_custodio !desde_lector !desde_custodio_cola !desde_mercado
```

Debajo de `http_access allow desde_custodio_cola para_custodio`, añadir:

```
http_access allow desde_mercado para_mercado
```

### Paso 6. Dejar a Hermes abrir las webs de las agencias

📍 Terminal del VPS · usuario root · cualquier directorio

Añade un comentario con la fecha al final de la lista de Hermes:

```bash
printf '# BUS-09: webs del mercado (%s)\n' "$(date +%F)" >> /root/hermes/squid/allowlist.txt
```

Añade los dominios del paso 3:

```bash
cat /root/hampton-hermes/squid/mercado-dominios.txt >> /root/hermes/squid/allowlist.txt
```

Salida esperada: ninguna. Nota: Hermes 2 (`hermes2-squid`) usa el mismo archivo y cargará estos dominios en su próximo reinicio (paso 22).

### Paso 7. Conectar el taller de Hermes con el custodio

La terminal de Hermes corre en `hermes-taller` (por SSH): desde ahí salen sus `curl`.

📍 Archivo `/root/hermes/compose.yaml`

En el servicio `taller`, cambiar:

```yaml
    networks:
      taller_int:
```

por:

```yaml
    networks:
      taller_int:
      hampton_mercado_hermes: { ipv4_address: 172.16.47.30 }
```

En `networks:` (abajo), añadir:

```yaml
  hampton_mercado_hermes: # del proyecto hampton-hermes: el taller solo llega al custodio del mercado
    external: true
```

### Paso 8. Instalar la skill de Hermes

📍 Terminal del VPS · usuario root · cualquier directorio

Copia la skill a la carpeta que Hermes lee en vivo (solo lectura para él; no hace falta reiniciarlo):

```bash
cp -r /root/HamptonJersey/.worktrees/avanzar/hermes/skills/hampton-mercado /root/hermes/skills/
```

Salida esperada: ninguna. Hermes 2 también la verá, pero no tiene ni la red ni la llave para usarla.

### Paso 9. Comprobar que los dos compose se leen bien

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Comprueba el compose de Hampton sin arrancar nada:

```bash
cd /root/hampton-hermes && docker compose -p hampton-hermes config -q
```

Salida esperada: ninguna. Cualquier texto es un error de sangría: Claude lo corrige antes de seguir.

📍 Terminal del VPS · usuario root · directorio `/root/hermes`

Comprueba el compose de Hermes sin arrancar nada:

```bash
cd /root/hermes && docker compose -p hermes config -q
```

Salida esperada: ninguna, o solo un aviso de que la red `hampton_mercado_hermes` todavía no existe (se crea en el paso 20).

---

## Parte B. Las dos llaves (👤 Luis)

Ninguna llave sale en pantalla.

### Paso 10. Crear la llave de la puerta del mercado

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Entra en la carpeta y crea una llave aleatoria de 64 caracteres, solo legible por root:

```bash
cd /root/hampton-hermes && umask 077 &&
openssl rand -hex 32 > secretos/hermes_market_key
```

Salida esperada: ninguna.

### Paso 11. Crear la llave con la que Hermes llama al custodio

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Crea la segunda llave (distinta de la primera):

```bash
openssl rand -hex 32 > secretos/mercado_custodio_key
```

Salida esperada: ninguna.

### Paso 12. Dar las dos llaves al usuario del custodio

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Las deja en solo lectura para el usuario 10500 (el del contenedor `hampton-mercado`):

```bash
chown 10500:10500 secretos/hermes_market_key secretos/mercado_custodio_key &&
chmod 400 secretos/hermes_market_key secretos/mercado_custodio_key
```

Salida esperada: ninguna.

### Paso 13. Guardar dónde va la llave del taller

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Guarda en una variable la ruta (el taller la ve como `/etc/taller/mercado.cabecera`):

```bash
S=/root/hermes/taller/secretos/mercado.cabecera
```

Salida esperada: ninguna.

### Paso 14. Escribir la llave del custodio como cabecera para el taller

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes` (la misma terminal del paso 13)

Escribe la cabecera que usará `curl` en el taller:

```bash
printf 'Authorization: Bearer %s\n' "$(cat secretos/mercado_custodio_key)" > "$S"
```

Salida esperada: ninguna.

### Paso 15. Permisos de la cabecera

📍 Terminal del VPS · usuario root · la misma terminal

Deja que solo root y el usuario del taller (10001) la lean:

```bash
chown root:10001 "$S" && chmod 640 "$S"
```

Salida esperada: ninguna. Nota: esa carpeta también la monta el taller de Hermes 2.

### Paso 16. Guardar dónde está la llave de la puerta

📍 Terminal del VPS · usuario root · directorio `/root/HamptonJersey/.worktrees/avanzar`

Entra en la copia del repo y guarda la ruta de la llave en una variable:

```bash
cd /root/HamptonJersey/.worktrees/avanzar &&
K=/root/hampton-hermes/secretos/hermes_market_key
```

Salida esperada: ninguna.

### Paso 17. Poner la llave de la puerta en Cloudflare

📍 Terminal del VPS · usuario root · la misma terminal del paso 16

Guarda la llave como secreto de producción de la web, leyéndola del archivo:

```bash
npx wrangler pages secret put HERMES_MARKET_KEY --project-name hamptonjersey < "$K"
```

Salida esperada: «✨ Success! Uploaded secret HERMES_MARKET_KEY». Si te pide escribir el valor, pulsa Ctrl+C y avisa a Claude: no lo escribas a mano. El reloj `hampton-jobs` no necesita esta llave. Cloudflare la usa a partir del siguiente despliegue de la web.

---

## Parte C. Arrancar (👤 Luis)

### Paso 18. Recrear el squid de Hampton

⚠️ Recrea `hampton-squid`: durante unos segundos el avisador, los custodios y el lector no salen a internet. No borra nada.

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Recrea squid con la red y la lista nuevas (`--no-deps`: no toca a los demás):

```bash
cd /root/hampton-hermes &&
docker compose -p hampton-hermes up -d --no-deps squid
```

Salida esperada: «Container hampton-squid Started».

### Paso 19. Comprobar que squid no se queja

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Cuenta los errores de los dos últimos minutos:

```bash
docker logs hampton-squid --since 2m 2>&1 | grep -ciE 'fatal|error'
```

Salida esperada: «0». Si sale otro número, haz la marcha atrás del punto 6.

### Paso 20. Arrancar el custodio

📍 Terminal del VPS · usuario root · directorio `/root/hampton-hermes`

Arranca el contenedor nuevo:

```bash
docker compose -p hampton-hermes up -d --no-deps mercado
```

Salida esperada: «Container hampton-mercado Started».

### Paso 21. Mirar el registro del custodio

📍 Terminal del VPS · usuario root · cualquier directorio

```bash
docker logs hampton-mercado --since 2m
```

Salida esperada: «Market custodian on 172.16.47.20:8789». Si dice «Set APP_ORIGIN, …», falta una llave o tiene otro dueño: repite los pasos 10 a 12.

### Paso 22. Reiniciar el squid de Hermes

⚠️ Reinicia `hermes-squid`: Hermes pierde la salida a internet unos segundos (un mensaje de Telegram en curso puede tardar).

📍 Terminal del VPS · usuario root · directorio `/root/hermes`

Reinicia solo el squid de Hermes para que lea la lista nueva:

```bash
cd /root/hermes && docker compose -p hermes restart squid
```

Salida esperada: «Container hermes-squid Started». Hermes 2 (`hermes2-squid`) usa el mismo archivo: no se reinicia ahora, pero cargará estos dominios en su próximo reinicio o al reiniciar el VPS.

### Paso 23. Comprobar que el squid de Hermes no se queja

📍 Terminal del VPS · usuario root · cualquier directorio

```bash
docker logs hermes-squid --since 2m 2>&1 | grep -ciE 'fatal|error'
```

Salida esperada: «0». Si sale otro número, haz la marcha atrás del punto 3.

### Paso 24. Conectar el taller a la red del custodio

⚠️ Recrea `hermes-taller`: si en ese momento Hermes tiene un encargo de Claude o Codex en marcha, se corta. Hazlo cuando no haya ninguno. Sus proyectos y sesiones están en un volumen y no se pierden.

📍 Terminal del VPS · usuario root · directorio `/root/hermes`

Recrea solo el taller con la red nueva:

```bash
docker compose -p hermes up -d --no-deps taller
```

Salida esperada: «Container hermes-taller Started».

### Paso 25. Crear la carpeta de trabajo de Hermes en el taller

📍 Terminal del VPS · usuario root · cualquier directorio

Crea, como usuario del taller, la carpeta donde Hermes guarda sus entregas:

```bash
docker exec -u taller hermes-taller mkdir -p /home/taller/proyectos/mercado
```

Salida esperada: ninguna.

---

## Parte D. Prueba en seco, con la puerta apagada (👤 Luis)

### Paso 26. Guardar las dos rutas de la prueba

📍 Terminal del VPS · usuario root · cualquier directorio

Guarda la dirección del custodio y la cabecera del taller en variables:

```bash
U=http://172.16.47.20:8789/mercado/trabajo && C=/etc/taller/mercado.cabecera
```

Salida esperada: ninguna.

### Paso 27. Sin llave, el custodio no abre

📍 Terminal del VPS · usuario root · la misma terminal del paso 26

Llama al custodio desde el taller, sin la llave:

```bash
docker exec -u taller hermes-taller curl -s --noproxy '*' "$U"
```

Salida esperada: «{"error":"Unauthorized"}». Si sale «Failed to connect» o nada, el taller no está en la red: repasa los pasos 7 y 24.

### Paso 28. Con la llave, el custodio llega a la app

📍 Terminal del VPS · usuario root · la misma terminal del paso 26

Llama igual que lo hará Hermes:

```bash
docker exec -u taller hermes-taller curl -s --noproxy '*' -H @"$C" "$U"
```

Salida esperada: «{"error":"Hampton App answered 404 to market/work"}». Es lo correcto: la puerta está apagada. Con la puerta apagada la app contesta 404 antes de mirar la llave, así que esta prueba todavía no confirma la llave de Cloudflare: eso lo hace el paso 32. Si dice «Hampton App did not answer», revisa los pasos 5 y 18.

### Paso 29. Hermes abre una web de agencia

📍 Telegram · tu chat con Hermes

Escríbele:

```
Abre https://<UNA WEB DE LA LISTA> con tus herramientas de web y dime solo el título de la página.
```

Cambia `<UNA WEB DE LA LISTA>` por un dominio del paso 3 sin el punto inicial, por ejemplo `www.gaudin.co`.

Salida esperada: el título de la web. Si dice que no puede abrirla, Hermes usa un servicio de lectura de webs que no está en su lista: copia su respuesta a Claude.

---

## Parte E. La tarea programada (👤 Luis)

### Paso 30. Crear la tarea de las 02:00

📍 Telegram · tu chat con Hermes

Escríbele:

```
Crea una tarea programada llamada hampton-mercado: todos los días a las 02:00 hora de Jersey (Europe/Jersey). Debe cargar la skill hampton-mercado y seguirla al pie de la letra. Dime la próxima ejecución en hora de Jersey.
```

Salida esperada: Hermes confirma la tarea y da la próxima ejecución a las 02:00 de Jersey. Si te la da en otra hora (por ejemplo UTC), pídele que la ajuste para que caiga a las 02:00 de Jersey. Con la puerta apagada, esa ejecución solo dirá el error 404 y parará: es lo esperado.

---

## Parte F. El piloto: tres agencias (🧑‍💻 desarrollador, luego 👤 Luis)

### Paso 31. Encender el piloto (🧑‍💻 por commit)

El desarrollador cambia en `wrangler.toml` **y** en `jobs/wrangler.toml`, los dos a la vez:

```toml
HERMES_MARKET_READY = "1"
HERMES_MARKET_SOURCES = "src-gaudin-co,src-keys-properties,src-finders-keepers"
```

y lo publica con un commit en `main`. Cloudflare despliega la web y el reloj. Desde ese momento Hermes sustituye a los lectores de código de esas tres agencias.

### Paso 32. Ver que hay trabajo (👤, después de la 01:00 de Jersey)

📍 Terminal del VPS · usuario root · cualquier directorio

Guarda las variables otra vez (cada terminal nueva las pierde):

```bash
U=http://172.16.47.20:8789/mercado/trabajo && C=/etc/taller/mercado.cabecera
```

Repite la llamada del paso 28:

```bash
docker exec -u taller hermes-taller curl -s --noproxy '*' -H @"$C" "$U"
```

Salida esperada: un JSON que empieza por «{"day":"» con canales de `src-gaudin-co`, `src-keys-properties` y `src-finders-keepers` en `items`. Antes de la 01:00 sale «"items":[]». Si dice «Hampton App answered 401 to market/work», la llave de Cloudflare no coincide con la del custodio o la web no se ha desplegado desde el paso 17: avisa a Claude antes de las 02:00.

### Paso 33. Ver la entrega de la noche (👤, por la mañana)

📍 Terminal del VPS · usuario root · cualquier directorio

Mira lo que hizo el custodio en las últimas 12 horas (solo cuentas y motivos, nunca anuncios):

```bash
docker logs hampton-mercado --since 12h 2>&1 | tail -40
```

Salida esperada: líneas como «mercado: src-gaudin-co/<canal> delivered 24, queued 24, rejected 0 {}» y después «mercado: src-gaudin-co/<canal> done, 24 adverts». Una línea «reported as invalid_response» significa que más de la mitad de lo que copió Hermes no estaba en la web: avisa a Claude.

### Paso 34. Ver la cola vacía

📍 Terminal del VPS · usuario root · cualquier directorio

Cuenta lo que queda por entregar:

```bash
ls /root/hampton-hermes/mercado/estado | grep -c json
```

Salida esperada: «0» cuando ya se entregó todo (a 10 anuncios por minuto, una agencia de 60 casas tarda unos 6 minutos).

### Paso 35. Comprobar en la app

En el panel, donde ves la pasada diaria del mercado y sus fuentes: las tres agencias aparecen leídas enteras esta noche, y las casas que ya existían conservan su ficha. Si no sabes dónde mirarlo, pídeselo a Claude: lo comprueba en la base de datos.

---

## Verificación final

📍 Terminal del VPS · usuario root · cualquier directorio

```bash
docker ps --filter name=hampton-mercado --format '{{.Names}} {{.Status}}'
```

Salida esperada: «hampton-mercado Up …». Junto con el paso 33 (líneas «done») y el paso 35 (agencias leídas), el lector del mercado de Hermes está funcionando.

---

## Marcha atrás

Úsala solo si algo va mal. Cada punto es independiente; hazlos en este orden si quieres quitarlo todo.

1. **Apagar el piloto** (🧑‍💻 por commit): `HERMES_MARKET_READY = "0"` en `wrangler.toml` y `jobs/wrangler.toml`. Los lectores de código vuelven a leer sus agencias.
2. **Quitar la tarea** (👤 Telegram): «Borra la tarea programada hampton-mercado».
3. **Lista de Hermes** (👤, ⚠️ reinicia `hermes-squid`):
   ```bash
   cp /root/hermes/squid/allowlist.txt.ANTES-MERCADO /root/hermes/squid/allowlist.txt
   ```
   ```bash
   cd /root/hermes && docker compose -p hermes restart squid
   ```
4. **Parar el custodio** (👤):
   ```bash
   cd /root/hampton-hermes && docker compose -p hampton-hermes stop mercado
   ```
5. **Taller sin la red** (👤, ⚠️ recrea `hermes-taller`):
   ```bash
   cp /root/hermes/compose.yaml.ANTES-MERCADO /root/hermes/compose.yaml
   ```
   ```bash
   cd /root/hermes && docker compose -p hermes up -d --no-deps taller
   ```
6. **Compose y squid de Hampton** (👤, ⚠️ recrea `hampton-squid`):
   ```bash
   cd /root/hampton-hermes &&
   docker compose -p hampton-hermes rm -sf mercado
   ```
   ```bash
   cp plan/compose.yaml.ANTES-MERCADO compose.yaml &&
   cp plan/squid.conf.ANTES-MERCADO squid/squid.conf
   ```
   ```bash
   docker compose -p hampton-hermes up -d --no-deps squid
   ```
7. **Llaves** (👤): borra `secretos/hermes_market_key`, `secretos/mercado_custodio_key` y `/root/hermes/taller/secretos/mercado.cabecera`; en Cloudflare, Pages › hamptonjersey › Settings › Variables and Secrets, borra `HERMES_MARKET_KEY`.

## Lo que no se ha podido probar antes de instalar

- El custodio, la skill y el script se probaron contra una app y unas webs falsas en el ordenador (`node --test tests/hermes-mercado.test.mjs`). Con la app real, la primera prueba es el paso 28 (y la llave, el 32).
- Que las herramientas de web de Hermes salgan por `hermes-squid` sin otro servicio: lo dice el paso 29.
- Que la tarea programada de Hermes respete la hora de Jersey: lo dice el paso 30.
- Que `curl -H @archivo` pase las aprobaciones de Hermes en una tarea nocturna: lo dirá la primera noche (paso 33). Si se queda esperando una aprobación, avisa a Claude.
- Que `wrangler pages secret put` lea la llave del archivo (paso 17).
