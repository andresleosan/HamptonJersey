# Avanzar en equipo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Distribuir todos los puntos del checklist entre cuatro personas y coordinar /avanzar con tareas compatibles, dependencias visibles y una vista compartida que se actualiza automáticamente.

**Architecture:** Catálogo de tareas en Git y ocupación en un coordinador privado transaccional. Cada puesto construye en su clon; la integración/publicación se turna. El HTML actual conserva el checklist y añade la vista Equipo.

**Tech Stack:** JavaScript/Node para cliente y generación, HTML/CSS/JS existentes; Cloudflare Worker + Durable Object SQLite + Access para coordinación. El cliente respeta el proxy de Hermes; su hostname e identidad requieren configuración externa antes de activar.

**Spec:** [Diseño y reglas completas](../specs/2026-11-08-avanzar-equipo-design.md).

Estado: implementación local solicitada por Luis y construida sobre main 36c4c2b746b3421b37fb5d59826772c6814c096f en un clon aislado. La rama antigua de la VPS y sus cambios se conservan intactos. Publicación, configuración externa y piloto real pendientes. Evidencia y revisión: [ledger de ejecución](2026-11-08-avanzar-equipo-ledger.md).

Aclaración de Luis incorporada: cobertura completa de los 250 puntos, no solo un arranque de cuatro tareas. Reparto: VPS 59, Hermes 61, VS Code 65, escritorio 65. [Lista completa en HTML](../../roadmap/reparto-equipo.html), [manifiesto con dependencias](../../roadmap/reparto-equipo.json) y [tabla sin JavaScript](2026-11-08-avanzar-equipo-reparto.md). La vista consulta reservas en el origen privado configurado; el archivo descargado conserva una instantánea explícita. El código está implementado; no se ha desplegado.

Comprobación del reparto, 8-nov: 250/250 IDs únicos, mismo conjunto que el checklist, todos sus campos originales conservados, 280 referencias de dependencia con destino existente, sin ciclos entre dependencias de alcance completo. JSON y datos embebidos coinciden. Las inferencias siguen señaladas: cada alcance de construcción exige revisión de diseño, incluidas las rutas concretas reservadas. Se verificaron generación, cliente, API con SQLite real, tablero en DOM y regresiones de la aplicación; resultados en el ledger. Playwright nativo quedó bloqueado por sandbox/root y bibliotecas del entorno; no se alteraron controles.

Las casillas sin marcar conservan verificaciones no realizadas o partes que requieren los equipos reales. Las pruebas locales no sustituyen la activación. Los archivos del coordinador se implementaron como módulos .mjs bajo coordination/src y reutilizan el paquete raíz, según coordination/CONTRACT.md.

## Global Constraints

- Puestos: vps, hermes, vscode, codex-desktop. Hermes 1/2 son un solo puesto; conservar candado y wrappers.
- Cobertura total: cada punto del checklist tiene exactamente un assignedSlot, incluso si está hecho, bloqueado, replanteado o descartado. La pertenencia no vuelve ejecutables los puntos históricos ni transfiere decisiones externas. Toda tarea nueva exige asignación explícita.
- Catálogo y código públicos; sesiones, identidades operativas, reservas y relevos privados fuera del repositorio público.
- Mantener main por clon; no publicar ramas auxiliares. Cada puesto publica su entrega bajo el turno global y por su autorización existente.
- Una tarea activa por sesión/puesto. Recursos lógicos además de archivos. Una sesión sin contacto no equivale a una tarea libre.
- Renovar cada 60 s; reserva de 15 min. Vista: consulta cada 15 s visible; aviso tras 45 s sin respuesta válida. Usar reloj del servidor para reservas.
- Construcción, integración, migración, despliegue y activación son evidencias diferentes.
- No cambiar controles del taller ni activar servicios externos como parte de la preparación del código.
- Actualizar expresamente el contrato: durante construcción, estado por tarea; al integrar, código + ESTADO + checklist en la entrega final.

## Review Focus

