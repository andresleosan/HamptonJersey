# Unreserved planning implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Cambio solicitado explícitamente por Luis; construcción nativa del ajuste, sin editar las otras tareas.

**Goal:** Planificar sin reservar, dejando construcción y publicación bajo sus controles existentes.

**Spec:** [Diseño](../specs/2026-11-08-unreserved-planning-design.md).

1. Añadir y ejecutar pruebas RED de plan sin init/credenciales/HTTP/archivos privados, concurrencia de dos sesiones, dependencias pendientes y rechazo de nuevas reservas plan del servidor.
2. Implementar camino local plan y alias claim-plan en scripts/avanzar-team.mjs; conservar todos los controles de mutaciones build/release. Añadir declaración de recursos revisados en evidencia design sin reservarlos.
3. Rechazar creación y downgrade de reservas plan en coordination/src/state.mjs; preservar el cierre explícito de registros históricos. Adaptar pruebas de red/leases para usar build y usar fixtures históricas solo donde se prueba compatibilidad.
4. Actualizar skill, referencias inicio-guiado/equipo, contrato y AVANZAR. Registrar excepción de esta corrección autorizada frente al procedimiento viejo; no adoptar la reserva PUB-06 de otra sesión.
5. Ejecutar focales, suite npm test, build, check:release y runtime del coordinador. Revisar diff independiente, corregir fallos y guardar commit local. Sin UI nueva, migración o despliegue; publicar solo con autorización correspondiente.

Skills: brainstorming/grill-me conservan la decisión explícita y límites; writing-plans fija este cambio acotado; TDD/systematic-debugging reproducen causa y regresión; security-best-practices/ponytail mantienen mutaciones protegidas y usan catálogo local sin otro servicio. Skills visuales no aplican; no hay interfaz nueva.
