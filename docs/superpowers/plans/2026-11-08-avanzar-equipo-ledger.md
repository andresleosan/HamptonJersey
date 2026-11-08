# Ejecución de coordinación de equipo

Plan: 2026-11-08-avanzar-equipo.md. Solicitud de implementación de Luis, 8-nov-2026.

Base: main 36c4c2b746b3421b37fb5d59826772c6814c096f en copia aislada. La rama original y todos sus cambios ajenos se conservan. Se copiaron únicamente los cinco documentos públicos creados para esta tarea.

## Revisión previa de interfaces

| Partes | Contrato y decisión |
|---|---|
| Catálogo → servidor/cliente/vista | coordination/CONTRACT.md fija Unit, recursos, evidencias y respuesta de tablero. |
| Cliente → servidor | Rutas, generación, identidad y operationId fijados antes de implementar. |
| Vista → servidor | GET de solo lectura; ningún token en HTML. Catálogo de la respuesta reemplaza la instantánea. |
| Publicación → catálogo | Importación verificada desde main; turno no concede permiso de push. |
| Tareas 0–5 | Preparación y pruebas locales autorizadas; cambios externos requieren capacidades reales y autorización vigente. |

Ruling: usar main en un clon aislado según el contrato Hampton y el plan aprobado, conservando la copia ajena; no crear previews. Ruling: implementar módulos independientes en paralelo con propiedad de archivos explícita para aprovechar los cuatro agentes; se revisan integración y concurrencia al terminar. Ruling: las inferencias del reparto no se convierten en autorización de código: unidades sin alcance revisado permiten planificación reservada, y bloquean construcción hasta registrar un contrato válido en catálogo. Esto preserva cobertura250 sin inventar que toda tarea está lista.

## Progreso

- Base y documentos recuperados; comprobación Git confirma main remoto, con solo documentos de esta tarea sin seguimiento.
- Capacidades comprobadas en VPS y taller; los dos equipos locales siguen sin acceso acreditado.
- Catálogo, coordinador, cliente y vista implementados. Revisión independiente integral y re-revisión final favorables: los cuatro hallazgos materiales quedaron corregidos y verificados. Entrega preparada para commit local y revisión de publicación.
- Publicación y activación externa: pendientes; ningún recurso contratado ni desplegado.

## Capacidades comprobadas

- VPS: Node/Git disponibles; Wrangler OAuth presente, una cuenta y permisos de Workers/Pages, sin permisos de Access acreditados. No se imprimieron credenciales.
- Hermes1/2: activos, mismo taller, clon y candado. La allowlist vigente y montada no permite un hostname nuevo del coordinador; el cliente debe respetar proxy HTTP(S). Necesita alta específica de hostname e identidad por el procedimiento autorizado. No se tocó configuración.
- VS Code y Codex escritorio: equipos no conectados a esta sesión; acceso no verificado.

## Catálogo

- Siete pruebas pasan: 250 puntos sin pérdidas, propiedad única, dependencias/ciclos, historial no ejecutable, conflictos por ruta/contrato, extracción HTML segura y generación coherente desde archivos por tarea.
- Fuentes por punto y unidades generadas; la revisión de diseño de cada alcance es evidencia de coordinador, no una supuesta aprobación de todas las inferencias iniciales.
- Dependencia directa undici añadida para respetar el proxy del taller, sin apoyarse en una dependencia transitoria de Wrangler.
- Corrección RED→GREEN: conservar también deps, modulo y criterio_aceptacion al regenerar el HTML; no usar una lista parcial de campos originales.
- Pruebas con el catálogo real: los cuatro puestos adquieren tareas de planificación compatibles; Hermes no abre dos sesiones ni ocupa otro puesto; sesión sin contacto conserva recursos.
- Vista: pruebas DOM reproducibles con jsdom de desarrollo, además de pruebas de estado. No se alteraron controles para iniciar navegadores nativos.

## Validación de la implementación

