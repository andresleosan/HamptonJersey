# Independent Hermes and Shared Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track work with the checkboxes below.

**Goal:** Permitir trabajo simultáneo en cuatro listas independientes de herramientas, con ambos Hermes separados y preparados para OpenCode con DeepSeek.

**Architecture:** Dos talleres Docker con homes separados y el mismo contrato de publicación. El coordinador conserva las 250 tareas, cuatro listas de capacidad dos, una reserva por actor/sesión/checkout y exclusión central por tarea/recurso. La preferencia numérica se cambia explícitamente sin trabajo pendiente. OpenCode funciona por separado en cada taller.

**Tech Stack:** Docker Compose, SSH, Bash, Node, Worker Cloudflare, SQLite Durable Object y OpenCode V2 oficial `@opencode/cli@2.2.6`.

**Spec:** [Contrato vigente](../specs/2026-11-08-hermes-independientes-design.md).

## Global Constraints

- Encabezados exactos Lista 1, Lista 2, Lista 3 y Lista 4; preservar las 250 asignaciones y los IDs internos por compatibilidad. Capacidad dos en todas; omitirla en catálogos antiguos equivale a uno.
- Preservar trabajo, identidades y sesiones; no copiar homes ni secretos entre talleres. Mantener una sola reserva por actor/sesión/checkout.
- Mantener scope, dependencias, candado local, wrappers y turno único de publicación. La selección de lista no reserva trabajo ni autoriza editar. No abrir puertos ni ampliar destinos del proxy fuera de lo autorizado.
- Base publicada comprobada `f85f247c505e177b0ffd3ab06be49163a682e314`; esta entrega prepara un nuevo SHA revisable. La autorización de implementar no aprueba su publicación.
- DESIGN.md, Colors/Typography/Layout/Requisitos: conservar la interfaz actual y estados explícitos; Montserrat, cuerpo 14 px, y Tenor para títulos, sin fuentes ni dependencias nuevas. La vista de equipo conserva su excepción de dossier: fondos #F4F6F8/#FFFFFF, texto #566476, acento #2B6CA3; modo oscuro #16202B/#0F1720, texto #A9B6C4 y acento #6FA8DC. Foco 2 px con offset 2 px. Cuatro columnas a 1280 y navegación móvil a 390; contenido escapado mediante textContent. No rediseñar ni aplicar otra paleta del panel.
- No instalar renovadores en segundo plano; `watch` sigue en primer plano. Secretos en archivos privados 0600. OpenCode standalone sin servidor compartido.
- Mantener DeepSeek elegido por Luis; no imponer GPT/Claude. El panel de Hermes y OpenCode se configuran por separado. Sin claves reales no se acredita inferencia.

## Review Focus

1. Pausa o caducidad conservan capacidad y recursos; una tercera reserva se rechaza.
2. Dos actores disputan la misma unidad/recurso: uno obtiene la reserva; el otro no edita.
3. Un actor intenta otra sesión/checkout: rechazo aunque quede capacidad.
4. Relevo hacia lista llena o actor ocupado: rechazo atómico sin revocar el origen.
5. `select-list` conserva IDs, no crea reservas y rechaza trabajo, operaciones, aprobaciones o turnos propios pendientes.
6. La ayuda temporal conserva la lista original de la tarea y muestra su procedencia, sin duplicar asignaciones.
7. Hermes 2 no monta home, credenciales o checkout de Hermes 1; SSH y sesiones permanecen separados.
8. La revisión OpenCode tiene sesión nueva y mantiene guardas de publicación; no hay forwarding SSH de claves.

### Task 1: Capacity and identity validation

**Files:** `coordination/catalog.mjs`, `coordination/src/state.mjs`, `scripts/roadmap-catalog.mjs`, `scripts/avanzar-team.mjs`, pruebas de coordinador/catálogo/cliente y `coordination/test/`.

- [x] Validar `slots[].capacity` entero 1–2 con valor por defecto uno; contar ocupación sin cambiar dependencias, recursos ni release.
- [x] Cubrir concurrencia, capacidad, actor único, misma tarea/recursos, pausa/caducidad y relevo en memoria y SQLite real.
- [x] Alinear el identificador de actor del CLI con el backend conservando validación separada de UUID.
- [x] Superar la primera etapa: 117 pruebas focalizadas, incluidas diez nuevas de SQLite real.

### Task 2: Tool-independent lists and CLI selection

