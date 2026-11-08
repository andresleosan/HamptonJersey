# Avanzar en equipo: cuatro puestos coordinados

> Actualización de decisión, 8-nov-2026: Luis pidió después separar los dos Hermes y usarlos simultáneamente. La regla histórica de alternancia de este documento queda sustituida por [Hermes independientes](2026-11-08-hermes-independientes-design.md); se conservan cuatro columnas, con dos actores distintos en Hermes.

Estado: implementación local solicitada por Luis y construida el 8-nov-2026; validación y revisión registradas en el [ledger](../plans/2026-11-08-avanzar-equipo-ledger.md). Publicación, acceso privado y piloto en los cuatro equipos pendientes. No acredita un servicio activo.

## Objetivo y base comprobada

Que cuatro personas puedan usar /avanzar, consultar el mismo checklist y trabajar en tareas compatibles. Las columnas representan puestos, no fases de un kanban: VPS, Hermes, VS Code y Codex escritorio. Cada tarjeta muestra su estado dentro de su columna. Aclaración de Luis del 8-nov: el reparto debe cubrir TODOS los puntos del checklist, no únicamente las siguientes tareas ni una muestra inicial.

Análisis de main consultado el 8-nov-2026: 36c4c2b746b3421b37fb5d59826772c6814c096f, en copia temporal aislada. La copia habitual de la VPS está en codex/hampton-design-pass, 9527c33, con archivos pendientes; se conserva intacta. Los documentos de planificación se guardaron allí para revisión; la implementación posterior se conserva en un checkout main independiente. No acredita sincronización de la rama antigua, publicación ni despliegue.

El checklist de main contiene 250 puntos: 51 hechos, 93 parciales, 54 pendientes, 32 bloqueados, 17 replanteados y 3 descartados. Sus datos están incrustados en el HTML; no hay reservas compartidas ni dependencias estructuradas. «Responsable: desarrollo» no identifica quién está trabajando ahora.

El contrato vigente ya verifica GitHub mediante scripts/check-avanzar.mjs. Sin embargo, todos los agentes actualizan ESTADO, checklist y la recomendación siguiente. Hermes usa un clon con candado. Los e2e generales comparten el puerto local 8799. Son conflictos adicionales a editar el mismo archivo.

Fuentes: docs/roadmap/AVANZAR.md; .agents/skills/avanzar/SKILL.md; docs/roadmap/ESTADO.md; docs/roadmap/2026-11-07-reconciliacion-automatizacion.md; bloque datos del checklist y código de main.

## Enfoques considerados y recomendación

1. Cuatro listas guardadas en HTML/Git: fáciles de mostrar, pero cada copia puede reservar la misma tarea antes de ver el cambio de otra. No satisfacen la coordinación solicitada.
2. Reservas centrales y HTML conectado: una autoridad concede cada reserva, detecta dependencias y actualiza las cuatro vistas. Recomendado; conserva el checklist y permite aislamiento de desarrollo.
3. Tablero externo: aporta interfaz, pero sigue necesitando integración con /avanzar y controles de recursos para impedir colisiones. Añade otro lugar de trabajo.

La opción 2 se implementó tras la solicitud de continuar de Luis: Worker de coordinación separado, con un Durable Object SQLite para el proyecto y acceso privado de desarrollo. No usa las tablas ni las credenciales de negocio de Hampton. El acceso de los equipos requiere la configuración descrita en [ACTIVACION.md](../../../coordination/ACTIVACION.md). La documentación oficial admite almacenamiento transaccional y consistente en Durable Objects: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ .

## Reparto completo obligatorio

El [listado completo de cuatro columnas](../../roadmap/reparto-equipo.html), su [manifiesto JSON](../../roadmap/reparto-equipo.json) y la [tabla de los 250 puntos](../plans/2026-11-08-avanzar-equipo-reparto.md) contienen cada código exactamente una vez. El HTML funciona como instantánea al abrirlo localmente; desde el coordinador autenticado consulta el catálogo y las reservas actuales. El servicio aún no está activado.

