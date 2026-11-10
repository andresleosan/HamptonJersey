# Paso F preparado · pendiente de autorización

No publicar ni cargar la identidad real por leer estos archivos. Esta entrega
prepara el despliegue y el smoke; no los ejecuta. No autoriza cambios en Access,
secretos, plan, producción, Git remoto ni reimportar setup.sql.

## Fuente y destinos

HEAD main local y GitHub main coinciden en
`80ad03df7e095750f455aa4aa668573e9aac5db4`. El artefacto deriva de ese código con
overlays exclusivos QA, todavía locales y sin commit/push. Los archivos
empresariales versionados permanecen sin cambios.

| Recurso | Destino único |
|---|---|
| Pages | hamptonjersey-qa, rama main, entorno Pages Production |
| URL funcional | https://hamptonjersey-qa.pages.dev |
| D1 | hampton-app-qa / 53bc4af9-7250-44fe-8f90-6e415fda1034 |
| R2 privado | hampton-app-qa-media |
| Identidad de aplicación | qa-agent@example.test |
| Ejecutor | hampton-app-qa-runner, Docker Desktop desktop-linux, E1 existente |

Production es el nombre del entorno de **este proyecto QA separado**. Preview
continúa sin D1, R2 ni secretos. Access exige la identidad de servicio existente
en el dominio raíz y `*.hamptonjersey-qa.pages.dev`; los hostnames de despliegue
también están protegidos. El worker solo sirve en el origen raíz exacto y exige
el testigo de la D1 QA para páginas, API, medios y recursos estáticos.

## Paquetes sellados

Artefacto publicable: `build/qa-full-app-F/artifact`, 22 archivos, 1.810.170 bytes.
SHA-256 del árbol:
`d4b2a57bd3036efc1718396d68edfb3912d59f8e35a2cd4dae765e8c6d43c30b`.

El inventario está en `build/qa-full-app-F/build-manifest.json`. La huella se
calcula concatenando, por ruta relativa ordinal, UTF-8:
`ruta NUL tamaño NUL sha256 LF`. Comprende también `_worker.js`; no es la huella
de un ZIP ni la que Cloudflare asignará después al deployment.

Runner: `build/qa-full-app-F/runner-package`, con SDK Playwright-core 1.65.0
incluido, autenticación de sesión original (solo normalización LF) y cinco
módulos de pruebas. Su inventario y huella figuran en runner-manifest.json y
publish-proposal.json. No contiene secretos. No se ha copiado al montaje activo.

Se reutilizan las imágenes, redes, montajes y restricciones aprobadas en E1.
El futuro staging solo añade `/work/qa-f` al bind existente de solo lectura;
no agrega perfiles, sockets Docker, puertos o credenciales de administración.

## SQL adicional propuesto

La instantánea de esquema de D omitió la semilla operativa `notification_cursor`
para la clave `queues`; el preflight remoto confirma cero filas para esa clave.
El handler de tareas la necesita. `prerequisite.sql` propone insertar **una fila**
si falta, después de comprobar el guard QA; no modifica esquema ni sobrescribe
progreso. El INSERT también está condicionado al guard por si un ejecutor
continuase después de un error. Pruebas locales cubren idempotencia y guard ajeno.

SHA-256 SQL:
`fbddccd91421a87b055f39e63054797dce9825fc680db323fafbfc836e00567d`.
Destino exacto: hampton-app-qa / 53bc4af9-7250-44fe-8f90-6e415fda1034.
**No se ha ejecutado remotamente**. Requiere sí escrito específico, además del
permiso para publicar y probar F. Si el resultado queda incierto, leer el estado
remoto antes de plantear un reintento.

## Evidencia y alcance real

- Artefacto local: **71 comprobaciones API y 66 UI pasan**, con SQLite/R2 efímeros
  y Chrome de perfil nuevo, a 1280 y 390 píxeles. Cero peticiones publicadas y
  cero valores de credenciales QA leídos. Se sirve el árbol exacto mediante un
  adaptador ASSETS local: el router ASSETS nativo de Pages queda para F publicado.