**Files:** catálogo y artefactos en `docs/roadmap`, `scripts/avanzar-team.mjs`, pruebas del cliente y tablero; guías de avanzar y activación.

- [x] Declarar capacidad dos simétrica y nombres Lista 1–4, conservando los IDs internos y las 250 asignaciones.
- [x] Autorizar a las cinco identidades existentes para las cuatro listas sin ampliar roles; distinguir este permiso de la instalación y piloto de cada cliente.
- [x] Implementar `init --list 1..4` y `select-list --list 1..4`; preservar IDs/estado y rechazar trabajo, operaciones, aprobación o turno pendientes.
- [x] Verificar selección y regresiones: 136/136 pruebas focalizadas, incluidas 19 nuevas de selección de listas.
- [x] Añadir la vista de ocupación y ayuda temporal; DOM y generación de artefactos pasan.
- [x] Corregir la caché del nombre de lista y repetir `test:team:dom` con su regresión: PASS.
- [x] Actualizar guías a selección por número, incorporación por cliente y uso independiente de herramientas.

### Task 3: Independent workshops and private access

**Files:** configuración Docker, SSH y ayudas Hermes existentes, con inventario/diff y respaldo privados fuera del repositorio público.

- [x] Inventariar y respaldar configuración sin trasladar trabajo ni credenciales.
- [x] Conservar Hermes 1 y crear taller/home nuevos para Hermes 2 con controles equivalentes y red interna.
- [x] Comprobar SSH exclusivo y rechazo cruzado; clonar el repositorio canónico en el segundo home.
- [x] Proveer identidad Access exclusiva a cada taller y verificar `status` real de ambos sin mostrar valores.
- [x] Probar archivos y candados simultáneos independientes; limpiar pruebas y conservar proxy y guardas de publicación.

### Task 4: OpenCode with DeepSeek

**Files:** instalación y configuración administrada de cada taller, helper `taller-opencode` y skill de transmisión de Hermes; detalles privados fuera del repositorio.

- [x] Instalar OpenCode V2 oficial `2.2.6` y comprobar su versión en ambos talleres; el diagnóstico del helper falla cerrado sin clave.
- [x] Completar revisión independiente del helper: PASS para directorio canónico, entorno permitido sin credenciales de Cloudflare ni aprobaciones, filtrado de stdout/stderr y configuración administrada intacta.
- [x] Verificar localmente el contrato standalone en loopback y revisión nueva sin shell. Mantener Git/candado y el mandato separado de publicación por SHA; esto no acredita una inferencia real.
- [x] Probar la capa de instalación para una futura imagen sin red y con todas las capacidades retiradas, preservando hashes de guardas. No reiniciar talleres para OpenCode.
- [x] Confirmar que ambos paneles Hermes admiten el proveedor nativo DeepSeek; cancelar el login Codex pendiente que ya no se necesita.
- [x] Documentar `Keys → DeepSeek API Key → Save`, selección del modelo y sesión nueva; indicar que no configura OpenCode automáticamente.
- [x] Confirmar que Luis ha guardado una clave DeepSeek distinta por panel. El operador aprovisiona selectivamente cada clave en el OpenCode de su taller, sin `.env` completo ni passthrough SSH.
- [x] Tras disponer de claves reales, comprobar una inferencia mínima y revisión independiente por taller; registrar resultados observados sin inventar éxito ni gasto.

### Task 5: Final verification and reviewed delivery

- [x] Registrar pruebas de la etapa inicial: 870 Node + 14 Python, build, check:release, DOM, team:check y team:build dry-run; revisión independiente favorable.
- [x] Verificar las fuentes de listas: 890 Node + 14 Python, 136 focalizadas, build, team:build y DOM pasan. Revisión CLI sin bloqueantes.
- [x] Cerrar la regresión DOM del último ajuste de caché y la revisión independiente de controles OpenCode: PASS.
- [ ] Completar el acceso humano al tablero mediante correos autorizados de Access y el recorrido visual nativo 1280/390; DOM no lo sustituye. No publicar direcciones de correo.
- [ ] Preparar commit con código y estado real y solicitar aprobación de su SHA final, si no existe ya para ese SHA.
- [ ] Tras publicación autorizada, desplegar el código y el catálogo nuevo y completar el piloto de cada cliente disponible. Producción sigue en `f85f247c505e177b0ffd3ab06be49163a682e314`, catálogo revisión 1. No declarar VS Code/Codex escritorio verificados sin sus entornos reales.
