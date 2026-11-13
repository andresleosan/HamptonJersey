# BUS-14 · cierre de aceptación · 9-nov-2026

**Resultado:** alcance aprobado terminado; código publicado en `72b3ad3be3bf49ea82cf3f8d56cfce169f6e26a7`, migración0037 aplicada en la publicación anterior. El registro de este cierre aún es local. El paquete PAQ-03 conserva las etapas de otras tareas.

El [diseño aprobado](../../../superpowers/specs/2026-11-08-bus-14-match-ranking-design.md) limita BUS-14 al inventario residencial actual. Nuevas fuentes, inventario canónico/EvaluationV1, condiciones comerciales y ranking21d no son pendientes de pruebas de esta entrega: pertenecen a BUS-12/BUS-17 y otros códigos. No se amplía ni reduce el alcance para cambiar el estado.

## Matriz de aceptación

| Criterio aprobado | Evidencia | Resultado |
| --- | --- | --- |
| Incumplir un MUST nunca se presenta como cumplido por tener más puntuación; desconocidos siguen pendientes | requirements-matching.test.mjs: área imprescindible y parking exacto/ambiguo; suite focal actual | PASS local |
| Todas las candidatas pertinentes, incluso score<35; sin cupo25 ni bonus de publicación | matching.test.mjs, bus14-store.test.mjs y suite1068JS registrada | PASS local |
|60candidatas; páginas25/25/10 estables, sin duplicar/perder; Review con el mismo orden | match-pages.test.mjs y bus14-e2e.cjs | PASS local |
| Decisiones/historial conservados, Shortlist/Reject/Undo, formulario sin guardar y respuestas antiguas | Tests servidor, recorrido BUS-14 completo1280/390 y revisión independiente | PASS local |
| Invalidación de cursor,409 con recuperación,503 con Retry, vacíos, autenticación | match-pages.test.mjs y recorrido BUS-14 | PASS local |
| Recálculos concurrentes sin parejas/eventos duplicados; Timeline/Widen globales | bus14-store.test.mjs, bus14-widen.test.mjs y recorrido BUS-14 | PASS local |
| Teclado, foco y zoom200%, escritorio1280/móvil390 | Playwright independiente, zoom nativo del perfil temporal y capturasX11 | Verificado local; MCP indisponible |
| Publicación correcta y ruta protegida | Pages/Jobs correctos para72b3ad3; navegador público1280/390, assets idénticos,0pageerrors y401 sin sesión | Verificado |
| Acceso real a Matches y recálculo de búsqueda antigua | Capturas aportadas por Luis y confirmación explícita «si.todo ok» tras pulsar Recalculate matches | Confirmado por Luis en producción móvil |

Pruebas focales de cierre ejecutadas ahora: `node --test tests/server/requirements-matching.test.mjs tests/server/bus14-store.test.mjs tests/server/match-pages.test.mjs tests/server/bus14-widen.test.mjs`:27/27PASS. El [ledger](../../../superpowers/plans/2026-11-08-bus-14-match-ranking-ledger.md) distingue las suites y los recorridos anteriores, diagnósticos fallidos, revisión y evidencias de publicación.

## Alcance de la comprobación real

Luis mostró el panel autenticado en móvil, la pestaña Matches, una tarjeta y el aviso de orden anterior. Después confirmó que el recálculo funcionó. Se registra como comprobación humana; el agente no tuvo sesión Google de producción ni ejecutó esa API por su cuenta.

Shortlist/Undo y paginación con más de25resultados están cubiertos por fixtures locales, sin repetir esas mutaciones sobre datos reales. Se había añadido esa repetición a la guía manual después de la implementación; el diseño aprobado exigía el recorrido completo local y no todas las combinaciones en producción. Por eso no constituye un bloqueo nuevo ni se afirma haberlo ejecutado en producción. No se crea administrador, se solicitan credenciales o se fabrican registros de producción para cerrar este alcance.

## Pendientes de entrega documental

El producto ya está publicado. La entrega local de documentación y sincronización del test incorpora ahora el avance documental remoto42eda35 y regenera desde ambas fuentes. Tras la revisión final, requiere aprobación del SHA exacto para publicar y desplegar el catálogo que alimenta el tablero. Se conserva todo el trabajo; esto no reabre la aceptación funcional ni autoriza un push o migración. BUS-12 y las demás etapas de PAQ-03 mantienen sus propios criterios.

## Reparación de prueba aislada · 13-nov-2026

La prueba comparaba un score fijo anterior a Undo, aunque Undo recalcula. Ahora captura el score real de la misma tarjeta antes de rechazar y antes de marcar la versión antigua, y verifica que se conserva después. Los inmuebles sintéticos del tramo Widen declaran GBP para que el presupuesto sea comparable. La revisión independiente confirmó que se preservan las aserciones; no se cambió producto. Chromium aislado pasó 1280/390 tanto en la copia de reparación como sobre BUS-12 y SAP-10 integrados. No se probó producción. BUS-14 permanece hecho; no hay nuevo cierre.
