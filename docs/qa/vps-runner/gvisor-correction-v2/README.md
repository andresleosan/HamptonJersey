# Corrección mínima V2 del piloto offline gVisor

Preparada el 10-nov-2026; no instalada ni ejecutada. La petición actual autoriza
investigar y preparar, y prohíbe repetir el piloto por ahora. El intento anterior
y sus paquetes sellados permanecen intactos.

## Hallazgos y certeza

1. **Defecto de protocolo reproducido localmente.** awaitGate usaba for-await y
   break sobre stdin. El iterador normal de un Readable de Node destruye el
   stream al salir anticipadamente. Con PassThrough real, el código anterior
   acepta GO pero deja destroyed=true/readable=false. V2 usa
   stream.iterator({destroyOnReturn:false}); la regresión pasa manteniendo
   stdin abierto y sin esperar EOF. Las pruebas anteriores usaban un generador
   simulado y no detectaban esa diferencia con un Readable real.
2. **Pérdida de causa confirmada en el supervisor.** Cualquier excepción antes
   de escribir result.json acababa en exit2, sin fase ni etiqueta. stderr se
   descartaba. V2 registra checkpoints root0600 antes de cada fase, conserva un
   resultado fallido tras una excepción y guarda únicamente causas enumeradas,
   clases de stderr y contadores. Nunca persiste mensajes, bytes stderr/stdout
   crudos, trazas, capturas o credenciales. Captura transitoria solo en memoria.
3. **Cuota de CPU del runtime incompleta.** El código de la release fijada usa
   por defecto creación sin cuota y una política ampliada durante ciclo de vida.
   V2 fija sandbox-creation-cpu-policy=1x y sandbox-lifecycle-cpu-policy=1x en el
   lanzador privado y rechaza overrides. La cuota de la aplicación sigue2CPU.
   La preparación del runtime anterior a crear su cgroup no queda acreditada
   por este ajuste; no se promete consumo físico cero o límite absoluto antes
   de existir el cgroup. La unidad del supervisor tiene su propia cuota.
4. **Filtro OCI no activado explícitamente.** La release usa oci-seccomp=false
   por defecto: solicitar E1 en HostConfig no acredita que se aplique dentro
   del kernel de aplicación gVisor. V2 fija oci-seccomp=true, rechaza overrides
   y exige Seccomp2 en el proceso Node antes de Chromium. Se mantiene además el
   filtro propio del Sentry en el host y se comprueba por separado el sandbox
   interno de Chromium. Si E1 no es compatible, falla sin relajar el filtro.

Estos son defectos/configuraciones verificables. El intento remoto duró unos
5,47s, terminó con exit1 y no fue OOM. Sin sus checkpoints/stderr anteriores no
puede demostrarse que la destrucción de stdin causara aquel exit1, ni descartarse
otro fallo previo de Node, gVisor, permisos o límites. El fallo histórico exacto
sigue sin atribución concluyente. No se afirma que V2 ya funcione en la VPS.

La raíz de estado del shim de esta release es /run/containerd/runsc, no la ruta
genérica /run/runsc. Se comprobó en lectura la ruta real: no quedaban entradas
del ID anterior. Es una limitación de la inspección anterior, no un cambio que
haya que aplicar al runtime.

## Cambio propuesto y destinos

Host: optimyze-vps-de-prod.tail29c816.ts.net.

- Código nuevo: /opt/hampton-qa-gvisor-v2, raíz pública root0755 y archivos0644.
- Lanzador privado V2: /opt/hampton-qa-gvisor-v2/bin/runsc, root0755 sin setuid/caps.
- Estado y checkpoints nuevos: /var/lib/hampton-qa-gvisor-v2, root0700/0600.
- Reponer temporalmente el único shim /usr/local/bin/containerd-shim-runsc-v1,
  ahora ausente, con el lanzador sellado V2. Su PATH solo afecta a sus hijos.
- Reutilizar en SOLO LECTURA los8 archivos oficiales ya verificados bajo
  /opt/hampton-qa-gvisor-probe/release-20261102.0/dist. No otra release, imagen,
  paquete de sistema, daemon o modificación de binarios existentes.
- Nuevo contenedor hampton-app-qa-chromium-probe-v2; no arrancar ni modificar el
  contenedor del intento anterior. Imagen Playwright fijada ya en caché.
- Runtime opcional io.containerd.runsc.v1, systrap; red none, cero puertos, UID1000,
  cap-dropALL, no-new-privileges, seccomp E1, raíz RO, logging none, sin restart,
  core0. Mismos2CPU/2GiB sin swap adicional/256PIDs/shm512MiB.
