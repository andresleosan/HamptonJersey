# Implementación y evidencia del tablero público

Base comprobada: main f0f363ccf63fb3d757643d5d56444a8600864893. Requisito: enlace público de consulta, sin clave, actualizado al registrar cada cierre de /avanzar. Diseño: [tablero público](../specs/2026-11-08-tablero-publico-design.md).

## Plan

- [x] Separar entrypoint público y binding de lectura del Durable Object ya existente.
- [x] Proyectar únicamente código/título/lista/estado/actividad anónima/fecha y capacidad; bloquear campos nuevos por allowlist.
- [x] Servir HTML/JS/CSS explícitos, GET/HEAD únicamente, errores genéricos y CSP sin scripts inline.
- [x] Refrescar cada15s con pausa al ocultar, recuperación al foco, filtros/foco/apertura conservados y último dato válido ante fallo.
- [x] Caché pública5s con clave fija sin cookie/query; errores no guardados.
- [x] Conservar completados vigentes tras deshabilitar unidades publicadas y distinguir estado del checklist de actividad.
- [x] Registrar cierre de /avanzar en el coordinador, sin fingir cierre por acabar un chat.
- [x] Pruebas Node/DOM, lectura cruzada real SQLite y paquete dry-run.
- [ ] Publicar el SHA revisado/aprobado y desplegar Worker público en la cuenta fijada.
- [ ] Verificar HTTPS sin login, campos mínimos, actualización de progreso y API privada todavía protegida.

## Evidencia

Cinco pruebas focalizadas iniciales pasan: las250tareas proyectadas, listas estables aunque se reordene el catálogo, límites de métodos/rutas sin llamadas de escritura, errores opacos y DOM con actualización de cierre sin recarga/XSS/filtros/foco. La regresión de caché agrega una sexta: solo JSON reducido, clave compartida sin cookie/query, expiración, HEAD vacío y errores sin caché.

La prueba Workers/SQLite usa dos scripts y el mismo objeto, importa catálogo ficticio por el coordinador, reserva y completa con evidencia aceptada de prueba, comprueba el cambio público en la siguiente lectura tras la caché y conserva completado después de importar unidad deshabilitada. El endpoint privado anónimo permanece401 y el público POST permanece405. No usa tareas reales para fabricar revisiones.

Suite inicial:895Node+14Python, todos pasan. Runtime completo:26/26. Build y check:release correctos. El paquete público dry-run resuelve BOARD_SOURCE al script coordinador existente; copia únicamente HTML/JS/CSS. La repetición final tras caché y correcciones pasa 896 Node + 14 Python. Las seis focalizadas y la prueba cruzada con TTL real pasan 7/7. Revisión independiente cerrada sin hallazgos pendientes; se corrigieron el cierre de unidades deshabilitadas y el aviso de error que un temporizador podía sustituir prematuramente por En vivo. El build fija un outdir absoluto dentro del directorio ignorado para no añadir bundles/sourcemaps al commit.

Playwright MCP se intentó antes de navegar y falló al iniciar Chromium por sandbox/root. No se desactivan protecciones. DOM no acredita revisión visual nativa a1280/390; queda ese recorrido pendiente. La hoja de estilo responsive existente se conserva sin cambios.

El diseño excluye cambios al esquema de datos, rutas de escritura privadas, credenciales de los agentes y políticas Access existentes. El vínculo por script_name y la invocación RPC están documentados en Cloudflare Durable Objects Getting started y Miniflare Durable Objects.