- Suite final: npm test, 854 pruebas Node y 14 Python correctas. Incluye 49 casos del cliente, 18 de estado/retención del coordinador, 10 del tablero, 7 del catálogo y 3 del reparto real. Otras 15 pruebas ejecutan Workers/SQLite real. Tablero DOM correcto, sin acreditar navegador nativo. team:check confirma la coherencia de los archivos generados.
- Build de la aplicación y check:release correctos. Dry-run final del Worker correcto: 83,04 KiB, 21,95 KiB gzip y seis assets públicos explícitos; no despliega ni acredita una activación. La migración new_sqlite_classes pertenece al nuevo coordinador, no a D1 Hampton; se aplicará solo con su despliegue autorizado.
- Revisión puntual del cliente: corregidos respuesta perdida de relevo, UTF-8 cortado entre bloques y saneamiento de códigos de error. Pruebas de regresión incluidas.
- Revisión integral y correcciones comprobadas: auditar commits propios y resoluciones de merge sin atribuir main ajeno; reservar turno provisional con divergencia verificada y exigir integración para el SHA final; aceptar explícitamente un relevo autenticado conservando trabajo, incluso con divergencia y peticiones antiguas revocadas; exigir evidencia del contrato vigente; mostrar tareas completadas y disponibilidad sin confirmar correctamente.
- El revisor independiente volvió a ejecutar 18 regresiones seleccionadas del cliente, sus dos reproducciones de recuperación, 11 casos del servidor, 10 del tablero y la suite DOM. Confirmó también que el cliente consume el remoteHead verificado por el checker real. Sin hallazgos materiales abiertos; la aprobación de revisión no equivale a publicación o activación.

## Diferencias y límites explícitos

- Cada uno de los 250 puntos tiene puesto y unidad. El historial no es ejecutable. Las dependencias inferidas y alcances parciales se conservan como metadatos; un punto sin contrato de alcance revisado solo puede avanzar en planificación. La reserva inicial no autoriza editar código de producto.
- No se ejecutaron pruebas desde Windows ni desde los equipos reales de VS Code/Codex. Los ensayos de cuatro clientes son locales; no equivalen a instalar cuatro puestos.
- Playwright MCP no pudo arrancar Chromium como root con sandbox y WebKit carece de bibliotecas nativas. La validación DOM cubre refresco, filtros, foco, expansión, 250 puntos y estados de error. El recorrido visual nativo 1280/390 y zoom queda en el piloto.
- V1 conserva la ocupación de un checkout pausado con trabajo pendiente. No abre otro clon Hermes ni permite introducir una segunda entrega en ese checkout. La ayuda automática solo toma una unidad libre y compatible.
- Respuestas idempotentes: máximo 24 horas/6000 respuestas; eventos: últimos 1000. Cada operación ocupa su propia fila SQL; al retirar su respuesta conserva el identificador y fingerprint para rechazar reutilización. No se reescribe un JSON acumulando todas las operaciones. Catálogo y eventos también están separados del estado de trabajo. Su crecimiento y el archivo del historial requieren seguimiento operativo, no habilitan borrar reservas ni evidencias automáticamente.
- Menor aceptado: el tablero responde con catálogo completo; consultas condicionales por revisión pendientes como optimización. Ya suspende pestañas ocultas y aplica espera creciente en errores. Registrar tráfico real en el piloto.

## Cierre y siguiente paso

Conservar la entrega en un checkout main independiente dentro de .worktrees/avanzar-equipo, sin mezclar la rama antigua ni sus archivos ajenos. Catálogo, coordinador y adaptadores forman una entrega integral revisada por componentes. No se ha hecho push, despliegue, cambio de Access, alta de identidades ni modificación de la allowlist del taller.

Siguiente acción: aprobar el SHA final para publicar, configurar el origen privado con acceso autorizado a Cloudflare Access y completar [ACTIVACION.md](../../../coordination/ACTIVACION.md). Solo tras probar los cuatro equipos reales se publica su estado operativo canónico; un equipo sin configuración no podrá continuar en modo individual por ese motivo.

## Revisión puntual Centinela

Alerta automática durante una lectura de código: se pausó y clasificó como falso positivo mediante inspección limitada a los fragmentos señalados y recuentos de patrones, sin repetir evidencia. No se consultaron valores de autenticación ni hubo exposición acreditada. No se rotaron credenciales ni se tocaron controles. Implementación reanudada con salidas acotadas. Informe privado redactado conservado fuera del repositorio público.
