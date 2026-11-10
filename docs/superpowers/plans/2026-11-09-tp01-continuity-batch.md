# TP-01 · Continuidad, cuentas y recuperación

**5 planes preparados**, únicamente documentos. Se reutilizan las decisiones y los planes publicados por otras sesiones. La revisión independiente del diseño terminó y su precisión de firma se incorporó; Luis ha elegido incluir Access en esta fase; contrato técnico en PRE-06 actualizado y aceptación operativa pendiente.

[Preparación y pendientes](2026-11-09-tp01-continuity-readiness.json) · [Ledger](2026-11-09-tp01-continuity-ledger.md).

| Código | Entrega | Estado |
|---|---|---|
| PRE-06 | [Plan](2026-11-09-tp01-pre-06-plan.md) | build_contract_defined_activation_pending |
| PRE-13 | [Plan](2026-11-09-tp01-pre-13-plan.md) | management_plan_defined |
| PRE-14 | [Plan](2026-11-09-tp01-pre-14-plan.md) | build_contract_defined_activation_pending |
| PRE-16 | [Plan](2026-11-09-tp01-pre-16-plan.md) | code_defined_operations_pending |
| PRE-28 | [Plan](2026-11-09-tp01-pre-28-plan.md) | management_plan_defined |

PRE-16 conserva el [plan de fotos existente](2026-11-09-pre-16-fotos-equipo.md) y añade el cierre de transición. PRE-13 sólo indica que Hermes se encarga con sus instrucciones actuales. PRE-28 no reabre la titularidad ya decidida. PRE-14 concreta un respaldo coherente cifrado y restauración aislada, con Workflows como propuesta técnica nueva y activación separada.

La tanda no equivale a cinco funciones construidas: PRE-06/PRE-13/PRE-28 son principalmente gestión; PRE-16 incluye fotos y aceptación externa; PRE-14 necesita construcción e integración de todos sus entregables antes de activarse. No se ejecuta copia ni se consulta una cuenta real para planificar.

**TP01-A01 resuelta:** incluir Access en esta fase por respuesta explícita de Luis. Las demás condiciones son evidencia de ejecución/configuración, no preguntas repetidas sobre domingo02,12semanas,Cloudflare privado,clave de Luis o titularidad Hampton.

Siguiente orden: resolver Access; construir PRE-16 fotos cuando se encargue; ejecutar gestiones por sus responsables; construir PRE-14 por contrato y validar activación aparte. Las otras cuatro tandas del programa general permanecen sin cerrar por preparar TP-01.

## Resultado de la revisión

Revisor independiente tp01_builder_check:una precisión técnica importante (autenticidad de la copia con pública de recuperación conocida), resuelta con firma Ed25519 y trust bundle externo al bucket/D1. No añadió preguntas de producto.5 alcances definidos (3 de código y2 operativos); PRE-06 incluye Access, sin cuentas verificadas. Los5 planes no equivalen a5 tareas construidas ni a5 funciones listas para activarse.


## Decisión posterior de TP-05 · 10-nov-2026
Luis elige incluir también Cloudflare Access en esta fase. TP01-A01 resuelta como google_2fa_and_access; sustituye las preguntas de alcance anteriores, no acredita configuración. [Contrato Access](../specs/2026-11-10-tp05-access-design.md) y plan PRE-06 actualizado: dos unidades de código y una de aceptación/2FA, sin cuenta verificada por planificación. Revisión fresca tp05_access_builder_check: dos cuestiones técnicas resueltas (medios Staff y autenticación en otra pestaña sin perder borrador), sin preguntas nuevas al usuario. El índice TP-05 contiene el estado consolidado.
