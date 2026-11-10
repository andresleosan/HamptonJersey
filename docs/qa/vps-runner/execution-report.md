# Instalación VPS autorizada: detenida en aislamiento

10-nov-2026. El dueño autorizó instalar y probar el manifiesto
`2ed8614ed501ff04bfc71903f9a669f45b07754e6e3959067069eea2ea9cd232`
en `optimyze-vps-de-prod.tail29c816.ts.net`, transferir solo identidad QA y
parar el runner del PC. La autorización excluye producción, servicios existentes
y push. El artefacto aprobado no se modificó.

## Operaciones realizadas

- SSH con hostkey verificada, sin forwarding. Tar y manifiesto comprobados por
  SHA-256, inventario cerrado y extracción root-only sin links.
- Código nuevo en `/opt/hampton-qa`, estado nuevo en `/var/lib/hampton-qa`, staging
  público verificado en `/var/tmp/hampton-qa-<SHA>`. Imágenes autorizadas descargadas
  por digest y dos contenedores/redes QA nuevos creados con las restricciones
  previstas. Ningún servicio previo reiniciado ni reconfigurado.
- La validación efectiva de IDs, imágenes, límites, redes y montajes llegó a la
  prueba de aislamiento. Pasaron 20 controles de permisos y red; la prueba se
  interrumpió antes de registrar los dos controles de Chromium. Resultado global
  FAIL; no sustituirlo por un PASS parcial.
- El instalador ejecutó su cierre y verificó ambos contenedores QA parados,
  `Running=false`, PID0. Receipt fallido conservado; no se reintentó bootstrap.

## Bloqueo observado

La lectura del host confirma `kernel.unprivileged_userns_clone=0`,
`kernel.apparmor_restrict_unprivileged_userns=1`, AppArmor activo y perfil
`docker-default` en los dos contenedores. Los espacios de nombres sin privilegios
están deshabilitados en este host; el diseño Chromium con UID1000, sin capacidades
y `no-new-privileges` necesita esa función para su sandbox. El diagnóstico original
no conserva el error crudo de Chromium, por lo que no identifica otros posibles
factores de su arranque.

No se cambió sysctl, AppArmor, Docker daemon ni la seguridad del navegador. El
manifestado autorizado no habilita esa capacidad del host y la autorización
prohíbe modificar servicios existentes/producción. La corrección requiere un
destino QA compatible o una nueva decisión explícita de infraestructura; no
puede resolverse desactivando el sandbox ni aparentando la prueba publicada.

## Estado conservado y pendientes

- Identidad QA no leída ni transferida; `/etc/hampton-qa/identity` no existe.
  Solo existe el directorio padre nuevo de preparación, sin valores.
- Runner del PC no parado por esta operación.
- No se crearon unidades systemd, clientes ni colas de talleres.
- No se ejecutó smoke autenticado, History B publicado ni prueba desde talleres.
- No se tocó Cloudflare, SQL, Access, R2, aplicación empresarial o Git remoto.
- Código, imágenes y recursos QA parados se conservan para inspección; el
  instalador rechaza adopción/sobrescritura o reintento automático.

Evidencia operacional saneada: `test-results/qa-vps-bootstrap.json`,
`qa-vps-failed-bootstrap-state.json`, `qa-vps-isolation-failed.json`,
`qa-vps-host-sandbox-readonly.json` y `qa-vps-execution-report.json`.
