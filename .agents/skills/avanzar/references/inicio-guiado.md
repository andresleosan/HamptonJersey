# Inicio guiado de /avanzar

Regla de Luis, 8-nov-2026: planificación sin reservas. La lista elegida y la herramienta no asignan una carpeta ni una identidad. Cada participante conserva copia exclusiva y los archivos privados propios.

1. Verificar GitHub y clasificar/conservar trabajo local según la skill. En Hermes conservar el candado local de su copia; esto no es una reserva remota de tarea.
2. Si el encargo es solo planificar, consultar `node scripts/avanzar-team.mjs plan --list N --task CODIGO` desde el clon comprobado. No requiere init/credenciales/coordinador y no modifica archivos privados. No consultar status ni recuperar trabajo de otra sesión como requisito para planificar.
3. Si falta lista, mostrar Lista 1–4 y sus áreas del catálogo; no presentar ocupación como bloqueo. Si falta tarea, mostrar hasta tres códigos reales, su utilidad y dependencias de futura construcción. Conservar elecciones previas; preguntar una vez.
4. Elegida la tarea, redactar documentos y revisar el diseño. No hacer claim/scope/watch/submit/pause/complete para planificación. No construir nada porque una dependencia siga pendiente.
5. Si el encargo es construir, aplicar el protocolo autenticado de equipo: recuperar pendientes build y operaciones inciertas; revisión del alcance con evidencia design sin reserva previa; después claim --mode build y comprobación atómica de dependencias/capacidad/recursos. Publicación requiere aprobación por SHA.

## Casos de comprobación

| Entrada | Resultado |
|---|---|
| Solo planificación, sin datos | Guiar lista/tarea desde catálogo, sin reservar |
| Planificar NOT-01 Lista 3 con NOT-11 pendiente | Redactar plan; registrar dependencia para construcción |
| Otra conversación usa la misma identidad VPS | Planificación local permitida; no adoptar ni modificar su reserva |
| Sin credencial del coordinador | Planificación permitida con repositorio verificado; construcción no habilitada |
| Sin GitHub/base verificable | Lectura/diagnóstico, no presentar copia como actualizada |
| Misma carpeta usada por otra sesión | Conservar trabajo y usar copia propia permitida; no editar concurrentemente |
| claim --mode plan en cliente actualizado | Alias del comando plan, sin POST ni lease |
| Construir sin evidencia/dependencias | Servidor rechaza build, sin construir |
| /new en Hermes | No cambia identidades ni libera reservas build; no condiciona planificación local |

Un chat sin repositorio solo orienta. No inventar reservas, revisiones, publicación ni pruebas del código por tener documentos listos.
