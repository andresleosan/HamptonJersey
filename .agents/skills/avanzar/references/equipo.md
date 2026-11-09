# Coordinación de las cuatro listas

Contrato versionado para `/avanzar` y `$avanzar`, 8-nov-2026. Las columnas se llaman **Lista 1, Lista 2, Lista 3 y Lista 4**, independientemente de la herramienta. Los cinco actores existentes pueden elegir cualquiera de ellas; cada lista admite dos reservas. El catálogo público describe las 250 tareas, su asignación y las reglas revisadas; el coordinador autenticado conserva ocupación, generaciones, reservas y evidencias. La [vista de equipo](../../../../docs/roadmap/reparto-equipo.html) abierta como archivo es una fotografía **sin conexión**, sin permiso para construir. La API viva es la única autoridad para tomar trabajo.

## Estado de activación

El coordinador está publicado y desplegado con el catálogo de `c2ef559bac59a2f6ccb1e5c6c527221f1a367568`: 250 tareas, Lista 1–4 y capacidad dos por lista. VPS y ambos Hermes tienen conexión autenticada comprobada; los dos talleres están actualizados y el piloto real reservó tareas distintas simultáneamente en Lista 2, rechazó una tarea ocupada y liberó las reservas sin cambios de producto. El turno de publicación de una reserva solo de planificación se rechazó correctamente con `PLAN_ONLY`; no se declara completo el piloto de construcción/publicación. VS Code y Codex escritorio conservan incorporación pendiente desde sus equipos. Cualquier cliente habilitado puede elegir cualquier lista. Para construir, sin repositorio, Git/Node, credencial propia o conexión verificada, diagnosticar la incorporación sin editar producto. La planificación local verificada no depende de esa incorporación. Sigue pendiente el acceso humano al tablero mediante correos autorizados de Access. Una fotografía del tablero no concede permiso para editar.

## Planificación local sin reservas

Decisión de Luis, 8-nov-2026. Las reservas, capacidad y exclusión son para **construir**. Planificar no obtiene plaza, identidad, generación, lease, recurso ni permiso de código. Una reserva de otra sesión y las dependencias pendientes no bloquean documentos.

```sh
node scripts/avanzar-team.mjs plan --list 3 --task NOT-01
```

El comando lee el catálogo local después de verificar GitHub y devuelve contexto con `reserved:false`, `buildAuthorized:false`. Funciona sin init, credenciales o API del coordinador y conserva íntegros archivos privados de otras operaciones. `claim --mode plan` y claim sin modo son alias locales. El servidor rechaza nuevos POST de reserva plan; no reintentar por otra identidad.

En planificación: copia exclusiva, Git comprobado, spec/plan/ledger y relevo; no claim/scope/watch/renew/submit/pause/complete/release. No hacen falta evidencias de integración para redactar documentos. La vista de reservas no representa borradores locales. El título o catálogo no concede permiso de construcción.

## Construcción: inicialización y revisión del alcance

Cada participante usa copia propia. El entorno privado del operador suministra el endpoint HTTPS y credenciales exclusivamente al proceso, mediante su archivo autorizado; no imprimir ni copiar valores. El CLI no descubre archivos automáticamente. En clones provisionados se usa `node --env-file=<ruta privada> scripts/avanzar-team.mjs ...`. No compartir sesión o credenciales para cambiar de cliente.

Desde una copia de construcción nueva y limpia verificada, `init --list N --endpoint "$TEAM_ENDPOINT"` crea únicamente estado privado en su Git dir; no instala servicios. Si una planificación tiene commits locales pendientes, conservar esa copia; inicializar la copia de construcción sobre main verificado antes de incorporar sus documentos públicos al alcance de la entrega. No publicar planes como requisito para obtener una identidad ni perder commits para aparentar igualdad.

Antes de construir, la identidad coordinadora registra la revisión real y el alcance concreto, sin tomar reserva:

```sh
node scripts/avanzar-team.mjs evidence --unit NOT-01 --kind design --reference docs/superpowers/specs/mi-tarea.md --write server/archivo.js --write tests/archivo.test.js --resource events-contract
```

La lista revisada debe incluir todos los recursos mínimos de la unidad y los paths exactos de producto, docs, pruebas y generados. No reservar rutas durante la planificación. La atestación de diseño no es integración, activación o permiso de publicar.

Después de recibir encargo de construcción, consultar status y resolver reservas build/operaciones/aprobaciones propias pendientes; entonces:

```sh
node scripts/avanzar-team.mjs claim --task NOT-01 --mode build
node scripts/avanzar-team.mjs watch
```

El servidor toma el alcance revisado y comprueba identidad, capacidad, conflictos, revisión vigente y dependencias de forma atómica. Cada lista admite dos reservas build, cada actor/sesión/checkout una sola. Exige respuesta confirmada mode:build antes de código; ampliar recursos con scope requiere una nueva atestación que cubra la ampliación. `e2e:<hostId>` se incluye antes de usar fixtures/puertos compartidos. Watch renueva en primer plano cada60s; no daemon. Sin renovación o autoridad comprobada, detener código y diagnosticar.

El servidor no convierte build a plan. Para ampliar un diseño se revisan documentos/alcance sin una reserva nueva; el trabajo build pendiente conserva su reserva y no se presenta como abandonado. Las reservas plan anteriores a la decisión se conservan hasta cierre explícito de su titular con evidencia de diseño; este cambio no borra archivos ni modifica esas reservas activas.

## Pausa, reanudación y relevo

```sh
node scripts/avanzar-team.mjs pause --evidence 'Plan y cambios locales conservados; pendiente revisión'
node scripts/avanzar-team.mjs resume
node scripts/avanzar-team.mjs renew
```

Pausar guarda si hay trabajo pendiente y mantiene recursos. No hace stash, reset ni traslado de archivos. Reanudar conserva generación, sesión y checkout; volver a verificar Git según la skill. Una generación revocada impide seguir aunque el cliente conserve un resultado viejo. Una reserva caducada necesita recuperación explícita del coordinador, nunca apropiación automática.

El destino obtiene sus identificadores de su `init`/`status`, sin compartir archivos privados. El coordinador hace un relevo explícito con actor autorizado, lista, sesión, checkout y host completos; el servidor verifica permisos e incrementa la generación. Ejemplo de sintaxis usando identificadores no secretos proporcionados por los dos clientes:

```sh
node scripts/avanzar-team.mjs handoff --claim "$CLAIM_ID" --generation "$GENERATION" --target-actor "$TARGET_ACTOR" --target-slot "$TARGET_SLOT" --target-session-id "$TARGET_SESSION" --target-checkout-id "$TARGET_CHECKOUT" --target-host-id "$TARGET_HOST" --evidence 'Relevo revisado y ubicación del trabajo conservado'
```

`TARGET_SLOT` usa el ID interno de la lista de destino: 1=vps, 2=hermes, 3=vscode, 4=codex-desktop; el nombre histórico no determina la herramienta del destinatario. Para el relevo de la propia reserva se pueden omitir `--claim` y `--generation`. El mandato no transmite cambios sin publicar ni salta el candado de Hermes. El destino vuelve a comprobar su clon y acepta explícitamente el relevo; el origen deja de editar. Un relevo con archivos pendientes necesita una ubicación y responsable explícitos, sin presentar esos cambios como integrados.

### Aceptar el relevo en el destino

La nueva generación no se adopta por consultar el estado, ejecutar `init` o volver a reclamar. Esto vale también cuando el coordinador recupera una reserva caducada hacia **el mismo** actor, sesión y checkout que ya conservan trabajo. En el destino, usar el identificador de reserva y la generación exacta que confirmó el coordinador:

```sh
node scripts/avanzar-team.mjs accept-handoff --claim "$CLAIM_ID" --generation "$NEW_GENERATION"
```

Opcionalmente añadir `--mode build` para reanudar construcción; `--mode plan` se conserva únicamente para reservas plan históricas, sin permitir convertir build en plan; el servidor vuelve a exigir la revisión y dependencias que correspondan. El cliente exige la última procedencia `handoffs.to` y los campos actuales del tablero coincidentes, la lista/sesión/checkout/host locales exactos y una generación mayor que uno. Comprueba la base y el alcance de commits propios y de archivos pendientes; no exige borrar commits o limpiar trabajo legítimo recibido para fingir una reserva nueva. Si otro cliente publicó desde la base, esta aceptación explícita sin aprobación puede conservar la divergencia verificada para después entregar el trabajo provisional, tomar el turno e integrar main. Una aprobación declarada, privada o de entorno conserva el preflight estricto y nunca admite esa excepción. Una reserva local distinta, trabajo fuera de alcance o un destino diferente bloquean la aceptación.

