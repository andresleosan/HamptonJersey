# Runner QA central para ambos Hermes y Codex

Preparado localmente; no instalado ni activado. La VPS se identificó mediante
el SSH existente indicado por el dueño. El inventario fue de lectura y las
pruebas POSIX se ejecutaron solamente en una carpeta temporal con datos ficticios.
No se copiaron valores de identidad, descargaron imágenes o cambiaron servicios.

## Qué permite

Un runner central ejecuta suites revisadas sobre hamptonjersey-qa. Hermes1 y
Hermes2 piden pruebas desde sus talleres sin Docker ni credenciales QA; Codex usa
la misma cola por SSH. Las ejecuciones mutables quedan serializadas en un único
host. Cada resultado identifica tarea, suite, source_sha, build_id y evidencia.
Un smoke general no cierra automáticamente una tarea funcional.

Suites iniciales:

- `smoke`: el paquete de71 API y66 UI ya probado en el PC, con datos ficticios.
- `history-b`: 14 API y4 UI sobre fixtures existentes de SPR-02 B: vínculo de
  match/visita/oferta, proyección sin datos libres, cursor/paginación/validación,
  hito Planned de venta y History a1280/390 con zoom CSS200. Es lectura; no prueba
  borrado/revocación remotos ni productores de C. La prueba local Miniflare pasa
  los18 checks; el router ASSETS se adapta localmente, por lo que se conserva la
  comprobación publicada posterior. No se usaron credenciales QA reales allí.

Google/OAuth permanece deshabilitado; proveedores externos simulados o fuera
del smoke conservan su pendiente real. Los datos de QA no equivalen a producción.

## Destinos exactos propuestos

Host: optimyze-vps-de-prod.tail29c816.ts.net. La presencia de otros servicios en
esa VPS no autoriza modificarlos. Solo se añaden los siguientes recursos QA:

| Recurso | Destino |
|---|---|
| Código revisado | /opt/hampton-qa |
| Estado/paquetes/evidencia | /var/lib/hampton-qa |
| Identidad QA, root0700/0600 | /etc/hampton-qa/identity |
| Servicios nuevos | hampton-qa-queue.path y hampton-qa-queue.service |
| Contenedores nuevos | hampton-app-qa-runner y hampton-app-qa-egress |
| Redes sin puertos | hampton-app-qa-internal172.30.230.0/28, hampton-app-qa-outbound172.30.231.0/28 |
| Cliente y colas por taller | /home/taller/encargos/hampton-qa dentro de cada volumen existente |

UID1000, cap_dropALL, no-new-privileges, seccomp E1, raíz RO, sin core dumps ni
logs Docker, tmpfs privado y sin perfiles/checkout/socket Docker montados. Runner
2CPU/2GiB/256PIDs; proxy0.5CPU/256MiB/64PIDs. Montajes del runner: paquete RO en
/work y resultados RW en /results; del proxy: política RO en /policy. Las imágenes
por digest, fuentes/montajes exactos y hashes completos constan en manifest.json.

El controlador es código root-owned de operaciones fijas: solo cola, inspección
y exec del ID QA comprobado. Los solicitantes no proporcionan comandos, URLs,
paths, variables o código. Directory descriptors/O_NOFOLLOW protegen los
ancestros y archivos, el journal SQLite evita duplicados y un bloqueo persistente
impide reintentar resultados inciertos. El resultado canónico vive fuera de los
volúmenes; las copias para agentes solo contienen campos saneados.

## Orden futuro, únicamente tras autorización del manifiesto

1. Verificar SHA del archivo tar y manifiesto; transferir solamente ese paquete
   público por SSH con hostkey verificada, sin forwarding, a staging root-only.
   Extraer solo rutas relativas regulares/directorios listadas; rechazar links y
   archivos fuera del manifiesto. No ejecutar tar arbitrario de un solicitante.
2. Ejecutar install.py bootstrap con el SHA autorizado desde staging. Rechaza
   destinos/nombres ocupados y redes superpuestas; comprueba memoria/disco.
   Copia solo archivos listados, fija permisos públicos0755/0644, descarga las
   dos imágenes por digest y levanta únicamente los contenedores QA. Ante fallo
   después de compose-up, guarda receipt y verifica parada de recursos con su
   label de aprobación. No adopta ni borra una instalación previa.
3. Exigir los22 controles de aislamiento y selftest del proxy antes de identidad.
   Registrar IDs reales de imágenes/contenedores/redes; no confundir digest de
   manifiesto de imagen con image-config-ID. No cargar secretos para arreglar rojo.
4. Parar y verificar exclusivamente el runner antiguo del PC, ID
   a22cfa82aff4423614f95097d12d56ca57629edb4e99a008b685234eb799408d, sin ejecución
   en curso. Guardar proof de ID/Runningfalse/PID0 mediante prepare-codex, que
   instala la unidad oneshot con ExecStopPost sin activar todavía el watcher. El PC
   mantiene E2E locales y desde entonces pide QA publicado por la cola central.
5. Con autorización específica de destino, leer los3 archivos QA ya existentes
   mediante el almacén canónico/ACL revisados F1 y enviarlos exclusivamente por
   SSH stdin a install.py store-identity. Nunca via argumentos, env, .env, Git,
   chat, capturas o logs. No se cambia ni crea secreto Cloudflare, Access o SQL.
   Si la entrega queda incierta, inspeccionar metadatos remotos antes de reintentar.
6. Usar la cola Codex root para probar smoke e history-b; disparar cada tanda con
   systemctl start hampton-qa-queue.service, nunca ejecutar work por SSH sin ese
   supervisor. La unidad ya existe y sobrevive a una desconexión SSH. work conserva stdin y
   tmpfs0600, firma solo qa-agent@example.test y exige QA/build correctos antes
   de operaciones. Cualquier cleanup incompleto o timeout detiene el ID QA y
   enclava incertidumbre. ExecStopPost cubre una interrupción del controlador.
7. Solo tras ambas suites verdes, enable-queue instala el cliente en los dos
   talleres y activa exclusivamente el watcher path ya preparado. No reinicia los Hermes,
   proxies, SSH, Docker daemon ni servicios empresariales. Verificar un trabajo
   readonly de cada taller, informes separados y candado compartido.

Si algo difiere, conservar estado y detener. El instalador no tiene force/reset
ni reintento automático. No tocar root-owned journal/uncertain para aparentar verde.

## Uso de los agentes después de instalar

Desde el checkout de Hampton del taller, con la fuente que realmente se prueba:

```sh
python3 /home/taller/encargos/hampton-qa/client.py submit history-b --task SPR-02 --source-sha "$(git rev-parse HEAD)" --wait --details
```

Para el baseline usar `submit smoke`. Source distinto del desplegado devuelve
bloqueo: no presentar QA anterior como validación de código nuevo sin desplegar.
`--details` verifica la huella y el esquema de la evidencia saneada y devuelve
los casos API/UI y sus límites; los textos crudos del navegador no se comparten.
Mantener además pruebas locales del cambio y criterios externos que no cubre QA.
Nueva suite/cambio de paquete se revisa; un nuevo despliegue, SQL, Access/secreto o
push conserva el sí escrito del dueño para operación, huella y destino.

No hace falta push para instalar este paquete por SSH. Publicar el código en
GitHub es una operación aparte; main puede disparar despliegues empresariales.
