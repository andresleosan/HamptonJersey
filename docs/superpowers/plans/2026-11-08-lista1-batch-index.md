# Lista1 · Tanda de planes del8-nov-2026

> Versión histórica de la primera tanda. Para decisiones y situación documental vigentes, leer el [maestro final](2026-11-08-lista1-build-ready.md) y el [índice final](2026-11-08-lista1-tanda2-index.md). Las propuestas/pendientes originales que siguen abajo no prevalecen sobre respuestas posteriores.

**Estado de entrega: planificación documental.** No hay construcción, reservas, migraciones, envíos, purgas o publicación en esta tanda. Base GitHub/main93f8f25c0aa029f1850f0c46855fb89fd524a8e3 comprobada14:14UTC, copia exclusiva `/tmp/hampton-lista1-batch-20261108`. Las entregas previas se conservan byte a byte y se reúnen aquí para revisión.

## Cómo leer la entrega

«Plan cerrado» significa que comportamiento, contratos y pruebas futuras están definidos en su alcance. **No significa que la tarea esté construida, completa en producto o habilitada para empezar sin sus dependencias.** Los planes de tramos lo indican; se debe registrar el desglose/revisión de alcance en catálogo si es necesario antes de claim build, sin saltarse las dependencias del código padre. Sin decisión de canal apto, datos institucionales o validación legal, se conserva ese pendiente con nombre y responsable.

16planes nuevos cerrados en su alcance y1propuestaREG15 pendiente;59 códigos revisados:17 grupos de planes nuevos cubren31códigos en sus alcances (incluidos aliases y tramos);3planes previos cubren4códigos;14puntos figuran hechos y no se vuelven a planificar;5son entregas existentes que requieren verificación/publicación/activación;5necesitan decisiones externas para cerrar su plan completo. REG-15 dentro de los17 es propuesta pendiente hasta respuesta específica. Los estados del catálogo se conservan: este índice no es estado vivo del coordinador ni nueva evidencia de integración.

## Planes nuevos

| Plan | Códigos Lista1 | Alcance y límites |
|---|---|---|
| [Matching canónico y extensión comercial](2026-11-08-l1-match-review-evaluation.md) | BUS-12, REG-04 | Completo en el alcance descrito; reglas legales sin validar quedan pending, no se reinventan. |
| [Revisión y aprobación humana](2026-11-08-l1-match-review-manual.md) | BUS-15, BUS-16; EST-18 productores | BUS-16 se absorbe como prohibición de autoaprobación; sin nuevo motor Auto. |
| [Dimensiones y esperas independientes](2026-11-08-l1-followup-states.md) | EST-13, EST-04, EST-05, EST-06 | EST-05/06 son aliases reconciliados; no transiciones automáticas históricas. |
| [Seguimiento por vivienda y operación](2026-11-08-l1-property-followup.md) | BUS-18 | Tramo seguimiento; captura y términos de comisión siguen en gestión humana independiente. |
| [Observación, baja acreditada, papelera y purga](2026-11-08-l1-availability.md) | EST-16, EST-15, EST-07, EST-19; EST-18 productores | D02/D10 aprobadas. El contrato de evidencia conserva contenido si es necesario; ningún borrado hoy. |
| [Interés, visitas, ofertas y acuerdo](2026-11-08-l1-match-lifecycle.md) | EST-14, EST-08; EST-18 productores | EST-08 alias. Ninguno cierra búsqueda ni convierte una vivienda en no disponible para todos. |
| [Ready for review, Let agreed y Let](2026-11-08-l1-editorial.md) | EST-17; EST-18 productores | Flujo editorial separado de disponibilidad comercial, sin crear contrato de alquiler automáticamente. |
| [Grupos de coincidencias en la ficha](2026-11-08-l1-applicant-matches.md) | SAP-03 | Consume EST-13, misma semántica acordada en SAP-02. |
| [Pestañas Viewings y Messages](2026-11-08-l1-applicant-links.md) | SAP-08 | Por tramos: visitas, chat y correo; no asociar personas por coincidencia de email/teléfono sin confirmación. |
| [Acciones de presentación y visita](2026-11-08-l1-applicant-actions.md) | SAP-09 | Consumidor de AGE-11/VIS-17; no elige el disparador final de presentación ni confirma al anunciante por reservar hueco local. |
| [Criterios confirmados, zonas explícitas y acuse de alta](2026-11-08-l1-registration-criteria.md) | SAP-10, REG-06, REG-12 | No guardar con Use this; pausa fuera. Acuse público no revela contacto previo. |
| [Save this search por email](2026-11-08-l1-registration-alerts.md) | REG-15 | Propuesta pendiente de respuesta específica sobre doble confirmación/resumen diario/cancelación; no clasificar cerrada hasta respuesta. |
| [Revisión interna a21días y etiquetas](2026-11-08-l1-review-21-days.md) | BUS-17, EST-10, EST-11 | D03/D04/D09 aprobadas; calendario/desempate detallados son decisiones técnicas del plan, no citas de Luis. |
| [Registrar oposición al marketing](2026-11-08-l1-marketing-objection.md) | PRE-10 (tramo manual) | Tramo manual cerrado; canales y validación jurídica no se declaran terminados. |
| [Tours externos solo tras elegir cargarlos](2026-11-08-l1-tour-privacy.md) | PRE-11 | Control técnico de carga; no garantía jurídica o de ausencia total de cookies del proveedor. |
| [Validación integrada A01–A16 y X01–X05](2026-11-08-l1-journey-validation.md) | AUT-20 | Plan de pruebas; solo su ejecución futura real podrá completar AUT-20. |
| [Aviso al lado de la reserva y vuelta segura](2026-11-08-l1-privacy-links.md) | PRE-09 (tramo enlaces) | Razón social/JOIC/textos jurídicos/portal siguen pendientes; no se inventan datos. |

