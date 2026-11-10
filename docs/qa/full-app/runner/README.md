# Paso E · propuesta local, sin ejecutar

Esta carpeta prepara el runner de aislamiento. **No hay permiso todavía para
descargar capas de imágenes, preparar dependencias de ejecución, crear redes o
contenedores ni arrancarlos.** Las consultas Docker fueron de lectura y los
registros públicos solo entregaron manifiestos/configuración, no capas.
El permiso E posterior no incluye F ni pruebas de la aplicación publicada.

## Imágenes propuestas

Ambas referencias se fijan al manifiesto específico `linux/amd64`, cuyos bytes
se contrastaron con SHA-256 en los registros oficiales:

| Uso | Tag informativo | Digest que se utilizará |
| --- | --- | --- |
| Node/Chromium | `mcr.microsoft.com/playwright:v1.65.0-noble` | `sha256:bc4fbb329a25287ed23e9216c97063646abdd1bf2da669a9895fa3e2078b2302` |
| Proxy HTTPS | `mitmproxy/mitmproxy:12.3.1` | `sha256:e2f810b6e618258dd4980716da143c4a8de0edcb3243264baea398e2185bbbfb` |

`images.json` también registra los digests de los índices multiplataforma.
Capas comprimidas declaradas: 1002814156 + 94112997 bytes, aproximadamente
1.10 GB antes de caché; más espacio al descomprimir. No se modifica el plan de
ningún servicio. No se construye una imagen propia.

