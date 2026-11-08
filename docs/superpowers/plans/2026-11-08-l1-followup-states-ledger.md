# Ledger de planificación: EST-13, EST-04, EST-05, EST-06

Fecha:8-nov-2026. Base main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, verificada por sesión raíz14:14UTC; copia exclusiva compartida `/tmp/hampton-lista1-batch-20261108`.

- [Spec](../specs/2026-11-08-l1-followup-states-design.md).
- [Plan](2026-11-08-l1-followup-states.md).

## Clasificación y dependencia

EST-13 y EST-04 listos condicionales a integración de productores; EST-05/06 son aliases históricos, no tareas nuevas. D02 aprobada durante la sesión, no decisión pendiente.

EST-13: BUS-12/BUS-15/BUS-10/EST-09 integrated. Disponibilidad EST-16 aporta política/evidencia; AGE-03 y AGE-11/VIS-17 para acreditar sus dimensiones. EST-04: EST-13 integrated; EST-10 consume followupWorkFactsQuery y agrega work_labels.

## Evidencia consultada y decisiones

Catálogo JSON individual, reconciliación7-nov, DESIGN.md/PRODUCT.md, CSS actual, matching/requirements/match-store/routesmatches, applicants y budgets comerciales, schema0009/0025/0029 y ListingEditor. Contrato SAP-02 leído en copia separada `/tmp/hampton-sap02-plans-20261108`, sin copiarlo ni modificarlo. Planificación no crea claim ni reserva; no se consultaron credenciales ni servicios.

D02 aprobada por Luis:48h alquiler/7d compra configurables y contradicción material exige reconfirmar; productor EST-16 posee política. D06 permanece desactivado. No autosend, no divulgación de datos de cliente, no cierre salvo humano. Nombres de puertos BUS-10/AGE-03/AGE-11/VIS-17 son propuestas requeridas y exigen adapter/preflight sobre productor real. No se les atribuye integración por escrito.

## Autorrevisión actual

- [x] Cobertura por código cotejada: E13-1/E05-1/E06-1/E04 Task 3;E13-2/3/4 Task 2;E13-5 Tasks 3/4.
- [x] Firmas upstream/downstream, ownership y rutas reales/propuestas diferenciadas; CSS actual separado de propuestas de DESIGN.
- [x] Carreras, errores, permisos, privacidad, noautosend y cierre humano incluidos en criterios y pruebas futuras.
- [x] D02 actualizada tras aprobación y contratos EST-16/EST-13/SAP-03/EST-10 coordinados.
- [ ] Revisión independiente de documentos, coordinada por raíz.
- [ ] Implementación, tests de producto, build, release, e2e y Playwright: no ejecutados ni aprobados; son trabajo futuro.
- [ ] Migración, commit, publicación y activación: no ejecutados ni autorizados por esta entrega.

Revisión independiente P2 corregida: puerto viewing_state incluye completed/no_show; completed acreditado ->Viewed, no_show ->No show sin contar Viewed; fixtures futuros fijados.

Resultado actual: documentos preparados y autorrevisados. Las casillas del plan siguen abiertas. No cambia estado del producto ni pruebas históricas de otros códigos.

Revisión cruzada final: contrato de cards y seguimiento por propiedad declara checks de EvaluationV1 para candidatas externas sin fila legacy; prueba futura de unknown/fails/evidence_ref sin inferir desde score. Ajuste documental raíz sobre archivos ya entregados por autor.

Revisión final de raíz/revisor: continuidad D1 concretada mediante cursor sellado, as_of fijo y events_watermark leído junto a rows/totales en un batch,409 si cambia; preflight exige evento atómico de todo productor relevante. Sin snapshot histórico ficticio. Prueba futura cambio de datos/config/ámbito/caducidad y Reload preservando formulario.
