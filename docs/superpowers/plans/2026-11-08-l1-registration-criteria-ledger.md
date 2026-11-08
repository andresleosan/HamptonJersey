# Ledger · SAP-10 / REG-06 / REG-12

- Fecha/base: 8-nov-2026, `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`; comprobación GitHub14:14UTC registrada por raíz. Copia `/tmp/hampton-lista1-batch-20261108`; cambios ajenos conservados.
- Alcance: exclusivamente [spec](../specs/2026-11-08-l1-registration-criteria-design.md) y [plan](2026-11-08-l1-registration-criteria.md), más este ledger. Sin producto, migración aplicada, reserva remota, instalación, red, commit ni publicación.
- Estado de planificación: Tres unidades preparadas para revisión; integración/activación conserva dependencias por código.
- Estado del producto: se conserva el catálogo existente; documentos no completan SAP-10 / REG-06 / REG-12.
- Fuentes leídas: task JSON de cada código, DESIGN.md y CSS vigente, reconciliación7-nov, rutas/componentes/pruebas nombrados en plan, habilidades indicadas en spec; SAP01/SAP02 previos consultados sin copiar ni editar.
- Revisión propia: cobertura por código, nombres de contratos, dependencia por tramo, fallos de permisos/concurrencia, error≠vacío y valores UI contrastados. Revisión independiente: pendiente de coordinador, no declarada aprobada.
- Validación realizada ahora: inspección documental y comprobación de rutas/enlaces de estos documentos. Pruebas de producto/build/release/e2e: no ejecutadas por alcance solo planificación. Playwright: no aplica a esta entrega documental; recorrido futuro obligatorio en el plan.
- REG12 usa acuse idéntico y veraz porque duplicados no activan nuevas búsquedas automáticamente. REG06 deja NULL legado sin interpretarlo; SAP10 exige confirmación del diff y409. D12 fuera de alcance.

- Corrección de revisión coordinadora: REG12 consume EST01/SAP01 (applicant_search_progress/CheckTicket/projectSearchProgress), sin columnas initial_match, runner o reloj paralelo. Copia de SAP01 preservada; condición de integración documentada sin alterar catálogo.
