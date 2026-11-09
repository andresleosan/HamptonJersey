# NOT-11 · evidencia de productores y alcance

9-nov-2026. Construcción local sobre main dd37cf5. La migración0032 y el código de esta entrega todavía requieren publicación y aplicación remota aprobadas. PAQ-01 es una cola por etapas; este documento acredita solo NOT-11.

| Productor existente | Comportamiento conservado y comprobado |
| --- | --- |
| Registro web y duplicados, server/routes/public.js | Un aviso de aplicante/contacto con su evento original; trigger añade metadata/historia sin otro evento. Duplicado posterior a borrado limpia título, motivo y datos del evento, y cierra trabajo sin destinatario. |
| Alta desde panel, server/routes/applicants.js | Aviso informativo al Feed con metadata; Done de tarea nunca completa la búsqueda EST-09. Asignar/salir de New, resolver o archivar conserva el cierre por dominio existente. |
| Matches, server/match-store.js | Un aviso abierto por búsqueda; conserva el recálculo y eventos originales. Cero Found marca cierre por fuente incluso tras Done humano, sin permitir Reopen de una gestión agotada. |
| Visitas web y panel, server/routes/public.js y server/routes/inbox.js | Solicitud web conserva aviso; confirmar/cancelar resuelve la gestión de visita. Reserva por empleado conserva su evento y no gana un aviso nuevo por esta entrega. Enlace directo resuelve ID exacto fuera de la ventana500. |
| Tarea manual, server/notification-tasks.js | Follow-up desde aplicante/visita existente: UUID+actor identifica una creación; replay devuelve estado actual sin otra tarea/evento. |
| Proyección componible, taskStatements/syncTask | Contrato probado con fixtures: versión nueva actualiza misma clave y conserva responsable/plazo omitido; igual/vieja no cambia; resolución retira acción; cierre por fuente requiere reapertura explícita válida o episodio nuevo. No se atribuye a una fuente externa ausente. |
| Borrado y retención existentes | Aplicante/contacto/visita pierde título personal y task_reason; recibo/historial/eventos de tarea solo contienen IDs, revisión y hash. Fuentes tardías no reintroducen entidades eliminadas. |

Las regresiones están en tests/server/notification-tasks.test.mjs, notification-task-producers.test.mjs y las suites existentes de events, notifications, applicants, matches, retention y listing-events. La prueba tests/notification-tasks.e2e.cjs usa exclusivamente una base temporal local y dos empleados sintéticos.

No se certifican avisos nuevos de ventas, alquileres, fichas, pagos, respuestas de agencias, correo, Meta, dictado, llamadas de dos días o revisión del día21. NOT-01/NOT-08 y sus productores propios siguen pendientes; EST-18 conserva su base integrada y los futuros eventos por construir. Preferencias personales solo filtran informativos del Feed; no activan envíos externos.

Antes de producción: aprobar el SHA final, comprobar migraciones pendientes y marcador Time Travel, aplicar0032 mediante el flujo existente, publicar ese mismo SHA y verificar despliegue e integración en el coordinador. El recorrido por Playwright MCP permanece pendiente por fallo de arranque Chromium sandbox/root del entorno; el runner e2e local es evidencia separada y no se presenta como MCP.
