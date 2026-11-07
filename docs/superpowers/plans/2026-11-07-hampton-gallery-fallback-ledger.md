# SDD ledger — plan: docs/superpowers/plans/2026-11-07-hampton-gallery-fallback.md

## Base y alcance

7-nov-2026. `/tmp/hampton-roadmap-integration`, main, base `aea7eb5e5f0f7ae91ad5a37241755b8748d47fbd`. Fetch inicial y final: HEAD = origin/main, 0/0 antes del commit de esta entrega. La rama ajena de diseño en `/root/HamptonJersey` queda preservada. Pre-flight: no shared interfaces.

Solicitud: resolver el bloqueo de la galería y comprobar bien el e2e general. Sin migraciones, cambios de autenticación, dependencias nuevas ni escrituras de prueba en producción.

## Cambios y decisiones

- **Galería:** `.noimg::after` cubría las flechas al volver del lightbox a una foto fallida. `z-index:1` mantiene los controles visibles y operables por encima del aviso y por debajo de la cabecera. Se conserva la imagen de error. Ruling: corregir el orden de pintura, sin forzar clics ni limitarse a pointer-events, que dejaría las flechas invisibles.
- **Cabecera del panel:** Messages y Email habían desbordado el requisito de una fila a 1280 de F5-A R17/F7-A. Navegación de escritorio compacta: 12px, padding lateral 5px, separación 0 entre enlaces y 6px entre bloques a 1100–1535. Marca, destinos y comportamiento móvil conservados; aserción original intacta.
- **Controles nativos:** radio/checkbox heredaban padding de 9px 12px de los campos de texto; el radio tenía caja de 39×33, pero el centro no lo seleccionaba. Padding 0 corrige el clic. Revisión P2: preservar el área clicable de las etiquetas, mínimo de 32px y 44px en las etiquetas afectadas a <=760. Algunas reglas anteriores más específicas conservan 32/42px; no se afirma 44 para todo el panel.
- **Estabilidad del e2e:** movimiento reducido solo en la primera carga para comprobar la portada antes de que el carrusel de 7 s cambie. Se restaura movimiento normal antes de las siguientes navegaciones; autoplay del tour sigue comprobado. Widen corre antes de las importaciones, cuya propiedad de precio/dormitorios desconocidos contaminaba el escenario de 2 coincidencias. El envío inicial del chat desplaza primero el botón y luego hace clic normal, evitando pulsar mientras se recoloca el formulario. No se elimina ninguna aserción ni se cambia matching/chat para hacer pasar pruebas.
- **Conservación:** la fixture de Rachel ya está resuelta por EST-09. Se mantiene su prueba original de Expiring; una sustitución provisional por Review retention fue descartada al contrastar seed.sql. La protección de búsquedas activas conserva sus pruebas específicas.

## Evidencia de verificación

| Comprobación | Resultado |
|---|---|
| Galería RED → GREEN | Antes fallaba elementFromPoint sobre Next a 1280; después pasan 1280/390, ambas flechas, lightbox, foto 404, recuperación válida, teclado/foco y ausencia de desbordamiento. `tests/gallery.e2e.cjs`; logs `/tmp/hampton-gallery-red.log` y `/tmp/hampton-gallery-final-focal.log`. Ejecutar sobre seed nuevo antes del e2e general, que modifica las fotos. |
| Controles RED → GREEN | Selección Other fallaba repetidamente a 1280/390; padding 0 la corrige. La revisión detectó etiqueta de 19px; `tests/admin-controls.e2e.cjs` falla antes y pasa con 32/44px, checkbox, radio, teclado y validación. Logs `/tmp/hampton-controls-red.log`, `/tmp/hampton-controls-green.log`, `/tmp/hampton-gallery-final-controls.log`. |
| Código | `npm test`: 630 JavaScript y 14 Python, 0 fallos. `/tmp/hampton-gallery-tests-final.log`. |
| Compilación y release | `npm run build` y `npm run check:release` pasan. Aviso previo de bundle>500kB; sin marcadores TO CONFIRM. Logs `/tmp/hampton-gallery-build.log`, `/tmp/hampton-gallery-release-final.log`. |
| E2e general completo | **PASS, e2e OK, salida 0**, sobre migraciones 0001–0024 y seed nuevos en `.wrangler/gallery-complete`. Público, reservas, URLs, panel, ventas, interesados, alquileres, pagos, conservación, informes, Jersey, automatizaciones, Hermes, Widen, importaciones y los tres recorridos de chat. `/tmp/hampton-gallery-complete-e2e.log`. |
| Identidad del e2e | Copia temporal con solo trazas de fase y captura en fallo. Quitada esa instrumentación, coincide exactamente con `tests/e2e.cjs`, SHA256 `a6744c25bbacb0e75e0089119394a27a422c5647507eb2d6215fa318add78269`, verificado al cierre. Ninguna aserción se retiró. |
| Playwright MCP | Galería y panel a 1280/390, estados de error/recuperación, teclado/foco, validación y tamaños de controles; viewport equivalente a 200% (640px CSS, escala 2). Sin errores de página; panel sin fallos API. `/tmp/hampton-gallery-mcp.log`, `/tmp/hampton-panel-mcp-final.log`. |

Capturas MCP en `/home/taller/encargos/capturas/gallery-*.png` y `gallery-panel-*.png`. Las 404 de fotos simuladas son intencionales. No se afirma prueba de envíos reales de correo ni de login Google interactivo.

Las primeras ejecuciones descubrieron los defectos anteriores, interferencia entre fixtures y esperas de interacción. La prueba final usa una sola base nueva y termina de principio a fin. Una prueba focal sobre fotos ya modificadas por el e2e no fue tomada como evidencia de regresión. El intento de movimiento reducido global se descartó porque anulaba autoplay; su alcance final es solo la portada inicial.

## Revisión y cierre

Revisión independiente `gallery_final_review`: sin críticos/importantes abiertos. P2 de área clicable y P3 de documentación corregidos con regresión/MCP. P1 del alcance de movimiento reducido corregido; reordenamiento de fixtures y desplazamiento antes del clic revisados. `git diff --check` y JSON del checklist correctos.

EST-09/PRE-12 y norma avanzar ya publicados en aea7eb5 (norma 8388560), 0024 aplicada y Pages/Worker verificados en la entrega anterior. Correo AUT-17/NOT-10: código publicado; activación y entrega real pendientes. ESTADO, checklist y reconciliación corregidos, sin activar correo.

Ambas skills Hermes verificadas con el mismo SHA256 `20a4aa93f2e5a2e683f447a4872352d60985f6b388703acb7ce75f327414e495`. Clon compartido actualizado de 246300e a aea7eb5 por SSH normal h1, candado y Git autorizado, fast-forward limpio; candado liberado. PC fuera del alcance actual.

Alertas Centinela clasificadas como código/configuración sintéticos de test, sin exposición de credenciales reales ni remedios de infraestructura. Servidores propios de pruebas detenidos, variables sintéticas y scripts temporales retirados; logs y bases locales conservados como evidencia.

Entrega de galería: commit local revisado, **publicación pendiente de autorización del nuevo SHA**, sin migraciones. Siguiente recomendado Codex: `/avanzar REG-11` · `gpt-6.1-terra` · `high`: formulario público, panel, validación y migración con decisiones D08 de campos comercial/negocio pendientes. No depende de activar correo.