Cada plan enlaza su spec y tiene ledger del mismo nombre con sufijo -ledger. Las casillas están abiertas: son instrucciones futuras, no pruebas ejecutadas.

## Planes anteriores reunidos sin cambiar su contenido

| Plan | Códigos | Situación |
|---|---|---|
| [BUS-14](2026-11-08-bus-14-match-ranking.md) | BUS-14 | Ranking sobre inventario actual, umbral/tope/bonus y paginación; conservar su alcance anterior. |
| [SAP-01](2026-11-08-sap-01-search-progress.md) | EST-01 → SAP-01 | Productor de progreso de cruce inicial y UI; no implica inventario común completo o consulta externa ejecutada. |
| [SAP-02](2026-11-08-sap-02-match-summary.md) | SAP-02 | Found incluye approved; availability confirmed subconjunto de approved, con evidencia vigente de la búsqueda. |

Los documentos anteriores tienen su fecha/base originales. Las adaptaciones a main futuro, número de migración y contratos canónicos deben revisarse al construir, sin reescribir aquí su evidencia histórica. Los nuevos productores añaden los puertos que estos consumidores requieren; no declarar sus contratos integrados porque existan propuestas compatibles.

## Orden y contratos compartidos

1. Mantener BUS-14/REG-08 residenciales ya diseñados; no sustituirlos por otra reimplementación. Verificar activación de0031 cuando haga falta.
2. BUS-10 (otra lista) aporta identidad/inventario común como contrato acordado e integrado según cada catálogo; BUS-12 produce candidatas canónicas y BUS-15 decisiones humanas versionadas.
3. EST-16 observa publicaciones y acredita disponibilidad; EST-15 excluye por alcance y protege contra anuncios viejos antes del barrido/contacto. EST-19 purga archivos solo después de SPR-03 y política/pins/fences verificados. No mezclar esta política con retención de personas.
4. EST-13 consume candidatas, decisiones, disponibilidad y consulta compartida AGE-03 sin duplicar sus dominios; produce matchSummaryFactsQuery para SAP-02, followupCardsQuery para SAP-03/BUS-18 y followupWorkFactsQuery para EST-04/EST-10. Awaiting applicant exige entrega acreditada, no solo confirmar disponibilidad.
5. SAP-08/SAP-09/EST-14 consumen vínculos y contratos de AGE-11/12 y VIS-17; si un canal no existe no se muestra como enviado. Cada plan conserva las dependencias específicas y su separación construcción/activación.
6. BUS-17 mantiene tarea por episodio y top20 interno con fuentes incompletas visibles; nunca cambia criterios ni envía alternativas. AUT-20 ejecuta finalmente los16criterios+5transversales sobre todos los módulos reales.