Playwright-core **1.65.0** se prepara fuera del contenedor a partir del tarball
oficial fijado por SHA-512 en `package-lock.json`; no tiene dependencias runtime.
No se ejecutan npm/hooks ni descargas de browsers. La imagen ya tiene Chromium.
El seccomp es el archivo oficial del tag Playwright v1.65.0, SHA-256
`cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.

## Red exacta

- `hampton-app-qa-internal`: bridge `internal=true`, gateway mode `isolated`,
  IPv6 deshabilitado, `172.30.230.0/28`. Docker no asigna IP al bridge del host.
- Runner `hampton-app-qa-runner`: solo esa red, `172.30.230.3`; DNS upstream
  `127.0.0.1` para impedir reenvío externo. Sin gateway externo ni host mode.
- Proxy `hampton-app-qa-egress`: `172.30.230.2:3128` en la red interna y
  `172.30.231.2` en `hampton-app-qa-outbound`, bridge NAT `172.30.231.0/28`.
- Cero puertos publicados, sockets de control, rutas extra o conexiones a redes
  preexistentes. Nombres y CIDR se verifican libres otra vez antes de crear.
- Proxy permite únicamente HTTPS/443 a `hamptonjersey-qa.pages.dev` y
  `challenges.cloudflare.com`. No wildcard, hostnames de despliegue, proveedor
  Google, registro npm, negocio, LAN, metadata ni destinos arbitrarios.

No es un túnel CONNECT ciego. El proxy inspecciona Host, SNI, HTTPS y redirects;
resuelve solo nombres permitidos, rechaza cualquier IPv4 no global y fija la IP
conectada. Conserva SNI para verificar el certificado upstream. Usa estrategia
lazy y upstream_cert=false para validar antes del contacto. Deniega TCP opaco.
En E no existen cabeceras Access ni cookies de sesión; también elimina identidad
de cualquier petición Turnstile.

## Montajes exactos en este PC

| Origen bajo `E:/Proyectos/HamptonJersey/test-results/qa-agent-runtime/` | Destino | Acceso |
| --- | --- | --- |
| `runner-package` | runner `/work` | Solo lectura |
| `egress-package` | proxy `/policy` | Solo lectura |
| `results` | runner `/results` | Escritura, solo estados saneados |

El stager copia exactamente `idle.mjs`, `isolation.mjs`, package/lock y el SDK
verificado para el runner; solo `policy.py`, `egress_addon.py` y el diagnóstico
sin red `proxy_selftest.py` para el proxy.
No monta checkout completo, `.git`, perfiles Windows, credenciales, `.codex`,
`.wrangler`, `.ssh`, socket Docker ni carpeta privada HamptonQA. No crea rutas
de bind implícitamente. Si la carpeta runtime ya existe, se detiene sin borrar.

Cada contenedor tiene raíz read-only, tmpfs `/tmp` (256 MiB, nosuid/nodev/noexec)
y `/run/qa` (32 MiB, 0700 UID/GID 1000, nosuid/nodev/noexec). Runner: IPC privado
y `/dev/shm` privado de 512 MiB; no IPC host. No volúmenes persistentes para
secretos. En E el proxy genera su CA/clave de inspección únicamente en tmpfs,
con umask 077; no se instala CA en Windows ni se exporta su clave. El volumen
`/home/mitmproxy/.mitmproxy` declarado por la imagen también se sustituye por
tmpfs privado de 4 MiB (0700 UID/GID 1000, nosuid/nodev/noexec), evitando un
volumen anónimo persistente. El contexto
Chromium de diagnóstico acepta el certificado de este proxy, mientras el proxy
mantiene verificación TLS upstream. No es una prueba de TLS público end-to-end.

Ambos: UID/GID 1000, cap_drop ALL, no-new-privileges, no privileged y sin restart.
Runner: 2 CPU, 2 GiB sin swap, 256 pids; proxy: 0.5 CPU, 256 MiB sin swap, 64 pids.
Sin logs Docker, dumps HTTP, trazas, HAR, storageState, screenshots ni interfaz
mitmweb. El proxy suprime stdout/stderr; el diagnóstico solo guarda booleanos.

## Orden después del sí E para la propuesta final

1. Comprobar todas las huellas de `runner-proposal.json`, contexto Docker local,
   plataforma, recursos libres y CIDR sin colisiones; no sustituir recursos.
2. Descargar **solo** las dos imágenes por esos digests y comprobar RepoDigests.
   Ejecutar `stage.py --authorized-proposal-sha256 <huella-aprobada>` para el
   paquete permitido; no procesa secretos ni ejecuta paquetes descargados.
3. Crear/iniciar únicamente los dos contenedores y dos redes de `compose.json`,
   sin build y sin pull implícito (`pull_policy=never`). Si queda incierto, leer
   inspect/estado antes de reintentar; no reset, borrado ni recreación implícita.
4. Comparar `docker inspect` efectivo con esta propuesta: UID, capabilities,
   NoNewPrivs, montajes, logging, red, ReadonlyRootfs, seccomp y límites. No
   imprimir Env ni otros contenedores. Rechazar diferencias antes de pruebas.
5. Ejecutar `node /work/isolation.mjs` mediante exec explícito en el runner,
   **sin secretos ni workflows de la aplicación QA**. Deben pasar todas las pruebas
   de FS, gateway/salida directa, host/LAN/metadata, DNS, proxy y Chromium sandbox.
   Además ejecutar `python /policy/proxy_selftest.py` en el proxy: API HTTP real,
   Host/SNI distintos, redirects externos y DNS privado simulado, sin DNS ni
   tráfico real. El diagnóstico Node también comprueba el cambio de Host/SNI a
   través de TLS contra el propio proxy; el resultado esperado es que no se
   envíen esas peticiones al upstream. Una regresión podría dejarlas llegar a
   QA o Turnstile sin identidad: en ese caso la prueba falla y se detiene E.
6. Si un control no pasa, detener la prueba sin introducir identidad. Resolver
   el motivo con lectura y nueva revisión; no bajar controles para lograr verde.
   No declarar aislamiento probado a partir de Compose config o unitarias.

El runner queda inerte entre comandos, sin servidor API, cron, agentes remotos
o permisos de administración. E no carga credenciales QA ni ejecuta workflows.
F preparará un paquete permitido distinto con signSession existente, identidad
QA por stdin/tmpfs, cabeceras Access solo para QA y suites por módulo; necesitará
sus propias huellas y permiso. Nada de este paso publica ni modifica la app.

## Comprobaciones actuales y fuentes

Preparación: pruebas Python offline, sintaxis de Node/Python y `docker compose
--env-file NUL -f docs/qa/full-app/runner/compose.json config --quiet`.
No se ha ejecutado ninguna imagen, prueba de red real de contenedor ni Chromium.
La compatibilidad de mitmproxy, seccomp, tmpfs y Docker Desktop se acredita en E.

- [Playwright Docker](https://playwright.dev/docs/docker).
- [Dockerfile fijado v1.65.0](https://github.com/microsoft/playwright/blob/v1.65.0/utils/docker/Dockerfile.noble).
- [Seccomp fijado v1.65.0](https://github.com/microsoft/playwright/blob/v1.65.0/utils/docker/seccomp_profile.json).
- [Docker gateway isolated](https://docs.docker.com/engine/network/port-publishing/#gateway-modes).
- [Redes Compose](https://docs.docker.com/reference/compose-file/networks/).
- [Mitmproxy hooks](https://docs.mitmproxy.org/stable/api/events.html).
- [Mitmproxy opciones](https://docs.mitmproxy.org/stable/concepts/options/).
