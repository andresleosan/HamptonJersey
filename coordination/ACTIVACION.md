# Activación de los cuatro puestos

El código se prepara y prueba separado de la web y de la base de datos de Hampton. Este documento no acredita que el servicio esté desplegado ni que los cuatro equipos estén conectados.

## Resultado preparado

- Catálogo de 250 puntos, propiedad única y unidades con dependencias: docs/roadmap/catalog.json.
- Worker hampton-team-coordinator, Durable Object SQLite propio, sin binding a la base de Hampton. No tiene rutas públicas habilitadas por defecto.
- Tablero de consulta autenticado y cliente portable, con reservas por tarea/puesto/checkout, recursos, relevo y turno único de publicación.
- El propio agente puede usar plan para revisar alcance; build exige el diseño revisado y la evidencia de sus dependencias. Una asignación no concede permisos sobre configuración externa.

## Decisiones y capacidades pendientes

Propuesta de URL estable: https://equipo.hamptonestatesjersey.com . Debe confirmarse y configurarse antes de iniciar los clientes. No se ha creado este dominio ni un registro DNS.

La sesión de Wrangler disponible permite preparar Workers pero no acredita permisos de Cloudflare Access. La configuración de Access debe realizarla quien tenga acceso autorizado a esa cuenta, mediante su panel o un mecanismo autenticado admitido; no se necesitan claves por el chat.

El taller compartido de Hermes1/2 tiene una allowlist de destinos que no incluye ese hostname. Requiere permitir únicamente el dominio acordado, conservando el proxy, el candado, el clon obligatorio y los wrappers. Este cambio no está aplicado ni se sustituye por acceso directo a la red.

VS Code y Codex escritorio no están conectados a esta sesión. Necesitan una comprobación desde cada equipo; instalar archivos en GitHub no verifica sus instalaciones.

## Configuración del servicio

1. Revisar el commit final y autorizar su publicación por el flujo vigente de Hampton. Publicar solamente main; no crear previews de ramas sobre datos de producción.
2. En Cloudflare, crear una aplicación Access para el hostname elegido: usuarios del equipo con acceso de consulta y credenciales de servicio individuales para los clientes. Hermes1/2 comparten puesto; no comparten identidad con el coordinador administrador.
3. Configurar ACCESS_TEAM_DOMAIN y ACCESS_AUD para esa aplicación. Configurar TEAM_IDENTITIES_JSON con sujetos verificados y puestos admitidos. La clave de cada entrada procede del sujeto autenticado, no del nombre escrito por el cliente. Las identidades humanas del navegador son solo lectoras. Conceder rol coordinador solo a quien revisa diseños, recupera sesiones y registra evidencia.
4. Guardar la configuración de identidades y credenciales por el gestor de secretos autorizado. Nada de valores de autenticación en Git, HTML, argumentos de procesos, capturas o mensajes. No reutilizar la llave de Hermes de negocio ni las cuentas admins del panel Hampton como permiso implícito.
5. Generar assets con npm run team:build (dry-run). La carpeta coordination/public incluye únicamente cinco recursos de documentación y el índice; no se copia el árbol del repositorio.
6. Desplegar el Worker preparado con su configuración revisada y enlazar el dominio protegido. Mantener workers_dev y preview_urls desactivados. La autenticación del Worker protege también los assets, aunque alguien alcance el origen directamente.
7. Habilitar el hostname exacto en el taller por su procedimiento autorizado. Probar la salida por el proxy ya existente, sin copiar credenciales entre máquinas ni cambiar los controles de otros servicios.
8. Importar el catálogo del SHA publicado mediante el comando catalog del cliente con identidad coordinadora. El servidor obtiene el fichero de GitHub canónico; no acepta definiciones arbitrarias enviadas por un ejecutor.
9. Completar el piloto inferior y publicar el estado operativo canónico en docs/roadmap/ESTADO.md: fecha, origen real y comprobación de los cuatro puestos, sin identidades privadas. Actualizar también la skill, su referencia equipo.md y AVANZAR.md, sustituyendo las afirmaciones de activación pendiente. El arranque obligatorio vuelve a leer esas instrucciones desde main. Desde ese estado, un cliente sin configurar o sin conexión queda bloqueado para incorporarse; nunca puede elegir modo individual por no tener su configuración local. Tener el Worker desplegado, por sí solo, no habilita el trabajo paralelo antes del piloto y la actualización del contrato.

