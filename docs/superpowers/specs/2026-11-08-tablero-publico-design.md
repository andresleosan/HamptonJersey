# Tablero público de Lista 1–4

Luis eligió un enlace público sin login, actualizado automáticamente y conectado al cierre de `/avanzar`. Las listas son independientes de las herramientas. El coordinador ya publicado sigue siendo la autoridad para reservas y operaciones de los agentes.

## Resultado

Un Worker `hampton-tareas`, con HTML propio de solo consulta, lee el Durable Object `hampton` existente mediante binding externo `BOARD_SOURCE` hacia `TeamCoordinator` de `hampton-team-coordinator`. No crea otro almacén ni migra el namespace. La aplicación Access del coordinador conserva sus políticas y los agentes conservan su endpoint privado.

La API pública expone únicamente schemaVersion, revisión, fecha, números/nombres/capacidad/ocupación de listas y tareas con código, título, número de lista, estado del checklist y actividad anónima. A petición de Luis, el detalle desplegable añade `details` con `done`, `pending`, `nextStep` y `dependencies`: qué está hecho, qué falta, siguiente paso y códigos de tareas dependientes del catálogo público. Se omiten correos de esos textos. El detalle es compatible con respuestas anteriores sin ese campo durante la transición de caché. Personas, identificadores de ejecución, recursos, rutas estructuradas, bloqueos detallados, razones de dependencia, evidencias, referencias y logs no forman parte de esta proyección. El servidor construye cada objeto por campos explícitos, sin expandir el estado privado completo. Las dependencias enlazan otras tarjetas y no acreditan por sí solas disponibilidad para construir.

Solo GET/HEAD del tablero y tres assets permitidos. POST/PUT/PATCH/DELETE/OPTIONS se rechazan antes de tocar el objeto. Rutas privadas o desconocidas no se reenvían. No hay credenciales en el HTML ni en este Worker. Los errores son genéricos. CSP permite scripts propios y las fuentes existentes, sin inline/eval. El acceso público solicitado no se confunde con permisos de edición.

## Actualización y cierre

El navegador consulta cada 15 segundos mientras está visible, vuelve a consultar al recuperar foco y conserva filtros, foco y tarjetas abiertas. Usa caché edge de cinco segundos solo para JSON reducido; clave fija por origen, sin parámetros o cookies. Errores sin caché. En condiciones normales el cambio aparece en unos 20 segundos como máximo; una pestaña oculta o sin conexión muestra el último dato y retoma la consulta al volver.

Cerrar `/avanzar` significa registrar `submit`, `pause` o `complete` según el resultado real y consultar después el estado. Una respuesta de chat no completa una tarea. El cierre build vigente sigue viéndose completado después de deshabilitar su unidad al publicar; las finalizaciones antiguas invalidadas o las de planificación no equivalen a cierre build. El estado del checklist y la actividad se muestran por separado.

## Interfaz y reglas existentes

Superficie: herramienta de roadmap, no web inmobiliaria ni panel de gestión de clientes de DESIGN.md. Se reutiliza el estilo aprobado `docs/roadmap/equipo.css`: papel #F4F6F8, superficie #fff, tinta #22303F, secundario #566476, línea #D3DAE2 y acento #2B6CA3. Modo oscuro existente: #0F1720/#16202B, tinta #E3E9EF y acento #6FA8DC. Open Sans15px/1.55, encabezado Source Serif4 de2rem/1.2 y códigos IBM Plex Mono. Ancho máximo1120px, padding24px16px, separación16px, tarjetas radio8px/padding14px, foco2px y controles44px. Una columna hasta759px, dos desde760px, cuatro desde980px. No se sustituyen paletas de otras superficies de DESIGN.md ni se crea otra estética.

Seguridad frontend: textContent/createElement, respuesta validada y credenciales omitidas; ninguna inserción HTML de datos. Rendimiento: sin dependencias nuevas, proyección reducida, consultas pausadas y caché compartida breve. Accesibilidad: etiquetas reales, enlace de salto, status en vivo, detalles nativos y foco preservado. Código mínimo: CSS reutilizado y lectura del único estado existente. El alcance no incluye rediseñar componentes ajenos ni cambiar controles del coordinador.