- Lectura remota: destinos D1 distintos, testigo y único administrador ficticio;
  Production QA con DB/MEDIA correctos y solo SESSION_SECRET; Preview vacío;
  R2 sin acceso público; ocho peticiones anónimas/identidad inválida devuelven 403.
- Access efectivo: `access-readback.json` documenta la lectura de ambos destinos
  y su única política Service Auth para hampton-app-qa-runner. Sin modificaciones.
- Aislamiento E1: 22/22 controles y selftest del proxy ya pasaron en el paso
  autorizado anterior. Antes de entregar identidad, el launcher vuelve a validar
  configuración y archivos efectivos; no presupone que el estado siga igual.
- Revisión independiente: `review.md`; comprobaciones focales adicionales se
  documentan en `preparation-evidence.json`.

Las 33 rutas de interfaz incluyen la web pública y los módulos de administración.
API comprueba lecturas por módulo, controles de sesión/CSRF, y CRUD representativo
de propiedad, History, medios y usuario temporal. Limpia solo entidades cuya
propiedad del run se comprueba de nuevo, usando endpoints normales. Conserva
auditoría/tombstones, correo ficticio y filas operativas de mantenimiento. Ante
propiedad incierta deja los datos y comunica fallo; no hace reset general.

Google/OAuth permanece deshabilitado; Drive, correo y anti-spam se simulan sin
credenciales de proveedor. Drive inicial verifica descriptores, no importación
completa por UI. Hermes no se ejecuta en este smoke inicial. La invocación del
handler de tareas no prueba el éxito de cada subproceso, porque el código original
captura algunos errores internos. La rama de catálogo grande no queda cubierta.
La disponibilidad del entorno permitirá añadir casos después; este smoke no
acredita todos los workflows posibles ni integraciones reales.

No se ejecutó chequeo empresarial de filas, smoke autenticado publicado ni suite
completa npm test en F. Los fallos conocidos del control protegido de git push
no se presentan como corregidos.

## Secuencia futura, solo con autorización exacta

1. Verificar hash de publish-proposal.json, inventarios, SHA local/remoto y
   preflight vivo de cuenta/destinos/Access/bindings. Detenerse si algo difiere.
2. Con el permiso SQL separado, ejecutar únicamente prerequisite.sql mediante
   APP_QA_DB del import-wrangler.toml ya revisado; verificar guard y la fila.
3. Publicar **solo** artifact al proyecto hamptonjersey-qa, branch main,
   commit-hash fuente y `--no-bundle`, con Wrangler fijado 4.148.0 desde un cwd
   limpio. No ejecutar el deploy/build empresarial, migraciones o git push.
4. Verificar deployment/alias QA, Production/Preview efectivos y denegación
   anónima en raíz/nuevo hostname. No cambiar Access para conseguir un verde.
5. Ejecutar runner_host.py prepare y execute con la huella de propuesta aprobada.
   Valida inventarios y E1, ACL privadas, exclusión mutua e identidad fija. Solo
   después lee los tres archivos QA privados y entrega JSON por stdin; nunca
   por argumentos, variables, perfil o montaje. El runner guarda temporalmente
   en tmpfs 0600, firma la sesión y elimina solo su archivo propio al finalizar.
6. Verificar build_id antes de mutar; ejecutar smoke, guardar únicamente conteos,
   nombres de casos, IDs ficticios propios y limpieza en results; no screenshots,
   traces, storageState, cabeceras, cookies o valores de secretos. Detener ante
   cualquier divergencia; leer remoto antes de reintentar operaciones inciertas.

Si hay timeout o falta un resultado estructurado que confirme la retirada de
credenciales, el launcher detiene **solo el ID sellado del runner dedicado**,
verifica que esté parado y conserva `.qa-f-in-flight`. No detiene el proxy ni
recrea contenedores; no reintenta pruebas o borra el bloqueo automáticamente.
Esta parada de contingencia forma parte del alcance F que se solicita autorizar.

La propuesta vincula fuente, artefacto, runner, SQL y controles de ejecución.
Todavía no existe autorización F ni deployment de la aplicación.
