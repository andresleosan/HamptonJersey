# NOT-01 · Ledger de planificación sin reservas

8-nov-2026. Luis eligió NOT-01 y reiteró solo planificación. El bloqueo inicial fue administrativo por identidad VPS ocupada, no una dependencia de construcción. SPR-01 terminó su plan y cerró su reserva; otra sesión tomó PUB-06. Luis ordenó que la planificación no cree reservas.

Corrección local del procedimiento: commit32e06e6, revisión independiente favorable, 913Node+14Python, runtime26, build/release/team:check correctos. Demostración del nuevo comando con NOT-01: planning/reserved:false/buildAuthorized:false, sin credenciales y sin modificar el coordinador. No se crea otra reserva, scope, watch o cierre para estos documentos.

Base de producto: main canónico6d2f77922f797a1ffd6a23e2030308440ca81adf. Copia propia /tmp/hampton-not01-planes-FrgFJPvF; cambios de código de la corrección anterior identificados por commit separado. Entregas de NOT-11/SPR-01/PUB-06 intactas.

Fuentes revisadas: tarea NOT-01 y límites NOT-05/08/09, reconciliación M13, arquitectura5.1, spec/contratos NOT-11 preservados, código de notificaciones/Inbox, eventos de listing EST-18, escritores de visitas/ofertas/ventas/alquiler y reloj. Los alquileres usan rental_events; el CHECK común todavía no incluye rental. SyncTask anterior crea su propio batch y requiere extraer variante componible; se registra esa necesidad, no se presenta una llamada posterior al commit como atómica.

Spec y plan distinguen hechos existentes, pendientes derivados y productores futuros. Conservan latencia30s con panel visible y reloj10min para vencimientos sin evento; no prometen minuto universal. Browser alerts es propuesta conservadora con permiso explícito, textos genéricos y panel abierto; no es push ni decide la política de otros canales.

Solo documentación NOT-01: ninguna implementación, migración o prueba de producto ejecutada para este módulo. Playwright: no aplica a estos documentos; consta como prueba futura. Las pruebas de32e06e6 son de la regla de coordinación y no validan NOT-01.

Revisión independiente del diseño y plan realizada por not01_document_review, solo lectura: «nothing important left». Auto-revisión: atomicidad cubre variante componible de NOT-11 y hooks de triggers; latencias del reloj/poll separadas; fuentes futuras y límites NOT-05/08/09 explícitos; cada área tiene archivos, contratos y pruebas futuras. Enlaces relativos comprobados y diff sin errores. Ningún paso de implementación se marca ejecutado.

Entrega documental lista para commit local. Sin reserva ni cambios al coordinador por NOT-01. La aprobación del diseño funcional y el encargo explícito de construcción serán posteriores. Modelo recomendado para continuar NOT-01: gpt-6.1-terra · high, por proyección transversal y límites de productores, sin construcción autorizada ahora.
