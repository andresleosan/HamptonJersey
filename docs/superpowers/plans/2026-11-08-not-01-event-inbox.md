# NOT-01 Event Inbox implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task **cuando Luis pida construir**. El encargo actual solo redacta este plan, sin reservas.

**Goal:** Conectar eventos existentes al Inbox compartido y preparar adaptadores de futuros módulos sin duplicar trabajo o inventar sus estados.

**Architecture:** Proyectores componibles con los batches de negocio, contrato de tareas NOT-11, eventos internos EST-18 y puente mínimo desde rental_events. Reconciliación acotada para fechas derivadas, manteniendo el reloj actual. Navegador como aviso opcional genérico con panel abierto.

**Tech Stack:** JavaScript, React/Vite, Pages Functions, D1 y navegador nativo existentes.

**Spec:** [2026-11-08-not-01-event-inbox-design.md](../specs/2026-11-08-not-01-event-inbox-design.md).

## Global Constraints

- Solo planificación en este encargo. La decisión de planificación sin reservas prevalece; no claim/scope/watch para escribir estos documentos. La construcción futura sí necesita revisión, dependencias y claim build confirmado.
- NOT-11 se integra y prueba primero; EST-18 existente no se reconstruye. Conservar código/planes locales de otras tareas, las preferencias de panel y el rol admin común. No sustituir una prueba de fuente futura por una integración declarada.
- Todo copy/API inglés. Tenor Sans26/19px, Montserrat14px/1.5, labels12px, pesos400/500/600; paleta vigente ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d/bronze-dk#86542d/ok#2f6b4f/err#a32020/field-line#8f8a82/warn-bg#fff6e5.
- Contenedor1240px, página24px16px120px, tarjetas radio14/padding24, campos radio10, botones999px/padding10px20px, gaps8/12/16/24. Lista240–340px+detalle y una columna bajo820px; no aplicar propuestas genéricas de DESIGN como si fueran código vigente.
- Contraste4.5:1 texto/3:1 controles, foco2px offset2px, controles32/44px, teclado/labels/status/alert/errores asociados, zoom200% y reduced motion. Sin nuevas fuentes/dependencias/adornos. ENERGY1/RHYTHM1/MOTION1 por uso operativo.
- No inventar cadencias, gracia de pagos, plazos legales, responsables, consultas, estados de fuente o cierres de búsqueda. Reutilizar reglas del dominio; Done no cambia negocio. Sin cambios DNS/red/cron/servicios, push o migración remota.
- Máximo200 avisos,50 historial y50 entidades por reconciliación; consultas indexadas, cursor estable y sin N+1. Poll30s visible/sesión activa. Para vencimientos sin evento, latencia máxima objetivo del reloj actual10min+poll, sin promesa de60s.
- Sesión/same-origin, actor del servidor, SQL parametrizado, enums y enlaces por entidad. Sin datos de cliente en notificaciones del dispositivo, almacenamiento local, logs o auditoría duplicada.

## Skills aplicadas

Brainstorming/grill-me delimitan Inbox/Feed frente a NOT-05/08/09 y módulos futuros; writing-plans fija contratos. Impeccable y antislop durante planificación/construcción conservan la decisión operativa, los componentes y estados existentes. Taste para página nueva y redesign no aplican. Security-best-practices/frontend-security-coder validan referencias, privacidad y permisos del navegador. Web-performance-optimization exige proyección indexada y lotes acotados; ponytail reutiliza events/rental_events/NOT-11, sin otra cola o servicio.

## Review Focus

1. Un trigger listing registra un evento y last_insert_rowid exterior apunta a otra fila: test tarea2 verifica vínculo exacto y no-op.
2. Dos ticks o respuesta útil contra un cierre obsoleto: tareas1/3 prueban identidad/versionado, sin reabrir o duplicar gestiones.
3. La deuda desaparece o se retira una ficha sin evento nuevo: tarea3 también cierra episodios abiertos que dejaron de aplicar.
4. Avisos de navegador tras carga, permiso denegado o varias pestañas: tarea4 verifica baseline, deduplicación y ausencia de datos personales.
5. Enlace genérico abre otra entidad o no selecciona el registro: tarea4 prueba rutas reales, teclado y sesión caducada.

