# PAQ-02 · Conciliación de registro y propuesta REG-06

Fecha: 10-nov-2026. Copia aislada `/tmp/hampton-paq02-15jls7Y1/repo`, rama `main`, base `47dab2c`; `check-avanzar` confirmó copia limpia y GitHub igual antes de editar. La rama y los archivos privados o pendientes de la copia original se conservaron. Candado local de la copia aislada durante el trabajo.

## Alcance y hallazgos

- REG-08 `cfb3d3c`, REG-11 `9b8dbd41` y REG-17 `5e9c8609` son antecesores de la base verificada. Los archivos de migración 0031, 0025 y 0026 están en el árbol. No se reconstruyeron ni se ejecutaron migraciones.
- La reconciliación anterior registra REG-11 publicado y 0025 aplicada, y REG-17 publicado con 0026 aplicada. La evidencia anterior de REG-08 registra una consulta sin migraciones pendientes después de 0036. Hasta esa conciliación no se había consultado producción y `migrar-hampton` no estaba disponible. La consulta de solo lectura posterior se registra más abajo; no se atribuye una nueva activación remota.
- Se concilian las fichas REG-04/05/06/07/11 con la integración en GitHub; se conservan sus estados parciales y sus pendientes reales. REG-17 continúa parcial hasta que VIS-17 reutilice las franjas en la coordinación de visitas.
- REG-06 conserva una [propuesta concreta](../specs/2026-11-10-paq-02-reg-06-proposal.md), separada del código y de la aprobación de publicación. La migración 0033 propuesta históricamente ya está ocupada; la última en esta base es 0038. La aprobación del diseño y la selección de migración al construir siguen pendientes.
- BUS-14 ya está integrado y su orden de resultados es estable por grupo, puntuación, identificador de propiedad y match. Una preferencia futura debe respetar el orden, el cursor de paginación y las decisiones humanas; guardar un campo no basta para satisfacer el criterio.
- REG-07: una revisión independiente reprodujo que mascotas omitidas con prioridades versionadas podían obtener `meets` sin check de mascotas. [Plan de corrección](2026-11-10-reg-07-pets-pending-fix.md). La corrección local marca la respuesta omitida o Not sure como pendiente, pide confirmar si el hogar tiene mascotas, conserva No pets y evita alterar Shortlist/Rejected. No cambia producción ni añade migración.
- Las tarjetas de ranking anterior ofrecen recálculo; Widen evalúa datos actuales y, si encuentra datos históricos inválidos que impiden comparar, comunica que no está disponible sin interpretar exclusiones como vacías. La evidencia de características JSON inválida o de tipo incorrecto se trata como desconocida. Una carrera que invalida la escritura protegida devuelve 409 en lugar de un éxito falso. El 409 puede seguir a escrituras válidas parciales; reintentar usa las mismas reglas y no borra decisiones.

## Comprobaciones

- Dependencias del lockfile instaladas solo en el clon, sin scripts de instalación.
- Antes de la corrección, pruebas focales de registro, disponibilidad y requisitos: 109/109; suite `npm test`: 1100/1100 JavaScript y 14/14 Python. Después de la corrección: `npm test` 1112/1112 JavaScript y 14/14 Python; `npm run build`, `npm run check:release`, `npm run team:check`, `npm run check:packages` y `git diff --check` aprobados. La prueba DOM ejecuta el botón de recálculo, conflicto 409 y recuperación del foco; no acredita un navegador real.
- Consistencia del catálogo y paquetes: fuentes de las cinco tareas y unidades actualizadas, derivados regenerados; `npm run team:check`, `npm run check:packages` y `git diff --check` aprobados. El primer `team:check` detectó legítimamente los derivados desactualizados tras editar el checklist.
- `npm run test:e2e` no completó: falta Playwright Core en el entorno. Playwright MCP falló al iniciar Chromium con sandbox; Chrome con un usuario sin privilegios también quedó bloqueado por el aislamiento de namespaces. No se desactivó el sandbox. El recorrido real de escritorio/móvil y zoom sigue pendiente; la prueba DOM sintética no lo sustituye.
- Revisión independiente del diseño y de las cinco fichas: confirmó la separación de los hechos históricos y la falta de consulta de producción. Hallazgos incorporados a REG-06: el comparador antiguo no alimenta el orden real; tratar SQL de Matches/Review, cursor de `server/match-pages.js`, índice y páginas 25/25/10; invalidar revisiones ante cambios de respuesta o preferencia; impedir copias de duplicados inconsistentes y conservar la incertidumbre de una exclusión con parroquia desconocida. REG-07: revisión independiente detectó y se corrigieron rankings obsoletos, evidencia inválida, coste de reevaluación y falso éxito ante una carrera. Última revisión focal independiente 41/41, sin otros hallazgos concretos; el ajuste posterior de foco tiene prueba DOM RED→GREEN. El SHA local se registra en el relevo; publicación pendiente.
- Rendimiento: microprueba local de 1.000 evaluaciones, mediana 4,6 ms, sin consultas ni latencia de producción. Widen corta cuando encuentra tres coincidencias vigentes; no se infieren tiempos del servicio real.

## Seguridad

Centinela emitió dos alertas sobre salidas de diagnóstico. La primera correspondía a una marca de tiempo y la segunda al texto de una expresión del propio detector durante su inspección. Una alerta adicional durante la revisión correspondió a un valor fijo ficticio del helper de pruebas. No se consultaron contraseñas ni registros de inicio de sesión, y no hay evidencia en estas salidas de exposición o compromiso activo. No se realizó ninguna remediación.

## 10 November: browser evidence and handoff

- The earlier browser limitation is superseded for local checks: the isolated real WebKit run covers registration and panel at 1280/390, keyboard and native zoom above 200%, including the REG-07 Pets Unknown match card. See the [REG-06 browser ledger](2026-11-10-reg-06-area-ledger.md) for the environment and simulated dependencies.
- A read-only migration listing now shows only 0039 pending in production. The migration and publication remain unperformed pending authorization of the reviewed exact SHA; production smoke checks follow the delivery.

- The anonymous, read-only public production baseline now passes in real WebKit at 1280/390. REG-06 is not yet visible there; see the REG-06 ledger for exactly which operations the smoke check permits and its limits.

## 11-nov-2026 · Publicación verificada

- El commit `fe9618f23677c7fab4f8aa19a3f7f836dd290df2` llegó a main; la migración 0039 se aplicó y se verificaron registro, columnas, índice y triggers. El marcador previo de recuperación se conservó fuera del repositorio.
- Cloudflare Pages y Workers Builds `hampton-jobs` terminaron correctamente. La prueba pública anónima de solo lectura, con WebKit aislado a 1280/390, confirmó las tres opciones de zona. No hubo envío de datos ni prueba autenticada del panel en producción.
- REG-07 recibió después un ajuste local adicional de mascotas imprescindibles; su verificación y publicación se registran por separado.

- Actualización posterior: REG-07 y la regla quedaron publicados en `e589b167177f4ac6b1511858cbf4af15aa0f38a5`; Pages y `hampton-jobs` correctos, y smoke público anónimo sin envío correcto a 1280/390. El panel autenticado no se comprobó en producción.
