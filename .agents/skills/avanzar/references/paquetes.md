# Avanzar por paquetes · decisión de Luis del9-nov-2026

Fuente única: [paquetes.json](../../../../docs/roadmap/paquetes.json). Guía legible: [PAQUETES.md](../../../../docs/roadmap/PAQUETES.md). Cubre exactamente las250tareas de las cuatro listas, una vez cada una. Conserva códigos, estados, responsable externo y asignación original. Los paquetes cruzan listas para compartir diseño, integración y comprobaciones.

## Resolver la invocación

- `/avanzar PAQ-01` o `$avanzar PAQ-01`: consultar `node scripts/plan-packages.mjs --package PAQ-01`. `/avanzar` sin argumentos: retomar primero paquete/tramo propio pendiente, preservando su reserva y trabajo; si no existe, consultar el manifiesto local y su defaultOrder, elegir el primer tramo viable y anunciar paquete, códigos y motivo. Luis autoriza esta selección automática al pedir reorganizar para terminar más rápido. No volver a preguntar lista/tarea de rutina.
- Un código real explícito sigue limitando el encargo a ese código; consultar `node scripts/plan-packages.mjs --task BUS-14` para dar contexto sin ampliar su alcance. Respetar una lista indicada y preferencias anteriores; `--list N` filtra paquetes con tareas de esa lista, no cambia la lista privada ni habilita todas sus tareas.
- `node scripts/plan-packages.mjs --check` valida cobertura. Los comandos son locales, reserved:false/buildAuthorized:false; no cargan credenciales ni sesiones. GitHub y la incorporación a construcción se comprueban por el flujo habitual. El manifiesto es organización, no autoridad remota de disponibilidad.

## Evitar interrumpir construcciones paralelas

1. Al comenzar `$avanzar` sin código explícito, primero retoma trabajo propio que ya empezaste. Si no hay uno, consulta el orden de `defaultOrder` y `docs/roadmap/PLANES-POR-PAQUETE.md`; revisa `planReferences`, dependencias y estado del paquete.
2. Antes de elegir, busca señales locales del trabajo en curso: ledger/relevo de avance, ramas o worktrees propios y commits recientes que documenten código y paquete. Respeta el candado del taller y no inspecciones archivos privados, sesiones o credenciales ajenas. Si el registro confiable indica que otro agente está construyendo un paquete, déjalo continuar y selecciona el siguiente paquete viable e independiente del `defaultOrder`.
3. No infieras «libre» porque no veas un candado remoto: Luis retiró el coordinador y sus estados históricos no determinan disponibilidad. Si no hay registro accesible para saber qué está construyendo otro agente, no declares que ningún paquete está ocupado ni abras una copia competidora en Hermes; trabaja en una tarea independiente ya asignada o pide el dato mínimo por el canal de coordinación. Fuera de Hermes, una copia nueva solo se usa si se comprueba que no duplica un escritor activo.
4. Trata como ocupado el archivo compartido que otro tramo está modificando, aunque sean paquetes diferentes. Usa la tabla «Módulos compartidos y escritor único» de `2026-11-10-tp05-construction-order.md`; busca otro paquete que no dependa de ese archivo. Los cambios de contrato siguen el orden de integración en ese documento.
5. Un paquete con dependencia técnica pendiente no está disponible para construir el tramo consumidor; salta al siguiente viable y deja anotado qué componente lo desbloquea. Una gestión externa puede avanzar aparte, pero no finjas que su evidencia o activación ocurrió.
6. Anuncia el paquete y código elegidos, la señal de ocupación respetada y el siguiente alternativo. Mantén alcance explícito, trabajo de un escritor por copia, revisión y publicación conforme a las reglas vigentes. La selección automática elige una tarea; nunca autoriza construir todo el paquete de una vez.