1. Peticiones simultáneas, reintentos y respuesta perdida: reserva única e idempotencia; pruebas en tarea 2.
2. Mismo contrato en archivos distintos o ampliación de alcance: excluir cambios incompatibles; pruebas en tareas 1, 2 y 3.
3. Portátil suspendido, cambio de teléfono, dueño ausente: no perder ni reasignar trabajo silenciosamente; tareas 2 y 3.
4. Main avanza tras revisión, migración/publicación queda incierta: no usar aprobación obsoleta ni repetir a ciegas; tarea 5.
5. Catálogo viejo, pestaña sin red, cliente antiguo: no aparentar disponibilidad ni desbloquear dependencias falsas; tareas 1, 3 y 4.

## Superficie visual y skills

Se ha leído DESIGN.md. Su paleta y tipografía Tenor Sans/Montserrat corresponden a site/admin; este cambio amplía el dossier HTML en español, que tiene estilo propio. Mantener esa superficie, sin aplicar por accidente las propuestas de rediseño del producto.

Valores actuales del checklist: paper #F4F6F8, surface #FFFFFF, ink #22303F, muted #566476, line #D3DAE2, accent #2B6CA3. Oscuro existente: paper #0F1720, surface #16202B, ink #E3E9EF, accent #6FA8DC. UI Open Sans, prosa Source Serif 4, códigos IBM Plex Mono. Contenedor 1120px, margen lateral mínimo 16px, paneles radio 8px/padding 18px, foco 2px accent con separación 2px. Conservar fuentes y tema existentes.

Propuesta para Equipo: cuatro columnas desde 980px, dos desde 760px y una con selector por debajo; separación 16px, cuerpo de tarjeta mínimo 14px, controles táctiles de 44px. No añadir fuentes, librerías UI ni animación continua. Estado siempre con texto; detalles y botones de teclado, no arrastre obligatorio. Refrescar datos sin reemplazar el control que tiene foco ni anunciar todo el tablero cada 15 s. Cargando, vacío, bloqueo, error y última actualización visibles. Verificar 1280/390px y zoom 200%, contraste y reduced motion.

Skills de ejecución: impeccable para jerarquía, foco y móvil; redesign-existing-projects para añadir Equipo conservando la navegación; security-best-practices/frontend-security-coder para autorización, sesiones y renderizado literal; web-performance-optimization para consultas visibles, respuestas condicionales y pausa al ocultar; ponytail para cliente pequeño y generación determinista; antislop para texto y presentación durante la construcción. Leer las pertinentes al ejecutar, no darlas por aplicadas por enumerarlas. design-taste-frontend: no aplica una página nueva, se amplía el dossier existente. Brainstorming/grill-me: revisar las decisiones pendientes de acceso y despliegue antes de construir ese tramo; no reabrir las cuatro columnas ya solicitadas.

## Tarea 0 — Comprobar que los cuatro puestos pueden participar

**Archivos:** crear docs/superpowers/plans/2026-11-08-avanzar-equipo-ledger.md; completar evidencia privada de instalaciones sin copiar secretos o rutas sensibles al repo público.

**Consume:** contrato actual de AVANZAR y mecanismos permitidos de cada entorno. **Produce:** matriz de capacidades: identidad, copia aislada, Node/Git, conexión admitida al coordinador, entrada de skill, pruebas locales y publicación existente.

- [x] Comprobar cada puesto accesible; registrar los no accesibles como no verificados. Hermes incluye ambos arranques, mismo puesto y candado.
- [ ] Validar que VS Code remoto y Luis no comparten checkout; comprobar igualmente Codex escritorio. Conservar trabajo antes de preparar copias nuevas.
- [x] Documentar cómo suministrar identidad al cliente mediante los canales admitidos, sin crear secretos, cuentas ni abrir puertos en esta comprobación. Si hace falta configuración externa, detallar el requisito concreto.
- [x] Cerrar la elección del coordinador con estas evidencias. Worker/DO es la propuesta; no simular el acceso de Hermes si está bloqueado. Puede desarrollarse el catálogo y la vista con fixtures mientras tanto, pero no declarar listos cuatro puestos.