### Task 1: Proyección componible, migración e integridad

**Files:** modificar `server/notification-tasks.js` y `server/routes/notification-tasks.js` tras integrar NOT-11; crear `server/notification-events.js`, `tests/server/notification-events.test.mjs`; crear provisionalmente `migrations/0033_notification_events.sql` solo si es el siguiente número libre tras integrar dependencias. Verificar inventario y renumerar antes de construir; nunca editar migraciones publicadas.

**Interfaces:**

- `taskStatements(env, descriptor): D1PreparedStatement[]` extraído del contrato de syncTask, que conserva su firma como wrapper. Acepta referencia interna a evento recién insertado o ID concreto, nunca SQL/URLs enviados por HTTP.
- `noticeForEvent(event, domain): Descriptor|null` en notification-events: validación cerrada de fuente/target/urgencia y claves de episodio según spec. `projectionStatements(env, descriptor): D1PreparedStatement[]` compone las sentencias para el batch del escritor.
- Extender entidad rental si falta, categorías internas de aviso y target tipado según spec; conservar tipos anteriores/manual y preferencias. Evento puente con clave única rental_event_id. No backfill de avisos/historial.

- [ ] Añadir pruebas que detecten evento+aviso divergentes: forzar fallo de proyección revierte negocio; dos descriptores con misma clave/versión dejan una tarea y una entrada funcional de historial; versión vieja no sobrescribe y resultado útil actualiza/cierra el mismo ID.
- [ ] Ejecutar `node --test tests/server/notification-events.test.mjs`; comprobar el fallo real previo. Implementar extracción/proyector mínimo manteniendo firmas y guardas de NOT-11; repetir hasta PASS.
- [ ] Probar actualización de base poblada con todas las migraciones integradas y FK activas: IDs/filas de events,notifications,rental_events intactos, triggers e índices conservados, foreign_key_check vacío y rollback real ante error. Probar instalación limpia aparte.

### Task 2: Escritores existentes y enlaces precisos

**Files:** modificar `server/routes/inbox.js`, `server/routes/sales.js`, `server/routes/rentals.js`, `server/routes/rent.js`, `server/listing-events.js`, `server/routes/notifications.js`; crear `tests/server/notification-producers.test.mjs`; extender pruebas existentes de viewings/sales/rentals/listing-events/notifications.

**Interfaces:** consume projectionStatements de tarea1. Extensión opcional de listingEventStatements para ejecutar proyección después de las sentencias consumidoras de guardas y antes de cleanup; no romper consumidores sin esa opción. Link del servidor deriva de target y de la relación validada, no del título/data libre.

- [ ] Crear fixtures por fila de fuentes de spec: alta/repetición/matches existentes no duplicados; visita reservada por equipo/confirmada/cancelada; oferta/venta con transición y no-op; pago/obligación/reparación; precio/disponibilidad/confirmación de ficha.
- [ ] Ejecutar `node --test tests/server/notification-producers.test.mjs` para detectar avisos ausentes o vínculos incorrectos. Integrar cada evento/aviso dentro del mismo batch del dominio, conservando validaciones, versiones y respuesta HTTP actual.
- [ ] Comprobar que la proyección listing usa evento con revisión nueva sobre previous_revision, no un ID exterior ni el evento histórico más reciente cuando el guardado fue no-op. Conflicto409 no genera aviso de éxito.
- [ ] Probar enlaces exactos de dos ofertas/dos contratos de la misma persona: cada aviso abre su gestión. El borrado/anonimización retira contenido/enlace y no lo devuelve por detalle, historial o replay; otra búsqueda permanece intacta.

### Task 3: Vencimientos derivados y contratos de productores futuros

**Files:** crear `server/notification-reconcile.js`, `tests/server/notification-reconcile.test.mjs`; modificar `server/jobs.js`; leer/reutilizar `ARREARS_SQL`, `deadlines`, `complianceStatus` y `TO_CONFIRM` de sus módulos, sin duplicar política de dinero/plazos.

