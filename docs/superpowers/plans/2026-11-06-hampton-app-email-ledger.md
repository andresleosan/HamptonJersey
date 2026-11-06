# AUT-17 · Preparación del diseño

Fecha: 6-nov-2026. Base: `main`, `a0c7bcf`. Encargo: `$avanzar AUT-17`.

Spec: [diseño propuesto](../specs/2026-11-06-hampton-app-email-design.md). **No aprobado todavía. No existe plan de implementación; este ledger registra únicamente la preparación.**

## Lectura y decisiones existentes

- Árbol inicial limpio; rama main alineada con origin/main. Leídos el relevo privado, ESTADO, JSON datos del checklist, arquitectura, texto privado de Luis y DESIGN.md. No hay AGENTS.md o CLAUDE.md en la raíz de este clon.
- Se mantienen P-19 (Cloudflare), el buzón habitual, aprobación humana del correo externo y primer uso NOT-10. No se reabre la elección de proveedor.
- Memoria migrada en la ruta de la skill no disponible en el taller; no se ha reconstruido a partir de transcripciones ni inventado decisiones. El relevo local es el antecedente utilizado.
- Skills aplicadas: avanzar, using-superpowers, brainstorming, grill-me, cloudflare-email-service y verification-before-completion. Se consultó la referencia de modelos de avanzar y el catálogo local: `gpt-6.1-terra` admite `high`.
- No se aplican aún writing-plans ni skills de implementación: falta resolver las propuestas de identidad, resumen recurrente, límite y conservación. No se requiere instalar herramientas ni dependencias en esta preparación.

## Hallazgos

1. **Pages no admite send_email.** Corrección a la formulación de AUT-17 y aclaración de P-19: Pages prepara y aprueba en D1; el binding está en hampton-jobs. Conserva la arquitectura, proveedor y control humano.
2. **MX de recepción y buzón externo.** Propuesta: dirección literal en un subdominio. Email Sending y Email Routing se configuran por separado. No se ha alterado DNS ni comprobado el proveedor de los MX actuales.
3. **Consulta remota bloqueada.** `wrangler email sending list`, exit 1: sin autenticación de Cloudflare en Wrangler. No prueba la ausencia de Workers Paid o del alta. No se pidieron credenciales ni se intentó sustituir la autenticación del taller.

## Revisión del diseño

Un agente independiente, solo lectura, según el builder check de brainstorming. Ninguna decisión imprescindible adicional. Incorporadas sus precisiones: contadores del resumen y To confirm, copy de pausa del resumen interno, cola caducada, trabajos en vuelo inciertos, conservación de contenido pendiente, topes por agencia aún pendientes y reintentos del proveedor por verificar. Sus decisiones para Luis coinciden con la spec: identidad, autorización recurrente, límite y conservación.

## Comprobaciones de esta entrega documental

- Validador real de Pages de Wrangler 4.148.0, expuesto únicamente en memoria con Node `Module._compile`, con configuración temporal. Control sin binding: pasa. Mismo control con `send_email`: rechaza con `Configuration file for Pages projects does not support "send_email"`. Exit 0 del arnés al comprobar ambos resultados. Sin cambios en node_modules ni en wrangler.toml.
- Dos intentos de usar el CLI como comprobación no fueron válidos: `pages dev --config` rechaza rutas personalizadas; `pages dev` con cwd temporal agotó 20 s; `pages functions build` sí compila pero no ejecuta la validación de Pages. Ninguno sustituye la comprobación anterior ni acredita soporte del binding. No quedaron procesos de esos intentos.
- Consulta de DNS público desde Python: bloqueada con URLError en el taller. Estado real de MX sin comprobar; la propuesta de subdominio procede de la documentación oficial y de conservar el buzón, no de afirmar un proveedor actual.
- `npm run check:release`: exit 0, sin TO CONFIRM.
- Se valida el JSON del checklist, que AUT-17 continúa pendiente y que los enlaces locales de esta entrega existen; `git diff --check` antes del commit.
- `npm test` y build de la app: no ejecutados, entrega únicamente documental, sin modificación de código, dependencias, configuración o migraciones. El pequeño build temporal anterior no es el build de Hampton.
- Playwright: no aplica a la preparación documental. El recorrido del correo y las pruebas de entrega real siguen pendientes de implementación y configuración.

