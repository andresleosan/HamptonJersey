# SPR-02 A · validación local h1

9-nov-2026. Base `main 2084cb9ea895b729f8a28e3f2c42ce2057641389`. Construcción local sin integración ni publicación. La primera revisión detectó tres P2, corregidos con RED/GREEN; la segunda revisión GPT independiente no encontró P0/P1/P2 nuevos de producto. Hermes actualizó documentación global localmente; integración y aprobación posterior de un SHA exacto siguen pendientes. B/C siguen pendientes; A no completa SPR-02.

## Resultado de producto

GET administrativo `/api/admin/listings/:id/history` con no-store, listado permitido sin snapshots, PII de clientes, URLs ni dependencia R2. Techo global `MAX(id)` fijado por PK en la misma lectura SQL; filas siempre filtradas por ficha, páginas de50, continuación por `(at,id)`, cursor validado y evidencias en una consulta para los50 IDs mostrados. Claves heredadas no representables usan ancla PK acotada a la ficha/ventana. Sin nueva migración, escritores o cambios a retención/productores.

History es una sección del editor, con refresco independiente, carga/error/vacío, reintento del cursor fallido, detalles nativos y fechas/edad en Jersey. Fecha no canónica/imposible: «Date unavailable», sin edad ficticia ni time inválido. Guardados efectivos invalidan su lectura sin recargar el formulario; conserva borrador y fotos. Un404 de detalle permite comprobar el tombstone y mostrar solo ID/History/back; la transición viva→deleted en el mismo editor limpia borrador, registro de fotos y aviso global. Otros errores conservan su tratamiento. Las referencias son registros, no descargas ni afirmaciones de verificación, llamada o purga.

## Evidencia ejecutada

Logs externos: `/home/taller/encargos/`. Capturas sintéticas previas: `/home/taller/encargos/capturas/spr-02-h1-history/`; continuación P2: `/home/taller/encargos/capturas/spr-02-h1-history-p2/`.

| Comprobación | Resultado real |
| --- | --- |
| RED servidor | `spr-02-history-server-red.log`: ruta ausente devolvió404; helper aún no existía. |
| GREEN servidor | `spr-02-history-server-green.log`:8/8. |
| RED/GREEN proyección | `spr-02-history-projection-{red,green}.log`: falta de enum derivado, después9/9. |
| Servidor final tras P2 | `spr-02-p2-server-final.log`:12/12, incluye cursor heredado/acotado, coste VM, CAS concurrente, replay y dos confirmaciones legítimas. |
| Regresión productores/retención tras P2 | `spr-02-p2-regressions-final-2.log`:61/61. |
| RED navegador | `spr-02-history-e2e-red.log`: botón History ausente. |
| Focal final tras P2 | `spr-02-p2-ui-final-green.log`: exit0;1280/390, flujo anterior completo con error/retry, foco, DST y CSS zoom200%, más53 fechas heredadas/imposibles sin edad falsa y Reload de misma ficha con campos/fotos sucios, borrado externo por API, beforeunload no cancelado y salida sin diálogo. |
| `npm test` final tras P2 | `spr-02-p2-final-test-2.log`: exit1;1023 Node,998 PASS,25 FAIL. Comparación de nombres: los mismos25 de `tests/check-avanzar.test.js` que baseline; su fixture intenta git push y el wrapper lo prohíbe sin aprobación. No se modifican ni tests de control ni wrapper. |
| Python separado tras P2 | `spr-02-p2-final-python.log`:14/14 PASS, exit0. Se ejecuta expresamente porque el `&&` de npm no lo alcanza tras los fallos basales. |
| `npm run build` tras P2 | `spr-02-p2-final-build.log`: exit0. Warning de chunk>500kB ya basal. |
| `npm run check:release` tras P2 | `spr-02-p2-final-release.log`: exit0. |
| e2e general | `spr-02-history-e2e-general.log`: iniciado con fixture nueva; detenido con SIGINT (exit130) al detectar que `tests/e2e.cjs:1072` hace `server.listen(8799,ok)` sin host, incompatible con no abrir puertos a internet. No se observó8799 escuchando en las comprobaciones `/proc/net/tcp{,6}` durante la ejecución ni al detener; no hubo monitorización continua. No se modifica ese archivo fuera de alcance ni se introduce un wrapper. General completo pendiente. |
| Fases generales seguras, anteriores a P2 | `spr-02-history-e2e-safe-general.log`: exit0, `e2e OK (public, urls, reg17)`, con fixture nueva. No repetidas en esta corrección; no incluye la fase admin/fake Drive pendiente. |

