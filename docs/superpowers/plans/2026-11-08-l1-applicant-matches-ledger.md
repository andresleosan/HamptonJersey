# Ledger · SAP-03

- Fecha/base: 8-nov-2026, `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`; comprobación GitHub14:14UTC registrada por raíz. Copia `/tmp/hampton-lista1-batch-20261108`; cambios ajenos conservados.
- Alcance: exclusivamente [spec](../specs/2026-11-08-l1-applicant-matches-design.md) y [plan](2026-11-08-l1-applicant-matches.md), más este ledger. Sin producto, migración aplicada, reserva remota, instalación, red, commit ni publicación.
- Estado de planificación: Preparado para revisión; ejecución condicionada al contrato EST13 integrado.
- Estado del producto: se conserva el catálogo existente; documentos no completan SAP-03.
- Fuentes leídas: task JSON de cada código, DESIGN.md y CSS vigente, reconciliación7-nov, rutas/componentes/pruebas nombrados en plan, habilidades indicadas en spec; SAP01/SAP02 previos consultados sin copiar ni editar.
- Revisión propia: cobertura por código, nombres de contratos, dependencia por tramo, fallos de permisos/concurrencia, error≠vacío y valores UI contrastados. Revisión independiente: pendiente de coordinador, no declarada aprobada.
- Validación realizada ahora: inspección documental y comprobación de rutas/enlaces de estos documentos. Pruebas de producto/build/release/e2e: no ejecutadas por alcance solo planificación. Playwright: no aplica a esta entrega documental; recorrido futuro obligatorio en el plan.
- Decisión upstream D02 aprobada por Luis: 48 h alquiler/7 d compra configurables, contradicción material exige reconfirmar; se consume como política del productor. No inferir aprobación de shortlisted ni disponibilidad de listings.confirmed_at.

Revisión final de raíz/revisor: continuidad D1 concretada mediante cursor sellado, as_of fijo y events_watermark leído junto a rows/totales en un batch,409 si cambia; preflight exige evento atómico de todo productor relevante. Sin snapshot histórico ficticio. Prueba futura cambio de datos/config/ámbito/caducidad y Reload preservando formulario.