## Entrega y continuidad

- Diseño y aclaraciones de ESTADO, checklist y arquitectura en un commit local. Sin push, publicación, migración ni envío de mensajes.
- AUT-17 y NOT-10 no están construidos ni completos. El resto de puntos dependientes conserva su estado.
- Decisión pendiente, Luis: revisar la propuesta de la spec. Después: plan de implementación, construcción, pruebas y revisión del código. Configuración real de Cloudflare y prueba de recepción requieren un canal autenticado existente; se mantienen como pendientes externos.
- Siguiente recomendado Codex: `/avanzar AUT-17` · `gpt-6.1-terra` · `high`. La tarea requiere varias partes con D1, cron, MIME y panel, control de concurrencia y resultados inciertos; las pruebas actuales no cubren todavía correo. Si se desea otra tarea mientras se resuelve la cuenta: AGE-04; no se inicia sin elección de Luis.

## Ejecución autorizada (6-nov-2026)

Luis confirmó íntegramente la propuesta y pidió plan, implementación, pruebas, revisión local y commit; prohibió publicación y migraciones de producción. Plan: 2026-11-06-hampton-app-email.md. Ejecución inline en main bajo avanzar; no hace falta otro sí para el plan ni un worktree. El estado de propuesta descrito arriba es el antecedente previo a esta aprobación.

Pre-flight: T1 settings/snapshot → T2 dispatcher/retention y T3 routes; T2 state machine → T3 review API y T4 statuses; T3 protected contracts → T4 UI. Nombres y valores consistentes en el plan.

Ruling: se reutiliza la misma cola para el resumen y envíos aprobados futuros; no se añade un compositor libre ni un motor de workflows. Readiness externa en configuración false y settings off por defecto; sin acceso Cloudflare, todas las pruebas de envío usan un binding falso local.
Ruling: impeccable necesita PRODUCT.md; todos los datos están explícitos en DESIGN.md y arquitectura. Se registra ese contexto existente, sin otro cuestionario ni cambiar identidad. Antislop disponible en /etc/claude-code/.claude/skills/antislop/SKILL.md.

Tasks 1–3, core checkpoint: RED missing email module/schema, then 13/13 core tests GREEN. MIME/API RED missing inbound module; after implementation and the runtime email-handler signature regression, email/jobs/retention/automations subset GREEN 61/61. Tests cover concurrent claim/preparation/quota, DST, uncertain outcomes, explicit retry limits, pause/settings/suppression at the final boundary, MIME limits/forged IDs/thread hints, deletion tombstones and optimistic preferences. postal-mime 4.2.0 is the only added dependency, installed with scripts disabled. Existing npm audit summary remains 9 high.
Ruling: daily content cleanup lives in email-retention.js to avoid coupling the API/notification imports to MIME or creating a notification/retention import cycle. Contact deletion uses one database trigger covering manual and automatic deletion. Cost if wrong: one additive migration/cleanup module to adjust.
Ruling: email uses processing time rather than a delayed trigger's scheduled time, so old triggers cannot send old daily summaries. Existing retention/clock bookkeeping keeps scheduled time. Cost if wrong: delayed summaries are skipped instead of backfilled across dates.

