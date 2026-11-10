# Revisión independiente final del kit VPS QA

Fecha: 10-nov-2026. Resultado: sin hallazgos P0/P1/P2 abiertos en el alcance
local revisado. Esta revisión permite presentar el paquete concreto para
aprobación; no constituye autorización de instalación ni prueba publicada QA.

## Paquete revisado

- Manifiesto:
  `2ed8614ed501ff04bfc71903f9a669f45b07754e6e3959067069eea2ea9cd232`.
- Tar SHA-256:
  `064cbfa54593c51c314cc77d70d044c77561a8cf5e486192ab5043a8f7cc6226`.
- 138 archivos inventariados, 14.118.152 bytes. Se verificaron todos sus hashes
  y longitudes; inventario del directorio, manifiesto y tar coinciden.
- Tar solo con archivos regulares y directorios relativos: sin links,
  UID/GID0, mtime0 y modos0755/0644. No se extrajo ni ejecutó el tar.
- Código fuente y archivos del bundle coinciden. El runner F original conserva
  todos sus archivos byte a byte; se añaden únicamente history-b.mjs,
  idle.mjs, isolation.mjs y vps-live.mjs.
- Origen, D1 y R2 son los QA fijados; source80ad03d y build704b463f. No hay SQL,
  bindings de producción, perfiles privados ni identidad en el inventario.

## Relectura de fronteras y activación

Se revisaron runtime.py, controller.py, install.py, queue.py, client.py,
compose.json, vps-live.mjs, history-b.mjs, package.py, README, especificación,
plan y pruebas locales. Ninguna instrucción del paquete pide push o cambios
Cloudflare, producción, Access o SQL.

Las solicitudes tienen esquema cerrado y suites fijas. Reclamación por
FD/O_NOFOLLOW, controles de archivos regulares/enlaces/propiedad y journal con
candado global mantienen la frontera de cola inspeccionada. No se encontró un
escape concreto mediante nombres, symlinks o hardlinks en el modelo descrito.
La evidencia canónica permanece fuera de volúmenes de agentes; --details valida
hash y esquema de copias saneadas correlacionadas con el resultado.

Antes de identidad/ejecución, el preflight exige el proof fijo de parada del
runner PC, receipt de aislamiento, paquetes verificados y runtime por IDs,
imágenes, labels, redes, montajes y restricciones. store-identity y enable-queue
vuelven a ejecutar preflight. Un marcador incierto bloquea enable-queue.

prepare-codex registra la unidad oneshot con ExecStopPost antes de identidad y
pruebas iniciales; mantiene el watcher sin activar. README lanza las primeras
suites mediante systemctl. work rechaza ejecución sin INVOCATION_ID y cgroup del
servicio esperado, cerrando el hueco de supervisión inicial. Una interrupción o
incertidumbre hace que ExecStopPost compruebe journal/marcador y detenga el ID QA.

El código instalado es root-owned y se copia mediante inventario cerrado.
copy_public fija modos0755/0644; los directorios de control/identidad conservan
0700 y los archivos de identidad0600. Las copias públicas de evidencia/resultados
usan fchmod0644 explícito bajo umask077. Los talleres conservan sus volúmenes y
carecen de socket Docker.

## Hallazgos resueltos

1. **P1: limpieza falsa tras error al cerrar Playwright.** La reproducción
   original hacía fallar todos los close() y aun recibía PASS/cleanup=true.
   El driver ahora intenta cada cierre, elimina el JSON propio y, ante cualquier
   fallo de teardown, fuerza passed=false y credentials_removed=false; el
   controlador activa parada y bloqueo de incertidumbre. Regresión verde.
2. **P2: recursos vivos tras fallo de bootstrap.** start_runtime protege
   Compose/snapshot/validación/aislamiento con finally, detiene únicamente
   contenedores con label aprobado, verifica su parada y guarda receipt fallido.
3. **P1: primeras suites sin ExecStopPost.** Resuelto por la instalación previa
   de la unidad, el orden documentado y la comprobación real de supervisor en
   work descritos arriba.

## Verificación independiente local y límites

- `python -m unittest discover -s tests -p test_qa_vps_*.py`: 49 tests PASS,
  6 omitidos por ejecutarse esta revisión en Windows.
- `node --test tests/test_qa_vps_history.mjs`: 12/12 PASS.
- Verificación independiente de hashes/inventario/tar, igualdad de fuentes del
  bundle y preservación byte a byte del runner F original: PASS.
- El equipo reportó además49 tests Linux sobre temporales públicos/mocks
  (1 omisión exclusiva Windows) y18 checks History B Miniflare. No ejecuté ni
  certifiqué personalmente esas comprobaciones remotas en esta revisión.

No usé SSH, Docker ni credenciales; no instalé, activé, transfirí identidad,
llamé al QA publicado o hice push. No modifiqué runtime, paquete sellado ni los
archivos F/F1/E1. Solo se actualizó este reporte, excluido del bundle.

Quedan para después del permiso específico: extracción comprobada en staging
root-only, aislamiento sobre contenedores reales, parada verificada del PC,
transferencia exclusiva de los tres valores QA, suites publicadas y comprobación
de solicitudes desde ambos talleres. La revisión local no prueba esos resultados
operacionales ni amplía la cobertura de smoke/History B a tareas ajenas.