## Tarea 1 — Catálogo y dependencias comprobables

**Archivos:** crear docs/roadmap/tasks/<codigo>.json, docs/roadmap/work-units.json, docs/roadmap/catalog.json (generado), scripts/roadmap-catalog.mjs, scripts/render-roadmap.mjs y tests/roadmap-catalog.test.js. Modificar el origen de datos de docs/roadmap/checklist-hampton-app.html manteniendo su bloque embebido como instantánea generada.

**Interfaces:** loadCatalog(root) produce {schemaVersion, baseSha, tasks, units}; validateCatalog(catalog) devuelve errores con código/unidad. Una unidad contiene id, parentTaskId, title, preferredSlot, priority, dependencies[{unitId, requiredEvidence}], resources[{key, mode}], acceptance. renderChecklist(html, tasks) devuelve HTML determinista conservando el resto del archivo.

- [x] Crear pruebas de extracción sin pérdida de los 250 puntos de la base, IDs repetidos, puntos sin assignedSlot, asignaciones desconocidas, dependencias inexistentes/cíclicas, rutas inválidas y recursos omitidos. Comparar igualdad de conjuntos contra el checklist actual, sin limitar para siempre el catálogo a 250.
- [x] Implementar extracción y validación; conservar todos los campos actuales y separar estado funcional de estado de ejecución. Definir la normalización de prefijos y compatibilidad de recursos con casos concretos.
- [ ] Importar todas las asignaciones de reparto-equipo.json; completar y validar las unidades de cada punto pendiente antes de habilitar su ejecución. El análisis contiene dependencias explicit/inferred y whole/partial: confirmar las inferidas y desglosar las parciales; no convertir menciones entre códigos en bloqueos completos. NOT-11 separa núcleo y adaptación de matching. Marcar BUS-22/23 con evidencia de investigación anterior; revisar BUS-14 contra REG-08 sin inferir activación de Git.
- [x] Probar generación repetible: dos ejecuciones producen el mismo HTML/catalog.json y conservar/reconstruir el JSON devuelve los mismos datos. El paquete no incluye su propio SHA de commit: ese SHA lo adjunta la importación verificada. Ejecutar node --test tests/roadmap-catalog.test.js.
- [ ] Revisar y guardar este cambio por separado antes de habilitar la selección automática.

## Tarea 2 — Coordinador con reservas atómicas

**Archivos propuestos:** coordination/package.json, coordination/wrangler.toml, coordination/src/worker.js, coordination/src/project.js, coordination/src/auth.js, coordination/src/schema.sql y coordination/test/project.test.mjs. Almacenamiento separado del D1 de Hampton. Usar entorno de pruebas local de Workers, sin activar recursos remotos.

**Interfaces HTTP:** GET /v1/board; POST /v1/catalog; POST /v1/claims; POST /v1/claims/<id>/renew, /scope, /pause, /resume, /handoff, /submit, /abandon, /complete; POST /v1/release/acquire, /renew, /finish. Mutaciones incluyen operationId y revisión/generación esperada; transiciones según tabla del spec. Autorización deriva actor/puestos del JWT verificado. Respuesta de conflicto 409 con razón y recursos/tareas bloqueantes, sin secretos.

- [ ] Escribir pruebas concurrentes reales contra el almacenamiento local: 20 solicitudes de la misma tarea, una sola concesión; tareas distintas con recurso incompatible, una sola concesión; reintento devuelve el resultado previo.
- [x] Implementar adquisición conjunta de tarea, puesto, sesión y recursos en transacción; catálogo mínimo exigido por servidor. Mantener generación, revisión, evidencia y eventos duraderos.
- [ ] Probar sesiones vencidas, revocación, renovación atrasada, ampliación parcialmente bloqueada y reinicio del proceso; ninguna operación vieja modifica la reserva nueva. Pausar conserva recursos y marca checkout ocupado si hay entrega pendiente; el puesto solo puede tomar revisión/investigación que no modifique ese clon hasta resolverla.
- [x] Implementar recuperación explícita por propietario/coordinador; caducar solo marca sin contacto. Bloquear una publicación incierta hasta reconciliarla.
- [x] Probar JWT incorrecto/caducado, audiencia distinta, identidad sin puesto y escritura del dueño ajeno. La identidad de navegador de solo consulta no puede mutar reservas. No confiar en nombre o email del cuerpo.
- [ ] Probar ciclo completo y abandono: sin cambios libera; con entrega pendiente rechaza; integrada sin activar libera archivos pero no desbloquea dependencias operativas; complete repetido conserva resultado. Evidencia de Git se verifica contra remoto y aceptación de investigación se atribuye al revisor autorizado.
- [x] Probar catálogo actualizado con reserva incompatible: no destruir reserva ni volver elegible la tarea. Devolver revisión verificable y conservar última instantánea válida.
- [x] Ejecutar la suite local del paquete de coordinación y revisar el resultado antes de conectar clientes reales.

