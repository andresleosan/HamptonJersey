# TP-04 · Tanda 4: inventario, lectores y trazabilidad

10-nov-2026. **Tres planes vigentes; PUB-15 retirada del plan actual.** Se definen núcleos concretos, no se da por aceptado el mercadoexterno. [Estados](2026-11-10-tp04-sources-readiness.json) · [Ledger](2026-11-10-tp04-sources-ledger.md) · [Maestro vigente](../../roadmap/2026-11-10-plan-maestro-vigente.md).

| Código | Plan | Preparación |
|---|---|---|
| BUS-06 | [Inventario común reanudable y cobertura verificable](2026-11-10-tp04-bus-06-plan.md) | core_build_contract_defined_external_acceptance_pending |
| BUS-09 | [Normalización y lectores Hampton/manual, anexos externos pendientes](2026-11-10-tp04-bus-09-plan.md) | named_internal_manual_contracts_defined_external_reader_contracts_pending |
| PUB-09 | [Trazabilidad de publicación propia sin portales](2026-11-10-tp04-pub-09-plan.md) | own_website_build_contract_defined_external_portals_excluded |

## Entregables y límites

- BUS06: almacenamiento/páginas/leases/runner y cobertura; own_pilot separado de inventarioexterno. Reutiliza relojBUS08, políticaBUS19 yconsumidoresBUS01/04/10, sin segundo inventario/directorio ni cron.
- BUS09: normalizador y contratos Hamptoninterno/manualJSON definidos; IA deambigüedad solo vía/propósito autorizados y revisiónhumana. Cada lectorexterno solicitado sigue pendiente de fuentenominal/permiso/fixture/mapping/paginación reales. Dos fixtures sintéticos no acreditan cobertura.
- PUB09: fecha existente depublicación y retiro editorial/historialprivado conCAS, sin asumir llamadas/guardados/personas ni IDportal.
- PUB15 retirada por decisión expresa: no portales externos, feeds/infra o elección de destino pendientes.

Dos diseños: [mercado](../specs/2026-11-10-tp04-market-design.md) y [trazabilidad](../specs/2026-11-10-tp04-traceability-design.md). Ocho unidades futuras de código y cero continuidades de portales, sin ejecutar. No se localizaron enmain resultados aceptados ni scripts/Assets históricos; esosartefactos se reciben delproductor yse verifican, no se rehacen ni investigan desdeesta sesión. Carga manual de observaciones no reconstruye ADM05.

## Orden de integración

BUS06esquema→BUS19política→BUS09normalizador/adaptadores→BUS06runner/UI→BUS01/04consumidores. BUS08 programa diario01:00Jersey con unrunporfechalocal. PUB09 se integra conPUB02 ySPR02 respetando los cambios deotras sesiones. Sin políticas/manifiestoexterno soloown_pilot ypruebas locales; no flags de capturareal porpublicación de código.

## Retirada aplicada al maestro y aTP03

ADM05 yOFE08 están fuera, no comoaplazadas. Dosplanes convertidos ennota de retirada, activosTP03=11, R03/R06cerradasporretirada. Se quitaron sus dependencias y elrepositoriogenérico dearchivos/uploads/llaves/bancos, así comofacturas/saldos/proyecciones decomisiones; evidencias delresto conreferenciasmanuales externas. Conservados datos/códigoactuales yPDFgenerado específico deADM10. Capacidad dedatosestructurados ADM18independiente antesdeADM12 yformularios; no nuevofoundation bajo otronombre. También se actualizó el maestrooriginal y suprograma en lacopia deplanificaciónanterior, preservando suhistoria y sin publicar.

## Revisión y estado

Base80ad03df7e095750f455aa4aa668573e9aac5db4 main/GitHub verificada11:53:55UTC. Actividad no disponible, sin reserva/visibilidad en vivo prometida. Revisorindependiente tp04_scope_builder_check completado; cuatrocuestiones técnicas resueltas: país/unidadesmonetarias, unknown de retirada reservado servidor+correcciónappend-only, orden decapacidades yresiduosdocumentales retirados. Autorrevisión posterior, sinsegundarevisiónindependiente. Validación documental enledger; no pruebas deproducto pararedactardocs.

No hay preguntas nuevas deproducto. Queda **TP05: revisión transversal y entrega final deplanes**; sus hallazgos pueden mantener evidencias ocontratosnominales pendientes, no certificarlos porhaber terminado tandas. No construcción, investigación/scraping, lectura debasesprivadas, IA, cuenta, correo, proveedor, migración, commit/push odespliegue enesteencargo. Documentos locales.

