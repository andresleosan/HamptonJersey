# Reconciliación de búsqueda y /avanzar — plan de implementación documental

> **For agentic workers:** usar superpowers:executing-plans para ejecutar el plan por tareas. Las tareas funcionales futuras siguen su propio ciclo de spec, plan, construcción y validación.

**Goal:** dejar el roadmap completo alineado con la especificación funcional y disponible para Codex y ambos Hermes.

**Architecture:** conservar los códigos y la evidencia existentes; documentar módulos, dependencias y aceptación en una sola reconciliación enlazada. La skill versionada del clon gobierna el encargo, y las copias instaladas remiten a ella.

**Tech Stack:** Markdown, checklist HTML con JSON embebido, Git; Python/Node para comprobación estructural y MCP Playwright para el documento interactivo. No cambia el código de aplicación.

**Spec:** [diseño](../specs/2026-11-07-hampton-search-reconciliation-design.md), [contratos funcionales y DESIGN](../../roadmap/2026-11-07-reconciliacion-automatizacion.md).

## Global Constraints

- Original privado fuera de Git; no datos de clientes, credenciales ni auditorías privadas en commit.
- Cambios reversibles y acotados a documentos/skills. No envíos, activación, migraciones o borrado de producción.
- Conservar rama de diseño y trabajo previo; integrar solo esta entrega sobre main remoto actualizado.
- Reglas cerradas del MD prevalecen; D01–D12 se marcan como propuestas.
- DESIGN: sin cambio de interfaz de producto; no aplica rediseñar colores/tipografía de la app. Los valores web/panel, estados, accesibilidad, rendimiento y seguridad están transcritos en §7 de la reconciliación para planes futuros. El checklist conserva su presentación documental existente.
- Brainstorming/grill-me separan decisiones resueltas de pendientes; writing-plans concreta esta entrega y las siguientes. Impeccable/taste/redesign no justifican rediseñar producto en una tarea documental. Seguridad y antislop se aplican a claridad, datos publicados y controles; ponytail conserva las herramientas y formatos existentes.

## Review Focus

- Main remoto puede contener correo/chat que la rama abierta todavía no tenga: auditar main antes de marcar ausencias.
- Un plan puede prometer cierre humano mientras la retención elimina búsquedas activas: incluir PRE-12/EST-09.
- Dependencia circular entre consultas e indisponibilidad: exclusión manual antes de activar contactos; purga después de captura.
- JSON válido no garantiza que una tarea sea visible o navegable: comprobar búsqueda, filtros, apertura y móvil con MCP.
- Copia global de skill puede eclipsar la del repo: lectura explícita del clon, sincronización y hashes sin tocar controles.

## Tarea 1: cobertura y contratos

**Files:** crear `docs/roadmap/2026-11-07-reconciliacion-automatizacion.md`; modificar `ESTADO.md`, arquitectura MD/HTML e ideas Hampton Bot.

**Interfaces:** consume especificación privada y código origin/main; produce M01–M13, D01–D12, A01–A16, orden y referencias.

- [x] Auditar implementación existente, con pruebas puras cuando aclaran una contradicción.
- [x] Empalmar requisitos a tareas existentes y distinguir construido/publicado/activado.
- [x] Documentar datos, eventos, decisiones humanas, errores, tareas manuales, archivos y aceptación por módulo.
- [x] Aplicar revisión independiente y corregir dependencias, fechas y vínculos de visitas.

## Tarea 2: checklist único

**Files:** modificar `docs/roadmap/checklist-hampton-app.html`.

**Interfaces:** consume módulos y códigos originales; produce tareas con dependencias y aceptación visibles.

- [x] Conservar todos los IDs originales y evidencia; añadir investigaciones secuenciales, franjas, dictado, papelera y validación integral.
- [x] Reconciliar estados y retirar bloqueos globales obsoletos, sin marcar funcionalidad nueva como hecha.
- [x] Comprobar JSON, IDs, referencias, ciclos, sintaxis JS y navegación MCP a1280/390.

## Tarea 3: /avanzar en Codex y Hermes

**Files:** `.agents/skills/avanzar/SKILL.md`, `references/modelo-y-esfuerzo.md`, `docs/roadmap/AVANZAR.md`; copias locales instaladas documentadas en ledger.

**Interfaces:** consume clon alineado/estado/tarea; produce plan por código, evidencias de pruebas, recomendación posterior y entrega por SHA autorizado.

- [x] Añadir precedencia del contrato del clon y continuidad con la reconciliación.
- [x] Mantener DESIGN concreto y skills aplicables en el plan de cada tarea; antislop durante el trabajo.
- [x] Sincronizar solo textos con respaldo y permisos, preservando candados, autenticación y aprobación por SHA.
- [x] Validar skill, igualdad por hash y lectura en ambos Hermes; registrar límites.

## Tarea 4: cierre

**Files:** ledger de esta entrega, ESTADO, relevo privado local.

- [x] Tras las comprobaciones, recomendar modelo/esfuerzo de EST-09 con su alcance y riesgos.
- [ ] Revisar diff y lista exacta de archivos públicos; commit y push autorizados de esta entrega documental.
- [ ] Comprobar SHA remoto y estado de comprobaciones; separar publicación documental de activación funcional. Actualizar relevo y resultado final.

Los pasos de publicación se comprueban después del commit; su SHA y resultado quedan en el relevo privado y en la respuesta de entrega, sin añadir un commit para registrar su propio hash.
