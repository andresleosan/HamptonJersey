# Hermes independientes y listas: comprobaciones

8-nov-2026. Base main limpia y remota `f85f247c505e177b0ffd3ab06be49163a682e314` comprobada y publicada. Luis autorizó separar ambos Hermes y trabajar simultáneamente; después eligió los nombres Lista 1–4, independientes de herramientas, y el flujo Hermes → OpenCode → DeepSeek. Este ledger separa las pruebas de cada etapa de su publicación y activación. El nuevo SHA todavía requiere revisión y aprobación de publicación.

## Primera etapa: separación y capacidad

La primera implementación dio capacidad dos a la columna que entonces se llamaba Hermes; las demás mantenían uno. Esa distribución fue sustituida por la decisión posterior de capacidad dos en todas las listas. Los resultados siguientes corresponden a esa primera etapa y no acreditan por sí solos la entrega final:

- Capacidad validada entre 1 y 2; omitirla conserva uno. Una sola reserva por actor/sesión/checkout. Pausa y caducidad mantienen plaza y recursos; reducir capacidad por debajo de ocupación se rechaza antes de mutar.
- Capacidad y etiqueta no cambian el contrato de unidades ni invalidan evidencia de diseño. El relevo excluye solo su reserva de origen; dependencias, recursos y turno global se conservan.
- Identificador de actor del CLI alineado con el servidor. Los nombres `hermes-1`/`hermes-2` ya eran válidos; la ampliación cubre también `@` y `/`, con validación separada de sesión/checkout/host.
- `npm test`: 870 Node + 14 Python, todos pasan. `npm run build` y `npm run check:release` correctos.
- Suite focalizada: 117/117, incluidas diez pruebas nuevas sobre SQLite real de carreras, conflictos, recuperación y publicación única.
- DOM: dos reservas con nombres/sesiones distintos, ocupación 2/2, pausa/falta de contacto, filtros/foco y cuatro columnas con 250 tarjetas. `team:check` y `team:build` dry-run correctos.
- Revisión independiente favorable, sin hallazgos bloqueantes. Seis ejercicios adicionales en memoria comprobaron colisiones de sesión/checkout, dependencias, turno único, atomicidad y la capacidad de esa etapa.
- Navegador nativo pendiente: el arranque estuvo bloqueado por sandbox/root. No se desactivan protecciones. DOM no acredita revisión visual a 1280/390.

## Servicio y talleres comprobados

El origen temporal de workers.dev quedó autorizado y protegido con Access: consulta anónima 403 e identidad VPS 200. Hay cinco identidades de servicio exclusivas, con credenciales fuera del repositorio; no se trasladan valores a este ledger. El catálogo canónico publicado `f85f247c505e177b0ffd3ab06be49163a682e314` está importado, con 250 tareas, cuatro columnas y revisión 1.

Luis confirmó ambos bots inactivos y autorizó continuar la separación. Hermes 2 usa taller propio, home Docker distinto y configuración administrada propia. Hermes 1 conserva su contenedor, home y trabajo anteriores. La selección efectiva de terminal es distinta en cada bot.

- Cada llave SSH accede solo a su taller; los accesos cruzados se rechazan. Se retiró únicamente la entrada obsoleta del segundo bot del taller anterior, con respaldo privado y conservación de la entrada del primero.
- Prueba simultánea: cada taller adquirió el candado de su clon y escribió el mismo nombre de archivo con contenido distinto. Ambas ejecuciones terminaron con salida 0. Archivos de prueba retirados y candados liberados.
- El proxy mantiene GitHub permitido y rechaza un dominio ajeno. No se publicaron puertos del VPS.
- Cada clon tiene credencial de coordinación exclusiva. `status` real desde VPS, Hermes 1 y Hermes 2 devuelve el catálogo publicado anterior; ambos talleres tienen sesión, checkout y host distintos. Comparten únicamente el servicio de coordinación y el catálogo.
- Estos resultados no acreditan el piloto de reservas de la nueva entrega ni los equipos VS Code/Codex escritorio, todavía pendientes de acceso real.

## Segunda etapa: listas independientes de herramientas

La decisión vigente sustituye los nombres de herramientas por los encabezados exactos **Lista 1, Lista 2, Lista 3 y Lista 4**. Se mantienen las 250 asignaciones (59/61/65/65) y los IDs internos por compatibilidad. Todas las listas declaran capacidad dos. Las cinco identidades ya están autorizadas para solicitar cualquiera sin ampliar roles; ese permiso no acredita instalación ni piloto de los cinco clientes. Una reserva por actor/sesión/checkout sigue siendo el límite. Los nombres y capacidad nuevos siguen preparados en el checkout, sin desplegar; producción conserva `f85f247c505e177b0ffd3ab06be49163a682e314`, catálogo revisión 1.

