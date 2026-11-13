# AUT-10 · CAS de política bloqueado — 13 nov 2026

**Estado: base desconectada; no existe persistencia efectiva ni escritor habilitado.** Base `10f6a96ba6152197a443d1b3a899bc30afff6be2`. No se modificaron `app_settings`, migraciones, rutas, interfaz, reloj, proveedores ni operaciones reales. Las únicas escrituras de este ensayo se hicieron mediante SQL de prueba en un D1 efímero con datos ficticios.

## Resultado de la evaluación

`app_settings` tiene una clave primaria y exige JSON sintácticamente válido, pero el esquema inspeccionado no impide borrar una clave y recrearla. En D1 local, un `UPDATE` que compara clave, valor, `updated_at` y `updated_by` permite un solo ganador concurrente y revierte si falla una sentencia posterior. Una recreación con una generación distinta rechaza el candidato antiguo; **borrar y restaurar exactamente la fila anterior, incluidos generación, revisión y metadatos, permite que ese mismo candidato obsoleto vuelva a ganar**. Una generación almacenada solo en la fila no acredita su propio ciclo de vida. CAS tampoco autentica al actor ni otorga capacidad.

El código inspeccionado no acredita una capacidad global de administración de políticas ni su revocación: pertenecer a `admins`, una cadena de actor o una afirmación del llamante no son prueba suficiente. Antes de habilitar escrituras se necesita una autoridad real de sesión/origen/capacidad, y una identidad/generación monotónica o equivalente protegida contra borrado, sustitución, restauración y recreación; el esquema, sus invariantes y todos sus escritores deben acreditarse en el entorno correspondiente. Esta entrega no instala esa protección ni propone tratar un fixture como permiso.

## Base preparada

`server/operation-policy-store.js` mantiene `getOperationPolicy` y `setOperationPolicy` cerrados con 503 **antes** de inspeccionar el entorno o el actor. No leen ni actualizan D1. No hay consumidor registrado ni operación ejecutable desde este módulo.

Las funciones puras `inspectOperationPolicySnapshot` y `proposeOperationPolicyCAS` trabajan exclusivamente con bytes aportados por el llamante y devuelven `allowed:false`. Sus resultados `candidate`, `stale` y `no_change` describen una comparación local, no una política efectiva, un 409 confirmado por D1 ni una autorización. Una propuesta contiene la clave y los bytes esperados/siguientes para revisión; no contiene ni ejecuta SQL.

Solo se aceptan automatizaciones, operaciones, versiones de definición y modos admitidos por AUT-09/AUT-10. La propuesta exige tanto revisión como generación esperadas, UUIDv4 canónica y `params` vacío: no hay opciones aprobadas en este tramo. El JSON debe ser un objeto canónico con las claves exactas; valores adicionales, claves duplicadas, orden o espacios distintos, formas incompatibles, argumentos adicionales y definiciones desconocidas fallan cerrados. Esta restricción conservadora puede rechazar datos válidos no canónicos y necesita contrato/migración revisados antes de cualquier uso real. No se interpreta una ausencia como modo efectivo `Draft`.

## Evidencia y pendientes

- **RED/GREEN:** la prueba de candidato falló antes de implementar la validación cerrada. `node --test --test-concurrency=1 tests/server/aut-10-store.test.mjs tests/server/aut-10-store-d1.test.mjs tests/server/aut-10-operation-policy.test.mjs tests/server/automation-contracts.test.mjs` pasó **32/32**.
- D1 local con las migraciones existentes aplicadas solo al fixture probó no-op sin cambios, dos candidatos concurrentes, rollback, generación distinta, restauración exacta ABA y JSON inválido o de forma no admitida. La prueba demuestra que el CAS aislado **no satisface** la protección ABA; no demuestra permisos, persistencia segura ni estado remoto.
- Se requieren política de capacidad global y revocación en el mismo lote, identidad y generación protegidas, contrato de inicialización/tombstone, manejo de JSON legado/corrupto y pruebas de cambios concurrentes sobre el esquema definitivo. Cualquier SQL de esquema o migración necesita diseño y autorización separados. Tampoco se han integrado la UI, el consumidor, los gates ni la revalidación antes de efectos; `Auto` no concede permiso ni sustituye decisiones humanas.
- No se ejecutaron suite completa, build ni E2E: no hay interfaz modificada y la suite completa requiere coordinación. AUT-10 sigue parcial y estas pruebas no acreditan activación ni producción.