Las corridas focales intermedias fallaron por fixture: R003 era sold y guardar precio confirma disponibilidad; después se corrigió el selector del details que contiene la evidencia (no es siempre el primer evento). Se preservan logs `spr-02-history-e2e-green{,-2,-3}.log`; no se cuentan como PASS.

MCP detectó una pérdida real de foco al desaparecer Retry en la última página. `spr-02-history-focus-red.log` exit1 demuestra la aserción fallida de foco en el evento51. El componente ahora conserva el foco tras éxito/error de una acción explícita, salvo que el usuario lo haya movido a otro control; las cargas automáticas no lo cambian. `spr-02-history-focus-green.log` pasa las aserciones para eventos51 y101 en ambas anchuras.

## Matriz A01–A09

| Criterio | Prueba local y límite |
| --- | --- |
| A01 |401 sin cookie,200/no-store,404 desconocido y200 tombstone mínimo. Sin prueba remota. |
| A02 | Precio real antes/después, libres solo etiqueta, null/0/false distintos, actor/revisión/origen, tipos/datos heredados seguros, mock aislado para JSON roto. Sin snapshots/URLs/PII de clientes en respuesta/DOM; texto React. |
| A03 |120 eventos50/50/20, misma fecha, inserciones nuevas iguales/atrasadas excluidas hasta Refresh. Cursor de estructura/versión/ficha/tipos/límites inválidos o ancla ajena rechazado. Fechas heredadas no se rechazan por no ser ISO; texto parametrizado0–128 ASCII imprimible o null para ancla PK de misma ficha/ventana. Unicode/texto largo/controles continúan con cursor≤512. Coste inicial medido por VM y máximo global PK. |
| A04 | deleteListing fixture con fallo R2 después de commit conserva hechos/referencias y tombstone. No prueba automatización EST-19. |
| A05 | Retención real de persona/visita en fixture no recupera datos ni borra eventos de listing; foreign_key_check vacío. |
| A06 | Refrescar/reintentar/paginar conserva título y caption sin guardar; guardar muestra evento. MCP previo retuvo respuesta vieja durante guardado y cambio de ficha; no contaminó la vigente. Fallo de fotos conserva evento/caption. Nuevo MCP: misma ficha viva→deleted limpia borrador/fotos y aviso global, salida sin diálogo a ambas anchuras. |
| A07 | Fechas UTC canónicas válidas con Europe/Jersey; otras muestran «Date unavailable» sin time/edad.30-febrero y texto numérico no se normalizan a fechas inventadas. Evidencia declara fecha distinta de registro. DST de29-mar:01:30Z se muestra02:30. No inferir llamada/purga/verified. |
| A08 | Focal1280/390 con navegación Enter al H2, details/summary, foco visible, ausencia de overflow y CSS zoom2. Zoom nativo y MCP se distinguen abajo. |
| A09 | Dos lecturas no cambian listings/events/notifications/recibos. CAS concurrente: un éxito y un409, un solo evento; identidad repetida: un evento; dos confirmaciones legítimas: dos. |

## Rendimiento y diseño

P2-2 rectifica la conclusión previa: un plan que menciona `events_entity` no demuestra un máximo acotado. Sobre10000 eventos propios y10000 ajenos, la consulta real de primera página daba52.149 instrucciones VM y recorría10000 filas para el máximo filtrado. Ahora usa MAX(id) global:2149 instrucciones para el statement completo de51 filas, con VDBE `Last`→`Rowid`→`AggStep`→`Goto` que salta `Prev` en la subrutina del máximo. Se reproduce la consulta emitida sobre la **fixture exacta serializada** en Python SQLite3.40.1 con progress_handler; el VDBE se obtiene también del binding Node real. RED `spr-02-p2-2-cost-red.log`; GREEN y medición final `spr-02-p2-server-final.log`. En esta última corrida:50 ítems,9416 bytes,2.87ms para helper/consulta Node y2.37ms para la consulta reproducida con contador. Muestras locales, no presupuesto ni latencia de producción. La página sigue usando `events_entity`, las referencias `listing_marketing_listing`; no migración, scan global de payloads, OFFSET, COUNT, N+1 o R2. Una continuación con clave larga/no ASCII/con controles añade una sola consulta PK del ancla.