- Mismos dos montajes RO: paquete público existente a /work y probe V2 a
  /probe.mjs. Sin identidad, talleres, perfiles, sockets o datos empresariales.
- Unidad TRANSITORIA nueva hampton-qa-chromium-probe-v2.service: Type=exec,
  RuntimeMaxSec180, TimeoutStopSec45, KillMode=control-group, UMask0077,
  LimitCORE0, CPUQuota200%, MemoryMax128M, TasksMax32, stdout/stderrnull.
  ExecStart supervisor.py run y ExecStopPost supervisor.py stop con ID/SHA fijos.

Se mantienen kernel userns0, AppArmor restriction1 y runtime default runc.
No se recarga/reinicia Docker, containerd, SSH, AppArmor o servicios actuales.
El shim opcional añade software invocable en el host y la prueba comparte CPU/RAM;
preservar configuración y estado de producción no equivale a riesgo/impacto cero.

## Un único intento futuro, solo tras sí específico para el nuevo manifiesto

1. Verificar manifiesto/tar y cada archivo. SSH con hostkey exigida y sin
   forwarding, staging público root0700 y extracción cerrada sin links. Rechazar
   cualquier destino nuevo ocupado. Revalidar los8 binarios retenidos por hash,
   propietario/modo, seccomp E1 y paquete público RO. No buscar identidades.
2. Inventariar estado previo de contenedores y servicios sin env/logs privados.
   Exigir políticas0/1, default runc y ausencia de launcher/unidad/directorios V2.
   El viejo probe runsc debe seguir parado con su ID/label conocido; ningún
   otro consumidor nuevo/activo del runtime se acepta para instalar o retirar.
3. Instalar únicamente archivos nuevos V2 y el lanzador temporal. Crear el nuevo
   contenedor con container-create.json y label del SHA autorizado, sin arrancar.
   Verificar ID completo, imagen, runtime, red, puertos, montajes, límites, UID,
   seccomp, capacidades y restricciones efectivas antes de la unidad.
4. Arrancar solo por la unidad transitoria. El probe sigue esperando GO; el
   supervisor valida PID/exe gVisor y cgroup host exclusivo del ID nuevo, CPU2,
   memoria2GiB, swap0 y pids256. Revalida PID antes de GO; un fallo no lo libera.
   Cada fase queda registrada antes de entrar. El navegador mantiene sandbox
   activo y debe acreditar namespaces, seccomp-BPF/TSYNC, renderer y worker.
5. Ante fallo, conservar fase y causa cerradas; stderr solo se clasifica en
   memoria. Resultado ausente o parada incierta no cuentan como verde. Nunca
   repetir, relajar checks o cambiar políticas para continuar.
6. Parar/verificar solo el ID nuevo; ExecStopPost cubre interrupción. Conservar
   contenedor detenido, checkpoints, informe y código público para inspección.
   Retirar únicamente el launcher nuevo por hash/propiedad tras confirmar que
   no hay otros consumidores salvo los probes conocidos detenidos. Liberar solo
   el estado de la unidad transitoria propia; comparar servicios/políticas con
   el inventario previo sin corregir estados ajenos ni reiniciar nada existente.

## Autorización y validación

El sí solicitado cubre instalar esta corrección en rutas nuevas, reponer el
shim temporal, crear/probar una sola vez el contenedor V2 y la limpieza anterior.
No cubre identidad QA, runner PC, aplicación publicada, SQL, Access, R2, colas,
producción, políticas globales o push. Aunque pase, aún faltará preparar y revisar
la adaptación del runner completo; este piloto offline no valida la aplicación.

Preparación:8 pruebas Node y8 Python offline, incluyendo regresión de stdin con
stream real y reportes fallidos del supervisor sin copiar texto privado. No
equivalen a una repetición del piloto ni a pruebas de Chromium/gVisor reales.

## Fuentes primarias

- [Node: asyncIterator e iterator/destroyOnReturn](https://nodejs.org/api/stream.html#readableiteratoroptions).
- [gVisor fijado: defaults CPU](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/runsc/config/config.go).
- [gVisor fijado: flags CPU](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/runsc/config/flags.go).
- [gVisor fijado: raíz de estado del shim](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/pkg/shim/v1/proc/proc.go).
- [Docker: shims por contenedor](https://docs.docker.com/engine/daemon/alternative-runtimes/).
