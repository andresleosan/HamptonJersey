# Coordinación de las cuatro listas

Contrato versionado para `/avanzar` y `$avanzar`, 8-nov-2026. Las columnas se llaman **Lista 1, Lista 2, Lista 3 y Lista 4**, independientemente de la herramienta. Los cinco actores existentes pueden elegir cualquiera de ellas; cada lista admite dos reservas. El catálogo público describe las 250 tareas, su asignación y las reglas revisadas; el coordinador autenticado conserva ocupación, generaciones, reservas y evidencias. La [vista de equipo](../../../../docs/roadmap/reparto-equipo.html) abierta como archivo es una fotografía **sin conexión**, sin permiso para construir. La API viva es la única autoridad para tomar trabajo.

## Estado de activación

El coordinador está publicado y desplegado con el catálogo de `c2ef559bac59a2f6ccb1e5c6c527221f1a367568`: 250 tareas, Lista 1–4 y capacidad dos por lista. VPS y ambos Hermes tienen conexión autenticada comprobada; los dos talleres están actualizados y el piloto real reservó tareas distintas simultáneamente en Lista 2, rechazó una tarea ocupada y liberó las reservas sin cambios de producto. El turno de publicación de una reserva solo de planificación se rechazó correctamente con `PLAN_ONLY`; no se declara completo el piloto de construcción/publicación. VS Code y Codex escritorio conservan incorporación pendiente desde sus equipos. Cualquier cliente habilitado puede elegir cualquier lista. Sin repositorio, Git/Node, credencial propia o conexión verificada, diagnosticar la incorporación sin reservar ni editar fuera del coordinador. Sigue pendiente el acceso humano al tablero mediante correos autorizados de Access. Una fotografía del tablero no concede permiso para editar.

## Selección guiada

Si faltan lista o tarea, aplicar [inicio-guiado.md](inicio-guiado.md) antes de `claim`: consultar estado, recuperar pendientes, mostrar listas y después candidatas reales. Elegir no reserva; la asignación solo existe cuando la confirma el coordinador.

