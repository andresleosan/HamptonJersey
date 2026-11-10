# TP-03 · Tanda 3 vigente: 11 planes

## Decisión posterior de Luis · 10-nov-2026

**ADM-05 y OFE-08 retiradas del plan maestro vigente**, por instrucción expresa. No son pendientes de respuesta, activación ni fase posterior. Se conservan antecedentes para trazabilidad, sin borrar datos ni código existente. No construir el repositorio genérico case-files/CASE_FILES, uploads/intents/custodia de llaves/datos bancarios de ADM05, ni negociación/facturas/saldos/seguimiento/comisiones de OFE08 bajo otra tarea. R03/R06 cerradas por retirada, no por seleccionar una opción anterior.

Las tareas conservadas usan referencias mínimas de evidencia gestionada manualmente fuera de app: evidence_ref opaco, revisado por empleado, sin upload/download/URL firmada/autofetch ni copia de documentos C3. No es una integración con abogados, Drive o archivos externos. Se mantienen permisos porcaso, retención de respuestas estructuradas, fecha obligatoria de accesos, revisión humana y seguridad de las funciones que sí continúan. Los PDF económicos generados por ADM10 son un artefacto propio de esa tarea, no un repositorio de documentos aportados por usuarios.

Esta decisión prevalece sobre las menciones históricas a esas tareas en planes/specs/catálogo. Quitar sus dependencias de construcción; donde no baste referencia externa, reducir el subtramo explícitamente o mantenerlo fuera, sin recrear ADM05. NOT05/ADM21 conservan rentas y liquidaciones y pierden ampliaciones de comisiones OFE08. Conservar sales.shared_fee y el alta/cobros actuales sin reinterpretarlos ni borrarlos: esta sesión solo cambia planes.

[Maestro actualizado](../../roadmap/2026-11-10-plan-maestro-vigente.md) · [Estados](2026-11-10-tp03-rental-sales-readiness.json) · [Ledger](2026-11-10-tp03-rental-sales-ledger.md)

| Código | Plan | Preparación |
|---|---|---|
| OFE-02 | [Ofertas al vendedor con revisión por envío](2026-11-10-tp03-ofe-02-plan.md) | build_contract_defined_dependencies_pending |
| ADM-09 | [Atrasos y ajustes sin pagos ficticios](2026-11-10-tp03-adm-09-plan.md) | build_contract_defined_dependencies_pending |
| ADM-10 | [Liquidaciones económicas cerradas y PDF](2026-11-10-tp03-adm-10-plan.md) | build_contract_defined_dependencies_pending |
| ADM-12 | [Reparaciones, evidencia y reporte acotado](2026-11-10-tp03-adm-12-plan.md) | build_contract_defined_dependencies_pending |
| ADM-14 | [Renovaciones decididas por el empleado](2026-11-10-tp03-adm-14-plan.md) | build_contract_defined_dependencies_pending |
| ADM-18 | [Solicitud privada y revisión humana de alquiler](2026-11-10-tp03-adm-18-plan.md) | build_contract_defined_dependencies_pending |
| ADM-19 | [Referencias y contratos firmados fuera de Hampton](2026-11-10-tp03-adm-19-plan.md) | build_contract_defined_dependencies_pending |
| ADM-20 | [Ámbito y validación de reglas de arrendamiento](2026-11-10-tp03-adm-20-plan.md) | build_contract_defined_activation_pending |
| ADM-15 | [Avisos de renta con política y evidencia](2026-11-10-tp03-adm-15-plan.md) | build_contract_defined_activation_pending |
| OFE-06 | [Seguimiento interno de compraventas](2026-11-10-tp03-ofe-06-plan.md) | build_contract_defined_dependencies_pending |
| OFE-07 | [Evidencia restringida y revisión humana de diligencia](2026-11-10-tp03-ofe-07-plan.md) | build_contract_defined_activation_pending |

No quedan preguntas de alcance de esta tanda. R01 revisiónporenvío, R02 firmaexterna, R04 fechaobligatoria porcaso y R05 seguimientointerno permanecen. No repositorio documental ni uploads por otras tareas; evidenciaexterna manual. Reconciliar dependencias antes de construir. Políticas, acceso/retención de datos estructurados, correo, PDF financiero propio y reglas legales conservan puertas verificables. Nada construido o activado.

Orden: ADM12 accesos yADM18 capacidad estructurada; OFE02 correo revisado; ADM09 ajustes yADM10 liquidaciones; ADM14/18/19/20/15 yOFE07 consumen contratos aprobados. OFE06 seguimiento interno usa NOT11 sin correo aabogados. Las dependencias reales se integran antes que consumidores; ningún ciclo deentidadautoriza construir una tarea retirada. Próxima TP04, después TP05 revisióntransversal.