La aceptación llama al `resume` existente para que el servidor autentique al actor propietario. Si la reserva ya está `submitted`, confirma la identidad mediante `renew`, conserva ese estado y no permite cambiar su modo ni resolver por accidente un turno de publicación incierto. Solo guarda la nueva generación tras respuesta autorizada. Si hay una operación anterior de esa misma reserva con generación menor revocada por el relevo verificado, la aceptación explícita la archiva íntegra en el estado privado como `unknown_revoked`, con cuerpo e identificador; no la repite ni la declara exitosa. Una operación de catálogo/evidencia, otra reserva o una generación aún vigente sigue bloqueando la aceptación. Después se guarda la nueva operación autenticada. Si se pierde esa respuesta, repetir exactamente `accept-handoff`: conserva el mismo cuerpo e identificador, sin adoptar autoridad durante la incertidumbre. Un rechazo del actor autenticado no guarda la nueva generación. Nunca copiar ni editar los archivos privados de sesión para eludir esta aceptación.

## Entrega, evidencias y publicación serializada

```sh
node scripts/avanzar-team.mjs submit --summary 'Qué cambió, pruebas realizadas y pendientes reales'
```

`submit` verifica el SHA actual de main canónico y distingue los commits propios de los que ya pertenecen a ese main. Audita cada commit propio posterior a la base, incluso cambios luego revertidos, y las modificaciones de resolución de merges de dos padres mediante `--remerge-diff`. No atribuye a la entrega la incorporación automática de archivos ya publicados por otro cliente. Añade siempre los archivos preparados, sin preparar y sin seguimiento. Detecta cambios propios fuera de alcance aunque una resolución toque un archivo que también cambió en main; no basta comparar solo el árbol final. Si Git no soporta esa auditoría, o hay un merge de más de dos padres, detiene la entrega con el trabajo conservado. En plan sigue rechazando código aunque exista una reserva amplia. No publica nada. Antes de publicar hay que confirmar también que todo está en el SHA revisado y el checkout está limpio.

El coordinador distingue los tipos de evidencia:

```sh
node scripts/avanzar-team.mjs evidence --unit AUT-17 --kind integrated --reference "$INTEGRATION_REFERENCE" --sha "$MAIN_SHA"
node scripts/avanzar-team.mjs evidence --unit AUT-17 --kind research_accepted --reference "$ACCEPTANCE_REFERENCE"
node scripts/avanzar-team.mjs evidence --unit AUT-17 --kind activated --reference "$ACTIVATION_REFERENCE"
node scripts/avanzar-team.mjs evidence --unit AUT-17 --kind decision --reference "$DECISION_REFERENCE"
```

`integrated` verifica que el commit pertenece al main canónico. Las otras referencias registran una atestación explícita del coordinador. No registrar `activated` porque compile o tenga un mock aprobado. `complete` se aplica al cierre de reservas build o a la compatibilidad de reservas plan históricas; exige la evidencia de cierre que corresponde a la unidad y libera sus recursos; no fabrica evidencia de activación. `abandon` solo acepta una copia sin cambios ni commits pendientes de esa reserva.

```sh
node scripts/avanzar-team.mjs complete
node scripts/avanzar-team.mjs abandon
```

La publicación mantiene las autorizaciones existentes. Para evitar que dos clientes integren o publiquen simultáneamente, la entrega `submitted` obtiene primero el turno para su SHA **provisional** comprobado. Tomar este turno no pide ni concede autorización de publicación. Si otro cliente publicó desde la base de la tarea, `submit` y `release acquire` provisionales pueden registrar esa divergencia verificada antes de integrar; sigue siendo una entrega pendiente, nunca una copia sincronizada. Se comprueban historia propia, alcance, identidad y, al adquirir, checkout limpio y SHA local exacto. Este permiso se limita a esas operaciones provisionales y a recuperar explícitamente esa misma reserva con `accept-handoff` sin SHA aprobado; no se traslada a un inicio nuevo, reanudación ordinaria, aprobación, renovación del SHA final ni publicación:

```sh
node scripts/avanzar-team.mjs release acquire --sha "$SHA_PROVISIONAL"
```

Con el turno conservado, integrar el main canónico observado y actualizar catálogo/documentos generados según la tarea, preservando trabajo local, scopes y wrappers. Ejecutar todas las comprobaciones afectadas. Todavía no hay un SHA aprobado; registrar la entrega final y actualizar el SHA del mismo turno:

```sh
node scripts/avanzar-team.mjs submit --summary 'Integración final, documentos generados y pruebas comprobadas'
node scripts/avanzar-team.mjs release renew --sha "$SHA_FINAL"
```

`release renew --sha` exige main y HEAD exactamente en ese SHA, copia limpia, main canónico actual incluido, alcance propio válido y que el servidor reconozca la última entrega. Solo cambia SHA mientras el turno siga `held`; un resultado incierto o una sincronización pendiente exige reconciliar el SHA anterior. `release renew` sin `--sha` solo renueva el turno y conserva su SHA aunque HEAD haya cambiado. `watch` renueva la reserva de trabajo, no el turno de publicación.

Con la integración final ya revisada, obtener la aprobación de Luis para **ese SHA**. La autorización llega por los canales existentes. En Hermes, ni Codex con GPT Sol, ni su revisor independiente, ni OpenCode cuando corresponda el respaldo reciben marcas de aprobación durante construcción/revisión. Solo el mandato separado de publicación, ejecutado por Hermes mediante los wrappers existentes para el SHA aprobado, recibe `TALLER_PUSH_APROBADO`, `TALLER_SHA_APROBADO` y, si procede, `TALLER_MIGRACION_APROBADA`. Fuera de Hermes puede fijarse explícitamente el SHA que ya fue aprobado; la opción no inventa esa aprobación:

```sh
node scripts/check-avanzar.mjs --approved-sha "$SHA_APROBADO"
node scripts/avanzar-team.mjs release renew --sha "$SHA_APROBADO" --approved-sha "$SHA_APROBADO"
```

La variable `TALLER_SHA_APROBADO` o la opción `--approved-sha` fija también la aprobación privada de ese turno. Omitirla en el siguiente mandato no descongela la entrega. Un cambio de SHA, HEAD/main o archivos después de aprobar impide volver a entregar o cambiar el turno; conservar el trabajo y preparar una nueva revisión. Solo un cierre publicado verificado o una cancelación explícita de un turno sin incertidumbre libera ese bloqueo privado.

Después de aprobar no crear commits, integrar ni generar documentos que alteren el SHA. Migrar y publicar únicamente mediante el flujo ya autorizado y sus wrappers; en Hermes se conserva el candado y se aplican primero las migraciones aprobadas. El turno no sustituye autorización. Estos comandos no ejecutan push ni despliegue. Tras comprobar el resultado real:

```sh
node scripts/avanzar-team.mjs release finish published --sha "$SHA_APROBADO" --evidence "$PUBLICATION_REFERENCE"
node scripts/avanzar-team.mjs release finish uncertain --sha "$SHA_APROBADO" --evidence 'Resultado por reconciliar'
node scripts/avanzar-team.mjs release finish cancelled --sha "$SHA_FINAL" --evidence 'Publicación cancelada y estado comprobado'
```

Elegir **una** salida. `published` comprueba main e importa el catálogo antes de liberar. `uncertain` conserva el turno y la aprobación hasta reconciliar; no permite cambiar SHA, cancelar la incertidumbre ni que otro publique a ciegas. Si `published` devuelve `synchronizationPending`, el turno sigue ocupado: resolver la importación del catálogo y repetir el cierre del mismo SHA. El coordinador puede importar el catálogo publicado con `node scripts/avanzar-team.mjs catalog --sha "$MAIN_SHA"`; el servidor lo obtiene de GitHub main, no acepta definiciones enviadas por el cliente.

Si se pierde la respuesta de un relevo, repetir el mismo mandato permite reconciliar solo si el tablero confirma exactamente la generación siguiente y todos los identificadores del destino; se limpia la operación vieja sin adoptar la autoridad del destino. Si no coincide, detenerse y diagnosticar.

Si se pierde una respuesta, repetir **el mismo mandato y argumentos**: el cliente conserva el identificador y cuerpo de la operación. No borrar la sesión ni lanzar otra mutación para esquivar un resultado desconocido. `status` sigue disponible para diagnosticar. Un conflicto definitivo exige resolver su causa; nunca recrear una generación, mover trabajo aparcado ni declarar éxito sin confirmación del coordinador.

## Paquetes de ejecución

Desde9-nov, [paquetes.md](paquetes.md) organiza la selección del agente. El manifiesto no cambia este protocolo: una reserva real por actor, dependencias y evidencias por unidad. PAQ-* es un alias local del agente, nunca un ID aceptado por claim. Compartir diseño/pruebas no autoriza ampliar la reserva ni cerrar códigos sin evidencia.
