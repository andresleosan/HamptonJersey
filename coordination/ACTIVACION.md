# Activación de las cuatro listas

Las tareas se distribuyen en **Lista 1, Lista 2, Lista 3 y Lista 4**. Cualquier cliente autorizado puede elegir cualquiera, independientemente de la herramienta o teléfono. Cada lista admite dos reservas; cada actor, sesión o checkout mantiene una sola. El catálogo conserva las 250 tareas, sus asignaciones y dependencias. La elección de lista no concede permiso para editar ni publicar.

## Estado comprobado y pendientes

El servicio privado está desplegado en `https://hampton-team-coordinator.andres-san1404.workers.dev` con Access; consultas anónimas rechazadas. Código y catálogo aprobados `c2ef559bac59a2f6ccb1e5c6c527221f1a367568` publicados y activados: 250 tareas, cuatro listas y capacidad dos. VPS y ambos Hermes comprobaron el catálogo desde sus entornos reales. El hostname personalizado sigue pendiente de DNS; no se migraron los DNS de la web.

Hermes 1 y Hermes 2 tienen talleres, homes, clones, sesiones y credenciales independientes y actualizados. SSH cruzado rechazado; candados locales independientes. Piloto real de dos reservas simultáneas de tareas distintas en Lista 2, rechazo de tarea ocupada y limpieza completa sin cambios de producto. El turno de publicación desde plan se rechazó con PLAN_ONLY; el piloto completo de build y release requiere una tarea cuyo diseño y dependencias estén realmente revisados. VS Code y Codex escritorio necesitan comprobación desde sus equipos.

El Worker `hampton-team-coordinator` usa su propio Durable Object SQLite, sin binding a la base de Hampton. El catálogo describe asignaciones; el servicio autenticado arbitra reservas, recursos, generaciones, evidencias y un único turno de publicación. `plan` permite documentación; `build` exige diseño revisado para el alcance y dependencias satisfechas. Ninguna asignación autoriza cambios de configuración externa.

## Configuración del servicio

