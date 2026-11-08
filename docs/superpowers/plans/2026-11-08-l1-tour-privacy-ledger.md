# PRE-11 · Tours externos solo tras elección · Ledger

8-nov-2026 · Lista1 · PRE-11. Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobadaGitHub14:14UTC. Solo planificación: sin reserva, construcción, migración, envío o publicación.

[Diseño](../specs/2026-11-08-l1-tour-privacy-design.md) · [Plan](2026-11-08-l1-tour-privacy.md).

Estado: Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

Fuente y decisión: site/index.html mountPublic crea .tour3d con playing=false pero IntersectionObserver lo cambia al entrar en viewport. show(i) conserva playing al cambiar de tour. La ficha crea iframe al seleccionar tour. site/lib.js restringe embedUrl a Matterport/Vimeo/YouTube-nocookie. Consultadas fuentes primarias: [Vimeo dnt](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters) y [YouTube privacidad mejorada](https://support.google.com/youtube/answer/171780?hl=en). Los parámetros reducen seguimiento, no se presentan como garantía de ausencia total de cookies ni cumplimiento legal.

Dependencias: PRE-11 no tiene dependencia de catálogo. No se activa una campaña ni un proveedor nuevo. El diseño del control de carga está cerrado técnicamente; no se presenta como conclusión legal sobre qué cookies son esenciales. Cualquier autorización global persistente o nueva herramienta de consentimiento se diseña por separado.

Criterios de producto y pruebas permanecen abiertos hasta ejecución. La validación documental y revisión independiente de la tanda se registran en el índice común; no se presentan pruebas futuras como pasadas. Git sin autor configurado: conservar documentos, no inventar identidad. Relevo privado fuera de Git.

Gate antislop documental: Hard Gate PASS por estados/cifras basados en hechos y sin producto entregado; Purpose PASS por ampliación del flujo existente con razones en spec; Liveliness PASS diales1/1/1 según pantalla operativa; Craftsmanship PASS por contratos/controles definidos sin contenido ficticio. Los gates de runtime y Playwright quedan pendientes de construcción.
