# Piloto autorizado gVisor: no aprobado; limpieza verificada

10-nov-2026. Destino: optimyze-vps-de-prod.tail29c816.ts.net.
Manifiesto autorizado:
`7bd6db6fcaec7a7ba8ec63a9f680f4668645b66f46675a48f505e9f6e817e17a`.
Tar verificado:
`db7cb1b35df13176b35ef175044a44c27e4e12e62b6af79be07cfd5f169ffd1a`.
No se modificó el paquete sellado.

## Ejecución observada

- Preflight de lectura aprobado: bloqueo kernel0/AppArmor1, runtime default runc,
  cgroupv2/systemd, identidad ausente, rutas propuestas libres y cero consumidores
  previos de runsc. Capturado estado de81 contenedores existentes y de Docker,
  containerd y SSH, sin leer sus entornos, perfiles ni logs.
- Transferidos y verificados únicamente archivos públicos, miembros del tar y
  checksums oficiales de gVisor release-20261102.0. Instalados en las rutas nuevas
  previstas, con propiedad root y permisos explícitos; sin setuid/caps de archivo.
- Creado hampton-app-qa-chromium-probe con ID
  `74a8197f2f739c5d7a86b46289a67cfba45ecde9e190711e5b89ea313262fec2`.
  Verificados antes del arranque: imagen fijada, runtime io.containerd.runsc.v1,
  label de aprobación, red none sin puertos, UID1000, cap-dropALL,
  no-new-privileges, seccomp E1, raíz RO, dos montajes RO, tmpfs, límites pedidos,
  logging none, no restart y core0. Es configuración acreditada; no equivale a
  acreditar los límites del sandbox vivo o el sandbox interno de Chromium.
- Iniciado exclusivamente mediante unidad transitoria con RuntimeMaxSec180,
  TimeoutStopSec45 y ExecStopPost de parada del ID/label/runtime verificados.
- El contenedor terminó con exit1, OOMKilledfalse y sin error persistido en
  State.Error. La unidad reportó ExecMainStatus2 y Result=exit-code.
  ExecStopPost terminó correctamente. No apareció result.json del supervisor.

## Resultado y límite del diagnóstico

FAIL/no aprobado. No existe evidencia suficiente de cgroup efectivo antes de GO,
de liberación del navegador, ni de sandbox Chromium completo. No se afirma que
Chromium haya superado ninguna comprobación ni que gVisor sea incompatible en
general. El error exacto no se pudo identificar con la evidencia conservada.

El supervisor de este manifiesto convierte excepciones en exit2 y no guarda
checkpoint/causa saneada si falla antes de escribir result.json; stderr crudo se
descarta. Los directorios de tarea/cgroup ya no existían al inspeccionarlos, y no
había log de runtime propio retenido en los destinos comprobados. No se leyeron
logs de otros servicios para compensar esa carencia. Hace falta diagnosticar esa
fase con evidencia controlada antes de proponer otra ejecución.

No hubo reintento del piloto, sustitución del artefacto ni relajación del sandbox.

## Limpieza y conservación

- Runningfalse y PID0 del contenedor nuevo confirmados; contenedor detenido
  conservado para inspección, como pide el manifiesto.
- SHA, propietario, tipo regular, enlace único y modo del lanzador de PATH
  comprobados; cero consumidores distintos del propio piloto. Lanzador
  /usr/local/bin/containerd-shim-runsc-v1 retirado y ausencia verificada.
- Estado fallido de la unidad transitoria propia liberado; la inspección final
  muestra LoadState=not-found. Sus valores por defecto Result=success/exit0 una
  vez descargada NO son resultado del piloto; el fallo anterior se conserva aquí.
- Binarios públicos en /opt/hampton-qa-gvisor-probe, staging público root-only,
  evidencia y recibos en /var/lib/hampton-qa-gvisor-probe conservados según plan.
  No se instaló runsc global ni se activó runtime predeterminado alguno.
- Comparación anterior/posterior: cero cambios observados en estado de los81
  contenedores previos; PIDs/estado/activación de Docker, containerd y SSH iguales;
  metadatos de configuración comprobados sin cambios; políticas0/1 y defaults de
  Docker iguales. Solo se añade el contenedor de prueba detenido.
- Identidad QA ausente; no se leyó o transfirió ningún valor. Runner PC no tocado,
  sin solicitudes publicadas, Cloudflare, SQL, R2, Access, colas o push.

La primera comprobación de limpieza del operador confundió el ID corto de
docker ps con el ID completo del propio piloto y se negó a retirar el lanzador.
Tras inspección de lectura se corrigió únicamente esa comparación en el helper
local del operador, resolviendo el ID completo mediante inspect. El artefacto
autorizado permaneció intacto; no se volvió a ejecutar la prueba.

## Evidencia saneada

- test-results/qa-gvisor-preflight.json e install.json: inventario y creación.
- test-results/qa-gvisor-start.json: una sola solicitud de arranque supervisado.
- test-results/qa-gvisor-diagnostic.json: exit1, sin OOM, stoppost correcto.
- test-results/qa-gvisor-cleanup.json: parada, retirada y comparación de estados.
- test-results/qa-gvisor-inspection.json: estado final, unidad descargada.
- docs/qa/vps-runner/gvisor-probe/execution-report.json: resultado consolidado.