Task 1: complete (local schema/snapshot/DST/idempotency tests GREEN; additive 0023 upgrade test validates populated 0022, foreign keys and no automatic activation).
Task 2: complete (email/jobs/retention/automations subset 61/61 at checkpoint; added regressions for in-flight erasure and sanitized stream errors subsequently GREEN in email/jobs 34/34). Sending already in flight becomes unknown on erasure/suppression/config change, never falsely cancelled at the provider.
Task 3: complete (MIME and protected API tests GREEN, including auth/origin/no-store, strict bodies, optimistic conflict, paging, deletion tombstones, suppression and acknowledgement without retry). The native email handler wraps receiveEmail so Cloudflare's third context argument is not mistaken for a timestamp; runtime regression test GREEN.
Task 4: browser flow GREEN at 390/1280 and 200% zoom: configuration off/unready, preview+explicit recurring authorization, duplicate tick, outgoing acceptance wording, literal hostile MIME, suppression, deletion, pagination, failed detail retry and save conflict preserving typed addresses. Added RED→GREEN focus test for Reload preferences, which otherwise disabled its own focused button. Detail refresh keeps the result focus after mutations.
Browser fixture initially failed because __Host-hs requires Secure; corrected the local Set-Cookie to match production cookie rules. Browser assertions also now wait for paginated responses and inspect only message buttons, not pagination controls. No product auth bypass.
Worker types generated to a temporary file with Wrangler: native send(builder) returns EmailSendResult.messageId; binding shape matches the code. Worker dry-run bundle exit 0, 236.45 KiB (gzip 65.19 KiB), sender restriction present, readiness false, no URL. npm test checkpoint 613/613 Node + 14 Python; new tests require a final suite run. Build and check:release exit 0, inherited main chunk >500 kB warning, Email lazy chunk 8.08 kB (gzip 2.57 kB).
Playwright MCP walkthrough uses tests/email-browser.mjs on loopback with SQLite in memory and a native binding fake. No messages leave the machine. Captures outside the repository. 1280/390 and 200% zoom: no horizontal overflow, hostile markup remains text, initial detail focus on H2. Console issue only external Google Fonts DNS lookup in the workshop; API requests succeed.
Full existing e2e attempted with a new local D1/R2 store, separate from earlier fixtures. First attempt stops at .stage-nav.next because the empty new local R2 lacks fixture photos (404/noimg overlay); synthetic photo objects are being added to that same local store before retry. This is not recorded as a product pass or as Turnstile failure.

E2E general, segundo intento con fotos sintéticas R2 locales: avanza hasta publicSite, tests/e2e.cjs:192, esperando #detail-slot .confirm. El Worker devuelve 500 en POST /api/viewings porque challenges.cloudflare.com no resuelve DNS al verificar Turnstile. Confirmado en el log de Wrangler; no se cambia red ni se sustituye esa llamada en el e2e general. Por tanto e2e general bloqueado, no aprobado. El recorrido de AUT-17 es independiente, usa API real y binding falso, y sí pasa.
Recomendación siguiente analizada: AGE-04. Leídos hecho/falta del checklist, shared_agency/shared_fee de SaleDetail y validadores de ventas; no existen agencies ni pantalla, ni cobertura de sus permisos/acuerdos. Migración y varios formularios con datos profesionales/dinero/fotos; sin dependencias externas. Modelo local gpt-6.1-terra admite high. Recomendación única en ESTADO: AGE-04 · gpt-6.1-terra · high; no se inicia AGE-09 por inferencia.

## Revisión independiente final y correcciones

Revisor nuevo gpt-6-astra/high, solo lectura, según executing-plans y requesting-code-review. Paquete de diff staged frente a 006de23: la revisión se realiza antes del único commit de implementación pedido por Luis; no se fabrica un rango de commits vacío. El revisor ejecutó 27 pruebas de correo y reproducciones adicionales temporales, sin editar el checkout. Dictamen: dos importantes, un menor, ningún crítico.

Final: fixed Important 1, preparación obsoleta tras cambio concurrente de preferencias bloqueaba los primeros 20 candidatos. Regresión «a preparation racing changed preferences cannot insert obsolete rows and starve current recipients»: RED (0 envíos, se esperaban20) → GREEN. INSERT verifica revisión/habilitación/destinatario vigentes en SQL; selección de candidatos filtra autorización antes del LIMIT.
Final: fixed Important 2, lote cruzando medianoche conservaba día/cuota antiguos. Regresiones «a batch crossing Jersey midnight never sends the previous day's next summary» y «a midnight between quota reservation and provider call stops the stale summary»: RED (2 frente a1 y1 frente a0 envíos) → GREEN. Cada toma obtiene hora fresca y la cuota de su día; el preflight comprueba otra vez el día y detiene resúmenes caducados. Clock se inyecta solo como función para pruebas deterministas; por defecto usa now real. Finalización y reintento también usan hora fresca. Subconjunto email/jobs tras correcciones: 38/38.
Final: minor (deferred): asunto con [HE-OUT-A] y cabeceras In-Reply-To/References apuntando aB, ambos envíos del mismo destinatario, sugiere A en vez de dejar el correo sin enlazar. No altera estados de negocio, no ejecuta acciones y la interfaz exige comprobar el remitente; no hay acceso adicional fuera del panel. Próximo arreglo: resolver las tres referencias conjuntamente y dejar outbound_id=null cuando discrepen, con regresión de ambos envíos. Responsable desarrollo.

