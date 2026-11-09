# SPR-02 · Ledger de planificación y construcción local h1

## Reconciliación documental · 9-nov-2026 · `55c470026b1c1909acf68ec244f71a7286f2a16f`

Hechos aportados por Hermes, comprobados el 9-nov-2026 entre 16:28 y 16:30 UTC: `node scripts/check-avanzar.mjs` exit 0; HEAD/main/GitHub iguales a `55c470026b1c1909acf68ec244f71a7286f2a16f` y copia limpia. Ese merge contiene SPR-02 A por su padre `933c8fbd1ced662ab414d6d87a95e9dd282e33da` e integra ANA-08. Check-runs de ese SHA: Cloudflare Pages completed/success y Workers Builds: hampton-jobs completed/success. La raíz HTTPS pública devolvió 200. `migrar-hampton ver`, solo lectura: «No migrations to apply». Por tanto, el código de A ya está publicado; las afirmaciones anteriores de «sin publicar» corresponden al estado de aquel momento. No se conoce quién hizo push ni si Luis lo autorizó; no se atribuye esa operación a esta corrección documental.

Límites vigentes: esos checks y el 200 público no acreditan activación ni smoke autenticado de History. A no introduce migración nueva; no se infiere cuándo se aplicó 0034. El e2e general admin y zoom nativo 200% siguen sin acreditar. SPR-02 continúa parcial por B/C, sin marcar la unidad hecha ni activada. Esta sesión solo corrige documentación y regenera derivados necesarios con `npm run team:catalog`; no implementa B/C ni modifica producto, pruebas, controles o `work-units.json`. Sin push, migración, operaciones de servicio, API de escritura o coordinador; el candado local lo conserva Hermes. Ninguna nueva publicación sin sí escrito de Luis para el SHA exacto. Playwright no aplica a este ajuste y no se repite la suite de producto histórica. Modelo/esfuerzo del CLI: no visible en la salida de esta sesión.

Revisión GPT independiente de este diff: sin P0–P2; se corrigió una imprecisión P3 que confundía el SHA base con el futuro commit documental. El ajuste se mantiene separado del SHA publicado de producto.

Verificación de esta corrección documental: `npm run team:catalog` exit0 (250 tareas/unidades, sin assets); `npm run team:check` exit0 (250 tareas/unidades); `npm run check:packages` exit0 (23 paquetes, 250 tareas, cobertura exacta); `npm run check:release` exit0 («No TO CONFIRM markers in site/.»); `git diff --check` exit0. Revisión estructural del diff: solo hecho/falta/nextStep de SPR-02 y sus derivados, HTML/JS estático e historia previa intactos; `work-units.json` idéntico a HEAD y al hash inicial; relevo privado ignorado y sin versionar.

## Historial previo · estado de aquel momento

El contenido siguiente se conserva íntegro como historia de planificación, construcción y validación local; no expresa el estado actual de publicación.

Fecha: 9-nov-2026. PAQ-01 · SPR-02 · Lista4. **A construida y revisada solo en h1, integrada localmente con ANA-08 f0d8eb7, sin publicación ni aceptación de B/C.** Las secciones iniciales conservan la historia de planificación; el resultado actual está en las secciones de construcción y en [validación](../../roadmap/work/SPR-02/h1-history-validation.md).

- Spec: [diseño](../specs/2026-11-09-spr-02-h1-history-design.md).
- Plan: [etapa A y validación futura](2026-11-09-spr-02-h1-history.md).
- Base comunicada y observada localmente: main `f2113769903548f4c5a4763a51c7962e84e80aef`.
- Único repo: `/home/taller/proyectos/HamptonJersey`; ningún worktree nuevo. Candado h1 comunicado como tomado; Hermes gestiona su relevo privado.
- GitHub y status: realizados por Hermes según el encargo, no repetidos aquí. Antecedentes aportados: SPR-02 sin conflicto pero `review_required`; EST-18 integrated; NOT-08 con build ajeno. No se convierten en permiso de construcción.
- Motor visible: Codex, proveedor OpenAI por el entorno de ejecución; no se expone un identificador exacto del modelo ni el esfuerzo. La preferencia de Luis GPT Sol no prueba la variante ni el esfuerzo efectivamente usados. No se consultaron credenciales/configuración para inferirlos.

## Lecturas y hallazgos verificables

Contrato leído del clon: `.agents/skills/avanzar/SKILL.md`, `references/paquetes.md`, `references/equipo.md`, `docs/roadmap/AVANZAR.md`. Contexto: ESTADO, checklist JSON `datos`, paquetes/work-units solo lectura, reconciliación, arquitectura y DESIGN. Código: eventos, rutas de listings, editor, retención, API/auth de rutas, evidencia editorial/migraciones y pruebas pertinentes. El spec de tracking del5-nov es SPR-07, no un spec previo de History.

