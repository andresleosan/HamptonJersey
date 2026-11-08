# Ledger de planificación: BUS-15, BUS-16, EST-18 productor de revisión

Fecha:8-nov-2026. Base main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, verificada por sesión raíz14:14UTC; copia exclusiva compartida `/tmp/hampton-lista1-batch-20261108`.

- [Spec](../specs/2026-11-08-l1-match-review-manual-design.md).
- [Plan](2026-11-08-l1-match-review-manual.md).

## Clasificación y dependencia

BUS-15 listo condicional a dependencias; BUS-16 ya replanteado como alias histórico sin implementación Auto; EST-18 base ya publicada, solo nueva conexión de este productor pendiente.

BUS-15 requiere BUS-12/EST-09 integrated. Events0029 debe estar integrado. EST-13 consume decisiones después, no bloqueo circular. AGE-03 sigue separado y debe releer permiso vigente antes de su propia acción.

## Evidencia consultada y decisiones

Catálogo JSON individual, reconciliación7-nov, DESIGN.md/PRODUCT.md, CSS actual, matching/requirements/match-store/routesmatches, applicants y budgets comerciales, schema0009/0025/0029 y ListingEditor. Contrato SAP-02 leído en copia separada `/tmp/hampton-sap02-plans-20261108`, sin copiarlo ni modificarlo. Planificación no crea claim ni reserva; no se consultaron credenciales ni servicios.

D02 aprobada por Luis:48h alquiler/7d compra configurables y contradicción material exige reconfirmar; productor EST-16 posee política. D06 permanece desactivado. No autosend, no divulgación de datos de cliente, no cierre salvo humano. Nombres de puertos BUS-10/AGE-03/AGE-11/VIS-17 son propuestas requeridas y exigen adapter/preflight sobre productor real. No se les atribuye integración por escrito.

## Autorrevisión actual

- [x] Cobertura por código cotejada: B15-1/2 y B16-1 Tasks 1/3;B15-3/4 y E18-1/2 Tasks 2/4;B15-5 Task 3.
- [x] Firmas upstream/downstream, ownership y rutas reales/propuestas diferenciadas; CSS actual separado de propuestas de DESIGN.
- [x] Carreras, errores, permisos, privacidad, noautosend y cierre humano incluidos en criterios y pruebas futuras.
- [x] D02 actualizada tras aprobación y contratos EST-16/EST-13/SAP-03/EST-10 coordinados.
- [ ] Revisión independiente de documentos, coordinada por raíz.
- [ ] Implementación, tests de producto, build, release, e2e y Playwright: no ejecutados ni aprobados; son trabajo futuro.
- [ ] Migración, commit, publicación y activación: no ejecutados ni autorizados por esta entrega.

Resultado actual: documentos preparados y autorrevisados. Las casillas del plan siguen abiertas. No cambia estado del producto ni pruebas históricas de otros códigos.