Declined to judge del revisor: entrega/cuenta/DNS/readiness/comportamiento externo del proveedor (requieren activación excluida); compositor externo, IA, adjuntos, bandeja multicanal (fuera de alcance); dependencias vulnerables y aviso del bundle heredados; e2e general y documentación final aún en curso. Se conserva la clasificación: los pendientes externos no están aprobados por pruebas locales ni se marcan terminados.

## Validación final local

- npm test: exit0, **619/619 Node y14/14 Python**, después de las correcciones de revisión.
- npm run build: exit0; main684.81kB/gzip193.58kB (aviso heredado >500kB), Email lazy8.09kB/gzip2.57kB.
- npm run check:release: exit0 sin TO CONFIRM; comprobado también al construir.
- Wrangler deploy --dry-run, configuración jobs: exit0,237.63KiB/gzip65.42KiB; binding remitente restringido y readinessfalse. No se desplegó. Tipos nativos generados e inspeccionados fuera del repositorio.
- Browser tests/email-e2e.mjs tras correcciones: exit0, API real con SQLite en memoria y bindingfake; configuración/autorización/recurrencia, aceptaciónsinprometerentrega, texto MIMEhostil, baja/borrado/dedupe, paginación, errorlectura+retry, conflictoguardado conservando datos, foco,390/1280 y200%zoom. Capturas fuera del repo, solo fixtures.
- Playwright MCP: recorrido independiente local1280/390, muestreo/activación por teclado, respuesta, foco y zoom; API email200. El primer perfil aún ejecutaba el bundle previo al arreglo de foco por navegación solo de hash; al recargar el documento se confirma el foco en role=status tras Reloadpreferences. Error de consola únicamente DNS de GoogleFonts del taller.
- E2E general bloqueado en Turnstile según evidencia de arriba; no se declara aprobado ni se modifica red/permisos.
- Migración local 0023: schema tests, upgrade poblado desde0022 y FKcheck; D1local de prueba también se inicializó, sin producción. No se tocó el buzón/DNS, no se enviaron mensajes reales, no se consultaron datos de clientes.
- Antislop aplicado con identidad Hampton, energía/ritmo/movimiento1/1/1. Gate local: jerarquía/contraste y componentes existentes PASS (capturas1280/390); controles reales y recorrido completo PASS (browser); responsive/200%/foco PASS (browser+MCP); sin HTML remoto ni almacenamiento personal en navegador PASS (inspección y prueba de markup literal); no fuentes/pesos/librerías visuales nuevas PASS (bundle). La única dependencia nueva es el parser MIME requerido; vulnerabilidades y bundle advertidos son anteriores.

No se hace segunda revisión del mismo cambio: las correcciones importantes se comprueban con RED→GREEN y suite completa, conforme a executing-plans. El menor de referencias contradictorias queda explícitamente aplazado para desarrollo.
Integración: main y un commit local de implementación al final, como pidió Luis; sin menú de merge/push de finishing-a-development-branch porque esa decisión ya está dada en este encargo.

## Correcciones del informe independiente sobre 5d54909 (6-nov-2026)

Luis encargó expresamente corregir H1 y, si eran viables, H2/H3, con regresiones RED→GREEN, suite completa, build, check:release, e2e de correo, MCP 1280/390 y commit en main sin publicar. Leído el informe de solo lectura en `/home/taller/encargos/revision-aut17-not10-5d54909/informe.md`. Los tres casos se reproducen y se corrigen dentro del diseño aprobado. Se aplican receiving-code-review, systematic-debugging, test-driven-development y verification-before-completion; ejecución inline bajo avanzar. No se requiere una nueva decisión de Luis.