Decisiones resueltas leyendo, sin volver a preguntar: tabla events común y revisiones EST-18; no backfill inventado; confirmación manual no prueba llamada; History es lectura, no Feed/tarea; conservar metadatos sin textos personales; PRE-12 y EST-19 separados; D10 ya delimita archivos sin uso activo; inglés en UI; antislop durante; NOT-08 fuera. Q1 resuelta el 9-nov-2026: Luis respondió «Si» a construir A primero y dejar B/C para después; no autorizó publicar. El spec separa decisiones del proyecto de propuestas técnicas del constructor.

Desfases registrados sin editar fuentes: SPR-02 `falta` contradice soporte actual de listing en events; histórico de EST-18 aplazó vista; DESIGN declara colores del panel anteriores al CSS actual; ESTADO/planes históricos no acreditan esquema remoto0034 aplicado en este turno.

## Comprobaciones realmente realizadas

| Comprobación | Resultado observado |
| --- | --- |
| `pwd` | Repo solicitado. |
| `git --no-optional-locks rev-parse HEAD` / `symbolic-ref --short HEAD` | SHA base indicado, rama main. Sin fetch ni escrituras deliberadas en `.git`. |
| `git --no-optional-locks status --porcelain=v1` inicial | Salida vacía. |
| Python stdlib, extracción y `json.loads` del script `id="datos"` | JSON parseado; SPR-02 parcial y deps EST-18; EST-19/SPR-03/AGE-08/09 siguen con alcance futuro descrito. |
| Lectura directa de work-units | SPR-02 reviewRequired=true, EST-18 integrated requerido y cuatro recursos mínimos; NOT-08 separado. No se invocó API. |
| Lectura del cliente `avanzar-team.mjs` | Su rama plan llama inspect/check; se evitó ejecutarla para respetar prohibición de escrituras Git. Catálogo consultado directamente. |
| Snapshot SHA-256 antes/después | 832 archivos versionados comparados: cero cambios y cero archivos versionados añadidos. Hashes conservados en memoria de herramientas, sin archivo auxiliar. |
| Python stdlib, documentos nuevos | Tres documentos UTF-8 con newline final, sin NUL y bloques de código equilibrados; cinco enlaces Markdown locales resuelven a archivos existentes dentro del repo. |
| `git --no-optional-locks status --porcelain=v1` tras escribir | Solo tres rutas nuevas sin seguimiento, las enumeradas al final. Ningún cambio versionado. |
| Descubrimiento de herramientas | No apareció Playwright MCP entre herramientas disponibles. No se abrió navegador ni se hizo captura. Revalidar disponibilidad al construir. |

Lecturas puntuales a nombres supuestos `server/index.js`/`server/router.js` dieron «no existe»; se localizó y leyó `server/api.js`. No se ejecutaron ni se atribuyen pruebas por esas lecturas. Las búsquedas iniciales de instrucciones incluyeron un listado fuera del repo; no se usó contenido de otro proyecto ni se escribió allí. Todo el diseño se basa en esta copia.

## Revisión documental y gate antislop

Aplicados brainstorming, grill-me, writing-plans, impeccable, seguridad frontend, rendimiento y ponytail a sus partes pertinentes. Antislop leído del core instalado `/etc/claude-code/.claude/skills/antislop/SKILL.md`; decisión DURING ya dada por Luis. Sin wizard ni instalación. Skills de estilo no sustituyen DESIGN/código.

| Gate documental | Resultado y evidencia |
| --- | --- |
| Hard gate, hechos/copy | PASS documental: spec delimita productores y ausencia de evidencia; copy inglés; sin cifras/testimonios ni activos inventados. |
| Purpose gate | PASS documental: spec y tabla DESIGN justifican lista cronológica, paleta heredada, tipos y densidad; no hay decoración nueva. |
| Liveliness | PASS de dirección escrita: ENERGY1/RHYTHM1/MOTION1, foco en hechos recientes, acento funcional y motivo Tenor/Montserrat. No es PASS de una UI construida. |
| Craft, contenido/alcance | PASS documental: controles con comportamiento definido, vacío/error/paginación/deleted, separación de A/B/C y mínimos de recursos. |
| Gate de UI ejecutada R-35, móvil/contraste/foco real | NO APLICA a documentos; pendiente para construir. Sin build, click-through ni prueba visual, no se declara la app aprobada. |

