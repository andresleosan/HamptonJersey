# AUT-20 · Validación integral del recorrido · Ledger

8-nov-2026 · Lista1 · AUT-20. Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobadaGitHub14:14UTC. Solo planificación: sin reserva, construcción, migración, envío o publicación.

[Diseño](../specs/2026-11-08-l1-journey-validation-design.md) · [Plan](2026-11-08-l1-journey-validation.md).

Estado: Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

Fuente y decisión: Reconciliación §9 define A01–A16 y tabla transversal; tasks/AUT-20 exige pruebas juntas. package.json npm test/build/check:release/test:e2e y tests/run-e2e.cjs permiten E2E_SCRIPT. La base actual no implementa todos los dominios; por tanto hoy no puede declararse que el recorrido pasa.

Dependencias: Catálogo AUT-20 requiere BUS-23 research_accepted y integrated de BUS-04, BUS-13, BUS-14, BUS-15, REG-12, REG-17, AGE-08, AGE-09, AGE-11, VIS-08, BUS-17, AUT-19, EST-19, NOT-01, NOT-08, NOT-09, NOT-11 y EST-18. Verificar además contratos transversales del recorrido (inventario/consulta/portal), sin cambiar el catálogo por inferencia. Antes de ejecución exigir decisiones de los módulos y activación de canales solo cuando la prueba pretenda afirmar integración real; fixtures pueden probar comportamiento local pero no acreditan activación. AUT-20 no se cierra hasta ejecución real completa.

Criterios de producto y pruebas permanecen abiertos hasta ejecución. La validación documental y revisión independiente de la tanda se registran en el índice común; no se presentan pruebas futuras como pasadas. Git sin autor configurado: conservar documentos, no inventar identidad. Relevo privado fuera de Git.

Gate antislop documental: Hard Gate PASS por estados/cifras basados en hechos y sin producto entregado; Purpose PASS por ampliación del flujo existente con razones en spec; Liveliness PASS diales1/1/1 según pantalla operativa; Craftsmanship PASS por contratos/controles definidos sin contenido ficticio. Los gates de runtime y Playwright quedan pendientes de construcción.

Actualización de entrevista, 8-nov: Q01/D05 aprobada por Luis («si asi esta bien»): revisión y envío explícito por empleado para cada presentación. Spec/plan incorporan ese acuerdo y su prueba futura; ninguna construcción o prueba de aplicación ejecutada.

Aclaración posterior de Luis: presentación con fotos directa por email y preparada por Hermes; el empleado revisa/envía. No portal para visualizar esta presentación. Formato y respuesta del cliente pendientes; frontera de datos y transporte siguen sujetos a integración. Solo documentos actualizados.

Q11 aprobada por Luis: texto explicativo sencillo y fotos adjuntas descargables. Contrato de adjuntos documentado y capacidad del binding consultada en fuente oficial Cloudflare; sin implementación, envío o pruebas de aplicación. Respuesta ordinaria por email es decisión del planificador para evitar ampliar el flujo; no aprobación de IA autónoma.
