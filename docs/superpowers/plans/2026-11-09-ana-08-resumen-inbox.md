# ANA-08 · Resumen semanal en Inbox — Implementation Plan

> **For agentic workers:** Usar `superpowers:executing-plans` al recibir autorización de construcción. Ejecutar las tareas en orden; esta entrega es solo planificación.

**Goal:** Guardar y mostrar a Staff un resumen de la semana anterior, desde el lunes a las 08:00 de Jersey, una sola vez por semana.

**Architecture:** Insertar una foto agregada mediante una sentencia SQL; un trigger crea su evento y aviso en la misma transacción. Reutilizar el reloj, el Feed y las lecturas por empleado existentes. Abrir un detalle inmutable autenticado.

**Tech Stack:** JavaScript ESM, React, D1/SQLite, Workers scheduled, node:test y navegador local existentes; sin dependencias nuevas.

**Spec:** [Diseño y contrato de datos](../specs/2026-11-09-ana-08-resumen-inbox-design.md).

**Base revisada:** GitHub main `2084cb9ea895b729f8a28e3f2c42ce2057641389`, 2026-11-09. Plan reconstruido: el borrador temporal citado por el relevo no estaba disponible. Estado: validado técnicamente con sondas locales del mecanismo; pendiente de revisar el contenido propuesto con el usuario. No construido.

## Global Constraints

- Lunes a las 08:00, `Europe/Jersey`; semana natural anterior `[lunes,lunes)`.
- Inbox de Staff; sin envío ni activación de correo.
- Solo agregados; no nombres, emails, teléfonos, direcciones de clientes ni texto libre de eventos.
- Un informe, un evento y un aviso por `week_start`, atómicos e inmutables.
- Fechas del periodo histórico separadas del instante de generación. Nunca llamar al endpoint móvil `?days=7` para crear el resumen.
- Sin reconstrucción de tablas existentes; nuevo número de migración a verificar al construir.
- No cerrar ANA-08 histórico por email ni dependencias ajenas en el catálogo.

## Review Focus

1. Cambios GMT/BST y trigger atrasado: siete fechas locales con 167/168/169 horas; usar tiempo real de procesamiento.
2. Filas exactamente en ambos bordes y actividad del lunes posterior: incluir inicio y excluir fin en todas las cifras.
3. Dos ticks concurrentes, fallo del trigger y reintento: nunca duplicar ni dejar informe sin aviso.
4. Abrir varias semanas después, ficha eliminada y fallo de refresco: conservar cifras y referencias sin enlaces rotos ni datos de personas.
5. Dos empleados, preferencias y clientes antiguos: lectura independiente, Feed informativo sin controles de tarea, sin regresión en Unmatched payments.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| Crear `server/weekly-insights.js` | Calendario y productor SQL; contratos siguientes |
| Crear `migrations/0036_weekly_insights.sql` | Tabla aditiva y trigger; renumerar si necesario |
| Modificar `server/jobs.js` | Ejecutar el productor con `now()` y error aislado |
| Modificar `server/routes/insights.js` | Endpoint de lectura del informe; conservar GET actual |
| Modificar `server/notification-query.js` | Existencia, discriminación y enlace exacto de collection semanal |
| Modificar `server/notification-tasks.js` | Rechazar mutaciones de tarea sobre informes informativos |
| Crear `admin/src/WeeklyInsights.jsx` | Lectura del informe guardado, accesibilidad y estados |
| Modificar `admin/src/App.jsx`, `admin/src/InboxTask.jsx` | Ruta y detalle informativo sin controles editables |
| Crear `tests/server/weekly-insights.test.mjs` | Calendario, agregados, atomicidad, API y permisos |
| Modificar pruebas de jobs y notificaciones existentes | Integración y regresiones de tareas/lectura |
| Crear `tests/weekly-insights.e2e.cjs` | Recorrido Staff en navegador con datos ficticios |
| Crear ledger de construcción al autorizar | Evidencia RED/GREEN y resultado real, separado de este plan |

### Task 1: Calendario de semana cerrada y snapshot atómico

**Interfaces**

- Consume: `jerseyNow(d) -> {date,time}`, `plusDays(date,n) -> date`, `weekday(date) -> mon..sun`, `jerseyDayStart(date) -> iso` de los módulos existentes.
- Produce: `weeklyPeriod(ts: string) -> null | {from: string, until: string, to: string, startUtc: string, endUtc: string}` en `server/weekly-insights.js`.
- Produce: `weeklyInsightsPass(env, ts: string) -> Promise<{created: boolean, week_start: string | null}>`.
- Produce: tabla/trigger del diseño y payload `{version:1, period:{days:7,from,to}, generated_at, totals:{views,viewing_requests,new_applicants,viewings_completed}, most_viewed:[{listing_id,views}], coverage:{first_day}}`.