El orden base recomendado para frentes paralelos está en `docs/superpowers/plans/2026-11-10-tp05-construction-order.md` y la distribución de paquetes de Lista 4 en `docs/superpowers/plans/2026-11-10-tanda9-estado.md`. Son referencias de secuencia y contratos: el registro actual de actividad determina qué frente debe ceder el paso.

## Ejecutar sin rehacer lo existente

1. Leer spec/plan/ledger existentes de los códigos del tramo y reconciliarlos con main. Recuperar y revisar las entregas locales documentadas antes de reconstruirlas. No importar ni adoptar archivos de otra sesión sin autorización.
2. Separar hecho, código pendiente de publicar, activación y construcción nueva. Los históricos/replanteados/descartados, incluido tours, no se reactivan por figurar en un paquete. Una decisión no se vuelve a entrevistar si el repo o Luis ya la resolvieron.
3. Planificar un tramo coherente con una matriz de aceptación por código. Reutilizar componentes y fixtures. Revisión de diseño conjunta cuando comparten contrato; un único recorrido final puede cubrir varios códigos si los criterios individuales quedan comprobados. Mantener specs propias enlazadas, sin duplicarlas ni sustituir decisiones aprobadas.
4. Para construir: revisar dependencias y evidencia con el coordinador, alcance y reserva build exactos de la unidad real. El servidor actual reserva una unidad por actor: **no enviar PAQ-* a avanzar-team claim ni simular una reserva compuesta**. Que dos códigos estén en el mismo paquete no satisface integrated/activated/research_accepted/decision. Si la unidad vigente no permite cubrirlos juntos, ejecutar tramos sucesivos; no ampliar el alcance por inferencia ni registrar evidencia antes de existir. No cambiar el coordinador para fingir soporte de paquetes.
5. Continuar los pasos autorizados del tramo sin pedir permiso entre archivos o comprobaciones. No detenerse por un límite artificial de una tarea si existe trabajo independiente autorizado y coordinable dentro del paquete. Sí detener la parte dependiente ante revisión/decisión pendiente, acceso ausente, operación incierta o publicación/migración sin aprobación. Puede requerirse publicar un tramo antes del siguiente; explicarlo y conservar lo pendiente.
6. Pruebas focalizadas durante desarrollo; suite completa al cerrar una entrega coherente, repitiendo solo lo afectado por cambios posteriores. No suprimir gates existentes para ahorrar tiempo. Actualizar estado por código y relevo con paquete, etapa, SHA, pruebas, publicación/activación y próximo tramo.

## Motor, dificultad y entorno

Hermes programa con **GPT Sol en Codex**. Al quedarse sin acceso a GPT, usa **DeepSeek v4, esfuerzo max, en OpenCode**. Confirmar modelo exacto/esfuerzo y herramientas realmente disponibles; no inferir variantes, cambiar configuración, claves o wrappers. Un fallo Git/red/pruebas no prueba indisponibilidad GPT. No iniciar dos escritores al cambiar de motor. Revisión independiente en sesión nueva del motor correspondiente; no fingir revisión realizada.

Hermes puede programar tareas difíciles. Las recomendaciones environment/difficulty/reason/needs son orientativas por tarea y se muestran en el detalle del tablero: Hermes para trabajo guiado, investigación y cambios acotados; VS Code cuando revisión visual/editor local ayuda; VPS cuando accesos e integraciones de ese entorno son necesarios. Tener el modelo no acredita tener navegador, incorporación al coordinador, cuenta externa o autorización para infraestructura. Si el entorno preferido no está habilitado, usar otro autorizado con las mismas comprobaciones; no pedir a Luis una terminal inaccesible.

## Progreso y siguiente paso

Contar solo `state=hecho` sobre hecho/parcial/pendiente/bloqueado. Planes, reservas y cierres locales no equivalen a producto hecho. Replanteado/descartado se muestran aparte; filtros no alteran denominador. No prometer ahorro en días/porcentajes sin medición. Al cerrar, recomendar paquete y código del próximo tramo, motor y esfuerzo si se conocen.
