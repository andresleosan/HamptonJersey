# PUB-08 · Integración y activación · 14-nov-2026

Base publicada comprobada al iniciar: `981cc203def4b3545a2235c15ac3ad468e349a37`. Tablero: **68/215 tareas aplicables (31,63 %)**. Este registro separa la evidencia local de la comprobación efectiva de producción; el cierre se acredita al final.

## Criterios y alcance vigentes

- Se conservan título, resumen, descripción, fotos, portada, orden, pies y tipos, así como destacadas y orden de portada ya integrados.
- El catálogo manual cerrado versión 1 contiene `renovated`, `sea_view` y `town_centre`. No se atribuye a una IA la confirmación de estos datos. No existe una decisión pendiente que impida usar esta versión; nuevas etiquetas requieren una ampliación explícita de su contrato. No se inventa una taxonomía adicional para cerrar la tarea.
- El vídeo independiente conserva el tour existente y se restringe a Vimeo/YouTube con URLs válidas. Ningún reproductor se solicita antes del clic del visitante; Vimeo usa `dnt=1`. Los campos sociales están fuera del alcance vigente.
- Guardado completo con CAS, actor vigente, validación de servidor, invalidación de revisión de dirección, borrador recuperable y descarte. Historial mínimo sin contenido privado.

## Verificación integrada local

`tests/pub08-integrated.e2e.cjs` usa dos sesiones de personal ficticias, rutas reales, D1 y R2 de Miniflare. Crea una ficha ficticia y sube/publica imágenes sintéticas; no intercepta la API de la aplicación ni las imágenes. El fixture R2 adicional se limita al script exacto y exige modo local aislado; no accede a producción.

Pasó con `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pub08-integrated.e2e.cjs npm run test:e2e:isolated`, tanto Chromium como `HAMPTON_E2E_BROWSER=webkit`, en contenedor temporal sin red ni capacidades. Capturas locales: Chromium `run-SLMb6r`, WebKit `run-UM2laN`, bajo `/tmp/hampton-browser-captures/`.

Comprueba URLs inválidas 400 sin cambios, guardado correcto, conflicto real 409 con borrador conservado, descarte/recarga desde D1, proyección pública, foto servida y decodificada desde R2, separación de vídeo/tour, ausencia de carga externa previa al clic y recuperación del aviso offline. Escritorio 1280 y móvil 390, teclado y foco. Zoom CSS 200 % en editor; zoom nativo 200 % en vista pública WebKit; viewport efectivo de 640 en Chromium para reflujo. La conexión del contenedor permanece cerrada: solo el documento del reproductor externo se intercepta.

Las excepciones exactas de fuentes offline, bootstrap Google no resoluble del fixture y ResizeObserver WebKit se cuentan por separado; no se ocultan errores de la aplicación. La prueba usa cookies de sesión firmadas del fixture: no acredita el inicio de sesión Firebase real, una cuenta del proveedor de vídeo ni escrituras de prueba en producción. La revisión independiente final de los tres archivos no encontró hallazgos pendientes.

Suite conjunta final: **2.308/2.308 JavaScript y 29/29 Python**, build, `check:release`, `team:check`, `check:packages`, generador canónico y `git diff --check` correctos. La primera pasada detectó ocho fixtures PUB-10 que excedían su baseline declarado hasta 0051; se corrigió exclusivamente su base y una regresión nueva prueba el rechazo de 0052 con rollback íntegro. Los 15 casos focales PUB-10 pasaron. Su propuesta sigue necesitando reconciliación antes de ejecutarse en una base posterior.

## Esquema de producción

Luis autorizó expresamente solo 0048 en D1 `hampton` y `PUB08_CONTENT_READY=1`. Se verificaron base/SHA remotos, hash de 0048, binding DB y recuperación Time Travel privada. Se aplicó exclusivamente 0048 desde un directorio que contenía una única migración, con salida 0. Las lecturas posteriores confirmaron tabla, dos validadores, registro de migración y **cero filas** nuevas; no se poblaron fichas reales. La comprobación local desde baseline hasta 0042 también preservó datos previos, validadores y claves foráneas.

0052 y el gate de economía permanecen pendientes. Su integración local preparada no se cuenta como cierre de PUB-06 ni SPR-01.

## Publicación y cierre

Pendiente al preparar este commit: SHA remoto, despliegue Pages, variable efectiva de producción y aumento del tablero. Hasta que se acrediten, PUB-08 permanece parcial.
