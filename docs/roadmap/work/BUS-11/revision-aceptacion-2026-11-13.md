# BUS-11 · Revisión independiente y aceptación documental

13-nov-2026. El integrador revisó de forma independiente la investigación y acepta su entrega documental conforme a la tarea 4 del [plan BUS-11](../../../superpowers/plans/2026-11-08-bus-11-special-cases-research.md). La aceptación no resuelve las siete preguntas manuales ni autoriza acceso, incorporación de fuentes, fusiones o lectores.

## Comprobaciones

- La cadena BUS-21/22/23 figura como aceptada en sus resúmenes publicables. Se contrastaron las huellas SHA-256 declaradas para las filas de pendientes y el relevo de BUS-23 con las copias locales aceptadas: las siete preguntas manuales corresponden exactamente a las siete filas del relevo. La comprobación cubierta identifica una propuesta ya presente, sin acreditar que sea única o esté operativa.
- Se verificaron sintaxis de los cinco JSON, unicidad y correspondencia de los ocho casos, hallazgos y deltas. Los ocho deltas conservan `no_change` y requieren revisión de acceso. Los siete casos manuales incluyen límite, próximo paso, rol y condición de reintento; rol y condición coinciden con las filas aceptadas. Los datos privados de los CSV no se incorporan al repositorio.
- Se cotejaron el [alcance](scope.md), la [comprobación de vías](source-preflight.md), los [hallazgos](findings.md), el [relevo](handoff.md) y el [registro de accesos](access-log.md). Las aperturas anteriores al cotejo de condiciones están registradas; sus contenidos no se usan como hallazgo ni como permiso. Los resultados indexados son pistas sobre condiciones, no revisión directa ni evidencia de identidad.
- No se encontró, en los métodos contrastados para esta herramienta y finalidad, una nueva fuente independiente cuyo acceso estuviera acreditado para resolver las siete dudas. Esta conclusión se limita al contraste documentado: no demuestra una prohibición general ni que no existan vías adicionales. El catálogo histórico cuyo acceso fue rechazado sigue sin consultarse.

## Resultado

**Investigación aceptada; siete casos `manual_pending` y uno `covered`.** La aceptación cierra la investigación de BUS-11 con límites explícitos, como permite su plan. BUS-19 conserva la decisión de acceso por canal; BUS-20 y Homely mantienen sus restricciones. No se actualizó el directorio original ni se activó ningún proceso o fuente.
