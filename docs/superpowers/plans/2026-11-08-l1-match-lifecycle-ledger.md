# Ledger: Lista 1 match lifecycle

8-nov-2026; planificación sin reservas. Copia `/tmp/hampton-lista1-batch-20261108`, base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, GitHub14:14 UTC comprobado por coordinación. Solo spec/plan/ledger; cero producto publicado/construido.

| Código | Entregado ahora | Estado real y faltantes |
|---|---|---|
| EST-14 | diseño+planTasks 1–3 | pendiente; EST-13/AGE-12/VIS-17 aún pendientes, integración y pruebas futuras |
| EST-08 | alias explícito de EST-14 | replanteado; no tarea duplicada |
| EST-18 | definición productores applicant y atomicidad | parcial; registro ya publicado, conectar futuros productores, vista aplazada |
| EST-09 | consumidor e invariantes, sin nueva implementación | hecho publicado; no cierre por visita/oferta/acuerdo |

Evidencia leída: catálogo de códigos y dependencias, reconciliación7-nov, DESIGN, migrations0009/0010/0012/0029, match-store/routes/matches, inbox/viewings, sales, rentals, events/listing-events/api/auth. Se detectó que rejected legacy significa revisión empleado y no respuesta cliente; se preserva. El subsistema rentals sí existe, pero no se inventa vínculo de tenancies con nuevo inventario.

Contrato coordinado con planificación matching: match_candidates/match_decisions futuros y property_key canónica; disponibilidad única en market-availability, sin duplicar evidencia. Futuros productores usan entity_type applicant ya admitido, evitando ampliar CHECK para match. Todos los estados booked/viewed/offer/agreed requieren hecho real, no simple toggle.

Decisiones técnicas de este plan: dimensiones separadas, CAS+recibos, backfill solo correspondencia única, hechos tardíos históricos sin reabrir búsqueda. No aprobación expresa adicional de Luis; D12 pausa/retirada fuera. No nuevas decisiones comerciales asumidas.

Skills aplicadas: avanzar para catálogo y ámbito; brainstorming para alternativas; grill-me para actor/ambigüedad/concurrencia; writing-plans para archivos/DTOs/pasos RED-GREEN; security-best-practices/frontend-security-coder para grants/CSRF/texto; impeccable/puertos DESIGN para interfaz compacta; ponytail para productores actuales sin librerías; web-performance-optimization para joins/index y evitar N+1. Sin página nueva/rediseño: taste/redesign no aplican.

Autorrevisión documental completada: trazabilidad EST-14/08/18, cinco focos con pruebas futuras, separación stock/cliente/empleado/búsqueda, lossless ventas, CSS vigente frente propuestas, errores y versionado. No ejecutados tests/build/release/e2e ni Playwright (no aplica producto ahora), no cambios de infraestructura, .env/credenciales, git add/commit/push. Los pasos de implementación permanecen sin marcar.

Comprobación documental final: UTF-8 legible, fences Markdown balanceados, cabeceras de plan presentes, pasos RED/GREEN futuros sin marcar y contratos internos revisados. Verificación estática de documentos únicamente; no ejecutar producto ni confundir este resultado con tests de implementación.

Corrección de revisión independiente: MatchRef.material_version alineado con BUS-12 como string/TEXT opaco; comparación exacta y guarda CAS sin conversión numérica. Plan incorpora prueba futura de token no numérico y rechazo del número 1 frente al string `1`; revision permanece entero. Solo documentación propia modificada.