**H1, medio, corregido.** API y tarjeta separan el contador diario del contador global `pending_review`, que cuenta `status='unknown' AND reviewed_at IS NULL` sin fecha ni cursor. La tarjeta enlaza a `#/email?review=pending`; Email ofrece el mismo filtro, conserva el enlace al recargar y pagina de 25 en 25. Al reconocer la revisión se refresca la lista/contador y se conserva el estado unknown, sin reencolar. Los pendientes siguen sujetos a los 90 días de metadatos aprobados; no se amplía conservación. La regresión Node siembra 30 envíos anteriores, excluye aceptados/fallidos/ya revisados y comprueba 27 pendientes en páginas 25/2, validación del filtro, reconocimiento 27→26 y ausencia de reenvío con el Worker activo (solo acepta el resumen nuevo del día; el segundo tick no lo repite). RED: `undefined !== 27`. GREEN: pruebas API y recorrido de navegador. En navegador, la primera ejecución RED no encuentra el enlace global; GREEN conserva el filtro al recargar y reduce 2→1 sin nuevos envíos.

**H2, bajo, corregido; sustituye el menor aplazado arriba.** Asunto, In-Reply-To y References se consultan conjuntamente: únicamente un envío reconocido, del destinatario esperado y con sobre/From coincidentes, puede ser sugerido. Un marcador del asunto sin resolver, dos marcadores distintos, pistas contradictorias o un ID compartido por varios envíos quedan sin vínculo. Ancestros de References ajenos a la app no crean asociaciones ni impiden una única pista local válida. JSON parametrizado acota las variables SQL aunque haya muchos IDs cortos. References como única pista funciona. Ninguna pista ejecuta acciones de negocio. Dos regresiones Node RED: `1 !== null` en asunto A/cabecera B y `null !== 1` en References solo; GREEN tras el cambio. Cubren contradicciones entre las tres pistas, coincidencia, destinatario/From incorrectos y ambigüedad entre destinatarios. Durante la prueba se ajustó el contador de eventos a su valor previo al recibir: los dos envíos de preparación ya habían registrado eventos legítimos.

**H3, bajo, corregido.** Un detalle cargado conserva el texto ante un GET fallido y avisa de posible desactualización, con botón Retry loading email. Una revisión obsoleta queda deshabilitada; el reintento solo hace GET y devuelve el foco al h2 actualizado. El resultado de la acción guardada sigue visible. Regresión de navegador: POST review exitoso, GET posterior 503, contador reducido y texto conservado; RED por ausencia del botón de reintento; GREEN con Enter, sello Reviewed, desaparición del aviso y foco en H2, sin repetir POST ni enviar correo.

**Ajuste descubierto en MCP.** El mínimo heredado de 240 px de la cuadrícula de metadatos salientes provocaba 10 px de desbordamiento con zoom 200% a 1280. Se añadió la aserción al e2e: RED en `pending review no overflow at 200% 1280`. Una sola regla acotada a `.email-detail .kv` limita el mínimo al ancho disponible. GREEN a 1280/390 y 200% en e2e y MCP; se mantienen columnas, tokens, tipografía y componentes. Tras reconstruir, fue necesario recargar el documento en MCP: cambiar solo el hash conservaba el CSS anterior.

### Resultados de esta corrección