Codex informó un builder-check de solo lectura llamado `spr02_builder_check`, pero esta entrega no adjunta su salida reproducible: no se cuenta como revisión de diseño aprobada. Revisión GPT independiente posterior, sesión nueva `gpt-6-sol-900k` (esfuerzo no visible), detectó que el índice `events_listing_revision` impide insertar JSON malformado en una fixture D1 normal; spec y plan se corrigieron para probarlo en un mock aislado y usar datos nulos/válidos inesperados en D1. Q1 solo condiciona la futura construcción, no esta planificación. Autorrevisión del plan: criterios A01–A09 asignados, interfaces/cursor coherentes y B/C delimitados. Cinco enlaces locales comprobados; paths actuales de producto/pruebas citados contrastados, los declarados nuevos siguen sin crear. Ninguna revisión documental resuelve `review_required` del coordinador ni sustituye la revisión independiente del código futuro.

## Estado real de criterios y pruebas

| Alcance | Estado |
| --- | --- |
| A01–A09 del plan | Definidos, **no ejecutados**, producto no construido. |
| `npm test`, build, check:release | No ejecutados en planificación; especificados para construcción. |
| e2e general/focal y MCP1280/390/zoom | No ejecutados. Playwright no aplica al cambio documental actual; sí es gate futuro de A. |
| Accesibilidad/seguridad/rendimiento | Contratos y comprobaciones planificados; sin auditoría runtime ni métricas inventadas. |
| Migración/purga/envíos/activación | Ninguna operación realizada. Simular ausencia de archivos en fixture sigue siendo una prueba futura, no EST-19 real. |
| Coordinador | Sin claim, scope, watch, evidence, submit, pause, complete, release ni reservas locales/remotas creadas. |
| Git/publicación | Sin add, commit, push, fetch, merge ni cambio de rama. |

## Archivos permitidos en esta ejecución

Solo estas tres rutas nuevas y específicas, sin documentos compartidos:

1. `docs/superpowers/specs/2026-11-09-spr-02-h1-history-design.md`
2. `docs/superpowers/plans/2026-11-09-spr-02-h1-history.md`
3. `docs/superpowers/plans/2026-11-09-spr-02-h1-history-ledger.md`

Al cerrar la planificación, producto, checklist, ESTADO, catálogo/work-units y credenciales permanecieron fuera de sus escrituras; Hermes actualizó el relevo privado. Q1 ya respondida por Luis; siguiente gate: revisión real de este alcance, evidencia design y reserva build válida antes de editar producto. No tomar NOT-08 ajeno ni confundir este sí con permiso de publicación.

## Intento de construcción tras la respuesta de Luis, 9-nov-2026

Luis aceptó construir primero A, no publicar. Hermes tomó de nuevo el candado h1 y `check-avanzar` observó HEAD/main/remoto `f2113769903548f4c5a4763a51c7962e84e80aef`, exitCode2 solo por tres documentos propios sin seguimiento; origin canónico y un worktree, sin commits locales. Status: puntero histórico BUS-21 completed/gen4, sin reserva propia activa ni operación pendiente; EST-18 integrated, SPR-02 `review_required` sin conflicto. `select-list --list 4` confirmó preferencia de Lista4, sin reserva. La revisión de diseño documentada en `docs/roadmap/work/SPR-02/h1-history-design-review.md` recoge alcance y corrección de la revisión GPT independiente.

El mandato de `evidence --unit SPR-02 --kind design` con `--reference` al review, mínimos lógicos y rutas exactas de A devolvió **HTTP 403 `COORDINATOR_REQUIRED`**, salida 1. Lectura posterior de status: ninguna evidencia de SPR-02 registrada, `review_required` permanece, `local.pending=null`; `coordination/src/coordinator.mjs:50-52` exige rol `coordinator` para `/v1/evidence`. La credencial h1 es ejecutora: no cambiar identidad, llaves ni controles. **No se hizo claim build, watch, edición de producto, pruebas de código, commit ni push.** El actor VPS mantenía un turno ajeno de NOT-08; no interferir con sus documentos globales. Pendiente: revisión/atestación por una identidad coordinadora autorizada y, después, nueva comprobación de GitHub/status antes de solicitar reserva build. No pedir acceso a la VPS a Luis por Telegram.

## Reanudación y avance de base, 9-nov-2026 12:28 UTC

Con candado h1 aún propio, `check-avanzar` observó remoto `2084cb9ea895b729f8a28e3f2c42ce2057641389`, un commit por delante de la base local `f211376`, y los mismos cuatro documentos propios sin seguimiento. El diff de `NOT-08` no se solapa con ellos. `git merge --ff-only origin/main` avanzó main a `2084cb9` sin perderlos, sin crear commit local; repetición de `check-avanzar` confirma HEAD/main/remoto iguales y salida2 solo por los cuatro archivos propios. No se hizo push. Status posterior: turno ajeno cerrado, SPR-02 sin evidencia design, `review_required` y ninguna reserva propia ni operación pendiente. El bloqueo `COORDINATOR_REQUIRED` persiste; no se reintentó con otra identidad ni se editó producto. Antes de construir se deberá revalidar GitHub y revisar este diseño frente a cualquier cambio posterior del contrato.