| Puesto | Total asignado | Parciales, pendientes o bloqueados | Área principal |
|---|---:|---:|---|
| 1 · VPS · Luis | 59 | 39 | Aplicantes, requisitos, matching y estados |
| 2 · Hermes 1/2 | 61 | 51 | Fuentes, agencias, integraciones y automatizaciones |
| 3 · VS Code | 65 | 41 | Inbox, visitas, alquileres y ofertas |
| 4 · Codex escritorio | 65 | 48 | Propiedades, publicación, tours y analítica |
| Total | 250 | 179 | 51 hechos, 17 replanteados y 3 descartados conservan historial |

El reparto agrupa áreas para reducir choques; los totales no representan igual esfuerzo. Los cuatro puestos tienen una cartera completa de desarrollo, no hay un puesto reservado exclusivamente a revisar a los demás. Las tareas PRE se reparten por su área; su responsable original sigue siendo quien aporta la decisión. Asignar seguimiento a un compañero no le delega las decisiones exclusivas de Luis, Hampton o un tercero.

Toda tarea nueva debe recibir un assignedSlot y un alcance antes de entrar en la selección automática; la validación falla con códigos sin asignación, duplicados o ausentes respecto del checklist. Una reasignación cambia su puesto con historial, no duplica la tarea. La ayuda temporal cambia ejecutor manteniendo el puesto de origen. La carga se revisa por trabajo pendiente y dependencias, no solo por número de tarjetas.

El análisis incluye dependencias de todo el catálogo. Distingue explícitas/inferidas y alcance completo/parcial. Las inferidas deben confirmarse; los requisitos de activación no impiden por defecto el desarrollo con fixtures. Antes de hacer ejecutable un punto parcial, separar sus unidades: construir, integrar, activar o confirmar una decisión. No convertir este análisis de planificación directamente en un grafo de bloqueos automáticos sin esa revisión.

## Ejemplo de primeras tareas dentro del reparto completo

| VPS · Luis | Hermes · teléfono 1 o 2 | VS Code · compañero | Codex escritorio · compañero |
|---|---|---|---|
| BUS-14: selección y orden de coincidencias | BUS-21: primera investigación de fuentes | NOT-11/M13a: diseño y núcleo compatible de tareas del equipo Hampton | Preparar el siguiente tramo viable de PUB-01/04–09 sobre el editor propio |
| Después: siguiente tramo viable de M04, según inventario | BUS-22 después de BUS-21; BUS-23 después de BUS-22; activación de AUT-17 por su canal autorizado | Después: adaptadores de avisos, visitas y alquileres; ADM-21 si se adelanta | Después: publicación, fichas, analítica y tours según sus dependencias |

Son posibles comienzos dentro de las 250 asignaciones, no cuatro reservas ya concedidas. PUB-01 y ADM-21 requieren fijar su prioridad y tramo independiente antes de empezar. Las especialidades no quedan atadas permanentemente a cada puesto.

BUS-14 toca matching.js y match-store.js; este último produce notificaciones. NOT-11 solo puede construirse en paralelo si conserva el contrato actual de notificaciones y deja la adaptación de matching para después. Un cambio incompatible reserva el recurso lógico notifications-schema e impide la simultaneidad. NOT-11 son tareas de empleados de Hampton; no es este tablero de desarrollo.

BUS-21, BUS-22 y BUS-23 son secuenciales por decisión vigente. Una columna libre nunca elimina esa dependencia. AUT-17 tiene código construido y documentado como desplegado: su pendiente es activación y prueba real, no rehacer correo. No se reconstruyen AGE-04, REG-08 ni MSG-02 por estar marcados «parcial». Su situación de publicación/activación se verifica antes de asignar trabajo.