- `npm test`: exit 0, **622/622 Node y 14/14 Python**, sin saltos. Incluye autenticación/origen/no-store, concurrencia, medianoche/DST, cuota, borrado/conservación y las tres nuevas regresiones Node. La última ejecución refuerza H1 con Worker activo.
- `npm run build`: exit 0. Main 685.02 kB / gzip 193.65 kB; Email lazy 9.20 kB / gzip 2.93 kB; CSS 44.28 kB / gzip 9.46 kB. Se conserva el aviso del bundle principal >500 kB, anterior a esta corrección.
- `npm run check:release`: exit 0, sin TO CONFIRM.
- `wrangler deploy --dry-run --config jobs/wrangler.toml`: exit 0, 237.85 KiB / gzip 65.54 KiB; readiness false. Sin despliegue.
- `tests/email-e2e.mjs`: exit 0 con API real, SQLite en memoria y binding falso. Mantiene cobertura anterior e incluye pendientes de días previos, enlace/filtro recargable, contador tras reconocimiento, GET 503 posterior a acción, texto conservado, reintento/foco, 1280/390 y zoom 200%. Sin errores JavaScript ni errores del fixture.
- Playwright MCP local **1280 y 390**: enlace de preferencias por teclado, filtro tras recarga, cancelar reconocimiento, contador 2→1→0, detalle con 503 tras revisión y recuperación por teclado en ambas anchuras, estado vacío y contador 0 enlazable. Tras la corrección del CSS, `scrollWidth=innerWidth` a 1280/390 tanto a 100% como a 200%. Foco del detalle en H2 al seleccionar/reintentar. Consola: solo DNS de Google Fonts y los dos 503 inyectados; no se certifican las fuentes remotas cargadas. Red: lista, preferencias, revisión y relectura 200; únicamente los GET de error inyectado dan 503, seguidos por GET 200 al reintentar. Inspeccionadas capturas de escritorio y error móvil.
- `tests/e2e.cjs` sin modificar, en copia local con configuración y credenciales sintéticas, esquema 0001–0023 y R2 de fixtures: **bloqueado**, exit 1 en línea 192, esperando `#detail-slot .confirm`. Workerd vuelve a fallar DNS de `challenges.cloudflare.com` en verifyTurnstile y POST /api/viewings devuelve 500. No se cambian red/permisos ni Turnstile. El primer intento de preparación reutilizaba D1 ya sembrada y chocó con admins.email; se reemplazó únicamente la D1 de la copia por una base local nueva antes de la ejecución definitiva. No hubo fallo de producto en ese paso de preparación.
- Evidencia: logs en `/home/taller/encargos/correcciones-aut17-5d54909/`; capturas, consola y red MCP en `/home/taller/encargos/capturas/aut17-correcciones/`. Fuera de Git, solo datos sintéticos.

### Revisión del diff y menores restantes

Revisado el diff de código, pruebas y documentación: filtro SQL compuesto solo por constantes y parámetros, paginación consistente, contador independiente del cursor/día, filas revisadas excluidas, acciones sin reenvío, pistas conjuntas sin dar autenticidad al remitente, controles y foco recuperables, CSS acotado. Sin dependencias, tablas, migraciones ni permisos nuevos. No quedan H1/H2/H3 abiertos. ESTADO, checklist y spec reflejan el comportamiento final, manteniendo AUT-17/NOT-10 parciales por activación externa pendiente. Se conserva la recomendación AGE-04 · gpt-6.1-terra · high: no cambia su alcance/dependencias ni se inicia en este encargo.

Menores aceptados para trabajo posterior, desarrollo: settings todavía serializa hasta 200 hashes/fechas/motivos de bajas aunque la tarjeta solo usa su cantidad (posible COUNT); `queued_today` sigue sin consumidor UI. Sin impacto en H1/H2/H3. Corregida también la paleta documental del plan frente a los tokens CSS vigentes, sin cambiar colores de la app. Deuda heredada: bundle principal >500 kB y 9 high en dependencias según la auditoría independiente (no se repite audit ni se cambian paquetes aquí). Bloqueos externos: Turnstile/fuentes por DNS del taller, cuenta/dominio/routing/entrega y respuesta reales sin validar.

Entrega: commit local en main tras comprobar whitespace, JSON/enlaces, archivos concretos y árbol limpio. Conserva 0023 como migración local previa; **esta corrección no añade migraciones**. Ambos Wrangler siguen false, sin push, migración de producción, cambios DNS ni correos reales. El SHA completo de entrega queda en el relevo privado y la respuesta a Luis; no se reutiliza ninguna aprobación de publicación anterior.
