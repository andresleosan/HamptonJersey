# Avanzar: progreso compartido y continuidad entre equipos

Estado: diseño aprobado por Luis con «si», 9-nov-2026. Corrección posterior: algunas sesiones solo preparan planes; distinguir planificación de construcción y conservar su relevo.
Base consultada: main `55c470026b1c1909acf68ec244f71a7286f2a16f`.

## Petición

Al usar `/avanzar`, elegir un paquete y trabajar una tarea, el checklist y el tablero deben mostrar el avance para que Hermes u otra persona puedan continuar y no construyan la misma tarea a la vez. La selección automática sin argumentos sigue vigente.

## Situación comprobada

`coordination/src/public-worker.mjs` sirve una vista de lectura de `TeamCoordinator.getBoard()`. `public-board.mjs` deriva la actividad de las reservas antiguas. El procedimiento vigente de avanzar dejó de escribir esas reservas; por ello el código actual no garantiza reflejar trabajo nuevo. La consulta HTTP de `/` y `/v1/board` devolvió 403 desde este entorno; no se acredita la representación en vivo ni se modifican controles para consultarla.

## Enfoque propuesto

Añadir un registro ligero de actividad separado de las reservas históricas, reutilizando almacenamiento y autenticación existentes. El tablero público conserva solo lectura. Las reservas antiguas se conservan sin operarlas. No se reactivan las exigencias de catálogo, evidencias remotas, leases, renovaciones ni turnos del protocolo antiguo.

Un checklist guardado únicamente en Git requiere publicar para hacerse visible y no puede resolver dos inicios simultáneos. Reactivar todo el coordinador contradice la decisión previa de Luis. El registro mínimo compartido permite resolver ambas necesidades sin ese protocolo.

## Comportamiento para aprobar

1. Al empezar: consultar el estado compartido y mostrar paquete, tarea, etapa y alias del equipo. La planificación se registra como información y sigue sin reservar construcción. Una sesión que solo planifica cierra en «Plan preparado», con referencia y siguiente paso, sin marcar construcción o producto como terminados ni impedir que otro equipo construya.
2. Antes de construir: registrar atómicamente un único constructor por tarea. Ante dos intentos simultáneos, solo uno obtiene la confirmación; el otro retoma su trabajo propio o selecciona otra tarea viable. El registro de actividad no autoriza publicar ni migrar.
3. Durante el trabajo: actualizar hitos reales, bloqueo y siguiente paso. Nunca elevar el estado de producto a «hecho» por haber elegido una tarea o escrito un plan.
4. Al cerrar: distinguir «pausada», «en revisión», «construida pendiente de publicar» y «publicada verificada». Guardar referencia de entrega y SHA cuando corresponda. Una tarea parcial conserva exactamente qué falta.
5. Para continuar desde otro equipo: mostrar el relevo y aceptar explícitamente el cambio de responsable. La fecha antigua por sí sola no libera trabajo; evita que una desconexión produzca dos constructores.
6. Si no hay contacto con el registro: indicar «actividad sin verificar», conservar todo el trabajo y permitir diagnóstico/planificación. No afirmar exclusividad para empezar una construcción duplicable. Comportamiento aprobado con el diseño.
7. ESTADO y checklist versionados siguen reflejando entregas y pruebas en su commit. La actividad en curso se consulta en vivo y no exige un push por cada paso.

## Información visible y permisos

Público: código de paquete/tarea, alias del equipo, etapa, hito resumido, fecha, pendiente y referencia pública de entrega. Excluir emails, identidades privadas de sesión, rutas del VPS, logs, credenciales y texto privado de Luis. No publicar texto libre arbitrario procedente de herramientas.

Escrituras solo autenticadas con el mecanismo existente y limitadas a la actividad del actor; terceros no pueden cerrar o apropiarse de su trabajo. Mantener idempotencia y control de versión para reintentos y respuestas tardías. No abrir rutas públicas de escritura ni ampliar roles, cambiar claves, Access o wrappers. La capacidad de los equipos para usar esa autenticación debe comprobarse sin imprimir secretos; no está acreditada por esta propuesta.

## Superficies y reglas existentes

Revisar `scripts/avanzar-team.mjs`, un módulo de actividad independiente, el almacenamiento y las rutas privadas de `coordination/src/`, la proyección pública y `docs/roadmap/tablero-publico.js`, más la skill y AVANZAR. Definir las rutas definitivas al redactar el plan aprobado.

La interfaz conserva sus clases y tokens actuales: solo añadir responsable/etapa/relevo dentro de las tarjetas existentes, con estado textual y foco estable durante polling. D19: explicaciones del tablero de desarrollo en español, sin cambiar el idioma inglés del producto Hampton. DESIGN.md del producto no se extrapola a un rediseño del tablero. Verificar escritorio 1280, móvil 390, teclado, zoom y estados de error. Sin nuevas fuentes, imágenes ni librerías.

## Criterios comprobables

- Dos clientes intentan construir la misma tarea simultáneamente: una sola asignación confirmada, sin sobrescribir al otro.
- Un reintento idéntico no duplica actividad; una actualización de versión antigua no borra el avance reciente.
- Planificar no toma exclusividad de construcción ni declara producto terminado.
- El tablero refleja inicio, progreso, pausa, revisión y publicación por separado; conserva la última información con aviso si falla la conexión.
- El relevo permite continuar el tramo pendiente sin reconstruir una entrega publicada.
- No se modifican reservas antiguas ni autorizaciones de publicación; escrituras anónimas y de otro actor se rechazan.
- La vista pública no filtra identidad privada, datos personales ni archivos privados.

## Revisión de decisiones

Brainstorming: petición y enfoque documentados, sin implementar antes de aprobación. Grill-me: concurrencia, desconexión, relevo, planificación sin reserva, estados y publicación resueltos como propuestas explícitas. Seguridad: preservar autenticación y proyección mínima. No hay autorización de despliegue ni cambio al servicio en este documento.

Siguiente paso autorizado: plan de implementación, pruebas de concurrencia/contrato, construcción y revisión independiente; entregar el SHA exacto para el permiso de publicación.
