# Revisión independiente final de corrección gVisor V2

10-nov-2026. Resultado: sin hallazgos P0/P1/P2 abiertos en esta revisión local.
El paquete puede presentarse para autorización específica; este reporte no
autoriza ejecutarlo ni acredita compatibilidad real en la VPS.

## Artefacto comprobado

- Manifiesto: `d9dccc95971daf16209a42d5ba5baa4b8dc642c872a3be93f4ee9022207c707c`.
- Tar: `f6eaf6bc624c3b8aa2ab796d8ba382b4a7211e5077814af43de4262820309d94`.
- Seis archivos, 24.246 bytes. Inventario, longitudes y hashes completos PASS;
  directorio/manifiesto/tar coinciden y fuente igual al bundle. Tar solo con
  archivos regulares simples, sin links, UID/GID0, mtime0, modo0644.
- Pruebas repetidas localmente: 8/8 Python y 8/8 Node PASS. La regresión de stdin
  usa PassThrough real; las operaciones Docker/gVisor siguen siendo mocks.

## P2 OCI seccomp cerrado

La revisión del manifiesto intermedio46df identificó que el wrapper no habilitaba
OCI seccomp, desactivado por defecto en la release fijada. La versión final:

- Fija `--oci-seccomp=true` en el wrapper privado y rechaza overrides antes de
  ejecutar runsc; la prueba offline exige el argumento y rechaza false.
- Exige el check oci_seccomp: Seccomp2 en `/proc/self/status` de Node ANTES de
  lanzar Chromium. Seccomp0 bloquea el navegador en la regresión nueva.
- El supervisor requiere ese check en cualquier PASS; el README distingue el
  filtro OCI de aplicación, el filtro propio de host del Sentry y el sandbox
  interno de Chromium. Si E1 resulta incompatible, falla sin relajar filtros.

Se contrastó la [implementación proc de la release fijada](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/pkg/sentry/fsimpl/proc/task_files.go),
que expone SeccompMode de la tarea. El gate comprueba que un filtro está activo;
la identidad exacta del perfil sigue respaldada por el hash E1 y los argumentos
cerrados inspeccionados antes de ejecutar. No se afirma que su compatibilidad
real esté probada antes del piloto autorizado.

## Correcciones y alcance verificados

- `stream.iterator({destroyOnReturn:false})` conserva el Readable tras GO y no
  necesita EOF. La prueba con stream real cubre el defecto anterior y coincide
  con la [documentación oficial de Node](https://nodejs.org/api/stream.html#readableiteratoroptions).
- Fases exclusivas antes de entrar, fallos cerrados, clasificación enumerada de
  stderr y contadores mejoran diagnóstico sin copiar bytes o mensajes crudos.
  Excepciones ordinarias generan resultado fallido y se intenta parar el ID
  aprobado. Una muerte forzada o fallo de almacenamiento aún puede impedir
  result.json: checkpoints disponibles y resultado ausente significan fallo,
  como documenta el runbook. No existe reintento automático.
- Las políticas privadas creation/lifecycle1x se aceptan y rechazan overrides en
  pruebas. Los defaults uncapped/factor4 están en el [código fijado](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/runsc/config/config.go).
  Es una corrección de configuración; no prueba que causara el fallo anterior.
- Se conservan tokenGO posterior a límites host/cgroup/PID/exe, revalidaciónPID,
  cierre Playwright, comprobación exacta de namespaces/seccomp-BPF/TSYNC y parada
  por ID/name/label/runtime. Los ocho binarios oficiales previos se reutilizan RO.
- Nuevo código/estado/contenedor/unidad V2 conservan el intento anterior. El
  permiso futuro está limitado a un intento; no incluye identidad, QA publicado,
  cola compartida, parada del PC, push o cambios de políticas/servicios existentes.

## Límites de certeza y autorización

Es correcto no atribuir causalidad histórica concluyente: reproducir destrucción
de stdin localmente no demuestra por sí solo la causa del exit1 anterior. No se
han probado esta corrección, Chromium o gVisor reales en la VPS.

La autorización propuesta debe conservar «sin modificar configuración/políticas
ni reiniciar producción», sin prometer riesgo o impacto cero. Hay software root
y un launcher temporal en PATH, carga nueva y uso del daemon compartido. Flags1x
no acreditan límite físico antes de crear el cgroup; README reconoce ese límite.
Un verde offline tampoco autoriza adaptar o activar el runner completo.

Sin SSH, Docker, credenciales ni ejecución de binarios reales. No se repitió el
piloto ni se cambiaron fuentes/artefacto. Única escritura: este reporte excluido
del bundle. No quedan hallazgos materiales abiertos de la revisión acotada.