Cada tarjeta muestra código, título, siguiente paso concreto, estado de trabajo, persona y puesto actuales, dependencias, qué desbloquea, archivos/componentes reservados, última actividad y evidencia de entrega. Separar estado funcional del checklist de estado de trabajo: disponible, reservada, en curso, bloqueada, en revisión, lista para integrar, integrada. Publicación y activación tienen evidencia propia.

Cuatro columnas en escritorio; selector de puesto en móvil, con vista de todas disponible. Refresco cada 15 segundos con pestaña visible y al recuperar foco. Mostrar hora de la última respuesta; tras 45 segundos sin respuesta válida, «Sin conexión: estado sin verificar». No presentar una copia guardada como ocupación actual. La versión descargada del HTML conserva el checklist estático y enlaza a la vista compartida autenticada; no lleva secretos ni simula reservas sin conexión.

V1: el HTML sirve para consultar, filtrar y copiar el comando de una tarea; las reservas, pausas y ayudas se ejecutan mediante /avanzar. Así una acción del navegador no crea una sesión de desarrollo que ningún agente haya retomado.

## Identidad, aislamiento y reglas de elección

- Separar persona, puesto y sesión. Puestos estables: vps, hermes, vscode, codex-desktop. Un compañero puede cambiar de dispositivo conservando su identidad; abrir otra ventana no crea otro trabajador.
- Hermes 1 y Hermes 2 comparten el puesto hermes. Cambiar de teléfono retoma la tarea, sin duplicar la sesión ni eludir el candado. Una transferencia de sesión invalida la anterior con un nuevo número de generación.
- Una copia Git independiente por puesto que edite código. VS Code conectado a la VPS no debe usar la misma carpeta que Luis. En Hermes se conserva el clon obligatorio y su candado, sin crear otro para eludirlo. Mantener main local y publicar únicamente main, según el contrato actual.
- Una tarea activa por sesión y por puesto en V1. Al iniciar, retomar primero la propia tarea pendiente; después tomar la primera viable de la cola propia. Sin tarea viable, ayudar con una tarea disponible de un puesto libre, priorizando la que desbloquea otras. Empates: orden del roadmap y luego código.
- «Libre» significa sin reserva activa ni trabajo pendiente de recuperar. Una tarea bloqueada externa puede pausarse con entrega guardada, conservando las reservas de sus cambios sin integrar. Si deja cambios o commits pendientes en el clon, ese checkout sigue ocupado para código: V1 permite al puesto ayudar con revisión/investigación sin modificarlo, pero no iniciar allí otra implementación ni publicar una segunda entrega que arrastre la primera. En Hermes no se abre otro clon para eludir esa condición.
- Ayudar mueve la tarjeta al puesto ejecutor y conserva su columna de origen en el historial. No significa hacerse dueño de toda la columna. Al liberar recursos, se recalculan las tareas elegibles automáticamente.
- Si todas las tareas están bloqueadas, explicar qué falta; ofrecer revisión o diagnóstico concreto si existe. No inventar trabajo ni omitir una dependencia para llenar cuatro columnas.

## Reserva compartida y recuperación

La operación de tomar tarea valida en una sola transacción: identidad, puesto libre, revisión del catálogo, dependencias, ausencia de otra reserva y compatibilidad de todos los recursos. Devuelve identificador de reserva y generación. Dos peticiones simultáneas solo pueden obtener una misma tarea una vez. Cada escritura usa generación e identificador de operación para rechazar sesiones antiguas y hacer seguros los reintentos.

Propuesta de tiempos: renovación cada 60 segundos mientras el ejecutor está activo; reserva de 15 minutos. Se comprueba también al retomar, antes de editar otro grupo de archivos y antes de entregar. La caducidad marca «Sesión sin contacto» y conserva los recursos: no acredita que el otro ordenador haya dejado de editar. Recuperar exige revalidar con el dueño o la persona coordinadora, guardar la entrega existente y revocar la generación anterior. La sesión antigua no puede renovar ni entregar después.