- [ ] **Step 1:** Añadir pruebas en `tests/server/weekly-insights.test.mjs`. Afirmar la tabla normativa de cinco instantes del spec, `weeklyPeriod('2026-11-09T07:59:00.000Z') === null`, recuperación el martes con el mismo `from`, domingo anterior todavía en su propia semana y no generar semanas antiguas tras una pausa larga. Instante no válido produce error antes de tocar DB.
- [ ] **Step 2:** Ejecutar `node --test tests/server/weekly-insights.test.mjs`; fallo esperado por módulo/contrato inexistente, no por una dependencia del taller.
- [ ] **Step 3:** Crear calendario con las funciones existentes. Crear tabla y trigger del diseño. Usar CHECK para lunes real y `week_until=date(week_start,'+7 days')`; JSON objeto con versión1 y agregados. Evitar `INSERT OR IGNORE`: solo ignorar conflicto de PK, propagar otros errores.
- [ ] **Step 4:** Añadir dataset con vistas en domingo anterior, lunes inicial y lunes final; `viewing_requests.created_at` justo antes, en inicio, antes del final y exactamente en final; solicitudes completadas por fecha; aplicante archivado; misma persona con una búsqueda rent y otra buy (dos rent activas incumplen el índice existente). Afirmar vistas=5 para dos filas de2 y3, excluir7 fuera; dos búsquedas cuentan2 aunque compartan contacto. Todos los queries de timestamps usan `<endUtc`.
- [ ] **Step 5:** Implementar el INSERT SELECT del productor, con parámetros fijos para periodo y `generated_at`, top5 ordenado también por referencia, `COALESCE` para cero y arrays vacíos. Las cuatro cifras y top5 se leen dentro de la sentencia. Las consultas usan fechas como en el spec, sin filtrar aperturas históricas por disponibilidad actual de la ficha.
- [ ] **Step 6:** Ejecutar dos llamadas con `Promise.all`, luego un tercer tick: `COUNT(weekly_insights)=1`, eventos de ese tipo=1 y avisos de esa clave=1; payload idéntico tras cambiar datos fuente y reintentar. Añadir trigger temporal de prueba que aborte insertar el aviso: los tres recuentos deben ser0; quitarlo y reintentar deja1/1/1. Esto comprueba recuperación sin lease ni estado working.
- [ ] **Step 7:** Sembrar avisos, historia, lecturas, operaciones y observaciones anteriores a la migración nueva; comparar filas e IDs después y `PRAGMA foreign_key_check` vacío. Verificar que `notification_event_feed` no añade otro aviso para el tipo nuevo.
- [ ] **Step 8:** Ejecutar `node --test tests/server/weekly-insights.test.mjs tests/server/notification-events.test.mjs tests/server/notification-categories.test.mjs`. Esperado: todas pasan y datos personales de fixtures no aparecen en payload ni evento.
- [ ] **Step 9:** Commit acotado de calendario, productor, migración y pruebas con mensaje `feat: store weekly Insights snapshots atomically`.

### Task 2: Reloj, lectura autenticada y contrato Inbox

**Interfaces**

- Consume: `weeklyInsightsPass(env, ts)` y tabla de Task1.
- Produce: `GET /admin/insights/weekly/:week_start -> payload` con sesión Staff; se incorpora al array de rutas de `server/routes/insights.js`.
- Produce: DTO semanal con `entity_type='collection'`, `entity_id='weekly-insights:YYYY-MM-DD'`, `link='#/insights/weekly/YYYY-MM-DD'`, `target_exists=true`, `can_reopen=false`, `phone=null`.

- [ ] **Step 1:** Añadir pruebas de job con scheduledTime antiguo y reloj real del lunes aprobado. Afirmar que se llama al productor con tiempo actual, no el antiguo. Error del productor no impide la pasada de email ya existente; error de notifications tampoco impide la semanal. Conservar retention y su orden actual; cada pasada nueva tiene try/catch independiente y mensaje constante.
- [ ] **Step 2:** Añadir pruebas de API: 401 sin sesión; 400 para fecha imposible o no lunes; 404 para lunes sin informe; 200 con el JSON guardado para cada empleado. Después de insertar actividad nueva la misma URL devuelve cifras idénticas.
- [ ] **Step 3:** Ejecutar focales para confirmar RED. Implementar integración en jobs después de notifications y antes de email; `await weeklyInsightsPass(env, now())`. Añadir ruta de lectura sin parámetros libres para SQL.
- [ ] **Step 4:** Implementar el destino collection en `targetExists` y `noticeDto`, validando prefijo y fecha reales; no tocar el CHECK de target_kind. Mantener la ruta `#/rentals?payments=unmatched`. La creación manual sigue admitiendo únicamente destinos manuales existentes; no se incorpora el destino semanal a `taskTarget` si ningún productor de tareas lo necesita.
- [ ] **Step 5:** Cubrir con pruebas `getTask`, lista Feed y marcado leído. Para el mismo aviso, A ve is_read=1 después de leer y B sigue0. El aviso no aparece en Needs action, no cambia sus contadores ni genera alerts urgentes. Messages oculto en preferencias lo oculta del Feed sin borrar datos.
- [ ] **Step 6:** Rechazar en servidor las acciones claim/assign/edit/deadline/done/reopen sobre el subtipo semanal antes de escribir. Usar400 con `Weekly Insights is an informational notice`. Mantener GET de detalle y PUT read. No rechazar mutaciones de otras tareas informativas sin pruebas de su contrato previo.
- [ ] **Step 7:** Sembrar un falso collection similar, evento ajeno y semana inexistente: no producir un enlace válido. No permitir enlazar eventos de clientes al informe a través de APIs manuales. Si se necesita ampliar sourceAllowsTarget, aplicar la condición exacta del spec.
- [ ] **Step 8:** Ejecutar `node --test tests/server/weekly-insights.test.mjs tests/server/jobs.test.mjs tests/server/insights.test.mjs tests/server/notification-tasks.test.mjs tests/server/notification-categories.test.mjs`. Esperado: PASS y contrato 7/30/90 del Insights existente conservado.
- [ ] **Step 9:** Commit `feat: deliver weekly Insights to the Staff feed`.

