# Investigación del fallo y preparación V2

10-nov-2026. No se repitió el piloto ni se ejecutó ningún binario nuevo en la
VPS. La autorización actual se usó para lectura de metadatos y preparación local.

## Qué se pudo demostrar

El intento anterior empezó a14:19:52Z y terminó a14:19:57Z, aproximadamente5,47s.
Contenedor exit1, supervisor exit2, OOMKilledfalse, sin informe final conservado.
Ahora permanece parado/PID0, sin shim en PATH ni identidad QA. Se comprobaron
los8 archivos oficiales retenidos por SHA-256, tipo, enlace único, uid0 y modo755;
coinciden con el manifiesto sellado. Las rutas nuevas V2 están libres.

Se reprodujo localmente un defecto de awaitGate con un Readable real de Node:
tras aceptar GO, la versión anterior deja stdin destroyed=true/readable=false.
La regresión nueva falla contra V1 y pasa contra V2, que usa iterator con
destroyOnReturn=false. Es un fallo del código de arranque comprobado; la prueba
anterior con un generador simulado no lo representaba.

También se verificó en el código que los errores previos a la escritura del
informe se convertían en exit2 sin causa ni checkpoint. V2 preserva fase y causa
cerradas después de error y confirma la parada; stderr solo genera categorías y
contadores, nunca texto original.

El código de la release oficial revela además que sus políticas CPU por defecto
permiten creación sin cuota y amplían ciertas operaciones de ciclo de vida.
El wrapper anterior no las fijaba. V2 añade las dos opciones1x; los controles
de cgroup no se relajan y deben seguir acreditando los límites antes de GO.
Se trata de cerrar una configuración incompleta, no de una causa demostrada del
fallo anterior. El código documenta que pasos previos a instalar el cgroup no
quedan limitados por esas opciones; no se atribuye un límite absoluto de consumo.

Se contrastó la ruta de estado del shim de esa release, /run/containerd/runsc;
no quedaban entradas del contenedor en su subdirectorio moby. Las ubicaciones
genéricas comprobadas inicialmente no bastaban para esa inspección.

La revisión encontró que oci-seccomp es false por defecto en esta release.
Solicitar E1 en Docker no demuestra su aplicación en gVisor. V2 lo activa
explícitamente y añade comprobación Seccomp2 del proceso Node antes de Chromium.
La implementación proc de la release expone task.SeccompMode; no se sustituye
el filtro por un indicador ficticio. Se mantienen los controles internos de
Chromium y el filtro del Sentry sobre el host como capas distintas. Esto tampoco
se atribuye como causa histórica del exit1.

## Qué no se puede concluir

No hay prueba retrospectiva de que se llegara a GO ni a Chromium. El exit1
podría pertenecer a otro fallo previo de arranque, límites o permisos. Sin la
causa del supervisor, el defecto de stdin no puede declararse causa única del
intento histórico. V2 corrige defectos reproducidos y permite identificar la
fase de cualquier fallo nuevo; su compatibilidad en esta VPS todavía requiere
un intento autorizado. No se inventa un diagnóstico específico de Chromium.

## Verificación local y alcance propuesto

- V2:8 tests Node y8 Python pasan; incluye stream real, límites inválidos que
  nunca liberan GO, informe fallido saneado, parada y flags CPU fijos.
- Regresión V1 conservada:6 Node y7 Python pasan. Total29 tests locales.
- Paquete V2 público preparado y sellado: ver proposal.json. No instalado.
- Cero cambios remotos: solo stat/hash de binarios y metadatos de contenedor y
  directorios, sin procesos nuevos del piloto, datos empresariales o valores QA.

La nueva autorización deberá nombrar el manifiesto V2, el mismo host, instalación
en directorios nuevos, shim temporal, un solo contenedor/intento offline bajo
unidad transitoria y su limpieza. No incluye políticas globales, servicios
existentes, datos, identidad QA, PC, producción, aplicación publicada o push.

## Fuentes primarias

- [Node: Readable asyncIterator destruye el stream con break; iterator permite evitarlo](https://nodejs.org/api/stream.html#readableiteratoroptions).
- [gVisor release-20261102.0: defaults de CPU](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/runsc/config/config.go).
- [gVisor release-20261102.0: flags de CPU](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/runsc/config/flags.go).
- [gVisor release-20261102.0: raíz del shim](https://raw.githubusercontent.com/google/gvisor/release-20261102.0/pkg/shim/v1/proc/proc.go).

Evidencia saneada: test-results/qa-gvisor-failure-investigation-readonly.json,
qa-gvisor-actual-runtime-root-readonly.json y qa-gvisor-v2-public-assets-readonly.json.
