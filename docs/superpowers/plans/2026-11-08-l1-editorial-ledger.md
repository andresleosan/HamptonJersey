# Ledger: Lista 1 editorial

8-nov-2026; planificación sin reservas. Copia `/tmp/hampton-lista1-batch-20261108`, base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, GitHub14:14 UTC comprobado por coordinación. Entregados spec, plan y este ledger; sin producto.

| Código | Entrega documental | Estado real |
|---|---|---|
| EST-17 | Ready, Let agreed/Let, interfaces/writers/migración/pruebas futuras | parcial; no implementar ni marcar completo ahora |
| EST-18 | nuevos campos/editorial y marketing conectables al registro | parcial; registro publicado, nuevos productores pendientes, timeline aplazado |

Leído código listings/listing-events, format/Listings/ListingEditor/queue, sales y rentals, migrations CHECK, api/auth, DESIGN, catálogo EST-17/18/09 y reconciliación. Evidencia: currentSales no es export real; el plan preserva rutas/tablas ventas actuales y no crea abstracción ficticia. Rentals existe separado de listing y no se infiere tenancy desde marketing.

Decisiones técnicas revisadas con coordinación: permisos actuales sin aprobador especial; ready no publica/cambia disponibilidad; let_agreed/let manual con actor/evidencia/CAS y sin contrato/cierre búsqueda. No atribuirlas como una nueva aprobación expresa de Luis. No dependencia de catálogo nueva para la parte editorial; integración inventario posterior tiene frontera explícita. No mezclar D02 TTL compartido con ADM-04 To confirm.

Skills aplicadas: avanzar/catalogación, brainstorming/alternativas, grill-me/riesgos, writing-plans/interfaces y RED-GREEN futuro, security-best-practices/frontend-security-coder/auth/evidencia, impeccable+DESIGN para formulario y filtros existentes, ponytail para marcadores y helpers actuales, web-performance-optimization para miniaturas/consultas sin datos pesados. Sin nueva página/rediseño ni nuevas fuentes/libs.

Autorrevisión documental: estados/transiciones actor/versión/evidencia; todos writers (genericPUT/create/import/queue) protegidos; migración CHECK preserva FKs/triggers; cinco focos con casos; ventas lossless, CSS actual/propuestas separadas. No tests/build/release/e2e ejecutados, Playwright no aplica ahora, sin .env/credenciales/servicios/red/installs/git add/commit/push. Checkboxes de construcción todos pendientes.

Comprobación documental final: UTF-8 legible, fences Markdown balanceados, cabeceras de plan presentes, pasos RED/GREEN futuros sin marcar y contratos internos revisados. Verificación estática de documentos únicamente; no ejecutar producto ni confundir este resultado con tests de implementación.