### Task 3: Detalle inmutable y navegación Staff

**Interfaces**

- Consume: DTO de Task2 y GET semanal.
- Produce: `WeeklyInsights({weekStart: string})`, export default en `admin/src/WeeklyInsights.jsx`.
- Produce: ruta `#/insights/weekly/:weekStart` en App, sin cambiar `#/insights`.

- [ ] **Step 1:** Preparar prueba e2e de un aviso semanal informativo y dos semanas distintas. Abrir Feed → Messages → aviso → `Open weekly Insights`; la URL conserva la fecha y la pantalla muestra el periodo guardado y sus cuatro cifras exactas.
- [ ] **Step 2:** Añadir pruebas de que Inbox no muestra propietario, vencimiento, Claim, Done ni Reopen en el subtipo; comprobar que las tareas manuales siguen mostrándolos. Marcar leído sigue funcionando desde el detalle.
- [ ] **Step 3:** Crear WeeklyInsights con copy del spec, fechas en en-GB, cifras0 visibles, aviso de cobertura incompleta y top5 de referencias. API devuelve también disponibilidad actual para enlaces como metadato separado, o se muestran referencias sin enlace; para este alcance escoger referencias sin enlace y evitar consulta adicional. Botón `Open current Insights` lleva a `#/insights` y explicita que es información actual.
- [ ] **Step 4:** Añadir enlace de título correcto en InboxTask y condición de render del formulario que excluya este subtipo exacto. Historial existente y lectura por revisión se mantienen. Sin nuevo grupo de permisos ni roles de dirección inferidos.
- [ ] **Step 5:** Probar carga, 404, red fallida, reintento y expiración; conservar informe previo con aviso si falla refresco. A390/1280 px, zoom200%, teclado y lector semántico: sin desbordamiento, encabezados ordenados, foco visible, status/error anunciados y Retry accesible. No animación nueva.
- [ ] **Step 6:** Ejecutar `node tests/weekly-insights.e2e.cjs` y regresión `node tests/notification-categories.e2e.cjs` mediante el taller local descrito en AVANZAR. Fallo RED inicial debe ser por ausencia del recorrido; GREEN con fixture ficticia. No usar producción para sembrar datos.
- [ ] **Step 7:** Commit `feat: show saved weekly Insights in Staff`.

### Task 4: Revisión y entrega de construcción, solo tras autorización

- [ ] Verificar de nuevo main y renumerar migración si hizo falta; cualquier cambio invalida sondas afectadas y exige repetirlas.
- [ ] Ejecutar focales de Tasks1–3, después `npm test`, `npm run build`, `npm run check:release` y e2e del recorrido si el taller soporta sus dependencias. Registrar resultados, no omitir fallos ajenos sin explicar su alcance.
- [ ] Revisar atomicidad en D1 local real (además de node:sqlite), preservación de migraciones, DTO y regresiones Inbox. El test double de helpers envuelve cada batch en transacción, por lo que no basta por sí solo para demostrar compatibilidad remota.
- [ ] Escribir ledger de construcción con SHA, pruebas reales, recursos tocados y pendientes. Actualizar checklist solo para el tramo Inbox; email y activación siguen separados.
- [ ] Entregar diff y ledger revisables. Ningún comando de este plan aprueba por sí mismo push, migración remota, deploy o activación. La autorización de esta sesión cubre documentación.

## Autorrevisión técnica de planificación

- El código base usa periodos móviles sin límite superior en timestamps; este plan tiene ambos bordes y no reutiliza la respuesta de `?days=7`.
- Se evitó reconstruir events/notifications: los enums `admin` y `collection` existentes bastan para el hecho de sistema y su colección tipada.
- No se reutilizan tareas con destino ficticio de cliente ni app_settings global como idempotencia; el PK de semana y el trigger atómico cubren caída/concurrencia.
- Se conservan preferencias, lecturas individuales e historia inicial, sin elevar las cifras Needs action.
- Alcance de cifras y comportamiento de recuperación quedan explícitos como decisiones nuevas propuestas, pendientes de revisión del usuario; no se atribuyen al borrador perdido.
- Evidencia de sondas y límites de esta validación en [revisión técnica](2026-11-09-ana-08-revision-tecnica.md).
