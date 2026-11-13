# NOT-01 · productores y límites de la entrega

**Conciliación del 13-nov-2026:** NOT-01 consta en main `79ddcb0`. La consulta histórica sin migraciones pendientes del 11-nov corresponde a un árbol que incluía 0033; véase [registro de conciliación](../conciliacion/2026-11-13-reg-est-not.md). No se ha repetido una consulta remota en esta sesión. El texto de construcción siguiente conserva la situación anterior a ese despliegue.

9-nov-2026. Base publicada3213c16636f797b7253795390553c8a34b86e519 (NOT-11/0032) y EST-18. Construcción NOT-01 en copia/reserva propias; esta evidencia describe código local hasta la autorización y verificación del nuevo SHA. No prueba canales externos activos.

| Fuente presente | Proyección | Comprobación |
| --- | --- | --- |
| Visitas reservadas por equipo y cambios confirm/reschedule/cancel/complete/no-show | Un Feed informativo por ID real de events; solicitado conserva su aviso legacy | Writers existentes, guardas de no-op/409 y rollback; tests events/viewings-admin/notification-events/producers |
| Ofertas y pasos/cierre de venta | Feed con destino offer/sale propio, aunque el evento auditado sea applicant | Relación con comprador/ID del evento; GET exacto autenticado; oferta cerrada en e2e |
| Cambios EST-18 de fichas | Feed sin alterar el evento, sus valores ni operaciones idempotentes | listing-events y regresión de writers; se excluye el duplicado sobre applicant |
| rental_events de alquiler/contrato/check/repair/payment/import | Puente único por rental_event_id; solo actor/IDs/subtipos/estado técnico |19subtipos, NULL/Unmatched/import agregado, move entre contratos del mismo inmueble, unassign y ausencia de texto bancario |
| Colas actuales de Rentals, Sales y To confirm | Identidad/ciclo estable,50por pass, cierre/reentrada según predicado real |10pruebas de reconciliación: JerseyBST, CAS y snapshot obsoletos, revalidación de alta/cierre,>50, ciclos/archivo/borrado/Done y runtimeD1real con61identidades50/11 |
| Productores legacy de aplicantes, registros repetidos, matches y viewing.requested | Su aviso existente; sin Feed adicional por trigger | Regresión existente y exclusión allowlist |
| must/source/call/capture/review21/dictation futuros | Solo adaptador interno futureTaskStatements, fase explícita y episodio estable | Fixture de resolución y captura fresca ifInserted en batch; módulos reales todavía no integrados |

La migración0033 conserva IDs, FKs, índices, historial y triggers EST-18; no proyecta eventos históricos. Ensayo poblado en SQLite transaccional y D1 local: notificación42 apunta al evento17,1evento/1historial conservados, foreign_key_check vacío. No se ha aplicado en producción.

Destinos tipados y contexto se comprueban contra el padre real. Pago es un destino propio; no depende de seguir Unmatched ni de aparecer en los24meses de un contrato. Borrado directo/cascada sanea y cierra; un evento tardío no restaura el destino ni contenido personal. Reconciliación usa reglas/dinero ya existentes y tiempo de procesamiento; no cambia cron10min. Un fallo queda aislado de email/retención y no imprime el mensaje de la fuente.

Alertas nativas: opt-in explícito, panel abierto/visible, Notification+Web Locks+BroadcastChannel disponibles. Texto fijo sin datos del cliente. Baseline global y deltas por(source_version,id),200por página, hasMore sin perder hermanos; cursor solo en memoria/canal técnico. Una nueva sesión no notifica históricos. Handoff/backlog pueden demorar; no se promete entrega en segundo plano ni una cota10min+30s.

Validación final y revisión: ver [ledger](../../../superpowers/plans/2026-11-09-not-01-event-inbox-build-ledger.md). MCP reintentado y bloqueado antes deabout:blank por sandbox/root; runner local separado se documenta con su nombre real. No se han modificado sandbox, credenciales, Access ni configuración de Hermes/VSCode.

987JS+14PythonPASS tras correcciones de revisión independiente. Regresiones RED→GREEN de selección/creación fuera200, handoff de cursor durante baseline y milestone exacto. Focal1280/390/zoom200 incluye foco no ocluido, asignación real del pago enlazado, cinco controles de oferta abierta y destinos/errores/vacío; cada control nuevo usa el flujo existente con servidor local, sin elementos decorativos sin acción.
