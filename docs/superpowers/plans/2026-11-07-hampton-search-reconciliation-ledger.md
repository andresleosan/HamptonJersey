# Reconciliación funcional y /avanzar — registro

Fecha: 7-nov-2026. Base de revisión: `246300e4c6e76f674074ce5ad10726ff8681ece6` de origin/main. Alcance: documentación, checklist y skills; ninguna modificación de código de aplicación, migración, envío, activación o borrado de producción.

## Entrega

- Checklist: 248 tareas; 241 IDs originales preservados, 68 tareas existentes reconciliadas y 7 nuevas pendientes (BUS-21/22/23, REG-17, AUT-19, EST-19, AUT-20). Los campos hecho anteriores se conservan como evidencia histórica; los cambios de alcance están en falta/aceptación. AUT-17 y MSG-02 se conservan íntegros.
- Plan maestro: 13 módulos, contratos, datos/eventos/estados/errores, orden por dependencias, 12 decisiones abiertas con propuestas y cobertura de los 22 apartados y 16 comprobaciones de la especificación. M12 se divide en exclusión y purga; M13 en infraestructura incremental y validación integral.
- ESTADO y arquitectura ajustados; el HTML histórico y el documento de ideas señalan la precedencia del recorrido nuevo. La aplicación existente no se presenta como compatible con los nuevos requisitos por haber documentado el cambio.
- /avanzar: plan por tarea, DESIGN con valores de la superficie, skills pertinentes, antislop durante construcción, pruebas finales MCP, recomendación posterior y publicación autorizada. El clon actualizado es la autoridad.

## Revisión independiente

Auditoría de código y dos rondas documentales con Astra, esfuerzo ultra. Se corrigieron: orden de indisponibilidad antes de activar contactos/barrido; fecha de observación frente a confirmación comercial; vínculos persistentes de visita con búsqueda/gestión; tarea AUT-20 para aceptación integral; preservación del original privado; subalcance PRE-12 de continuidad sin depender de correo/portal/ventas futuras; instrucciones antiguas de Places y mensajes automáticos.

La prueba pura de matching encontró un candidato con parking incumplido y mascotas desconocidas que actualmente devuelve pass=true y score100. Se registra como brecha BUS-12/M04, no como arreglo realizado. También se documentó que retención por inactividad no protege expresamente toda búsqueda activa (EST-09/PRE-12); no se comprobó ejecución de borrados en producción ni se cambió la política.

## Comprobaciones realizadas

- JSON válido, 248 IDs únicos, 241 IDs anteriores preservados, todos los campos hecho originales conservados y AUT-17/MSG-02 idénticos.
- Dependencias existentes y sin ciclos; aceptación y dependencias integradas en el texto visible de las tareas.
- JavaScript del checklist con node --check; enlaces relativos de nuevos documentos resuelven; git diff --check sin errores.
- Skill válida con quick_validate.py usando el Python del sistema que ya dispone de PyYAML; no se instalaron dependencias.
- Aplicación: npm test/build/check:release y e2e de producto no aplican a esta entrega documental, sin código ni esquema cambiados. Las pruebas funcionales del nuevo recorrido son trabajo futuro de AUT-20 y de cada módulo.

## Hermes

Se respaldaron los originales y se actualizaron únicamente instrucciones Markdown compartidas por Hermes y Hermes2, más la skill Codex y su referencia en la fuente persistente de la imagen y en el taller activo. Los hashes de fuente/copia activa coinciden y ambas vistas de Hermes leen el nuevo texto. Permisos y propietarios conservados. Las instrucciones añadidas no alteran autenticación, candados, aprobación de SHA, revisión ni migraciones.

No se reiniciaron servicios, no se enviaron mensajes y no se tocó el checkout del taller. Después de publicar, su alineación normal trae los nuevos documentos; no se ejecutó una nueva tarea de aplicación para demostrar el flujo completo. Las evidencias y respaldos de instalación son locales y privados.

## Publicación y continuidad

Luis autorizó commit y push en la sesión. Se prepara esta entrega desde un worktree temporal basado en main actualizado, conservando la rama codex/hampton-design-pass y sus cambios ajenos. Se publica solo documentación y skills; ninguna migración forma parte del commit. SHA remoto y estado de comprobaciones se registran en el relevo privado y la respuesta, evitando un segundo commit circular para escribir su propio hash.

## Playwright MCP del documento

El MCP directo del host no pudo iniciar Chromium por sandbox de root. Se usó el MCP ya instalado/configurado del taller como su usuario existente, sobre una copia temporal pública del HTML y HTTP en loopback; no se cambió configuración ni controles.

Validación final del HTML SHA-256 `de9687a4f26bdf4296b791819e917ae787dd64eda657fea2c845a5970d36cf4d`: 248 registros y 248 tareas renderizadas a1280 y390; búsquedas BUS-21/EST-09/AUT-20, apertura de detalles, aceptación y dependencias visibles; búsqueda vacía y recuperación; Enter/Tab y foco2px. Consola sin errores ni advertencias, recursos consultados con200.

La ampliación CSS al200% con EST-09 abierto queda sin desbordamiento:1280/1280 y390/390. Se corrigió con overflow-wrap:anywhere un desbordamiento que existía parcialmente en la base y aumentaba con los textos nuevos. Esto comprueba ampliación de contenido; **el zoom nativo del navegador no se comprobó**. Capturas en el directorio de encargos del taller, prefijo hampton-checklist-20261107, para ambas anchuras, detalle y ampliación. Se cerraron navegador, MCP y servidor temporal.

## Recomendación posterior a pruebas

Próxima tarea: `/avanzar EST-09` · modelo `gpt-6-astra` · esfuerzo `xhigh`. Motivo: separación y migración de estados, concurrencia y conservación de búsquedas/historial, con decisiones de retención que las pruebas actuales no cubren. El subalcance de PRE-12 relativo a continuidad se diseña junto a EST-09; no obliga a terminar sus avisos por correo, portal o retención de ventas. Modelo y nivel contrastados con el catálogo local. El esfuerzo ultra usado en las revisiones actuales no se copia automáticamente a la siguiente tarea.
