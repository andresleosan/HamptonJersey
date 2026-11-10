# Recuperar la preparación QA desde GitHub

Esta entrega contiene código, pruebas, SQL/medios ficticios, recibos saneados y
el traspaso. No instala ni activa nada en Cloudflare, Docker o la VPS.

El dueño autorizó publicar esta entrega en main después de que GitHub rechazara
crear la rama de traspaso. El commit final usa el prefijo [CF-Pages-Skip] para
omitir el despliegue automático de Cloudflare Pages sin cambiar su configuración.
Referencia: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/.
Comprobar el SHA remoto y el despliegue empresarial tras el push; publicar código
no acredita activar QA ni ejecutar el piloto VPS. El repositorio es público;
no se incluyen secretos, perfiles,
dependencias, binarios gVisor/Docker, capturas o archivos de resultados privados.

Después de actualizar main en una copia propia, conservando trabajo pendiente,
ejecutar desde la raíz del repositorio:

```sh
python3 scripts/restore-qa-public-inputs.py
```

Este paso SOLO local reconstruye un archivo ignorado desde la versión ya
publicada del código base y recupera cinco JSON de metadatos sellados en build/.
Comprueba huellas y se niega a sobrescribir contenido distinto. No descarga
dependencias, accede a Cloudflare/Docker/SSH o copia credenciales.

El overlay original incluía literales de contacto del código empresarial para
sustituirlos por datos ficticios. Se publica una plantilla y referencias a la
base conocida para no duplicar esos literales; su reconstrucción conserva la
huella aprobada. No alterar los manifiestos históricos para aparentar permisos.

Los paquetes grandes y node_modules se reconstruyen o descargan por sus huellas
cuando corresponda. Los manifiestos históricos de build/ aquí archivados son
metadatos públicos, no evidencia de que una copia nueva contenga el artefacto.
Una reconstrucción diferente no hereda autorización de ejecución/despliegue.
El sexto JSON archivado, el manifiesto final V2, solo se consulta/verifica y no
se restaura: así su constructor puede crear el directorio versionado sin colisión.

Leer docs/qa/HANDOFF-2026-11-10.md antes de /avanzar. El traspaso y las fuentes QA
acompañan main; su disponibilidad no ejecuta ni autoriza su infraestructura.

En Windows, clonar con core.autocrlf=false para conservar también el archivo
.gitattributes original, cuya huella ya forma parte de la aprobación E histórica.
Las reglas adicionales viven en subdirectorios para no modificar ese archivo
sellado. Los hashes de los blobs publicados se comprueban antes del push.

Validación de esta publicación: build y check:release pasan. Pruebas focales QA:
122 Python sin fallos (6 omitidas por plataforma) y47 Node pasan, incluyendo las
integraciones Node ejecutadas por su harness Python. npm test no queda verde:
1100 tests Node,1081 pasan,18 fallan y1 omitido en este PC. Los fallos aparecen
en pruebas ya existentes (permisos/symlinks/Python3/fixture Git/red y aserciones
previas); no se modifican controles ni se presenta la suite global como aprobada.

La autorización de este push no autoriza el piloto V2. El runner compartido de
VPS continúa pendiente; producción y sus políticas no se modifican.