## Tarea 3 — Cliente portable y contrato único de /avanzar

**Archivos:** crear scripts/avanzar-team.mjs, tests/avanzar-team.test.js y .agents/skills/avanzar/references/equipo.md. Modificar .agents/skills/avanzar/SKILL.md, docs/roadmap/AVANZAR.md y el adaptador .claude/commands/avanzar.md. Conservar scripts/check-avanzar.mjs y sus comprobaciones.

**Interfaces:** node scripts/avanzar-team.mjs <status|claim|renew|scope|pause|resume|handoff|submit|abandon|complete|release> con --slot, --task opcional y estado local privado. release recibe acquire, renew o finish. Salidas JSON: 0 operación correcta; 2 conflicto/dependencia; 1 servicio o autenticación no verificados. Identificadores locales nunca sustituyen identidad autenticada.

- [ ] Probar identificación de raíz en rutas distintas y Windows, vuelta a tarea propia, selección priorizada y ayuda a columna libre. Código explícito respeta reservas y bloqueos igualmente.
- [x] Implementar llamadas sin imprimir secretos, plazo de espera y reintentos acotados con operationId. Al caer la red conservar estado; no crear una reserva local ficticia.
- [x] Incorporar renovación mientras la sesión ejecutora permanezca activa y comprobación en cada reanudación/checkpoint. Si el entorno no mantiene renovación, mostrar sin contacto y revalidar antes de seguir; no instalar un daemon para ocultarlo.
- [ ] Verificar diff contra alcance antes de submit; pedir ampliación antes de editar recursos nuevos. Guardar relevos privados por tarea/sesión y mantener el archivo antiguo como resumen local de compatibilidad.
- [x] Cambiar el comportamiento sin código: toma automáticamente la siguiente unidad viable del plan de equipo configurado; fuera del modo equipo se mantiene el contrato anterior de ofrecer tres. Mostrar elección y motivo al usuario.
- [ ] Probar dos entradas Hermes y sesión reemplazada, mismo checkout reclamado por dos puestos, cliente con versión antigua y fallo de coordinación. Probar tarea A pausada con commits: tarea B no puede implementarse/publicarse desde ese clon arrastrando A. No permitir modo individual silencioso dentro de un proyecto coordinado.
- [x] Ejecutar node --test tests/avanzar-team.test.js tests/check-avanzar.test.js. Actualizar instrucciones en una única fuente canónica.

## Tarea 4 — Vista Equipo en el checklist

**Archivos:** modificar docs/roadmap/checklist-hampton-app.html; crear docs/roadmap/equipo.js, docs/roadmap/equipo.css, tests/equipo.test.js y tests/equipo.e2e.cjs. Servir la vista y assets a través del origen privado propuesto, manteniendo descarga estática útil.

**Consume:** GET /v1/board devuelve {revision, serverTime, catalogSha, slots, units, claims, blockers}. **Produce:** vista de consulta de cuatro puestos, estados verificables, filtros, enlaces y copia de comandos. Las reservas y ayudas se ejecutan mediante /avanzar; no hay mutaciones de navegador en V1.

