# PRE-11 · Tours externos solo tras elección · Ledger

8-nov-2026 · Lista1 · PRE-11. Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobadaGitHub14:14UTC. Solo planificación: sin reserva, construcción, migración, envío o publicación.

[Diseño](../specs/2026-11-08-l1-tour-privacy-design.md) · [Plan](2026-11-08-l1-tour-privacy.md).

Estado: Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

Fuente y decisión: site/index.html mountPublic crea .tour3d con playing=false pero IntersectionObserver lo cambia al entrar en viewport. show(i) conserva playing al cambiar de tour. La ficha crea iframe al seleccionar tour. site/lib.js restringe embedUrl a Matterport/Vimeo/YouTube-nocookie. Consultadas fuentes primarias: [Vimeo dnt](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters) y [YouTube privacidad mejorada](https://support.google.com/youtube/answer/171780?hl=en). Los parámetros reducen seguimiento, no se presentan como garantía de ausencia total de cookies ni cumplimiento legal.

Dependencias: PRE-11 no tiene dependencia de catálogo. No se activa una campaña ni un proveedor nuevo. El diseño del control de carga está cerrado técnicamente; no se presenta como conclusión legal sobre qué cookies son esenciales. Cualquier autorización global persistente o nueva herramienta de consentimiento se diseña por separado.

Criterios de producto y pruebas permanecen abiertos hasta ejecución. La validación documental y revisión independiente de la tanda se registran en el índice común; no se presentan pruebas futuras como pasadas. Git sin autor configurado: conservar documentos, no inventar identidad. Relevo privado fuera de Git.

Gate antislop documental: Hard Gate PASS por estados/cifras basados en hechos y sin producto entregado; Purpose PASS por ampliación del flujo existente con razones en spec; Liveliness PASS diales1/1/1 según pantalla operativa; Craftsmanship PASS por contratos/controles definidos sin contenido ficticio. Los gates de runtime y Playwright quedan pendientes de construcción.

## Reconciliación y pruebas finales · 11-nov-2026

Base de integración: `4947b0c7cb95901a452d14da9a57f23cabc07b39`. Se combinaron el reajuste de galería existente en main y el desmontaje del tour; no se sobrescribieron cambios ajenos. PRE-11 sigue parcial, sin publicación.

El clic intermitente coincidió con desplazamiento de la página entre pointerdown y pointerup en el fixture. La prueba estabiliza el carrusel y la posición antes de pulsar, sin repetir el clic. La segunda reserva antes no tenía hora seleccionada; con posición estable selecciona otro horario y recibe HTTP 201 en el servidor local. No se ha acreditado que la aplicación de producción padeciera el fallo.

Sobre main integrado: 1.188 pruebas JavaScript y 14 Python aprobadas; build y check:release aprobados. WebKit aislado: PRE-11 y zoom nativo superior al 200 % en 1280/390 aprobados; public/urls y admin/reg17 aprobados por separado. REG-17 y rutas usan bases sintéticas independientes. Las capturas del tour se revisaron sin datos reales.

Una comprobación adicional de `tests/design.e2e.cjs` notificó `ResizeObserver loop completed with undelivered notifications.`; se reprodujo el mismo aviso al ejecutar la misma prueba sobre main `4947b0c` sin el parche PRE-11, con filtro acotado de fuentes sin red. No se ha corregido ni se considera una comprobación de galería aprobada. Se mantiene como problema independiente y no se ocultó.

### Estado sin conexión y cierre de verificación local

El control muestra un error y permite reintentar o volver al aviso si `navigator.onLine` indica desconexión; no crea iframe ni cuenta la apertura en ese caso. La prueba de unidad y WebKit verifican desconexión y reconexión simuladas, sin acceso a proveedores externos. En la suite aislada general, el indicador de conexión se simula como activo porque la red del contenedor está deshabilitada y las solicitudes locales siguen funcionando; la prueba focal conserva explícitamente ambos estados.

Batería final tras este cambio: 1.188 JavaScript y 14 Python, build, release y catálogo aprobados. WebKit focal 1280/390 con zoom nativo superior al 200 % aprobado; public/urls aprobados en esta revisión. La ejecución admin/reg17 aprobada corresponde a la revisión inmediatamente anterior, antes de añadir el tratamiento sin conexión. La galería mantiene la advertencia de ResizeObserver reproducida también en la base; no se afirma que esa prueba haya pasado. No se ha publicado.

## Publicación y comprobación · 11-nov-2026

Luis autorizó integrar, publicar y actualizar el checklist. `d0a9877872d2e88d4629fb99b8655b953ee5f068` entró en main por avance normal; los checks Cloudflare Pages y Workers Builds: hampton-jobs terminaron con éxito. Sin migraciones.

WebKit aislado en producción, anónimo y solo GET/HEAD: a 1280 y 390 la portada muestra el aviso, no crea iframe antes de elegir, lo crea al elegir y lo retira al cerrar. Las solicitudes al proveedor se bloquearon; no se enviaron formularios ni se auditó el almacenamiento del proveedor. No había una ficha pública con tour para repetir ese recorrido en producción; su flujo se probó localmente con datos ficticios. El aviso de ResizeObserver de la galería se reprodujo también en la base sin este cambio y queda separado.
