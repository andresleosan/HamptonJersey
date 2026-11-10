# QA publicado · uso por agentes

Estado verificado: SQL adicional aplicado una vez, aplicación publicada y smoke
autenticado desde el runner aislado. Último pase: 71/71 API y 66/66 UI. El primer
pase tuvo tres fallos de escritorio no reproducidos en una repetición completa;
ambos informes se conservan en published-smoke-report.json. Su causa no está
establecida. No se modificó producción ni se hizo push.

| Recurso | Destino |
|---|---|
| Pages QA | hamptonjersey-qa / https://hamptonjersey-qa.pages.dev |
| Deployment | 28800bf7-eb1c-48ab-8e03-d8ee03ba57fb |
| Fuente | 80ad03df7e095750f455aa4aa668573e9aac5db4 |
| D1 | hampton-app-qa / 53bc4af9-7250-44fe-8f90-6e415fda1034 |
| R2 privado | hampton-app-qa-media |
| Usuario técnico | qa-agent@example.test |
| Contenedor | hampton-app-qa-runner, Docker desktop-linux, E1 existente |

La identidad técnica funciona dentro de QA. La aplicación solo posee admins;
ese usuario no es administrador de Cloudflare, Google ni del negocio. No usar
una sesión del dueño. Una visita normal al sitio sin identidad Access debe ser
rechazada: los agentes acceden a través del runner, no mediante claves copiadas
al navegador del dueño.

## Ejecutar el paquete revisado

Solo dentro del alcance QA autorizado de la tarea. Leer primero los manifiestos
F y F1 y verificar el estado vivo. Desde la raíz E:/Proyectos/HamptonJersey:

```powershell
$qaRunId = 'run-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,10)
python docs/qa/full-app/runner-correction-f1/host.py execute --approved-correction-sha256 cf8774c6c21f2d6c789c28da989704a78e030a2bfe18c2cbb84c007098ff5a9b --run-id $qaRunId
```

El launcher verifica el F original, F1, archivos, árbol del artefacto, paquete
montado, runtime E1, identidad de la carpeta privada y ACL efectivas del dueño.
Solo después entrega los valores QA por stdin. Los nombres/valores de secretos
no se imprimen ni se trasladan a argumentos, variables, Git o capturas.

No repetir prepare: el paquete ya está en el montaje de solo lectura /work/qa-f.
No reimportar setup.sql, prerequisite.sql, ni desplegar otra vez para correr el
smoke. Si los hashes, el deployment/build_id, los recursos o el aislamiento
difieren, detenerse y preparar la corrección concreta antes de actuar. Conservar
los manifiestos sellados y sus snapshots; registrar nuevos estados por separado.

El informe saneado aparece en test-results/qa-agent-runtime/results con el runId.
Comprobar passed, credentials_removed, controles de red y limpieza; no interpretar
solo el código del proceso host como prueba. Si queda .qa-f-in-flight, el resultado
es incierto: inspeccionar primero, no borrarlo ni reintentar automáticamente. El
launcher conserva la parada verificada del ID del runner; no recrea contenedores.

## Alcance y datos

Se recorren rutas públicas y módulos del panel en escritorio/móvil y se hace CRUD
representativo de propiedad, medios y usuario temporal, con History y conflicto
de versión. La limpieza verifica propiedad del run antes de borrar mediante API.
La lectura remota final confirmó cero entidades activas de ambos runs y preservó
el usuario base. Se conservan auditoría, tombstones, correo ficticio y resultados
de mantenimiento por diseño; no hacer reset general.

Google/OAuth está deshabilitado. Drive, correo y anti-spam son simulados; Hermes
no forma parte del smoke inicial. La invocación del handler de jobs no acredita
todos sus subprocesos. Las pruebas no agotan todos los workflows. Preview sigue
sin D1, R2 ni secretos; Access protege raíz y wildcard de todos los despliegues.

Cualquier nuevo SQL, configuración de Access/secretos, artefacto/despliegue o push
mantiene el requisito del dueño de sí escrito para la operación y destino exactos.
