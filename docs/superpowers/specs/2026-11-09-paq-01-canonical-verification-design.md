# PAQ-01 · reparación del verificador de integración

9-nov-2026. Mantenimiento del coordinador, separado de las 250 tareas de producto. No reserva una unidad inventada ni modifica tareas/autoridades para habilitar construcción. Base main verificada b565121. La sesión está incorporada correctamente; el registro de evidencia integrada antigua ha revelado un fallo previo del verificador.

## Problema y evidencia

verifyIntegrated pide /compare/<sha>...main completo y limita respuesta a 1.000.000 bytes. La comparación real EST-09 publicada aea7eb5…main devuelve HTTP 200 pero supera ese tamaño por los parches de archivos acumulados. El coordinador rechaza 503 CANONICAL_UNAVAILABLE antes de registrar evidencia; el CLI conserva la operación con resultado pendiente y exige reintento idéntico. Se reprodujo dos veces sin cambiar payload/identidad. No limpiar estado privado ni saltar la operación.

La API oficial GitHub documenta que files aparece solo en primera página: https://docs.github.com/en/rest/commits/commits#compare-two-commits . La consulta per_page=1&page=2 conserva status y merge_base_commit y omite los parches. Lecturas públicas reales: EST-09→mainHTTP200/10.997 bytes/ahead/merge-base correcto; main→mainHTTP200/7.579 bytes/identical/sin commits en página2. El revisor independiente confirmó también ahead1 con commits[] vacío. No usar longitud de commits como criterio.

## Cambio mínimo

Añadir ?per_page=1&page=2 a verifyIntegrated. Conservar la misma validación status ahead/identical y merge_base_commit.sha igual al SHA pedido, el límite1 MB, timeout8 s, repositorio canónico, esquema/APIheaders y rechazo de respuestas inválidas. Sin fallback a primera página ni más peticiones. No cambiar CLI, pendientes, identidades, Access, permisos, catálogo ni protocolo de reservas.

La alternativa de ampliar/eliminar el límite permitiría respuestas crecientes sin necesidad; cambiar a otro endpoint no prueba mejor la ascendencia. Mantener compare paginado resuelve la causa y conserva el límite y la prueba actual.

## Aceptación

C1 comparación válida con parches>1 MB en página1 se valida usando metadata de página2; una sola petición acotada. C2 identical y ahead, incluidos0/1 commits en esa página, aceptan solo merge-base correcto. C3 behind/diverged/merge-base ausente o distinto rechazan. C4 HTTPfallido/JSONinválido/respuesta aún>1 MB fallan cerrados y no hacen fallback. C5 runtime real:503 no crea evidencia ni cambia revisión; mismo operationId/body tras recuperarse upstream registra una sola evidencia y replay retorna el mismo recibo. C6 la operación real de PAQ-01 permanece intacta hasta desplegar el arreglo aprobado y reintentar exactamente la misma petición.

No hay UI nueva o modificada: tokens visuales/responsive/Playwright de DESIGN no aplican. Seguridad/rendimiento: no credenciales/PII en código o logs; mismo límite, validación y una petición con menos datos. No tabla, migración, evento o tarea de Hampton nuevos.
