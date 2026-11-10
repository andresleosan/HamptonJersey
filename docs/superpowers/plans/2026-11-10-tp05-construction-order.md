# TP-05 · Orden de construcción y contratos compartidos

[Índice completo](2026-11-10-tp05-construction-index.md) · [Matriz por código](2026-11-10-tp05-construction-readiness.json) · [Continuidad](../specs/2026-11-10-tp05-continuity-scope-design.md). Orden de integración propuesto, no asignación de equipo ni permiso de construcción/publicación. Verificar main y actividad antes de comenzar. El catálogo conserva fotografía histórica; el maestro y los contratos actuales gobiernan el alcance.

## Líneas y entregables

| Línea | Orden comprobable | Condición que no se simula |
|---|---|---|
| Continuidad de main | Revisar evidencia de BUS-14 cerrado, NOT-01/NOT-11, REG-05/08/11/17, EST-17/18, ANA-08 y SPR-02 antes de nuevos cambios | No reconstruir módulos existentes ni presentar commit/migración local como activación real |
| Criterios y búsqueda | REG-04/06/07 y datos existentes → BUS-12/13/evaluación → BUS-15/revisión → proyecciones EST/SAP → BUS-17/18 y aceptación AUT-20 | Mascotas MUST estricto, parking flexible sin rebajar criterios confirmados; BUS-14 no se reabre por este orden |
| Inventario | BUS-06 esquema/store → BUS-19 política → BUS-09 normalizador/lectores → BUS-06 runner/cobertura → consumidores BUS-01/04/10 → activación diaria BUS-08 | Manifiesto BUS-21→22→23 y permisos/fixtures reales antes de pasadas externas; piloto propio no mercado completo |
| Contacto y presentación | AGE-04 identidad → AGE-03 consultas → AGE-05/06/08 envío/respuesta/llamada → AGE-09 evidencia → AGE-10 fotos/permisos → AGE-11/12 revisión/acceso | Dos días laborables desde envío real; availability fechada reutilizable; presentación siempre revisada; enlaces hasta revocación |
| Automatización y mensajes | AUT-09/10/11 registro/modo/salida → AUT-05/13 autorización/cupo/despacho → AUT-14/18 aviso → AUT-01/04 proyección; MSG-02/03 conversación humana → MSG-04/05 propuestas | Vía Pro por propósito verificada y payload privado, unknown sin reintento; humano funciona sin IA; Gmail seleccionado, sin Meta/WhatsApp |
| Web propia | PUB-04/05/06/07/08 datos por familia → PUB-12 criterios → PUB-02 Publish; PUB-01 alta móvil incorpora solo familias integradas | No exigir100%; Queue conserva sus validaciones; ninguna publicación externa |
| Trazabilidad | PUB-09 retirada atómica compuesta con PUB-02 y SPR-02 → diálogo/historial | No manifiesto de mercado ni PUB-15 como dependencia; no disponibilidad física inferida de retirada editorial |
| Medición y captación | ANA-01 actividad/ANA-05 productores reales; PUB-19 snapshot/aprobación; ANA-10 QR de póster por ficha (integrar visibilidad/caché PUB-16); PUB-20 folletos aplazada; PUB-10 intake según cobertura | Sin funnel/personas inventadas, umbral5 no anonimato probado, QR no personas únicas; activación aparte |
| Visitas | VIS-09 duración/traslado, VIS-10 restricciones → VIS-08/14/17 coordinación → VIS-12 Google → VIS-04/06/13 feedback/resúmenes internos/acciones | 30min+15min/+15 entre parroquias, máx8; no informes de actividad al propietario; Outlook/voz después |
| Datos de casos | ADM-18-capabilities independiente → ADM-12-access/auth → formularios ADM-18 → referencias ADM-19 y consumidores ADM-06/11/13/16 | No esperar ADM-18 completa antes de construir su guardia; evidencia externa manual, nunca repositorio ADM-05 |
| Finanzas | ADM-09 deuda/ajustes/revisión → ADM-10 snapshot/PDF económico → NOT-05 renta y ADM-21 CSV | Sin pagos ficticios, comisiones, movimiento de fondos o asOf histórico inferido; PDF propio no repositorio de documentos |
| Reglas y comunicaciones | ADM-17 versiones/ADM-20 aplicabilidad → ADM-03/11/14/15 casos/avisos; OFE-02 salida revisada, OFE-06 interno, OFE-07 restringido | Reglas/plantillas legales-fiscales realmente aprobadas; cada correo revisado; abogado/firma fuera de web |
| Continuidad de cuentas | PRE-06 validación/API → middleware/medios/reautenticación → aceptación2FA/Access; PRE-14 backup cifrado/restauración; PRE-16 fotos/cutover; PRE-28 titularidad | Código definido no configura cuenta, guarda clave, exporta base ni da de baja Wix; Hermes mantiene responsabilidad PRE-13/33 |

Las flechas representan componentes necesarios para el entregable consumidor, no una obligación de completar el padre entero. La matriz distingue consumer_component/scope. Los dos aparentes ciclos BUS-06/BUS-09/BUS-19 y ADM-18/ADM-12 se resuelven por esquema/guardas primero; no dos equipos escribiendo el mismo módulo a la vez. Dependencias externas figuran como gates, no como decisiones del usuario sin contestar.

