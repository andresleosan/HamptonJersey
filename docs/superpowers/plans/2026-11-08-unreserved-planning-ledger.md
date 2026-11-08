# Planificación sin reservas · ledger

8-nov-2026. Luis pidió cambiar la regla porque las planificaciones de dos conversaciones con identidad VPS se bloqueaban entre sí. Fuente de la causa: claim modo plan crea una reserva real y comprueba identidad, capacidad y recursos antes de planificar; submit plan solo acepta cero paths. Copia exclusiva limpia /tmp/hampton-not01-planes-FrgFJPvF, base GitHub comprobada 6d2f77922f797a1ffd6a23e2030308440ca81adf. NOT-11, SPR-01, PUB-06 y sus archivos se preservan.

La instrucción nueva autoriza esta corrección local del procedimiento que impedía avanzar; no se usa otra identidad ni se toma la reserva ajena PUB-06. No se ejecutan cambios de servicio, permisos, credenciales o producción. La reserva fallida de NOT-01 no existe y no se inventa su obtención.

Centinela: alerta de salida de código/documentación clasificada de forma puntual; cero bloques de clave privada en los archivos leídos y sin imprimir datos de entorno. No se guardan coincidencias ni valores; sin remediación de seguridad.

Comprobaciones:

- RED inicial: 5/5 regresiones nuevas fallaron por comando ausente, init requerido y reserva plan admitida. GREEN inicial 5/5; cobertura final específica 7/7.
- Focal de CLI/coordinador/integración: 115/115 correctas, incluidos red/reintentos, fixtures históricos y controles de alcance.
- Suite completa: 913/913 Node y14/14 Python correctas. Build, check:release y team:check correctos, 250 tareas/unidades. Advertencias existentes de módulos sin tipo y bundle >500kB; sin nuevas dependencias.
- Runtime Workers/SQLite local: 26/26 correctas. No se hicieron llamadas de mutación al coordinador activo para aplicar este cambio.
- Demostración real sin cargar credenciales: plan NOT-01 Lista3 devuelve status planning, reserved:false y buildAuthorized:false aun con la identidad VPS ocupada en otra sesión.
- Revisión independiente unreserved_planning_review: sin críticos/importantes; 7/7 pruebas específicas repetidas. Dos detalles menores de guía corregidos: reanudación plan solo histórica y referencia a tabla eliminada.
- Playwright: no aplica, CLI/protocolo sin interfaz modificada. El runtime local no acredita despliegue real.

Logs: /tmp/hampton-unreserved-{focal2,unit,runtime,build,release,team-check,final-focal}.log. La instalación de dependencias quedó dentro de esta copia; no cambió infraestructura.

Cierre: código y guías preparados para commit local; publicación/despliegue pendientes de autorización del SHA concreto. La regla solicitada ya gobierna esta conversación; otros clientes necesitan recibir la versión actualizada. Reservas plan históricas conservadas. NOT-01 puede continuar redactándose sin construir dependencias.

Siguiente recomendado Codex: /avanzar NOT-01 · gpt-6.1-terra · high.
Modelo recomendado Codex para NOT-01: gpt-6.1-terra · esfuerzo high · por qué: plan transversal de productores ya conocidos y contratos de eventos, sin implementación autorizada; requiere delimitar dependencias y aceptación, con complejidad menor que integrar la concurrencia de NOT-11.