El techo global aparece solo como entero en un cursor admin/no-store; puede revelar un techo de actividad, no un recuento ni contenido/identidad ajenos. Tests comprueban que el techo incluye el último ID ajeno pero la respuesta no proyecta esa entidad, y que un ancla de otra ficha falla. Contrato/privacidad actualizados en spec y plan; no cambios a roles o permisos.

Bundle observado por Hermes antes: JS757.37kB/gzip213.41; CSS50.51kB/gzip10.64. Build local tras P2: JS764.69kB/gzip215.65; CSS51.63kB/gzip10.80. Delta JS7.32kB/gzip2.24; CSS1.12kB/gzip0.16. Sin fuentes/librerías nuevas. No hay navegación basal comparable medida ni presupuesto de rendimiento declarado cumplido.

Bath Street Gallery claro, Tenor/Montserrat y tokens reales heredados; lista plana dentro de la card existente. Espacios12/8/16 separan hechos y diferencias; bronce solo en interacción. Diales ENERGY1/RHYTHM1/MOTION1. Sin activos, métricas, iconos o animaciones de relleno. Contrastes calculados sobre blanco: ink18.26:1, stone5.70:1, bronze-dk6.33:1, error7.54:1, foco bronze4.40:1 (uso no textual). Botones/summary min44px móvil y32px escritorio; foco2px/offset2; ol/time/details/status/alert nativos. Ningún nuevo campo, sombra, blur o z-index.

## Pendientes de validación y entrega

Reproducciones de la revisión, ejecutadas antes de corregir cada corte:

- P2-1: `spr-02-p2-1-server-red.log`,400 en la segunda página de51 filas `legacy-date`; `spr-02-p2-1-ui-red.log`,0 fallbacks de fecha frente a50. GREEN servidor/UI en `spr-02-p2-1-{server,ui}-green.log`. Límites: `spr-02-p2-1-legacy-boundary-red.log` reproduce500 con Unicode por btoa, y `...-green.log` pasa con ancla PK para Unicode/300 caracteres/controles. `spr-02-p2-1-date-normalization-red.log` reproduce51 fallbacks frente a53 por30-febrero/texto numérico normalizados por Date.parse; final canónico en `spr-02-p2-ui-final-green.log`.
- P2-2: coste52.149 VM en `spr-02-p2-2-cost-red.log`;2149 tras el cambio en `...-green.log` y `spr-02-p2-server-final.log`. La mención anterior de un índice no acreditaba el coste; conclusión rectificada arriba.
- P2-3: `spr-02-p2-3-ui-red.log` reproduce `beforeunload.defaultPrevented=true` después de Reload confirmado deleted en la misma ficha, con campos y caption sucios. GREEN en `...-green.log` y focal final: guarda global falso, sin actionbar/form/borrador y Back to listings sin diálogo. No usa remount de App ni page.reload para ocultar el fallo.

MCP **posterior a P2**: `spr-02-p2-mcp-results.json` externo.1280/390,104 eventos heredados por ficha (51 ASCII,51 Unicode,fecha imposible y texto numérico),50/50/4 sin duplicar ni inventar fechas/edad. Cursores107/108 caracteres con ancla null y no-store. En cada anchura, campos y caption sucios verifican guardia activa; borrado externo real por API y Reload sin cambiar hash/ID dejan guardia inactiva, sin editor/actionbar/borrador, con0 diálogos al salir. Sin pageerror ni overflow. Capturas `spr-02-h1-history-p2/mcp-legacy-{1280,390}.png` y `mcp-reload-deleted-{1280,390}.png`. Consola/red de esa carpeta revisadas:409 inyectado para mostrar Reload,404 real de tombstone/fotos ausentes de fixture y DNS de Google Fonts; no se ocultan como consola limpia. No se cambia infraestructura ni se acredita descarga de fuentes.