## Interfaces entre productores y consumidores

| Propietario | Contrato consumido | Consumidores y prueba de integración |
|---|---|---|
| BUS-06 | createInventoryRun/claimSourcePage/commitObservationPage, páginas y outbox atómicos | BUS-09 y BUS-01/04/10: lease/policy/version vigente, replay sin duplicación, no ausencia por fallo |
| BUS-19 | getSourceAccess(env,sourceId,channelId), reviewSourceAccess | Fetch y commit revalidan el mismo canal/policy; DTO channel_id de mercado se adapta explícitamente al channel de SourceAccessDecision, no segunda política |
| BUS-09 | normalizeObservation y reader_id Hampton/manual; contratos nominales externos por fuente | Runner no toma fixture sintético por fuente aceptada, ni manual por lector automático construido |
| AUT-05/13 | ModelUseRequest, authorizeModelUse/reserva y model_requests/dispatch con generación/hash | MSG-04, REG-13, AUT-19, BUS-09 y PUB-13: autorizar por propósito, retención/fuente vigente y resultado humano, incierto sin otra llamada |
| AUT-11/17/OFE-02 | Salida por propósito, revisión ligada a fuente/destinatario/contenido y recibo | AGE/visitas/alquileres: no sent_at/plazo a partir de intento; accepted no prueba entrega o validez jurídica |
| ADM-18-capabilities | case_data_read/write y sensitive_finance, actor y pertenencia estructurados | ADM-12/19/OFE-07 y continuidad TP-05: sin files/URLs/autoasignación de permisos |
| ADM-12 | createCaseGrant/beginCaseChallenge/verifyCaseChallenge/resolveCaseActor | Formularios acotados, fecha elegida Jersey y cuota correo compartida100; no heredar duración AGE-12 ni persistir códigos en EmailUI |
| PUB-12/02 | Criterios y guardas del servicio real de Publish | Todos los caminos de publicación, incluido Queue y early rental; PUB-09 compone retirada sin duplicar guardas o historial |
| ADM-09/10 | Revisión financiera/clock y snapshot cerrado | NOT-05/ADM-21: mismos saldos/corte, CSV no mezcla versiones y ajuste no es pago |
| NOT-11/EST-18 | Descriptores/eventos reales y Statements componibles | Cada productor en su transacción; no tabla de entidad falsa, nueva categoría sin migrar enum ni UI que finja productor integrado |
| PRE-06 | Validación Access y autorización Hampton adicional | Rutas tempranas, auth=true, panel estático y medios Staff; origen privado cerrado aunque exista alias alternativo |

## Módulos compartidos y escritor único

- server/api.js/auth.js: PRE-06 valida identidad antes de puertas tempranas; nuevos routers de mercado/casos/automatización se integran después sin omitirla. Ninguna sesión usa el hecho de planificar para reservar archivos.
- server/routes/listings.js, listingBatch y eventos: coordinar PUB-01/02/09, familias de ficha y SPR-02 con un escritor del tramo designado al construir. Preservar últimos cambios de historial18e7e0b/80ad03d, no copiar versión antigua del fichero.
- server/jobs.js/reloj: reutilizar10min/AUT-07; BUS-08 diario01:00Jersey y demás productores se componen con pausas, presupuestos y scope, sin cron paralelo. El envío/freeze PRE-14 cubre también escritores tempranos y diferidos.
- notification-tasks/query/categories y admin Inbox: NOT-11 autoridad de tareas, NOT-08 categorías y NOT-05 pago faltante se modifican de forma coherente; productores integrados por entregable. No task-sync.js supuesto.
- Migraciones: aditivas, ordinal libre al construir;0038 ya existe. No renumerar/aplicar migraciones antiguas ni elegir ordinal fijo por este documento. Una migración en Git no prueba D1 remota.
- Contratos de actor/capacidad/datos financieros/medios: usar el propietario indicado, sin reconstruir ADM-05, OFE-08 o PUB-15 bajo otro código. Copias y notas existentes permanecen, sin nuevos procesos de documentos/comisiones/portales.

## Antes de declarar una tarea construida

Verificar el main vigente y la actividad compartida del constructor; elegir el tramo por dependencia real, no por orden numérico. Construir/pruebas focales y regresiones apropiadas, npm test/build/check:release y e2e/MCP cuando haya interfaz, con evidencia que distinga fallos previos y límites. Revisar independientemente y guardar estado por tramo. Publicación/migración/configuración requieren la autorización aplicable y evidencia del resultado; aceptación de fuentes/modelo/correo/legal no se reemplaza por fixtures. Esta revisión documental no ejecuta esas pruebas ni acredita funcionamiento de producción.


## Conciliación para publicación · 10-nov-2026
Solicitud expresa de Luis: publicar estos planes como Luismadef45. Main47dab2c incorporado conservando documentación propia; REG-17 captura ya publicada y tarea parcial hasta que VIS-17 consuma las franjas. No reconstruir captura ni repetir0026. Las referencias de preparación local/fechas anteriores permanecen históricas. GitHub acredita el commit documental tras el envío, no activación de funciones.
