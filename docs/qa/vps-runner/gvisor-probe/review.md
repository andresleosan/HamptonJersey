# Revisión independiente final del piloto gVisor

10-nov-2026. Resultado: sin hallazgos P0/P1/P2 abiertos en la revisión local del
piloto offline. Compatibilidad real pendiente; este reporte permite presentar
el paquete concreto para autorización y no autoriza instalarlo ni ejecutarlo.

## Artefacto final comprobado

- Manifiesto: `7bd6db6fcaec7a7ba8ec63a9f680f4668645b66f46675a48f505e9f6e817e17a`.
- Tar: `db7cb1b35df13176b35ef175044a44c27e4e12e62b6af79be07cfd5f169ffd1a`.
- Siete archivos inventariados; directorio/tar/manifiesto concordantes y todos
  los hashes/longitudes íntegros. Fuentes y bundle coinciden.
- Tar exterior solo con regulares simples, sin links, UID/GID0, mtime0, modo0644.
- Tar gVisor: `6f6b1a8f0f4665a403238135167d0d990bfaeaff5544abf68f5e0d822b35484a`.
  Ocho miembros regulares verificados contra manifiesto; sin links o rutas
  que escapen del directorio. No se ejecutaron ni instalaron.
- Pruebas repetidas localmente: 7/7 Python y 6/6 Node PASS, offline con mocks.

## P2 de límites host cerrado

La versión3fde permitía PASS sin comprobar los límites efectivos del sandbox.
Se releyó la corrección del supervisor y probe del manifiesto final:

1. El contenedor arranca interactivo y el probe espera el token exacto GO por
   stdin. No importa Chromium ni abre navegador antes; no depende de EOF.
2. El supervisor espera Running/PID y exige que el PID esté en el cgroup v2
   `/system.slice/docker-<ID>.scope` exacto y que su ejecutable corresponda por
   samefile al runsc/Sentry privado fijado.
3. Lee el cgroup del host y exige cuota CPU equivalente a2CPU, memory.max2GiB,
   memory.swap.max0 y pids.max256. Valores ausentes, max o diferentes bloquean.
4. Revalida Running y el mismo PID antes de entregar GO. Registra la prueba host
   con el resultado. Ante fallo no libera Chromium y finally intenta la parada
   del ID/name/label/runtime aprobado; la unidad y ExecStopPost conservan su
   cobertura de interrupción.

Las regresiones prueban rechazo de cgroup ajeno/límites max y que no se entrega
GO tras fallo de límites. El gate puede rechazar una instalación compatible con
una disposición de cgroups distinta: es cierre seguro, no licencia para ampliar
rutas o relajar los límites sin nueva revisión. El límite del supervisor no se
confunde con el del sandbox creado a través del daemon Docker.

No se identificó otro hallazgo material en esta relectura acotada. El protocolo
exige namespace/PID/network sandbox, seccomp-BPF y TSYNC de chrome://sandbox,
renderer/worker y cierre. Arrancar el navegador no basta. Cierres fallidos
invalidan PASS. No se entregan identidad, red o montajes empresariales al probe.

## Producción y compatibilidad

Es defendible decir: «sin modificar configuración/políticas ni reiniciar los
servicios de producción». No se debe prometer impacto cero o ningún cambio al
host: se añade un launcher global en PATH, binarios root y procesos/estado/cgroups
a través del daemon compartido. Esto añade consumo y superficie de runtime.
El README reconoce el consumo compartido; la autorización debe mantener ese
matiz. El gate limita la carga antes de Chromium, pero iniciar el runtime también
consume recursos. No hay cambios sysctl/AppArmor/default runtime y no se ejecuta
runsc install.

Docker documenta seleccionar shims por runtime con el ejecutable en PATH sin
cambiar la configuración del daemon. gVisor documenta systrap como plataforma
predeterminada alternativa a KVM. Estas fuentes respaldan el mecanismo propuesto,
no su compatibilidad real con la VPS/Chromium:

- [Docker: alternative runtimes](https://docs.docker.com/engine/daemon/alternative-runtimes/).
- [gVisor: platforms](https://gvisor.dev/docs/user_guide/platforms/).
- [Shim de la release: selección de runsc](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/pkg/shim/v1/runsc/service.go).
- [Shim de la release: opciones](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/pkg/shim/v1/runsc/options.go).
- [Shim de la release: comandos](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/pkg/shim/v1/runsccmd/runsc.go).

## Límites de esta revisión

Solo fuentes y artefactos públicos locales más documentación primaria web.
Sin SSH, Docker, ejecución de binarios reales, credenciales, instalación o
mutación de fuentes/bundle. Única escritura: este reporte excluido del paquete.

Quedan como hipótesis hasta permiso/prueba real: descubrimiento por PATH efectivo
de containerd, arranque systrap bajo las políticas actuales, disposición del
cgroup/PID efectivo, sandbox Chromium dentro de gVisor y teardown real de
shim/sentry/gofer. Ninguna prueba con mocks acredita estas condiciones.

Si falla el arranque o falta resultado, se considera fallo; no flexibilizar el
sandbox para conseguir verde. No se amplía esta autorización propuesta a QA
publicado, identidad, cola compartida o modificación de contenedores existentes.