## Decisión posterior de Luis y arranque sin coordinador, 9-nov-2026

Luis confirmó expresamente en este chat los cambios locales de `.agents/skills/avanzar/SKILL.md` y `.claude/commands/avanzar.md`: retira el coordinador del flujo obligatorio para avanzar desde aquí. Son cambios aún sin publicar, preservados y sujetos a revisión del SHA final. El reintento de evidence design por petición de Luis devolvió de nuevo HTTP403, sin evidencia ni operación pendiente; no se volvió a intentar ni se cambió ningún rol o control. El 403 ya no es requisito de construcción según esta decisión nueva, pero sigue siendo un hecho histórico. H1 verifica main/GitHub `2084cb9ea895b729f8a28e3f2c42ce2057641389`, cuatro documentos propios, dos instrucciones locales confirmadas, un solo worktree y candado propio; sin constructor concurrente. EST-18 y código EST-17/0034 están en main; aplicación remota de0034 no acreditada. A queda autorizada para construcción con pruebas, revisión independiente, actualización de estado y nuevo sí separado para el SHA exacto antes de publicar. B/C fuera de alcance. No ejecutar ni renovar operaciones de coordinación antiguas.

## Construcción A autorizada, 9-nov-2026 (sesión actual)

Base local comprobada `2084cb9ea895b729f8a28e3f2c42ce2057641389`, main. GitHub y candado ya comprobados por Hermes según encargo; no se repiten operaciones remotas ni coordinación. Dos instrucciones locales autorizadas y cuatro documentos previos preservados. Un escritor, este clon; sin worktree, commit, publicación ni acceso remoto. Las referencias anteriores a bloqueo por coordinador quedan históricas por decisión expresa de Luis. B/C pendientes. Motor visible: Codex/OpenAI; identificador exacto de variante y esfuerzo no expuestos, no inferidos.

Aplicación: executing-plans inline, TDD por cortes, ponytail (stdlib, details/time nativos, sin dependencias), impeccable/product (paleta y densidad existentes), frontend-security-coder (texto React, proyección cerrada), rendimiento (lecturas acotadas e índices), antislop DURING. Design Read: sección operativa para equipo Hampton en Bath Street Gallery, ENERGY1/RHYTHM1/MOTION1. Tenor/Montserrat y neutros heredados mantienen identidad; lista plana ordena hechos, espacios separan eventos, bronce solo guía interacción. Sin tarjetas anidadas, iconos, fuentes, imágenes ni datos ficticios de producto.

Ruling: solo las nueve rutas de producto/pruebas/documentación enumeradas en el encargo más este ledger son editables; Hermes hará documentación global y revisión independiente. No modificar spec/plan/review previos ni instrucciones para marcar progreso.

### TDD y evidencia parcial realmente observada

Logs fuera del repo, prefijo `/home/taller/encargos/`:

- `spr-02-history-server-red.log`: primer contrato ejecutado con endpoint ausente; A01 observó404 en vez de401/200 y helper ausente. No se atribuyen TypeErrors secundarios a un RED adicional.
- `spr-02-history-server-green.log`:8/8 PASS tras implementar GET/helper; la primera corrida intermedia tuvo7/8 porque fixture manual T0 ordenaba antes que un guardado actual. Se corrigió la selección del evento sintético por revisión nula, sin cambiar orden de producto.
- `spr-02-history-projection-red.log`: nueva prueba falló por no conservar `feat_pets='yes'`; enumeraciones contrastadas con extractor real (yes/no, tipos flat/house/cottage/studio). La expectativa inicial de `part` no corresponde al productor y se corrigió a `no` antes de cerrar el corte.
- `spr-02-history-projection-green.log`:9/9 PASS. Arrays/horarios rechazan claves inesperadas, JSON roto solo en mock aislado. El error DB deliberado produce500 y log de servidor; no es un fallo inesperado ni vacío simulado.
- Volumen en esa corrida:10000 eventos propios y10000 ajenos,50 ítems,9416 bytes,4.02ms en helper Node SQLite local (no latencia de producción). EXPLAIN: búsqueda `events_entity` para ventana/página y `listing_marketing_listing` para referencias; sin SCAN global ni migración.
- `spr-02-history-e2e-red.log`: runner con fixture D1 nueva, solo migraciones locales y datos sintéticos; falló esperando botón History de navegación, ausente antes de implementar. Salida1 del proceso hijo. No otro runner/e2e activo en `ps`; `ss` no disponible, puerto8799 comprobado libre en `/proc/net/tcp{,6}`.

Conservación ya comprobada en tests: evidencia idéntica tras deleteListing con fallo R2 posterior al commit; tombstone mínimo; FK limpia; retención de persona/visita y lecturas sin escrituras de listing/events/notifications/recibos. No es activación ni prueba de EST-19 real. Gates finales y revisión independiente aún pendientes en este punto.

