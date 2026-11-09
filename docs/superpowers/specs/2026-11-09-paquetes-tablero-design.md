# Paquetes de avance y tablero didáctico

9-nov-2026. Encargo explícito de Luis: agrupar al máximo las cuatro listas para agilizar /avanzar; mejorar el tablero público con barras de progreso; indicar dificultad y entorno recomendado en cada detalle. Corrección posterior: Hermes programa con GPT Sol en Codex; al quedarse sin acceso a GPT usa DeepSeek v4 max en OpenCode. No cambiar modelos, credenciales, wrappers ni servicios en este trabajo.

## Decisión y alternativas

Se adopta la propuesta de paquetes transversales por módulos y etapas, aceptada al pedir Luis que se reorganice. Mantener 250 tareas aisladas repite planificación; un solo cambio para todo impediría validar y publicar por partes. Hay 23 paquetes que cubren exactamente una vez las 250 tareas, incluidos históricos y tours aplazados. Las cuatro listas y los códigos se conservan. Cada paquete es una cola de entregas verificables, no una reserva múltiple.

El manifiesto público paquetes.json contiene títulos, etapas, códigos y recomendaciones orientativas, sin identidades ni información operacional privada. Es la fuente de agrupación del procedimiento y del tablero; no duplica estados ni evidencias del coordinador. Un código explícito mantiene alcance; /avanzar PAQ-01 selecciona paquete; /avanzar sin argumentos retoma el pendiente o propone el primer tramo viable sin volver a entrevistar decisiones cerradas. La preparación documental sigue sin reservas. El cliente remoto solo admite códigos reales y una reserva por actor: no enviar PAQ al CLI ni inventar claims compuestos; continuar etapas cuando evidencia/alcance vigentes lo permitan. Si una dependencia requiere integración o publicación, se conserva ese límite y se avanza solo en partes independientes. No se autorizan migraciones, push o despliegues por agrupar.

## Tablero y métrica

Vista predeterminada por paquetes, alternativa por listas; barras general, por paquete y por lista. Porcentaje = tareas con state hecho / tareas de alcance vigente (hecho, parcial, pendiente, bloqueado). Replanteado y descartado se contabilizan aparte; parcial no vale medio y activity completed no acredita producto hecho. Es porcentaje de tareas, no de tiempo/esfuerzo. Filtros modifican visibilidad, nunca denominador. Exponer numerador y denominador; cero vigente muestra sin alcance vigente.

Cada tarea muestra paquete, dificultad orientativa, entorno recomendado, motivo y requisitos. No confundir tarea hecha con fácil por hacer, ni recomendación de entorno con incorporación/autorización. Hermes no se limita a documentación: GPT Sol/Codex y DeepSeek v4 max/OpenCode son rutas del mismo entorno, sin cambios aquí. Estados de carga, error de datos, error del manifiesto (volver a listas y permitir reintento), vacíos y refresco conservan filtros, foco y aperturas. Dependencias y etapas navegan a la tarea exacta aunque haya filtros activos. Polling existente 15s visible y caché reducida 5s.

## Diseño y límites

Superficie: herramienta de coordinación en español ya existente, independiente del panel en inglés. Se preserva el sistema actual de equipo.css: Open Sans cuerpo15/1.55, Source Serif4 título32, IBM Plex Mono códigos14; fondo #F4F6F8, superficie #fff, texto #22303F, secundario #566476, acento #2B6CA3, borde #D3DAE2 y borde de campo #687889. Modo oscuro existente: fondo #0F1720, superficie #16202B, texto #E3E9EF, secundario #A9B6C4, acento #6FA8DC. DESIGN.md gobierna web/panel; no imponerles la paleta del tablero ni añadir fuentes. Nueva hoja exclusiva del tablero conserva el ancho1120, gutters16, espacios8/16/24/32, controles44, foco2/offset2, breakpoints760/980. Barras progress nativas con nombre accesible y cifras textuales; sin animación ornamental, sin información solo por color, impresión y movimiento reducido.

Seguridad/rendimiento: mismo origen, GET sin credenciales, DOM con textContent, validación de manifiesto y códigos, allowlist explícita de los dos assets nuevos, CSP sin inline ni cambios a Access. No tocar proyección privada, esquema D1, red ni permisos. Mapas y nodos estables, sin recrear 250 tarjetas cada15s. Recuperar último dato válido en fallos.

## Criterios

Cobertura250/250 sin duplicados; etapas no autorizan eludir dependencias. Recomendación legible en cada tarea. Métricas no infladas por planificación/completados locales. Navegación, filtros y foco conservados; fallback de manifiesto con reintento; API pública solo lectura y allowlist intactas. Pruebas Node/DOM y runtime existentes, test/build/check:release/team:check, paquete Worker dry-run. Intentar Playwright1280/390; si el navegador no inicia con sus controles, documentar bloqueo sin desactivar sandbox.
