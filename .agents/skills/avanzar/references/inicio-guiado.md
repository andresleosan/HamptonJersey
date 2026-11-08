# Inicio guiado de /avanzar

La skill principal define cuándo guiar. Este inicio usa las cuatro listas desde cualquier cliente habilitado, con la API viva como autoridad. No modifica identidad, credenciales ni el contrato de reservas.

### Carpeta exclusiva por participante activo

Lista, herramienta y copia de trabajo son conceptos independientes. Un participante puede usar GPT, OpenCode u otra herramienta con cualquiera de las cuatro listas. Cada participante activo conserva su propio clon/checkout, sesión y credencial de coordinación, aunque todos estén en la misma máquina. Dos herramientas concurrentes nunca deben escribir la misma carpeta, ni siquiera si eligieron listas distintas.

Antes de seleccionar, identificar la raíz Git y el checkout propios. Si otra sesión/agente usa esa carpeta, no continuar allí ni recuperar su reserva como si fuera propia: conservar el trabajo y usar una copia independiente permitida por el arranque del proyecto. No copiar `.git`, estado privado, identidades o credenciales desde la carpeta del compañero. En Hermes se usa exclusivamente el clon de su propio taller y su candado; no crear clones/worktrees adicionales para eludirlo. Fuera de Hermes, el operador debe incorporar la copia nueva con identidad autorizada propia. No afirmar exclusividad solo porque Git esté limpio o el nombre de la herramienta cambió.

Cambiar de herramienta para continuar una tarea requiere que la ejecución anterior haya terminado y que se conserve su reserva/relevo; no abre otra plaza ni otra copia con la misma identidad para trabajar a la vez. El servidor limita actor/sesión/checkout y recursos; esas comprobaciones complementan la carpeta separada. Si se pierde una renovación o no puede comprobarse la titularidad, detener escrituras y diagnosticar.

1. Verificar el repositorio y consultar `status`, con el archivo privado provisionado si existe. Sin conexión, explicar cómo incorporar ese cliente; no mostrar disponibilidad como confirmada.
2. Recuperar primero trabajo propio: reserva activa/pausada/sin contacto/entregada, operación incierta, aprobación o turno pendiente bloquean una selección nueva. `/new` conserva ese estado privado. Presentar el código y el estado, nunca las claves.
3. Si falta lista, presentar las cuatro con ocupación actual frente a su capacidad. Recomendar una por preferencia, carga y dependencias verificadas, sin prometer reserva. Una pregunta: «¿Qué lista quieres usar? Recomiendo Lista N por …; también puedo elegir automáticamente».
4. Tras elegir, usar `select-list --list N` solo si no hay pendientes. Si falla, conservar la configuración y explicar el conflicto. Si no se puede verificar qué actor o checkout tiene un pendiente, diagnosticar antes de cambiar.
5. Si falta tarea, mostrar hasta tres candidatas reales de la lista, por prioridad y dependencias; para cada una indicar código, título y siguiente paso. Una pregunta: «¿Cuál quieres trabajar? Recomiendo CÓDIGO para [planificar/construir]; puedes responder “recomendada”». El tablero puede acreditar revisión y dependencias, pero un resumen local nunca sustituye la decisión del servidor. Si no hay tarea viable, explicar el bloqueo y proponer ayuda a otra lista, sin tomarla a escondidas.
6. Tras elegir tarea o pedir «automático/siguiente/elige tú», ejecutar `claim --mode plan`, con `--task CÓDIGO` si eligió uno. El servidor puede asignar ayuda temporal según su política. Informar de lista de ejecución y lista original si difieren; conservar la asignación del catálogo. Ante un rechazo, refrescar `status` y proponer opciones vigentes. No repetir ciegamente una operación incierta.
7. Confirmada la reserva, seguir alcance, revisión de diseño, dependencias, `resume --mode build`, renovación, pruebas y aprobación de publicación de la skill. Seleccionar no autoriza a saltarse ninguna etapa.

## Casos de comprobación del agente

| Entrada / estado | Respuesta esperada |
| --- | --- |
| `/avanzar` sin reserva | Mostrar listas; después tareas; reservar solo tras elección o autorización automática. |
| `/avanzar lista 3` | Conservar Lista 3; guiar únicamente la tarea. |
| `/avanzar AUT-17` | Guiar la lista si no está indicada; conservar el código pedido y verificarlo. |
| `/avanzar AUT-17 lista 2` | Comprobar y reservar sin repetir preguntas de selección. |
| `/avanzar automático` | Recomendar/elegir según estado vivo y pedir reserva al servidor sin entrevistas innecesarias. |
| `/new`, luego `/avanzar`, con reserva propia | Ofrecer continuar esa reserva; no crear otra ni resetear identidades. |
| Lista llena, tarea ocupada o dependencias pendientes | Explicar el bloqueo real y ofrecer opciones compatibles. |
| Sin credencial / sin red | Diagnosticar incorporación; no reservar ni editar como si hubiera permiso. |
| Dos herramientas concurrentes en la misma carpeta | Detener el segundo inicio y usar una copia independiente autorizada; no cambiar de lista para esquivar la ocupación. |
| Usuario cancela antes de elegir | Terminar la guía sin reserva nueva. |

Hermes: `/new` abre una conversación y `/avanzar` invoca la skill. Un chat GPT sin acceso al repositorio ni herramientas de coordinación solo puede orientar; para ejecutar necesita un cliente habilitado. Codex usa `$avanzar`; el nombre visible de invocación depende del cliente, mientras el contrato y las listas son los mismos.
