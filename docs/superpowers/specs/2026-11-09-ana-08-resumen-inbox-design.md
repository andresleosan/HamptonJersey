# ANA-08 · Resumen semanal de Insights en el Inbox de Staff

Fecha: 2026-11-09. Estado: diseño técnico reconstruido; pendiente de revisión del usuario antes de construir.
Base: `andresleosan/HamptonJersey`, `main` = `2084cb9ea895b729f8a28e3f2c42ce2057641389`.

El directorio temporal del relevo no existía al retomar. Este documento es nuevo: no acredita recuperar el borrador anterior ni sus decisiones no transcritas.

## Decisiones conservadas del relevo

- Destino: Inbox de Staff.
- Frecuencia: lunes a las 08:00, `Europe/Jersey`, respetando GMT/BST.
- Periodo: semana natural anterior, lunes incluido a lunes siguiente excluido.
- Alcance actual: planificar; no implementar, activar, enviar, migrar ni publicar.

La redacción antigua de ANA-08 en el checklist exige email a dirección. Este diseño entrega el tramo Inbox solicitado en el relevo. No permite marcar como completado el alcance histórico por email. AUT-17 no bloquea este tramo.

## Contenido propuesto para el primer resumen

Un aviso informativo compartido en Inbox → Feed → Messages, con título `Weekly Insights · 2026-11-02–2026-11-08` (el detalle formatea las fechas en en-GB), fechas de Jersey y hora de generación visible. Se guarda un informe inmutable para que abrirlo después no recalcule otra semana.

Cuatro cifras con el mismo significado que Insights, acotadas también por su límite superior:

| Campo | Fuente y filtro |
|---|---|
| `views` | Suma de `daily_stats.n`, `metric='view'`, `day >= from AND day < until` |
| `viewing_requests` | Filas de `viewing_requests` con `created_at >= startUtc AND created_at < endUtc` |
| `new_applicants` | Filas de `applicants` no archivadas al generar, creadas en `[startUtc,endUtc)`; son búsquedas registradas, no contactos únicos |
| `viewings_completed` | Filas de `viewing_requests` con estado `completed` al generar y `date >= from AND date < until`; no equivale a contar eventos de finalización |

Guardar además las cinco referencias de fichas más vistas y sus aperturas, ordenadas por vistas descendentes y referencia ascendente. No guardar sus textos, direcciones, teléfonos ni datos de aplicantes. Una ficha borrada después conserva su referencia en el informe, sin enlace si ya no existe. Una ficha borrada antes de generar ya no conserva `daily_stats` por el FK actual: indicarlo como límite, sin reconstrucción de datos eliminados.

Copy del detalle: `Figures for the previous calendar week, recorded at the time shown. Listing views count opens, not people.` y `New applicants counts searches that were not archived when this report was recorded.`. Las visitas completadas explican su criterio de fecha y estado. Si no hay datos, mostrar ceros y `No listing views recorded for this week.`. `coverage.first_day` procede de `MIN(day)` en daily_stats; si no existe o es posterior a `from`, advertir `View counting may not cover the whole week.`. Tener una fila anterior no demuestra cobertura continua: no prometerla.

El embudo actual depende de etapas presentes, y la demanda es expresamente la foto de hoy. No presentarlos como historia de la semana anterior. Los tiempos de respuesta actuales también carecen de corte superior y pueden incorporar respuestas posteriores. Para este primer resumen se enlaza a Insights para consultar esos bloques actuales; añadir historia completa exigiría otro diseño de fuentes. La selección de cuatro cifras y cinco referencias es una propuesta técnica nueva, no una aprobación histórica atribuida al usuario.

## Calendario y recuperación

`weeklyPeriod(ts)` recibe el instante real de procesamiento, no `controller.scheduledTime`. Usa `jerseyNow`, `plusDays`, `weekday` y `jerseyDayStart`, ya existentes.

- Calcular el lunes de la semana local actual usando fechas de calendario, nunca restando 7×24 horas al instante UTC.
- Antes de las 08:00 del lunes local no hay resumen elegible. Desde esa hora hasta el domingo se permite generar el de la semana anterior si falta.
- El reloj existente de diez minutos da la primera oportunidad a las 08:00; no se promete un SLA de entrega exacta de Cloudflare.
- Un fallo se reintenta en el siguiente tick. Tras una interrupción larga se crea únicamente el resumen debido de la semana actual; no se rellenan semanas antiguas automáticamente.
- Un trigger antiguo procesado ahora no publica el informe de su fecha antigua.
- El domingo a lunes de cambio de horario puede tener 167 o 169 horas. La semana sigue teniendo siete fechas locales.

Ejemplos normativos:

| Procesamiento UTC | Elegible | Desde, incluido | Hasta, excluido |
|---|---|---|---|
| 2026-11-09T07:59:00.000Z | No | — | — |
| 2026-11-09T08:00:00.000Z | Sí | 2026-11-02T00:00:00.000Z | 2026-11-09T00:00:00.000Z |
| 2026-07-06T07:00:00.000Z | Sí | 2026-06-28T23:00:00.000Z | 2026-07-05T23:00:00.000Z |
| 2026-03-30T07:00:00.000Z | Sí | 2026-03-23T00:00:00.000Z | 2026-03-29T23:00:00.000Z |
| 2026-10-26T08:00:00.000Z | Sí | 2026-10-18T23:00:00.000Z | 2026-10-26T00:00:00.000Z |

## Persistencia y concurrencia

Migración aditiva `0036_weekly_insights.sql` propuesta; el ejecutor debe renumerarla si main ya la ocupa.

Tabla `weekly_insights` WITHOUT ROWID:

- `week_start TEXT PRIMARY KEY`: lunes anterior en formato YYYY-MM-DD, validado como fecha real y lunes.
- `week_until TEXT NOT NULL`: lunes actual, exactamente siete fechas después.
- `generated_at TEXT NOT NULL`: instante UTC canónico de procesamiento.
- `payload TEXT NOT NULL`: JSON objeto, versión 1; solo campos agregados definidos arriba.

El productor ejecuta un único `INSERT INTO weekly_insights … SELECT` cuyos subselects calculan los cuatro totales y el top cinco dentro de la misma sentencia. No calcula primero en JS para escribir después. `ON CONFLICT(week_start) DO NOTHING`: el primero gana y el segundo no actualiza una foto existente.

Un trigger `weekly_insights_notice AFTER INSERT` inserta, en ese orden:

1. Evento `analytics.weekly_created`, `actor='system'`, `entity_type='admin'` (ya admitido por el esquema), `entity_id='weekly-insights:' || NEW.week_start`. `data` solo versión y fechas; no duplica el informe.
2. Aviso con `event_id=last_insert_rowid()` de ese evento, `category='message'`, `action_required=0`, `urgency='normal'`, `task_key='insights:weekly:' || NEW.week_start`, `target_kind='collection'`, `target_id='weekly-insights:' || NEW.week_start`. Reutilizar los triggers existentes para revisión e historia inicial.

No ampliar los CHECK de events/notifications ni reconstruir esas tablas. `admin` identifica un hecho de sistema; no crear un usuario ficticio. `collection` ya es un destino de colección interno. El tipo y prefijo se discriminan de forma estricta en las consultas/DTO. El trigger actual de Feed no reconoce `analytics.weekly_created`, por lo que no crea un aviso extra. Todo pertenece a la transacción de la sentencia: un fallo del aviso revierte también informe y evento; no existe claim que pueda quedarse bloqueado.

Los agregados son una foto de las filas disponibles al generar. No prometen reconstruir modificaciones o borrados pasados. No se recalculan ni editan desde el panel. Conservación sin política nueva de purga en esta entrega; no hay borrado programado. Definir otra retención será un cambio posterior explícito.

## Lectura e integración con Inbox

- `GET /admin/insights/weekly/:week_start`, sesión Staff existente; fecha real y lunes, 400 si es inválida, 404 si no existe. JSON del informe guardado, nunca listado de personas.
- `#/insights/weekly/:week_start` abre `WeeklyInsights.jsx`; `#/insights` mantiene su pantalla actual. Copy del enlace del aviso: `Open weekly Insights`.
- `targetExists` admite este destino collection solo si existe `weekly_insights.week_start` correspondiente; conservar `unmatched-payments` sin cambios de significado.
- `noticeDto` construye el enlace desde fecha validada y prefijo exacto. No convierte arbitrariamente otros destinos collection en rutas.
- No permitir crear manualmente este destino ni asignarlo a eventos no relacionados. Si se amplía `sourceAllowsTarget`, debe exigir `analytics.weekly_created`, `entity_type='admin'` y coincidencia completa de `entity_id` con `target_id`.
- El informe es informativo: sin Done, Reopen, Claim, propietario, vencimiento ni formulario de tarea; rechazar esas mutaciones también en servidor. Lectura por revisión mantiene su endpoint y recibo por admin; el resumen de uno no marca leído el de sus compañeros.
- Las preferencias Feed de Messages se respetan como en los demás avisos. No eleva contadores Needs action ni produce una alerta urgente del navegador.
- Reutilizar la lista, detalle e historial actuales. En `InboxTask.jsx`, esconder los controles editables para este subtipo y dar el enlace apropiado; no tocar el comportamiento del resto de avisos.
- Carga, vacío, error y reintento visibles; sesión expirada detiene lecturas. Si hay un informe ya cargado y falla refrescarlo, conservarlo con aviso.

## Límites

Sin email, exportaciones, cambios a la web pública, llamadas Meta, analítica por visitante, nuevos servicios ni modificaciones de cron. No se escriben cambios de actividad de contactos. Registrar errores con mensaje constante y referencia técnica de semana, sin payload ni filas personales.