- [x] Probar con fixtures cuatro puestos, dependencia de contrato, investigación secuencial, columna libre, sesión sin contacto, permiso insuficiente y error de red.
- [x] Añadir «Equipo» junto a las vistas actuales, sin quitar agrupaciones/filtros. Mostrar TODOS los puntos asignados, con contadores totales y por resolver, búsqueda y filtros para historial/bloqueados. Reutilizar tokens y tema del dossier; tarjetas enlazan al código del checklist y al detalle de dependencia. Probar que quitar los filtros muestra una vez cada ID del catálogo.
- [x] Implementar actualización visible cada 15 s y al recuperar foco; validar revisión para no aplicar respuestas fuera de orden. Pausar polling oculto, aplicar backoff acotado ante errores y renderizar texto sin HTML inyectable.
- [x] Mantener foco, expansión y scroll al refrescar; mostrar antigüedad y desconexión tras 45 s. La copia descargada señala modo instantánea y enlace a la vista viva.
- [ ] Ejecutar pruebas y recorrido local 1280/390, teclado, zoom 200%, estados vacíos/error, tema oscuro y cuatro clientes simultáneos. Guardar evidencia sin datos reales.

## Tarea 5 — Turnos de integración, despliegue y piloto

**Archivos:** ampliar scripts/avanzar-team.mjs y tests/avanzar-team.test.js; crear tests/avanzar-team-integration.test.js. Modificar docs/roadmap/AVANZAR.md, skill y guía de instalación según lo efectivamente comprobado.

**Consume:** reserva de tarea, entrega revisada, evidencia de Git y turno release-main. **Produce:** commit final con documentos coherentes; estados separados de integración/publicación/activación.

- [x] Probar dos entregas independientes: solo una integra/publica; la segunda incorpora main y conserva ambas actualizaciones por ID. El turno debe cubrir desde reconciliación hasta confirmación final, con renovación.
- [x] Implementar composición de estado por tarea y generación del checklist bajo ese turno. ESTADO/reconciliación se editan conservando narración y decisiones; se verifica que reflejen el estado nuevo antes de cerrar.
- [x] Tras verificar la publicación, importar catalog.json desde el SHA de main canónico y actualizar dependencias en el coordinador. Probar fallo de importación y reintento idempotente: mostrar publicada/sincronización pendiente sin liberar dependientes con catálogo viejo. Ningún cliente puede imponer definiciones arbitrarias por tener el turno.
- [ ] Reservar numeración de migración al preparar integración y comprobar orden contra main. Reservar e2e:<host> para el e2e general; dos hosts distintos pueden ejecutar sin compartir fixtures.
- [ ] Probar remoto avanzado tras revisión, SHA aprobado distinto, push sin respuesta y migración aplicada con despliegue fallido. Exigir reconciliación/evidencia antes de continuar; conservar wrappers y autorizaciones existentes.
- [ ] Ejecutar npm test, npm run build y npm run check:release sobre el resultado integrado; e2e y Playwright para la UI nueva. Registrar fallos heredados o bloqueos reales, sin dar comprobaciones no hechas por aprobadas.
- [x] Preparar configuración externa, identidad de cada puesto, dominio privado, coste estimado con datos vigentes y artefacto revisable para la activación posterior. Sin publicar o alterar infraestructura por efecto de este plan.
- [ ] Activar por el procedimiento autorizado y comprobar instalación en cada entorno. Piloto de dos puestos disputando una tarea; después cuatro con tareas compatibles, cambio de teléfono y caída de un cliente. Solo entonces marcar «equipo operativo».

## Orden y reparto para construir esta mejora

Primero 0 → 1. Acordados catálogo y API, 2 (coordinador), 3 (cliente con fixtures) y 4 (vista con fixtures) pueden avanzar en paralelo con propiedad de archivos separada. El cuarto puesto revisa contratos y prepara casos de integración. Finalmente 5 conecta y prueba todo. Los cambios de skill compartidos pertenecen al ejecutor de tarea 3 hasta su entrega; tarea 5 los toma después.

La implementación de este sistema es una entrega previa al uso simultáneo real de las cuatro columnas; no usar el tablero propuesto como candado antes de que el piloto pase.