El cliente incorpora `init --list 1..4`, excluyente con `--slot`, y `select-list --list 1..4`. La selección consulta el tablero, preserva IDs/estado y guarda solo una preferencia. No reserva ni acredita autorización. Rechaza reservas abiertas, pausadas, sin contacto o entregadas, operaciones desconocidas, aprobaciones o turnos propios pendientes. La ayuda temporal del servidor conserva la asignación original de la tarea; el tablero distingue el origen de la ayuda y la lista elegida.

La suite focalizada posterior pasa **136/136**, incluidas **19 regresiones de selección de listas**. La suite completa de esta etapa pasa **890 Node + 14 Python**; build, team:build y DOM también pasan. La revisión del CLI no encontró bloqueantes. Se corrigió el hallazgo menor P3 de caché del nombre de lista y se añadió su regresión; la repetición de `test:team:dom` tras ese cambio dio PASS. Estos resultados amplían la evidencia anterior sin confundirla con publicación. La capacidad y selección nuevas no están todavía publicadas ni importadas en el servicio remoto.

## Tercera etapa: OpenCode y DeepSeek

Luis ya no dispone de Claude Code y pronto dejará GPT. El flujo elegido usa Hermes para recibir encargos y OpenCode con DeepSeek para construir y revisar en cada taller. OpenCode V2 oficial `@opencode/cli@2.2.6` está instalado y devuelve la versión esperada en ambos talleres. El diagnóstico del helper falla cerrado por falta de clave. El helper `taller-opencode build|review [--session ID] -- <encargo>` ejecuta en modo standalone en loopback y conserva estado separado. La revisión requiere sesión nueva y no dispone de shell; `--session` solo continúa una construcción propia. No se comparte servidor entre talleres y se conservan Git y el candado local. Las marcas de aprobación no entran en los procesos de OpenCode: la publicación del SHA aprobado se realiza por un mandato separado de Hermes mediante los wrappers existentes.

La revisión independiente de los controles de OpenCode dio **PASS**: directorio canónico, lista permitida de variables sin credenciales de Cloudflare ni aprobaciones, filtrado de stdout/stderr, configuración administrada intacta, revisión nueva sin shell y standalone en loopback. La capa de instalación para una futura imagen se probó con red deshabilitada y todas las capacidades retiradas, preservando los hashes de las guardas. No se reinició ninguno de los talleres para instalar OpenCode. Estas pruebas son locales y no acreditan inferencia con DeepSeek.

La versión instalada de ambos Hermes admite DeepSeek nativo y sus perfiles/almacenes están separados. Cada bot requiere una clave distinta, cuya disponibilidad todavía no está confirmada. La configuración se realiza en su panel mediante `Keys → DeepSeek API Key → Save` y selección del modelo `deepseek-v4-pro` en Models, seguida de una sesión nueva. No se cambió el proveedor actual ni se hicieron peticiones facturables para dar por completada esa activación.

El panel configura Hermes, no OpenCode. El operador debe aprovisionar únicamente la clave de cada bot en el almacén privado del OpenCode correspondiente, por el canal administrativo autorizado. Se conserva el bloqueo del passthrough SSH de proveedores; no se copian archivos `.env` completos ni se mezclan identidades. Rotar o borrar una clave exige revisar ambos almacenes. El login Codex pendiente de Hermes 2 se canceló al cambiar de flujo; no se copiaron autenticación ni sesiones del primero.

Luis confirmó que guardó la primera clave en su panel; no se leyó ni se probó todavía. La segunda sigue pendiente del acceso a su propio panel. Falta verificar ambas, aprovisionarlas selectivamente y probar inferencia y revisión independiente por taller. No se afirma que una llamada real a DeepSeek haya funcionado ni se inventa coste.

## Cierre pendiente

Las comprobaciones locales de listas y controles OpenCode están cerradas con los resultados anteriores. El commit de esta entrega requiere aprobación exacta antes de publicar; producción continúa en la base anterior. Quedan pendientes el acceso humano al tablero mediante los correos autorizados de Access —sin incluirlos en documentos públicos— y el recorrido de navegador real. Después de publicar y desplegar el código, importar el catálogo del SHA publicado y registrar el piloto real por cliente: reservas compatibles, conflictos, recuperación y turno único. Los clientes que lo completen pueden trabajar sin esperar a los equipos ausentes. Sin conexión/configuración el cliente conserva el trabajo y diagnostica, sin fallback individual que eluda el coordinador. Solo se declarará completo el equipo al verificar los cinco entornos.