Una reserva incluye rutas exactas o prefijos normalizados y recursos lógicos. Lecturas compatibles entre sí; escritura excluye lectura que necesite contrato estable y otras escrituras. Prohibir rutas ambiguas, escapes y comodines no definidos. Recursos iniciales: matching-contract, notifications-schema, app-navigation, shared-styles, migration-sequence y release-main. e2e:<host> limita el e2e general por máquina, no por columna; las pruebas usan fixtures y almacenamiento local independientes.

| Operación | Transición y recursos |
|---|---|
| claim | Disponible → reservada; adquiere tarea, puesto y recursos juntos. |
| resume | Reservada/pausada → en curso con misma generación vigente; si perdió contacto exige recuperación previa. |
| pause | En curso → pausada/bloqueada; conserva recursos y ocupación del checkout con trabajo pendiente. |
| submit | En curso → en revisión/lista para integrar; conserva recursos hasta integrar o devolver a corrección. |
| handoff | Relevo comprobado → nuevo dueño/generación; invalida sesión anterior, no copia trabajo por sí mismo. |
| abandon | Reserva sin cambios/commits pendientes comprobados → disponible; libera recursos. Con trabajo pendiente se rechaza y se exige pausa/relevo. |
| complete | Entrega verificada → integrada/investigación aceptada; libera recursos de código. Una activación pendiente queda en otra unidad bloqueada, sin retener archivos indefinidamente. |
| release/finish | Registra resultado de publicación y sincronización del catálogo, y libera el turno global cuando esté reconciliado. No sustituye complete; si falta completar la tarea, su reserva permanece visible y puede cerrarse idempotentemente. |

El catálogo revisado define los recursos mínimos; el cliente no puede declarar una lista vacía para eludirlos. Si durante el trabajo aparece otro archivo/contrato, solicitar ampliación atómica antes de editar. Si está ocupado, conservar el trabajo y esperar o terminar la parte independiente. Al entregar, contrastar diff real y recursos declarados. Esto detecta omisiones; no sustituye la revisión de compatibilidad funcional.

## Fuente de verdad y dependencias

Git guarda la definición y evidencia histórica de cada tarea. El coordinador guarda exclusivamente la ocupación actual, sesiones, reservas, cola de integración y eventos de coordinación. El HTML es una vista de ambas fuentes; localStorage no decide quién trabaja.

Extraer los puntos del bloque datos a docs/roadmap/tasks/<codigo>.json conservando todos los campos actuales. Añadir unidades de trabajo para dividir tareas grandes/parciales: código padre, alcance pendiente, columna preferida, prioridad, dependencias tipadas, recursos y criterios. Ejemplo: NOT-11/nucleo y NOT-11/adaptar-matching; completar una unidad no cierra el código entero.

Cada dependencia especifica qué evidencia requiere: diseño/contrato acordado, código integrado en main, investigación aceptada, migración aplicada, despliegue verificado o activación real. Detectar códigos inexistentes y ciclos. Nunca inferir «activado» a partir de un commit. Generar docs/roadmap/catalog.json como paquete determinista de definiciones para el coordinador. Tras publicar, el cierre importa ese paquete desde el main canónico verificado, no desde contenido arbitrario del cliente; mantiene SHA y revisión creciente. Si falla la importación, la entrega queda publicada con sincronización pendiente y no se ofrecen dependientes basados en una definición vieja. Una actualización incompatible con reservas abiertas exige reconciliarlas antes de ofrecer nuevas tareas.

Los ejecutores actualizan solo los registros de sus tareas y su ledger. Al integrar, un único responsable regenera el bloque datos del HTML y compone los cambios de ESTADO/reconciliación. Mantener el texto histórico editorial de ESTADO; no sustituirlo por un generador que lo pierda. El commit final integrado incluye código, estado y checklist como exige hoy el contrato. La recomendación global se convierte en cuatro recomendaciones por puesto, conservando el encabezado de compatibilidad para arranques antiguos durante la transición.

