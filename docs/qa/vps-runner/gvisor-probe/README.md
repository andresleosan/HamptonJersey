# Piloto mínimo en la misma VPS: gVisor + sandbox interno de Chromium

Preparación del 10-nov-2026. No instalado ni ejecutado en la VPS. Este piloto
responde a la petición de conservar producción y la política compartida del host.
El manifiesto anterior y sus dos contenedores detenidos se conservan intactos.

## Decisión y límites

Probar un runtime opcional gVisor exclusivamente en un contenedor nuevo, sin red,
credenciales, aplicación publicada o integraciones. No cambiar sysctl, AppArmor,
runtime predeterminado, daemon.json, containerd ni servicios existentes.

No basta una regla AppArmor: el host tiene unprivileged_userns_clone=0. Cambiarlo
a1 es una política global, no un ajuste exclusivo de QA, y queda descartado en
este piloto. Dar CAP_SYS_ADMIN, quitar no-new-privileges o desactivar el sandbox
de Chromium tampoco forma parte de la propuesta. No hay /dev/kvm ni flags de
virtualización expuestos; una VM acelerada anidada no está disponible ahora.

gVisor implementa una interfaz de kernel para la aplicación. Su plataforma
systrap no requiere KVM. Docker permite seleccionar un shim por contenedor sin
editar ni recargar el daemon. Eso permite ensayar otra frontera únicamente para
QA, manteniendo el bloqueo del kernel real. La compatibilidad exacta de esta
imagen Chromium con gVisor es una hipótesis pendiente de la prueba real.

El kernel de aplicación gVisor no sustituye la comprobación del sandbox interno
de Chromium: se exige ChromiumSandbox=true, Namespace Sandbox, PID y Network
namespaces, seccomp-BPF y TSYNC. Además se prueban renderer, worker, UID1000,
CapEff0, NoNewPrivs1 y cierre. Un arranque simple del navegador no cuenta como PASS.

## Destino y artefactos

Host: optimyze-vps-de-prod.tail29c816.ts.net.

- Release oficial gVisor release-20261102.0, Linux x86_64. Archivo público
  gvisor-x86_64.tar.bz2 verificado contra SHA256SUMS de esa release. Huella:
  6f6b1a8f0f4665a403238135167d0d990bfaeaff5544abf68f5e0d822b35484a.
- Binarios y sidecars en /opt/hampton-qa-gvisor-probe/release-20261102.0/dist.
  Un lanzador privado en bin/runsc y un shim lanzador nuevo en
  /usr/local/bin/containerd-shim-runsc-v1; todos root-owned0755, sin setuid/caps.
  El PATH del shim hijo apunta al bin privado; no se cambia el PATH del host.
- Runtime seleccionado: io.containerd.runsc.v1; plataforma systrap, red none,
  systemd-cgroup=true y trazas/debug/packet logs deshabilitados en el lanzador
  privado. Este lanzador rechaza sobrescribir esos argumentos. No instala
  runsc global ni configura el runtime predeterminado. Nunca ejecutar runsc install.
- Contenedor nuevo hampton-app-qa-chromium-probe. Misma imagen Playwright ya
  descargada y fijada por digest; no hay nueva imagen Docker ni puertos/red bridge.
- Dos montajes RO: paquete público existente en /work y probe.mjs en /probe.mjs.
  No hay montajes de perfiles, estado empresarial, identidad, sockets o talleres.
- UID/GID1000, cap-dropALL, no-new-privileges, seccomp E1, raíz RO, IPC privado,
  tmpfs, logging Docker none, sin restart y sin core dumps. Límites solicitados:
  2CPU, 2GiB sin swap adicional, 256PIDs y shm512MiB. Se verifica cgroup efectivo
  del sandbox en el host; no se da por demostrado por leer límites dentro de gVisor.
- Estado/resultados root0700 en /var/lib/hampton-qa-gvisor-probe. Docker/containerd
  crean únicamente sus objetos/cgroup/estado normal asociados al ID nuevo. runsc
  puede crear estado efímero propio bajo /run/runsc/moby para ese ID.

## Ejecución futura, solo con sí escrito para el manifiesto

1. Repetir inventario de lectura: identidad ausente, QA anterior parado, bloqueo
   kernel0/AppArmor1, rutas nuevas libres, root-owned sin symlinks y shim ausente.
   Confirmar cero consumidores previos del runtime opcional y ausencia de config
   runsc global. Inventario actual cumple estos puntos. Si difiere, parar.
