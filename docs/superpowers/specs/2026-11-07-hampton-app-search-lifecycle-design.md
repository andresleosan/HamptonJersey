# EST-09 · Ciclo de búsqueda y cierre humano

7-nov-2026. **Construido y verificado localmente; publicación y migración pendientes. Luis eligió la opción 1 de conservación.** Base: `d0738c77fd7a3267f9516a1514e124061baf5c1d`. Coalcance: continuidad de PRE-12, según M03a y conflicto C01 del plan del 7-nov. La autorización cubre desarrollo local, no publicación.

## Resultado buscado

Una búsqueda sigue activa durante visitas, ofertas y negociación, independientemente de la etapa comercial. Un empleado confirma que el cliente encontró propiedad, con fecha y motivo. Resolver conserva ficha, criterios e historial y no afecta a otras búsquedas ni al barrido diario.

No se construyen inventario externo, consultas compartidas, portal, aviso por correo, nuevos plazos de ventas/alquileres ni purga de archivos a seis meses. Pausa/retirada voluntaria D12 sigue fuera del alcance.

## Evidencia inicial de la base (antes de implementar)

- `server/applicants.js`: `activeSql` e `isActive` excluyen Lost, Completed y archivadas; Paused sigue activa.
- `server/routes/sales.js`: completar venta cambia etapa y recalcula. La etapa provoca indirectamente el cierre actual.
- `server/match-store.js`: recalcular una búsqueda inactiva elimina Found; habrá que preservar esa evidencia al resolver.
- `server/routes/applicants.js`: actividad antigua usada en deduplicación, filtros y archivo; ya existe patrón de escrituras versionadas.
- `server/retention.js`: excepciones para ventas y ofertas abiertas, sin protección general de búsquedas activas. Predicado confirmado con una ficha ficticia en SQLite en memoria; ningún DELETE.
- `site/apply.js`: aviso público de 12 meses desde última actividad; debe corresponder a la decisión final.
- La investigación inicial no pudo ejecutar la prueba por falta de `jose`; npm ci resolvió la dependencia durante la implementación. Resultado final: 630 pruebas JS y 14 Python, build, check:release y recorrido focal/MCP aprobados; el e2e general se detuvo en la galería pública antes del panel (véase ledger).

## Diseño implementado

1. Estado propio Active / Resolved sobre applicants mediante migración aditiva. Las nuevas empiezan activas; las etapas comerciales no escriben ese estado.
2. Acción dedicada Resolve search con confirmación y motivo; registrar actor y fecha. Reopen search es humana, conserva los eventos anteriores y comprueba versión y duplicados activos por operación.
3. Búsquedas antiguas ya activas mantienen actividad. Lost, Completed y Archived antiguas quedan pendientes de revisión, sin reapertura ni resolución masiva por deducción. No inventar autor/fecha de cierre.
4. Archive no puede cerrar implícitamente una búsqueda activa nueva. Las antiguas archivadas conservan su estado hasta revisión; no introducir retirada voluntaria bajo otro nombre.
5. Adaptar matching, Review, deduplicación, avisos y recuentos. Resolver preserva las coincidencias existentes y bloquea escrituras de un recálculo iniciado antes del cierre mediante condición/versionado dentro de la escritura.
6. Resolver solo avisos vinculados inequívocamente a esa búsqueda que dejaron de ser útiles; no cerrar mensajes, visitas ni consultas por coincidencia de contacto. Las futuras consultas compartidas de M06 deberán comprobar utilidad para las demás búsquedas.
7. Completed mantiene su significado comercial; la resolución de búsqueda requiere confirmación aparte. Las reglas económicas de Sales siguen su propio dominio.

Detalles técnicos del plan ejecutado; las reglas de conservación siguientes corresponden a la elección explícita de Luis.

## Decisión acordada C01 / PRE-12

Opción 1 elegida por Luis:

- Una búsqueda activa o antigua pendiente de revisión protege el contacto y sus búsquedas del borrado automático por inactividad.
- Al umbral existente de 11 meses, revisión humana de vigencia en el panel; no anunciar borrado inminente mientras haya protección. Recalcular/revisar no simula contacto ni reinicia last_contact_at.
- Con todas las búsquedas resueltas, mantener 12 meses desde última actividad registrada, incluido cierre, con excepciones vigentes de ventas/ofertas. Resolver nunca elimina datos.
- No prometer conservación personal ilimitada: documentar revisión de vigencia y política posterior al cierre en el aviso público.
- Visitas, correo y chat tienen reglas independientes; revisar vínculos y alcance antes de implementar. No ampliar sus plazos ni prometer historial íntegro indefinido por inferencia.

La respuesta «1» confirma esta política. No se amplían plazos de mensajes o visitas; se explica su conservación independiente. Los detalles técnicos siguientes se resuelven en el plan, sin reabrir la decisión.

## Implementación y aceptación previstas

Migración aditiva 0024; `server/applicants.js`, rutas de applicants/matches/sales, match-store, retención y consumidores en notificaciones/informes/Insights. Panel: ApplicantDetail, Applicants, Review y consumidores de actividad. Aviso público: site/apply.js. Reutilizar componentes Hampton; el plan registra los valores vigentes comprobados frente a DESIGN.md y CSS.

Probar etapas sin cierre, dos búsquedas del mismo contacto, resolución/reapertura concurrentes, cierre frente a recálculo/review/retención, conservación de Found y decisiones, migración ambigua, fechas Jersey y protección por cualquiera de las búsquedas activas. Después: npm test, build, check:release, e2e y Playwright MCP local 1280/390 con validación, vacío/error, teclado, foco, zoom y consola/red.

Plan: `../plans/2026-11-07-hampton-app-search-lifecycle.md`. Publicación y migración remota pendientes de autorización sobre el commit final.