**Interfaces:** `notificationsPass(env, isoNow): Promise<{processed:number,hasMore:boolean}>`, máximo50 entidades por invocación, cursor por tipo y reintento seguro. Adaptadores futuros aceptan descriptor de MUST desconocido/fuente fallida/llamada/respuesta/captura/día21/dictado; su fixture no crea un módulo ni activa canales.

- [ ] Añadir pruebas de dos passes simultáneos, interrupción/reintento y cambio de día Europe/Jersey: una tarea por episodio, progreso sin saltos y lote máximo50. Comprobar también cierre al pagarse una deuda, completarse una obligación o salir una ficha de To confirm.
- [ ] Implementar reconciliación de colas existentes en el reloj actual, sin modificar su frecuencia. Mantener continuidad de retención/email y sus fallos separados. No crear recordatorios diarios de top20 ni reglas de48h.
- [ ] Definir fixtures de cada productor futuro y sus condiciones de idempotencia, resultado útil y cierre exacto; documentar el módulo que conectará su escritor. No marcar esos productores integrados ni enviar emails/Meta/Telegram por esta entrega.

### Task 4: Inbox, navegación y aviso opcional del navegador

**Files:** modificar `admin/src/Inbox.jsx`, `admin/src/InboxTask.jsx`, `admin/src/inbox-tasks.css` tras NOT-11; crear `admin/src/browser-alerts.js`, `tests/browser-alerts.test.js`, `tests/notification-events.e2e.cjs`; extender `admin/src/Viewings.jsx`, `Sales.jsx`, `SaleDetail.jsx` y `RentalDetail.jsx` solo para selección real por ID validado si falta. Usar editor de fichas existente, sin historial EST-18 nuevo.

**Interfaces:** list/detail conservan contrato NOT-11 con categorías internas/target/urgency. `observeUrgentNotices(notices, options)` establece baseline en primer poll correcto, alerta solo episodios nuevos después y no retorna contenido de cliente al dispositivo. `enableBrowserAlerts()` se llama exclusivamente por acción del usuario y expone granted/denied/unsupported.

- [ ] Probar permiso aún no pedido, denegado, API ausente y sesión caducada; no lanzar prompt al cargar y mantener Inbox funcional en todos los casos.
- [ ] Implementar el botón y estado con labels/copy de spec. La alerta nativa contiene solo los dos textos genéricos acordados, tag por ID y click a Inbox autenticado. Probar ausencia de nombres/teléfonos/direcciones/importes, baseline sin alertar histórico y coordinación entre pestañas con metadatos mínimos.
- [ ] A1280/390 recorrer cada destino desde un aviso real local: solicitud/confirmación, oferta/venta, cobro/obligación/reparación y ficha. Confirmar selección correcta o error404 comprensible; no generar enlaces que ignoren el ID.
- [ ] Probar recuento global frente a filtros, vacío/carga/error, respuesta útil mientras se edita, dos empleados, polling y borrador, foco tras cierre, teclado, zoom200%, reduced motion, consola/red sin fallos y objetivos32/44px.

### Task 5: Verificación, revisión y entrega futura

**Files:** spec/plan/ledger; `docs/roadmap/tasks/NOT-01.json`, ESTADO y salidas del generador del roadmap cuando se construya, preservando el progreso de otras tareas.

- [ ] Reservar alcance de construcción revisado incluyendo rutas anteriores, documentos/generados y e2e:hostId, solo al empezar código. Confirmar integración de NOT-11 y evidencia de EST-18; no alterar su estado para pasar una dependencia.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e` y `E2E_SCRIPT=tests/notification-events.e2e.cjs npm run test:e2e`. Runtime/fixtures locales; nunca datos reales ni cambios de red para superar pruebas.
- [ ] Playwright MCP local1280/390: flujos, validaciones, vacíos/errores, teclado/foco, zoom y consola/red; guardar capturas y límites reales. Si falla el entorno, registrar pendiente, no declarar aprobado.
- [ ] Revisión independiente del diff y carreras/migración; corregir críticos/importantes y repetir pruebas afectadas. Roadmap parcial por futuros productores/canales todavía no conectados; no declarar NOT-01 completo por fixtures.
- [ ] Comunicar SHA nuevo, resultados, migraciones y límites; publicación y producción requieren autorización separada. Este plan no ejecuta ninguno de esos pasos.