2. Transferir solo archivos públicos por SSH verificado, a staging root0700.
   Verificar huella del manifiesto/archivo y de cada miembro antes de instalar;
   extraer solo miembros regulares/directorios relativos listados, sin links.
   Código público0755/0644; ningún destino existente se sobrescribe o adopta.
3. Crear el contenedor con los argumentos cerrados de container-create.json y
   label hampton.qa.gvisor-probe=<SHA autorizado>. No arrancarlo todavía.
   Guardar su ID64hex y verificar imagen, runtime, labels, red none, montajes,
   límites, seccomp, UID, capacidades y política de seguridad efectivos contra
   el manifiesto. No usar stdout/logs de contenedores ajenos.
4. Ejecutar supervisor.py run --container-id <ID> --approved-manifest-sha256 <SHA>
   mediante una unidad TRANSITORIA nueva hampton-qa-chromium-probe.service:
   Type=exec, RuntimeMaxSec=180, TimeoutStopSec=45, KillMode=control-group,
   UMask=0077, LimitCORE=0, StandardOutput=null, StandardError=null. ExecStopPost
   llama al mismo supervisor.py stop con los mismos ID/SHA. Si la sesión SSH
   se corta, la unidad completa o detiene la prueba; no depende del cliente SSH.
   No se crean unidades persistentes ni se reinician servicios previos.
5. El probe espera un token GO por stdin y no abre Chromium antes. El supervisor
   primero comprueba el PID host del sandbox, su ejecutable gVisor y su cgroup
   exacto /system.slice/docker-<ID>.scope. Exige cpu.max equivalente a2CPU,
   memory.max2147483648, memory.swap.max0 y pids.max256. Revalida el mismo PID
   antes de entregar GO. Registra esos límites host con el resultado; ante un
   límite ausente, max o diferente, no libera el navegador y detiene el ID nuevo.
   El probe tiene además watchdog de120s. Solo navega chrome://sandbox y data:,
   sin red o identidad. Guarda únicamente resultado cerrado y saneado root0600;
   ningún stderr crudo, captura, traza o cookie. Un resultado ausente es fallo.
6. Supervisor y ExecStopPost verifican ID/nombre/label/runtime antes de parar.
   Se exige Runningfalse/PID0 al terminar, también ante fallo. Conservar el
   contenedor detenido, resultado y recibo; no reintentar ni borrar evidencia.
7. Verificar kernel0/AppArmor1, runtime default y estados de contenedores previos.
   Si hubo cambios ajenos, registrarlos sin corregirlos ni atribuirlos al piloto.
   Retirar solo el shim lanzador nuevo de PATH tras verificar su hash y que no
   apareció otro consumidor de runsc. Conservar binarios públicos y evidencia
   para revisión. Ante cualquier duda de propiedad/consumidor, detener y reportar.

## Qué autoriza y qué no prueba

El sí autoriza únicamente añadir los archivos públicos nuevos, el runtime
opcional temporal, un contenedor y su unidad transitoria, ejecutar el piloto y
parar el ID nuevo/retirar el lanzador propio. No autoriza modificar los runners
anteriores, transferir identidad, parar el PC, habilitar colas, abrir red o
avanzar a smoke publicado. Aunque sea verde, queda revisar la adaptación del
runner completo, proxy, aislamiento y control por tarea en un manifiesto posterior.

La preparación incluye6 pruebas Node del parser/driver y7 Python del supervisor
y lanzadores; son offline con mocks, no evidencia de funcionamiento de gVisor.
Compartir CPU/memoria siempre añade consumo acotado: no se promete impacto cero
en rendimiento ni se altera la protección global para conseguir compatibilidad.

## Fuentes primarias

- Docker: https://docs.docker.com/engine/daemon/alternative-runtimes/
- gVisor plataformas: https://gvisor.dev/docs/user_guide/platforms/
- gVisor arquitectura: https://gvisor.dev/docs/architecture_guide/intro/
- gVisor compatibilidad: https://gvisor.dev/docs/user_guide/compatibility/
- Release: https://github.com/google/gvisor/releases/tag/release-20261102.0
- Chromium Linux sandbox: https://chromium.googlesource.com/chromium/src/+/main/sandbox/linux/README.md
- Docker sysctl: https://docs.docker.com/reference/cli/docker/container/run/
- Ubuntu AppArmor: https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/