## Alta por puesto

Usar Node 24 recomendado, Git 2.36 o superior y npm ci. Cada editor debe tener su checkout independiente. Nunca usar una carpeta con trabajo de otra persona para ejecutar la inicialización.

Desde el clon verificado de cada entorno:

| Persona / entorno | Inicialización del cliente |
|---|---|
| Luis, VPS | node scripts/avanzar-team.mjs init --slot vps --endpoint https://equipo.hamptonestatesjersey.com |
| Hermes 1 o 2 | Tomar primero el candado existente; en su clon obligatorio ejecutar node scripts/avanzar-team.mjs init --slot hermes --endpoint https://equipo.hamptonestatesjersey.com |
| Compañero en VS Code | node scripts/avanzar-team.mjs init --slot vscode --endpoint https://equipo.hamptonestatesjersey.com |
| Compañero en Codex escritorio | node scripts/avanzar-team.mjs init --slot codex-desktop --endpoint https://equipo.hamptonestatesjersey.com |

La identidad de servicio de cada puesto se proporciona en CF_ACCESS_CLIENT_ID y CF_ACCESS_CLIENT_SECRET mediante el mecanismo privado permitido de ese equipo. El cliente no imprime sus valores. Su configuración/sesión local se conserva en el directorio privado de Git, fuera del contenido publicado. El cliente respeta HTTP_PROXY/HTTPS_PROXY/NO_PROXY cuando existen.

Tras inicializar, ejecutar node scripts/avanzar-team.mjs status. Solo una respuesta autenticada válida acredita conexión. Consultar [.agents/skills/avanzar/references/equipo.md](../.agents/skills/avanzar/references/equipo.md) para el ciclo de reserva y publicación. El usuario continúa escribiendo /avanzar en Hermes/Claude o $avanzar en Codex; el agente llama al cliente. La inicialización es única por checkout; no recrearla al cambiar de teléfono o reanudar la sesión.

## Piloto antes de marcar los cuatro puestos operativos

- Abrir la vista con una identidad de consulta y verificar que aparecen los 250 puntos.
- Registrar cuatro respuestas status desde sus equipos reales, mostrando solo puesto, versión y catálogo; no los valores de autenticación.
- Probar una tarea disputada: un ganador; el otro cliente recibe conflicto sin editar.
- Probar cuatro tareas compatibles, confirmando nombres de puesto y reservas en las cuatro vistas.
- Cambiar entre los dos teléfonos: mismo puesto y candado; no una segunda reserva.
- Suspender un cliente: mostrar sin contacto sin ceder su trabajo; recuperar con relevo y nueva generación.
- Preparar dos entregas independientes: una sola integración/publicación a la vez; nuevo SHA final se revisa antes de aprobarlo.
- Verificar las pantallas en navegador real a 1280/390 y zoom 200%. En la sesión de construcción se pudo probar DOM y comportamiento; el recorrido visual quedó limitado por bibliotecas nativas disponibles.

## Operación y coste

Con cuatro pestañas visibles, consultas cada 15 s son aproximadamente 960 lecturas por hora; cuatro sesiones que renuevan cada 60 s añaden 240 renovaciones por hora. Son estimaciones de tráfico, no precios ni consumo ya facturado. Revisar el plan, cuotas y coste de la cuenta antes de activar: [precios oficiales de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/). Las pestañas ocultas suspenden consultas y los fallos aplican espera creciente.

No instalar servicios nuevos permanentes en el VPS para renovar sesiones. watch se ejecuta en primer plano mientras exista el encargo; si se detiene, la reserva pasa a sin contacto y permanece protegida. Mantener las evidencias y revisar el crecimiento del historial del coordinador según su política de retención documentada.

V1 descarga el catálogo completo en cada respuesta válida del tablero; las respuestas condicionales por revisión quedan como optimización posterior. Comprobar el tráfico real del piloto antes de dejar varias pestañas móviles abiertas de forma continua.