### Gates locales y hallazgo MCP posterior

- `spr-02-history-server-final.log`:11/11; `spr-02-history-regressions-final.log`:60/60, incluidos replay/CAS y carrera real con lectura intercalada. Cursores vacíos, fecha inválida y enteros fuera de rango también comprobados.
- Focal final previo al hallazgo de foco: `spr-02-history-e2e-green-4.log`, exit0 a1280/390. Corridas intermedias no PASS: fixture original R003 era sold; guardar precio confirma disponibilidad; selector de evidencia debe abrir su propio details, no siempre el primer evento. Solo se corrigieron fixtures/selectores.
- `npm test`, `spr-02-history-final-test-2.log`: exit1,1022 Node/997 PASS/25 FAIL, nombres idénticos a baseline. Cada fallo basal en `tests/check-avanzar.test.js` dice `fixture git push failed: git push bloqueado en el taller`; no se altera el wrapper. Python ejecutado aparte:14/14 exit0 (`spr-02-history-python.log`). Build y release exit0 (`spr-02-history-final-{build,release}.log`).
- E2E general iniciado y detenido con SIGINT exit130 al leer `tests/e2e.cjs:1072`: fake Drive hace listen8799 sin host, pudiendo exponerlo fuera de loopback. `/proc/net/tcp{,6}` no mostró ese puerto escuchando antes/después del stop. `ss` no existe en el taller. Sin tocar ese archivo fuera de alcance ni crear un wrapper, el general completo queda pendiente. El runner local de Pages sí fija127.0.0.1.
- MCP disponible y funcional con fixture aislada en loopback,1280/390. Error inicial500, retry, vacío, precio/description, borrador/caption y Refresh comprobados; payload libre no llega a History. Una respuesta de Refresh vieja retenida mientras Save crea un nuevo evento no reemplaza los2 eventos nuevos; fallo de fotos posterior al guardado de campos conserva el evento y caption sin guardar. Sin pageerror.
- Computados MCP: Montserrat14px heredado, Tenor en H2, ink rgb21/21/21, paper blanco, controles32px desktop/44px móvil y foco2px rgb165/107/61. Sin overflow1280/390 ni CSS zoom2; capturas `mcp-{1280,390,390-css-zoom}.png` en la carpeta externa indicada. CLS observado0.094298, ningún longtask en ese recorrido concreto; no es medición de producción ni comparación basal.
- Zoom nativo MCP pendiente: Ctrl+Equal no cambia width1280/dpr1; chrome://settings/appearance rechazado por contexto aislado del proveedor. No cambiar sandbox/root/infra ni equiparar CSS zoom2 con zoom nativo.
- RED manual MCP nuevo: con54 eventos, cargar50 y reintentar última página conserva caption y54 filas, pero activeElement queda BODY al desaparecer Retry. Se añade aserción focal de foco al primer evento recién añadido antes de corregir componente; `spr-02-history-focus-red.log` en ejecución en este punto. Este hallazgo no se presenta como PASS accesible.

### Cierre de construcción local A (sin commit)