La migraciónNNNN de cada grupo se numera al integrarse sobre main vigente: no se reservan números en esta planificación. Componer evento/mutación/tarea en un batch real; NOT-11/NOT-01 proveen sentencias componibles, no un segundo batch presentado como atómico. Read adapters propuestos no acreditan que su productor exista.

## Decisiones de Luis incorporadas

- D02:48horas alquiler/7días compra, configurables; contradicción material exige reconfirmación.
- D03/D04/D09: no reiniciar reloj al editar criterios; una tarea por episodio; ordenar por imprescindibles incumplidos y diferencias explicadas, sin sumar unidades distintas.
- D10: purga6meses solo originales/derivados/paquetes sin uso activo; conservar identidad mínima, referencias, evidencia necesaria e historial de clientes/consultas/visitas.
- Semántica SAP-02 ya aprobada: found / approved / availability confirmed. D05 (disparador presentación), D06 (consulta desde MUSTdesconocido), D12 (pausa) y las decisiones ajenas que sigan abiertas no se dan por resueltas. D06 continúa desactivada y D12 fuera del alcance; SAP-09 no elige D05 por el usuario.

## Los59códigos, sin omisiones

| Código | Estado catálogo observado | Clasificación de planificación | Referencia / pendiente |
|---|---|---|---|
| SAP-01 | parcial | Plan anterior conservado | [plan](2026-11-08-sap-01-search-progress.md) |
| SAP-02 | parcial | Plan anterior conservado | [plan](2026-11-08-sap-02-match-summary.md) |
| SAP-03 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-applicant-matches.md) |
| SAP-04 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| SAP-05 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| SAP-06 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| SAP-07 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| SAP-08 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-applicant-links.md) |
| SAP-09 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-applicant-actions.md) |
| SAP-10 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-registration-criteria.md) |
| AUT-19 | pendiente | Decisión externa / plan completo no cerrado | Elegir/verificar carril autenticado apto para voz y criterios privados; no Telegram ni Hermes limitado a datos públicos. Edición manual confirmada cubierta por SAP-10, no dictado completo. |
| AUT-20 | pendiente | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-journey-validation.md) |
| BUS-12 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-review-evaluation.md) |
| BUS-13 | parcial | Decisión externa / plan completo no cerrado | Hampton aporta categoría de viviendas indicadas y abogado valida reglas de residencia. No se reconstruye una tabla legal ni se afirma validada por tener matching. |
| BUS-14 | parcial | Plan anterior conservado | [plan](2026-11-08-bus-14-match-ranking.md) |
| BUS-15 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-review-manual.md) |
| BUS-16 | replanteado | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-review-manual.md) |
| BUS-17 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-review-21-days.md) |
| BUS-18 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-property-followup.md) |
| EST-01 | pendiente | Plan anterior conservado | [plan](2026-11-08-sap-01-search-progress.md) |
| EST-02 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| EST-03 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| EST-04 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-followup-states.md) |
| EST-05 | replanteado | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-followup-states.md) |
| EST-06 | replanteado | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-followup-states.md) |
| EST-07 | replanteado | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-availability.md) |
| EST-08 | replanteado | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-lifecycle.md) |
| EST-09 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| EST-10 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-review-21-days.md) |
| EST-11 | replanteado | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-review-21-days.md) |
| EST-12 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| EST-13 | pendiente | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-followup-states.md) |
| EST-14 | pendiente | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-lifecycle.md) |
| EST-15 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-availability.md) |
| EST-16 | pendiente | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-availability.md) |
| EST-17 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-editorial.md) |
| EST-18 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-review-manual.md); conexión de productores en todos los grupos pertinentes, base publicada y vista aplazada conservadas |
| EST-19 | pendiente | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-availability.md) |
| REG-01 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| REG-02 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| REG-03 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| REG-04 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-match-review-evaluation.md) |
| REG-05 | parcial | Código/entrega existente; no reconstruir | Verificar evidencia de publicación/migración/activación por flujo autorizado. REG-11/17 tienen publicación en reconciliación pese a checklist desfasado. |
| REG-06 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-registration-criteria.md) |
| REG-07 | parcial | Código/entrega existente; no reconstruir | Verificar evidencia de publicación/migración/activación por flujo autorizado. REG-11/17 tienen publicación en reconciliación pese a checklist desfasado. |
| REG-08 | parcial | Código/entrega existente; no reconstruir | Verificar evidencia de publicación/migración/activación por flujo autorizado. REG-11/17 tienen publicación en reconciliación pese a checklist desfasado. |
| REG-09 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| REG-10 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| REG-11 | parcial | Código/entrega existente; no reconstruir | Verificar evidencia de publicación/migración/activación por flujo autorizado. REG-11/17 tienen publicación en reconciliación pese a checklist desfasado. |
| REG-12 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-registration-criteria.md) |
| REG-13 | pendiente | Decisión externa / plan completo no cerrado | Misma decisión de carril C2 (Hermes autorizado o modelo local); confirmar procesamiento/conservación antes de elegir proveedor. El texto libre actual se conserva. |
| REG-14 | hecho | Ya hecho; no replanificar | Conservar implementación y evidencia existentes; no nueva verificación de producción en esta tanda. |
| REG-15 | bloqueado | Propuesta pendiente de decisión | [plan](2026-11-08-l1-registration-alerts.md) |
| REG-16 | bloqueado | Decisión externa / plan completo no cerrado | Consentimiento específico para valoración y revisión de abogado/PRE-33; no reutilizar consentimiento de news. Aviso propietarios pendientePRE-09. |
| REG-17 | parcial | Código/entrega existente; no reconstruir | Verificar evidencia de publicación/migración/activación por flujo autorizado. REG-11/17 tienen publicación en reconciliación pese a checklist desfasado. |
| PRE-09 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-privacy-links.md) |
| PRE-10 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-marketing-objection.md) |
| PRE-11 | parcial | Plan nuevo, alcance delimitado | [plan](2026-11-08-l1-tour-privacy.md) |
| PRE-12 | parcial | Decisión externa / plan completo no cerrado | Preservar entrega EST-09 publicada. Extensión requiere política jurídica de conservación alquiler/venta y contrato portal/export/borrado; correo solo activación de su tramo. La falta de correo no impide planificar, pero no se inventan plazos o excepciones jurídicas. |

## Validación y entrega

Revisión documental independiente y comprobaciones de enlaces, cabeceras, bloques, casillas, cobertura59/59 y diff; resultados en [ledger de la tanda](2026-11-08-lista1-batch-ledger.md). Producto: no tests, build, e2e, migración o Playwright ejecutados; Playwright no aplica a Markdown. Los gates de producto siguen en los planes futuros.

Los archivos públicos son spec/plan/ledger/este índice y anotaciones de roadmap. Relevo privado y configuraciones quedan fuera de Git/ZIP. Sin autor Git configurado: no se inventa identidad ni se hace commit; sin push/despliegue. El ZIP es una entrega documental para usar junto al repositorio de la base indicada, no una copia íntegra de la aplicación.

Próximo plan completo pendiente a resolver: AUT-19, elegir carril apto para criterios privados antes de cerrar dictado. Modelo recomendado Codex:gpt-6.1-terra · esfuerzo high, por privacidad, confirmación y concurrencia; no cambia modelo actual ni autoriza construir.
