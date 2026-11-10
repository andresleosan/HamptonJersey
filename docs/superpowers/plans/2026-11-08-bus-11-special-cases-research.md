# BUS-11 · Special cases research Implementation Plan

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **I · Investigación**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Investigación de huecos especiales tras directorio aceptado.

**Para ejecutar/completar:** Resolver solo huecos reales con fuentes permitidas y evidencia; no presuponer que todo requiere IA ni repetir trabajo útil. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V01, V02. Dependencias: BUS-23 aceptado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Este plan se ejecuta después como investigación, sin construir una automatización por cliente.

**Goal:** Resolver huecos especiales que sobrevivan al directorio aceptado, con fuentes directas y un resultado trazable.

**Architecture:** Registro de casos con referencias al directorio y contraste de evidencia previa. Proponer altas/correcciones para BUS-23/BUS-19 sin sustituir sus tres investigaciones ni el inventario BUS-06.

**Tech Stack:** Markdown/JSON y consulta de fuentes públicas permitidas; validación de documentos, sin servicios nuevos.

**Spec:** [Diseño común, alcance/orden](../specs/2026-11-08-list2-market-batch-design.md); [directorio](../specs/2026-11-08-bus-21-23-property-directory-gaps-design.md).

## Global Constraints

- BUS-23 debe estar aceptada para ejecutar; no hace falta para redactar este plan. No contactar, crear cuentas, recopilar aplicantes ni consultar canales privados por iniciativa propia.
- Solo casos que el registro demuestre pendientes; no cuotas de fuentes nuevas ni repetición de búsquedas ya resueltas. No mezclar investigación BUS-20 condicionada a su carril.
- Homely excluido; otras restricciones BUS-19 se conservan hasta evidencia revisada. Público no significa permiso automático.
- Conservar ID/alias/procedencia/fecha del hallazgo; ausencia o restricción no equivalen a fuente sin anuncios.
- No hay interfaz ni cambios de runtime: tokens visuales, e2e y Playwright no aplican. Aplican minimización, evidencia no sensible y validación de referencias. Ponytail evita un sistema nuevo; antislop exige hallazgos concretos, sin texto de relleno.

## Review Focus

1. Caso ya cubierto por otra pasada: detectarlo en tarea1, reutilizar evidencia.
2. Alias confundido con fuente nueva: detectar en tareas1 y3.
3. Fecha histórica presentada como comprobación actual: contrastar en tarea2.
4. Empresa/contacto personal confundido con fuente permitida: detener esa rama en tarea2, mantener sus requisitos propios.
5. Cero huecos reales: aceptar resultado sin investigación nueva fabricada en tarea4.

## Tarea 1 · Definir casos con base aceptada

Archivos: crear `docs/roadmap/work/BUS-11/cases.json`, `docs/roadmap/work/BUS-11/scope.md`. Consumir manifiesto BUS-23 y los registros/research originales, no modificarlos.

Interfaz documental: caso `{case_id,source_id?,family,question,existing_refs,gap_reason,priority,status,next_action}`; status `covered | research_needed | manual_pending | not_applicable`.

- [ ] Leer aceptación BUS-23, pendientes consolidados y antecedentes Hampton_Database si están disponibles en el material autorizado. Su existencia no prueba completar las tres pasadas.
- [ ] Identificar exclusivamente preguntas sin resolver: canal concreto ausente, fuente especial o contradicción de cobertura. Cada caso lleva gap_reason y evidencia ya revisada.
- [ ] Colapsar aliases y casos equivalentes por IDs; un canal social genérico no es una empresa nueva. Conservar decisiones previas y no mover sus fechas.
- [ ] Validar JSON, unicidad de case_id y referencias locales; verificar a mano un caso cubierto y uno pendiente. Registrar número real, que puede ser cero.

## Tarea 2 · Contraste dirigido y sin contacto

Archivos: crear `docs/roadmap/work/BUS-11/findings.md`, actualizar cases.json.

Interfaz de evidencia: `{case_id,url,checked_at,method,outcome,evidence_reference,access_limit,conclusion}`; outcome `verified | contradictory | restricted | not_found | historical`.

- [ ] Investigar cada pregunta research_needed en fuentes directas permitidas, usando documentación previa primero y navegación oficial actual cuando haga falta. Anotar intento fallido y su método sin borrar éxitos previos.
- [ ] Separar encontrado, verificado, permitido y operativo; fuente localizada sin revisión BUS-19 sigue pendiente para lectura automática.
- [ ] Mantener casos de acceso restringido como manual_pending. Si exige datos/condiciones BUS-20 u otro carril, registrar dependencia y no ejecutar esa recopilación.
- [ ] Revisar evidencia/conclusión: una búsqueda indexada no acredita lectura de la página, no encontrado no demuestra inexistente y una fecha de informe no es fecha de comprobación directa.

## Tarea 3 · Proponer cambios reutilizables

Archivos: crear `docs/roadmap/work/BUS-11/directory-delta.json`, `docs/roadmap/work/BUS-11/handoff.md`.

Interfaz delta: `{case_id,action:'add'|'correct'|'alias'|'no_change',source_id,previous_reference,proposed_fields,evidence_refs,requires_access_review}`.

- [ ] Relacionar cada hallazgo con un ID existente o propuesta de ID estable. No incrementar el directorio por menciones/aliases repetidos.
- [ ] Producir cambios de directorio para revisión y decisiones de acceso para BUS-19; no activar lectores por modificar JSON.
- [ ] Preservar evidencia histórica, responsable de revisión y aspectos desconocidos. No incorporar contactos privados a estos documentos públicos.
- [ ] Validar que cada delta tiene caso/evidencia y que los IDs existentes siguen presentes. Si se acepta luego una actualización, regenerar derivados con el pipeline existente, en copia autorizada; este plan no autoriza escribir la base original.

## Tarea 4 · Aceptación de investigación

- [ ] Cada caso termina covered/not_applicable o con limitación y próximo paso explícitos. No exigir una fuente nueva si todos los huecos estaban cubiertos.
- [ ] Comprobar sintaxis JSON, enlaces, fechas y coherencia entre casos, hallazgos y delta; revisión independiente de evidencia cuando esté disponible.
- [ ] Registrar fuentes/casos realmente revisados y aceptación pendiente o confirmada; no marcar BUS-06/21/22/23 completadas por este documento.
- [ ] Actualizar BUS-11.json/checklist/ESTADO con resultados reales en la sesión ejecutora. No tests de app/build/e2e para investigación exclusivamente documental; validación documental sí.
