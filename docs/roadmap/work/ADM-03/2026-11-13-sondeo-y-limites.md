# ADM-03: sondeo visible y reconciliación parcial — 13 nov 2026

Estado: **parcial, sin activar ni publicar**. Copia aislada creada desde
`1eed9a1c3fb31549403c68b3745d234525f12d6a`; la integración sobre main más reciente y la revisión independiente quedan pendientes. El plan de referencia es
[ADM-03](../../../superpowers/plans/2026-11-09-adm-03-rental-notices-on-the-shared-clock.md).

## Cambio realizado

`usePoll` ejecuta también la llamada inicial con la guarda de visibilidad que ya usaba el intervalo. Al pasar a visible vuelve a cargar inmediatamente; `ms=null`, el cambio de dependencia y el desmontaje mantienen su limpieza. El Inbox usa este hook para su lista; fuera del Inbox el mismo hook alimenta el contador global. No se cambian sesión, permisos, rutas, reloj, productores ni reglas financieras.

La guarda cubre las llamadas hechas por `usePoll`, no todo tráfico de una pestaña: Inbox carga por separado la lista de personal y existen recargas explícitas. Una petición ya iniciada puede terminar tras ocultar la pestaña. El contador existente consulta `openCounts`, que puede actualizar su caché y llamar a `ensureCharges` a través de `refreshRentalsCount`; esta entrega no modifica esos efectos. El trabajo automático existente tampoco ha sido activado por esta entrega.

## Productores y límites observados en el código base

- `server/jobs.js` ya ejecuta `notificationsPass` en el reloj compartido y aísla su fallo respecto al paso de correo. `server/notification-reconcile.js` ya recoge atrasos, comprobaciones, plazos de tenancy, renovaciones y reparaciones urgentes, entre otros; emplea la proyección común, claves de episodio, fecha de Jersey, revalidación y páginas de 50. No se duplicó ningún productor. Véanse también las evidencias previas de [NOT-01](../NOT-01/producer-evidence.md), [NOT-08](../NOT-08/implementation-evidence.md) y [NOT-11](../NOT-11/producer-evidence.md).
- El pase existente incluye `ensureCharges`; se ha mantenido intacto. La consulta de atrasos de `server/routes/rent.js` excluye tenancies finalizadas y no incorpora la autoridad nueva de ajustes. `server/finance-cases.js` consulta casos seleccionados con capacidad `sensitive_finance` y finalidad `arrears_management`; la lista/contador actuales de notificaciones usan sesión de personal y no aplican esa misma capacidad por caso. No se amplió la producción financiera: hay que integrar y verificar autoridad, filtros, permisos y migraciones aplicadas antes de ello.
- No se comprobó el estado remoto de migraciones, capacidades, reloj o correo. La presencia de código y migraciones locales o el éxito de fixtures no acredita que estén activos ni listos en un entorno real.

## Hallazgo pendiente: relaciones inconsistentes de reparaciones

En SQLite local con datos ficticios, una reparación de emergencia vinculada a una tenancy de otro inmueble produjo dos eventos `notification.observed` en dos pases y ninguna tarea; no se crearon cargos en ese fixture. La selección de reparaciones del reconciliador no verifica la pertenencia cruzada antes del evento, mientras que la proyección sí la comprueba y omite la tarea. La siguiente pasada vuelve a observarla.

También se comprobó una tarea ya creada con contexto sin tenancy: al alterar después la reparación para asociarla a una tenancy de otro inmueble, el DTO todavía consideró disponible el enlace al inmueble/reparación porque el contexto antiguo no contiene esa tenancy. Esto describe el comportamiento del fixture, no su prevalencia en datos reales. `taskStatements` exige mantener destino y contexto anteriores; filtrar solo la selección puede alterar el cierre de observaciones existentes o dejar tareas sin transición. Queda pendiente diseñar y probar conjuntamente la pertenencia actual, revalidación durante la escritura, deduplicación, revocación de enlaces y transición de tareas previas con sus estados manuales. No se modificó el reconciliador ni se afirmó resuelto el caso.

## Evidencia local

- RED: las pruebas de React con DOM ficticio fallaron en montaje oculto y al reactivar mientras estaba oculto. GREEN: `node --test tests/adm03-poll-visibility.test.js`, 3/3; cubre montaje visible, vuelta a visible, intervalos, pausa y limpieza al desmontar.
- Regresión previa: `node --test tests/adm03-poll-visibility.test.js tests/server/notification-reconcile.test.mjs tests/server/jobs.test.mjs`, 22/22 antes de añadir el tercer caso de montaje visible. Incluye D1 local, no infraestructura remota.
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/adm03-polling.e2e.cjs npm run test:e2e:isolated`: aprobado en Chromium, 1280 y 390, con teclado, zoom CSS 200 % en Inbox, consola y fallos de peticiones locales. Se controlaron sintéticamente la visibilidad y la ejecución del callback de intervalo para comprobar Inbox y contador, incluidas sus pausas por sesión caducada. El lanzador usa contenedor temporal sin red ni capacidades y datos ficticios; hubo avisos TLS locales durante su preparación. No es una verificación de producción ni del reloj real.
- Suite completa equivalente a `npm test` con concurrencia limitada: `node --test --test-concurrency=2 tests/*.test.js tests/server/*.test.mjs`, 1.579/1.579, y `python3 -m unittest tests/test_import.py tests/test_directory_manifest.py`, 25/25. `npm run build` y `npm run check:release` aprobados. Build informó de un chunk mayor de 500 kB.

## Pendiente para completar ADM-03

Resolver y revisar la pertenencia de reparaciones descrita arriba; acreditar la autoridad de deuda y permisos por caso sin duplicar productores; comprobar dependencias y migraciones en el entorno autorizado; y verificar entonces los criterios de reloj, idempotencia, enlaces y UI/contador con la integración definitiva. Las comunicaciones externas siguen fuera de esta entrega.
