# QA central en VPS para Codex y ambos Hermes

Estado: preparación local, sin autorización de instalación ni transferencia de
identidad. El dueño pidió que las validaciones de las tareas puedan ejecutarse
desde la VPS y ambos Hermes, conservando producción y push bajo autorización.

## Evidencia de lectura

SSH existente, hostkey exigida y sin forwarding: acceso al destino indicado por
el dueño. Linux x86_64, Python3.12, Docker29.5, Compose, cgroupv2 y seccomp.
16 CPU, aproximadamente31GB disponibles y amplio disco. Sin nombres QA ocupados
ni superposición de las subredes propuestas. Las imágenes fijadas no están en
caché; descargarlas es parte del permiso futuro. Node no es necesario en el host.

Los talleres hermes-taller/hermes-taller2 usan UID10001 y volúmenes distintos
montados en /home/taller; tienen Python3 y no tienen socket Docker. No leer sus
configuraciones privadas, claves, variables o logs. La conexión anónima desde
la VPS al sitio QA devuelve403. No se modificó ningún servicio remoto.

## Decisión propuesta

Un único runner QA en el host VPS, con la misma frontera de dos contenedores de
E1: Chromium/Node aislado y proxy TLS con allowlist. Ambos talleres depositan
solicitudes JSON en una carpeta nueva de su volumen ya existente y reciben un
informe saneado. Una cola y candado del host serializan las pruebas mutables.
Codex usa la misma cola por el SSH existente. Así no se expone una API nueva,
no se entregan permisos Docker a Hermes ni se reinician sus contenedores.

Alternativas descartadas: exponer el runner del PC mantiene dependencia del PC
encendido y necesita un canal adicional; dar Docker/root a los talleres aumenta
permisos; dos runners independientes no coordinan mutaciones de la misma D1 QA.

Instalar el paquete público revisado por SSH no requiere push. Publicar código
en Git se trata aparte: main puede disparar despliegues empresariales, por lo
que un push no se considera inocuo ni autorizado por esta preparación.

## Recursos y fronteras

- Cloudflare existente sin cambios: hamptonjersey-qa; D1 hampton-app-qa UUID
  53bc4af9-7250-44fe-8f90-6e415fda1034; R2 hampton-app-qa-media; qa-agent@example.test.
- Reutilizar la identidad exclusiva QA ya configurada. Transferir únicamente
  sus tres valores por SSH verificado y stdin, con permiso específico. No copiar
  perfiles, .env, credenciales empresariales o de aprovisionamiento. Ningún
  cambio de Access o secreto Cloudflare forma parte del paquete inicial.
- Código/política root-owned en /opt/hampton-qa; estado y resultados canónicos en
  /var/lib/hampton-qa; identidad host root-only0600 dentro de directorio0700 en
  /etc/hampton-qa/identity. No se monta en los talleres ni en el runner.
- Runner UID1000, cap_drop ALL, rootFS de solo lectura, no-new-privileges,
  seccomp E1, tmpfs privado, límites2CPU/2GiB/256PIDs; proxy0.5CPU/256MiB/64PIDs.
- Mismas imágenes por digest y redes172.30.230.0/28 interna isolated y
  172.30.231.0/28 de salida; sin puertos, perfiles, socket Docker o checkout
  completo montados en los contenedores QA. Los montajes solo contienen paquete
  revisado RO, política RO y resultados saneados RW.
- Las colas nuevas viven en encargos/hampton-qa de los dos volúmenes existentes.
  Solo aceptan versión/suite/tarea/ID/SHA de origen con esquema cerrado; ningún comando, URL,
  ruta, código o variable de entorno llega del solicitante al ejecutor.
- El controlador abre rutas por descriptores sin seguir symlinks, valida archivos
  regulares, tamaño, enlaces y propiedad; reclama antes de leer. Estado de jobs
  y evidencia canónica quedan fuera de los volúmenes de los agentes.
- Ningún reintento de resultado incierto. Ante timeout/resumen inválido se detiene
  únicamente el ID QA verificado y se conserva el bloqueo hasta inspección.
- Se deshabilita la ejecución publicada del runner antiguo del PC mediante su
  parada verificada después del aislamiento central y antes de las suites
  autenticadas, con permiso explícito. El supervisor systemd se registra antes
  de inyectar identidad; su watcher se habilita después de ambas suites verdes.
  El PC seguirá haciendo E2E local y podrá pedir pruebas centrales por SSH.

## Validación por tarea

El smoke137 actual sigue siendo baseline, no evidencia automática de250 tareas.
El paquete añade una suite SPR-02 B sobre fixtures existentes: sesión/guard,
proyección cerrada, match/visita/oferta vinculados, hito de venta acreditado,
paginación/validación y etiquetas UI a1280/390. No modifica ni borra fixtures
base. El borrado/revocación se cubre con pruebas locales de contrato, separado
de lo observado remotamente. C y las integraciones externas reales continúan
como pendientes específicos, no como aprobados por un simulador.

Cada resultado identifica suite, tarea, SHA del código publicado, build_id,
digest del paquete de pruebas, runId, checks, limpieza, modo y límites.
Un resultado se usa para cerrar solamente los criterios que realmente prueba.

## Permisos futuros agrupables

Antes de ejecutar: paquete e inventario revisados con SHA-256, imagen/red/montajes
exactos y revisión independiente. Solicitar sí escrito para instalar los recursos
QA nuevos y la cola en la VPS indicada, transferir solo identidad QA al almacén
exacto, ejecutar aislamiento/smokes y parar el runner PC especificado después del
aislamiento y antes de las pruebas autenticadas.
No incluye push, producción, migraciones, planes de pago ni Access nuevo.