- RED de foco verificado: `spr-02-history-focus-red.log`, exit1 por waitForFunction que exige foco en el primer evento añadido. GREEN `spr-02-history-focus-green.log`, exit0, ambas anchuras y foco eventos51/101. Cambios mínimos: solo tras acción explícita de paginar/reintentar se restaura foco, sin moverlo si se está en otro control; las invalidaciones automáticas no enfocan.
- `npm test` final tras la corrección: `spr-02-history-final-test-3.log`, exit1,1022/997 PASS/25 fallos basales. Comparación por nombre con baseline:25 idénticos, cero nuevos. `npm run build` y `npm run check:release` finales exit0 (`spr-02-history-final-{build,release}-2.log`). Bundle JS764.37kB/gzip215.51 y CSS51.63kB/gzip10.80 frente a757.37/213.41 y50.51/10.64 basales. Warning500kB basal conservado.
- Fases generales seguras: `spr-02-history-e2e-safe-general.log`, exit0, `e2e OK (public, urls, reg17)`. General completo/admin sigue pendiente por listen8799 sin host en archivo fuera del alcance; no se cambia ni se crea wrapper para eludirlo.
- MCP final real a1280/390: `spr-02-history-mcp-final-results.json` y `spr-02-history-mcp-final-states.json` externos. Foco evento51 visible fuera de header/actionbar; fallo de fotos conserva el evento de campos y caption, respuesta vieja de Refresh ignorada, cambio de ficha con respuesta retenida no contamina nueva ficha, tombstone de fixture HE-R051 sin editor/actionbar,401 abre modal y conserva borrador. Referencias sintéticas reales de fixture sin snapshot/URL/descarga;29-mar01:30Z→02:30 GMT+1 y25-oct01:30Z→01:30 GMT. Ningún pageerror. Capturas `mcp-final-{1280,390}.png` y `mcp-deleted-390.png`.
- Consola/red revisadas en `capturas/spr-02-h1-history/mcp-{console,network}.log`:500/401 inyectados,404 de tombstone/fotos ausentes de fixture; DNS de Google Fonts falló en MCP, por lo que solo se acredita familia CSS/fallback, no descarga de fuente. Los primeros intentos del arnés MCP fallaron por vida del proceso temporal, cookie Secure en127.0.0.1 y handlers retenidos; se corrigió el arnés externo (localhost/retirada explícita), sin editar infraestructura/producto para ocultarlo. Una expectativa BST se ajustó al resultado Intl equivalente GMT+1; el horario era correcto.
- Zoom nativo200% sigue sin comprobar por limitación concreta del contexto MCP; CSS zoom2 sin overflow sí comprobado en runner y MCP. No declarar A08 completamente aceptado ni general completo PASS. Gate antislop local por bloques, límites y matriz A01–A09 en `docs/roadmap/work/SPR-02/h1-history-validation.md`.
- Navegador y fixture MCP cerrados; runner temporal SIGINT130 esperado tras recorrido, limpieza ejecutada. Procesos e2e propios ausentes y puerto8799 sin escucha al cierre. Git HEAD sigue2084cb9; sin add/commit/push/migración remota/coordinador. `git diff --check` limpio. Instrucciones autorizadas intactas; NOT-08/work-units y documentación global sin editar.

Rutas propias de construcción: `server/listing-history.js`, `server/routes/listings.js`, `admin/src/ListingHistory.jsx`, `admin/src/listing-history.css`, `admin/src/ListingEditor.jsx`, `tests/server/listing-history.test.mjs`, `tests/listing-history.e2e.cjs`, `docs/roadmap/work/SPR-02/h1-history-validation.md` y este ledger. Spec/plan/review previos preservados. Construido y verificado localmente con los límites anteriores; no integrado/publicado/activado. Hermes hará revisión independiente y documentación global, integración y nuevo sí para SHA exacto. No se presenta una autorrevisión como revisión independiente. B/C siguen pendientes.

Comprobación final de entrega: `spr-02-history-server-delivery.log`,11/11 PASS. Comparación SHA-256 de ambas instrucciones con los hashes observados durante esta sesión: ambas preservadas. `git status --porcelain --untracked-files=all`:14 rutas, todas dentro de producto/pruebas/documentación propios y cambios previos autorizados; cero rutas adicionales. Docs UTF-8, newline final y sin NUL; diff --check limpio. Se precisa en validación que las comprobaciones de8799 fueron puntuales, no monitorización continua; no se observó escucha, sin afirmar una vigilancia que no se hizo.

## Continuación por revisión independiente: tres P2, 9-nov-2026

Misma sesión/copia/base2084cb9 y candado h1 aportado en el encargo. La revisión de solo lectura encontró tres P2 de producto; la entrega previa no estaba lista para commit. Se conservan los documentos y las instrucciones autorizadas. Ruling: el nuevo encargo autoriza ajustar **spec/plan** al contrato corregido, sustituyendo la limitación anterior de no editarlos; solo cambios técnicos de estos tres P2. No se cambia la política para resolver el P1 de exclusión intertaller ni el P3 de instrucciones contradictorias: Hermes/Luis los tratarán antes de commit/publicación. Sin coordinador ni operaciones remotas, worktree, commit, push, nueva migración o cambios de permisos/controles. B/C fuera.

### P2-1: clave heredada y fecha presentada

- RED servidor `spr-02-p2-1-server-red.log`, exit1:51 eventos con at='legacy-date' devuelven50+cursor pero la segunda página400. RED UI `spr-02-p2-1-ui-red.log`, exit1:0 fallbacks «Date unavailable» frente a50. GREEN inicial `spr-02-p2-1-{server,ui}-green.log`, exit0; UI a1280/390.
- El cursor v1 conserva máximo512, enteros seguros positivos y ficha/versión. before_at admite ASCII imprimible0–128 como dato SQL parametrizado, no exige ISO ni concede permisos. Un valor con sintaxis SQL no altera consulta/filas. ISO anteriores continúan válidos.
- RED de frontera `spr-02-p2-1-legacy-boundary-red.log`: Unicode produce500 por btoa. Se corrige el origen, sin aceptar cursores ilimitados: el emisor usa before_at=null para fechas no representables; una consulta PK por before_id obtiene at de la misma ficha y ventana. GREEN `...-green.log`,12/12; casos51 filas Unicode,300 caracteres y controles, sin duplicados ni cursor largo. Ancla de otra ficha400. No N+1 ni índice nuevo.
- RED UI de normalización `spr-02-p2-1-date-normalization-red.log`, exit1:51 fallbacks frente a53; Date.parse normalizaba30-febrero/texto numérico a fechas. Presentación exige round-trip ISO UTC canónico; fechas inválidas muestran «Date unavailable» sin time/edad ficticia. DST válido conserva formateo Jersey. El at original no se normaliza para ordenar en SQL.

