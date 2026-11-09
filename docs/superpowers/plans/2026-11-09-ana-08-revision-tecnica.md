# ANA-08 · Revisión técnica de planificación

Fecha: 2026-11-09. Base: GitHub main `2084cb9ea895b729f8a28e3f2c42ce2057641389`.

**Resultado: mecanismo técnicamente viable y plan de implementación concretado para el tramo Inbox.** Falta revisión del usuario de la selección de cifras propuesta; no hay implementación ni aprobación de publicación. No equivale a completar el ANA-08 antiguo por email.

## Hallazgos y correcciones incorporadas

| Hallazgo del código real | Resolución en el plan |
|---|---|
| `server/routes/insights.js` termina el periodo hoy y varios filtros solo tienen límite inferior | Productor semanal independiente con ambos límites explícitos; conservar endpoint actual |
| Demanda y embudo se calculan con estado presente | No presentarlos como cifras históricas; resumen inicial de cuatro totales con semántica declarada |
| `events.entity_type` y `notifications.target_kind` tienen CHECK y varios triggers dependientes | Usar hecho de sistema `admin` y destino `collection` tipado; migración solo aditiva |
| Inbox delega todo detalle a InboxTask | Añadir enlace del subtipo y quitar controles de tarea; rechazo equivalente en backend |
| Un claim previo al cálculo puede quedar sin aviso tras una caída | Una sentencia INSERT SELECT y trigger transaccional, PK semanal; no lease |
| El índice impide dos búsquedas rent activas equivalentes de un contacto | Fixture de mismo contacto con rent y buy; no proponer un dataset inválido |
| El reloj despierta cada diez minutos y los triggers pueden retrasarse | Primera oportunidad lunes08:00, uso de ahora y recuperación en semana actual |

## Evidencia ejecutada

Estas son sondas de diseño fuera del código de la aplicación. No se instalaron dependencias, no se ejecutó una migración en Cloudflare, no se cambió un módulo de producción y no se enviaron avisos reales.

1. Python sqlite3 **3.50.4**, todas las migraciones versionadas hasta0035 aplicadas a una DB temporal ficticia. Prototipo mínimo de tabla/trigger nuevos e INSERT SELECT.
2. **11 comprobaciones SQL aprobadas**: conservación de filas/IDs existentes; rollback de informe y evento al fallar el aviso; dos conexiones concurrentes producen1/1/1; cuatro totales con ambos bordes; top y cobertura; evento/aviso/historia y source_version enlazados; reintento no altera payload; foreign_key_check limpio; ausencia de datos personales de fixture; rechazo de martes y de fecha imposible.
3. **6 sondas de calendario aprobadas**, mediante las funciones reales `jerseyNow`, `weekday`, `plusDays` y `jerseyDayStart`: antes de08:00, invierno, verano, semana de167 horas, semana de169 horas y recuperación el martes.
4. Dataset agregado esperado: `{views:5, viewing_requests:2, new_applicants:2, viewings_completed:1}`. Se sembraron también filas fuera del periodo y exactamente en su extremo final.

En la preparación de las fixtures, intentos iniciales fueron rechazados por restricciones existentes de contacto, operación y unicidad de búsqueda. Se corrigió el dataset de la sonda. El resultado11/11 corresponde a la ejecución final, no a esos intentos iniciales.

Archivos de sonda del taller: `/tmp/hampton-ana08-plan-probe.py` y `/tmp/hampton-ana08-plan-probe-results.json`. El script es un prototipo descartable; **no es la migración ni el productor que debe publicarse**. Sus aserciones no sustituyen los tests de la construcción. Resultado SQL preservado junto al plan como `2026-11-09-ana-08-sondas.json`.

## Límites de la validación

No se verificaron todavía el D1 local de Wrangler, despliegue real, el endpoint aún inexistente, el DTO implementado, el navegador ni la integración React. Son pasos obligatorios de construcción, no pruebas aprobadas en esta fase. La revisión fue propia; no se atribuye a un revisor independiente o a una sesión Codex externa.

Una sola sentencia SQL mantiene snapshot y efecto atómico. La documentación de D1 confirma además la transaccionalidad de las sentencias agrupadas; en la construcción se debe comprobar el trigger en D1 local y no limitarse al doble de node:sqlite. [D1Database](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Estado de entrega

- Diseño y plan nuevos, reconstruidos desde el relevo y el código actual.
- Decisiones del relevo conservadas: Inbox, lunes08:00 Jersey, semana anterior.
- Decisiones nuevas claramente propuestas: cuatro cifras/top5, Messages del Feed y recuperación durante la semana actual.
- Sin bloqueo de AUT-17 para este tramo; el email histórico de ANA-08 conserva su dependencia.
- Antes de construir: revisar alcance propuesto con el usuario y comprobar de nuevo main/numeración de migraciones.