## Integración y publicación

Construir en paralelo; integrar y publicar de una en una bajo release-main. Primero actualizar contra main remoto, integrar sin reescritura destructiva, resolver conflictos, asignar/verificar número de migración y generar documentos comunes. Repetir las comprobaciones afectadas sobre el resultado integrado; solo entonces presentar el SHA final para su autorización cuando corresponda.

Cada puesto integra y publica su propia entrega cuando obtiene el turno global, mediante su canal y autenticación existentes. Así no hace falta centralizar credenciales ni transportar commits pendientes entre equipos. No publicar ramas auxiliares, porque las previews actuales usan producción. La cola coordina el turno, no traslada permisos. Cambiar de dueño una tarea con cambios locales exige primero un relevo por una vía privada permitida y comprobada; sin esa vía, conservar la tarea pendiente en el equipo original y ayudar con otra disponible.

Tras aprobar un SHA, congelarlo. Si main cambió, repetir integración y revisión antes de nueva aprobación. No marcar «publicada» sin comprobar el SHA remoto y el despliegue; ni «activada» sin comprobar su configuración/migración. Una publicación con resultado incierto se reconcilia con remoto antes de liberar el turno o reintentar. Ante una caída del coordinador, conservar el trabajo y suspender nuevas reservas/integraciones; no asumir que el candado quedó libre.

## Acceso y activación del sistema

Propuesta: autenticación de navegador con Cloudflare Access y credenciales de servicio individuales por puesto para el cliente. Validar firma, issuer, audience y caducidad del JWT, y mapear la identidad autenticada a los puestos autorizados; un nombre enviado en el cuerpo no basta. Referencias oficiales: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/ y https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ .

El HTML compartido y su API se sirven bajo el mismo origen autenticado. La identidad del navegador solo concede consulta en V1; las mutaciones requieren la identidad de servicio y el rol permitido, no una cookie de lectura. CORS no concede autorización. El rol de coordinador permite recuperar reservas y mantener el catálogo; los ejecutores solo sus sesiones y tareas permitidas. No reutilizar HERMES_KEY ni dar acceso de desarrollo por figurar en admins de la app de Hampton.

La comprobación de capacidad confirmó que Hermes usa un proxy cuya lista permitida no incluye el nuevo hostname. El cliente respeta ese proxy; activar el servicio necesita añadir el dominio exacto por el procedimiento autorizado y suministrar la identidad de forma privada. No se han cambiado red, wrappers, candados ni permisos. Confirmar igualmente acceso desde VS Code y Codex escritorio, equipos no conectados a esta sesión. Publicar la skill no acredita actualizar esas instalaciones.

La propuesta no necesita abrir puertos del VPS ni modificar la base de negocio. Configuración externa, credenciales, costes y despliegue son un trabajo posterior, separado de este plan. No hay cuota/precio asumido ni recursos contratados en esta sesión.

## Aceptación

1. Cuatro invocaciones simultáneas obtienen tareas compatibles; una tarea disputada se concede exactamente una vez.
2. Un cambio incompatible de notificaciones impide solapar BUS-14/NOT-11 aunque no coincidan sus archivos.
3. Cambiar de teléfono mantiene un único puesto Hermes y el candado existente; la sesión reemplazada no puede entregar.
4. Si una columna está libre, otra toma una tarea disponible y deja trazabilidad; no toma la tarea de una sesión sin contacto.
5. Dependencias de investigación, código y activación desbloquean solo con su evidencia correspondiente.
6. Dos entregas conservan sus cambios de estado; solo una integra/publica a la vez, con prueba del SHA final.
7. Cuatro navegadores reflejan un cambio dentro del siguiente intervalo de consulta; un cliente desconectado muestra que su estado no está verificado.
8. Móvil 390px, escritorio 1280px, teclado y zoom 200% permiten consultar y navegar sin perder foco al refrescar.