### P2-2: coste del techo de ventana

- RED `spr-02-p2-2-cost-red.log`, exit1: sobre10000 eventos propios y10000 ajenos, la **consulta real emitida** reproducida sobre la fixture exacta serializada requiere52.149 instrucciones VM. El VDBE del máximo por ficha hace SeekGE/AggStep/Next sobre10000 filas. La inferencia previa basada solo en EXPLAIN QUERY PLAN era insuficiente y queda rectificada.
- GREEN `spr-02-p2-2-cost-green.log`, exit0: MAX(id) global de events en el mismo statement de primera página, con PK.2149 instrucciones VM para el statement completo de51 filas. VDBE de la subrutina: Last/Rowid/AggStep/Goto que salta Prev; el máximo no recorre10000 filas. Test falla por encima de5000 VM y comprueba búsqueda PK. No migración nueva.
- Medición final `spr-02-p2-server-final.log`: Node2.87ms,9416 bytes/50 ítems; reproducción SQLite3.40.1 con progress_handler2.37ms/2149 VM/51 filas. Muestras locales, no métricas de producción ni presupuesto acreditado. El contador mide el statement completo; no se atribuyen2149 instrucciones solo al máximo.
- Privacidad: el cursor admin/no-store contiene un techo global entero, potencial señal de actividad, no un COUNT ni contenido/identidad ajenos. Página/evidencias y eventual ancla PK siguen limitadas a listing/id; test comprueba techo20000 con último evento ajeno, sin proyectar HE-R002. No cambia auth/roles/permisos ni hay endpoint público. Spec/plan actualizados al contrato realmente implementado.

### P2-3: Reload viva→deleted en la misma instancia

- RED `spr-02-p2-3-ui-red.log`, exit1: campos y caption sucios, borrado externo mediante archive/delete de API, Reload de misma ficha confirma tombstone pero beforeunload sigue cancelado. No cambio de App key ni page.reload.
- Se limpian data/form/matchForm, registro/ref y estado sucio de fotos, ofertas, mensajes/errores y confirmación; se invalidan lecturas anteriores de matches. El efecto de dirty desactiva el aviso global. Solo ocurre tras history.state=deleted confirmado; errores de red/servidor no se reinterpretan como borrado ni descartan borrador.
- GREEN `spr-02-p2-3-ui-green.log` y final `spr-02-p2-ui-final-green.log`, exit0 a1280/390. Vista mínima sin actionbar/inputs/borrador, beforeunload no cancelado y Back to listings sin diálogo.

### Comprobaciones finales reales de esta continuación

- `node --test tests/server/listing-history.test.mjs`: `spr-02-p2-server-final.log`,12/12 PASS, exit0.
- Regresiones history/events/editorial/retention: `spr-02-p2-regressions-final-2.log`,61/61 PASS, exit0.
- `npm test`: `spr-02-p2-final-test-2.log`, exit1,1023 Node/998 PASS/25 FAIL. Comparación por nombre con baseline:25 idénticos de tests/check-avanzar.test.js, cero nuevos; la fixture git push sigue bloqueada por el wrapper. No se cambia wrapper ni tests de control. Python aparte `spr-02-p2-final-python.log`:14/14, exit0 (el && de npm no lo alcanza).
- Build/release: `spr-02-p2-final-{build,release}.log`, exit0. Warning de chunk500kB basal. JS764.69kB/gzip215.65; CSS51.63kB/gzip10.80. Sin nuevas librerías/fuentes.
- E2E focal final `spr-02-p2-ui-final-green.log`, exit0,1280/390. Además de los tres P2, conserva recorrido de edición, borrador/fotos, Refresh/retry/errores/red,50/50/20, evidencia/DST, foco/teclado y CSS zoom2 sin overflow. No se ejecutó el general inseguro en esta continuación; admin general y zoom nativo200% siguen pendientes.
- MCP posterior a correcciones: `spr-02-p2-mcp-results.json` externo.104 fechas heredadas por ficha,50/50/4 a1280/390; cursores107/108 caracteres, ancla null/no-store; sin time/edad falsa ni overflow. P2-3 real en ambas anchuras: dirtyBefore=true, dirtyAfter=false, mismo hash/ID al Reload,0 diálogos al salir y sin pageerror. Capturas `capturas/spr-02-h1-history-p2/mcp-{legacy,reload-deleted}-{1280,390}.png`.
- Consola/red MCP revisadas en esa carpeta:409 inyectado,404 reales de tombstone y medios ausentes de fixture, DNS de Google Fonts. No se declaran limpias ni fuentes descargadas. Navegador cerrado y runner propio parado SIGINT130 esperado tras recorrido; fixture limpiada, sin procesos e2e propios ni escucha8799 observada al cierre.
- SHA-256 de .agents/skills/avanzar/SKILL.md y .claude/commands/avanzar.md coincide con los hashes de la sesión previa; políticas preservadas. No se toca catálogo/work-units, NOT-08 ni controles. diff --check limpio. HEAD permanece2084cb9 sin commit.

