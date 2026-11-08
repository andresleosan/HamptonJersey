# Ledger · BUS-13 · cierre de alcance Lettings Jersey

- Fecha/base: 8-nov-2026; copia actual leída `/tmp/hampton-lista1-tanda2-20261108`, main `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`. Se releyeron los tres documentos actuales, no el borrador viejo. Salida exclusiva `/tmp/hampton-l1-final-housing/docs/superpowers`.
- Entrega: [diseño](../specs/2026-11-08-l1b-residency-adoption-design.md), [plan](2026-11-08-l1b-residency-adoption.md) y este ledger. Coordinación integra; no se editó el clon destino ni catálogo/producto/documentos ajenos.
- Decisiones de Luis incorporadas: Q/R solo residencialrentJersey; fuera de ámbito no hay checkhousing; countryNULL/ambiguo queda pendiente salvo región upstream verificada; operación efectiva search_operation??operation. Hampton Estates LTD dispone de datos y los añade manualmente; no nuevo dossier/gestor/matriz importada ni validación externa en este plan, ni tres categorías previas obligatorias para construir.
- Preguntas del plan: resueltas. Estado documental: preparado para revisión e integración; futura construcción/publicación conserva condiciones habituales. Estado del producto sin cambios, no se declara BUS13 construido/completado.
- Contratos revisados: RENT/NO_STATUS/housing/evaluate, requirementsSummary, LISTING/APPLICANT, EVALJSON/matchCard, Widen, toPublic/regionOf, formularios/editor/housingLabel y DTO de propiedad canónica. Datos históricos y controles ajenos al alcance se conservan; no fallback por IDs o checksBUY guardados.
- Comprobaciones realizadas: revisión propia de cobertura B1–B11, rutas de archivos existentes y nuevos, firmas, precedence de estados y valores CSS reales. Enlaces internos, newline, cercas y whitespace comprobados. Revisión independiente queda a coordinación y no se da por aprobada.
- Pruebas de producto/build/release/e2e/Playwright: no ejecutadas, por encargo solo documental. Playwright no aplica a estos documentos; el plan exige recorrido futuro local1280/390. Sin servicios, credenciales, cambios reales, migraciones, reservas, commit/push o despliegue.

- Precisión final incorporada: Q/R y restricted() se separan. listing_restriction conserva comportamiento/aplicabilidad/evidencia vigente; compra sin restricción no recibe Q/R ni pending por Q/R, restricción explícita incierta puede quedar unknown por su propia causa. Sin matriz BUY trasladada ni restricciones eliminadas como efecto secundario.


## Cierre documental común posterior a la entrevista

Rige el [maestro final](2026-11-08-lista1-build-ready.md) y sus respuestas; cualquier condición histórica sustituida debe leerse con ese cierre. Revisión independiente final conforme, sin P1/P2 pendientes. Solo planificación: casillas de construcción y pruebas de producto siguen para ejecución futura. La comprobación final de enlaces, cobertura y paquete está en el [ledger de tanda](2026-11-08-lista1-tanda2-ledger.md).