1. Revisar el SHA final y obtener su autorización de publicación por el flujo de Hampton. Publicar solamente main; no crear previews de ramas sobre datos de producción.
2. Mantener la aplicación Access del hostname aprobado, usuarios de consulta y credenciales de servicio individuales. Cada Hermes tiene identidad ejecutora propia; ninguna comparte la identidad coordinadora de la VPS. Las cinco identidades existentes pueden solicitar cualquiera de las listas sin ampliar su rol.
3. Configurar `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `TEAM_IDENTITIES_JSON` con sujetos verificados y listas admitidas. Los IDs internos históricos se conservan solo por compatibilidad. La identidad procede del sujeto autenticado, no del nombre escrito por el cliente. Los usuarios del navegador son lectores; el rol coordinador se limita a revisión, recuperación y evidencia.
4. Guardar identidades y credenciales mediante el gestor privado autorizado. Las identidades de servicio se provisionan por separado, con duración de 90 días. Nada de secretos en Git, HTML, argumentos, capturas o mensajes. No reutilizar la llave de Hermes de negocio ni cuentas admins de Hampton como permiso implícito.
5. Generar assets con `npm run team:build` (dry-run). `coordination/public` incluye únicamente los cinco recursos de documentación y el índice; no copia el árbol del repositorio.
6. Desplegar el Worker revisado. Conservar `workers_dev` habilitado únicamente para el origen temporal protegido y `preview_urls` desactivado. Usar `--keep-vars` para preservar la configuración privada existente. La autenticación protege también los assets del origen.
7. Conservar el proxy, candado, clon obligatorio y wrappers de cada taller. El hostname temporal exacto ya está permitido; no habilitar salida directa ni destinos generales. No copiar credenciales entre máquinas.
8. Importar el catálogo del SHA publicado con `catalog` y la identidad coordinadora. El servidor obtiene el fichero de GitHub canónico, sin aceptar definiciones arbitrarias del ejecutor.
9. Completar el piloto de cada cliente y registrar resultados en ESTADO y el relevo, sin identidades privadas. Solo declarar completo el equipo al comprobar los cinco entornos. Sin configuración o conexión se conserva el trabajo y se diagnostica; no se usa un modo individual que eluda el coordinador.

## Alta y elección de lista

Usar Node 20.18.1 o posterior (recomendado Node 24), Git 2.36 o posterior y `npm ci`. Cada editor conserva su checkout independiente. En Hermes, tomar el candado propio antes de usar el clon obligatorio; para el primer clon seguir el orden autorizado del taller.

`init --list` y `select-list` pertenecen a esta entrega todavía sin publicar. Los ejemplos siguientes se ejecutan después de publicar, actualizar cada clon y comprobar el catálogo nuevo; no se presentan como disponibles en los clones que siguen en `f85f247c505e177b0ffd3ab06be49163a682e314`. La lista inicial es una elección independiente de la herramienta:

```sh
node scripts/avanzar-team.mjs init --list 1 --endpoint "$TEAM_ENDPOINT"
```

Sustituir `1` por `2`, `3` o `4` según la lista elegida. En un checkout ya inicializado, cambiar solo la preferencia mediante:

```sh
node scripts/avanzar-team.mjs select-list --list 3
node scripts/avanzar-team.mjs status
node scripts/avanzar-team.mjs claim --mode plan
```

`select-list` consulta el tablero, conserva los identificadores y el estado privado y no reserva trabajo. Rechaza reservas propias abiertas —incluidas pausadas, sin contacto y entregadas—, operaciones desconocidas, aprobaciones o turno de publicación propios pendientes. `claim` comprueba autorización y disponibilidad. El servidor prioriza la lista elegida; puede asignar ayuda temporal a otra lista conservando la asignación original de la tarea. No se borra ni reinicializa una sesión para cambiar de lista. `init --slot` sigue disponible para compatibilidad, excluyente con `--list`; la correspondencia interna está en [equipo.md](../.agents/skills/avanzar/references/equipo.md).

El operador proporciona `TEAM_ENDPOINT`, `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET` por el mecanismo privado del cliente. Nunca se muestran sus valores ni se copian entre talleres. En clones con `.git/avanzar-team.env` privado (0600), anteponer `--env-file=.git/avanzar-team.env` a Node en cada comando; en worktrees usar su Git dir propio. El cliente no busca archivos de claves y respeta `HTTP_PROXY`, `HTTPS_PROXY` y `NO_PROXY`. Su configuración y sesión permanecen junto al Git dir, fuera del contenido publicado.

Luis sigue escribiendo `/avanzar` en Hermes; el agente realiza estas operaciones. En Codex se usa `$avanzar`. Cambiar de herramienta no exige cambiar la lista ni compartir credenciales.

## Hermes, OpenCode y DeepSeek

El flujo elegido es **Hermes recibe el encargo → OpenCode construye y revisa → DeepSeek aporta el modelo**. Cada taller conserva sus sesiones y almacenes privados. OpenCode V2 oficial `@opencode/cli@2.2.6` está instalado y su versión se comprobó en ambos talleres. Usa configuración administrada, ejecución `run --standalone --format json` y no comparte servidor. El diagnóstico del helper rechaza continuar sin clave. La revisión independiente de sus controles dio PASS: directorio canónico, variables permitidas sin credenciales de Cloudflare ni aprobaciones, filtrado de stdout/stderr, configuración administrada intacta, revisión nueva sin shell y ejecución standalone en loopback. La capa de instalación para una futura imagen se probó sin red y con todas las capacidades retiradas, conservando los hashes de las guardas; no se reinició ningún taller para instalar OpenCode. La inferencia mínima real también está comprobada en ambos talleres, según el resultado siguiente. La interfaz del taller es:

```sh
taller-opencode build -- <encargo>
taller-opencode build --session <ID propio> -- <continuación>
taller-opencode review -- <encargo de revisión>
```

La revisión siempre inicia una sesión nueva y no admite `--session`. El helper mantiene las guardas Git y el candado local, y excluye las marcas de aprobación de sus procesos. Tras revisar y aprobar el SHA exacto, Hermes realiza la publicación con un mandato separado mediante los wrappers existentes. La disponibilidad del binario no acredita autenticación ni inferencia correcta.

La versión instalada de Hermes ya admite DeepSeek. Cada bot tiene una clave distinta verificada y provisionada en su propio taller. Se guarda desde su propio panel: `Keys → DeepSeek API Key → Save`. Ambos perfiles tienen respaldo automático GPT → DeepSeek Flash con esfuerzo max. El usuario conserva además el cambio manual desde Models cuando lo desee. No introducir las claves por Telegram ni en documentos públicos.

**Cambiar Hermes no configura OpenCode automáticamente.** Tras guardar cada clave, el operador aprovisiona exclusivamente esa clave en el almacén privado del OpenCode de ese taller, por el canal administrativo autorizado. No se copia el `.env` completo ni se habilita el passthrough SSH de credenciales de proveedores. El modelo de OpenCode queda configurado explícitamente. Rotar o eliminar una clave en el panel exige revisar también el almacén de OpenCode.

Ambas claves DeepSeek están guardadas y aprovisionadas selectivamente en su taller correspondiente, en archivos privados 0600. Se comprobó en memoria que son distintas. Ambos clientes obtienen HTTP 200 en la consulta de modelos y ejecutan una prueba mínima real de construcción y otra de revisión con `deepseek/deepseek-v4-pro`: salida 0, respuesta exacta, sesiones distintas, cero herramientas y Git intacto; candados propios liberados. Estas pruebas verifican la conexión del motor, sin acreditar todavía el piloto completo de tareas coordinadas. El login Codex pendiente de Hermes 2 se canceló porque ya no es requisito del flujo elegido. Codex puede seguir siendo una opción explícita de Luis, sin convertirlo en una dependencia de Hermes.

## Piloto por cliente y comprobación del equipo

- Completar el acceso humano mediante los correos autorizados de Access, sin registrarlos en documentos públicos. Tras publicar la nueva entrega, abrir la vista autenticada y comprobar 250 tareas con los encabezados exactos Lista 1, Lista 2, Lista 3 y Lista 4.
- Registrar `status` desde cada entorno real que se incorpora, mostrando solo lista, versión y catálogo. Conservar como pendientes los entornos no accesibles.
- Elegir una lista libre con `select-list`; comprobar que conserva identidades y no crea reserva. Con trabajo propio, verificar su rechazo sin pérdida de cambios.
- Probar una tarea disputada: un ganador; el otro recibe conflicto y no edita. Repetir con recursos compartidos.
- Probar tareas compatibles en las cuatro listas y dos actores distintos en una misma lista, respetando capacidad dos. La ayuda temporal conserva el origen de cada tarea.
- Ejecutar ambos Hermes a la vez con homes, checkouts y sesiones distintos; confirmar reservas compatibles y la exclusión de tareas/recursos. La falta de contacto no libera plazas.
- Suspender un cliente y comprobar «sin contacto» sin ceder su trabajo; recuperarlo con relevo y aceptación explícita de nueva generación.
- Preparar dos entregas: una sola integración/publicación a la vez. Revisar el SHA final antes de aprobarlo y conservarlo intacto después.
- Verificar navegador real a 1280/390 y zoom 200 %. Las pruebas DOM anteriores no sustituyen este recorrido; el arranque nativo estuvo bloqueado por el entorno de sandbox/root.
- Pruebas mínimas reales de construcción y revisión DeepSeek por taller: comprobadas; conservar como pendiente el piloto completo de reservas y publicación.

## Operación y coste

Cuatro pestañas visibles que consultan cada 15 s generan aproximadamente 960 lecturas por hora; cinco sesiones que renuevan cada 60 s añaden 300 renovaciones por hora. Son estimaciones de tráfico, no precios ni consumo facturado. Revisar el plan y las cuotas de la cuenta: [precios oficiales de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/). Las pestañas ocultas suspenden consultas y los errores aplican espera creciente.

No instalar servicios permanentes del cliente para renovar sesiones. `watch` se ejecuta en primer plano durante el encargo; si se detiene, la reserva pasa a «sin contacto» y permanece protegida. Mantener las evidencias y revisar el crecimiento del historial según la política de retención. V1 descarga el catálogo completo en cada respuesta válida; las respuestas condicionales por revisión quedan como optimización posterior. Comprobar el tráfico real antes de dejar varias pestañas móviles abiertas continuamente.

## Inicio guiado vigente

Con GPT/Codex o Hermes → OpenCode → DeepSeek, el cliente habilitado aplica [inicio-guiado.md](../.agents/skills/avanzar/references/inicio-guiado.md). `/new` abre la conversación de Hermes y `/avanzar` inicia la guía. La guía instalada ya se comprobó en ambos bots sin enviar mensajes ni hacer inferencias adicionales. No declara incorporados clientes sin su credencial y prueba real.

OpenCode está fijado a `deepseek/deepseek-flash#max`; los perfiles de Hermes conservan GPT como principal y fallback `deepseek-flash` con `agent.reasoning_overrides` max. La API llama así a DeepSeek V4.1 Flash 1017. Se probaron respuestas reales con variante explícita en ambos talleres y clasificación simulada de errores 401/429; no se agotó GPT a propósito.

## Vista pública de consulta (entrega preparada)

Luis pidió un enlace público sin login. `coordination/wrangler.public.toml` prepara el Worker `hampton-tareas` con assets mínimos y binding de lectura al objeto existente. El enlace previsto es `https://hampton-tareas.andres-san1404.workers.dev/`; no declararlo publicado hasta verificar su despliegue. `npm run team:public:build` valida assets y bundle sin desplegar. Después del SHA aprobado, desplegar únicamente esta configuración con la cuenta fijada y verificar GET200 sin login/POST405; el coordinador privado y Access siguen intactos.

El público consulta cada15s y comparte JSON reducido durante5s. Solo muestra código/título/lista/estado/progreso anónimo/fecha. No contiene identidades, sesiones, recursos, evidencias ni claves. La página privada puede seguir disponible para sus lectores autorizados. Los agentes siguen usando el endpoint de `hampton-team-coordinator`; nunca inicializar el CLI contra el Worker público.

Al cerrar /avanzar, registrar primero el estado real por los comandos ya existentes y confirmar con status. No subir manualmente un HTML ni marcar como terminado un pendiente para actualizar la vista.