El recorrido siguiente es **anterior a P2**, conservado como evidencia histórica: MCP en1280/390 sobre fixture local con error500 inicial y de continuación, Retry, vacío, precio/description, details por teclado,50/54 eventos, Refresh, borrador/fotos, respuesta vieja durante guardado y cambio de ficha, referencias sin snapshot, fechas DST de primavera/otoño, tombstone real de fixture sin editor/actionbar y401 con modal de sesión y borrador conservado. Resultados externos `spr-02-history-mcp-final-results.json` y `spr-02-history-mcp-final-states.json`. Ningún pageerror. Foco final en evento51: desktop y402–424 entre header54.5/actionbar791; móvil y471–492 entre header191/actionbar678. Capturas `mcp-final-{1280,390}.png` y `mcp-deleted-390.png`.

Consola/red revisadas: `capturas/spr-02-h1-history/mcp-{console,network}.log`. Los500/401 son fallos inyectados;404 de detalle es tombstone y404 de fotos son objetos ausentes de la fixture. Google Fonts produjo DNS `ERR_NAME_NOT_RESOLVED` en MCP: familias CSS y fallbacks comprobados, carga remota de las fuentes no acreditada allí. No se cambia red o infraestructura. La repetición MCP necesitó usar localhost para enviar su cookie Secure de prueba y retirar explícitamente los handlers de fallos; los primeros intentos fallidos de arnés no se cuentan como PASS. El primer arnés temporal terminó antes de mantener el servidor vivo; se corrigió fuera del repo.

En contexto aislado, Ctrl+Equal no cambió innerWidth/devicePixelRatio; `chrome://settings/appearance` fue rechazado por el proveedor por no admitir esa página en contexto aislado. No se cambia sandbox/root/infra ni se atribuye zoom nativo200% a CSS zoom2. Zoom nativo200% sigue pendiente. El recorrido previo midió CLS0.094298 y ninguna longtask; muestra local única, sin comparación basal ni afirmación de producción.

Gate antislop DURING, limitado a la superficie local comprobada:

- Hard gate: PASS local en focal y MCP, controles reales, vacío/carga/error, texto sin HTML ni contenido privado, reflow y teclado. Zoom nativo y carga remota de fuentes quedan expresamente sin acreditar.
- Purpose gate: PASS, lista plana para secuencia, card/paleta/tipos heredados para pertenencia al editor, bronce funcional y ninguna decoración/activo nuevo.
- Liveliness: PASS, ENERGY1/RHYTHM1/MOTION1, jerarquía de hechos y espacios estructurales, motivo Tenor/Montserrat declarado en CSS.
- Craft: PASS funcional local, botones y details recorridos, foco corregido con RED/GREEN y comprobado sin quedar bajo las barras; sin cifras, testimonios o promesas inventadas. No es aprobación de publicación ni sustituye la revisión independiente.

MCP cerrado y runner temporal detenido con SIGINT después del recorrido; fixture eliminada por el runner. No quedan procesos de e2e propios ni listener8799 al comprobar el cierre.

Segunda revisión GPT independiente, posterior a P2: **sin P0/P1/P2 nuevos de producto**. Ejecutó49 pruebas focales/regresión y una prueba en memoria de161 eventos con fechas mixtas, cuatro páginas sin pérdidas/duplicados y sin incluir inserción tardía. El test de coste vio2149 pasos VM de la consulta completa sobre20000 eventos y acceso Last al máximo global; no se atribuye todo ese coste solo a MAX(id). Verificó administración, no-store, SQL parametrizado, proyección limitada y limpieza del borrador al tombstone. La suite completa registrada por Hermes quedó en998/1023 Node con los mismos25 fallos del fixture git push, Python14/14; build, release y e2e focal pasan. No se repitió el e2e general admin (fake Drive sin host) ni se acreditó zoom nativo200%.

Hermes actualizó localmente ESTADO, tarea SPR-02, checklist/catálogo derivados, spec/plan/ledger y aclaró las dos instrucciones locales autorizadas para etiquetar el protocolo remoto como histórico. `work-units.json` permanece idéntico. El P1 de exclusión **entre talleres** no impide commit local revisado, pero requiere turno acordado antes de integrar/publicar; el candado h1 no protege h2. No se afirma turno exclusivo ni permiso para publicar. Activación, esquema0034 en destino, despliegue y smoke autenticado quedan fuera. Sin push, nueva migración o operaciones de coordinador; no se modificaron controles del VPS, credenciales, roles, servicios ni permisos.
