# Pruebas de Hampton con WebKit aislado

El lanzador `scripts/test-e2e-isolated.sh` y el adaptador `tests/isolated-webkit.cjs` están versionados en `main` del repositorio HamptonJersey. Una copia anterior del proyecto puede no contenerlos: trabajar desde una copia actualizada de `main`, conservando cualquier cambio local. La referencia usada para esta guía es `e425911ceab89102d52e2748c3f20275830dfe5e`.

## Requisitos

- Bash, Git, Node.js y npm; las dependencias del proyecto instaladas en `node_modules` dentro de la copia de trabajo. El proyecto y su archivo de dependencias determinan las versiones; aquí se usó Node 24.
- Docker disponible para el usuario que ejecuta la prueba. La imagen fijada por contenido en el lanzador debe existir localmente: el comando usa `--pull=never` y no la descarga. Comprobarla con `docker image inspect` y el identificador que aparece en el propio script. Si falta, obtener la imagen por el procedimiento autorizado para el entorno; no sustituir el identificador sin revisión.
- Playwright Core instalado y un WebKit de la **misma revisión** que la indicada en su `browsers.json`. El lanzador busca el ejecutable `playwright`; también acepta `HAMPTON_PLAYWRIGHT_CORE=/ruta/a/playwright-core`. Busca WebKit en la caché de Playwright del usuario; `HAMPTON_WEBKIT_DIR` permite indicar el directorio de esa revisión. El script comprueba ambos antes de crear el contenedor.
- El test indicado debe existir en `tests/`, llevar el sufijo `.cjs` y estar rastreado por Git o añadido al índice. El lanzador empaqueta los archivos rastreados según el contenido actual de la copia; los archivos nuevos que no estén en el índice no se incluyen.

Para comprobar la imagen fijada en la versión examinada:

```bash
docker image inspect sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
```

Si el proyecto cambia el identificador, prevalece el que esté escrito en el lanzador de la revisión usada.

## Ejecutar pruebas locales

Desde la raíz de la copia actualizada:

```bash
E2E_PRODUCTION_READONLY=0 npm run test:e2e:isolated
```

Para un recorrido concreto, por ejemplo PUB-04:

```bash
E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/listing-address.e2e.cjs npm run test:e2e:isolated
```

Para seleccionar fases de la suite general:

```bash
E2E_PRODUCTION_READONLY=0 E2E_PHASES=public,urls,admin,reg17 npm run test:e2e:isolated
```

La asignación explícita de `E2E_PRODUCTION_READONLY=0` evita heredar accidentalmente el modo de producción. `E2E_PHASES` afecta a la suite general si el test seleccionado lo admite. El script indica el resultado mediante su código de salida. No considerar un recorrido aprobado si se interrumpe o falla.

El lanzador crea un contenedor temporal con red deshabilitada, sistema de archivos raíz de solo lectura, usuario sin privilegios, capacidades eliminadas, `no-new-privileges`, límites de recursos y directorios temporales en memoria. Por defecto, el adaptador ejecuta Chromium sin su sandbox propio solo dentro del contenedor local sin red. Para WebKit, usa `HAMPTON_E2E_BROWSER=webkit`; este solicita `WEBKIT_FORCE_SANDBOX=1` y usa Xvfb. El modo de producción exige WebKit. No configura un perfil seccomp propio; rige la política Docker del entorno. La ejecución satisfactoria acredita que ese conjunto pudo ejecutar la prueba; no constituye por sí sola una auditoría independiente del sandbox interno de WebKit.

El runner genera una base D1 local nueva y credenciales de prueba efímeras. Emula Turnstile y portapapeles cuando corresponde, usa HTTPS local con certificado de prueba y no carga fuentes externas. No usa una base de producción para el fixture. Los archivos temporales y el contenedor se eliminan al terminar, sujetos a la comprobación de identidad del propio lanzador. Las capturas, si el test las produce, se conservan bajo `/tmp/hampton-browser-captures` o el directorio indicado por `E2E_ARTIFACT_DIR`: tratarlas como artefactos de prueba y no incluirlas en Git.

## Comprobación pública anónima

```bash
npm run test:production:readonly
```

Este modo es diferente: usa red Docker `bridge` y el test limita las peticiones del navegador a GET/HEAD y a un origen y rutas explícitamente permitidos; no envía formularios ni usa una sesión guardada. La política de interceptación del test no es un cortafuegos general. Su alcance depende de `tests/production-readonly-e2e.cjs`: no demuestra que pasen los recorridos autenticados ni todos los flujos de producción.

## Límites conocidos

- La ejecución local valida WebKit y el fixture; no acredita Chromium, servicios externos, Turnstile real, fuentes remotas ni comportamiento autenticado en producción.
- Chromium en los fixtures locales se ejecuta sin su sandbox propio por decisión de Luis; únicamente dentro del contenedor descrito, nunca en el host ni en el modo de producción. Conserva `no-new-privileges` y los demás controles del contenedor.
- La suite general no verifica exhaustivamente fallos de red, accesibilidad ni todos los tamaños y estados. Añadir pruebas focales cuando el cambio lo requiera. Zoom CSS no es equivalente a zoom nativo; registrar la técnica y cualquier desbordamiento observado.
- Los tests deben usar datos sintéticos. No imprimir credenciales, copiar archivos privados al repositorio ni versionar capturas, bases, registros o directorios temporales.

## Problemas frecuentes

| Síntoma | Qué comprobar |
| --- | --- |
| No se encuentra Playwright Core | Que `playwright` esté en el `PATH` o que `HAMPTON_PLAYWRIGHT_CORE` apunte al directorio correcto. |
| Falta la revisión de WebKit | Comparar la revisión de `browsers.json` con la caché e indicar `HAMPTON_WEBKIT_DIR` cuando corresponda. |
| Falta la imagen fijada | Comprobar la imagen y el acceso al daemon Docker; el lanzador no descarga imágenes. |
| El test nuevo no aparece | Debe estar rastreado o añadido al índice de la copia desde la que se ejecuta. |
| Chrome no inicia | Revisar el contenedor local; se puede seleccionar WebKit con `HAMPTON_E2E_BROWSER=webkit`. No ejecutar Chromium sin sandbox en el host. |
| Un test del contenedor falla por conexión externa | Revisar si necesita una respuesta simulada; la prueba local funciona deliberadamente sin red. No convertir el fallo en un aprobado. |
