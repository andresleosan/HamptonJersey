# Galería: navegación con foto no disponible

Solicitud de Luis: resolver el bloqueo previo del e2e general y verificar el resultado. Base publicada `aea7eb5e5f0f7ae91ad5a37241755b8748d47fbd`, comprobada con fetch el 7-nov-2026 en `/tmp/hampton-roadmap-integration`.

El estado `.noimg` pinta su aviso después de los botones y los tapa visualmente e intercepta los clics. Se reproduce tras volver del lightbox a una foto fallida. La captura y elementFromPoint descartan la cabecera como causa de esta reproducción, aunque el fallo anterior la mencionaba.

Decisión (grill-me, resuelta con el código): conservar el aviso y poner los controles de la galería por encima de él. Un nivel CSS basta; no modificar la cabecera, el lightbox ni forzar clics. Sin decisiones funcionales nuevas, migración ni dependencias de activación. No cambiar permisos, servicios o datos reales.

Aceptación: ambas flechas siguen visibles y operables con una foto fallida, permiten recuperar una foto válida, conservan foco y teclado al volver del lightbox y funcionan a 1280/390 y zoom 200%. El recorrido general debe alcanzar el panel y registrar cualquier bloqueo adicional por separado.

Ampliación comprobada durante la ejecución: el e2e superó la galería y encontró la cabecera del panel en dos filas a1280. Se conserva el criterio original F5-A R17 y F7-A ajustando solo navegación de escritorio; mobile, marca y destinos permanecen. La fixture de retención ya representa una búsqueda resuelta; se conserva intacta su prueba de caducidad. Criterios adicionales: e2e de cabecera y conservación originales intactos; protección de búsqueda activa cubierta por las pruebas específicas de EST-09/PRE-12.

El recorrido posterior descubrió radios que recibían padding de campos de texto: el centro del área aparente no seleccionaba. Se elimina ese padding solo en checkbox/radio nativos, conservando las etiquetas y su zona accesible. Criterio: selección y cambio de motivo, validación de Other sin nota y teclado en escritorio/móvil; el e2e general debe completarse sin clics forzados.
