# Ledger: Lista 1 availability

Fecha: 8-nov-2026. Tipo: planificación sin reservas. Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`; copia `/tmp/hampton-lista1-batch-20261108`, remoto comprobado por coordinación 14:14 UTC. Ningún código de producto construido ni publicado.

| Código | Cobertura documental | Estado real preservado | Falta para construir/cerrar |
|---|---|---|---|
| EST-16 | spec y plan Task 1 | pendiente | BUS-10 integrado; D02 aprobada 8-nov por construir; migración/funciones/pruebas |
| EST-15 | Task 2 | parcial | EST-16/BUS-10 y avisos NOT-11; manual/exclusión/propagación real |
| EST-07 | alias hacia EST-15 | replanteado | no duplicar implementación histórica |
| EST-19 | Task 3 | pendiente | D10 aprobada 8-nov, por construir; SPR-03/BUS-10/EST-15 integrados; purga futura |
| EST-18 | Tasks 1–3 productores nuevos | parcial con registro publicado | ampliar entity_type coordinado, conectar productores; sin vista de historial |

Leídos catálogo JSON de códigos/dependencias, reconciliación7-nov, DESIGN vigente/propuesto, listing/listing-events/events/match-store/routes/listings/jobs/retention/auth/api/rentals/media. La lectura halló `confirmed_at` legacy actualizado por publicación/precio y CHECK events que no admite property; ambos quedan protegidos. Las tablas BUS-10 y SPR-03 se documentan como contratos futuros, no hechos.

Decisiones: separación observación/confirmación y alcance proceden de reconciliación. CAS/outbox/manifiesto y UTC/fin-de-mes son decisiones técnicas propuestas del plan. D02 aprobada expresamente por Luis en sesión 8-nov:48 h alquiler/7 días compra configurables, contradicción material exige reconfirmar. D10 aprobada después en misma sesión: seis meses solo originales/derivados/paquetes de presentación sin uso activo, conservando identidad mínima/referencias/evidencia necesaria/historial de clientes/consultas/visitas. La aprobación de políticas no ejecuta ni autoriza un borrado real ahora. Archivado editorial y papelera comercial separados. Manual primero; los fallos de scraper no dan baja; humano posterior prevalece; otra operación no se afecta sin evidencia.

Skills aplicadas: avanzar para catálogo/alcance, brainstorming para comparar enfoques y límites, grill-me para riesgos/decisiones abiertas, writing-plans para tareas/interfaces/RED-GREEN futuros; security-best-practices y frontend-security-coder para auth/evidencia/escaping; impeccable shape y DESIGN para formularios focales; ponytail para reutilizar D1/jobs/React sin dependencias, web-performance-optimization para límites/cursor/miniaturas. No nueva página visual ni rediseño; taste/redesign no aplican. Antislop se aplica a copy inglés, datos honestos y componentes vigentes; no instalar skills ni herramientas.

Autorrevisión documental: trazabilidad por código, dependencia real, transiciones/actor/versión/evidencia, escenarios de concurrencia, separación CSS vigente/propuesta, política destructiva condicionada. No ejecutados npm test/build/release/e2e ni cron/purga; no aplica validar producto en una entrega solo documental. Playwright no aplica ahora. Todos los checkboxes de implementación permanecen sin marcar. Sin credenciales, .env, infraestructura, reserva, git add/commit ni push.

Sin decisiones D02/D10 pendientes en este grupo. Revisión de contrato BUS-10/EST-13 y numeración de migraciones al construir. Estos pendientes no impiden entregar el plan; sí impiden afirmar implementación o sistema operativo construido.

Contrato coordinado con grupo EST-13: availabilityFactsQuery retorna filas property_key+confirmation_id y contexto general/search con versiones de búsqueda/requisitos/ocupantes; EST-13 decide availability_current_for_search. Evita trasladar confirmación del hogar A al B. Purga fail-closed uso desconocido, pins y CAS/fence sin reutilizar revisión/key deleting; recaptura crea key nueva para resistir delete remoto tardío.

Comprobación documental final: UTF-8 legible, fences Markdown balanceados, cabeceras de plan presentes, pasos RED/GREEN futuros sin marcar y contratos internos revisados. Verificación estática de documentos únicamente; no ejecutar producto ni confundir este resultado con tests de implementación.