Cada participante activo necesita una copia exclusiva, independientemente de la herramienta o lista elegidas. No usar dos agentes simultáneos en una carpeta ni duplicar la sesión privada para cambiar de herramienta. Véase [carpeta exclusiva por participante](inicio-guiado.md#carpeta-exclusiva-por-participante-activo).

## Arranque portable, una vez por copia

Desde la raíz del clon canónico ya comprobado, se requieren Git 2.36 o posterior con `--remerge-diff`, Node 20.18.1 o posterior (preferible Node 24) y `npm ci`. No hay que instalar comandos globales. Git se invoca por su nombre normal para conservar los envoltorios del entorno. En Hermes, tomar el candado del taller **antes** de fetch o de usar una copia existente; para el primer clon, respetar el orden permitido por el taller.

Si el operador ha provisionado un archivo de entorno privado, el agente conserva su ruta en el relevo privado y ejecuta cada comando con `node --env-file=<ruta privada> scripts/avanzar-team.mjs ...`. En un clon con directorio `.git`, la instalación puede usar `.git/avanzar-team.env` (0600); en worktrees se usa el Git dir propio. El CLI solo recibe las variables del proceso; no descubre archivos ni instala perfiles. No mezclar variables de otra identidad heredadas del proceso.

El operador prepara `TEAM_ENDPOINT` con el origen HTTPS autenticado real y proporciona `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET` mediante el entorno privado ya autorizado. No incluir valores en argumentos, ejemplos, chat, capturas, historial ni archivos versionados. La identidad y sus permisos derivan del JWT validado por Access; `--list` y el alias heredado `--slot` solo eligen una preferencia, sin conceder identidad ni permisos. El cliente respeta `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` y sus variantes en minúsculas, usando la dependencia local `undici`. Una redirección se rechaza sin reenviar credenciales. HTTP solo se admite en loopback para las pruebas locales.

| Lista visible | Número para `--list` | ID interno conservado por compatibilidad |
| --- | --- | --- |
| Lista 1 | `1` | `vps` |
| Lista 2 | `2` | `hermes` |
| Lista 3 | `3` | `vscode` |
| Lista 4 | `4` | `codex-desktop` |

Los IDs internos no asignan herramientas a las listas. `init --list` y `select-list` están publicados desde `c2ef559`; actualizar las copias anteriores antes de usarlos. Después, desde cualquier cliente autorizado, elige el número inicial, por ejemplo:

```sh
node scripts/avanzar-team.mjs init --endpoint "$TEAM_ENDPOINT" --list 1
```

`init --slot <ID interno>` se conserva para clientes anteriores; no se pueden pasar `--list` y `--slot` juntos.

Hermes 1 y Hermes 2 usan talleres independientes, cada uno con home, clon obligatorio, sesión, configuración privada y credencial de servicio. Cada uno elige una lista, y también pueden elegir la misma si hay capacidad y tareas compatibles. Las cuatro listas admiten dos reservas; un catálogo antiguo sin `capacity` conserva capacidad uno. Una misma identidad, sesión o checkout nunca obtiene dos reservas. Las reservas pausadas o sin contacto siguen consumiendo capacidad y recursos. El candado local de un taller no bloquea al otro. No compartir archivos privados de sesión o credenciales para cambiar de teléfono. Cada entorno conserva su trabajo pendiente hasta un relevo explícito.

`init` deja configuración y sesión privadas junto al Git dir de cada checkout, con escritura atómica y permisos del propietario. En worktrees usa su Git dir propio. El identificador de host de una inicialización nueva es un hash estable del sistema y su hostname; dos clones en la misma máquina comparten ese identificador, sin exponer el nombre. Si dos máquinas tienen el mismo nombre, el conflicto conservador evita concurrencia. No modificar identidades para escapar de una reserva. No copia credenciales ni modifica `.git/config` ni hooks. Repetir `init` con la misma lista conserva los identificadores; cambiarla mediante `init` o copiar su configuración a otro checkout se rechaza. No borrar esos archivos para escapar de una tarea pendiente.

Para elegir otra lista en un checkout ya inicializado:

```sh
node scripts/avanzar-team.mjs select-list --list 3
```

`select-list` consulta primero el tablero y guarda únicamente la preferencia local; conserva actor, sesión, checkout, host y estado privado. No reserva trabajo ni acredita permisos sobre la lista elegida: el servidor vuelve a autorizarlos en `claim`. Se rechaza con una reserva propia abierta, pausada, sin contacto o entregada, una operación de resultado desconocido, una aprobación declarada/privada/de entorno o un turno de publicación propio. Termina o resuelve el trabajo por el flujo correspondiente antes de cambiar; no reinicialices ni borres la sesión. Elegir otra lista no mueve las tareas del catálogo.

En cada inicio o reanudación, seguir primero la verificación/alineación de GitHub de la skill y después ejecutar:

```sh
node scripts/avanzar-team.mjs status
node scripts/avanzar-team.mjs claim --mode plan
```

Con código de tarea solicitado: `node scripts/avanzar-team.mjs claim --task AUT-17 --mode plan`. Sin código, el servidor recupera primero el trabajo propio; después elige una unidad disponible preferida por la lista seleccionada, por prioridad e identificador; solo toma una unidad compatible de otra lista cuando no hay una propia viable. Esta ayuda temporal conserva la lista original de la tarea y la preferencia del cliente; el tablero distingue ambas. La capacidad cuenta reservas de la lista elegida, no el total de tarjetas que reciben ayuda desde otras listas. Una reserva ocupada, pausada o caducada conserva sus conflictos y su plaza. Que quede una segunda plaza en una lista no autoriza tomar una tarea ni recursos ya reservados. El título del checklist por sí solo no demuestra que una unidad sea ejecutable. Aplicar el inicio guiado cuando falten lista o tarea; no repetir elecciones explícitas ni tomar otra tarea mientras haya trabajo propio pendiente.

`status` muestra revisión y SHA del catálogo, ocupación y la operación local pendiente. Consultarlo no renueva nada. `claim` requiere una copia limpia y comprobada cuando empieza trabajo nuevo. Al recuperar trabajo propio conserva cambios y commits, verifica el alcance y la base. Sin red no concede tarea ni permiso de publicación. Salidas JSON: `0` éxito confirmado, `2` conflicto, `1` configuración, red o resultado desconocido. No interpretar un error como reserva obtenida.

## Plan, alcance y construcción

Una unidad pendiente de revisión solo permite `plan`: escribir documentos Markdown concretos, nunca código del producto. En plan sí se reservan **antes de la revisión** las rutas exactas de documentación y producto; la reserva por sí sola no autoriza editar producto. El diseño revisado queda ligado a ese alcance. Reservar también archivos generados, checklist, ledger y recursos de prueba que la entrega vaya a necesitar:

```sh
node scripts/avanzar-team.mjs scope --path docs/superpowers/specs/mi-tarea.md --path docs/superpowers/plans/mi-tarea.md --write admin/ruta-del-cambio/ --read functions/ruta-de-consulta/
node scripts/avanzar-team.mjs scope --resource "e2e:$HOST_ID"
node scripts/avanzar-team.mjs watch
```

`watch` corre en primer plano, renueva la reserva cada 60 segundos y termina ante señal o fallo. Puede quedar abierto en otra terminal del **mismo** checkout; no instala daemon ni servicio. Si se pierde la renovación, detener ediciones y consultar el estado. La reserva dura 15 minutos; caducar no libera sus recursos ni permite robarla.

`--path` y `--write` reservan escritura; `--read-path` y `--read` reservan lectura. `--resource` reserva una clave lógica de escritura validada. Usa como `HOST_ID` el identificador del `init`/`status` de esa máquina. Antes de e2e reserva `e2e:<hostId>`: dos copias en el mismo equipo no pueden ocupar a la vez los puertos/fixtures compartidos. Esta reserva debe formar parte del alcance revisado, sin daemon global.

Brainstorming, preguntas resueltas y plan preceden al código. El coordinador registra una revisión verificable de esa unidad, por ejemplo:

```sh
node scripts/avanzar-team.mjs evidence --unit AUT-17 --kind design --reference docs/superpowers/specs/mi-tarea.md
```

Solo una identidad coordinadora puede registrar esa atestación. La revisión no inventa evidencia de integración ni activación. El catálogo inicial deja las unidades de desarrollo pendientes de revisión. Con la evidencia de diseño y las dependencias exigidas satisfechas, solicitar la transición; el servidor decide:

```sh
node scripts/avanzar-team.mjs resume --mode build
```

Antes de editar código, comprobar que la respuesta confirma `mode: build` y que cada archivo pertenece a un recurso `path:` con escritura. `scope` añade recursos, nunca reduce reservas existentes; una ruta con lectura no autoriza escritura. La evidencia `design` está ligada a los recursos concretos revisados. Añadir recursos de producto después de pasar a build exige volver a revisar ese alcance; no es una ampliación automática del permiso de construcción. En plan, el cliente sigue rechazando la entrega de código aunque ya esté reservado. Directorios con `/` final cubren descendientes. No reservar todo el repositorio para evitar pensar el alcance. Nuevas dependencias o reglas de ejecución deben quedar revisadas en el catálogo canónico; las relaciones inferidas o parciales del checklist no se promueven automáticamente. Las unidades de investigación usan sus entregables y dependencias propias; terminar código nunca satisface una decisión de negocio.

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

`TARGET_SLOT` usa el ID interno de la lista de destino de la tabla anterior; el nombre histórico no determina la herramienta del destinatario. Para el relevo de la propia reserva se pueden omitir `--claim` y `--generation`. El mandato no transmite cambios sin publicar ni salta el candado de Hermes. El destino vuelve a comprobar su clon y acepta explícitamente el relevo; el origen deja de editar. Un relevo con archivos pendientes necesita una ubicación y responsable explícitos, sin presentar esos cambios como integrados.

### Aceptar el relevo en el destino

La nueva generación no se adopta por consultar el estado, ejecutar `init` o volver a reclamar. Esto vale también cuando el coordinador recupera una reserva caducada hacia **el mismo** actor, sesión y checkout que ya conservan trabajo. En el destino, usar el identificador de reserva y la generación exacta que confirmó el coordinador:

```sh
node scripts/avanzar-team.mjs accept-handoff --claim "$CLAIM_ID" --generation "$NEW_GENERATION"
```

Opcionalmente añadir `--mode plan` o `--mode build` para una reanudación; el servidor vuelve a exigir la revisión y dependencias que correspondan. El cliente exige la última procedencia `handoffs.to` y los campos actuales del tablero coincidentes, la lista/sesión/checkout/host locales exactos y una generación mayor que uno. Comprueba la base y el alcance de commits propios y de archivos pendientes; no exige borrar commits o limpiar trabajo legítimo recibido para fingir una reserva nueva. Si otro cliente publicó desde la base, esta aceptación explícita sin aprobación puede conservar la divergencia verificada para después entregar el trabajo provisional, tomar el turno e integrar main. Una aprobación declarada, privada o de entorno conserva el preflight estricto y nunca admite esa excepción. Una reserva local distinta, trabajo fuera de alcance o un destino diferente bloquean la aceptación.

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

`integrated` verifica que el commit pertenece al main canónico. Las otras referencias registran una atestación explícita del coordinador. No registrar `activated` porque compile o tenga un mock aprobado. `complete` exige la evidencia de cierre que corresponde a la unidad y libera sus recursos; no fabrica evidencia de activación. `abandon` solo acepta una copia sin cambios ni commits pendientes de esa reserva.

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

Con la integración final ya revisada, obtener la aprobación de Luis para **ese SHA**. La autorización llega por los canales existentes. En Hermes, ni el trabajo directo con GPT, ni su revisor independiente, ni OpenCode cuando corresponda el respaldo reciben marcas de aprobación durante construcción/revisión. Solo el mandato separado de publicación, ejecutado por Hermes mediante los wrappers existentes para el SHA aprobado, recibe `TALLER_PUSH_APROBADO`, `TALLER_SHA_APROBADO` y, si procede, `TALLER_MIGRACION_APROBADA`. Fuera de Hermes puede fijarse explícitamente el SHA que ya fue aprobado; la opción no inventa esa aprobación:

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
