# VIS-09 · Núcleo de política de visitas

13-nov-2026. Avance parcial en copia aislada sobre `1813b01`: no hay rutas nuevas, cambios en la web o el panel, reservas reales, activación, push ni migración remota. La migración `0047` es provisional y debe comprobarse contra el historial de main antes de integrar. VIS-09 continúa parcial.

Se construyó `server/viewing-policy.js`, que valida los valores aprobados 30 minutos de duración, margen 15, 15 adicionales entre parroquias y máximo diario 8; admite la configuración versionada prevista sin inferir límites ilimitados. El evaluador revisa vecinos anterior y posterior, incluso a través del cambio de día de Jersey, y excluye la propia visita al reprogramar. Los registros sin instantánea no heredan una parroquia actual: quedan desconocidos y requieren margen conservador. Se devuelve un aviso de parroquia sin confirmar, sin datos personales.

La migración aditiva propone configuración por negociador e instantáneas por visita. Revocar, reemplazar o reasignar la configuración no puede restaurar una revisión antigua; al borrar una visita se elimina su instantánea mediante la clave foránea. La guarda SQL es un predicado preparado para que una escritura futura compruebe en la misma transacción la revisión, configuración, actividad del negociador, parroquia observada, máximo diario, citas vecinas y fechas históricas malformadas. No valida por sí sola los horarios, la política de la propiedad, la publicación, la identidad del empleado ni su autorización. El identificador excluido solo puede provenir del servidor al actualizar esa misma visita; nunca debe permitirse al insertar una nueva.

## Decisiones y límites

- Ruling: contar también las citas completadas o con ausencia dentro del máximo diario; solo las canceladas dejan de contar. Evita eludir el límite al completar una cita antes de crear otra, a costa de una lectura conservadora de la carga diaria.
- Ruling: una fecha no válida en una cita no cancelada del mismo negociador bloquea la guarda hasta revisión. Evita convertir una fecha ilegible en disponibilidad, a costa de requerir diagnóstico de datos históricos; la consulta de consistencia debe evaluarse con datos reales antes de activarse.
- Ruling: la hora histórica es una hora civil sin offset. Durante la ventana cercana al cambio horario de Jersey se devuelve `timezone_transition_review` y se rechaza la guarda, porque una hora puede no existir, repetirse o representar una separación real distinta. Es deliberadamente conservador y puede excluir varios días alrededor de cada cambio. Hace falta representar instantes/offsets y diseñar la revisión antes de activar el módulo; este comportamiento aún no afecta al producto.
- Ruling: el cambio de política no borra citas previas. La tabla de configuración no permite borrar un ajuste ni sustituir su identidad para volver a una revisión antigua; esto también impediría borrar un negociador que tuviera ajustes, coherente con la interfaz actual de desactivación. Su efecto sobre futuras operaciones administrativas debe revisarse antes de migrar.
- La prueba SQL cubre fichas propias y consultas generales; VIS-17 necesitará su propio contrato validado para inmuebles externos y participantes. Faltan integración en disponibilidad y todos los escritores de reserva/reprogramación, sesión y revocación del actor dentro del batch, horarios/excepciones y ventanas de propiedad, versión del contexto, snapshots y eventos como una unidad, edición accesible de ajustes y conflictos existentes, y validación de interfaz. No deben activarse rutas parcialmente.

## Verificación local

- TDD de límites, parroquias iguales/distintas/desconocidas, instantáneas ausentes, máximo, exclusión de la cita movida, día siguiente/anterior, cambio horario y fechas/estados malformados. El cálculo puro y el predicado SQL coinciden en 120 combinaciones deterministas.
- D1 local con todas las migraciones de esta base y siete reservas sintéticas previas: `0047` conservó todas las columnas de esas filas y las claves foráneas. Dos intentos concurrentes por la octava cita produjeron una sola reserva, una instantánea y un evento/aviso vinculados a esa cita. El cambio tardío de política, parroquia o actividad del negociador rechazó la escritura; un error forzado del evento revirtió reserva e instantánea. También se comprobó la separación a través de medianoche y el borrado en cascada de la instantánea.
- La guarda consulta fechas históricas del negociador para no omitir datos corruptos. Un ensayo SQLite en memoria con 15.000 filas sintéticas y 20 ejecuciones dio ~5,23 ms por consulta y usó el índice `(negotiator_id, date)`; no es una medición de D1 ni de datos reales.
- Suite completa sobre la base indicada: 1.312 pruebas Node y 25 Python; build, release, catálogo y paquetes correctos. El análisis estático encontró cero imports del módulo nuevo desde rutas o servicios existentes. No aplica navegador porque no se modificó interfaz.
- Las pruebas anteriores son locales. No acreditan concurrencia en el servicio remoto, autorización del actor, disponibilidad real, interfaz, migración aplicada o despliegue. Revisión independiente y pruebas de integración reales siguen pendientes.

## Revisión independiente

Revisión sin defectos bloqueantes del núcleo desconectado: 23 pruebas puras/SQLite y migración poblada con claves foráneas. La composición con la guarda pública conserva la exclusión de estados cerrados. La revisión no ejecutó D1 ni acredita uso en producción; las pruebas D1 del constructor siguen siendo evidencia local separada.

Sobre el main `c42c8cb`, con las migraciones financieras presentes solo en código, la suite integrada pasó 1.373 pruebas Node y 25 Python, build, release y catálogo. No se aplicaron migraciones remotas.