Código y pruebas quedan para **nueva revisión independiente de Hermes**. Los tres P2 tienen reproducciones RED y verificaciones GREEN locales; no se declara full green, aprobación de commit ni resolución del P1/P3 de política. La validación actualizada separa esta evidencia de las corridas previas a P2. Publicado/activado no cambia; esta sesión no integra ni publica. La publicación conserva el flujo separado y el sí para SHA exacto.

## Cierre técnico local por Hermes, 9-nov-2026

- La segunda revisión GPT independiente (solo lectura) no halló P0/P1/P2 nuevos de producto:49 pruebas focales y regresión,161 eventos de fechas mixtas en cuatro páginas sin perder/duplicar ni incluir inserción tardía. El test de coste contó2149 pasos VM para la consulta completa sobre20000 eventos y acceso Last al máximo global, sin atribuirlos solo a MAX(id). Autorización administrativa, no-store, SQL parametrizado, proyección y limpieza del borrador tras tombstone revisados. No equivale a aprobación de publicación.
- Hermes registró en validación la segunda revisión, la suite Node998/1023 con los mismos25 fallos basales, Python14/14, build/release y e2e focal correctos; e2e admin general y zoom nativo200% siguen pendientes. Vistas MCP finales de fechas heredadas y tombstone verificadas visualmente en ambas anchuras; no se atribuye CSS zoom2 a zoom nativo.
- ESTADO, tarea SPR-02, catálogo y checklist derivados actualizados localmente para A sin confundir con B/C ni activación. `npm run team:catalog` y `npm run team:check` pasaron sobre250 tareas/unidades; `work-units.json` sin cambios. Dos instrucciones locales autorizadas por Luis se conservaron y aclararon, rotulando comandos del coordinador como históricos y exigiendo turno único entre talleres antes de integrar/publicar. El P1 intertaller no está resuelto por candados locales; falta confirmación de turno.
- `migrar-hampton ver` de solo lectura respondió «No migrations to apply»; no se deduce de esa frase fecha/persona de aplicación de0034, SHA desplegado o smoke. Sin commit/push ni migración por este paso; el SHA de entrega todavía no está fijado ni aprobado por Luis.

## Integración local de ANA-08 y SPR-02 A · 9-nov-2026

Luis respondió «Si» a la pregunta explícita de reservar a h1 el turno exclusivo para integrar SPR-02 A mientras h2 no integra/publica. Esta confirmación no es permiso de push ni migración. h1 tenía el commit local `933c8fbd1ced662ab414d6d87a95e9dd282e33da` limpio sobre2084cb9; `check-avanzar` observó remoto `f0d8eb73905e32b3f283c180cfc12f9149a3cb93`, cuatro commits ANA-08. Merge sin commit automático, con conflictos de ESTADO y tablero HTML (solo JSON incrustado); se conservó el texto estático local del tablero y se regeneró desde ambos task JSON. ESTADO conserva ANA-08/PUB-04 y SPR-02/REG-08 sin atribuir al h1 el despliegue ajeno. Rutas de código ANA-08 auto-integradas, sin editar sus productores. `work-units.json` idéntico.

Después de integrar: suite Node `spr02-merged-test.log` 1032 pruebas/1007 PASS/25 FAIL, mismos25 nombres preexistentes por fixture git push bloqueado; Python14/14, build, check:release, `team:check` y `check:packages` exit0. E2E focal SPR-02 y ANA-08 a1280/390 exit0. `test:team:dom` exit1 por aserción única NOT-01: el padre previo al merge también contiene NOT-11 con `nextStep` NOT-01; no se oculta ni cambia el test fuera de alcance. `migrar-hampton ver` read-only no mostró migraciones pendientes tras0036; no prueba despliegue/activación de SPR-02. Ver [validación integrada](../../roadmap/work/SPR-02/h1-history-validation.md). Tercera revisión GPT independiente sobre el índice integrado: sin P0/P1/P2, tres P3 de redacción temporal corregidos antes del commit. Falta sí escrito para SHA final. Sin push ni migración de este encargo.
