# Planificación sin reservas

Decisión expresa de Luis, 8-nov-2026: en planificación no se crea ninguna reserva. Sustituye las reglas anteriores que pedían claim/scope/watch para redactar planes. Se autoriza implementar este ajuste de coordinación; NOT-01 y los demás módulos siguen solo en planificación. No hay permiso de push o despliegue.

La planificación usa una copia exclusiva y main comprobado. Puede leer contratos y redactar Markdown aunque otra sesión tenga reservas o la tarea tenga dependencias de construcción pendientes. `plan --task CODIGO --list N` consulta el catálogo local, comprueba la base y devuelve contexto con reserved:false y buildAuthorized:false. No necesita inicialización, identidad, credenciales ni red del coordinador, no modifica estado privado ni obtiene plaza, alcance, generación o lease. `claim --mode plan` y claim sin modo son alias de este camino para clientes actualizados. No inferir disponibilidad para construir de ese resultado.

El servidor rechaza crear nuevas reservas plan y rechaza convertir una reserva build a plan. Las reservas plan históricas y sus archivos no se borran ni se adoptan: su titular puede terminarlas con el protocolo anterior. No se aplica ninguna migración al servicio activo en esta entrega.

La revisión de diseño conserva su identidad coordinadora y puede atestar rutas exactas sin una reserva previa. Los recursos revisados son explícitos y cubren el contrato mínimo de la unidad. Antes de construir se toma una reserva build, que comprueba revisión vigente, dependencias, identidad, recursos y capacidad de forma atómica. Ampliar su alcance exige una nueva revisión; construir/publicar no se vuelve una operación offline.

Se conservan autenticación, same-origin, permisos, secretos, red, infraestructura y la aprobación por SHA de publicación. No hay cambio de UI: DESIGN.md no añade valores aplicables a este ajuste de CLI/protocolo. Playwright no aplica; sí pruebas de cliente sin credenciales, estado del servidor, dependencias, alcance y regresiones de publicación.

La skill y sus referencias deben separar selección para planificar de reserva para construir; el progreso de un plan se registra en su spec/plan/ledger y relevo, sin submit/pause/complete ni watch para planificación nueva. El tablero de reservas no representa los borradores locales ni debe mostrarlos como trabajo de producto integrado.