## Retirada expresa de PUB-15 · 10-nov-2026

Luis retira PUB-15 del plan maestro vigente: por ahora Hampton no publicará en ningún portal externo. Estado `excluded_by_user_current_scope`, no aplazada ni pendiente de elegir destino/cuenta/contrato. No preparar feeds, APIs, adaptadores, infraestructura de publicación, sincronización de retiradas o IDs de portal bajo PUB-09 u otra tarea. Una eventual reincorporación necesitaría una nueva decisión explícita; no queda en la cola actual.

La publicación propia de la web de Hampton y su trazabilidad siguen en alcance. Esta retirada de publicación externa no elimina por inferencia las fuentes permitidas de búsqueda/recopilación BUS-06/09; sus permisos y evidencia se verifican por separado. No código, datos existentes, cuentas, controles ni servicios cambiados por esta actualización documental.


## Reanudación de la tanda 4 · entrega a construcción

Encargo de Luis «comienza la tanda 4», manteniendo solo planificación. Base verificada de nuevo el 10-nov-2026 a las 12:52:31 UTC: main y GitHub coinciden en `80ad03df7e095750f455aa4aa668573e9aac5db4`. Se conservan los 55 documentos locales de planificación. Actividad compartida sin verificar (`activity_unavailable`); esta entrega no reserva construcción ni acredita publicación.

| Tramo definido | Dependencia antes de construir o integrar | Qué sigue pendiente fuera del tramo |
|---|---|---|
| BUS-06 · tarea 1: almacenamiento y recibos | Contratos del diseño de mercado y ordinal de migración libre al construir | Aceptación del manifiesto externo para pasadas initial/daily |
| BUS-09 · tarea 1: normalización y validación de contratos | Contratos de observación y monetarios definidos; no necesita investigar fuentes para construir funciones puras | Cada anexo de lector externo con datos reales |
| BUS-09 · tarea 2: lector Hampton y entrada manual | Almacenamiento BUS-06 y política persistida BUS-19 para admitir canales; snapshot propio del diseño | La entrada manual externa requiere fuente/canal aceptados y permiso; no equivale a lector automático |
| BUS-06 · tarea 2: ejecución reanudable | Almacenamiento, política BUS-19 y lectores BUS-09 realmente integrados; reloj BUS-08 para programación diaria | Sin manifiesto aceptado, solo piloto propio; no captura externa |
| BUS-06 · tarea 3: cobertura y controles | API/estados de BUS-06, política BUS-19 y entrada manual BUS-09 integradas | Cobertura externa no acreditada por pruebas sintéticas ni por pantalla construida |
| BUS-09 · tarea 3: revisión de ambigüedades | Observaciones persistidas y contrato AUT-13; la llamada real requiere vía, propósito y tratamiento autorizados | IA no disponible mantiene revisión humana y aviso deduplicado; no simular conexión |
| PUB-09 · tarea 1: retirada y correcciones | Componer con setState/listingBatch y conservar guardas PUB-02 e historial SPR-02; conciliar main antes de editar módulos compartidos | Verificación futura de transacción, versiones y privacidad |
| PUB-09 · tarea 2: diálogo e historial | Tarea 1 de PUB-09 y componentes existentes del editor/lista/historial | Verificación futura de interfaz y accesibilidad |

Los dos tramos de PUB-09 no dependen del manifiesto del Property Directory, de los lectores BUS-06/09 ni de una integración de portales. Pueden planificarse y construirse como línea independiente, respetando las dependencias reales de publicación e historial. Las seis unidades de mercado se integran por componentes; no exigir finalizar tareas completas mutuamente dependientes.

**Recepción de evidencia pendiente:** reutilizar la entrega autorizada de BUS-21 → BUS-22 → BUS-23, verificar manifiesto/versiones/identidades y la decisión BUS-19 por canal. Para cada lector externo solicitado, aceptar fixture permitido, mapping y paginación antes de declararlo listo. Estos pendientes son entregables de investigación o integración; no faltan preferencias del usuario ni se inicia aquí otra investigación. No solicitar acceso privado ni contactar a Hermes.

**Resultado:** tres planes conservados, ocho unidades futuras definidas, cero preguntas nuevas y PUB-15 excluida. Ninguna unidad se marca construida; BUS-06 y BUS-09 completos siguen pendientes de los contratos externos indicados. La siguiente tanda programada continúa siendo TP-05, revisión transversal; este encargo no la inicia.
